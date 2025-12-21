"""
SafeRemediate - Remediation Decision Engine
============================================
Enterprise-grade decision engine for safe cloud remediation.

This engine does ONE thing:
    Signals → Confidence → Safety → Decision

It does NOT:
- Execute simulations
- Touch AWS directly
- Do ML training

Copy this file to your backend repo: engines/remediation_decision_engine.py
"""

from math import exp, log10
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum


# ============================================================================
# CONSTANTS & CONFIGURATION
# ============================================================================

class RemediationAction(str, Enum):
    """Possible remediation decisions"""
    AUTO_REMEDIATE = "AUTO_REMEDIATE"  # Safe to auto-apply
    CANARY = "CANARY"                   # Apply to subset first
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"  # Needs human review
    BLOCK = "BLOCK"                     # Too risky, do not proceed


class EnvironmentTier(int, Enum):
    """Environment criticality tiers"""
    PRODUCTION = 0      # Highest risk
    STAGING = 1
    DEVELOPMENT = 2
    SANDBOX = 3         # Lowest risk


# Weight configuration for geometric mean calculation
SCORE_WEIGHTS = {
    "simulation": 0.30,
    "usage": 0.25,
    "data": 0.20,
    "dependency": 0.15,
    "historical": 0.10,
}

# Thresholds for action decisions
THRESHOLD_AUTO = 0.90
THRESHOLD_CANARY = 0.75
THRESHOLD_APPROVAL = 0.60


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def clamp01(x: float) -> float:
    """Clamp value between 0 and 1"""
    return max(0.0, min(1.0, x))


def safe_div(a: float, b: float, default: float = 0.0) -> float:
    """Safe division with default for zero denominator"""
    return a / b if b != 0 else default


# ============================================================================
# DATA MODELS (Input Contexts)
# ============================================================================

@dataclass
class SimulationResult:
    """Result from simulation engine"""
    status: str  # "SAFE", "CAUTION", "RISKY"
    reachability_preserved: float  # 0.0-1.0
    critical_path_affected: bool
    worst_path_severity: float  # 0.0-1.0
    permissions_tested: int
    permissions_safe: int
    services_tested: List[str]
    warnings: List[str]

    @classmethod
    def from_dict(cls, d: Dict) -> "SimulationResult":
        return cls(
            status=d.get("status", "CAUTION"),
            reachability_preserved=d.get("reachability_preserved", 0.8),
            critical_path_affected=d.get("critical_path_affected", False),
            worst_path_severity=d.get("worst_path_severity", 0.0),
            permissions_tested=d.get("permissions_tested", 0),
            permissions_safe=d.get("permissions_safe", 0),
            services_tested=d.get("services_tested", []),
            warnings=d.get("warnings", []),
        )


@dataclass
class UsageMetrics:
    """Usage telemetry data"""
    days_since_last_use: int
    usage_count_90d: int
    observation_days: int
    sources_available: int  # Number of data sources (CloudTrail, AccessAdvisor, etc.)
    last_used_by: Optional[str]
    usage_pattern: str  # "NONE", "LOW", "MEDIUM", "HIGH"

    @classmethod
    def from_dict(cls, d: Dict) -> "UsageMetrics":
        return cls(
            days_since_last_use=d.get("days_since_last_use", 0),
            usage_count_90d=d.get("usage_count_90d", 0),
            observation_days=d.get("observation_days", 90),
            sources_available=d.get("sources_available", 1),
            last_used_by=d.get("last_used_by"),
            usage_pattern=d.get("usage_pattern", "MEDIUM"),
        )


@dataclass
class DependencyContext:
    """Resource dependency graph context"""
    total_resources: int
    resources_with_telemetry: int
    edges_observed: int
    edges_estimated: int
    impacted_services: List[Dict]  # [{"name": str, "criticality": int}]
    cross_account_dependencies: int
    circular_dependencies: bool

    @classmethod
    def from_dict(cls, d: Dict) -> "DependencyContext":
        return cls(
            total_resources=d.get("total_resources", 1),
            resources_with_telemetry=d.get("resources_with_telemetry", 1),
            edges_observed=d.get("edges_observed", 0),
            edges_estimated=d.get("edges_estimated", 1),
            impacted_services=d.get("impacted_services", []),
            cross_account_dependencies=d.get("cross_account_dependencies", 0),
            circular_dependencies=d.get("circular_dependencies", False),
        )


