# CYNTRO DATA LAYER AUDIT REPORT
## DataLayer.docx vs Current Implementation Analysis

**Generated:** April 25, 2026
**Status:** Production Readiness Assessment

---

## EXECUTIVE SUMMARY

| Metric | Status |
|--------|--------|
| Data Sources Specified | 14 |
| Fully Implemented | 9 |
| Partially Implemented | 3 |
| Not Implemented | 2 |
| Critical Gaps | 5 |

**Key Finding:** The DataLayer.docx concludes that "Cyntro is NOT missing data. Cyntro is missing integration of data into decision-making." This audit confirms that assessment and provides specific remediation steps.

---

## 1. CLOUDTRAIL DATA COLLECTION

### Specification (DataLayer.docx)

| Field | Required | Purpose |
|-------|----------|---------|
| eventTime | Yes | Observation window |
| eventSource | Yes | AWS service used |
| eventName | Yes | Exact action |
| userIdentity.arn | Yes | Actor identity |
| userIdentity.sessionContext.sessionIssuer.arn | Yes | Real IAM role |
| resources[].ARN | Yes | Target resource |
| sourceIPAddress | Yes | Source context |
| recipientAccountId | Yes | Account boundary |
| errorCode | Yes | Success vs failure |
| requestParameters (filtered) | Yes | Scope (bucket/table/etc) |

**DO NOT COLLECT:** Full JSON events, raw logs into graph, request bodies/payloads

### Implementation Status: IMPLEMENTED

**File:** `/collectors/cloudtrail_collector.py`

| Field | Collected? | Notes |
|-------|------------|-------|
| eventTime | Yes | Used for observation window |
| eventSource | Yes | Maps to AWS service |
| eventName | Yes | Exact action tracked |
| userIdentity.arn | Yes | Actor identity |
| sessionContext.sessionIssuer.arn | Partial | Only via Username lookup |
| resources[].ARN | Partial | ResourceName filter only |
| sourceIPAddress | No | NOT COLLECTED |
| recipientAccountId | No | NOT COLLECTED |
| errorCode | No | NOT COLLECTED |
| requestParameters | No | NOT COLLECTED |

### GAPS IDENTIFIED

| Gap | Severity | Impact |
|-----|----------|--------|
| Missing sourceIPAddress | MEDIUM | Cannot detect anomalous source locations |
| Missing recipientAccountId | HIGH | Cross-account visibility broken |
| Missing errorCode | MEDIUM | Cannot distinguish successful vs failed attempts |
| Missing requestParameters | HIGH | Cannot scope to bucket/table level |
| Short observation window (90 days default) | HIGH | Idle workloads invisible |
| Data events often not enabled | HIGH | S3/DynamoDB object-level invisible |

### RECOMMENDATION
```python
# Add to CloudTrail collector:
fields_to_collect = [
    'sourceIPAddress',
    'recipientAccountId',
    'errorCode',
    'requestParameters.bucketName',
    'requestParameters.tableName',
]
```

---

## 2. IAM DATA COLLECTION

### Specification (DataLayer.docx)

| Field | Required | Purpose |
|-------|----------|---------|
| role ARN | Yes | Identity |
| trust policy | Yes | Who can assume |
| inline policies | Yes | Allowed actions |
| attached policies | Yes | Allowed actions |
| policy_set_hash | Yes | View parity |
| allowed actions | Yes | Permission scope |
| allowed resources | Yes | Blast radius |
| tags | Yes | Ownership |

**DO NOT COLLECT:** Redundant policy versions, unused metadata

### Implementation Status: IMPLEMENTED

**File:** `/collectors/extended_aws_collectors.py`

| Field | Collected? | Notes |
|-------|------------|-------|
| role ARN | Yes | Full ARN stored |
| trust policy | Yes | AssumeRolePolicyDocument |
| inline policies | Yes | Full policy documents |
| attached policies | Yes | Full policy documents |
| policy_set_hash | No | NOT IMPLEMENTED |
| allowed actions | Yes | Parsed from policies |
| allowed resources | Partial | Not all resource types extracted |
| tags | Yes | All tags collected |

