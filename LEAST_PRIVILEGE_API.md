# Least Privilege API Documentation

Complete API reference for the Least Privilege enforcement system.

## Base URL

```
Production: https://saferemediate-backend.onrender.com
Development: http://localhost:8000
```

## Authentication

All API requests require authentication headers:

```http
Authorization: Bearer <token>
X-API-Key: <api-key>
```

---

## Endpoints

### 1. List Identities

Get all IAM identities in a system.

```http
GET /api/least-privilege/identities
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `systemName` | string | Yes | System name (e.g., "alon-prod") |
| `identityType` | string | No | Filter by type: IAMRole, IAMUser, etc. |
| `minLPScore` | number | No | Filter by minimum LP score (0-100) |
| `maxLPScore` | number | No | Filter by maximum LP score (0-100) |

**Response:**

```json
{
  "identities": [
    {
      "id": "arn:aws:iam::123456789012:role/example-role",
      "type": "IAMRole",
      "name": "example-role",
      "accountId": "123456789012",
      "systemName": "alon-prod",
      "lpScore": 73.5,
      "totalPermissions": 25,
      "usedPermissions": 18,
      "unusedPermissions": 7,
      "lastActivity": "2025-12-24T10:00:00Z"
    }
  ],
  "summary": {
    "totalIdentities": 45,
    "averageLPScore": 78.2,
    "identitiesAbove90": 12,
    "identitiesBelow50": 3
  }
}
```

---

### 2. Analyze Identity

Get detailed Least Privilege analysis for a specific identity.

```http
GET /api/least-privilege/analysis
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `identityId` | string | Yes | Identity ARN |
| `observationDays` | number | No | Days of data to analyze (default: 90) |
| `includeEvidence` | boolean | No | Include evidence details (default: false) |

**Response:**

```json
{
  "identity": {
    "id": "arn:aws:iam::123456789012:role/example-role",
    "type": "IAMRole",
    "name": "example-role",
    "lpScore": 73.5
  },
  "permissions": [
    {
      "action": "s3:GetObject",
      "resource": "arn:aws:s3:::my-bucket/*",
      "status": "ACTIVE_REQUIRED",
      "lastUsed": "2025-12-23T15:30:00Z",
      "usageCount90d": 1247,
      "riskLevel": "MEDIUM",
      "classificationConfidence": 0.95
    },
    {
      "action": "s3:DeleteBucket",
      "resource": "*",
      "status": "INACTIVE_SAFE",
      "lastUsed": null,
      "usageCount90d": 0,
      "riskLevel": "CRITICAL",
      "riskReasons": [
        "Destructive action",
        "Wildcard resource - full account access"
      ],
      "classificationConfidence": 0.92
    }
  ],
  "classification": {
    "ACTIVE_REQUIRED": 18,
    "ACTIVE_ANOMALOUS": 0,
    "INACTIVE_NEEDED": 2,
    "INACTIVE_SAFE": 5
  },
  "recommendations": [
    {
      "id": "rec-001",
      "type": "REMOVE",
      "priority": "HIGH",
      "permissionsToRemove": [
        "s3:DeleteBucket",
        "iam:PassRole",
        "ec2:TerminateInstances"
      ],
      "impact": "Removes 3 high-risk unused permissions",
      "confidence": 0.92,
      "recommendedAction": "AUTO_APPLY"
    }
  ],
  "confidence": {
    "overall": 0.88,
    "components": {
      "usageEvidence": 0.92,
      "timeCoverage": 0.95,
      "sourceCompleteness": 0.80,
      "systemContext": 0.85,
      "simulation": 0.70
    },
    "recommendedAction": "CANARY",
    "factors": [
      "Strong evidence of non-usage (92% confidence)",
      "Good observation period (90 days)",
      "Dual data sources (2 enabled)"
    ],
    "warnings": [
      "No simulation run - using conservative estimates"
    ]
  },
  "evidenceSources": [
    {
      "type": "CloudTrail",
      "enabled": true,
      "coverageRegions": ["us-east-1"],
      "coverageComplete": true,
      "coveragePercent": 100,
      "lastSync": "2025-12-24T20:00:00Z",
      "observationDays": 90,
      "recordCount": 125847
    }
  ]
}
```

---

### 3. Get Issues

Get all Least Privilege issues across a system (current format, for compatibility).

