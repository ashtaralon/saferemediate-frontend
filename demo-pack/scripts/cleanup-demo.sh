#!/bin/bash
# SafeRemediate Demo - Cleanup Script
# Removes all demo infrastructure from AWS

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEMO_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}SafeRemediate Demo Cleanup${NC}"
echo -e "${BLUE}========================================${NC}"

echo -e "\n${YELLOW}This will destroy all demo AWS resources.${NC}"
read -p "Are you sure? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

cd "$DEMO_DIR/terraform"

# Empty S3 buckets first (required before terraform destroy)
echo -e "\n${YELLOW}Emptying S3 buckets...${NC}"

for bucket in $(terraform output -json 2>/dev/null | grep -o '"saferemediate-demo[^"]*"' | tr -d '"'); do
    echo "  Emptying $bucket..."
    aws s3 rm "s3://$bucket" --recursive 2>/dev/null || true
done

# Destroy infrastructure
echo -e "\n${YELLOW}Destroying infrastructure...${NC}"
terraform destroy -auto-approve

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Cleanup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "All demo resources have been removed from AWS."
echo "Your AWS account should no longer incur charges for these resources."
