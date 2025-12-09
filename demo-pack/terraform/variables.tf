# SafeRemediate Demo Variables
# Override these values for your environment

variable "aws_region" {
  description = "AWS region to deploy demo infrastructure"
  type        = string
  default     = "eu-west-1"
}

variable "demo_name" {
  description = "Name prefix for all demo resources"
  type        = string
  default     = "saferemediate-demo"
}

variable "db_password" {
  description = "Password for RDS database"
  type        = string
  sensitive   = true
  default     = "DemoPassword123!"
}

variable "create_bastion" {
  description = "Whether to create a bastion host for SSH access"
  type        = bool
  default     = false
}

variable "enable_cloudtrail" {
  description = "Whether to enable CloudTrail for IAM analysis"
  type        = bool
  default     = true
}

variable "vpc_flow_log_retention" {
  description = "Number of days to retain VPC flow logs"
  type        = number
  default     = 30
}
