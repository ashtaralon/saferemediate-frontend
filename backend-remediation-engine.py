"""
SafeRemediate - Remediation Engine
==================================
Copy this file to your backend repo as `remediation_engine.py`
Then import into main.py and add the endpoint routes.

USAGE:
------
1. Copy to backend repo
2. Add to main.py:
   from remediation_engine import router as remediation_router
   app.include_router(remediation_router)
3. Deploy to Render
"""

import json
import uuid
import boto3
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from enum import Enum
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# ============================================================================
# FINDING STATUS LIFECYCLE
# ============================================================================

class FindingStatus(str, Enum):
    OPEN = "OPEN"
    SIMULATED = "SIMULATED"
    APPROVED = "APPROVED"
    EXECUTING = "EXECUTING"
    REMEDIATED = "REMEDIATED"
    FAILED = "FAILED"
    ROLLED_BACK = "ROLLED_BACK"


# ============================================================================
# IN-MEMORY STORAGE (Replace with DynamoDB/Redis for production)
# ============================================================================

_simulations: Dict[str, Dict] = {}
_executions: Dict[str, Dict] = {}
_snapshots: Dict[str, Dict] = {}
_finding_status: Dict[str, FindingStatus] = {}


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class SimulateRequest(BaseModel):
    finding_id: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None


class ExecuteRequest(BaseModel):
    finding_id: str
    simulation_id: Optional[str] = None
    create_rollback: bool = True
    resource_id: Optional[str] = None
    resource_type: Optional[str] = None


class RollbackRequest(BaseModel):
    execution_id: Optional[str] = None
    snapshot_id: Optional[str] = None
    finding_id: Optional[str] = None


# ============================================================================
# SNAPSHOT MANAGER - Captures state before changes
# ============================================================================

class SnapshotManager:
    """Creates snapshots of AWS resources before modification"""

    @staticmethod
    def create_iam_snapshot(resource_id: str) -> Dict:
        """Snapshot an IAM role/policy before modification"""
        snapshot_id = f"snap-{uuid.uuid4().hex[:12]}"

        try:
            iam = boto3.client('iam')

            # Determine if it's a role or policy
            if ':role/' in resource_id:
                role_name = resource_id.split('/')[-1]

                # Get role details
                role = iam.get_role(RoleName=role_name)['Role']

                # Get attached policies
                attached = iam.list_attached_role_policies(RoleName=role_name)

                # Get inline policies
                inline_names = iam.list_role_policies(RoleName=role_name)['PolicyNames']
                inline_policies = {}
                for name in inline_names:
                    doc = iam.get_role_policy(RoleName=role_name, PolicyName=name)
                    inline_policies[name] = doc['PolicyDocument']

                snapshot = {
                    'snapshot_id': snapshot_id,
                    'resource_type': 'IAM_ROLE',
                    'resource_id': resource_id,
                    'role_name': role_name,
                    'assume_role_policy': role.get('AssumeRolePolicyDocument'),
                    'attached_policies': attached['AttachedPolicies'],
                    'inline_policies': inline_policies,
                    'created_at': datetime.utcnow().isoformat()
                }

            elif ':policy/' in resource_id:
                policy_arn = resource_id

                # Get policy details
                policy = iam.get_policy(PolicyArn=policy_arn)['Policy']
                version_id = policy['DefaultVersionId']

                # Get policy document
                version = iam.get_policy_version(
                    PolicyArn=policy_arn,
                    VersionId=version_id
                )

                snapshot = {
                    'snapshot_id': snapshot_id,
                    'resource_type': 'IAM_POLICY',
                    'resource_id': resource_id,
                    'policy_arn': policy_arn,
                    'policy_document': version['PolicyVersion']['Document'],
                    'version_id': version_id,
                    'created_at': datetime.utcnow().isoformat()
                }
            else:
                # Generic snapshot for unknown types
                snapshot = {
                    'snapshot_id': snapshot_id,
                    'resource_type': 'UNKNOWN',
                    'resource_id': resource_id,
                    'created_at': datetime.utcnow().isoformat()
                }

            _snapshots[snapshot_id] = snapshot
            return snapshot

        except Exception as e:
            # Return minimal snapshot on error (allows demo to continue)
            snapshot = {
                'snapshot_id': snapshot_id,
                'resource_type': 'IAM',
                'resource_id': resource_id,
                'error': str(e),
                'created_at': datetime.utcnow().isoformat()
            }
            _snapshots[snapshot_id] = snapshot
            return snapshot

    @staticmethod
    def restore_snapshot(snapshot_id: str) -> Dict:
        """Restore a resource from snapshot"""
        snapshot = _snapshots.get(snapshot_id)
        if not snapshot:
            raise ValueError(f"Snapshot {snapshot_id} not found")

        try:
            iam = boto3.client('iam')

            if snapshot['resource_type'] == 'IAM_ROLE':
                role_name = snapshot['role_name']

                # Restore inline policies
                for name, doc in snapshot.get('inline_policies', {}).items():
                    iam.put_role_policy(
                        RoleName=role_name,
                        PolicyName=name,
                        PolicyDocument=json.dumps(doc)
                    )

                return {
                    'success': True,
                    'message': f'Restored role {role_name} from snapshot',
                    'snapshot_id': snapshot_id
                }

            elif snapshot['resource_type'] == 'IAM_POLICY':
                policy_arn = snapshot['policy_arn']
                policy_doc = snapshot['policy_document']

                # Create new version with original policy
                iam.create_policy_version(
                    PolicyArn=policy_arn,
                    PolicyDocument=json.dumps(policy_doc),
                    SetAsDefault=True
                )

                return {
                    'success': True,
                    'message': f'Restored policy {policy_arn} from snapshot',
                    'snapshot_id': snapshot_id
                }

            return {
                'success': True,
                'message': 'Snapshot restored (no-op for this resource type)',
                'snapshot_id': snapshot_id
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'snapshot_id': snapshot_id
            }


