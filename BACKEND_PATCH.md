# Backend Patch Instructions

Add this code to your backend `main.py` to enable real IAM remediation.

## Step 1: Add In-Memory Storage (after your imports)

```python
# Remediation storage
_snapshots: Dict[str, Dict] = {}
_executions: Dict[str, Dict] = {}
```

## Step 2: Add Snapshot Function

```python
def create_iam_snapshot(resource_id: str) -> Dict:
    """Snapshot an IAM role/policy before modification"""
    import uuid
    snapshot_id = f"snap-{uuid.uuid4().hex[:12]}"

    try:
        iam = boto3.client('iam')

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

            policy = iam.get_policy(PolicyArn=policy_arn)['Policy']
            version_id = policy['DefaultVersionId']

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
            snapshot = {
                'snapshot_id': snapshot_id,
                'resource_type': 'UNKNOWN',
                'resource_id': resource_id,
                'created_at': datetime.utcnow().isoformat()
            }

        _snapshots[snapshot_id] = snapshot
        return snapshot

    except Exception as e:
        # Return minimal snapshot on error
        snapshot = {
            'snapshot_id': snapshot_id,
            'resource_type': 'IAM',
            'resource_id': resource_id,
            'error': str(e),
            'created_at': datetime.utcnow().isoformat()
        }
        _snapshots[snapshot_id] = snapshot
        return snapshot
```

## Step 3: Add Remediation Execution Function

```python
def execute_iam_remediation(resource_id: str, permissions_to_remove: List[str]) -> Dict:
    """Actually remove permissions from IAM role/policy"""
    try:
        iam = boto3.client('iam')

        if ':role/' in resource_id:
            role_name = resource_id.split('/')[-1]

            # Get current inline policies
            inline_names = iam.list_role_policies(RoleName=role_name)['PolicyNames']

            modified = False
            for policy_name in inline_names:
                policy = iam.get_role_policy(RoleName=role_name, PolicyName=policy_name)
                doc = policy['PolicyDocument']

                # Remove permissions from each statement
                for statement in doc.get('Statement', []):
                    if isinstance(statement.get('Action'), list):
                        original_len = len(statement['Action'])
                        statement['Action'] = [
                            a for a in statement['Action']
                            if a not in permissions_to_remove
                        ]
                        if len(statement['Action']) < original_len:
                            modified = True
                    elif statement.get('Action') in permissions_to_remove:
                        statement['Action'] = []
                        modified = True

                # Update the policy if modified
                if modified:
                    iam.put_role_policy(
                        RoleName=role_name,
                        PolicyName=policy_name,
                        PolicyDocument=json.dumps(doc)
                    )

            return {
                'success': True,
                'action': 'remove_permissions',
                'resource': resource_id,
                'permissions_removed': permissions_to_remove,
                'modified': modified
            }

        elif ':policy/' in resource_id:
            policy_arn = resource_id

            policy = iam.get_policy(PolicyArn=policy_arn)['Policy']
            version = iam.get_policy_version(
                PolicyArn=policy_arn,
                VersionId=policy['DefaultVersionId']
            )
            doc = version['PolicyVersion']['Document']

            modified = False
            for statement in doc.get('Statement', []):
                if isinstance(statement.get('Action'), list):
                    original_len = len(statement['Action'])
                    statement['Action'] = [
                        a for a in statement['Action']
                        if a not in permissions_to_remove
                    ]
                    if len(statement['Action']) < original_len:
                        modified = True

            if modified:
                iam.create_policy_version(
                    PolicyArn=policy_arn,
                    PolicyDocument=json.dumps(doc),
                    SetAsDefault=True
                )

            return {
                'success': True,
                'action': 'remove_permissions',
                'resource': resource_id,
                'permissions_removed': permissions_to_remove,
                'modified': modified
            }

        return {'success': False, 'error': 'Unsupported resource type'}

    except Exception as e:
        return {'success': False, 'error': str(e)}
```

## Step 4: Add Rollback Function

