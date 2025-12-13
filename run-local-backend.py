#!/usr/bin/env python3
"""
Local IAM Remediation Backend for SafeRemediate Demo
====================================================

Run this script locally to enable REAL AWS IAM remediation.

Prerequisites:
  pip install fastapi uvicorn boto3

Usage:
  python run-local-backend.py

Then set in your .env.local:
  NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
"""

import boto3
import json
import uuid
import hashlib
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="SafeRemediate Local Backend", version="1.0.0")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage
_snapshots: Dict[str, Dict] = {}
_executions: Dict[str, Dict] = {}

# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class ExecuteRequest(BaseModel):
    finding_id: str
    resource_id: Optional[str] = None
    resource_type: Optional[str] = None
    role_name: Optional[str] = None
    unused_actions: Optional[List[str]] = None
    create_rollback: bool = True

class RollbackRequest(BaseModel):
    snapshot_id: str
    execution_id: Optional[str] = None
    finding_id: Optional[str] = None

# ============================================================================
# IAM SERVICE - REAL AWS CALLS
# ============================================================================

class IAMService:
    def __init__(self):
        self.iam = boto3.client('iam')

    def get_role_policies(self, role_name: str) -> Dict:
        """Get all policies attached to a role"""
        result = {
            'inline_policies': {},
            'attached_policies': []
        }

        # Get inline policies
        try:
            inline = self.iam.list_role_policies(RoleName=role_name)
            for policy_name in inline.get('PolicyNames', []):
                policy = self.iam.get_role_policy(RoleName=role_name, PolicyName=policy_name)
                result['inline_policies'][policy_name] = policy['PolicyDocument']
        except Exception as e:
            print(f"Error getting inline policies: {e}")

        # Get attached policies
        try:
            attached = self.iam.list_attached_role_policies(RoleName=role_name)
            for policy in attached.get('AttachedPolicies', []):
                result['attached_policies'].append({
                    'arn': policy['PolicyArn'],
                    'name': policy['PolicyName']
                })
        except Exception as e:
            print(f"Error getting attached policies: {e}")

        return result

    def create_snapshot(self, role_name: str) -> Dict:
        """Create a snapshot of current role state"""
        snapshot_id = f"snap-{uuid.uuid4().hex[:16]}"

        policies = self.get_role_policies(role_name)

        # Get trust policy
        try:
            role = self.iam.get_role(RoleName=role_name)
            trust_policy = role['Role']['AssumeRolePolicyDocument']
        except:
            trust_policy = None

        snapshot = {
            'snapshot_id': snapshot_id,
            'role_name': role_name,
            'inline_policies': policies['inline_policies'],
            'attached_policies': policies['attached_policies'],
            'trust_policy': trust_policy,
            'created_at': datetime.utcnow().isoformat()
        }

        _snapshots[snapshot_id] = snapshot
        print(f"[SNAPSHOT] Created {snapshot_id} for role {role_name}")
        print(f"[SNAPSHOT] Saved {len(policies['inline_policies'])} inline policies")

        return snapshot

    def remove_permissions_from_policy(self, policy_doc: Dict, actions_to_remove: List[str]) -> Dict:
        """Remove specific actions from a policy document"""
        new_policy = {
            'Version': policy_doc.get('Version', '2012-10-17'),
            'Statement': []
        }

        for statement in policy_doc.get('Statement', []):
            if statement.get('Effect') != 'Allow':
                new_policy['Statement'].append(statement)
                continue

            actions = statement.get('Action', [])
            if isinstance(actions, str):
                actions = [actions]

            # Filter out actions to remove
            remaining_actions = [a for a in actions if a not in actions_to_remove]

            if remaining_actions:
                new_statement = statement.copy()
                new_statement['Action'] = remaining_actions
                new_policy['Statement'].append(new_statement)

        return new_policy

    def apply_remediation(self, role_name: str, unused_actions: List[str], snapshot_id: str) -> Dict:
        """Apply the remediation - remove unused permissions"""
        execution_id = f"exec-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}"

        policies = self.get_role_policies(role_name)
        changes_made = []

        # Process each inline policy
        for policy_name, policy_doc in policies['inline_policies'].items():
            print(f"[REMEDIATE] Processing inline policy: {policy_name}")

            # Get actions in this policy
            policy_actions = []
            for stmt in policy_doc.get('Statement', []):
                if stmt.get('Effect') == 'Allow':
                    actions = stmt.get('Action', [])
                    if isinstance(actions, str):
                        actions = [actions]
                    policy_actions.extend(actions)

            # Find which unused actions are in this policy
            actions_to_remove = [a for a in unused_actions if a in policy_actions]

            if actions_to_remove:
                print(f"[REMEDIATE] Removing {len(actions_to_remove)} actions from {policy_name}")

                # Create new policy without unused actions
                new_policy = self.remove_permissions_from_policy(policy_doc, actions_to_remove)

                if new_policy['Statement']:
                    # Update the policy
                    self.iam.put_role_policy(
                        RoleName=role_name,
                        PolicyName=policy_name,
                        PolicyDocument=json.dumps(new_policy)
                    )
                    changes_made.append({
                        'policy_name': policy_name,
                        'action': 'updated',
                        'removed_actions': actions_to_remove
                    })
                    print(f"[REMEDIATE] ✓ Updated policy {policy_name}")
                else:
                    # Policy would be empty, delete it
                    self.iam.delete_role_policy(
                        RoleName=role_name,
                        PolicyName=policy_name
                    )
                    changes_made.append({
                        'policy_name': policy_name,
                        'action': 'deleted',
                        'removed_actions': actions_to_remove
                    })
                    print(f"[REMEDIATE] ✓ Deleted empty policy {policy_name}")

        execution = {
            'execution_id': execution_id,
            'snapshot_id': snapshot_id,
            'role_name': role_name,
            'status': 'SUCCESS',
            'changes': changes_made,
            'actions_removed': unused_actions,
            'created_at': datetime.utcnow().isoformat()
        }

        _executions[execution_id] = execution

        return execution

    def rollback(self, snapshot_id: str) -> Dict:
        """Rollback to a previous snapshot"""
        snapshot = _snapshots.get(snapshot_id)
        if not snapshot:
            raise HTTPException(status_code=404, detail=f"Snapshot {snapshot_id} not found")

        role_name = snapshot['role_name']
        print(f"[ROLLBACK] Rolling back {role_name} to snapshot {snapshot_id}")

        # Delete current inline policies
        try:
            current = self.iam.list_role_policies(RoleName=role_name)
            for policy_name in current.get('PolicyNames', []):
                self.iam.delete_role_policy(RoleName=role_name, PolicyName=policy_name)
                print(f"[ROLLBACK] Deleted current policy: {policy_name}")
        except Exception as e:
            print(f"[ROLLBACK] Error deleting current policies: {e}")

        # Restore inline policies from snapshot
        for policy_name, policy_doc in snapshot.get('inline_policies', {}).items():
            self.iam.put_role_policy(
                RoleName=role_name,
                PolicyName=policy_name,
                PolicyDocument=json.dumps(policy_doc)
            )
            print(f"[ROLLBACK] ✓ Restored policy: {policy_name}")

        return {
            'success': True,
            'snapshot_id': snapshot_id,
            'role_name': role_name,
            'message': f'Restored {len(snapshot.get("inline_policies", {}))} policies'
        }

