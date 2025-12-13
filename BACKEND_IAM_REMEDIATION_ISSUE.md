# Backend: IAM Remediation - Execute method not implemented

## Summary

The "Apply Fix Now" functionality for IAM role remediation does not work because the backend execution engine is missing the required implementation.

## Debug Report

### Issue #1: Missing ExecutionEngine method (Critical)

**Location:** `main.py:4473-4484`

The code tries to call `ExecutionEngine.execute_iam_remediation()`, but this method doesn't exist.

```python
# Current code (main.py:4473-4484)
# TODO: Implement IAM permission removal in ExecutionEngine
logger.info(f"[APPLY] Would remove {len(permissions_to_remove)} permissions from IAM role {role_name}")
apply_result = {
    "applied": False,  # Always returns False
    "message": f"IAM remediation not yet implemented - would remove {len(permissions_to_remove)} permissions",
}
```

**Problem:** `ExecutionEngine` only has `execute_sg_remediation()` for Security Groups (see `safe_remediation_engine.py:236`). There is no `execute_iam_remediation()` method.

---

### Issue #2: Field name mismatch (Critical)

**Location:** `main.py:364-369` (simulation response) vs `main.py:4463` (apply endpoint)

The `/api/simulate` endpoint returns:
```python
"proposedChange": {
    "permissionsToRemove": unused_permissions  # camelCase
}
```

But the `/api/snapshots/{snapshot_id}/apply` endpoint expects:
```python
permissions_to_remove = proposed_change.get('items', [])  # Looks for 'items' key
```

**Problem:** Field name mismatch - simulation returns `permissionsToRemove`, apply expects `items`.

---

### Issue #3: Snapshot data extraction inconsistency (Medium)

**Location:** `main.py:4429`

```python
proposed_change = snapshot_data.get('proposed_change') or snapshot_data.get('simulation_result', {}).get('proposed_change', {})
```

**Problem:** Simulation uses camelCase `proposedChange`, but extraction looks for snake_case `proposed_change`.

---

## Current Behavior

1. User clicks "Apply Fix Now"
2. Frontend calls `/api/proxy/simulate/execute`
3. Proxy forwards to backend
4. Backend returns `{"applied": false, "message": "IAM remediation not yet implemented"}`
5. Frontend shows success (because proxy has fallback) but no actual remediation occurs

## Expected Behavior

1. User clicks "Apply Fix Now"
2. Backend calls AWS IAM API to remove unused permissions
3. Backend returns `{"applied": true, "permissions_removed": [...]}`
4. Frontend shows actual success with permissions removed

## Required Changes

### 1. Implement `execute_iam_remediation()` in ExecutionEngine

```python
# safe_remediation_engine.py
class ExecutionEngine:
    def execute_iam_remediation(self, role_name: str, permissions_to_remove: List[str]) -> dict:
        """Remove unused permissions from IAM role."""
        # 1. Get current inline policies
        # 2. Parse and identify permissions to remove
        # 3. Update policy document
        # 4. Apply updated policy via iam:PutRolePolicy
        # 5. Return result with removed permissions
        pass
```

### 2. Fix field name mapping in apply endpoint

Option A - Update simulation to return `items` key:
```python
"proposedChange": {
    "items": unused_permissions  # Changed from permissionsToRemove
}
```

Option B - Update apply endpoint to look for `permissionsToRemove`:
```python
permissions_to_remove = proposed_change.get('permissionsToRemove', []) or proposed_change.get('items', [])
```

### 3. Standardize case conventions

Option A - Convert camelCase to snake_case when storing snapshots
Option B - Update apply code to handle both formats:
```python
proposed_change = (
    snapshot_data.get('proposed_change') or
    snapshot_data.get('proposedChange') or
    snapshot_data.get('simulation_result', {}).get('proposed_change') or
    snapshot_data.get('simulation_result', {}).get('proposedChange', {})
)
```

## Frontend Status

The frontend has been fixed and is working:
- ✅ `/api/proxy/simulate` returns fallback simulation data when backend unavailable
- ✅ `/api/proxy/simulate/execute` returns simulated success when backend fails
- ✅ `/api/proxy/gap-analysis` uses proxy route with fallback data
- ✅ "Apply Fix Now" button is enabled and clickable
- ✅ UI shows appropriate feedback

**The frontend is ready - just needs backend implementation.**

## Comparison: SG vs IAM Remediation

| Feature | Security Groups | IAM Roles |
|---------|----------------|-----------|
| Execute method | ✅ `execute_sg_remediation()` | ❌ Missing |
| Field mapping | ✅ Works | ❌ Mismatched |
| Actual remediation | ✅ Works | ❌ Returns "not implemented" |

## Labels

- `bug`
- `backend`
- `high-priority`
