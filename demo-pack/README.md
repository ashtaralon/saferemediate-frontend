# SafeRemediate Demo Pack

Complete demo setup for investor presentations demonstrating behavioral-based security remediation.

## Quick Start

```bash
# 1. Setup (creates AWS infrastructure)
./scripts/setup-demo.sh

# 2. Run traffic simulation
./scripts/simulate-traffic.sh

# Or continuous simulation:
python3 scripts/continuous-traffic.py \
  --alb-dns <your-alb-dns> \
  --s3-bucket <your-bucket> \
  --duration 1800

# 3. Open SafeRemediate dashboard
npm run dev
# Navigate to http://localhost:3000
```

## What's Included

### Terraform (`/terraform`)
- 3-tier AWS architecture (ALB → EC2 → RDS)
- VPC with public/private subnets
- Security Groups with **intentional issues** for demo
- IAM Roles with **intentional over-permissions** for demo
- VPC Flow Logs (captures network traffic)
- CloudTrail (captures IAM activity)

### Scripts (`/scripts`)
- `setup-demo.sh` - One-click infrastructure deployment
- `simulate-traffic.sh` - Generate traffic patterns
- `continuous-traffic.py` - Long-running traffic simulation
- `cleanup-demo.sh` - Remove all AWS resources

### Documentation (`/docs`)
- `DEMO-GUIDE.md` - Complete investor presentation guide

## Demo Flow

1. **Tag ONE seed resource** → Neo4j discovers all connected resources
2. **Show Cloud Graph** → Real architecture from Neo4j
3. **Security Group Analysis** → Show unused ports (99% confidence)
4. **Least Privilege** → Show unused IAM permissions
5. **One-click remediation** → Auto-snapshot created
6. **Verify in AWS Console** → Changes are REAL

## Security Issues Created (for demo)

| Resource | Issue | Confidence |
|----------|-------|------------|
| web-sg | SSH (22) open to 0.0.0.0/0 | 99% UNUSED |
| web-sg | RDP (3389) open to 0.0.0.0/0 | 99% UNUSED |
| ec2-role | ec2:*, rds:*, iam:List* | 99% UNUSED |
| lambda-role | ses:*, sns:*, sqs:* | 99% UNUSED |

## Cleanup

```bash
./scripts/cleanup-demo.sh
# Or manually:
cd terraform && terraform destroy -auto-approve
```

## Requirements

- AWS CLI configured
- Terraform >= 1.0
- Python 3.8+
- Node.js 18+
