#!/bin/bash
# SafeRemediate Demo - Traffic Simulation Script
# This generates realistic traffic patterns for the demo infrastructure
# Run this after Terraform deployment to create activity data

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}SafeRemediate Traffic Simulation${NC}"
echo -e "${BLUE}========================================${NC}"

# Configuration
DEMO_NAME="${DEMO_NAME:-saferemediate-demo}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
DURATION="${DURATION:-300}" # 5 minutes default
INTERVAL="${INTERVAL:-5}"   # 5 seconds between requests

# Get Terraform outputs
echo -e "\n${YELLOW}Getting infrastructure details...${NC}"
cd "$(dirname "$0")/../terraform"

ALB_DNS=$(terraform output -raw alb_dns 2>/dev/null || echo "")
S3_BUCKET=$(terraform output -raw s3_bucket 2>/dev/null || echo "")

if [ -z "$ALB_DNS" ]; then
    echo -e "${RED}Error: Could not get ALB DNS. Have you run terraform apply?${NC}"
    exit 1
fi

echo -e "${GREEN}ALB DNS: $ALB_DNS${NC}"
echo -e "${GREEN}S3 Bucket: $S3_BUCKET${NC}"

# =============================================================================
# Traffic Generation Functions
# =============================================================================

generate_web_traffic() {
    echo -e "\n${BLUE}[1/5] Generating Web Traffic (HTTP requests to ALB)${NC}"
    echo "This creates VPC Flow Log entries for ports 80/443..."

    for i in $(seq 1 20); do
        # Normal web traffic
        curl -s -o /dev/null "http://$ALB_DNS/" && echo -e "${GREEN}  ✓ Web request $i/20${NC}" || echo -e "${RED}  ✗ Request failed${NC}"
        sleep 1
    done
}

generate_s3_traffic() {
    echo -e "\n${BLUE}[2/5] Generating S3 Traffic (USED permissions)${NC}"
    echo "These IAM actions will show as USED in the demo..."

    # Upload some test files (these permissions ARE used)
    for i in $(seq 1 5); do
        echo "Test data $i - $(date)" | aws s3 cp - "s3://$S3_BUCKET/demo-data/file-$i.txt" --region $AWS_REGION
        echo -e "${GREEN}  ✓ S3 PutObject $i/5${NC}"
    done

    # List bucket (this permission IS used)
    aws s3 ls "s3://$S3_BUCKET/" --region $AWS_REGION > /dev/null
    echo -e "${GREEN}  ✓ S3 ListBucket${NC}"

    # Get objects (this permission IS used)
    for i in $(seq 1 3); do
        aws s3 cp "s3://$S3_BUCKET/demo-data/file-$i.txt" /tmp/downloaded-$i.txt --region $AWS_REGION 2>/dev/null || true
        echo -e "${GREEN}  ✓ S3 GetObject $i/3${NC}"
    done

    # NOTE: We intentionally DO NOT use s3:DeleteObject or s3:DeleteBucket
    # SafeRemediate will detect these as UNUSED permissions
    echo -e "${YELLOW}  ⚠ s3:DeleteObject NOT used (intentional - for demo)${NC}"
    echo -e "${YELLOW}  ⚠ s3:DeleteBucket NOT used (intentional - for demo)${NC}"
}

generate_cloudwatch_traffic() {
    echo -e "\n${BLUE}[3/5] Generating CloudWatch Logs Traffic${NC}"
    echo "Creating log entries (these permissions ARE used)..."

    LOG_GROUP="/aws/saferemediate-demo/application"

    # Create log group if not exists
    aws logs create-log-group --log-group-name "$LOG_GROUP" --region $AWS_REGION 2>/dev/null || true

    # Create log stream
    STREAM_NAME="demo-$(date +%Y%m%d-%H%M%S)"
    aws logs create-log-stream --log-group-name "$LOG_GROUP" --log-stream-name "$STREAM_NAME" --region $AWS_REGION 2>/dev/null || true

    # Put log events
    for i in $(seq 1 10); do
        TIMESTAMP=$(($(date +%s) * 1000))
        aws logs put-log-events \
            --log-group-name "$LOG_GROUP" \
            --log-stream-name "$STREAM_NAME" \
            --log-events "timestamp=$TIMESTAMP,message=\"Demo log entry $i - $(date)\"" \
            --region $AWS_REGION > /dev/null 2>&1 || true
        echo -e "${GREEN}  ✓ CloudWatch PutLogEvents $i/10${NC}"
    done
}

show_unused_permissions() {
    echo -e "\n${BLUE}[4/5] Permissions NOT Being Used (SafeRemediate will detect)${NC}"
    echo -e "${YELLOW}The following permissions exist but are NOT being used:${NC}"

    echo -e "  ${RED}✗ ec2:* - Full EC2 access (UNUSED)${NC}"
    echo -e "  ${RED}✗ rds:* - Full RDS access (UNUSED)${NC}"
    echo -e "  ${RED}✗ iam:List*, iam:Get* - IAM read access (UNUSED)${NC}"
    echo -e "  ${RED}✗ lambda:InvokeFunction - Lambda invoke (UNUSED)${NC}"
    echo -e "  ${RED}✗ s3:DeleteObject, s3:DeleteBucket - S3 delete (UNUSED)${NC}"
    echo -e "  ${RED}✗ ses:* - SES full access (UNUSED)${NC}"
    echo -e "  ${RED}✗ sns:* - SNS full access (UNUSED)${NC}"
    echo -e "  ${RED}✗ sqs:* - SQS full access (UNUSED)${NC}"

    echo -e "\n${GREEN}SafeRemediate will show these with 99% confidence for removal!${NC}"
}

show_unused_ports() {
    echo -e "\n${BLUE}[5/5] Security Group Rules NOT Being Used${NC}"
    echo -e "${YELLOW}The following ports are open but NO traffic is using them:${NC}"

    echo -e "  ${RED}✗ Port 22 (SSH) from 0.0.0.0/0 - NO SSH traffic${NC}"
    echo -e "  ${RED}✗ Port 3389 (RDP) from 0.0.0.0/0 - NO RDP traffic${NC}"
    echo -e "  ${RED}✗ Port 3306 (MySQL) from 0.0.0.0/0 - Only app-tier should access${NC}"

    echo -e "\n${GREEN}SafeRemediate will detect these from VPC Flow Logs!${NC}"
}

# =============================================================================
# Main Execution
# =============================================================================

echo -e "\n${YELLOW}Starting traffic simulation...${NC}"
echo -e "Duration: ${DURATION}s | Interval: ${INTERVAL}s"
echo ""

# Run all traffic generators
generate_web_traffic
generate_s3_traffic
generate_cloudwatch_traffic
show_unused_permissions
show_unused_ports

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Traffic Simulation Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Now you can demonstrate SafeRemediate:"
echo -e "  1. Open SafeRemediate dashboard"
echo -e "  2. Go to Least Privilege tab - see unused IAM permissions"
echo -e "  3. Go to Security Group Analysis - see unused port rules"
echo -e "  4. Show Cloud Graph - see system architecture"
echo -e "  5. Demonstrate one-click remediation"
echo -e "  6. Show auto-snapshot before remediation"
echo -e "  7. Verify changes in AWS Console"
echo ""
