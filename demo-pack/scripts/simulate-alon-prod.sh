#!/bin/bash
# SafeRemediate Traffic Simulation for alon-prod
# Generates REAL traffic to your AWS resources for analysis

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SYSTEM_NAME="${SYSTEM_NAME:-alon-prod}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
DURATION="${DURATION:-300}"  # 5 minutes default

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}SafeRemediate Traffic Simulation${NC}"
echo -e "${BLUE}System: ${CYAN}$SYSTEM_NAME${NC}"
echo -e "${BLUE}========================================${NC}"

# Check AWS credentials
echo -e "\n${YELLOW}Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    echo "Run: aws configure"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}AWS Account: $ACCOUNT_ID${NC}"
echo -e "${GREEN}Region: $AWS_REGION${NC}"

# =============================================================================
# DISCOVER RESOURCES
# =============================================================================

echo -e "\n${BLUE}[1/6] Discovering resources tagged with SystemName=$SYSTEM_NAME...${NC}"

# Find S3 buckets
echo -e "\n${YELLOW}Looking for S3 buckets...${NC}"
S3_BUCKETS=$(aws s3api list-buckets --query 'Buckets[*].Name' --output text 2>/dev/null || echo "")
if [ -n "$S3_BUCKETS" ]; then
    echo -e "${GREEN}  Found buckets: $(echo $S3_BUCKETS | wc -w)${NC}"
else
    echo -e "${YELLOW}  No S3 buckets found${NC}"
fi

# Find EC2 instances
echo -e "\n${YELLOW}Looking for EC2 instances...${NC}"
EC2_INSTANCES=$(aws ec2 describe-instances \
    --filters "Name=tag:SystemName,Values=$SYSTEM_NAME" \
    --query 'Reservations[*].Instances[*].InstanceId' \
    --output text 2>/dev/null || echo "")
if [ -n "$EC2_INSTANCES" ]; then
    echo -e "${GREEN}  Found instances: $EC2_INSTANCES${NC}"
else
    # Try without filter
    EC2_INSTANCES=$(aws ec2 describe-instances \
        --query 'Reservations[*].Instances[*].InstanceId' \
        --output text 2>/dev/null | head -5 || echo "")
    if [ -n "$EC2_INSTANCES" ]; then
        echo -e "${YELLOW}  Found instances (untagged): $EC2_INSTANCES${NC}"
    fi
fi

# Find Security Groups
echo -e "\n${YELLOW}Looking for Security Groups...${NC}"
SECURITY_GROUPS=$(aws ec2 describe-security-groups \
    --query 'SecurityGroups[*].GroupId' \
    --output text 2>/dev/null | head -10 || echo "")
if [ -n "$SECURITY_GROUPS" ]; then
    echo -e "${GREEN}  Found security groups: $(echo $SECURITY_GROUPS | wc -w)${NC}"
fi

# Find IAM Roles
echo -e "\n${YELLOW}Looking for IAM roles...${NC}"
IAM_ROLES=$(aws iam list-roles \
    --query 'Roles[?contains(RoleName, `alon`) || contains(RoleName, `SafeRemediate`) || contains(RoleName, `Lambda`)].RoleName' \
    --output text 2>/dev/null || echo "")
if [ -n "$IAM_ROLES" ]; then
    echo -e "${GREEN}  Found relevant roles: $IAM_ROLES${NC}"
else
    IAM_ROLES=$(aws iam list-roles --query 'Roles[0:5].RoleName' --output text 2>/dev/null || echo "")
    echo -e "${YELLOW}  Using first 5 roles: $IAM_ROLES${NC}"
fi

# Find Lambda functions
echo -e "\n${YELLOW}Looking for Lambda functions...${NC}"
LAMBDA_FUNCTIONS=$(aws lambda list-functions \
    --query 'Functions[*].FunctionName' \
    --output text 2>/dev/null | head -5 || echo "")
if [ -n "$LAMBDA_FUNCTIONS" ]; then
    echo -e "${GREEN}  Found functions: $LAMBDA_FUNCTIONS${NC}"
fi

# =============================================================================
# GENERATE S3 TRAFFIC (CloudTrail will log this)
# =============================================================================

echo -e "\n${BLUE}[2/6] Generating S3 traffic (creates CloudTrail events)...${NC}"

