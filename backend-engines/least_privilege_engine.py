"""
SafeRemediate - Least Privilege Engine
========================================

Data-Driven Least Privilege Enforcement Engine

Core Philosophy:
- Least Privilege is not a static policy exercise
- It is a continuous, data-driven enforcement process
- Permissions are justified by evidence, not assumptions
- Access is reduced only when safety can be proven
- Every permission change is reversible
- Least Privilege is enforced at the system level, not per resource

This engine implements:
1. System-aware permission analysis
2. Evidence-based classification
3. Confidence scoring for safe removal
4. Simulation integration
5. Snapshot management
6. Continuous drift detection
"""

from dataclasses import dataclass
from typing import Dict, List, Any, Optional, Set
from enum import Enum
from datetime import datetime, timedelta
import hashlib
import json


# ============================================================================
# ENUMS & CONSTANTS
# ============================================================================

class PermissionStatus(str, Enum):
    """Permission classification categories"""
    ACTIVE_REQUIRED = "ACTIVE_REQUIRED"         # Keep - actively used
    ACTIVE_ANOMALOUS = "ACTIVE_ANOMALOUS"       # Investigate - unusual pattern
    INACTIVE_NEEDED = "INACTIVE_NEEDED"         # Caution - not used but may be needed
    INACTIVE_SAFE = "INACTIVE_SAFE"             # Remove - safe to remove


class RiskLevel(str, Enum):
    """Permission risk levels"""
    CRITICAL = "CRITICAL"   # PassRole, Admin, Delete operations
    HIGH = "HIGH"           # Write operations, data access
    MEDIUM = "MEDIUM"       # Read operations, metadata
    LOW = "LOW"             # Describe, List operations


class ConfidenceLevel(str, Enum):
    """Confidence in decision"""
    HIGH = "HIGH"       # >= 90%
    MEDIUM = "MEDIUM"   # >= 70%
    LOW = "LOW"         # < 70%


class EnforcementAction(str, Enum):
    """Recommended enforcement actions"""
    AUTO_APPLY = "AUTO_APPLY"               # High confidence, auto-safe
    CANARY = "CANARY"                       # Medium-high confidence, test first
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED" # Medium confidence, needs approval
    MANUAL_ONLY = "MANUAL_ONLY"            # Low confidence, manual review
    BLOCKED = "BLOCKED"                     # Cannot safely enforce


# High-risk permission patterns
HIGH_RISK_PATTERNS = [
    "iam:PassRole",
    "iam:CreateRole",
    "iam:PutRolePolicy",
    "iam:AttachRolePolicy",
    "*:Delete*",
    "*:Terminate*",
    "s3:DeleteBucket",
    "rds:DeleteDBInstance",
    "ec2:TerminateInstances",
    "lambda:DeleteFunction",
    "dynamodb:DeleteTable",
    "Admin",
    "Full",
    "*:*",
]


# Confidence scoring weights
CONFIDENCE_WEIGHTS = {
    "usage_evidence": 0.35,      # Evidence of non-usage (most important)
    "time_coverage": 0.25,       # Observation period quality
    "source_completeness": 0.20, # Data source coverage
    "system_context": 0.10,      # System understanding
    "simulation": 0.10,          # Simulation results (if available)
}


# Decision thresholds
THRESHOLD_AUTO_APPLY = 0.90
THRESHOLD_CANARY = 0.75
THRESHOLD_APPROVAL = 0.60


# ============================================================================
# DATA MODELS
# ============================================================================

@dataclass
class Permission:
    """Individual permission with evidence and classification"""
    action: str
    resource: str
    status: str  # PermissionStatus
    
    # Evidence
    last_used: Optional[str] = None
    usage_count_90d: int = 0
    first_seen: Optional[str] = None
    
    # Risk
    risk_level: str = "MEDIUM"
    risk_reasons: List[str] = None
    
    # Dependencies
    required_by_services: List[str] = None
    used_in_critical_path: bool = False
    
    # Confidence
    classification_confidence: float = 0.0
    
    def __post_init__(self):
        if self.risk_reasons is None:
            self.risk_reasons = []
        if self.required_by_services is None:
            self.required_by_services = []


@dataclass
class EvidenceSource:
    """Data source for usage evidence"""
    type: str  # CloudTrail, AccessAdvisor, etc.
    enabled: bool
    coverage_regions: List[str]
    coverage_complete: bool
    coverage_percent: float
    last_sync: str
    observation_days: int
    record_count: int