```http
GET /api/least-privilege/issues
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `systemName` | string | Yes | System name |
| `observationDays` | number | No | Days of observation (default: 90) |
| `minSeverity` | string | No | Filter by severity: low, medium, high, critical |

**Response:**

```json
{
  "summary": {
    "totalResources": 12,
    "totalExcessPermissions": 87,
    "avgLPScore": 73.5,
    "iamIssuesCount": 8,
    "networkIssuesCount": 2,
    "s3IssuesCount": 2,
    "criticalCount": 3,
    "highCount": 5,
    "mediumCount": 4,
    "lowCount": 0,
    "confidenceLevel": 88,
    "observationDays": 90,
    "attackSurfaceReduction": 26.5
  },
  "resources": [
    {
      "id": "res-001",
      "resourceType": "IAMRole",
      "resourceName": "example-role",
      "resourceArn": "arn:aws:iam::123456789012:role/example-role",
      "systemName": "alon-prod",
      "lpScore": 73.5,
      "allowedCount": 25,
      "usedCount": 18,
      "gapCount": 7,
      "gapPercent": 28,
      "allowedList": ["s3:GetObject", "s3:DeleteBucket", ...],
      "usedList": ["s3:GetObject", ...],
      "unusedList": ["s3:DeleteBucket", ...],
      "highRiskUnused": [
        {
          "permission": "s3:DeleteBucket",
          "riskLevel": "CRITICAL",
          "reason": "Destructive action"
        }
      ],
      "evidence": {
        "dataSources": ["CloudTrail"],
        "observationDays": 90,
        "confidence": "HIGH",
        "coverage": {
          "regions": ["us-east-1"],
          "complete": true
        }
      },
      "severity": "high",
      "confidence": 92,
      "title": "example-role has 7 unused permissions",
      "description": "This role has permissions that haven't been used in 90 days",
      "remediation": "Remove unused permissions to reduce attack surface"
    }
  ],
  "timestamp": "2025-12-24T21:00:00Z"
}
```

---

### 4. Simulate Change

Simulate the impact of removing permissions before enforcement.

```http
POST /api/least-privilege/simulate
```

**Request Body:**

```json
{
  "identityId": "arn:aws:iam::123456789012:role/example-role",
  "identityArn": "arn:aws:iam::123456789012:role/example-role",
  "currentPolicy": {
    "Version": "2012-10-17",
    "Statement": [...]
  },
  "proposedPolicy": {
    "Version": "2012-10-17",
    "Statement": [...]
  },
  "changeType": "REMOVE_PERMISSIONS",
  "affectedPermissions": [
    "s3:DeleteBucket",
    "iam:PassRole"
  ],
  "validateCriticalPaths": true,
  "validateDependencies": true
}
```

**Response:**

```json
{
  "status": "SAFE",
  "reachabilityPreserved": 0.98,
  "criticalPathsAffected": [],
  "permissionsTested": 7,
  "permissionsSafe": 7,
  "permissionsRisky": 0,
  "servicesTested": ["s3", "ec2", "lambda"],
  "servicesImpacted": [],
  "warnings": [
    "Permission s3:DeleteBucket was never used in 90 days"
  ],
  "errors": [],
  "blockingIssues": [],
  "simulationConfidence": 95,
  "safeToApply": true,
  "requiresCanary": false,
  "requiresApproval": false
}
```

---

### 5. Enforce Change

Apply Least Privilege enforcement (remove unused permissions).

```http
POST /api/least-privilege/enforce
```

**Request Body:**

```json
{
  "identityId": "arn:aws:iam::123456789012:role/example-role",
  "identityArn": "arn:aws:iam::123456789012:role/example-role",
  "recommendationId": "rec-001",
  "changeType": "REMOVE_PERMISSIONS",
  "currentPolicy": {...},
  "proposedPolicy": {...},
  "requireSnapshot": true,
  "requireSimulation": true,
  "requireApproval": false,
  "executionMode": "AUTO",
  "approvals": {
    "requestedBy": "user@example.com",
    "approvedBy": ["manager@example.com"],
    "approvalDate": "2025-12-24T20:00:00Z"
  }
}
```

**Response:**

```json
{
  "id": "enf-001",
  "identityId": "arn:aws:iam::123456789012:role/example-role",
  "status": "SUCCESS",
  "changesApplied": {
    "permissionsRemoved": [
      "s3:DeleteBucket",
      "iam:PassRole"
    ],
    "resourcesNarrowed": [],
    "conditionsAdded": []
  },
  "snapshotId": "snap-abc123",
  "snapshotCreatedAt": "2025-12-24T21:00:00Z",
  "executedAt": "2025-12-24T21:01:30Z",
  "executedBy": "automation-engine",
  "executionDuration": 1523,
  "postValidation": {
    "healthChecksPassed": true,
    "criticalPathsWorking": true,
    "servicesOperational": ["api-gateway", "lambda"],
    "servicesFailed": []
  },
  "rollbackAvailable": true,
  "rollbackId": "snap-abc123",
  "errors": [],
  "warnings": []
}
```

---

### 6. Create Snapshot

Create a pre-enforcement snapshot of identity state.

```http
POST /api/least-privilege/snapshot
```

**Request Body:**

```json
{
  "identityId": "arn:aws:iam::123456789012:role/example-role",
  "identityArn": "arn:aws:iam::123456789012:role/example-role",
  "identityName": "example-role",
  "systemName": "alon-prod",
  "reason": "Pre-enforcement snapshot for recommendation rec-001"
}
```

**Response:**

```json
{
  "id": "snap-abc123",
  "identityId": "arn:aws:iam::123456789012:role/example-role",
  "identityArn": "arn:aws:iam::123456789012:role/example-role",
  "identityName": "example-role",
  "systemName": "alon-prod",
  "accountId": "123456789012",
  "iamPolicies": [...],
  "inlinePolicies": [...],
  "attachedPolicies": ["arn:aws:iam::aws:policy/..."],
  "trustPolicy": {...},
  "tags": {...},
  "createdAt": "2025-12-24T21:00:00Z",
  "createdBy": "automation-engine",
  "reason": "Pre-enforcement snapshot for recommendation rec-001",
  "checksumSHA256": "def456...",
  "encrypted": true,
  "restorable": true
}
```

---

### 7. Restore from Snapshot

Restore identity to a previous snapshot state (rollback).

```http
POST /api/least-privilege/restore
```

**Request Body:**

```json
{
  "snapshotId": "snap-abc123",
  "identityId": "arn:aws:iam::123456789012:role/example-role",
  "validateBeforeRestore": true,
  "reason": "Rollback due to health check failure",
  "requestedBy": "operator@example.com",
  "emergencyRestore": false
}
```

**Response:**

```json
{
  "id": "restore-001",
  "snapshotId": "snap-abc123",
  "identityId": "arn:aws:iam::123456789012:role/example-role",
  "status": "SUCCESS",
  "policiesRestored": [
    "arn:aws:iam::123456789012:policy/custom-policy"
  ],
  "trustPolicyRestored": true,
  "tagsRestored": true,
  "restoredAt": "2025-12-24T21:15:00Z",
  "restoredBy": "operator@example.com",
  "restoreDuration": 845,
  "postRestoreValidation": {
    "policiesMatch": true,
    "trustPolicyMatches": true,
    "healthChecksPassed": true
  },
  "auditTrailId": "audit-xyz",
  "errors": [],
  "warnings": []
}
```

---

### 8. Get Evidence Status

Check the status of evidence collection for data sources.

```http
GET /api/least-privilege/evidence
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `systemName` | string | Yes | System name |
| `accountId` | string | No | AWS account ID |