### GAPS IDENTIFIED

| Gap | Severity | Impact |
|-----|----------|--------|
| Missing policy_set_hash | MEDIUM | Cannot detect view parity (drift) |
| Permission boundaries not collected | HIGH | Effective permissions may be wrong |
| No session duration tracking | LOW | MFA requirements not enforced in logic |

### RECOMMENDATION
```python
# Add policy_set_hash for drift detection:
import hashlib
policy_hash = hashlib.sha256(json.dumps(sorted_policy, sort_keys=True).encode()).hexdigest()
```

---

## 3. VPC FLOW LOGS

### Specification (DataLayer.docx)

| Field | Required | Purpose |
|-------|----------|---------|
| srcaddr | Yes | Source resource |
| dstaddr | Yes | Destination |
| srcport | Yes | Connection context |
| dstport | Yes | Service exposed |
| protocol | Yes | TCP/UDP |
| bytes | Yes | Activity strength |
| packets | Yes | Activity |
| action | Yes | ACCEPT/REJECT |
| start/end | Yes | Time window |
| interface-id | Yes | Map to ENI |

**DO NOT COLLECT:** Raw packet logs, payloads

### Implementation Status: IMPLEMENTED

**File:** `/collectors/flowlogs_aggregator.py`

| Field | Collected? | Notes |
|-------|------------|-------|
| srcaddr | Yes | Full IP address |
| dstaddr | Yes | Full IP address |
| srcport | Yes | Port number |
| dstport | Yes | Port number |
| protocol | Yes | TCP/UDP/ICMP |
| bytes | Yes | Aggregated |
| packets | No | NOT COLLECTED |
| action | Partial | Only ACCEPT tracked |
| start/end | Yes | Time window |
| interface-id | Yes | ENI mapping |

### GAPS IDENTIFIED

| Gap | Severity | Impact |
|-----|----------|--------|
| REJECT action not tracked | HIGH | Cannot see blocked attacks |
| packets not counted | LOW | Activity strength incomplete |
| Not always enabled everywhere | HIGH | Coverage gaps in scoring |
| Not strongly used in scoring | CRITICAL | DataLayer.docx: "not strongly used in scoring yet" |

### RECOMMENDATION
```python
# Include REJECT traffic for security analysis:
filter_pattern = "{ ($.action = \"ACCEPT\") || ($.action = \"REJECT\") }"
```

---

## 4. EC2 / ENI / SECURITY GROUPS

### Specification (DataLayer.docx)

**EC2:**
| Field | Required | Purpose |
|-------|----------|---------|
| instance ID | Yes | Resource |
| IAM instance profile | Yes | Role consumer |
| ENI IDs | Yes | Mapping |
| private IPs | Yes | Flow logs mapping |
| tags | Yes | Ownership |
| VPC / subnet | Yes | Topology |

**Security Groups:**
| Field | Required | Purpose |
|-------|----------|---------|
| ingress rules | Yes | Allowed traffic |
| egress rules | Yes | Outbound |
| ports | Yes | Exposure |
| CIDR / SG refs | Yes | Reachability |

### Implementation Status: IMPLEMENTED

**File:** `/collectors/security_group_collector.py`

| Field | Collected? | Notes |
|-------|------------|-------|
| instance ID | Yes | Full ID |
| IAM instance profile | Yes | Role ARN extracted |
| ENI IDs | Yes | Mapped to SGs |
| private IPs | Yes | Flow logs correlation |
| tags | Yes | Ownership tracking |
| VPC / subnet | Yes | Topology built |
| ingress rules | Yes | Full rule details |
| egress rules | Yes | Full rule details |
| ports | Yes | Range support |
| CIDR / SG refs | Yes | Reachability analysis |