@dataclass
class SystemContext:
    """System-level context for permission analysis"""
    system_name: str
    system_id: str
    tier: str  # PRODUCTION, STAGING, etc.
    revenue_generating: bool
    compliance_frameworks: List[str]
    
    # Relationships
    identities: List[str]
    resources: List[str]
    services: List[str]
    depends_on: List[str]
    depended_by: List[str]


@dataclass
class ConfidenceScore:
    """Confidence scoring breakdown"""
    overall: float  # 0-1
    
    # Components
    usage_evidence: float
    time_coverage: float
    source_completeness: float
    system_context: float
    simulation: float
    
    # Decision
    recommended_action: str  # EnforcementAction
    
    # Explanation
    factors: List[str]
    warnings: List[str]


# ============================================================================
# LEAST PRIVILEGE ENGINE
# ============================================================================

class LeastPrivilegeEngine:
    """
    Core engine for data-driven Least Privilege enforcement.
    
    This engine evaluates permissions across identities and systems,
    classifies them based on evidence, and provides confident recommendations
    for safe permission removal.
    """
    
    def __init__(self):
        self.evidence_sources: List[EvidenceSource] = []
    
    
    # ========================================================================
    # PERMISSION CLASSIFICATION
    # ========================================================================
    
    def classify_permission(
        self,
        permission: str,
        resource: str,
        usage_data: Dict[str, Any],
        system_context: Optional[SystemContext] = None
    ) -> Permission:
        """
        Classify a single permission based on evidence.
        
        Args:
            permission: AWS action (e.g., "s3:GetObject")
            resource: Resource ARN or wildcard
            usage_data: Usage evidence from data sources
            system_context: System-level context
            
        Returns:
            Permission object with classification and confidence
        """
        # Extract usage metrics
        last_used = usage_data.get("last_used")
        usage_count = usage_data.get("usage_count_90d", 0)
        first_seen = usage_data.get("first_seen")
        observation_days = usage_data.get("observation_days", 0)
        
        # Assess risk level
        risk_level, risk_reasons = self._assess_risk(permission, resource)
        
        # Classify based on usage
        status = self._classify_by_usage(
            last_used,
            usage_count,
            observation_days,
            risk_level
        )
        
        # Check dependencies
        required_by = usage_data.get("required_by_services", [])
        critical_path = usage_data.get("used_in_critical_path", False)
        
        # Calculate classification confidence
        confidence = self._classification_confidence(
            observation_days,
            usage_data.get("sources_count", 1),
            bool(last_used),
            usage_count > 0
        )
        
        return Permission(
            action=permission,
            resource=resource,
            status=status,
            last_used=last_used,
            usage_count_90d=usage_count,
            first_seen=first_seen,
            risk_level=risk_level,
            risk_reasons=risk_reasons,
            required_by_services=required_by,
            used_in_critical_path=critical_path,
            classification_confidence=confidence
        )
    
    
    def _assess_risk(self, permission: str, resource: str) -> tuple:
        """
        Assess risk level of a permission.
        
        Returns:
            (risk_level, risk_reasons)
        """
        reasons = []
        
        # Check against high-risk patterns
        for pattern in HIGH_RISK_PATTERNS:
            if self._matches_pattern(permission, pattern):
                reasons.append(f"Matches high-risk pattern: {pattern}")
        
        # Wildcard resource
        if resource == "*":
            reasons.append("Wildcard resource - full account access")
        
        # Determine level
        if any("PassRole" in r or "Admin" in r or "*:*" in r for r in reasons):
            level = RiskLevel.CRITICAL
        elif any("Delete" in r or "Terminate" in r for r in reasons):
            level = RiskLevel.HIGH
        elif permission.endswith(":Put*") or permission.endswith(":Create*"):
            level = RiskLevel.MEDIUM
        else:
            level = RiskLevel.LOW
        
        return level.value, reasons
    
    
    def _matches_pattern(self, permission: str, pattern: str) -> bool:
        """Check if permission matches a risk pattern"""
        if "*" in pattern:
            # Simple wildcard matching
            pattern_parts = pattern.split("*")
            if all(part in permission for part in pattern_parts if part):
                return True
        else:
            if pattern in permission:
                return True
        return False
    
    
    def _classify_by_usage(
        self,
        last_used: Optional[str],
        usage_count: int,
        observation_days: int,
        risk_level: str
    ) -> str:
        """
        Classify permission status based on usage patterns.
        
        Returns:
            PermissionStatus value
        """
        # Never used
        if not last_used and usage_count == 0:
            if observation_days >= 90:
                return PermissionStatus.INACTIVE_SAFE.value
            else:
                return PermissionStatus.INACTIVE_NEEDED.value
        
        # Recently used
        if last_used:
            try:
                last_used_date = datetime.fromisoformat(last_used.replace('Z', '+00:00'))
                days_ago = (datetime.now(last_used_date.tzinfo) - last_used_date).days
                
                if days_ago <= 7:
                    # Very recent usage
                    return PermissionStatus.ACTIVE_REQUIRED.value
                elif days_ago <= 30:
                    # Recent usage, but check frequency
                    if usage_count < 5:
                        return PermissionStatus.ACTIVE_ANOMALOUS.value
                    else:
                        return PermissionStatus.ACTIVE_REQUIRED.value
                elif days_ago <= 90:
                    # Used within 90 days but not recently
                    return PermissionStatus.INACTIVE_NEEDED.value
                else:
                    # Old usage
                    if risk_level == RiskLevel.CRITICAL.value:
                        return PermissionStatus.INACTIVE_NEEDED.value
                    else:
                        return PermissionStatus.INACTIVE_SAFE.value
            except (ValueError, AttributeError, TypeError) as e:
                # Handle date parsing errors gracefully
                pass
        
        # Default to caution
        return PermissionStatus.INACTIVE_NEEDED.value
    
    
    def _classification_confidence(
        self,
        observation_days: int,
        sources_count: int,
        has_last_used: bool,
        has_usage: bool
    ) -> float:
        """
        Calculate confidence in permission classification.
        
        Returns:
            0-1 confidence score
        """
        # Time coverage: more days = higher confidence
        time_factor = min(1.0, observation_days / 90.0)
        
        # Source coverage: more sources = higher confidence
        source_factor = min(1.0, sources_count / 3.0)
        
        # Data quality: clear signal = higher confidence
        if not has_usage and observation_days >= 90:
            # Strong signal: definitely unused
            quality_factor = 0.95
        elif has_last_used:
            # Strong signal: definitely used
            quality_factor = 0.90
        else:
            # Weak signal
            quality_factor = 0.60
        
        confidence = (
            time_factor * 0.4 +
            source_factor * 0.3 +
            quality_factor * 0.3
        )
        
        return min(1.0, max(0.0, confidence))
    
    
    # ========================================================================
    # SYSTEM-AWARE ANALYSIS
    # ========================================================================
    
    def analyze_identity(
        self,
        identity_id: str,
        identity_type: str,
        permissions: List[Dict[str, Any]],
        usage_data: Dict[str, Any],
        system_context: Optional[SystemContext] = None
    ) -> Dict[str, Any]:
        """
        Perform system-aware analysis of an identity's permissions.
        
        Args:
            identity_id: Identity ARN or ID
            identity_type: IAMRole, IAMUser, etc.
            permissions: List of permission dicts
            usage_data: Aggregated usage evidence
            system_context: System context
            
        Returns:
            Analysis results with classifications and recommendations
        """
        classified_permissions = []
        
        # Classify each permission
        for perm_data in permissions:
            action = perm_data.get("action")
            resource = perm_data.get("resource", "*")
            perm_usage = usage_data.get(action, {})
            
            perm = self.classify_permission(
                action,
                resource,
                perm_usage,
                system_context
            )
            classified_permissions.append(perm)
        
        # Aggregate by status
        status_counts = {
            PermissionStatus.ACTIVE_REQUIRED.value: 0,
            PermissionStatus.ACTIVE_ANOMALOUS.value: 0,
            PermissionStatus.INACTIVE_NEEDED.value: 0,
            PermissionStatus.INACTIVE_SAFE.value: 0,
        }
        
        for perm in classified_permissions:
            status_counts[perm.status] += 1
        
        # Generate recommendations
        recommendations = self._generate_recommendations(
            identity_id,
            identity_type,
            classified_permissions,
            system_context
        )
        
        # Calculate overall LP score (0-100, higher = better)
        lp_score = self._calculate_lp_score(classified_permissions)
        
        return {
            "identity_id": identity_id,
            "identity_type": identity_type,
            "total_permissions": len(classified_permissions),
            "lp_score": lp_score,
            "status_counts": status_counts,
            "permissions": [self._perm_to_dict(p) for p in classified_permissions],
            "recommendations": recommendations,
            "system_context": self._system_context_to_dict(system_context) if system_context else None
        }
    
    
    def _calculate_lp_score(self, permissions: List[Permission]) -> float:
        """
        Calculate Least Privilege score (0-100).
        Higher = better adherence to least privilege.
        
        Score = (Active + Safely Inactive) / Total * 100
        """
        if not permissions:
            return 100.0
        
        active_required = sum(1 for p in permissions if p.status == PermissionStatus.ACTIVE_REQUIRED.value)
        inactive_safe = sum(1 for p in permissions if p.status == PermissionStatus.INACTIVE_SAFE.value)
        
        # Perfect score if all permissions are either actively required or safely inactive
        # Low score if many permissions are anomalous or potentially needed
        score = (active_required / len(permissions)) * 100.0
        
        # Penalty for inactive permissions that are NOT safe to remove
        inactive_needed = sum(1 for p in permissions if p.status == PermissionStatus.INACTIVE_NEEDED.value)
        anomalous = sum(1 for p in permissions if p.status == PermissionStatus.ACTIVE_ANOMALOUS.value)
        
        penalty = ((inactive_needed + anomalous) / len(permissions)) * 20.0
        
        return max(0.0, min(100.0, score - penalty))
    
    
    def _generate_recommendations(
        self,
        identity_id: str,
        identity_type: str,
        permissions: List[Permission],
        system_context: Optional[SystemContext]
    ) -> List[Dict[str, Any]]:
        """
        Generate actionable recommendations for permission reduction.
        """
        recommendations = []
        
        # Find safely removable permissions
        safe_to_remove = [p for p in permissions if p.status == PermissionStatus.INACTIVE_SAFE.value]
        
        if safe_to_remove:
            # Group by risk level
            critical_unused = [p for p in safe_to_remove if p.risk_level == RiskLevel.CRITICAL.value]
            high_unused = [p for p in safe_to_remove if p.risk_level == RiskLevel.HIGH.value]
            other_unused = [p for p in safe_to_remove if p.risk_level not in [RiskLevel.CRITICAL.value, RiskLevel.HIGH.value]]
            
            # Recommendation for critical/high risk removals
            if critical_unused or high_unused:
                recommendations.append({
                    "id": f"{identity_id}-remove-high-risk",
                    "type": "REMOVE",
                    "priority": "HIGH",
                    "permissions_to_remove": [p.action for p in critical_unused + high_unused],
                    "impact": f"Removes {len(critical_unused + high_unused)} high-risk unused permissions",
                    "confidence": self._avg_confidence(critical_unused + high_unused),
                    "recommended_action": self._determine_action(
                        self._avg_confidence(critical_unused + high_unused),
                        system_context
                    )
                })
            
            # Recommendation for all removals
            if len(safe_to_remove) >= 5:
                recommendations.append({
                    "id": f"{identity_id}-remove-all-unused",
                    "type": "REMOVE",
                    "priority": "MEDIUM",
                    "permissions_to_remove": [p.action for p in safe_to_remove],
                    "impact": f"Removes {len(safe_to_remove)} unused permissions, reduces attack surface by {(len(safe_to_remove)/len(permissions)*100):.0f}%",
                    "confidence": self._avg_confidence(safe_to_remove),
                    "recommended_action": self._determine_action(
                        self._avg_confidence(safe_to_remove),
                        system_context
                    )
                })
        
        # Check for anomalous usage
        anomalous = [p for p in permissions if p.status == PermissionStatus.ACTIVE_ANOMALOUS.value]
        if anomalous:
            recommendations.append({
                "id": f"{identity_id}-investigate-anomalous",
                "type": "INVESTIGATE",
                "priority": "MEDIUM",
                "permissions": [p.action for p in anomalous],
                "impact": f"{len(anomalous)} permissions have unusual usage patterns",
                "confidence": 0.5,
                "recommended_action": EnforcementAction.MANUAL_ONLY.value
            })
        
        return recommendations
    
    
    def _avg_confidence(self, permissions: List[Permission]) -> float:
        """Calculate average confidence across permissions"""
        if not permissions:
            return 0.0
        return sum(p.classification_confidence for p in permissions) / len(permissions)
    
    
    def _determine_action(
        self,
        confidence: float,
        system_context: Optional[SystemContext]
    ) -> str:
        """
        Determine recommended enforcement action based on confidence and context.
        """
        # Apply system context adjustments
        adjusted_confidence = confidence
        
        if system_context:
            # Production systems: reduce confidence
            if system_context.tier == "PRODUCTION":
                adjusted_confidence *= 0.85
            
            # Revenue-generating: more caution
            if system_context.revenue_generating:
                adjusted_confidence *= 0.90
            
            # Compliance frameworks: more caution
            if len(system_context.compliance_frameworks) > 0:
                adjusted_confidence *= 0.95
        
        # Decision thresholds
        if adjusted_confidence >= THRESHOLD_AUTO_APPLY:
            return EnforcementAction.AUTO_APPLY.value
        elif adjusted_confidence >= THRESHOLD_CANARY:
            return EnforcementAction.CANARY.value
        elif adjusted_confidence >= THRESHOLD_APPROVAL:
            return EnforcementAction.APPROVAL_REQUIRED.value
        else:
            return EnforcementAction.MANUAL_ONLY.value
    
    
    # ========================================================================
    # CONFIDENCE SCORING
    # ========================================================================
    
    def calculate_confidence(
        self,
        permissions: List[Permission],
        observation_days: int,
        sources: List[EvidenceSource],
        system_context: Optional[SystemContext] = None,
        simulation_result: Optional[Dict] = None
    ) -> ConfidenceScore:
        """
        Calculate comprehensive confidence score for enforcement decision.
        
        This is the core confidence scoring that answers:
        "How safe is it to remove these permissions right now?"
        """
        # Component scores
        usage_evidence = self._score_usage_evidence(permissions, observation_days)
        time_coverage = self._score_time_coverage(observation_days)
        source_completeness = self._score_source_completeness(sources)
        system_context_score = self._score_system_context(system_context)
        simulation_score = self._score_simulation(simulation_result)
        
        # Weighted geometric mean
        overall = (
            usage_evidence ** CONFIDENCE_WEIGHTS["usage_evidence"] *
            time_coverage ** CONFIDENCE_WEIGHTS["time_coverage"] *
            source_completeness ** CONFIDENCE_WEIGHTS["source_completeness"] *
            system_context_score ** CONFIDENCE_WEIGHTS["system_context"] *
            simulation_score ** CONFIDENCE_WEIGHTS["simulation"]
        )
        
        # Determine action
        recommended_action = self._determine_action(overall, system_context)
        
        # Generate explanation
        factors, warnings = self._explain_confidence(
            usage_evidence,
            time_coverage,
            source_completeness,
            system_context_score,
            simulation_score,
            observation_days,
            sources,
            system_context
        )
        
        return ConfidenceScore(
            overall=overall,
            usage_evidence=usage_evidence,
            time_coverage=time_coverage,
            source_completeness=source_completeness,
            system_context=system_context_score,
            simulation=simulation_score,
            recommended_action=recommended_action,
            factors=factors,
            warnings=warnings
        )
    
    
    def _score_usage_evidence(self, permissions: List[Permission], observation_days: int) -> float:
        """Score based on usage evidence quality"""
        if not permissions:
            return 0.5
        
        # Percentage of permissions with clear non-usage signal
        clear_unused = sum(
            1 for p in permissions
            if p.status == PermissionStatus.INACTIVE_SAFE.value and p.classification_confidence >= 0.8
        )
        
        score = clear_unused / len(permissions)
        
        # Boost if observation period is long
        if observation_days >= 180:
            score = min(1.0, score * 1.1)
        
        return score
    
    
    def _score_time_coverage(self, observation_days: int) -> float:
        """Score based on observation period length"""
        # Asymptotic approach to 1.0 at 180 days
        if observation_days <= 0:
            return 0.3
        
        score = 1.0 - (0.7 * (0.99 ** observation_days))
        return min(1.0, max(0.3, score))
    
    
    def _score_source_completeness(self, sources: List[EvidenceSource]) -> float:
        """Score based on data source coverage"""
        if not sources:
            return 0.5
        
        enabled_count = sum(1 for s in sources if s.enabled)
        coverage_avg = sum(s.coverage_percent for s in sources if s.enabled) / max(1, enabled_count)
        
        # Ideal is 3+ sources with >80% coverage each
        source_score = min(1.0, enabled_count / 3.0)
        coverage_score = coverage_avg
        
        return (source_score * 0.6 + coverage_score * 0.4)
    
    
    def _score_system_context(self, system_context: Optional[SystemContext]) -> float:
        """Score based on system context understanding"""
        if not system_context:
            return 0.7  # Neutral if no context
        
        score = 0.8  # Base score
        
        # Bonus for clear system boundaries
        if len(system_context.identities) > 0 and len(system_context.resources) > 0:
            score += 0.1
        
        # Bonus for dependency understanding
        if len(system_context.depends_on) > 0 or len(system_context.depended_by) > 0:
            score += 0.1
        
        return min(1.0, score)
    
    
    def _score_simulation(self, simulation_result: Optional[Dict]) -> float:
        """Score based on simulation results"""
        if not simulation_result:
            return 0.7  # Neutral if no simulation
        
        status = simulation_result.get("status", "CAUTION")
        
        if status == "SAFE":
            return 0.95
        elif status == "CAUTION":
            return 0.75
        elif status == "RISKY":
            return 0.40
        else:  # BLOCKED
            return 0.0
    
    
    def _explain_confidence(
        self,
        usage: float,
        time: float,
        sources: float,
        context: float,
        simulation: float,
        observation_days: int,
        evidence_sources: List[EvidenceSource],
        system_context: Optional[SystemContext]
    ) -> tuple:
        """Generate human-readable explanation of confidence score"""
        factors = []
        warnings = []
        
        # Usage evidence
        if usage >= 0.8:
            factors.append(f"Strong evidence of non-usage ({usage*100:.0f}% confidence)")
        elif usage >= 0.6:
            factors.append(f"Moderate evidence of non-usage ({usage*100:.0f}% confidence)")
        else:
            factors.append(f"Limited evidence of non-usage ({usage*100:.0f}% confidence)")
            warnings.append("Insufficient usage evidence - consider longer observation period")
        
        # Time coverage
        if observation_days >= 180:
            factors.append(f"Excellent observation period ({observation_days} days)")
        elif observation_days >= 90:
            factors.append(f"Good observation period ({observation_days} days)")
        else:
            factors.append(f"Limited observation period ({observation_days} days)")
            warnings.append(f"Observation period under 90 days - recommendations are less confident")
        
        # Source completeness
        enabled_count = sum(1 for s in evidence_sources if s.enabled)
        if enabled_count >= 3:
            factors.append(f"Multiple data sources ({enabled_count} enabled)")
        elif enabled_count >= 2:
            factors.append(f"Dual data sources ({enabled_count} enabled)")
        else:
            factors.append(f"Single data source")
            warnings.append("Consider enabling additional data sources (CloudTrail, Access Advisor, etc.)")
        
        # System context
        if system_context:
            if system_context.tier == "PRODUCTION":
                warnings.append("Production environment - extra caution applied")
            if system_context.revenue_generating:
                warnings.append("Revenue-generating system - confidence reduced")
        
        # Simulation
        if simulation >= 0.9:
            factors.append("Simulation confirms safety")
        elif simulation == 0.7:
            factors.append("No simulation run - using conservative estimates")
        else:
            warnings.append("Simulation flagged potential issues")
        
        return factors, warnings
    
    
    # ========================================================================
    # UTILITY FUNCTIONS
    # ========================================================================
    
    def _perm_to_dict(self, perm: Permission) -> Dict:
        """Convert Permission to dict"""
        return {
            "action": perm.action,
            "resource": perm.resource,
            "status": perm.status,
            "last_used": perm.last_used,
            "usage_count_90d": perm.usage_count_90d,
            "first_seen": perm.first_seen,
            "risk_level": perm.risk_level,
            "risk_reasons": perm.risk_reasons,
            "required_by_services": perm.required_by_services,
            "used_in_critical_path": perm.used_in_critical_path,
            "classification_confidence": round(perm.classification_confidence, 3)
        }
    
    
    def _system_context_to_dict(self, ctx: SystemContext) -> Dict:
        """Convert SystemContext to dict"""
        return {
            "system_name": ctx.system_name,
            "system_id": ctx.system_id,
            "tier": ctx.tier,
            "revenue_generating": ctx.revenue_generating,
            "compliance_frameworks": ctx.compliance_frameworks,
            "identities": ctx.identities,
            "resources": ctx.resources,
            "services": ctx.services,
            "depends_on": ctx.depends_on,
            "depended_by": ctx.depended_by
        }


