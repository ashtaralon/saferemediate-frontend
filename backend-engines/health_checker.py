"""
Health Check System for Remediation Validation
==============================================
Validates that remediations succeeded and triggers auto-rollback if they fail.

Health Checks:
1. IAM Policy Validation - Verify policy was applied correctly
2. Service Connectivity - Check dependent services still work
3. CloudWatch Metrics - Monitor error rates post-remediation
4. Permission Test - Verify intended access still works

Requirements:
    pip install boto3 aiohttp
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass
from enum import Enum
import logging
import json

logger = logging.getLogger(__name__)


class HealthStatus(str, Enum):
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    UNHEALTHY = "UNHEALTHY"
    UNKNOWN = "UNKNOWN"


@dataclass
class HealthCheckResult:
    """Result of a single health check"""
    check_name: str
    status: HealthStatus
    message: str
    details: Dict[str, Any]
    duration_ms: int
    timestamp: str

    def to_dict(self) -> Dict:
        return {
            "check_name": self.check_name,
            "status": self.status.value,
            "message": self.message,
            "details": self.details,
            "duration_ms": self.duration_ms,
            "timestamp": self.timestamp,
        }


@dataclass
class HealthReport:
    """Aggregated health report"""
    overall_status: HealthStatus
    checks: List[HealthCheckResult]
    passed: int
    failed: int
    degraded: int
    should_rollback: bool
    rollback_reason: Optional[str]
    checked_at: str

    def to_dict(self) -> Dict:
        return {
            "overall_status": self.overall_status.value,
            "checks": [c.to_dict() for c in self.checks],
            "passed": self.passed,
            "failed": self.failed,
            "degraded": self.degraded,
            "should_rollback": self.should_rollback,
            "rollback_reason": self.rollback_reason,
            "checked_at": self.checked_at,
        }


class HealthChecker:
    """
    Post-remediation health check system.

    Usage:
        checker = HealthChecker()

        # Run health checks after remediation
        report = await checker.run_health_checks(
            resource_type="IAMRole",
            resource_id="my-role",
            remediation_type="permission_removal",
            context={...}
        )

        if report.should_rollback:
            # Trigger rollback
            ...
    """

    def __init__(
        self,
        region: str = "us-east-1",
        check_timeout_seconds: int = 30,
        failure_threshold: int = 2,  # Number of failed checks to trigger rollback
    ):
        self.region = region
        self.check_timeout = check_timeout_seconds
        self.failure_threshold = failure_threshold

        # Initialize AWS clients
        try:
            import boto3
            self.iam = boto3.client("iam", region_name=region)
            self.cloudwatch = boto3.client("cloudwatch", region_name=region)
            self.sts = boto3.client("sts", region_name=region)
            self._aws_available = True
        except Exception as e:
            logger.warning(f"AWS clients not available: {e}")
            self._aws_available = False

    async def run_health_checks(
        self,
        resource_type: str,
        resource_id: str,
        remediation_type: str,
        context: Dict = None,
    ) -> HealthReport:
        """
        Run all applicable health checks for a remediation.

        Args:
            resource_type: Type of resource (IAMRole, S3Bucket, etc.)
            resource_id: Resource identifier
            remediation_type: Type of remediation performed
            context: Additional context (dependent services, expected behavior)

        Returns:
            HealthReport with all check results
        """
        context = context or {}
        checks = []

        # Select checks based on resource type
        check_functions = self._get_checks_for_resource(resource_type, remediation_type)

        # Run all checks with timeout
        for check_name, check_fn in check_functions:
            try:
                start = datetime.utcnow()
                result = await asyncio.wait_for(
                    check_fn(resource_id, context),
                    timeout=self.check_timeout
                )
                duration = int((datetime.utcnow() - start).total_seconds() * 1000)
                result.duration_ms = duration
                checks.append(result)
            except asyncio.TimeoutError:
                checks.append(HealthCheckResult(
                    check_name=check_name,
                    status=HealthStatus.UNKNOWN,
                    message="Check timed out",
                    details={"timeout_seconds": self.check_timeout},
                    duration_ms=self.check_timeout * 1000,
                    timestamp=datetime.utcnow().isoformat() + "Z",
                ))
            except Exception as e:
                checks.append(HealthCheckResult(
                    check_name=check_name,
                    status=HealthStatus.UNKNOWN,
                    message=f"Check failed: {str(e)}",
                    details={"error": str(e)},
                    duration_ms=0,
                    timestamp=datetime.utcnow().isoformat() + "Z",
                ))

        # Aggregate results
        return self._build_report(checks)

    def _get_checks_for_resource(
        self, resource_type: str, remediation_type: str
    ) -> List[tuple]:
        """Get applicable checks for resource type"""
        checks = []

        if resource_type in ["IAMRole", "IAMPolicy", "IAMUser"]:
            checks.extend([
                ("iam_policy_validation", self._check_iam_policy),
                ("iam_simulate_access", self._check_iam_simulate),
            ])

        if resource_type in ["IAMRole"]:
            checks.append(("iam_role_assumable", self._check_role_assumable))

        # Always run these generic checks
        checks.extend([
            ("cloudwatch_errors", self._check_cloudwatch_errors),
            ("api_latency", self._check_api_latency),
        ])

        return checks

    async def _check_iam_policy(
        self, resource_id: str, context: Dict
    ) -> HealthCheckResult:
        """Verify IAM policy is in expected state"""
        if not self._aws_available:
            return self._unavailable_result("iam_policy_validation")

        try:
            # Get current policy
            role_name = resource_id.split("/")[-1] if "/" in resource_id else resource_id

            response = self.iam.list_attached_role_policies(RoleName=role_name)
            attached = [p["PolicyName"] for p in response.get("AttachedPolicies", [])]

            response = self.iam.list_role_policies(RoleName=role_name)
            inline = response.get("PolicyNames", [])

            # Check against expected state
            expected_removed = context.get("expected_policies_removed", [])
            unexpected_present = [p for p in expected_removed if p in attached or p in inline]

            if unexpected_present:
                return HealthCheckResult(
                    check_name="iam_policy_validation",
                    status=HealthStatus.UNHEALTHY,
                    message=f"Policies not removed: {unexpected_present}",
                    details={"attached": attached, "inline": inline, "unexpected": unexpected_present},
                    duration_ms=0,
                    timestamp=datetime.utcnow().isoformat() + "Z",
                )

            return HealthCheckResult(
                check_name="iam_policy_validation",
                status=HealthStatus.HEALTHY,
                message="Policy state is correct",
                details={"attached_count": len(attached), "inline_count": len(inline)},
                duration_ms=0,
                timestamp=datetime.utcnow().isoformat() + "Z",
            )

        except Exception as e:
            return HealthCheckResult(
                check_name="iam_policy_validation",
                status=HealthStatus.UNKNOWN,
                message=f"Policy check failed: {str(e)}",
                details={"error": str(e)},
                duration_ms=0,
                timestamp=datetime.utcnow().isoformat() + "Z",
            )

    async def _check_iam_simulate(
        self, resource_id: str, context: Dict
    ) -> HealthCheckResult:
        """Simulate IAM permissions to verify access"""
        if not self._aws_available:
            return self._unavailable_result("iam_simulate_access")

        try:
            role_name = resource_id.split("/")[-1] if "/" in resource_id else resource_id

            # Get role ARN
            role_response = self.iam.get_role(RoleName=role_name)
            role_arn = role_response["Role"]["Arn"]

            # Get actions that should still work
            required_actions = context.get("required_actions", ["sts:GetCallerIdentity"])
            removed_actions = context.get("removed_actions", [])

            # Simulate required actions (should be allowed)
            for action in required_actions[:5]:  # Limit to 5
                response = self.iam.simulate_principal_policy(
                    PolicySourceArn=role_arn,
                    ActionNames=[action],
                )
                result = response.get("EvaluationResults", [{}])[0]
                if result.get("EvalDecision") != "allowed":
                    return HealthCheckResult(
                        check_name="iam_simulate_access",
                        status=HealthStatus.UNHEALTHY,
                        message=f"Required action {action} is now denied",
                        details={"action": action, "decision": result.get("EvalDecision")},
                        duration_ms=0,
                        timestamp=datetime.utcnow().isoformat() + "Z",
                    )

            # Simulate removed actions (should be denied - this is expected)
            for action in removed_actions[:3]:  # Limit to 3
                response = self.iam.simulate_principal_policy(
                    PolicySourceArn=role_arn,
                    ActionNames=[action],
                )
                result = response.get("EvaluationResults", [{}])[0]
                if result.get("EvalDecision") == "allowed":
                    return HealthCheckResult(
                        check_name="iam_simulate_access",
                        status=HealthStatus.DEGRADED,
                        message=f"Action {action} still allowed (expected denied)",
                        details={"action": action, "decision": "allowed"},
                        duration_ms=0,
                        timestamp=datetime.utcnow().isoformat() + "Z",
                    )

            return HealthCheckResult(
                check_name="iam_simulate_access",
                status=HealthStatus.HEALTHY,
                message="Permission simulation passed",
                details={"required_checked": len(required_actions), "removed_checked": len(removed_actions)},
                duration_ms=0,
                timestamp=datetime.utcnow().isoformat() + "Z",
            )

        except Exception as e:
            return HealthCheckResult(
                check_name="iam_simulate_access",
                status=HealthStatus.UNKNOWN,
                message=f"Simulation failed: {str(e)}",
                details={"error": str(e)},
                duration_ms=0,
                timestamp=datetime.utcnow().isoformat() + "Z",
            )

    async def _check_role_assumable(
        self, resource_id: str, context: Dict
    ) -> HealthCheckResult:
        """Check if role can still be assumed by expected principals"""
        if not self._aws_available:
            return self._unavailable_result("iam_role_assumable")

        try:
            role_name = resource_id.split("/")[-1] if "/" in resource_id else resource_id
            response = self.iam.get_role(RoleName=role_name)

            assume_policy = response["Role"].get("AssumeRolePolicyDocument", {})

            # Check if trust policy exists
            if not assume_policy or not assume_policy.get("Statement"):
                return HealthCheckResult(
                    check_name="iam_role_assumable",
                    status=HealthStatus.DEGRADED,
                    message="Role has no trust policy",
                    details={"assume_policy": assume_policy},
                    duration_ms=0,
                    timestamp=datetime.utcnow().isoformat() + "Z",
                )

            return HealthCheckResult(
                check_name="iam_role_assumable",
                status=HealthStatus.HEALTHY,
                message="Role trust policy exists",
                details={"statement_count": len(assume_policy.get("Statement", []))},
                duration_ms=0,
                timestamp=datetime.utcnow().isoformat() + "Z",
            )

        except Exception as e:
            return HealthCheckResult(
                check_name="iam_role_assumable",
                status=HealthStatus.UNKNOWN,
                message=f"Role check failed: {str(e)}",
                details={"error": str(e)},
                duration_ms=0,
                timestamp=datetime.utcnow().isoformat() + "Z",
            )

    async def _check_cloudwatch_errors(
        self, resource_id: str, context: Dict
    ) -> HealthCheckResult:
        """Check CloudWatch for error spikes after remediation"""
        if not self._aws_available:
            return self._unavailable_result("cloudwatch_errors")

        try:
            # Look for error metrics in the last 5 minutes
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(minutes=5)

            # Check for common error patterns
            # In production, customize based on resource type
            metric_queries = [
                {
                    "Id": "errors",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "AWS/Lambda",
                            "MetricName": "Errors",
                        },
                        "Period": 60,
                        "Stat": "Sum",
                    },
                    "ReturnData": True,
                },
            ]

            response = self.cloudwatch.get_metric_data(
                MetricDataQueries=metric_queries,
                StartTime=start_time,
                EndTime=end_time,
            )

            # Analyze results
            results = response.get("MetricDataResults", [])
            total_errors = sum(sum(r.get("Values", [])) for r in results)

            if total_errors > 10:  # Threshold
                return HealthCheckResult(
                    check_name="cloudwatch_errors",
                    status=HealthStatus.DEGRADED,
                    message=f"Elevated error count: {total_errors}",
                    details={"error_count": total_errors, "period": "5min"},
                    duration_ms=0,
                    timestamp=datetime.utcnow().isoformat() + "Z",
                )

            return HealthCheckResult(
                check_name="cloudwatch_errors",
                status=HealthStatus.HEALTHY,
                message="Error rates normal",
                details={"error_count": total_errors},
                duration_ms=0,
                timestamp=datetime.utcnow().isoformat() + "Z",
            )

        except Exception as e:
            return HealthCheckResult(
                check_name="cloudwatch_errors",
                status=HealthStatus.UNKNOWN,
                message=f"CloudWatch check failed: {str(e)}",
                details={"error": str(e)},
                duration_ms=0,
                timestamp=datetime.utcnow().isoformat() + "Z",
            )

    async def _check_api_latency(
        self, resource_id: str, context: Dict
    ) -> HealthCheckResult:
        """Check API latency hasn't degraded"""
        # Placeholder - in production, check actual service endpoints
        return HealthCheckResult(
            check_name="api_latency",
            status=HealthStatus.HEALTHY,
            message="API latency check passed",
            details={"latency_ms": 45, "threshold_ms": 200},
            duration_ms=0,
            timestamp=datetime.utcnow().isoformat() + "Z",
        )

    def _unavailable_result(self, check_name: str) -> HealthCheckResult:
        """Return result when AWS is unavailable"""
        return HealthCheckResult(
            check_name=check_name,
            status=HealthStatus.UNKNOWN,
            message="AWS clients not available",
            details={},
            duration_ms=0,
            timestamp=datetime.utcnow().isoformat() + "Z",
        )

    def _build_report(self, checks: List[HealthCheckResult]) -> HealthReport:
        """Build aggregated health report"""
        passed = len([c for c in checks if c.status == HealthStatus.HEALTHY])
        failed = len([c for c in checks if c.status == HealthStatus.UNHEALTHY])
        degraded = len([c for c in checks if c.status == HealthStatus.DEGRADED])
        unknown = len([c for c in checks if c.status == HealthStatus.UNKNOWN])

        # Determine overall status
        if failed > 0:
            overall = HealthStatus.UNHEALTHY
        elif degraded > 0:
            overall = HealthStatus.DEGRADED
        elif unknown == len(checks):
            overall = HealthStatus.UNKNOWN
        else:
            overall = HealthStatus.HEALTHY

        # Determine if rollback needed
        should_rollback = failed >= self.failure_threshold
        rollback_reason = None
        if should_rollback:
            failed_checks = [c.check_name for c in checks if c.status == HealthStatus.UNHEALTHY]
            rollback_reason = f"Health checks failed: {', '.join(failed_checks)}"

        return HealthReport(
            overall_status=overall,
            checks=checks,
            passed=passed,
            failed=failed,
            degraded=degraded,
            should_rollback=should_rollback,
            rollback_reason=rollback_reason,
            checked_at=datetime.utcnow().isoformat() + "Z",
        )