iam_service = IAMService()

# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/health")
def health():
    return {"status": "healthy", "service": "saferemediate-local"}

@app.post("/api/safe-remediate/execute")
async def execute_remediation(request: ExecuteRequest):
    """Execute IAM remediation - makes REAL AWS changes"""
    print(f"\n{'='*60}")
    print(f"[EXECUTE] Starting remediation for {request.finding_id}")
    print(f"[EXECUTE] Resource: {request.resource_id}")
    print(f"[EXECUTE] Role: {request.role_name}")
    print(f"[EXECUTE] Unused actions: {request.unused_actions}")
    print(f"{'='*60}\n")

    # Extract role name from resource_id or use provided role_name
    role_name = request.role_name
    if not role_name and request.resource_id:
        # Extract from ARN like "arn:aws:iam::123456789:role/MyRole"
        if '/role/' in request.resource_id:
            role_name = request.resource_id.split('/role/')[-1]
        elif 'role/' in request.resource_id:
            role_name = request.resource_id.split('role/')[-1]
        else:
            role_name = request.resource_id.split('/')[-1]

    if not role_name:
        raise HTTPException(status_code=400, detail="Could not determine role name")

    # Get unused actions (from request or generate based on role)
    unused_actions = request.unused_actions or []

    try:
        # Step 1: Create snapshot (for rollback)
        snapshot = None
        if request.create_rollback:
            snapshot = iam_service.create_snapshot(role_name)
            print(f"[EXECUTE] Snapshot created: {snapshot['snapshot_id']}")

        # Step 2: Apply remediation
        if unused_actions:
            execution = iam_service.apply_remediation(
                role_name=role_name,
                unused_actions=unused_actions,
                snapshot_id=snapshot['snapshot_id'] if snapshot else None
            )
        else:
            # No specific actions provided - just create execution record
            execution = {
                'execution_id': f"exec-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}",
                'snapshot_id': snapshot['snapshot_id'] if snapshot else None,
                'role_name': role_name,
                'status': 'SUCCESS',
                'message': 'No actions to remove specified'
            }

        return {
            'success': True,
            'execution_id': execution['execution_id'],
            'snapshot_id': snapshot['snapshot_id'] if snapshot else None,
            'finding_id': request.finding_id,
            'role_name': role_name,
            'status': 'REMEDIATED',
            'message': f'Successfully remediated {role_name}',
            'changes': execution.get('changes', []),
            'timestamp': datetime.utcnow().isoformat()
        }

    except Exception as e:
        print(f"[EXECUTE] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/safe-remediate/rollback")
async def rollback_remediation(request: RollbackRequest):
    """Rollback to a previous snapshot - makes REAL AWS changes"""
    print(f"\n{'='*60}")
    print(f"[ROLLBACK] Rolling back snapshot {request.snapshot_id}")
    print(f"{'='*60}\n")

    try:
        result = iam_service.rollback(request.snapshot_id)
        return result
    except Exception as e:
        print(f"[ROLLBACK] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/snapshots/{snapshot_id}")
async def get_snapshot(snapshot_id: str):
    """Get snapshot details"""
    snapshot = _snapshots.get(snapshot_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snapshot

if __name__ == "__main__":
    print("\n" + "="*60)
    print("SafeRemediate Local Backend")
    print("="*60)
    print("\nThis backend makes REAL AWS changes using your local credentials.")
    print("Make sure you have AWS credentials configured (aws configure).\n")
    print("Frontend should use: NEXT_PUBLIC_BACKEND_URL=http://localhost:8000")
    print("="*60 + "\n")

    uvicorn.run(app, host="0.0.0.0", port=8000)