### GAPS IDENTIFIED

| Gap | Severity | Impact |
|-----|----------|--------|
| Consumer signal underused in UI | HIGH | DataLayer.docx: "underused in UI" |
| Not fully integrated into scoring | CRITICAL | DataLayer.docx: "not fully integrated into scoring" |
| No rule modification history/age | MEDIUM | Cannot track rule drift |

---

## 5. LAMBDA / SERVICE CONSUMERS

### Specification (DataLayer.docx)

| Field | Required | Purpose |
|-------|----------|---------|
| function ARN | Yes | Resource |
| execution role | Yes | IAM consumer |
| event sources | Yes | Dependencies |
| VPC config | Yes | Network context |
| tags | Yes | Ownership |

### Implementation Status: IMPLEMENTED

**File:** `/collectors/extended_aws_collectors.py`

| Field | Collected? | Notes |
|-------|------------|-------|
| function ARN | Yes | Full ARN |
| execution role | Yes | Role ARN extracted |
| event sources | No | NOT COLLECTED |
| VPC config | Yes | VpcId, SubnetIds, SGIds |
| tags | No | NOT COLLECTED |

### GAPS IDENTIFIED

| Gap | Severity | Impact |
|-----|----------|--------|
| Event sources not collected | HIGH | Cannot map dependencies |
| Tags not collected | MEDIUM | Ownership unclear |
| Not fully surfaced in UI decisions | CRITICAL | DataLayer.docx: "not fully surfaced in UI decisions" |

---

## 6. S3 DATA ACCESS

### Specification (DataLayer.docx)

| Field | Required | Purpose |
|-------|----------|---------|
| role ARN | Yes | Actor |
| bucket | Yes | Resource |
| prefix | Yes | Scope |
| operation (GET/PUT/DELETE) | Yes | Behavior |
| count | Yes | Strength |
| last_seen | Yes | Recency |

**DO NOT COLLECT:** Object contents, full object listings

### Implementation Status: IMPLEMENTED

**File:** `/collectors/s3_access_logs_collector.py`

| Field | Collected? | Notes |
|-------|------------|-------|
| role ARN | Yes | Requester identity |
| bucket | Yes | Bucket name |
| prefix | Yes | Key path extracted |
| operation | Yes | Mapped to IAM actions |
| count | Yes | Aggregated |
| last_seen | Yes | Timestamp tracked |

### GAPS IDENTIFIED (CRITICAL)

| Gap | Severity | Impact |
|-----|----------|--------|
| NOT part of telemetry planes | CRITICAL | DataLayer.docx: "NOT part of telemetry planes today" |
| NOT used in scoring decisions | CRITICAL | DataLayer.docx: "NOT used in scoring decisions" |
| S3 access logs must be enabled | HIGH | Coverage depends on customer config |
| 1-2 hour log delay | MEDIUM | Near-real-time not possible |

### RECOMMENDATION
This is one of the **most critical gaps**. S3 access patterns must be integrated into:
1. `telemetry_coverage` calculation
2. `visibility_signals.s3_access_logs` flag
3. Decision routing logic

---

## 7. DYNAMODB ACCESS

### Specification (DataLayer.docx)

| Field | Required | Purpose |
|-------|----------|---------|
| role ARN | Yes | Actor |
| table | Yes | Resource |
| operation | Yes | Behavior |
| count | Yes | Usage |
| last_seen | Yes | Recency |

### Implementation Status: IMPLEMENTED

**File:** `/collectors/dynamodb_access_collector.py`

| Field | Collected? | Notes |
|-------|------------|-------|
| role ARN | Yes | Via CloudTrail |
| table | Yes | Table ARN |
| operation | Yes | GetItem, Query, etc. |
| count | Yes | Event count |
| last_seen | Yes | Latest timestamp |

### GAPS IDENTIFIED

