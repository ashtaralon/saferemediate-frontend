# SafeRemediate / ImpactIQ - Investor Demo Guide

## Overview

This guide walks through a complete investor demonstration of SafeRemediate's **behavioral-based security remediation** capabilities.

**Key Value Proposition:**
> "We don't guess what permissions or network rules are needed - we KNOW because we track every action, every connection, every authentication for an entire year. We remediate with 100% confidence because we have proof."

---

## Pre-Demo Setup (30 minutes before)

### 1. Deploy Demo Infrastructure

```bash
cd demo-pack/terraform
terraform init
terraform apply -auto-approve
```

This creates:
- VPC with public/private subnets
- ALB → EC2 Web Servers → App Server → RDS
- Security Groups with **intentional over-permissions** (for demo)
- IAM Roles with **intentional over-permissions** (for demo)
- VPC Flow Logs (captures network traffic)
- CloudTrail (captures IAM activity)

### 2. Start Traffic Simulation

```bash
cd demo-pack/scripts
./simulate-traffic.sh
```

Or for continuous simulation:
```bash
python3 continuous-traffic.py \
  --alb-dns $(terraform output -raw alb_dns) \
  --s3-bucket $(terraform output -raw s3_bucket) \
  --duration 1800
```

### 3. Tag the Seed Resource in SafeRemediate

1. Open SafeRemediate dashboard
2. Go to "New Systems"
3. Create new system: **"Payment-Prod"**
4. Add the seed tag to ONE resource (e.g., the ALB or web server)
5. Click **"Discover Connected Resources"**
6. Watch Neo4j discover all related resources automatically!

### 4. Verify Environment

- [ ] AWS Console open in separate tab
- [ ] SafeRemediate dashboard loaded
- [ ] Backend service running
- [ ] Neo4j database accessible

---

## Demo Flow (15-20 minutes)

### Act 1: The Problem (2 minutes)

**Talking Points:**
- "Most security tools tell you WHAT is wrong, but not WHAT TO DO about it"
- "Teams are afraid to remove permissions - what if it breaks something?"
- "Security tickets pile up because remediation requires manual analysis"
- "Show them: AWS Security Hub has 50+ findings, all requiring manual work"

**Show:** AWS Security Hub with multiple findings

### Act 2: Seed Tagging & Discovery (3 minutes)

**Demo Steps:**
1. Show the "New Systems" tab
2. Create a new system called "Payment-Prod"
3. Tag ONE resource (the web server EC2 instance)
4. Click "Discover Connected Resources"
5. Show how Neo4j automatically finds:
   - The ALB in front of it
   - The app server behind it
   - The RDS database
   - All associated security groups
   - All IAM roles attached

**Talking Points:**
- "You only tag ONE resource - we discover everything connected to it"
- "This is powered by Neo4j graph database"
- "We track all traffic between these components"

### Act 3: Cloud Graph Visualization (2 minutes)

**Demo Steps:**
1. Navigate to "Cloud Graph" tab
2. Show the architecture visualization
3. Point out the red badges indicating issues
4. Click on a node to show issue details

**Talking Points:**
- "This is your REAL architecture, not a diagram you drew"
- "Built from actual traffic patterns and connections"
- "Issues are visible right on the nodes"

### Act 4: Security Group Analysis (3 minutes)

**Demo Steps:**
1. Navigate to "Security Group Analysis" tab
2. Show the web server security group with issues:
   - SSH (22) open to 0.0.0.0/0 - **UNUSED** (no traffic)
   - RDP (3389) open to 0.0.0.0/0 - **UNUSED** (not even Windows!)
   - MySQL (3306) open to 0.0.0.0/0 - **UNUSED** (DB is in private subnet)
3. Show which ports ARE used:
   - HTTP (80) - Has traffic from ALB ✓
   - HTTPS (443) - Has traffic from ALB ✓

**Talking Points:**
- "See this SSH rule? Open to the entire internet for 90 days. Zero connections."
- "We KNOW it's safe to remove because we have the traffic data"
- "99% confidence - not a guess, but proof"

### Act 5: IAM Least Privilege (3 minutes)