for bucket in $S3_BUCKETS; do
    echo -e "${CYAN}  Bucket: $bucket${NC}"

    # ListBucket - this IS used
    aws s3 ls "s3://$bucket/" --region $AWS_REGION > /dev/null 2>&1 && \
        echo -e "${GREEN}    ✓ s3:ListBucket${NC}" || \
        echo -e "${YELLOW}    - s3:ListBucket (access denied)${NC}"

    # PutObject - upload test file
    echo "SafeRemediate traffic simulation $(date)" | \
        aws s3 cp - "s3://$bucket/saferemediate-test/traffic-$(date +%s).txt" --region $AWS_REGION 2>/dev/null && \
        echo -e "${GREEN}    ✓ s3:PutObject${NC}" || \
        echo -e "${YELLOW}    - s3:PutObject (access denied)${NC}"

    # GetObject - read test files
    aws s3 ls "s3://$bucket/saferemediate-test/" --region $AWS_REGION 2>/dev/null | head -1 | while read line; do
        file=$(echo $line | awk '{print $4}')
        if [ -n "$file" ]; then
            aws s3 cp "s3://$bucket/saferemediate-test/$file" /dev/null 2>/dev/null && \
                echo -e "${GREEN}    ✓ s3:GetObject${NC}"
        fi
    done

    # NOTE: We intentionally do NOT use s3:DeleteObject
    echo -e "${RED}    ✗ s3:DeleteObject (NOT USED - SafeRemediate will detect)${NC}"

    break  # Only process first bucket
done

# =============================================================================
# GENERATE IAM API CALLS (CloudTrail will log this)
# =============================================================================

echo -e "\n${BLUE}[3/6] Generating IAM API calls (creates CloudTrail events)...${NC}"

for role in $IAM_ROLES; do
    echo -e "${CYAN}  Role: $role${NC}"

    # GetRole - commonly used
    aws iam get-role --role-name "$role" > /dev/null 2>&1 && \
        echo -e "${GREEN}    ✓ iam:GetRole${NC}" || \
        echo -e "${YELLOW}    - iam:GetRole (access denied)${NC}"

    # ListRolePolicies - commonly used
    aws iam list-role-policies --role-name "$role" > /dev/null 2>&1 && \
        echo -e "${GREEN}    ✓ iam:ListRolePolicies${NC}" || \
        echo -e "${YELLOW}    - iam:ListRolePolicies (access denied)${NC}"

    # ListAttachedRolePolicies - commonly used
    aws iam list-attached-role-policies --role-name "$role" > /dev/null 2>&1 && \
        echo -e "${GREEN}    ✓ iam:ListAttachedRolePolicies${NC}" || \
        echo -e "${YELLOW}    - iam:ListAttachedRolePolicies (access denied)${NC}"
done

# List users (read-only, commonly used)
aws iam list-users --max-items 5 > /dev/null 2>&1 && \
    echo -e "${GREEN}  ✓ iam:ListUsers${NC}" || \
    echo -e "${YELLOW}  - iam:ListUsers (access denied)${NC}"

# NOTE: We intentionally do NOT use dangerous IAM actions
echo -e "${RED}  ✗ iam:CreateRole (NOT USED - SafeRemediate will detect)${NC}"
echo -e "${RED}  ✗ iam:DeleteRole (NOT USED - SafeRemediate will detect)${NC}"
echo -e "${RED}  ✗ iam:AttachRolePolicy (NOT USED - SafeRemediate will detect)${NC}"

# =============================================================================
# GENERATE EC2 API CALLS
# =============================================================================

echo -e "\n${BLUE}[4/6] Generating EC2 API calls...${NC}"

# Describe instances - commonly used
aws ec2 describe-instances --max-results 10 > /dev/null 2>&1 && \
    echo -e "${GREEN}  ✓ ec2:DescribeInstances${NC}" || \
    echo -e "${YELLOW}  - ec2:DescribeInstances (access denied)${NC}"

# Describe security groups - commonly used
aws ec2 describe-security-groups --max-results 10 > /dev/null 2>&1 && \
    echo -e "${GREEN}  ✓ ec2:DescribeSecurityGroups${NC}" || \
    echo -e "${YELLOW}  - ec2:DescribeSecurityGroups (access denied)${NC}"