**Response:**

```json
{
  "sources": [
    {
      "type": "CloudTrail",
      "enabled": true,
      "coverage": {
        "regions": ["us-east-1", "us-west-2"],
        "complete": true,
        "percentComplete": 100
      },
      "lastSync": "2025-12-24T20:00:00Z",
      "observationDays": 90,
      "recordCount": 125847,
      "status": "HEALTHY"
    },
    {
      "type": "AccessAdvisor",
      "enabled": true,
      "coverage": {
        "regions": ["us-east-1"],
        "complete": true,
        "percentComplete": 100
      },
      "lastSync": "2025-12-24T19:00:00Z",
      "observationDays": 365,
      "recordCount": 45,
      "status": "HEALTHY"
    },
    {
      "type": "VPCFlowLogs",
      "enabled": false,
      "coverage": {
        "regions": [],
        "complete": false,
        "percentComplete": 0
      },
      "lastSync": null,
      "observationDays": 0,
      "recordCount": 0,
      "status": "DISABLED"
    }
  ],
  "overall": {
    "healthStatus": "GOOD",
    "enabledSources": 2,
    "totalSources": 3,
    "averageCoverage": 66.7,
    "oldestData": "2025-09-25T20:00:00Z",
    "newestData": "2025-12-24T20:00:00Z"
  }
}
```

---

### 9. Get Audit Trail

Retrieve audit records for Least Privilege actions.

