"""
CloudTrail Usage Data Collector
===============================
Collects real usage metrics from AWS CloudTrail and IAM Access Advisor.

This module provides the actual data needed for the decision engine's
usage score (25% of confidence calculation).

Requirements:
    pip install boto3

AWS Permissions Required:
    - cloudtrail:LookupEvents
    - iam:GenerateServiceLastAccessedDetails
    - iam:GetServiceLastAccessedDetails
    - iam:ListRoles
    - iam:GetRole
"""

import boto3
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


@dataclass
class UsageMetrics:
    """Usage metrics for a single IAM role/resource"""
    days_since_last_use: int
    usage_count_90d: int
    observation_days: int
    sources_available: int  # Number of data sources (CloudTrail, AccessAdvisor, etc.)
    last_used_by: Optional[str]
    usage_pattern: str  # "NONE", "LOW", "MEDIUM", "HIGH"

    # Additional detail fields
    actions_used: List[str]
    actions_unused: List[str]
    services_accessed: List[str]
    last_activity_timestamp: Optional[str]

    def to_dict(self) -> Dict:
        return {
            "days_since_last_use": self.days_since_last_use,
            "usage_count_90d": self.usage_count_90d,
            "observation_days": self.observation_days,
            "sources_available": self.sources_available,
            "last_used_by": self.last_used_by,
            "usage_pattern": self.usage_pattern,
            "actions_used": self.actions_used,
            "actions_unused": self.actions_unused,
            "services_accessed": self.services_accessed,
            "last_activity_timestamp": self.last_activity_timestamp,
        }