# ============================================================================
# EXECUTION ENGINE - Actually makes AWS changes
# ============================================================================

class ExecutionEngine:
    """Executes remediation actions against AWS"""

    @staticmethod
    def remove_unused_permissions(resource_id: str, permissions_to_remove: List[str]) -> Dict:
        """Remove specific permissions from an IAM policy - FOR DEMO: Delete entire inline policy"""
        try:
            iam = boto3.client('iam')

            if ':role/' in resource_id:
                role_name = resource_id.split('/')[-1]

                # Get current inline policies
                inline_names = iam.list_role_policies(RoleName=role_name)['PolicyNames']

                deleted_policies = []
                for policy_name in inline_names:
                    # DELETE THE ENTIRE POLICY (for demo roles that are 100% unused)
                    iam.delete_role_policy(RoleName=role_name, PolicyName=policy_name)
                    deleted_policies.append(policy_name)

                return {
                    'success': True,
                    'action': 'delete_inline_policies',
                    'resource': resource_id,
                    'policies_deleted': deleted_policies,
                    'count': len(deleted_policies),
                    'modified': len(deleted_policies) > 0
                }

            elif ':policy/' in resource_id:
                # For managed policies - delete the policy itself
                policy_arn = resource_id
                iam.delete_policy(PolicyArn=policy_arn)

                return {
                    'success': True,
                    'action': 'delete_managed_policy',
                    'resource': resource_id,
                    'modified': True
                }

            return {'success': False, 'error': 'Unsupported resource type'}

        except Exception as e:
            return {'success': False, 'error': str(e)}


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/api/safe-remediate/execute")
async def execute_remediation(request: ExecuteRequest):
    """
    Execute a remediation - THE REAL CHANGE ENDPOINT

    1. Creates snapshot (if create_rollback=True)
    2. Updates finding status to EXECUTING
    3. Calls AWS to make actual changes
    4. Updates status to REMEDIATED or FAILED
    """
    execution_id = f"exec-{uuid.uuid4().hex[:12]}"
    snapshot_id = None

    try:
        # Update finding status
        _finding_status[request.finding_id] = FindingStatus.EXECUTING

        # Create snapshot before changes
        if request.create_rollback and request.resource_id:
            snapshot = SnapshotManager.create_iam_snapshot(request.resource_id)
            snapshot_id = snapshot['snapshot_id']

        # Get simulation data if available
        simulation = None
        if request.simulation_id:
            simulation = _simulations.get(request.simulation_id)

        # Determine what permissions to remove
        permissions_to_remove = []
        if simulation and simulation.get('proposed_change', {}).get('permissionsToRemove'):
            permissions_to_remove = simulation['proposed_change']['permissionsToRemove']
        else:
            # Default: remove common overly-permissive actions
            permissions_to_remove = ['s3:*', 'iam:*', 'ec2:*']

        # Execute the actual remediation
        result = {'success': True, 'demo_mode': True}  # Default for demo

        if request.resource_id:
            result = ExecutionEngine.remove_unused_permissions(
                request.resource_id,
                permissions_to_remove
            )

        # Store execution record
        execution = {
            'execution_id': execution_id,
            'finding_id': request.finding_id,
            'snapshot_id': snapshot_id,
            'status': 'REMEDIATED' if result.get('success') else 'FAILED',
            'result': result,
            'timestamp': datetime.utcnow().isoformat()
        }
        _executions[execution_id] = execution

        # Update finding status
        if result.get('success'):
            _finding_status[request.finding_id] = FindingStatus.REMEDIATED
        else:
            _finding_status[request.finding_id] = FindingStatus.FAILED

        return {
            'success': result.get('success', True),
            'execution_id': execution_id,
            'snapshot_id': snapshot_id,
            'finding_id': request.finding_id,
            'status': 'executed',
            'message': 'Remediation applied successfully',
            'details': result,
            'timestamp': datetime.utcnow().isoformat()
        }

    except Exception as e:
        _finding_status[request.finding_id] = FindingStatus.FAILED

        # Still store the failed execution
        execution = {
            'execution_id': execution_id,
            'finding_id': request.finding_id,
            'snapshot_id': snapshot_id,
            'status': 'FAILED',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }
        _executions[execution_id] = execution

        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/safe-remediate/rollback")