@dataclass
class HistoricalContext:
    """Historical remediation outcomes"""
    total: int
    successes: int
    rollbacks: int
    similar_resource_type_success_rate: float
    last_failure_days_ago: Optional[int]

    @classmethod
    def from_dict(cls, d: Dict) -> "HistoricalContext":
        return cls(
            total=d.get("total", 0),
            successes=d.get("successes", 0),
            rollbacks=d.get("rollbacks", 0),
            similar_resource_type_success_rate=d.get("similar_resource_type_success_rate", 0.0),
            last_failure_days_ago=d.get("last_failure_days_ago"),
        )


@dataclass
class EnvironmentContext:
    """Environment and infrastructure context"""
    tier: int  # 0=prod, 1=staging, 2=dev, 3=sandbox
    region: str
    account_id: str
    is_multi_region: bool
    compliance_frameworks: List[str]  # ["SOC2", "PCI-DSS", "HIPAA"]

    @classmethod
    def from_dict(cls, d: Dict) -> "EnvironmentContext":
        return cls(
            tier=d.get("tier", 0),
            region=d.get("region", "us-east-1"),
            account_id=d.get("account_id", ""),
            is_multi_region=d.get("is_multi_region", False),
            compliance_frameworks=d.get("compliance_frameworks", []),
        )


@dataclass
class PolicyContext:
    """Organizational policy context"""
    shared_resource: bool
    revenue_generating: bool
    has_rollback: bool
    change_window_open: bool
    tier: int  # Mirrors environment tier for policy rules
    requires_approval_above_tier: int
    max_auto_remediate_severity: str  # "LOW", "MEDIUM", "HIGH"

    @classmethod
    def from_dict(cls, d: Dict) -> "PolicyContext":
        return cls(
            shared_resource=d.get("shared_resource", False),
            revenue_generating=d.get("revenue_generating", False),
            has_rollback=d.get("has_rollback", True),
            change_window_open=d.get("change_window_open", True),
            tier=d.get("tier", 2),
            requires_approval_above_tier=d.get("requires_approval_above_tier", 1),
            max_auto_remediate_severity=d.get("max_auto_remediate_severity", "MEDIUM"),
        )


# ============================================================================
# DECISION OUTPUT MODEL
# ============================================================================

@dataclass
class RemediationDecision:
    """Output of the decision engine"""
    confidence: float
    safety: float
    action: str
    auto_allowed: bool
    reasons: List[str]
    breakdown: Dict[str, float]
    warnings: List[str]

    def to_dict(self) -> Dict:
        return {
            "confidence": round(self.confidence, 3),
            "safety": round(self.safety, 3),
            "action": self.action,
            "auto_allowed": self.auto_allowed,
            "reasons": self.reasons,
            "breakdown": {k: round(v, 3) for k, v in self.breakdown.items()},
            "warnings": self.warnings,
        }


# ============================================================================
# REMEDIATION DECISION ENGINE
# ============================================================================