| Gap | Severity | Impact |
|-----|----------|--------|
| Weak integration into scoring | HIGH | DataLayer.docx: "weak integration into scoring" |
| Item-level access not tracked | MEDIUM | Only table-level granularity |

---

## 8. RDS / DATABASE LOGS

### Specification (DataLayer.docx)

| Field | Required | Purpose |
|-------|----------|---------|
| DB user | Yes | Actor |
| table | Yes | Resource |
| operation | Yes | SELECT/INSERT/etc |
| count | Yes | Behavior |

**DO NOT COLLECT:** Full SQL queries, data content

### Implementation Status: IMPLEMENTED

**File:** `/collectors/rds_query_logs_collector.py`

| Field | Collected? | Notes |
|-------|------------|-------|
| DB user | Yes | From PostgreSQL logs |
| table | Yes | Regex extraction |
| operation | Yes | SELECT/INSERT/etc |
| count | Yes | Query count |

### GAPS IDENTIFIED (CRITICAL)

| Gap | Severity | Impact |
|-----|----------|--------|
| Not part of telemetry coverage | CRITICAL | DataLayer.docx: "not part of telemetry coverage" |
| Not used in decisions | CRITICAL | DataLayer.docx: "not used in decisions" |
| Requires expensive log_statement='all' | HIGH | Performance impact |
| Regex-based table extraction unreliable | MEDIUM | Complex queries may fail |

---

## 9. DSPM / CYERA INTEGRATION

### Specification (DataLayer.docx)

| Field | Required | Purpose |
|-------|----------|---------|
| resource | Yes | Asset |
| classification | Yes | PII/PCI/etc |
| sensitivity | Yes | Critical/high |
| framework | Yes | Compliance |

### Implementation Status: IMPLEMENTED

**File:** `/api/data_enforcement.py`

| Field | Collected? | Notes |
|-------|------------|-------|
| resource | Yes | Table/bucket/prefix |
| classification | Yes | PII/PCI/PHI |
| sensitivity | Yes | Critical/high/medium/low |
| framework | Yes | PCI-DSS/HIPAA/SOC2 |

### GAPS IDENTIFIED (CRITICAL)

| Gap | Severity | Impact |
|-----|----------|--------|
| NOT used in safety decisions today | CRITICAL | DataLayer.docx: "NOT used in safety decisions today" |
| Data classification freshness not tracked | HIGH | Can be stale |
| No feedback loop to DSPM | MEDIUM | Remediation status not sent back |

---

## 10. AWS CONFIG

### Specification (DataLayer.docx)

| Field | Required | Purpose |
|-------|----------|---------|
| resource | Yes | Identity |
| relationships | Yes | Topology |
| config state | Yes | Drift |
| tags | Yes | Ownership |

### Implementation Status: NOT IMPLEMENTED

**Evidence:** Referenced in comments but no actual collector exists.

```python
# In collectors.py comments:
# """
# - AWS Config -> CONFIG_RELATIONSHIP, VIOLATES_CONFIG_RULE
# """
```

### GAPS IDENTIFIED (CRITICAL)

| Gap | Severity | Impact |
|-----|----------|--------|
| AWS Config collector not built | CRITICAL | No config compliance tracking |
| No drift detection via Config | HIGH | State changes invisible |
| No ConfigRule violation alerts | HIGH | Compliance gaps undetected |

---

## 11. ACCESS ANALYZER

### Specification (DataLayer.docx)

| Field | Required | Purpose |
|-------|----------|---------|
| resource | Yes | Exposed |
| principal | Yes | Who can access |
| action | Yes | Exposure |
| status | Yes | Active |

### Implementation Status: PARTIALLY IMPLEMENTED

**Evidence:** Referenced in high-risk permission list but no actual API integration.

### GAPS IDENTIFIED (CRITICAL)

| Gap | Severity | Impact |
|-----|----------|--------|
| No API calls to Access Analyzer | CRITICAL | External access not detected |
| No HAS_EXTERNAL_ACCESS edges created | HIGH | Graph incomplete |
| Only in high-risk permission enumeration | MEDIUM | Not functional |