class CloudTrailUsageCollector:
    """
    Collects IAM usage data from AWS CloudTrail and Access Advisor.

    Data Sources:
    1. CloudTrail - API call events for the role
    2. IAM Access Advisor - Service-level last accessed info
    3. (Future) VPC Flow Logs - Network activity correlation
    """

    def __init__(
        self,
        region: str = "us-east-1",
        lookback_days: int = 90,
        aws_access_key_id: Optional[str] = None,
        aws_secret_access_key: Optional[str] = None,
        aws_session_token: Optional[str] = None,
    ):
        self.region = region
        self.lookback_days = lookback_days

        # Initialize AWS clients
        session_kwargs = {}
        if aws_access_key_id and aws_secret_access_key:
            session_kwargs = {
                "aws_access_key_id": aws_access_key_id,
                "aws_secret_access_key": aws_secret_access_key,
            }
            if aws_session_token:
                session_kwargs["aws_session_token"] = aws_session_token

        self.session = boto3.Session(region_name=region, **session_kwargs)
        self.cloudtrail = self.session.client("cloudtrail")
        self.iam = self.session.client("iam")

        # Track data sources available
        self._sources_available = 0

    def get_usage_metrics(self, role_name: str) -> UsageMetrics:
        """
        Get comprehensive usage metrics for an IAM role.

        Args:
            role_name: Name of the IAM role (not ARN)

        Returns:
            UsageMetrics with all usage data populated
        """
        logger.info(f"Collecting usage metrics for role: {role_name}")

        # Collect from all available sources
        cloudtrail_data = self._get_cloudtrail_events(role_name)
        access_advisor_data = self._get_access_advisor_data(role_name)

        # Merge data from all sources
        return self._build_usage_metrics(role_name, cloudtrail_data, access_advisor_data)

    def _get_cloudtrail_events(self, role_name: str) -> Dict[str, Any]:
        """
        Query CloudTrail for API events made by this role.

        Returns dict with:
            - event_count: Total events in lookback period
            - last_event_time: Timestamp of most recent event
            - unique_actions: List of unique API actions called
            - unique_principals: List of users/services that assumed this role
        """
        try:
            start_time = datetime.utcnow() - timedelta(days=self.lookback_days)
            end_time = datetime.utcnow()

            events = []
            paginator = self.cloudtrail.get_paginator("lookup_events")

            # Search for events where this role was used
            # We look for AssumeRole events AND events made by the role
            lookup_attributes = [
                {"AttributeKey": "Username", "AttributeValue": role_name},
            ]

            for page in paginator.paginate(
                LookupAttributes=lookup_attributes,
                StartTime=start_time,
                EndTime=end_time,
                MaxResults=1000,
            ):
                events.extend(page.get("Events", []))

            # Also search by role ARN pattern
            # Note: This requires knowing the account ID
            try:
                role_info = self.iam.get_role(RoleName=role_name)
                role_arn = role_info["Role"]["Arn"]

                for page in paginator.paginate(
                    LookupAttributes=[
                        {"AttributeKey": "ResourceName", "AttributeValue": role_arn}
                    ],
                    StartTime=start_time,
                    EndTime=end_time,
                    MaxResults=1000,
                ):
                    events.extend(page.get("Events", []))
            except Exception as e:
                logger.warning(f"Could not query by role ARN: {e}")

            # Deduplicate events by EventId
            unique_events = {e["EventId"]: e for e in events}
            events = list(unique_events.values())

            # Analyze events
            actions = set()
            principals = set()
            last_event_time = None

            for event in events:
                actions.add(event.get("EventName", "Unknown"))

                # Extract principal from CloudTrailEvent JSON
                if "CloudTrailEvent" in event:
                    import json
                    try:
                        ct_event = json.loads(event["CloudTrailEvent"])
                        user_identity = ct_event.get("userIdentity", {})
                        principal = user_identity.get("principalId", user_identity.get("userName", "Unknown"))
                        principals.add(principal)
                    except:
                        pass

                event_time = event.get("EventTime")
                if event_time and (last_event_time is None or event_time > last_event_time):
                    last_event_time = event_time

            self._sources_available += 1  # CloudTrail available

            return {
                "event_count": len(events),
                "last_event_time": last_event_time.isoformat() if last_event_time else None,
                "unique_actions": list(actions),
                "unique_principals": list(principals),
                "available": True,
            }

        except Exception as e:
            logger.error(f"CloudTrail query failed: {e}")
            return {
                "event_count": 0,
                "last_event_time": None,
                "unique_actions": [],
                "unique_principals": [],
                "available": False,
                "error": str(e),
            }

    def _get_access_advisor_data(self, role_name: str) -> Dict[str, Any]:
        """
        Get IAM Access Advisor data for service-level last accessed info.

        Access Advisor tracks which AWS services the role has accessed and when.
        """
        try:
            # Generate service last accessed report
            response = self.iam.generate_service_last_accessed_details(
                Arn=f"arn:aws:iam::*:role/{role_name}",  # Will be resolved by AWS
            )
            job_id = response["JobId"]

            # Wait for job completion (with timeout)
            import time
            max_attempts = 10
            for _ in range(max_attempts):
                status_response = self.iam.get_service_last_accessed_details(JobId=job_id)
                if status_response["JobStatus"] == "COMPLETED":
                    break
                elif status_response["JobStatus"] == "FAILED":
                    raise Exception("Access Advisor job failed")
                time.sleep(1)

            services_accessed = []
            services_not_accessed = []
            last_accessed_time = None

            for service in status_response.get("ServicesLastAccessed", []):
                service_name = service.get("ServiceName", "Unknown")
                last_auth = service.get("LastAuthenticated")

                if last_auth:
                    services_accessed.append({
                        "service": service_name,
                        "last_accessed": last_auth.isoformat(),
                    })
                    if last_accessed_time is None or last_auth > last_accessed_time:
                        last_accessed_time = last_auth
                else:
                    services_not_accessed.append(service_name)

            self._sources_available += 1  # Access Advisor available

            return {
                "services_accessed": services_accessed,
                "services_not_accessed": services_not_accessed,
                "last_accessed_time": last_accessed_time.isoformat() if last_accessed_time else None,
                "total_services_granted": len(services_accessed) + len(services_not_accessed),
                "available": True,
            }

        except Exception as e:
            logger.error(f"Access Advisor query failed: {e}")
            return {
                "services_accessed": [],
                "services_not_accessed": [],
                "last_accessed_time": None,
                "total_services_granted": 0,
                "available": False,
                "error": str(e),
            }

    def _build_usage_metrics(
        self,
        role_name: str,
        cloudtrail_data: Dict,
        access_advisor_data: Dict,
    ) -> UsageMetrics:
        """
        Combine data from all sources into UsageMetrics.
        """
        # Calculate days since last use
        last_activity = None

        if cloudtrail_data.get("last_event_time"):
            last_activity = datetime.fromisoformat(cloudtrail_data["last_event_time"].replace("Z", ""))

        if access_advisor_data.get("last_accessed_time"):
            aa_time = datetime.fromisoformat(access_advisor_data["last_accessed_time"].replace("Z", ""))
            if last_activity is None or aa_time > last_activity:
                last_activity = aa_time

        if last_activity:
            days_since_last_use = (datetime.utcnow() - last_activity).days
        else:
            days_since_last_use = self.lookback_days + 1  # Never used

        # Get usage count from CloudTrail
        usage_count_90d = cloudtrail_data.get("event_count", 0)

        # Determine usage pattern
        usage_pattern = self._classify_usage_pattern(usage_count_90d, days_since_last_use)

        # Get last user
        principals = cloudtrail_data.get("unique_principals", [])
        last_used_by = principals[0] if principals else None

        # Get services accessed
        services = [s["service"] for s in access_advisor_data.get("services_accessed", [])]

        return UsageMetrics(
            days_since_last_use=days_since_last_use,
            usage_count_90d=usage_count_90d,
            observation_days=self.lookback_days,
            sources_available=self._sources_available,
            last_used_by=last_used_by,
            usage_pattern=usage_pattern,
            actions_used=cloudtrail_data.get("unique_actions", []),
            actions_unused=[],  # Would need policy analysis to determine
            services_accessed=services,
            last_activity_timestamp=last_activity.isoformat() if last_activity else None,
        )

    def _classify_usage_pattern(self, event_count: int, days_since_use: int) -> str:
        """
        Classify usage into NONE, LOW, MEDIUM, HIGH based on activity.

        Thresholds:
            - NONE: No activity in observation period
            - LOW: < 10 events or > 30 days since last use
            - MEDIUM: 10-100 events and < 30 days
            - HIGH: > 100 events and < 7 days
        """
        if event_count == 0 or days_since_use > self.lookback_days:
            return "NONE"

        if event_count < 10 or days_since_use > 30:
            return "LOW"

        if event_count > 100 and days_since_use < 7:
            return "HIGH"

        return "MEDIUM"