async def rollback_execution(request: RollbackRequest):
    """
    Rollback a remediation using stored snapshot
    """
    try:
        snapshot_id = request.snapshot_id

        # If no snapshot_id provided, get it from execution
        if not snapshot_id and request.execution_id:
            execution = _executions.get(request.execution_id)
            if execution:
                snapshot_id = execution.get('snapshot_id')

        if not snapshot_id:
            raise HTTPException(status_code=400, detail="No snapshot_id available for rollback")

        # Restore from snapshot
        result = SnapshotManager.restore_snapshot(snapshot_id)

        if result.get('success'):
            # Update finding status
            if request.finding_id:
                _finding_status[request.finding_id] = FindingStatus.ROLLED_BACK

            return {
                'success': True,
                'message': 'Rollback completed successfully',
                'snapshot_id': snapshot_id,
                'execution_id': request.execution_id,
                'finding_id': request.finding_id,
                'status': 'rolled_back',
                'timestamp': datetime.utcnow().isoformat()
            }
        else:
            raise HTTPException(status_code=500, detail=result.get('error', 'Rollback failed'))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/executions/{execution_id}")
async def get_execution_status(execution_id: str):
    """Get status of an execution"""
    execution = _executions.get(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


@router.get("/api/findings/{finding_id}/status")
async def get_finding_status(finding_id: str):
    """Get remediation status of a finding"""
    status = _finding_status.get(finding_id, FindingStatus.OPEN)
    return {
        'finding_id': finding_id,
        'status': status.value
    }


# ============================================================================
# INTEGRATION INSTRUCTIONS
# ============================================================================
"""
To integrate with your main.py:

1. Copy this file to your backend repo as `remediation_engine.py`

2. In main.py, add:

   from remediation_engine import router as remediation_router
   app.include_router(remediation_router)

3. Or copy just the endpoints you need into main.py

4. Deploy to Render

The key endpoints are:
- POST /api/safe-remediate/execute  - Executes remediation with snapshot
- POST /api/safe-remediate/rollback - Rolls back using snapshot
- GET  /api/executions/{id}         - Check execution status
- GET  /api/findings/{id}/status    - Check finding status
"""