class RemediationDecisionEngine:
    """
    Enterprise-grade decision engine for cloud remediation.

    Evaluates multiple signals to produce a confidence score and
    recommended action for remediation operations.

    Usage:
        decision = RemediationDecisionEngine().evaluate(
            simulation=SimulationResult,
            usage=UsageMetrics,
            graph=DependencyContext,
            history=HistoricalContext,
            env=EnvironmentContext,
            policy=PolicyContext
        )
    """

    def evaluate(
        self,
        simulation: Dict,
        usage: Dict,
        graph: Dict,
        history: Dict,
        env: Dict,
        policy: Dict,
    ) -> Dict:
        """
        Main evaluation entry point.

        Args:
            simulation: Simulation result data
            usage: Usage metrics data
            graph: Dependency graph context
            history: Historical remediation data
            env: Environment context
            policy: Organizational policy context

        Returns:
            Decision dictionary with confidence, safety, action, and breakdown
        """
        # Convert dicts to typed objects
        sim = SimulationResult.from_dict(simulation)
        use = UsageMetrics.from_dict(usage)
        dep = DependencyContext.from_dict(graph)
        hist = HistoricalContext.from_dict(history)
        environ = EnvironmentContext.from_dict(env)
        pol = PolicyContext.from_dict(policy)

        # ---------- HARD BLOCKS ----------
        # These conditions immediately block remediation
        if sim.critical_path_affected:
            return self._block("Critical path affected - manual review required")

        if dep.circular_dependencies:
            return self._block("Circular dependencies detected - cannot safely remediate")

        # ---------- CONFIDENCE SCORING ----------
        scores = {
            "simulation": self._simulation_score(sim),
            "usage": self._usage_score(use),
            "data": self._data_score(use, dep),
            "dependency": self._dependency_score(dep),
            "historical": self._historical_score(hist),
        }

        # Geometric mean with weights
        confidence = (
            scores["simulation"] ** SCORE_WEIGHTS["simulation"] *
            scores["usage"] ** SCORE_WEIGHTS["usage"] *
            scores["data"] ** SCORE_WEIGHTS["data"] *
            scores["dependency"] ** SCORE_WEIGHTS["dependency"] *
            scores["historical"] ** SCORE_WEIGHTS["historical"]
        )
        confidence = clamp01(confidence)

        # ---------- SAFETY ADJUSTMENT ----------
        safety = self._apply_safety_rules(confidence, sim, environ, pol)

        # ---------- ACTION DECISION ----------
        action = self._decide_action(safety, pol)

        # ---------- EXPLAINABILITY ----------
        reasons = self._explain(scores, sim, use, dep, hist, safety, action, pol)
        warnings = self._generate_warnings(sim, use, dep, environ, pol)

        decision = RemediationDecision(
            confidence=confidence,
            safety=safety,
            action=action,
            auto_allowed=self._auto_allowed(pol, environ),
            reasons=reasons,
            breakdown=scores,
            warnings=warnings,
        )

        return decision.to_dict()

    # ============================================================================
    # SCORING FUNCTIONS
    # ============================================================================

    def _simulation_score(self, sim: SimulationResult) -> float:
        """
        Score based on simulation results.

        Factors:
        - Status (SAFE/CAUTION/RISKY)
        - Reachability preservation
        - Permission test coverage
        """
        # Base score from status
        status_scores = {"SAFE": 0.95, "CAUTION": 0.75, "RISKY": 0.40}
        base = status_scores.get(sim.status, 0.50)

        # Reachability factor (50% weight)
        reach = clamp01(sim.reachability_preserved)

        # Permission test coverage factor
        perm_coverage = safe_div(sim.permissions_safe, sim.permissions_tested, 1.0)

        score = base * (0.5 + 0.3 * reach + 0.2 * perm_coverage)
        return clamp01(score)

    def _usage_score(self, usage: UsageMetrics) -> float:
        """
        Score based on usage patterns.

        Higher score = less usage = safer to remove.
        Lower score = active usage = more caution needed.
        """
        # Recency risk: exponential decay, 30-day half-life
        recency_risk = exp(-usage.days_since_last_use / 30.0)

        # Frequency risk: log scale for usage count
        freq_risk = min(1.0, log10(usage.usage_count_90d + 1) / 2.5)

        # For unused permissions, this should yield HIGH confidence
        # For actively used, LOW confidence (we DON'T want to remove active perms)
        if usage.usage_pattern == "NONE":
            return 0.95  # Very safe to remove unused
        elif usage.usage_pattern == "LOW":
            return 0.85

        # For medium/high usage, apply risk factors
        return clamp01(1.0 - max(recency_risk, freq_risk))

    def _data_score(self, usage: UsageMetrics, graph: DependencyContext) -> float:
        """
        Score based on data quality and coverage.

        Higher score = more observation data = more confidence in decision.
        """
        # Time coverage: exponential approach to full coverage at ~40 days
        time_coverage = 1.0 - exp(-usage.observation_days / 40.0)

        # Source coverage: ideal is 4+ data sources
        source_coverage = min(1.0, usage.sources_available / 4.0)

        # Telemetry coverage in dependency graph
        telemetry_coverage = safe_div(
            graph.resources_with_telemetry,
            graph.total_resources,
            0.5
        )

        return clamp01(time_coverage * 0.4 + source_coverage * 0.3 + telemetry_coverage * 0.3)

    def _dependency_score(self, graph: DependencyContext) -> float:
        """
        Score based on dependency graph analysis.

        Factors:
        - Graph coverage
        - Edge observation
        - Impact size
        """
        # Graph coverage
        graph_cov = safe_div(graph.resources_with_telemetry, graph.total_resources, 0.5)

        # Edge observation coverage
        edge_cov = safe_div(graph.edges_observed, graph.edges_estimated, 0.5)

        # Impact penalty based on service criticality
        impact = sum(
            min(1.0, s.get("criticality", 0) / 10.0)
            for s in graph.impacted_services
        )
        size_penalty = 1.0 / (1.0 + impact)

        # Cross-account penalty
        cross_account_penalty = 1.0 / (1.0 + graph.cross_account_dependencies * 0.2)

        return clamp01(graph_cov * edge_cov * size_penalty * cross_account_penalty)

    def _historical_score(self, history: HistoricalContext) -> float:
        """
        Score based on historical remediation outcomes.

        No history = neutral score (0.70)
        Good history = bonus
        Bad history = penalty
        """
        if history.total == 0:
            return 0.70  # Neutral - no history

        success_rate = safe_div(history.successes, history.total, 0.5)

        # Weight increases with more data points (cap at 10)
        weight = min(1.0, history.total / 10.0)

        # Base of 0.70, adjust by up to ±0.20 based on success rate
        base_score = 0.70 + (success_rate - 0.5) * 0.4 * weight

        # Bonus for similar resource type success
        if history.similar_resource_type_success_rate > 0.9:
            base_score *= 1.05

        # Penalty for recent failures
        if history.last_failure_days_ago is not None and history.last_failure_days_ago < 7:
            base_score *= 0.85

        return clamp01(base_score)

    # ============================================================================
    # SAFETY RULES
    # ============================================================================

    def _apply_safety_rules(
        self,
        safety: float,
        sim: SimulationResult,
        env: EnvironmentContext,
        policy: PolicyContext,
    ) -> float:
        """
        Apply organizational safety rules to adjust the final safety score.
        """
        s = safety

        # Production or shared resource cap
        if env.tier == 0 or policy.shared_resource:
            s = min(s, 0.70)

        # Revenue-generating resource cap
        if policy.revenue_generating:
            s = min(s, 0.75)

        # Rollback availability bonus/penalty
        if policy.has_rollback:
            if s < 0.75:
                s = min(s * 1.15, 0.89)  # Boost but cap
        else:
            s *= 0.85  # Penalty for no rollback

        # Change window check
        if not policy.change_window_open:
            s *= 0.70

        # Compliance framework penalty (more frameworks = more caution)
        if len(env.compliance_frameworks) >= 2:
            s *= 0.95

        # Worst path severity penalty
        s *= (1.0 - sim.worst_path_severity * 0.3)

        # Multi-region penalty
        if env.is_multi_region:
            s *= 0.90

        return clamp01(s)

    # ============================================================================
    # DECISION LOGIC
    # ============================================================================

    def _decide_action(self, safety: float, policy: PolicyContext) -> str:
        """Determine recommended action based on safety score and policy."""
        if safety >= THRESHOLD_AUTO and self._auto_allowed(policy, None):
            return RemediationAction.AUTO_REMEDIATE.value
        elif safety >= THRESHOLD_CANARY:
            return RemediationAction.CANARY.value
        elif safety >= THRESHOLD_APPROVAL:
            return RemediationAction.REQUIRE_APPROVAL.value
        else:
            return RemediationAction.BLOCK.value

    def _auto_allowed(self, policy: PolicyContext, env: Optional[EnvironmentContext]) -> bool:
        """Check if auto-remediation is allowed by policy."""
        # Never auto for production or shared resources
        if policy.tier <= 1 or policy.shared_resource:
            return False
        return True

    def _block(self, reason: str) -> Dict:
        """Return a blocking decision."""
        return {
            "confidence": 0.0,
            "safety": 0.0,
            "action": RemediationAction.BLOCK.value,
            "auto_allowed": False,
            "reasons": [reason],
            "breakdown": {},
            "warnings": [reason],
        }

    # ============================================================================
    # EXPLAINABILITY
    # ============================================================================

    def _explain(
        self,
        scores: Dict[str, float],
        sim: SimulationResult,
        usage: UsageMetrics,
        graph: DependencyContext,
        history: HistoricalContext,
        safety: float,
        action: str,
        policy: PolicyContext,
    ) -> List[str]:
        """Generate human-readable explanations for the decision."""
        reasons = []

        # Simulation explanation
        if sim.status == "SAFE":
            reasons.append(f"Simulation SAFE (reachability preserved {sim.reachability_preserved*100:.0f}%)")
        elif sim.status == "CAUTION":
            reasons.append(f"Simulation requires CAUTION ({len(sim.warnings)} warnings)")
        else:
            reasons.append(f"Simulation flagged as RISKY")

        # Usage explanation
        if usage.usage_pattern == "NONE":
            reasons.append(f"No usage detected in {usage.observation_days} days")
        elif usage.days_since_last_use > 90:
            reasons.append(f"Last used {usage.days_since_last_use} days ago (inactive)")
        else:
            reasons.append(f"Usage observed: {usage.usage_count_90d} times in 90 days")

        # Dependency explanation
        impacted_count = len(graph.impacted_services)
        if impacted_count == 0:
            reasons.append("No critical paths affected")
        else:
            reasons.append(f"{impacted_count} service(s) may be impacted")

        # Historical explanation
        if history.total > 0:
            rate = safe_div(history.successes, history.total, 0) * 100
            reasons.append(f"Historical success rate: {rate:.0f}% ({history.total} similar)")
        else:
            reasons.append("No historical data for similar remediations")

        # Policy explanations
        if policy.shared_resource:
            reasons.append("Shared resource policy applied (capped at 70%)")
        if not policy.change_window_open:
            reasons.append("Outside change window (reduced confidence)")
        if policy.has_rollback:
            reasons.append("Rollback available (confidence boosted)")

        # Final decision
        reasons.append(f"Final safety: {safety*100:.1f}% → {action}")

        return reasons

    def _generate_warnings(
        self,
        sim: SimulationResult,
        usage: UsageMetrics,
        graph: DependencyContext,
        env: EnvironmentContext,
        policy: PolicyContext,
    ) -> List[str]:
        """Generate warnings for the user."""
        warnings = []

        # Simulation warnings passthrough
        warnings.extend(sim.warnings)

        # Data quality warnings
        if usage.observation_days < 30:
            warnings.append(f"Limited observation period ({usage.observation_days} days)")
        if usage.sources_available < 2:
            warnings.append("Single data source - consider enabling additional telemetry")

        # Dependency warnings
        if graph.cross_account_dependencies > 0:
            warnings.append(f"Cross-account dependencies detected ({graph.cross_account_dependencies})")

        # Environment warnings
        if env.tier == 0:
            warnings.append("Production environment - extra caution advised")
        if len(env.compliance_frameworks) > 0:
            frameworks = ", ".join(env.compliance_frameworks)
            warnings.append(f"Compliance frameworks apply: {frameworks}")

        # Policy warnings
        if not policy.has_rollback:
            warnings.append("No rollback mechanism available")
        if not policy.change_window_open:
            warnings.append("Outside designated change window")

        return warnings


