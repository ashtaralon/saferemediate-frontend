# Least Privilege User Guide

Complete guide for using the Least Privilege enforcement system.

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Dashboard Overview](#dashboard-overview)
4. [Analyzing Identities](#analyzing-identities)
5. [Understanding Confidence Scores](#understanding-confidence-scores)
6. [Running Simulations](#running-simulations)
7. [Enforcing Changes](#enforcing-changes)
8. [Managing Snapshots](#managing-snapshots)
9. [Monitoring Drift](#monitoring-drift)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

---

## Overview

### What is Least Privilege?

**Least Privilege** is a security principle where each identity (role, user) is granted only the minimum permissions necessary to perform its job.

### Why It Matters

- **Reduced Attack Surface**: Fewer permissions = smaller blast radius if compromised
- **Compliance**: Required by SOC 2, ISO 27001, PCI DSS, HIPAA
- **Security Best Practice**: Industry standard for cloud security

### How This Platform Helps

Unlike traditional tools that simply list unused permissions, this platform:

✅ **Proves safety** through evidence and simulation  
✅ **System-aware** - understands dependencies  
✅ **Reversible** - full snapshot/rollback capability  
✅ **Confident** - calculates enforcement confidence  
✅ **Continuous** - ongoing drift detection and remediation

---

## Getting Started

### Prerequisites

1. **AWS Access** - CloudTrail enabled in your AWS account
2. **Observation Period** - At least 30 days of CloudTrail data (90+ days recommended)
3. **Permissions** - Read access to IAM, CloudTrail, and resources

### Initial Setup

1. Navigate to the **Least Privilege** tab in the dashboard
2. Select your system (e.g., "alon-prod")
3. Wait for initial analysis to complete (1-2 minutes)

---

## Dashboard Overview

### Top Section: LP Score

```
┌─────────────────────────────────────────┐
│ Least Privilege Analysis                │
│                                          │
│                    System LP Score: 78% │
└─────────────────────────────────────────┘
```

**LP Score (0-100)**: Higher = better adherence to least privilege

- **90-100**: Excellent - minimal unused permissions
- **75-89**: Good - some opportunities for improvement
- **50-74**: Fair - significant unused permissions
- **0-49**: Poor - many unused permissions

### Summary Cards

Four key metrics at a glance:

1. **Total Resources** - Number of identities analyzed
2. **Excess Permissions** - Total count of unused permissions
3. **Network Issues** - Network-related permission issues
4. **Observation Days** - Days of data analyzed

---

## Analyzing Identities

### Resource Card Breakdown

Each identity (role/user) is shown as a card:

```
┌────────────────────────────────────────────────────────┐
│ 🛡️ example-role                    LP Score: 73% 🟡   │
│    alon-prod                       IAMRole             │
│                                                         │
│ Permission Usage                                       │
│ ████████████░░░░  18 used • 7 unused (28%)           │
│                                                         │
│ High-Risk Unused Permissions:                          │
│ ⚠️ s3:DeleteBucket (CRITICAL)                          │
│ ⚠️ iam:PassRole (CRITICAL)                             │
│                                                         │
│ 📊 90 days of CloudTrail, HIGH confidence              │
│                                           [View Detail]│
└────────────────────────────────────────────────────────┘
```

### LP Score Colors

- 🟢 **Green (75-100)**: Good least privilege adherence
- 🟡 **Yellow (50-74)**: Room for improvement
- 🔴 **Red (0-49)**: Significant issues

### Permission Bar

- **Green**: Used permissions (keep)
- **Red**: Unused permissions (candidates for removal)

---

## Understanding Confidence Scores

### What Confidence Means

**Confidence Score (0-100%)** = How safe is it to remove these permissions right now?

This is **NOT** a security severity score.  
It's an **execution confidence** score.

### Score Components

Confidence is calculated from 5 weighted components:

| Component | Weight | What It Measures |
|-----------|--------|------------------|
| **Usage Evidence** | 35% | Quality of non-usage data |
| **Time Coverage** | 25% | Length of observation period |
| **Source Completeness** | 20% | Number of data sources |
| **System Context** | 10% | System boundary understanding |
| **Simulation** | 10% | Simulation results (if run) |

### Decision Thresholds

```
90% ────────────────► AUTO-APPLY
         High confidence, safe to auto-enforce

75% ────────────────► CANARY
         Medium-high confidence, test on subset first

60% ────────────────► APPROVAL REQUIRED
         Medium confidence, needs human review

 0% ────────────────► MANUAL ONLY
         Low confidence, manual review recommended
```

### Factors Affecting Confidence

**Positive Factors:**
- ✅ Long observation period (90+ days)
- ✅ Multiple data sources (CloudTrail + Access Advisor)
- ✅ Clear non-usage pattern
- ✅ Successful simulation
- ✅ Non-production environment

**Negative Factors:**
- ❌ Short observation period (<30 days)
- ❌ Single data source only
- ❌ Production environment
- ❌ Revenue-generating system
- ❌ Compliance frameworks apply

---

## Running Simulations

### What Is Simulation?

Before removing permissions, the platform simulates:

1. **IAM Policy Diff** - Exact changes to be made
2. **Access Evaluation** - Will existing access break?
3. **Dependency Check** - Impact on other services
4. **Critical Paths** - Are critical workflows affected?

### How to Simulate

1. Click **View Detail** on a resource card
2. Navigate to the **Impact** tab
3. Click **Simulate** button
4. Wait for simulation to complete (5-10 seconds)

### Simulation Results

```
┌─────────────────────────────────────────┐
│ Simulation Result: ✅ SAFE               │
│                                          │
│ ✅ Reachability Preserved: 98%           │
│ ✅ Critical Paths: No impact             │
│ ✅ Services Tested: 7                    │
│ ✅ Permissions Safe: 7/7                 │
│                                          │
│ ⚠️ Warnings:                             │
│ • s3:DeleteBucket was never used         │
└─────────────────────────────────────────┘
```

### Simulation Statuses

- **SAFE** ✅ - No issues detected, safe to proceed
- **CAUTION** ⚠️ - Some warnings, review before proceeding
- **RISKY** 🔴 - Potential issues, manual review required
- **BLOCKED** ⛔ - Cannot safely proceed, do not enforce

---

## Enforcing Changes

### Enforcement Modes

#### 1. Auto-Apply (Confidence ≥ 90%)

```
┌─────────────────────────────────────────┐
│ ⚡ Auto-Apply                            │
│                                          │
│ Confidence: 94%                          │
│ • High confidence in safety              │
│ • Automatic snapshot created             │
│ • Auto-rollback on failure               │
│ • No approval needed                     │
│                              [Auto-Apply]│
└─────────────────────────────────────────┘
```

**When to use:**
- High confidence (≥90%)
- Non-production or well-understood systems
- Clear non-usage evidence

**What happens:**
1. Snapshot created automatically
2. Permissions removed
3. Health checks run
4. Auto-rollback if health checks fail

#### 2. Canary (Confidence 75-89%)

```
┌─────────────────────────────────────────┐
│ 🐦 Canary Deployment                     │
│                                          │
│ Confidence: 82%                          │
│ • Apply to subset first (20%)            │
│ • Monitor for 24 hours                   │
│ • Roll out to remainder if successful    │
│                           [Start Canary]│
└─────────────────────────────────────────┘
```

**When to use:**
- Medium-high confidence (75-89%)
- Production systems with redundancy
- Want to validate with subset first

**What happens:**
1. Apply to 20% of instances
2. Monitor metrics for 24 hours
3. If successful, roll out to remaining 80%
4. If failures detected, automatic rollback

#### 3. Approval Required (Confidence 60-74%)

```
┌─────────────────────────────────────────┐
│ ✋ Approval Required                     │
│                                          │
│ Confidence: 68%                          │
│ • Needs manager approval                 │
│ • Review evidence and simulation         │
│ • Manual execution after approval        │
│                      [Request Approval]│
└─────────────────────────────────────────┘
```

**When to use:**
- Medium confidence (60-74%)
- Production systems
- High-value or critical roles

**What happens:**
1. Request sent to approver
2. Approver reviews evidence
3. After approval, manual execution
4. Snapshot + rollback capability

#### 4. Manual Only (Confidence <60%)

```
┌─────────────────────────────────────────┐
│ 👤 Manual Review Only                    │
│                                          │
│ Confidence: 45%                          │
│ • Insufficient evidence                  │
│ • Manual review recommended              │
│ • Consider longer observation period     │
│                         [Export Policy]│
└─────────────────────────────────────────┘
```

**When to use:**
- Low confidence (<60%)
- Insufficient observation period
- Unclear usage patterns

**What to do:**
- Review evidence manually
- Consider waiting for more data
- Export proposed policy for manual review

### Enforcement Workflow

```
1. Select Resource
   └─> Click "View Detail"

2. Review Analysis
   └─> Check LP Score, unused permissions, evidence

3. Run Simulation
   └─> Click "Simulate" → Wait for results

4. Choose Enforcement Mode
   └─> Auto / Canary / Approval / Manual

5. Create Snapshot (automatic)
   └─> Immutable backup created

6. Apply Changes
   └─> Permissions updated in AWS

7. Validate
   └─> Health checks run automatically

8. [If validation fails]
   └─> Automatic rollback to snapshot
```

---

## Managing Snapshots

### What Are Snapshots?

**Snapshots** are immutable, encrypted backups of IAM state before changes.

Each snapshot contains:
- Full IAM policy documents
- Trust relationships
- Tags and metadata
- System relationships

### Viewing Snapshots

Navigate to **Snapshots** tab to see all snapshots:

```
┌────────────────────────────────────────────────────────┐
│ Snapshot: snap-abc123                                  │
│ Identity: arn:aws:iam::123456789012:role/example-role │
│ Created: 2025-12-24 21:00:00 UTC                       │
│ Reason: Pre-enforcement for recommendation rec-001     │
│ Checksum: def456...                                    │
│                                  [Restore] [Download]  │
└────────────────────────────────────────────────────────┘
```

### Creating Manual Snapshots

Before making manual changes outside the platform:

1. Navigate to identity detail page
2. Click **Create Snapshot**
3. Add reason (e.g., "Before manual policy edit")
4. Snapshot created with unique ID

### Restoring from Snapshot

#### Automatic Rollback

If enforcement fails validation, rollback is **automatic**:

```
Enforcement → Validation Failed → Auto-Rollback
                                   (2-5 seconds)
```

#### Manual Rollback

To manually restore a snapshot:

1. Navigate to **Snapshots** tab
2. Find the snapshot to restore
3. Click **Restore**
4. Confirm restoration
5. Wait for restoration to complete (5-10 seconds)
6. Verify restoration success

### Snapshot Metadata

Each snapshot includes:

- **ID**: Unique identifier (e.g., `snap-abc123`)
- **Checksum**: SHA-256 hash for integrity
- **Created At**: Timestamp
- **Created By**: User or system
- **Reason**: Why the snapshot was created
- **Encrypted**: Always true
- **Restorable**: Whether it can be restored
- **S3 Location**: Storage path (if applicable)

---

## Monitoring Drift

### What Is Drift?

**Drift** = Changes to IAM permissions made outside the Least Privilege platform.

Examples:
- Permissions manually added
- Policies edited via console
- Roles created without least privilege

### Drift Detection

The platform continuously monitors for drift:

```
Every 24 hours:
  For each managed identity:
    1. Fetch current policy
    2. Compare to last snapshot
    3. Detect changes
    4. Classify drift severity
    5. Recommend action
```

### Drift Types

| Type | Example | Action |
|------|---------|--------|
| **New Unused Permission** | `s3:DeleteBucket` added | Auto-remove if confidence ≥90% |
| **Permission Became Unused** | Used permission now inactive 90+ days | Flag for removal |
| **Wildcard Introduced** | `s3:*` replaces `s3:GetObject` | Alert + recommend narrowing |
| **Manual Policy Change** | Policy edited outside platform | Alert + optionally revert |

### Drift Alerts

```
┌─────────────────────────────────────────┐
│ ⚠️ Drift Detected                        │
│                                          │
│ Identity: example-role                   │
│ Type: New Permissions                    │
│ Added: s3:PutObject                      │
│ Detected: 2025-12-24 21:00:00 UTC        │
│ Significance: MEDIUM                     │
│                                          │
│ Recommended: Alert                       │
│                    [Review] [Auto-Fix]  │
└─────────────────────────────────────────┘
```

### Continuous Enforcement

Enable continuous enforcement for automatic drift remediation:

1. Navigate to **Settings** → **Continuous Enforcement**
2. Enable for selected systems
3. Set confidence threshold (e.g., ≥90% for auto-remediate)
4. Configure scan interval (e.g., every 24 hours)
5. Enable/disable auto-remediation

**Continuous enforcement will:**
- ✅ Detect new unused permissions
- ✅ Auto-remove if confidence ≥ threshold
- ✅ Create snapshots before changes
- ✅ Alert on manual modifications
- ✅ Track LP score trends over time

---

## Best Practices

### 1. Start with Non-Production

- Begin with dev/sandbox environments
- Build confidence with the platform
- Understand workflows before production

### 2. Ensure Sufficient Observation

- **Minimum**: 30 days of CloudTrail
- **Recommended**: 90+ days
- **Ideal**: 180+ days for seasonal patterns

### 3. Enable Multiple Data Sources

- ✅ CloudTrail (API activity)
- ✅ Access Advisor (last-accessed data)
- ✅ VPC Flow Logs (network evidence)
- ✅ Resource Policies (S3, KMS, etc.)

### 4. Run Simulations First

- **Always** simulate before enforcing
- Review simulation warnings carefully
- Check critical paths impact

### 5. Use Appropriate Enforcement Mode

| Environment | Recommended Mode |
|-------------|------------------|
| **Sandbox** | Auto-Apply (≥90%) |
| **Development** | Auto-Apply (≥90%) or Canary (≥75%) |
| **Staging** | Canary (≥75%) |
| **Production** | Approval Required (≥60%) or Canary (≥75%) |

### 6. Review High-Risk Permissions

Prioritize removal of:
- ❌ `iam:PassRole` (privilege escalation)
- ❌ `*:Delete*` (destructive actions)
- ❌ `*:Terminate*` (resource termination)
- ❌ Wildcard resources (`*`)
- ❌ Admin permissions

### 7. Monitor LP Score Trends

Track LP score over time:
- Target: 80+ for production systems
- Target: 90+ for non-production
- Investigate sudden drops

### 8. Document Exceptions

If keeping unused permissions for valid reasons:
- Document in role description
- Add tags (e.g., `lp-exception:seasonal`)
- Review periodically

### 9. Regular Drift Reviews

- Review drift alerts weekly
- Investigate manual changes
- Re-enforce least privilege as needed

### 10. Compliance Reporting

Generate compliance reports regularly:
- SOC 2 audits
- ISO 27001 reviews
- PCI DSS assessments
- Internal security reviews

---

## Troubleshooting

### "Insufficient Observation Period"

**Problem**: Confidence score is low due to short observation period.

**Solution:**
- Wait for more CloudTrail data (aim for 90+ days)
- Check CloudTrail is enabled in all regions
- Ensure CloudTrail logs are not being deleted

### "Single Data Source"

**Problem**: Only CloudTrail is enabled, limiting confidence.

**Solution:**
- Enable IAM Access Advisor
- Enable VPC Flow Logs (for network evidence)
- Integrate with AWS Config (for policy history)

### "Production Environment - Extra Caution"

**Problem**: Confidence score capped at 70% for production.

**Solution:**
- This is intentional for safety
- Use Canary or Approval modes for production
- Consider promoting changes through environments (dev → staging → prod)

### "Simulation Failed"

**Problem**: Simulation could not run or returned errors.

**Solution:**
- Check IAM permissions for simulation role
- Verify resource policies allow simulation
- Review simulation error details
- Contact support if issue persists

### "Rollback Failed"

**Problem**: Automatic rollback did not complete.

**Solution:**
- Check IAM permissions for rollback role
- Manually restore from snapshot
- Verify snapshot integrity (checksum)
- Check AWS API limits

### "LP Score Not Improving"

**Problem**: LP score remains low despite removals.

**Solution:**
- Check for new unused permissions (drift)
- Verify permissions were actually removed
- Review system dependencies
- Check for shared roles (split into dedicated roles)

### "False Positive - Permission Is Needed"

**Problem**: Platform recommends removing a permission that's actually needed.

**Solution:**
- Check if usage is seasonal or periodic
- Review last-used date
- Classify as "exception" with tags
- Investigate why usage wasn't detected (data source issue?)

### "Can't Find Identity"

**Problem**: Identity not showing in dashboard.

**Solution:**
- Verify identity exists in selected system
- Check system name filter
- Ensure identity has policies attached
- Refresh data (may take 1-2 minutes)

---

## Getting Help

### Documentation

- **Architecture**: `/LEAST_PRIVILEGE_ARCHITECTURE.md`
- **API Reference**: `/LEAST_PRIVILEGE_API.md`
- **User Guide**: This document

### Support Channels

- **Email**: support@cyntro.com
- **Slack**: #least-privilege channel
- **Documentation**: https://docs.cyntro.com

### Reporting Issues

When reporting issues, include:

1. Identity ARN
2. System name
3. Observation period
4. Confidence score
5. Error messages
6. Screenshots (if applicable)

---

## Appendix: Glossary

**LP Score**: Least Privilege Score (0-100, higher = better)

**Confidence Score**: Execution confidence for safe enforcement (0-100%)

**Evidence**: Usage data from CloudTrail, Access Advisor, etc.

**Drift**: Changes made outside the Least Privilege platform

**Snapshot**: Immutable backup of IAM state before changes

**Rollback**: Restore to previous snapshot state

**Simulation**: Pre-change analysis of impact

**System-Aware**: Understanding permissions in system context

**Canary**: Gradual rollout to subset before full deployment

**Classification**: Categorizing permissions (Active/Inactive, Required/Safe)

**Attack Surface**: Total permissions that could be exploited

---

**Last Updated:** 2025-12-24  
**Version:** 1.0  
**Feedback:** support@cyntro.com
