"""
FastAPI Backend Endpoint for Simulate Fix
==========================================
Add this to your FastAPI backend application.

This endpoint now integrates the Remediation Decision Engine for
enterprise-grade confidence scoring and action recommendations.

PHASE 1 UPDATE: Now uses CloudTrail for real usage data
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import os

# Import the CloudTrail usage collector (Phase 1)
try:
    from backend_engines.cloudtrail_usage_collector import get_usage_data_for_finding
    CLOUDTRAIL_AVAILABLE = True
except ImportError:
    CLOUDTRAIL_AVAILABLE = False
    print("WARNING: CloudTrail collector not available, using defaults")

# Import the historical tracker (Phase 2)
try:
    from backend_engines.historical_tracker import (
        get_historical_data_for_finding,
        record_remediation_start,
        record_remediation_success,
        record_remediation_failure,
    )
    HISTORICAL_DB_AVAILABLE = True
except ImportError:
    HISTORICAL_DB_AVAILABLE = False
    print("WARNING: Historical tracker not available, using defaults")

# Import the decision engine
# In production: from engines.remediation_decision_engine import RemediationDecisionEngine
# For now, we inline the key functionality

router = APIRouter()


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class SimulateRequest(BaseModel):
    finding_id: str
    resource_id: Optional[str] = None
    resource_type: Optional[str] = None


class ResourceChange(BaseModel):
    resource_id: str
    resource_type: str
    change_type: str
    before: str
    after: str


class TemporalInfo(BaseModel):
    start_time: str
    estimated_completion: str


class DecisionBreakdown(BaseModel):
    simulation: float
    usage: float
    data: float
    dependency: float
    historical: float


class RemediationDecision(BaseModel):
    confidence: float
    safety: float
    action: str  # AUTO_REMEDIATE, CANARY, REQUIRE_APPROVAL, BLOCK
    auto_allowed: bool
    reasons: List[str]
    breakdown: DecisionBreakdown
    warnings: List[str]


class SimulateResponse(BaseModel):
    success: bool
    confidence: int  # Legacy field (0-100)
    before_state: str
    after_state: str
    estimated_time: str
    temporal_info: TemporalInfo
    warnings: Optional[List[str]] = []
    resource_changes: Optional[List[ResourceChange]] = []
    impact_summary: Optional[str] = None
    # NEW: Decision engine output
    decision: Optional[RemediationDecision] = None


# ============================================================================
# INLINE DECISION ENGINE (for self-contained endpoint)
# In production, import from engines/remediation_decision_engine.py
# ============================================================================

from math import exp, log10

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))

def safe_div(a: float, b: float, default: float = 0.0) -> float:
    return a / b if b != 0 else default


class DecisionEngine:
    """Simplified inline decision engine"""

    WEIGHTS = {
        "simulation": 0.30,
        "usage": 0.25,
        "data": 0.20,
        "dependency": 0.15,
        "historical": 0.10,
    }

    def evaluate(
        self,
        simulation: Dict,
        usage: Dict,
        graph: Dict,
        history: Dict,
        env: Dict,
        policy: Dict,
    ) -> Dict:
        # Hard blocks
        if simulation.get("critical_path_affected"):
            return self._block("Critical path affected")

        # Calculate scores
        scores = {
            "simulation": self._simulation_score(simulation),
            "usage": self._usage_score(usage),
            "data": self._data_score(usage, graph),
            "dependency": self._dependency_score(graph),
            "historical": self._historical_score(history),
        }

        # Geometric mean
        confidence = 1.0
        for key, weight in self.WEIGHTS.items():
            confidence *= scores[key] ** weight
        confidence = clamp01(confidence)

        # Safety adjustments
        safety = self._apply_safety_rules(confidence, simulation, env, policy)

        # Decision
        action = self._decide_action(safety, policy)

        return {
            "confidence": round(confidence, 3),
            "safety": round(safety, 3),
            "action": action,
            "auto_allowed": self._auto_allowed(policy),
            "breakdown": {k: round(v, 3) for k, v in scores.items()},
            "reasons": self._explain(scores, simulation, usage, safety, action, policy),
            "warnings": simulation.get("warnings", []),
        }

    def _simulation_score(self, s: Dict) -> float:
        status_map = {"SAFE": 0.95, "CAUTION": 0.75, "RISKY": 0.40}
        base = status_map.get(s.get("status", "CAUTION"), 0.50)
        reach = clamp01(s.get("reachability_preserved", 0.8))
        return clamp01(base * (0.5 + 0.5 * reach))

    def _usage_score(self, u: Dict) -> float:
        pattern = u.get("usage_pattern", "MEDIUM")
        if pattern == "NONE":
            return 0.95
        if pattern == "LOW":
            return 0.85
        recency_risk = exp(-u.get("days_since_last_use", 0) / 30.0)
        freq_risk = min(1.0, log10(u.get("usage_count_90d", 0) + 1) / 2.5)
        return clamp01(1.0 - max(recency_risk, freq_risk))

    def _data_score(self, u: Dict, g: Dict) -> float:
        time_cov = 1.0 - exp(-u.get("observation_days", 90) / 40.0)
        src_cov = min(1.0, u.get("sources_available", 1) / 4.0)
        tel_cov = safe_div(g.get("resources_with_telemetry", 1), g.get("total_resources", 1), 0.5)
        return clamp01(time_cov * 0.4 + src_cov * 0.3 + tel_cov * 0.3)

    def _dependency_score(self, g: Dict) -> float:
        graph_cov = safe_div(g.get("resources_with_telemetry", 1), g.get("total_resources", 1), 0.5)
        edge_cov = safe_div(g.get("edges_observed", 0), g.get("edges_estimated", 1), 0.5)
        impact = sum(min(1.0, s.get("criticality", 0) / 10.0) for s in g.get("impacted_services", []))
        size_penalty = 1.0 / (1.0 + impact)
        return clamp01(graph_cov * edge_cov * size_penalty)

    def _historical_score(self, h: Dict) -> float:
        if h.get("total", 0) == 0:
            return 0.70
        rate = safe_div(h.get("successes", 0), h.get("total", 1), 0.5)
        weight = min(1.0, h.get("total", 0) / 10.0)
        return clamp01(0.70 + (rate - 0.5) * 0.4 * weight)

    def _apply_safety_rules(self, s: float, sim: Dict, env: Dict, pol: Dict) -> float:
        if env.get("tier", 2) == 0 or pol.get("shared_resource"):
            s = min(s, 0.70)
        if pol.get("revenue_generating"):
            s = min(s, 0.75)
        if pol.get("has_rollback", True):
            if s < 0.75:
                s = min(s * 1.15, 0.89)
        else:
            s *= 0.85
        if not pol.get("change_window_open", True):
            s *= 0.70
        s *= (1.0 - sim.get("worst_path_severity", 0) * 0.3)
        return clamp01(s)

    def _decide_action(self, safety: float, policy: Dict) -> str:
        if safety >= 0.90 and self._auto_allowed(policy):
            return "AUTO_REMEDIATE"
        if safety >= 0.75:
            return "CANARY"
        if safety >= 0.60:
            return "REQUIRE_APPROVAL"
        return "BLOCK"

    def _auto_allowed(self, policy: Dict) -> bool:
        return not (policy.get("tier", 2) <= 1 or policy.get("shared_resource", False))

    def _block(self, reason: str) -> Dict:
        return {
            "confidence": 0.0,
            "safety": 0.0,
            "action": "BLOCK",
            "auto_allowed": False,
            "reasons": [reason],
            "breakdown": {"simulation": 0, "usage": 0, "data": 0, "dependency": 0, "historical": 0},
            "warnings": [reason],
        }

    def _explain(self, scores: Dict, sim: Dict, usage: Dict, safety: float, action: str, policy: Dict) -> List[str]:
        reasons = []
        status = sim.get("status", "CAUTION")
        reach = sim.get("reachability_preserved", 0.8)
        reasons.append(f"Simulation {status} (reachability {reach*100:.0f}%)")

        pattern = usage.get("usage_pattern", "MEDIUM")
        days = usage.get("observation_days", 90)
        if pattern == "NONE":
            reasons.append(f"No usage detected in {days} days")
        else:
            count = usage.get("usage_count_90d", 0)
            reasons.append(f"Usage: {count} times in 90 days")

        if policy.get("shared_resource"):
            reasons.append("Shared resource cap applied")
        if policy.get("has_rollback", True):
            reasons.append("Rollback available")

        reasons.append(f"Final safety: {safety*100:.1f}% → {action}")
        return reasons


# ============================================================================
# SIMULATE ENDPOINT
# ============================================================================

@router.post("/api/simulate", response_model=SimulateResponse)
async def simulate_fix(request: SimulateRequest):
    """
    Simulate a fix for a security finding.

    This endpoint analyzes the finding and returns a simulation of what
    would happen if the fix is applied, including:
    - Confidence score (from decision engine)
    - Before/after states
    - Resource changes
    - Warnings
    - Decision recommendation
    """
    finding_id = request.finding_id

    # TODO: In production, fetch actual finding and analyze
    # finding = await get_finding_by_id(finding_id)
    # analysis = await analyze_finding(finding)

    # =========================================================================
    # STEP 1: Run Simulation (mock data for now)
    # =========================================================================

    simulation_data = {
        "status": "SAFE",
        "reachability_preserved": 0.94,
        "critical_path_affected": False,
        "worst_path_severity": 0.1,
        "permissions_tested": 15,
        "permissions_safe": 14,
        "services_tested": ["api-gateway", "lambda", "dynamodb"],
        "warnings": [
            "External monitoring service may lose read access",
            "Verify no automated scripts rely on this permission"
        ]
    }

    # =========================================================================
    # STEP 2: Gather Context Data - PHASE 1: Real CloudTrail Integration
    # =========================================================================

    # Get real usage data from CloudTrail (Phase 1)
    if CLOUDTRAIL_AVAILABLE:
        # Fetch actual usage metrics from AWS CloudTrail & Access Advisor
        finding_context = {
            "finding_id": finding_id,
            "role_name": request.resource_id,  # IAM role name
        }
        usage_data = get_usage_data_for_finding(
            finding_context,
            region=os.getenv("AWS_REGION", "us-east-1")
        )
        print(f"[Phase 1] CloudTrail usage data collected: {usage_data.get('usage_pattern')}")
    else:
        # Fallback to conservative defaults when CloudTrail not available
        usage_data = {
            "days_since_last_use": 0,      # Conservative: assume recently used
            "usage_count_90d": 100,        # Conservative: assume moderate usage
            "observation_days": 0,         # No observation data
            "sources_available": 0,        # No sources connected
            "usage_pattern": "MEDIUM",     # Conservative: don't auto-remediate
            "last_used_by": None
        }
        print("[Phase 1] WARNING: Using fallback usage data - CloudTrail not connected")

    graph_data = {
        "total_resources": 5,
        "resources_with_telemetry": 5,
        "edges_observed": 8,
        "edges_estimated": 10,
        "impacted_services": [],
        "cross_account_dependencies": 0,
        "circular_dependencies": False
    }

    # Get real historical data (Phase 2)
    if HISTORICAL_DB_AVAILABLE:
        finding_context = {
            "finding_id": finding_id,
            "resource_type": request.resource_type or "IAMRole",
        }
        history_data = get_historical_data_for_finding(finding_context)
        print(f"[Phase 2] Historical data: {history_data.get('total')} past remediations, {history_data.get('success_rate', 0):.1%} success rate")
    else:
        # Fallback to neutral defaults when historical DB not available
        history_data = {
            "total": 0,
            "successes": 0,
            "rollbacks": 0,
            "similar_resource_type_success_rate": 0.0,
            "last_failure_days_ago": None
        }
        print("[Phase 2] WARNING: Using fallback historical data - DB not connected")

    env_data = {
        "tier": 2,  # development
        "region": "us-east-1",
        "account_id": "123456789012",
        "is_multi_region": False,
        "compliance_frameworks": []
    }

    policy_data = {
        "shared_resource": False,
        "revenue_generating": False,
        "has_rollback": True,
        "change_window_open": True,
        "tier": 2,
        "requires_approval_above_tier": 1,
        "max_auto_remediate_severity": "MEDIUM"
    }

    # =========================================================================
    # STEP 3: Run Decision Engine
    # =========================================================================

    engine = DecisionEngine()
    decision = engine.evaluate(
        simulation=simulation_data,
        usage=usage_data,
        graph=graph_data,
        history=history_data,
        env=env_data,
        policy=policy_data
    )

    # =========================================================================
    # STEP 4: Build Response
    # =========================================================================

    # Legacy confidence (0-100 scale)
    legacy_confidence = int(decision["confidence"] * 100)

    # Temporal info
    start_time = datetime.utcnow()
    estimated_completion = start_time + timedelta(minutes=2)

    temporal_info = TemporalInfo(
        start_time=start_time.isoformat() + "Z",
        estimated_completion=estimated_completion.isoformat() + "Z"
    )

    # Resource changes
    resource_changes = [
        ResourceChange(
            resource_id=request.resource_id or f"arn:aws:iam::123456789012:role/example-role",
            resource_type=request.resource_type or "IAMRole",
            change_type="policy_update",
            before="Permission: s3:GetObject, iam:PassRole",
            after="Permission removed"
        )
    ]

    # Build decision model
    decision_model = RemediationDecision(
        confidence=decision["confidence"],
        safety=decision["safety"],
        action=decision["action"],
        auto_allowed=decision["auto_allowed"],
        reasons=decision["reasons"],
        breakdown=DecisionBreakdown(**decision["breakdown"]),
        warnings=decision["warnings"]
    )

    return SimulateResponse(
        success=True,
        confidence=legacy_confidence,
        before_state=f"Security finding {finding_id} is active with overly permissive access",
        after_state=f"Security finding {finding_id} will be remediated with least-privilege permissions",
        estimated_time="2-3 minutes",
        temporal_info=temporal_info,
        warnings=decision["warnings"],
        resource_changes=resource_changes,
        impact_summary=f"1 resource modified. {len(graph_data['impacted_services'])} services affected. Action: {decision['action']}",
        decision=decision_model
    )


# ============================================================================
# ADDITIONAL ENDPOINTS
# ============================================================================

@router.post("/api/simulate/with-context")
async def simulate_with_full_context(
    finding_id: str,
    simulation: Dict[str, Any],
    usage: Dict[str, Any],
    graph: Dict[str, Any],
    history: Dict[str, Any],
    env: Dict[str, Any],
    policy: Dict[str, Any],
):
    """
    Advanced simulation endpoint with full context.

    Use this when you have all context data available from your
    infrastructure analysis.
    """
    engine = DecisionEngine()
    decision = engine.evaluate(
        simulation=simulation,
        usage=usage,
        graph=graph,
        history=history,
        env=env,
        policy=policy
    )

    return {
        "finding_id": finding_id,
        "decision": decision,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


# ============================================================================
# INTEGRATION INSTRUCTIONS
# ============================================================================
"""
To use this in your main FastAPI app:

1. Copy to backend repo as `simulate_endpoint.py`

2. In main.py, add:
   from simulate_endpoint import router as simulate_router
   app.include_router(simulate_router)

3. For production, replace the mock data sections with actual:
   - Finding lookup from your database
   - Usage data from CloudTrail/Access Advisor
   - Graph data from your resource mapper
   - Historical data from your remediation history
   - Environment/Policy data from your configuration

4. Deploy to Render

The decision engine now provides:
- Confidence score (0.0-1.0)
- Safety score (adjusted for policies)
- Recommended action (AUTO_REMEDIATE, CANARY, REQUIRE_APPROVAL, BLOCK)
- Score breakdown by category
- Human-readable explanations
- Warnings
"""