---

## 12. STS / ASSUME ROLE

### Specification (DataLayer.docx)

| Field | Required | Purpose |
|-------|----------|---------|
| assumed role | Yes | Usage |
| session issuer | Yes | Real identity |
| source | Yes | Origin |

### Implementation Status: IMPLEMENTED

**File:** `/collectors/sts_session_collector.py`

| Field | Collected? | Notes |
|-------|------------|-------|
| assumed role | Yes | Role ARN |
| session issuer | Yes | Principal ARN |
| source | Partial | Source IP not always captured |

### GAPS IDENTIFIED

| Gap | Severity | Impact |
|-----|----------|--------|
| Failed AssumeRole filtered out | MEDIUM | Attack attempts invisible |
| No MFA tracking | LOW | MFA enforcement unknown |
| Cross-account requires CloudTrail in ALL accounts | HIGH | Multi-account gaps |

---

## 13. EVIDENCE QUALITY LAYER (MISSING)

### Specification (DataLayer.docx)

DataLayer.docx specifies that Cyntro must add an Evidence Quality Layer:

| Field | Required | Purpose |
|-------|----------|---------|
| source | Yes | Data source name |
| enabled | Yes | Whether source is active |
| coverage_days | Yes | Observation window |
| last_seen | Yes | Data freshness |
| confidence | Yes | Quality score |
| missing_reason | Yes | Why data is incomplete |

### Implementation Status: PARTIALLY IMPLEMENTED

The `ConfidenceSignals` interface exists in `lib/types.ts`:
```typescript
export interface ConfidenceSignals {
  control_plane_telemetry: boolean
  data_plane_telemetry: boolean
  usage_telemetry: boolean
  runtime_telemetry: boolean
  execution_triggers: boolean
  trust_graph: boolean
  resource_metadata: boolean
}
```

### GAPS IDENTIFIED (CRITICAL)

| Gap | Severity | Impact |
|-----|----------|--------|
| No coverage_days per source | HIGH | Observation window unknown |
| No last_seen per source | HIGH | Freshness tracking missing |
| No confidence per source | HIGH | Quality unknown |
| No missing_reason | MEDIUM | Cannot explain gaps |

---

## 14. CONSUMER-BASED SAFETY (MISSING)

### Specification (DataLayer.docx)

DataLayer.docx states:
> If role has EC2/Lambda AND no usage seen -> UNKNOWN, not unused

### Implementation Status: PARTIALLY IMPLEMENTED

Consumer detection exists in `SimulateFixSafety`:
```typescript
consumer_count?: number
shared?: boolean | null
shared_confidence?: "high" | "medium" | "unknown" | null
```

### GAPS IDENTIFIED (HIGH)

| Gap | Severity | Impact |
|-----|----------|--------|
| Consumer signal not driving safety decision | HIGH | May mark as "unused" when attached to EC2 |
| No UNKNOWN routing for attached but unseen | CRITICAL | DataLayer.docx: should be UNKNOWN |

---

## CRITICAL INTEGRATION GAPS

The DataLayer.docx concludes with the real problem:

> **Cyntro collects:**
> - identity data
> - network data
> - data access data
>
> **But decision system uses:**
> cloudtrail + partial flow logs

### Gap Analysis: Data Collection vs Decision Integration

| Data Source | Collected? | Used in Decisions? | Status |
|-------------|------------|-------------------|--------|
| CloudTrail | Yes | Yes | OK |
| IAM Policies | Yes | Yes | OK |
| VPC Flow Logs | Yes | Partial | GAP |
| Security Groups | Yes | Partial | GAP |
| Lambda | Yes | No | CRITICAL GAP |
| S3 Access | Yes | No | CRITICAL GAP |
| DynamoDB | Yes | Partial | GAP |
| RDS Query Logs | Yes | No | CRITICAL GAP |
| DSPM/Cyera | Yes | No | CRITICAL GAP |
| AWS Config | No | No | NOT IMPLEMENTED |
| Access Analyzer | No | No | NOT IMPLEMENTED |
| STS Sessions | Yes | Partial | GAP |

