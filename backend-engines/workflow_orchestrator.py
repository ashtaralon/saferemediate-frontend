"""
Remediation Workflow Orchestrator
=================================
Handles advanced remediation workflows:
1. Canary Deployments - Gradual rollout with monitoring
2. Approval Workflows - Human-in-the-loop for risky changes
3. Scheduled Remediations - Change window enforcement

Requirements:
    pip install aiohttp sqlalchemy
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, asdict, field
from enum import Enum
import json
import logging
import uuid
import os

logger = logging.getLogger(__name__)


# =============================================================================
# ENUMS & DATA CLASSES
# =============================================================================

class WorkflowStatus(str, Enum):
    PENDING = "PENDING"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANARY_DEPLOYING = "CANARY_DEPLOYING"
    CANARY_MONITORING = "CANARY_MONITORING"
    CANARY_PROMOTING = "CANARY_PROMOTING"
    EXECUTING = "EXECUTING"
    HEALTH_CHECK = "HEALTH_CHECK"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    ROLLED_BACK = "ROLLED_BACK"
    EXPIRED = "EXPIRED"


class WorkflowType(str, Enum):
    AUTO_REMEDIATE = "AUTO_REMEDIATE"
    CANARY = "CANARY"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"
    SCHEDULED = "SCHEDULED"


@dataclass
class ApprovalRequest:
    """Approval request for human review"""
    id: str
    workflow_id: str
    finding_id: str
    resource_type: str
    resource_id: str
    requested_action: str
    confidence: float
    safety: float
    reasons: List[str]
    warnings: List[str]
    requested_by: str
    requested_at: str
    expires_at: str
    status: str  # PENDING, APPROVED, REJECTED, EXPIRED
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_comment: Optional[str] = None

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class CanaryDeployment:
    """Canary deployment state"""
    id: str
    workflow_id: str
    finding_id: str
    resource_id: str
    total_instances: int
    canary_percentage: int
    current_percentage: int
    stages: List[Dict]  # [{percentage: 10, status: COMPLETED}, ...]
    health_checks_passed: int
    health_checks_failed: int
    started_at: str
    last_stage_at: Optional[str] = None
    promoted_at: Optional[str] = None
    status: str = "DEPLOYING"

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class Workflow:
    """Remediation workflow state"""
    id: str
    finding_id: str
    resource_type: str
    resource_id: str
    workflow_type: WorkflowType
    status: WorkflowStatus
    decision: Dict  # Original decision from engine
    created_at: str
    updated_at: str
    scheduled_for: Optional[str] = None
    approval: Optional[ApprovalRequest] = None
    canary: Optional[CanaryDeployment] = None
    health_report: Optional[Dict] = None
    execution_result: Optional[Dict] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict:
        result = {
            "id": self.id,
            "finding_id": self.finding_id,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "workflow_type": self.workflow_type.value,
            "status": self.status.value,
            "decision": self.decision,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "scheduled_for": self.scheduled_for,
            "approval": self.approval.to_dict() if self.approval else None,
            "canary": self.canary.to_dict() if self.canary else None,
            "health_report": self.health_report,
            "execution_result": self.execution_result,
            "error": self.error,
        }
        return result


# =============================================================================
# WORKFLOW ORCHESTRATOR
# =============================================================================

class WorkflowOrchestrator:
    """
    Orchestrates remediation workflows.

    Usage:
        orchestrator = WorkflowOrchestrator()

        # Create workflow based on decision
        workflow = await orchestrator.create_workflow(finding_id, resource, decision)

        # For approval workflows
        await orchestrator.approve(workflow.id, approved_by="admin@company.com")

        # For canary workflows
        await orchestrator.advance_canary(workflow.id)

        # Get status
        status = orchestrator.get_workflow(workflow.id)
    """

    def __init__(
        self,
        approval_timeout_hours: int = 24,
        canary_stages: List[int] = None,
        canary_monitoring_minutes: int = 5,
        change_window_hours: tuple = (6, 22),  # 6 AM to 10 PM
    ):
        self.approval_timeout_hours = approval_timeout_hours
        self.canary_stages = canary_stages or [10, 25, 50, 100]
        self.canary_monitoring_minutes = canary_monitoring_minutes
        self.change_window = change_window_hours

        # In-memory storage (use DB in production)
        self._workflows: Dict[str, Workflow] = {}
        self._approvals: Dict[str, ApprovalRequest] = {}
        self._canaries: Dict[str, CanaryDeployment] = {}

        # Callbacks
        self._on_execute: Optional[Callable] = None
        self._on_rollback: Optional[Callable] = None
        self._on_health_check: Optional[Callable] = None

    def set_callbacks(
        self,
        on_execute: Callable = None,
        on_rollback: Callable = None,
        on_health_check: Callable = None,
    ):
        """Set callback functions for workflow actions"""
        self._on_execute = on_execute
        self._on_rollback = on_rollback
        self._on_health_check = on_health_check

    # =========================================================================
    # WORKFLOW CREATION
    # =========================================================================

    async def create_workflow(
        self,
        finding_id: str,
        resource_type: str,
        resource_id: str,
        decision: Dict,
        requested_by: str = "system",
        scheduled_for: str = None,
    ) -> Workflow:
        """
        Create a workflow based on decision engine output.

        Args:
            finding_id: Security finding ID
            resource_type: Type of resource
            resource_id: Resource identifier
            decision: Decision from RemediationDecisionEngine
            requested_by: User/system that requested remediation
            scheduled_for: ISO timestamp for scheduled execution

        Returns:
            Created Workflow
        """
        workflow_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat() + "Z"

        # Determine workflow type from decision
        action = decision.get("action", "BLOCK")
        workflow_type = self._action_to_workflow_type(action)

        # Create workflow
        workflow = Workflow(
            id=workflow_id,
            finding_id=finding_id,
            resource_type=resource_type,
            resource_id=resource_id,
            workflow_type=workflow_type,
            status=WorkflowStatus.PENDING,
            decision=decision,
            created_at=now,
            updated_at=now,
            scheduled_for=scheduled_for,
        )

        # Handle different workflow types
        if workflow_type == WorkflowType.REQUIRE_APPROVAL:
            workflow.approval = self._create_approval(workflow, requested_by)
            workflow.status = WorkflowStatus.AWAITING_APPROVAL

        elif workflow_type == WorkflowType.CANARY:
            workflow.canary = self._create_canary(workflow)
            workflow.status = WorkflowStatus.CANARY_DEPLOYING

        elif workflow_type == WorkflowType.AUTO_REMEDIATE:
            if scheduled_for and not self._in_change_window():
                workflow.status = WorkflowStatus.PENDING
            else:
                # Execute immediately
                workflow = await self._execute_remediation(workflow)

        self._workflows[workflow_id] = workflow
        logger.info(f"Workflow created: {workflow_id} ({workflow_type.value})")

        return workflow

    def _action_to_workflow_type(self, action: str) -> WorkflowType:
        """Convert decision action to workflow type"""
        mapping = {
            "AUTO_REMEDIATE": WorkflowType.AUTO_REMEDIATE,
            "CANARY": WorkflowType.CANARY,
            "REQUIRE_APPROVAL": WorkflowType.REQUIRE_APPROVAL,
            "BLOCK": WorkflowType.REQUIRE_APPROVAL,  # Blocked actions need approval
        }
        return mapping.get(action, WorkflowType.REQUIRE_APPROVAL)

    # =========================================================================
    # APPROVAL WORKFLOW
    # =========================================================================

    def _create_approval(self, workflow: Workflow, requested_by: str) -> ApprovalRequest:
        """Create approval request"""
        approval_id = str(uuid.uuid4())
        now = datetime.utcnow()
        expires = now + timedelta(hours=self.approval_timeout_hours)

        approval = ApprovalRequest(
            id=approval_id,
            workflow_id=workflow.id,
            finding_id=workflow.finding_id,
            resource_type=workflow.resource_type,
            resource_id=workflow.resource_id,
            requested_action=workflow.decision.get("action", "UNKNOWN"),
            confidence=workflow.decision.get("confidence", 0),
            safety=workflow.decision.get("safety", 0),
            reasons=workflow.decision.get("reasons", []),
            warnings=workflow.decision.get("warnings", []),
            requested_by=requested_by,
            requested_at=now.isoformat() + "Z",
            expires_at=expires.isoformat() + "Z",
            status="PENDING",
        )

        self._approvals[approval_id] = approval
        return approval

    async def approve(
        self,
        workflow_id: str,
        approved_by: str,
        comment: str = None,
    ) -> Workflow:
        """
        Approve a workflow pending approval.

        Args:
            workflow_id: Workflow to approve
            approved_by: Approver identifier (email)
            comment: Optional approval comment

        Returns:
            Updated Workflow
        """
        workflow = self._workflows.get(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow not found: {workflow_id}")

        if workflow.status != WorkflowStatus.AWAITING_APPROVAL:
            raise ValueError(f"Workflow not awaiting approval: {workflow.status}")

        if workflow.approval:
            workflow.approval.status = "APPROVED"
            workflow.approval.reviewed_by = approved_by
            workflow.approval.reviewed_at = datetime.utcnow().isoformat() + "Z"
            workflow.approval.review_comment = comment

        workflow.status = WorkflowStatus.APPROVED
        workflow.updated_at = datetime.utcnow().isoformat() + "Z"

        # Execute the remediation
        workflow = await self._execute_remediation(workflow)

        logger.info(f"Workflow approved: {workflow_id} by {approved_by}")
        return workflow

    async def reject(
        self,
        workflow_id: str,
        rejected_by: str,
        reason: str = None,
    ) -> Workflow:
        """Reject a workflow"""
        workflow = self._workflows.get(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow not found: {workflow_id}")

        if workflow.approval:
            workflow.approval.status = "REJECTED"
            workflow.approval.reviewed_by = rejected_by
            workflow.approval.reviewed_at = datetime.utcnow().isoformat() + "Z"
            workflow.approval.review_comment = reason

        workflow.status = WorkflowStatus.REJECTED
        workflow.updated_at = datetime.utcnow().isoformat() + "Z"

        logger.info(f"Workflow rejected: {workflow_id} by {rejected_by}")
        return workflow

    def get_pending_approvals(self) -> List[ApprovalRequest]:
        """Get all pending approval requests"""
        return [a for a in self._approvals.values() if a.status == "PENDING"]

    # =========================================================================
    # CANARY WORKFLOW
    # =========================================================================

    def _create_canary(self, workflow: Workflow) -> CanaryDeployment:
        """Create canary deployment"""
        canary_id = str(uuid.uuid4())
        stages = [{"percentage": p, "status": "PENDING"} for p in self.canary_stages]

        canary = CanaryDeployment(
            id=canary_id,
            workflow_id=workflow.id,
            finding_id=workflow.finding_id,
            resource_id=workflow.resource_id,
            total_instances=1,  # For IAM, usually 1 role
            canary_percentage=self.canary_stages[0],
            current_percentage=0,
            stages=stages,
            health_checks_passed=0,
            health_checks_failed=0,
            started_at=datetime.utcnow().isoformat() + "Z",
        )

        self._canaries[canary_id] = canary
        return canary

    async def advance_canary(self, workflow_id: str) -> Workflow:
        """
        Advance canary to next stage.

        Call this after monitoring shows healthy status.
        """
        workflow = self._workflows.get(workflow_id)
        if not workflow or not workflow.canary:
            raise ValueError(f"Canary workflow not found: {workflow_id}")

        canary = workflow.canary

        # Find current stage index
        current_idx = -1
        for i, stage in enumerate(canary.stages):
            if stage["status"] == "IN_PROGRESS":
                current_idx = i
                break
            elif stage["status"] == "PENDING":
                current_idx = i
                break

        if current_idx == -1 or current_idx >= len(canary.stages):
            # All stages complete
            workflow.status = WorkflowStatus.COMPLETED
            canary.status = "COMPLETED"
            canary.promoted_at = datetime.utcnow().isoformat() + "Z"
            return workflow

        # Run health check before advancing
        if self._on_health_check:
            health_result = await self._on_health_check(
                workflow.resource_type,
                workflow.resource_id,
            )
            if health_result.get("should_rollback"):
                canary.health_checks_failed += 1
                if canary.health_checks_failed >= 2:
                    workflow = await self._rollback(workflow, "Canary health check failed")
                    return workflow
            else:
                canary.health_checks_passed += 1

        # Mark current stage complete
        canary.stages[current_idx]["status"] = "COMPLETED"
        canary.current_percentage = canary.stages[current_idx]["percentage"]
        canary.last_stage_at = datetime.utcnow().isoformat() + "Z"

        # Check if promotion complete
        if canary.current_percentage >= 100:
            workflow.status = WorkflowStatus.COMPLETED
            canary.status = "COMPLETED"
            canary.promoted_at = datetime.utcnow().isoformat() + "Z"
            logger.info(f"Canary promoted to 100%: {workflow_id}")
        else:
            # Start next stage
            next_idx = current_idx + 1
            if next_idx < len(canary.stages):
                canary.stages[next_idx]["status"] = "IN_PROGRESS"
                canary.canary_percentage = canary.stages[next_idx]["percentage"]
                workflow.status = WorkflowStatus.CANARY_MONITORING
                logger.info(f"Canary advanced to {canary.canary_percentage}%: {workflow_id}")

        workflow.updated_at = datetime.utcnow().isoformat() + "Z"
        return workflow

    async def start_canary(self, workflow_id: str) -> Workflow:
        """Start canary deployment (execute first stage)"""
        workflow = self._workflows.get(workflow_id)
        if not workflow or not workflow.canary:
            raise ValueError(f"Canary workflow not found: {workflow_id}")

        # Execute remediation for first canary stage
        if self._on_execute:
            result = await self._on_execute(
                workflow.finding_id,
                workflow.resource_id,
                canary_percentage=workflow.canary.canary_percentage,
            )
            workflow.execution_result = result

        workflow.canary.stages[0]["status"] = "IN_PROGRESS"
        workflow.status = WorkflowStatus.CANARY_MONITORING
        workflow.updated_at = datetime.utcnow().isoformat() + "Z"

        logger.info(f"Canary started at {workflow.canary.canary_percentage}%: {workflow_id}")
        return workflow

    # =========================================================================
    # EXECUTION & ROLLBACK
    # =========================================================================

    async def _execute_remediation(self, workflow: Workflow) -> Workflow:
        """Execute the actual remediation"""
        workflow.status = WorkflowStatus.EXECUTING
        workflow.updated_at = datetime.utcnow().isoformat() + "Z"

        try:
            if self._on_execute:
                result = await self._on_execute(
                    workflow.finding_id,
                    workflow.resource_id,
                )
                workflow.execution_result = result

            # Run health check
            workflow.status = WorkflowStatus.HEALTH_CHECK
            if self._on_health_check:
                health_result = await self._on_health_check(
                    workflow.resource_type,
                    workflow.resource_id,
                )
                workflow.health_report = health_result

                if health_result.get("should_rollback"):
                    workflow = await self._rollback(
                        workflow,
                        health_result.get("rollback_reason", "Health check failed")
                    )
                    return workflow

            workflow.status = WorkflowStatus.COMPLETED
            logger.info(f"Remediation completed: {workflow.id}")

        except Exception as e:
            workflow.status = WorkflowStatus.FAILED
            workflow.error = str(e)
            logger.error(f"Remediation failed: {workflow.id} - {e}")

        workflow.updated_at = datetime.utcnow().isoformat() + "Z"
        return workflow

    async def _rollback(self, workflow: Workflow, reason: str) -> Workflow:
        """Rollback a remediation"""
        logger.warning(f"Rolling back workflow: {workflow.id} - {reason}")

        if self._on_rollback:
            try:
                await self._on_rollback(
                    workflow.finding_id,
                    workflow.resource_id,
                )
            except Exception as e:
                logger.error(f"Rollback failed: {e}")
                workflow.error = f"Rollback failed: {e}"

        workflow.status = WorkflowStatus.ROLLED_BACK
        workflow.error = reason
        workflow.updated_at = datetime.utcnow().isoformat() + "Z"

        return workflow

    async def rollback(self, workflow_id: str, reason: str = "Manual rollback") -> Workflow:
        """Manually trigger rollback"""
        workflow = self._workflows.get(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow not found: {workflow_id}")

        return await self._rollback(workflow, reason)

    # =========================================================================
    # CHANGE WINDOW
    # =========================================================================

    def _in_change_window(self) -> bool:
        """Check if current time is within change window"""
        now = datetime.utcnow()
        start_hour, end_hour = self.change_window
        return start_hour <= now.hour < end_hour

    # =========================================================================
    # QUERIES
    # =========================================================================

    def get_workflow(self, workflow_id: str) -> Optional[Workflow]:
        """Get workflow by ID"""
        return self._workflows.get(workflow_id)

    def get_workflows_by_status(self, status: WorkflowStatus) -> List[Workflow]:
        """Get all workflows with given status"""
        return [w for w in self._workflows.values() if w.status == status]

    def get_active_workflows(self) -> List[Workflow]:
        """Get all non-terminal workflows"""
        terminal = {
            WorkflowStatus.COMPLETED,
            WorkflowStatus.FAILED,
            WorkflowStatus.ROLLED_BACK,
            WorkflowStatus.REJECTED,
            WorkflowStatus.EXPIRED,
        }
        return [w for w in self._workflows.values() if w.status not in terminal]


# =============================================================================
# HELPER FUNCTIONS FOR BACKEND INTEGRATION
# =============================================================================

# Global orchestrator instance
_orchestrator: Optional[WorkflowOrchestrator] = None


def get_orchestrator() -> WorkflowOrchestrator:
    """Get or create the global orchestrator instance"""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = WorkflowOrchestrator()
    return _orchestrator


async def create_remediation_workflow(
    finding_id: str,
    resource_type: str,
    resource_id: str,
    decision: Dict,
    requested_by: str = "system",
) -> Dict:
    """
    Create a remediation workflow.

    This is the main function to call from the API endpoint.

    Returns:
        Dict with workflow details
    """
    try:
        orchestrator = get_orchestrator()
        workflow = await orchestrator.create_workflow(
            finding_id=finding_id,
            resource_type=resource_type,
            resource_id=resource_id,
            decision=decision,
            requested_by=requested_by,
        )
        return workflow.to_dict()
    except Exception as e:
        logger.error(f"Failed to create workflow: {e}")
        return {"error": str(e)}


async def approve_workflow(workflow_id: str, approved_by: str, comment: str = None) -> Dict:
    """Approve a workflow"""
    orchestrator = get_orchestrator()
    workflow = await orchestrator.approve(workflow_id, approved_by, comment)
    return workflow.to_dict()


async def reject_workflow(workflow_id: str, rejected_by: str, reason: str = None) -> Dict:
    """Reject a workflow"""
    orchestrator = get_orchestrator()
    workflow = await orchestrator.reject(workflow_id, rejected_by, reason)
    return workflow.to_dict()


async def advance_canary_workflow(workflow_id: str) -> Dict:
    """Advance canary to next stage"""
    orchestrator = get_orchestrator()
    workflow = await orchestrator.advance_canary(workflow_id)
    return workflow.to_dict()


def get_pending_approvals() -> List[Dict]:
    """Get all pending approval requests"""
    orchestrator = get_orchestrator()
    return [a.to_dict() for a in orchestrator.get_pending_approvals()]


# =============================================================================
# USAGE EXAMPLE
# =============================================================================

if __name__ == "__main__":
    """
    Example usage:

    $ python workflow_orchestrator.py
    """
    import asyncio

    async def test():
        print("Testing Workflow Orchestrator...")

        orchestrator = WorkflowOrchestrator()

        # Test approval workflow
        decision = {
            "action": "REQUIRE_APPROVAL",
            "confidence": 0.72,
            "safety": 0.68,
            "reasons": ["Production resource", "Shared by multiple services"],
            "warnings": ["May affect 3 dependent services"],
        }

        workflow = await orchestrator.create_workflow(
            finding_id="finding-123",
            resource_type="IAMRole",
            resource_id="prod-api-role",
            decision=decision,
            requested_by="security-scanner",
        )

        print(f"\nCreated Workflow:")
        print(f"  ID: {workflow.id}")
        print(f"  Type: {workflow.workflow_type.value}")
        print(f"  Status: {workflow.status.value}")

        if workflow.approval:
            print(f"  Approval ID: {workflow.approval.id}")
            print(f"  Expires: {workflow.approval.expires_at}")

        # Approve workflow
        print("\nApproving workflow...")
        workflow = await orchestrator.approve(
            workflow.id,
            approved_by="admin@company.com",
            comment="Reviewed and safe to proceed"
        )

        print(f"  New Status: {workflow.status.value}")

        # Test canary workflow
        print("\n--- Testing Canary Workflow ---")

        canary_decision = {
            "action": "CANARY",
            "confidence": 0.82,
            "safety": 0.78,
            "reasons": ["Moderate confidence", "Gradual rollout recommended"],
            "warnings": [],
        }

        canary_workflow = await orchestrator.create_workflow(
            finding_id="finding-456",
            resource_type="IAMRole",
            resource_id="staging-role",
            decision=canary_decision,
        )

        print(f"\nCanary Workflow:")
        print(f"  ID: {canary_workflow.id}")
        print(f"  Status: {canary_workflow.status.value}")
        print(f"  Current %: {canary_workflow.canary.current_percentage}")
        print(f"  Stages: {[s['percentage'] for s in canary_workflow.canary.stages]}")

        # Start canary
        canary_workflow = await orchestrator.start_canary(canary_workflow.id)
        print(f"\nAfter start:")
        print(f"  Status: {canary_workflow.status.value}")

        # Advance canary
        for i in range(3):
            canary_workflow = await orchestrator.advance_canary(canary_workflow.id)
            print(f"  Advanced to: {canary_workflow.canary.current_percentage}%")

        print(f"\nFinal Status: {canary_workflow.status.value}")

    asyncio.run(test())