# ============================================================================
# SNAPSHOT MANAGEMENT
# ============================================================================

class SnapshotManager:
    """
    Manages snapshots for Least Privilege enforcement.
    
    Snapshots are atomic, immutable records of IAM state before changes.
    """
    
    def create_snapshot(
        self,
        identity_id: str,
        identity_arn: str,
        iam_policies: List[Dict],
        trust_policy: Dict,
        metadata: Dict
    ) -> Dict:
        """
        Create an immutable snapshot of identity state.
        
        Returns:
            Snapshot metadata with ID and checksum
        """
        snapshot_id = self._generate_snapshot_id(identity_arn)
        
        snapshot_data = {
            "id": snapshot_id,
            "identity_id": identity_id,
            "identity_arn": identity_arn,
            "iam_policies": iam_policies,
            "trust_policy": trust_policy,
            "metadata": metadata,
            "created_at": datetime.utcnow().isoformat() + "Z",
            "version": "1.0"
        }
        
        # Calculate checksum
        checksum = self._calculate_checksum(snapshot_data)
        snapshot_data["checksum_sha256"] = checksum
        
        return snapshot_data
    
    
    def _generate_snapshot_id(self, identity_arn: str) -> str:
        """Generate unique snapshot ID"""
        timestamp = datetime.utcnow().isoformat()
        combined = f"{identity_arn}:{timestamp}"
        return hashlib.sha256(combined.encode()).hexdigest()[:16]
    
    
    def _calculate_checksum(self, snapshot_data: Dict) -> str:
        """Calculate SHA-256 checksum of snapshot"""
        # Remove checksum field if present
        data_copy = {k: v for k, v in snapshot_data.items() if k != "checksum_sha256"}
        
        # Deterministic JSON serialization
        json_str = json.dumps(data_copy, sort_keys=True)
        
        return hashlib.sha256(json_str.encode()).hexdigest()


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def analyze_least_privilege(
    identity_id: str,
    identity_type: str,
    permissions: List[Dict],
    usage_data: Dict,
    observation_days: int = 90,
    evidence_sources: List[Dict] = None,
    system_context: Dict = None
) -> Dict:
    """
    Convenience function for quick Least Privilege analysis.
    
    Args:
        identity_id: Identity ARN or ID
        identity_type: IAMRole, IAMUser, etc.
        permissions: List of permission dicts
        usage_data: Usage evidence
        observation_days: Days of observation
        evidence_sources: Data sources used
        system_context: System context dict
        
    Returns:
        Complete analysis with recommendations
    """
    engine = LeastPrivilegeEngine()
    
    # Convert system context
    sys_ctx = None
    if system_context:
        try:
            sys_ctx = SystemContext(
                system_name=system_context.get('system_name', ''),
                system_id=system_context.get('system_id', ''),
                tier=system_context.get('tier', 'DEVELOPMENT'),
                revenue_generating=system_context.get('revenue_generating', False),
                compliance_frameworks=system_context.get('compliance_frameworks', []),
                identities=system_context.get('identities', []),
                resources=system_context.get('resources', []),
                services=system_context.get('services', []),
                depends_on=system_context.get('depends_on', []),
                depended_by=system_context.get('depended_by', [])
            )
        except (TypeError, KeyError) as e:
            # If system context is invalid, continue without it
            sys_ctx = None
    
    # Convert evidence sources
    ev_sources = []
    if evidence_sources:
        for src in evidence_sources:
            ev_sources.append(EvidenceSource(**src))
    
    # Perform analysis
    analysis = engine.analyze_identity(
        identity_id,
        identity_type,
        permissions,
        usage_data,
        sys_ctx
    )
    
    # Add confidence scoring
    if analysis["permissions"]:
        perms = [Permission(**p) for p in analysis["permissions"]]
        confidence = engine.calculate_confidence(
            perms,
            observation_days,
            ev_sources,
            sys_ctx
        )
        
        analysis["confidence"] = {
            "overall": round(confidence.overall, 3),
            "components": {
                "usage_evidence": round(confidence.usage_evidence, 3),
                "time_coverage": round(confidence.time_coverage, 3),
                "source_completeness": round(confidence.source_completeness, 3),
                "system_context": round(confidence.system_context, 3),
                "simulation": round(confidence.simulation, 3)
            },
            "recommended_action": confidence.recommended_action,
            "factors": confidence.factors,
            "warnings": confidence.warnings
        }
    
    return analysis