---

## RECOMMENDED FIXES (PRIORITY ORDER)

### P0 - Critical (Blocking Production)

1. **Integrate S3/RDS/DynamoDB into telemetry_coverage calculation**
   - Add `data_plane_telemetry` signal based on S3 access logs availability
   - Include in `visibility_integrity` score

2. **Add Consumer-Based Safety Gate**
   ```python
   if consumer_count > 0 and usage_events == 0:
       routing = "manual_review"  # UNKNOWN, not unused
       reasons.append("Role attached to compute but no activity observed")
   ```

3. **Integrate DSPM classifications into safety decisions**
   - If role accesses PII-classified data, require approval
   - Add `data_sensitivity_gate` to confidence scoring

### P1 - High (Required for Enterprise)

4. **Build AWS Config Collector**
   - Ingest ConfigRule violations
   - Create VIOLATES_CONFIG_RULE edges
   - Feed into compliance scoring

5. **Build Access Analyzer Integration**
   - Call `get_findings()` API
   - Create HAS_EXTERNAL_ACCESS edges
   - Block remediation if external access detected

6. **Add Evidence Quality Layer**
   - Track per-source: enabled, coverage_days, last_seen, confidence
   - Surface in UI for transparency

### P2 - Medium (Polish)

7. **Add missing CloudTrail fields**
   - sourceIPAddress, recipientAccountId, errorCode
   - requestParameters (filtered)

8. **Track REJECT traffic in Flow Logs**
   - Detect blocked attack attempts
   - Feed into threat intelligence

9. **Collect Lambda event sources and tags**
   - Complete dependency mapping
   - Ownership tracking

---

## FINAL MODEL ALIGNMENT

### DataLayer.docx Target Model:
```
Allowed Access
vs
Observed Behavior (multi-source)
vs
Ownership (consumers)
vs
Data Sensitivity
vs
Evidence Quality
```

### Current Implementation:
```
Allowed Access (IAM)
vs
Observed Behavior (CloudTrail only)
vs
Ownership (partial consumer detection)
vs
Data Sensitivity (NOT INTEGRATED)
vs
Evidence Quality (partial signals)
```

---

## CONCLUSION

**DataLayer.docx Assessment:** "Cyntro is NOT missing data. Cyntro is missing integration of data into decision-making."

**Audit Confirms:**
- 9 of 14 data sources are being collected
- Only 2 data sources (CloudTrail, IAM) are fully integrated into decisions
- 5 critical integration gaps exist
- 2 data sources (AWS Config, Access Analyzer) are not implemented

**Production Readiness:** NOT READY until P0 fixes complete

**Estimated Work:**
- P0 fixes: Integration changes in decision engine
- P1 fixes: New collector implementations
- P2 fixes: Field additions to existing collectors

---

## APPENDIX: FILE REFERENCES

| Component | File Path |
|-----------|-----------|
| CloudTrail Collector | `/collectors/cloudtrail_collector.py` |
| IAM Collector | `/collectors/extended_aws_collectors.py` |
| Flow Logs Aggregator | `/collectors/flowlogs_aggregator.py` |
| Security Group Collector | `/collectors/security_group_collector.py` |
| S3 Access Logs | `/collectors/s3_access_logs_collector.py` |
| DynamoDB Collector | `/collectors/dynamodb_access_collector.py` |
| RDS Query Logs | `/collectors/rds_query_logs_collector.py` |
| STS Sessions | `/collectors/sts_session_collector.py` |
| DSPM Integration | `/api/data_enforcement.py` |
| Confidence Scoring | `/api/remediation_confidence.py` |
| Frontend Types | `/lib/types.ts` |
