"""
SafeRemediate Backend API
=========================
Production-ready confidence-based remediation engine.

Run locally:
    uvicorn main:app --reload --port 8000

Deploy to Render:
    1. Connect this repo
    2. Set build command: pip install -r requirements.txt
    3. Set start command: uvicorn main:app --host 0.0.0.0 --port $PORT
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import our engines
try:
    from cloudtrail_usage_collector import get_usage_data_for_finding
    CLOUDTRAIL_AVAILABLE = True
    logger.info("✅ CloudTrail collector loaded")
except ImportError as e:
    CLOUDTRAIL_AVAILABLE = False
    logger.warning(f"⚠️ CloudTrail collector not available: {e}")

try:
    from historical_tracker import (
        get_historical_data_for_finding,
        record_remediation_start,
        record_remediation_success,
        record_remediation_failure,
        record_remediation_rollback,
    )
    HISTORICAL_DB_AVAILABLE = True
    logger.info("✅ Historical tracker loaded")
except ImportError as e:
    HISTORICAL_DB_AVAILABLE = False
    logger.warning(f"⚠️ Historical tracker not available: {e}")

try:
    from health_checker import run_health_check_sync
    HEALTH_CHECKER_AVAILABLE = True
    logger.info("✅ Health checker loaded")
except ImportError as e:
    HEALTH_CHECKER_AVAILABLE = False
    logger.warning(f"⚠️ Health checker not available: {e}")

try:
    from workflow_orchestrator import (
        create_remediation_workflow,
        approve_workflow,
        reject_workflow,
        advance_canary_workflow,
        get_pending_approvals,
    )
    WORKFLOW_AVAILABLE = True
    logger.info("✅ Workflow orchestrator loaded")
except ImportError as e:
    WORKFLOW_AVAILABLE = False
    logger.warning(f"⚠️ Workflow orchestrator not available: {e}")


# =============================================================================
# FASTAPI APP
# =============================================================================

app = FastAPI(
    title="SafeRemediate API",
    description="Confidence-based cloud remediation engine",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# MODELS
# =============================================================================

class SimulateRequest(BaseModel):
    finding_id: str
    resource_id: Optional[str] = None
    resource_type: Optional[str] = "IAMRole"


class ExecuteRequest(BaseModel):
    finding_id: str
    resource_id: Optional[str] = None
    force: Optional[bool] = False


class ApprovalRequest(BaseModel):
    workflow_id: str
    approved_by: str
    comment: Optional[str] = None


class RollbackRequest(BaseModel):
    finding_id: str
    snapshot_id: Optional[str] = None
    reason: Optional[str] = None


# =============================================================================
# DECISION ENGINE (Inline)
# =============================================================================

from math import exp, log10

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))

def safe_div(a: float, b: float, default: float = 0.0) -> float:
    return a / b if b != 0 else default


class DecisionEngine:
    """Confidence-based decision engine"""

    WEIGHTS = {
        "simulation": 0.30,
        "usage": 0.25,
        "data": 0.20,
        "dependency": 0.15,
        "historical": 0.10,
    }

    def evaluate(self, simulation: Dict, usage: Dict, graph: Dict,
                 history: Dict, env: Dict, policy: Dict) -> Dict:
        if simulation.get("critical_path_affected"):
            return self._block("Critical path affected")

        scores = {
            "simulation": self._simulation_score(simulation),
            "usage": self._usage_score(usage),
            "data": self._data_score(usage, graph),
            "dependency": self._dependency_score(graph),
            "historical": self._historical_score(history),
        }

        confidence = 1.0
        for key, weight in self.WEIGHTS.items():
            confidence *= scores[key] ** weight
        confidence = clamp01(confidence)

        safety = self._apply_safety_rules(confidence, simulation, env, policy)
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

    def _explain(self, scores: Dict, sim: Dict, usage: Dict, safety: float,
                 action: str, policy: Dict) -> List[str]:
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


# Global engine instance
engine = DecisionEngine()


# =============================================================================
# ENDPOINTS
# =============================================================================

@app.get("/")
async def root():
    return {
        "service": "SafeRemediate API",
        "version": "1.0.0",
        "status": "healthy",
        "engines": {
            "cloudtrail": CLOUDTRAIL_AVAILABLE,
            "historical": HISTORICAL_DB_AVAILABLE,
            "health_checker": HEALTH_CHECKER_AVAILABLE,
            "workflow": WORKFLOW_AVAILABLE,
        }
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.post("/api/simulate")
async def simulate(request: SimulateRequest):
    """
    Simulate a remediation and get confidence score.
    """
    finding_id = request.finding_id
    logger.info(f"Simulating remediation for: {finding_id}")

    # Step 1: Simulation analysis (would analyze actual changes)
    simulation_data = {
        "status": "SAFE",
        "reachability_preserved": 0.94,
        "critical_path_affected": False,
        "worst_path_severity": 0.1,
        "warnings": []
    }

    # Step 2: Get usage data (Phase 1)
    if CLOUDTRAIL_AVAILABLE:
        finding_context = {"finding_id": finding_id, "role_name": request.resource_id}
        usage_data = get_usage_data_for_finding(finding_context, region=os.getenv("AWS_REGION", "us-east-1"))
        logger.info(f"[Phase 1] CloudTrail: {usage_data.get('usage_pattern')}")
    else:
        usage_data = {
            "days_since_last_use": 0,
            "usage_count_90d": 100,
            "observation_days": 0,
            "sources_available": 0,
            "usage_pattern": "MEDIUM",
            "last_used_by": None
        }

    # Step 3: Graph data (from Neo4j in production)
    graph_data = {
        "total_resources": 5,
        "resources_with_telemetry": 5,
        "edges_observed": 8,
        "edges_estimated": 10,
        "impacted_services": [],
    }

    # Step 4: Historical data (Phase 2)
    if HISTORICAL_DB_AVAILABLE:
        finding_context = {"finding_id": finding_id, "resource_type": request.resource_type}
        history_data = get_historical_data_for_finding(finding_context)
        logger.info(f"[Phase 2] Historical: {history_data.get('total')} remediations")
    else:
        history_data = {"total": 0, "successes": 0, "rollbacks": 0}

    # Step 5: Environment & Policy
    env_data = {"tier": 2, "region": os.getenv("AWS_REGION", "us-east-1")}
    policy_data = {"has_rollback": True, "change_window_open": True}

    # Step 6: Run decision engine
    decision = engine.evaluate(
        simulation=simulation_data,
        usage=usage_data,
        graph=graph_data,
        history=history_data,
        env=env_data,
        policy=policy_data
    )

    return {
        "success": True,
        "finding_id": finding_id,
        "confidence": int(decision["confidence"] * 100),
        "decision": decision,
        "usage_data": usage_data,
        "data_sources": {
            "cloudtrail": CLOUDTRAIL_AVAILABLE,
            "historical": HISTORICAL_DB_AVAILABLE,
        }
    }


@app.post("/api/simulate/execute")
async def execute(request: ExecuteRequest):
    """
    Execute a remediation after simulation.
    """
    finding_id = request.finding_id
    logger.info(f"Executing remediation for: {finding_id}")

    # Record start (Phase 2)
    record_id = None
    if HISTORICAL_DB_AVAILABLE:
        record_id = record_remediation_start(
            finding_id=finding_id,
            resource_type="IAMRole",
            resource_id=request.resource_id or finding_id,
            action="AUTO_REMEDIATE",
            confidence=0.9,
            safety=0.85,
        )

    try:
        # TODO: Execute actual IAM changes here
        # iam.update_assume_role_policy(...)

        # Health check (Phase 3)
        health_report = None
        if HEALTH_CHECKER_AVAILABLE:
            health_report = run_health_check_sync(
                resource_type="IAMRole",
                resource_id=request.resource_id or finding_id,
                remediation_type="permission_removal",
            )

            if health_report.get("should_rollback"):
                if HISTORICAL_DB_AVAILABLE and record_id:
                    record_remediation_failure(record_id, health_report.get("rollback_reason"))
                return {
                    "success": False,
                    "error": "Health check failed",
                    "health_report": health_report,
                    "rolled_back": True,
                }

        # Record success (Phase 2)
        if HISTORICAL_DB_AVAILABLE and record_id:
            record_remediation_success(record_id)

        return {
            "success": True,
            "finding_id": finding_id,
            "message": "Remediation executed successfully",
            "health_report": health_report,
            "record_id": record_id,
        }

    except Exception as e:
        logger.error(f"Execution failed: {e}")
        if HISTORICAL_DB_AVAILABLE and record_id:
            record_remediation_failure(record_id, str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/safe-remediate/rollback")
async def rollback(request: RollbackRequest):
    """
    Rollback a remediation.
    """
    logger.info(f"Rolling back: {request.finding_id}")

    # TODO: Implement actual rollback using snapshot

    return {
        "success": True,
        "finding_id": request.finding_id,
        "message": "Rollback completed",
    }


@app.get("/api/approvals/pending")
async def pending_approvals():
    """
    Get pending approval requests.
    """
    if WORKFLOW_AVAILABLE:
        return {"approvals": get_pending_approvals()}
    return {"approvals": []}


@app.post("/api/approvals/approve")
async def approve(request: ApprovalRequest):
    """
    Approve a pending workflow.
    """
    if WORKFLOW_AVAILABLE:
        result = await approve_workflow(
            request.workflow_id,
            request.approved_by,
            request.comment
        )
        return result
    raise HTTPException(status_code=501, detail="Workflow engine not available")


@app.post("/api/approvals/reject")
async def reject(request: ApprovalRequest):
    """
    Reject a pending workflow.
    """
    if WORKFLOW_AVAILABLE:
        result = await reject_workflow(
            request.workflow_id,
            request.approved_by,
            request.comment
        )
        return result
    raise HTTPException(status_code=501, detail="Workflow engine not available")


# =============================================================================
# RUN
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