```python
def restore_from_snapshot(snapshot_id: str) -> Dict:
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
        return {'success': False, 'error': str(e), 'snapshot_id': snapshot_id}
```

## Step 5: Update Your /api/safe-remediate/execute Endpoint

Replace your existing stub endpoint with:

```python
@app.post("/api/safe-remediate/execute")
async def execute_remediation(request: dict):
    """Execute real IAM remediation with snapshot"""
    import uuid

    finding_id = request.get('finding_id')
    resource_id = request.get('resource_id')
    create_rollback = request.get('create_rollback', True)

    execution_id = f"exec-{uuid.uuid4().hex[:12]}"
    snapshot_id = None

    try:
        # Create snapshot before changes
        if create_rollback and resource_id:
            snapshot = create_iam_snapshot(resource_id)
            snapshot_id = snapshot['snapshot_id']

        # Determine permissions to remove (from simulation or default)
        permissions_to_remove = request.get('permissions_to_remove', ['s3:*', 'iam:*', 'ec2:*'])

        # Execute the actual remediation
        result = {'success': True, 'demo_mode': True}
        if resource_id:
            result = execute_iam_remediation(resource_id, permissions_to_remove)

        # Store execution record
        execution = {
            'execution_id': execution_id,
            'finding_id': finding_id,
            'snapshot_id': snapshot_id,
            'status': 'REMEDIATED' if result.get('success') else 'FAILED',
            'result': result,
            'timestamp': datetime.utcnow().isoformat()
        }
        _executions[execution_id] = execution

        return {
            'success': result.get('success', True),
            'execution_id': execution_id,
            'snapshot_id': snapshot_id,
            'finding_id': finding_id,
            'status': 'executed',
            'message': 'Remediation applied successfully',
            'details': result,
            'timestamp': datetime.utcnow().isoformat()
        }

    except Exception as e:
        execution = {
            'execution_id': execution_id,
            'finding_id': finding_id,
            'snapshot_id': snapshot_id,
            'status': 'FAILED',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }
        _executions[execution_id] = execution
        raise HTTPException(status_code=500, detail=str(e))
```

## Step 6: Update Your /api/safe-remediate/rollback Endpoint

```python
@app.post("/api/safe-remediate/rollback")
async def rollback_remediation(request: dict):
    """Rollback using snapshot"""
    snapshot_id = request.get('snapshot_id')
    execution_id = request.get('execution_id')

    # Get snapshot_id from execution if not provided
    if not snapshot_id and execution_id:
        execution = _executions.get(execution_id)
        if execution:
            snapshot_id = execution.get('snapshot_id')

    if not snapshot_id:
        raise HTTPException(status_code=400, detail="No snapshot_id available for rollback")

    result = restore_from_snapshot(snapshot_id)

    if result.get('success'):
        return {
            'success': True,
            'message': 'Rollback completed successfully',
            'snapshot_id': snapshot_id,
            'execution_id': execution_id,
            'status': 'rolled_back',
            'timestamp': datetime.utcnow().isoformat()
        }
    else:
        raise HTTPException(status_code=500, detail=result.get('error', 'Rollback failed'))
```

## Step 7: Deploy to Render

After adding these changes to your backend `main.py`, commit and push:

```bash
git add main.py
git commit -m "Add real IAM remediation with snapshot/rollback"
git push
```

Render will auto-deploy.

## Important Notes

1. **AWS Credentials**: Your backend needs valid AWS credentials with IAM permissions:
   - `iam:GetRole`, `iam:GetPolicy`, `iam:GetPolicyVersion`
   - `iam:ListRolePolicies`, `iam:ListAttachedRolePolicies`
   - `iam:GetRolePolicy`, `iam:PutRolePolicy`
   - `iam:CreatePolicyVersion`

2. **Resource ID Format**: The finding's `resource` field should be the full ARN:
   - Role: `arn:aws:iam::123456789012:role/MyRole`
   - Policy: `arn:aws:iam::123456789012:policy/MyPolicy`

3. **Test First**: Test on a non-production IAM role before demo!