```http
GET /api/least-privilege/audit
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `systemName` | string | No | Filter by system |
| `identityId` | string | No | Filter by identity |
| `action` | string | No | Filter by action type |
| `startDate` | string | No | ISO 8601 date |
| `endDate` | string | No | ISO 8601 date |
| `limit` | number | No | Max records (default: 100) |

**Response:**

```json
{
  "records": [
    {
      "id": "audit-001",
      "timestamp": "2025-12-24T21:00:00Z",
      "action": "ENFORCEMENT",
      "actor": "automation-engine",
      "actorType": "SYSTEM",
      "identityId": "arn:aws:iam::123456789012:role/example-role",
      "identityArn": "arn:aws:iam::123456789012:role/example-role",
      "systemName": "alon-prod",
      "changesSummary": "Removed 7 unused permissions",
      "evidenceUsed": ["CloudTrail", "AccessAdvisor"],
      "confidenceScore": 0.92,
      "status": "SUCCESS",
      "snapshotId": "snap-abc123",
      "rollbackCapability": true,
      "approvalPath": {
        "requested": true,
        "approvers": ["manager@example.com"],
        "approvedAt": "2025-12-24T20:00:00Z"
      }
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### 10. Drift Detection

Get current drift status for managed identities.

```http
GET /api/least-privilege/drift
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `systemName` | string | Yes | System name |
| `driftType` | string | No | Filter by type |
| `minSignificance` | string | No | Minimum significance level |

**Response:**

```json
{
  "drifts": [
    {
      "identityId": "arn:aws:iam::123456789012:role/example-role",
      "identityName": "example-role",
      "driftType": "NEW_PERMISSIONS",
      "baseline": {...},
      "current": {...},
      "diff": {
        "added": ["s3:PutObject"],
        "removed": [],
        "modified": []
      },
      "detectedAt": "2025-12-24T21:00:00Z",
      "lastEnforcedAt": "2025-12-20T10:00:00Z",
      "driftDuration": 345600000,
      "driftSignificance": "MEDIUM",
      "requiresRemediation": true,
      "autoRemediable": false,
      "recommendedAction": "ALERT"
    }
  ],
  "summary": {
    "totalDrifts": 5,
    "criticalDrifts": 1,
    "highDrifts": 2,
    "mediumDrifts": 2,
    "lowDrifts": 0,
    "autoRemediable": 3
  }
}
```

---

## Error Responses

All endpoints may return these error responses:

### 400 Bad Request

```json
{
  "error": "Bad Request",
  "detail": "Missing required parameter: identityId",
  "timestamp": "2025-12-24T21:00:00Z"
}
```

### 401 Unauthorized

```json
{
  "error": "Unauthorized",
  "detail": "Invalid or missing authentication token",
  "timestamp": "2025-12-24T21:00:00Z"
}
```

### 404 Not Found

```json
{
  "error": "Not Found",
  "detail": "Identity not found: arn:aws:iam::123456789012:role/missing-role",
  "timestamp": "2025-12-24T21:00:00Z"
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal Server Error",
  "detail": "An unexpected error occurred",
  "timestamp": "2025-12-24T21:00:00Z"
}
```

### 503 Service Unavailable

```json
{
  "error": "Service Unavailable",
  "detail": "Backend service is temporarily unavailable",
  "timestamp": "2025-12-24T21:00:00Z"
}
```

---

## Rate Limiting

API requests are rate-limited:

- **Read operations**: 100 requests/minute
- **Write operations**: 20 requests/minute
- **Simulation**: 10 requests/minute

Rate limit headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1703457600
```

---

## Webhooks

Subscribe to Least Privilege events:

### Event Types

- `enforcement.completed` - Enforcement finished
- `enforcement.failed` - Enforcement failed
- `rollback.triggered` - Rollback initiated
- `drift.detected` - Drift detected
- `confidence.threshold_crossed` - Confidence score crossed threshold

### Webhook Payload

```json
{
  "event": "enforcement.completed",
  "timestamp": "2025-12-24T21:00:00Z",
  "data": {
    "identityId": "arn:aws:iam::123456789012:role/example-role",
    "systemName": "alon-prod",
    "permissionsRemoved": 7,
    "snapshotId": "snap-abc123",
    "confidence": 0.92
  }
}
```

---

## SDK Examples

### Python

```python
import requests

# Get analysis
response = requests.get(
    "https://api.saferemediate.com/api/least-privilege/analysis",
    params={"identityId": "arn:aws:iam::123456789012:role/example-role"},
    headers={"Authorization": "Bearer <token>"}
)
analysis = response.json()

# Enforce change
response = requests.post(
    "https://api.saferemediate.com/api/least-privilege/enforce",
    json={
        "identityId": "arn:aws:iam::123456789012:role/example-role",
        "recommendationId": "rec-001",
        "executionMode": "AUTO"
    },
    headers={"Authorization": "Bearer <token>"}
)
result = response.json()
```

### JavaScript

```javascript
// Get analysis
const analysis = await fetch(
  `https://api.saferemediate.com/api/least-privilege/analysis?identityId=${identityId}`,
  {
    headers: { Authorization: `Bearer ${token}` }
  }
).then(r => r.json());

// Enforce change
const result = await fetch(
  'https://api.saferemediate.com/api/least-privilege/enforce',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      identityId: 'arn:aws:iam::123456789012:role/example-role',
      recommendationId: 'rec-001',
      executionMode: 'AUTO'
    })
  }
).then(r => r.json());
```

---

## Changelog

### Version 1.0 (2025-12-24)

- Initial release
- All core endpoints implemented
- Confidence scoring system
- Snapshot/restore capability
- Drift detection

---

**Last Updated:** 2025-12-24  
**API Version:** 1.0  
**Status:** Production