# =============================================================================
# HELPER FUNCTIONS FOR BACKEND INTEGRATION
# =============================================================================

def get_usage_data_for_finding(finding: Dict, region: str = "us-east-1") -> Dict:
    """
    Get usage data for a security finding.

    This is the main function to call from the simulate endpoint.

    Args:
        finding: Security finding dict with role_name or resource_id
        region: AWS region

    Returns:
        Dict with usage metrics ready for decision engine
    """
    role_name = finding.get("role_name") or finding.get("resource_id", "").split("/")[-1]

    if not role_name:
        logger.warning("No role name found in finding, returning default metrics")
        return _get_default_usage_metrics()

    try:
        collector = CloudTrailUsageCollector(region=region)
        metrics = collector.get_usage_metrics(role_name)
        return metrics.to_dict()
    except Exception as e:
        logger.error(f"Failed to collect usage data: {e}")
        return _get_default_usage_metrics()


def _get_default_usage_metrics() -> Dict:
    """Return conservative default metrics when data collection fails."""
    return {
        "days_since_last_use": 0,  # Assume recently used (conservative)
        "usage_count_90d": 100,    # Assume moderate usage
        "observation_days": 0,     # No observation
        "sources_available": 0,    # No sources
        "last_used_by": None,
        "usage_pattern": "MEDIUM", # Conservative assumption
        "actions_used": [],
        "actions_unused": [],
        "services_accessed": [],
        "last_activity_timestamp": None,
    }


# =============================================================================
# USAGE EXAMPLE
# =============================================================================

if __name__ == "__main__":
    """
    Example usage:

    $ python cloudtrail_usage_collector.py

    Note: Requires AWS credentials configured via:
    - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    - AWS credentials file (~/.aws/credentials)
    - IAM role (if running on EC2/Lambda)
    """
    import json

    # Example finding
    test_finding = {
        "finding_id": "test-123",
        "role_name": "example-service-role",
        "type": "iam_unused_permissions",
    }

    print("Collecting usage data for finding...")
    usage_data = get_usage_data_for_finding(test_finding)
    print(json.dumps(usage_data, indent=2, default=str))