# Describe VPCs
aws ec2 describe-vpcs > /dev/null 2>&1 && \
    echo -e "${GREEN}  ✓ ec2:DescribeVpcs${NC}" || \
    echo -e "${YELLOW}  - ec2:DescribeVpcs (access denied)${NC}"

# NOTE: We intentionally do NOT use dangerous EC2 actions
echo -e "${RED}  ✗ ec2:RunInstances (NOT USED - SafeRemediate will detect)${NC}"
echo -e "${RED}  ✗ ec2:TerminateInstances (NOT USED - SafeRemediate will detect)${NC}"

# =============================================================================
# GENERATE LAMBDA INVOCATIONS
# =============================================================================

echo -e "\n${BLUE}[5/6] Generating Lambda API calls...${NC}"

for func in $LAMBDA_FUNCTIONS; do
    echo -e "${CYAN}  Function: $func${NC}"

    # GetFunction - commonly used
    aws lambda get-function --function-name "$func" > /dev/null 2>&1 && \
        echo -e "${GREEN}    ✓ lambda:GetFunction${NC}" || \
        echo -e "${YELLOW}    - lambda:GetFunction (access denied)${NC}"

    # ListTags
    aws lambda list-tags --resource "arn:aws:lambda:$AWS_REGION:$ACCOUNT_ID:function:$func" > /dev/null 2>&1 && \
        echo -e "${GREEN}    ✓ lambda:ListTags${NC}" || \
        echo -e "${YELLOW}    - lambda:ListTags${NC}"
done

# NOTE: We intentionally do NOT invoke functions to avoid side effects
echo -e "${RED}  ✗ lambda:InvokeFunction (NOT USED without explicit request)${NC}"

# =============================================================================
# GENERATE CLOUDWATCH API CALLS
# =============================================================================

echo -e "\n${BLUE}[6/6] Generating CloudWatch API calls...${NC}"

# List log groups - commonly used
aws logs describe-log-groups --limit 5 > /dev/null 2>&1 && \
    echo -e "${GREEN}  ✓ logs:DescribeLogGroups${NC}" || \
    echo -e "${YELLOW}  - logs:DescribeLogGroups (access denied)${NC}"

# Create a test log entry
LOG_GROUP="/aws/saferemediate/$SYSTEM_NAME"
aws logs create-log-group --log-group-name "$LOG_GROUP" 2>/dev/null || true
aws logs create-log-stream --log-group-name "$LOG_GROUP" --log-stream-name "traffic-sim-$(date +%Y%m%d)" 2>/dev/null || true

TIMESTAMP=$(($(date +%s) * 1000))
aws logs put-log-events \
    --log-group-name "$LOG_GROUP" \
    --log-stream-name "traffic-sim-$(date +%Y%m%d)" \
    --log-events "timestamp=$TIMESTAMP,message=\"Traffic simulation for $SYSTEM_NAME at $(date)\"" \
    2>/dev/null && \
    echo -e "${GREEN}  ✓ logs:PutLogEvents${NC}" || \
    echo -e "${YELLOW}  - logs:PutLogEvents${NC}"

# =============================================================================
# SUMMARY
# =============================================================================

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Traffic Simulation Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "CloudTrail will now contain API call records for:"
echo -e "  ${GREEN}✓ S3: ListBucket, PutObject, GetObject${NC}"
echo -e "  ${GREEN}✓ IAM: GetRole, ListRolePolicies, ListUsers${NC}"
echo -e "  ${GREEN}✓ EC2: DescribeInstances, DescribeSecurityGroups${NC}"
echo -e "  ${GREEN}✓ Lambda: GetFunction, ListTags${NC}"
echo -e "  ${GREEN}✓ CloudWatch: DescribeLogGroups, PutLogEvents${NC}"
echo ""
echo -e "Permissions that were ${RED}NOT USED${NC} (SafeRemediate will detect):"
echo -e "  ${RED}✗ s3:DeleteObject, s3:DeleteBucket${NC}"
echo -e "  ${RED}✗ iam:CreateRole, iam:DeleteRole, iam:AttachRolePolicy${NC}"
echo -e "  ${RED}✗ ec2:RunInstances, ec2:TerminateInstances${NC}"
echo -e "  ${RED}✗ lambda:InvokeFunction${NC}"
echo ""
echo -e "${YELLOW}Wait 5-15 minutes for CloudTrail to process events.${NC}"
echo -e "Then check SafeRemediate dashboard → Least Privilege tab"
echo ""