# ============================================================================
# CONVENIENCE FUNCTION
# ============================================================================

def evaluate_remediation(
    simulation: Dict = None,
    usage: Dict = None,
    graph: Dict = None,
    history: Dict = None,
    env: Dict = None,
    policy: Dict = None,
) -> Dict:
    """
    Convenience function for quick evaluation.

    All parameters are optional and will use sensible defaults if not provided.
    """
    engine = RemediationDecisionEngine()
    return engine.evaluate(
        simulation=simulation or {},
        usage=usage or {},
        graph=graph or {},
        history=history or {},
        env=env or {},
        policy=policy or {},
    )


# ============================================================================
# INTEGRATION EXAMPLE
# ============================================================================
"""
To integrate with your FastAPI backend:

1. Copy this file to your backend: engines/remediation_decision_engine.py

2. In your simulate endpoint, after running simulation:

    from engines.remediation_decision_engine import RemediationDecisionEngine

    # After simulation completes
    decision = RemediationDecisionEngine().evaluate(
        simulation={
            "status": "SAFE",
            "reachability_preserved": 0.94,
            "critical_path_affected": False,
            "worst_path_severity": 0.1,
            "permissions_tested": 15,
            "permissions_safe": 14,
            "services_tested": ["api-gateway", "lambda"],
            "warnings": []
        },
        usage={
            "days_since_last_use": 120,
            "usage_count_90d": 0,
            "observation_days": 90,
            "sources_available": 3,
            "usage_pattern": "NONE"
        },
        graph={
            "total_resources": 5,
            "resources_with_telemetry": 5,
            "edges_observed": 8,
            "edges_estimated": 10,
            "impacted_services": [],
            "cross_account_dependencies": 0,
            "circular_dependencies": False
        },
        history={
            "total": 23,
            "successes": 23,
            "rollbacks": 0,
            "similar_resource_type_success_rate": 1.0
        },
        env={
            "tier": 2,  # development
            "region": "us-east-1",
            "is_multi_region": False,
            "compliance_frameworks": []
        },
        policy={
            "shared_resource": False,
            "revenue_generating": False,
            "has_rollback": True,
            "change_window_open": True,
            "tier": 2
        }
    )

    # Return combined response
    return {
        "simulation": simulation_result,
        "decision": decision
    }
"""