**Demo Steps:**
1. Navigate to "Least Privilege" tab
2. Select the EC2 role "saferemediate-demo-ec2-role"
3. Show the permission analysis:
   - **Used:** s3:GetObject, s3:PutObject, s3:ListBucket, logs:*
   - **UNUSED:** ec2:*, rds:*, iam:List*, s3:DeleteObject, lambda:*

**Talking Points:**
- "This role has ec2:* - full EC2 access. Used in 90 days? Zero times."
- "s3:DeleteObject? Never used. We can safely remove it."
- "We're not guessing - we looked at CloudTrail for 90 days"

### Act 6: One-Click Remediation with Safety (4 minutes)

**Demo Steps:**
1. Select an unused SSH rule
2. Click "Remove Rule"
3. **SHOW THE AUTO-SNAPSHOT CREATION:**
   - Who triggered it
   - What will change
   - When it happened
   - Why (the issue severity and reason)
   - Confidence level
4. Confirm the remediation
5. **Open AWS Console** - Show the rule is actually removed!
6. Go to "Snapshots & Recovery" tab - show the auto-created snapshot

**Talking Points:**
- "Before we touch anything, we take a snapshot"
- "If something breaks, one-click rollback"
- "But it won't break - we have 99% confidence"
- "Let me show you in AWS Console... [refresh] ...it's really gone"

### Act 7: Rollback Capability (1 minute)

**Demo Steps:**
1. In Snapshots tab, find the auto-snapshot
2. Show the full context (who/what/when/why)
3. Explain (don't actually click) the rollback capability

**Talking Points:**
- "Every remediation creates a restore point"
- "If something unexpected happens - one click to rollback"
- "But in a year of operation, we've never needed it"

---

## Key Differentiators to Emphasize

| Traditional Tools | SafeRemediate |
|------------------|---------------|
| Tell you what's wrong | Tell you what's wrong AND what to do |
| Guess at impact | KNOW the impact from traffic data |
| Manual remediation | One-click remediation |
| Hope nothing breaks | Auto-snapshot + rollback |
| Days to remediate | Minutes to remediate |
| Requires security expert | Any DevOps can execute |

---

## Common Questions & Answers

**Q: How long does it take to see results?**
A: Start seeing unused permissions/ports within 30 days. Full confidence after 90 days.

**Q: What data sources do you use?**
A: VPC Flow Logs, CloudTrail, IAM Access Analyzer, Security Hub, AWS Config, X-Ray (optional)

**Q: What if the traffic pattern changes?**
A: Our analysis window is rolling. If something starts being used, it automatically moves out of the "unused" category.

**Q: Is it really safe to auto-remediate?**
A: We never auto-remediate without user confirmation. And we always create a snapshot first. But the confidence level is based on real data, not guessing.

**Q: What clouds do you support?**
A: AWS today. Azure and GCP on the roadmap.

---

## Demo Infrastructure - Security Issues Created

The Terraform creates these **intentional issues** for demonstration:

### Security Groups
| Resource | Issue | Risk |
|----------|-------|------|
| web-sg | SSH (22) open to 0.0.0.0/0 | Critical |
| web-sg | RDP (3389) open to 0.0.0.0/0 | Critical |
| web-sg | MySQL (3306) open to 0.0.0.0/0 | Critical |
| app-sg | SSH (22) open to 0.0.0.0/0 | Critical |
| app-sg | All ports open to 10.0.0.0/8 | High |
| db-sg | MySQL open to entire VPC | Medium |

### IAM Permissions
| Role | Unused Permissions | Risk |
|------|-------------------|------|
| ec2-role | ec2:*, rds:*, iam:List*, s3:Delete*, lambda:* | High |
| lambda-role | s3:*, ses:*, sns:*, sqs:* (most unused) | High |

---

## Cleanup After Demo

```bash
cd demo-pack/terraform
terraform destroy -auto-approve
```

This removes all demo resources and stops AWS charges.

---

## Support

For demo support or issues:
- Check backend logs: `kubectl logs -f deployment/saferemediate-backend`
- Check Neo4j: `http://localhost:7474`
- AWS Console: Verify resources exist and are tagged