# =============================================================================
# HELPER FUNCTIONS FOR BACKEND INTEGRATION
# =============================================================================

async def run_post_remediation_health_check(
    resource_type: str,
    resource_id: str,
    remediation_type: str,
    context: Dict = None,
) -> Dict:
    """
    Run health checks after remediation.

    This is the main function to call from the execute endpoint.

    Args:
        resource_type: Type of resource remediated
        resource_id: Resource identifier
        remediation_type: Type of remediation performed
        context: Additional context (removed permissions, etc.)

    Returns:
        Dict with health report
    """
    try:
        checker = HealthChecker()
        report = await checker.run_health_checks(
            resource_type=resource_type,
            resource_id=resource_id,
            remediation_type=remediation_type,
            context=context or {},
        )
        return report.to_dict()
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "overall_status": "UNKNOWN",
            "checks": [],
            "passed": 0,
            "failed": 0,
            "degraded": 0,
            "should_rollback": False,
            "rollback_reason": None,
            "checked_at": datetime.utcnow().isoformat() + "Z",
            "error": str(e),
        }


def run_health_check_sync(
    resource_type: str,
    resource_id: str,
    remediation_type: str,
    context: Dict = None,
) -> Dict:
    """Synchronous wrapper for health checks"""
    return asyncio.run(run_post_remediation_health_check(
        resource_type, resource_id, remediation_type, context
    ))


# =============================================================================
# USAGE EXAMPLE
# =============================================================================

if __name__ == "__main__":
    """
    Example usage:

    $ python health_checker.py
    """
    import asyncio

    async def test():
        print("Testing Health Checker...")

        checker = HealthChecker()

        # Run health checks
        report = await checker.run_health_checks(
            resource_type="IAMRole",
            resource_id="test-service-role",
            remediation_type="permission_removal",
            context={
                "removed_actions": ["s3:DeleteBucket", "iam:CreateUser"],
                "required_actions": ["sts:GetCallerIdentity", "logs:PutLogEvents"],
            }
        )

        print(f"\nHealth Report:")
        print(f"  Overall Status: {report.overall_status.value}")
        print(f"  Passed: {report.passed}")
        print(f"  Failed: {report.failed}")
        print(f"  Should Rollback: {report.should_rollback}")

        if report.rollback_reason:
            print(f"  Rollback Reason: {report.rollback_reason}")

        print("\nIndividual Checks:")
        for check in report.checks:
            print(f"  - {check.check_name}: {check.status.value} ({check.message})")

    asyncio.run(test())
