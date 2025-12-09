# SafeRemediate Demo Infrastructure
# 3-Tier Architecture: ALB -> EC2 (Web/App) -> RDS
# This creates REAL AWS resources with intentional security issues for demo

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "SafeRemediate-Demo"
      Environment = "demo"
      ManagedBy   = "terraform"
    }
  }
}

# Variables
variable "aws_region" {
  default = "eu-west-1"
}

variable "demo_name" {
  default = "saferemediate-demo"
}

variable "db_password" {
  description = "RDS database password"
  sensitive   = true
  default     = "DemoPassword123!" # For demo only - use secrets manager in production
}

# Data Sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}

# VPC
resource "aws_vpc" "demo" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name       = "${var.demo_name}-vpc"
    SystemName = "Payment-Prod"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "demo" {
  vpc_id = aws_vpc.demo.id

  tags = {
    Name       = "${var.demo_name}-igw"
    SystemName = "Payment-Prod"
  }
}

# Public Subnets (for ALB and Bastion)
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.demo.id
  cidr_block              = "10.0.${count.index + 1}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name       = "${var.demo_name}-public-${count.index + 1}"
    SystemName = "Payment-Prod"
    Tier       = "public"
  }
}

# Private Subnets (for App and DB)
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.demo.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name       = "${var.demo_name}-private-${count.index + 1}"
    SystemName = "Payment-Prod"
    Tier       = "private"
  }
}

# Route Tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.demo.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.demo.id
  }

  tags = {
    Name       = "${var.demo_name}-public-rt"
    SystemName = "Payment-Prod"
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# NAT Gateway for private subnets
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name       = "${var.demo_name}-nat-eip"
    SystemName = "Payment-Prod"
  }
}

resource "aws_nat_gateway" "demo" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name       = "${var.demo_name}-nat"
    SystemName = "Payment-Prod"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.demo.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.demo.id
  }

  tags = {
    Name       = "${var.demo_name}-private-rt"
    SystemName = "Payment-Prod"
  }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# =============================================================================
# SECURITY GROUPS WITH INTENTIONAL ISSUES (FOR DEMO)
# =============================================================================

# ALB Security Group - GOOD (only 80/443)
resource "aws_security_group" "alb" {
  name        = "${var.demo_name}-alb-sg"
  description = "Security group for ALB"
  vpc_id      = aws_vpc.demo.id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name       = "${var.demo_name}-alb-sg"
    SystemName = "Payment-Prod"
    Tier       = "web"
  }
}

# Web Server Security Group - WITH INTENTIONAL ISSUES
resource "aws_security_group" "web" {
  name        = "${var.demo_name}-web-sg"
  description = "Security group for web servers - WITH DEMO ISSUES"
  vpc_id      = aws_vpc.demo.id

  # Good rule - from ALB only
  ingress {
    description     = "HTTP from ALB"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # ISSUE 1: SSH open to the world (CRITICAL)
  ingress {
    description = "SSH from anywhere - DEMO ISSUE"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # ISSUE 2: RDP open to the world (CRITICAL) - not even needed for Linux
  ingress {
    description = "RDP from anywhere - DEMO ISSUE (unused)"
    from_port   = 3389
    to_port     = 3389
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # ISSUE 3: MySQL port open (should only be app->db)
  ingress {
    description = "MySQL from anywhere - DEMO ISSUE"
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name       = "${var.demo_name}-web-sg"
    SystemName = "Payment-Prod"
    Tier       = "web"
    DemoIssue  = "overly-permissive"
  }
}

# App Server Security Group - WITH INTENTIONAL ISSUES
resource "aws_security_group" "app" {
  name        = "${var.demo_name}-app-sg"
  description = "Security group for app servers - WITH DEMO ISSUES"
  vpc_id      = aws_vpc.demo.id

  # Good rule - from web tier only
  ingress {
    description     = "App port from web tier"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.web.id]
  }

  # ISSUE: SSH open to the world (CRITICAL)
  ingress {
    description = "SSH from anywhere - DEMO ISSUE"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # ISSUE: All ports open from 10.0.0.0/8 (too broad)
  ingress {
    description = "All ports from RFC1918 - DEMO ISSUE (too broad)"
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name       = "${var.demo_name}-app-sg"
    SystemName = "Payment-Prod"
    Tier       = "app"
    DemoIssue  = "overly-permissive"
  }
}

# Database Security Group - WITH INTENTIONAL ISSUES
resource "aws_security_group" "db" {
  name        = "${var.demo_name}-db-sg"
  description = "Security group for RDS - WITH DEMO ISSUES"
  vpc_id      = aws_vpc.demo.id

  # Good rule - from app tier only
  ingress {
    description     = "MySQL from app tier"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # ISSUE: MySQL open to entire VPC (should be app tier only)
  ingress {
    description = "MySQL from VPC - DEMO ISSUE (too broad)"
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name       = "${var.demo_name}-db-sg"
    SystemName = "Payment-Prod"
    Tier       = "database"
    DemoIssue  = "overly-permissive"
  }
}

# =============================================================================
# IAM ROLES WITH INTENTIONAL OVER-PERMISSIONS (FOR DEMO)
# =============================================================================

# EC2 Instance Role - WITH INTENTIONAL ISSUES
resource "aws_iam_role" "ec2_demo" {
  name = "${var.demo_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })

  tags = {
    Name       = "${var.demo_name}-ec2-role"
    SystemName = "Payment-Prod"
    DemoIssue  = "overly-permissive"
  }
}

# ISSUE: Overly permissive IAM policy (has permissions that won't be used)
resource "aws_iam_role_policy" "ec2_demo" {
  name = "${var.demo_name}-ec2-policy"
  role = aws_iam_role.ec2_demo.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # USED: S3 access for app data
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.demo.arn,
          "${aws_s3_bucket.demo.arn}/*"
        ]
      },
      {
        # USED: CloudWatch Logs
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      },
      {
        # ISSUE: S3 DeleteObject - NEVER USED (demo will show this)
        Effect   = "Allow"
        Action   = ["s3:DeleteObject", "s3:DeleteBucket"]
        Resource = "*"
      },
      {
        # ISSUE: EC2 full access - NEVER USED (demo will show this)
        Effect   = "Allow"
        Action   = ["ec2:*"]
        Resource = "*"
      },
      {
        # ISSUE: IAM read access - NEVER USED (demo will show this)
        Effect   = "Allow"
        Action   = ["iam:List*", "iam:Get*"]
        Resource = "*"
      },
      {
        # ISSUE: RDS full access - NEVER USED (demo will show this)
        Effect   = "Allow"
        Action   = ["rds:*"]
        Resource = "*"
      },
      {
        # ISSUE: Lambda invoke - NEVER USED (demo will show this)
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction", "lambda:List*"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_demo" {
  name = "${var.demo_name}-ec2-profile"
  role = aws_iam_role.ec2_demo.name
}

# Lambda Role - WITH INTENTIONAL ISSUES
resource "aws_iam_role" "lambda_demo" {
  name = "${var.demo_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = {
    Name       = "${var.demo_name}-lambda-role"
    SystemName = "Payment-Prod"
    DemoIssue  = "overly-permissive"
  }
}

# ISSUE: Admin-level Lambda policy
resource "aws_iam_role_policy" "lambda_demo" {
  name = "${var.demo_name}-lambda-policy"
  role = aws_iam_role.lambda_demo.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # USED: Basic Lambda execution
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      },
      {
        # USED: DynamoDB access
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query"
        ]
        Resource = "*"
      },
      {
        # ISSUE: S3 full access - only GetObject is used
        Effect   = "Allow"
        Action   = ["s3:*"]
        Resource = "*"
      },
      {
        # ISSUE: SES full access - NEVER USED
        Effect   = "Allow"
        Action   = ["ses:*"]
        Resource = "*"
      },
      {
        # ISSUE: SNS full access - NEVER USED
        Effect   = "Allow"
        Action   = ["sns:*"]
        Resource = "*"
      },
      {
        # ISSUE: SQS full access - NEVER USED
        Effect   = "Allow"
        Action   = ["sqs:*"]
        Resource = "*"
      }
    ]
  })
}

# =============================================================================
# S3 BUCKET (for app data and demo)
# =============================================================================

resource "aws_s3_bucket" "demo" {
  bucket = "${var.demo_name}-data-${random_id.bucket_suffix.hex}"

  tags = {
    Name       = "${var.demo_name}-data"
    SystemName = "Payment-Prod"
  }
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket_versioning" "demo" {
  bucket = aws_s3_bucket.demo.id
  versioning_configuration {
    status = "Enabled"
  }
}

# =============================================================================
# APPLICATION LOAD BALANCER
# =============================================================================

resource "aws_lb" "demo" {
  name               = "${var.demo_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = {
    Name       = "${var.demo_name}-alb"
    SystemName = "Payment-Prod"
    Tier       = "web"
  }
}

resource "aws_lb_target_group" "demo" {
  name     = "${var.demo_name}-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = aws_vpc.demo.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name       = "${var.demo_name}-tg"
    SystemName = "Payment-Prod"
  }
}

resource "aws_lb_listener" "demo" {
  load_balancer_arn = aws_lb.demo.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.demo.arn
  }
}

# =============================================================================
# EC2 INSTANCES
# =============================================================================

resource "aws_instance" "web" {
  count                  = 2
  ami                    = data.aws_ami.amazon_linux_2.id
  instance_type          = "t3.micro"
  subnet_id              = aws_subnet.public[count.index].id
  vpc_security_group_ids = [aws_security_group.web.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_demo.name

  user_data = <<-EOF
              #!/bin/bash
              yum update -y
              yum install -y httpd
              systemctl start httpd
              systemctl enable httpd
              echo "<h1>SafeRemediate Demo - Web Server ${count.index + 1}</h1>" > /var/www/html/index.html
              EOF

  tags = {
    Name       = "${var.demo_name}-web-${count.index + 1}"
    SystemName = "Payment-Prod"
    Tier       = "web"
    Role       = "webserver"
  }
}

resource "aws_lb_target_group_attachment" "demo" {
  count            = 2
  target_group_arn = aws_lb_target_group.demo.arn
  target_id        = aws_instance.web[count.index].id
  port             = 80
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.amazon_linux_2.id
  instance_type          = "t3.micro"
  subnet_id              = aws_subnet.private[0].id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_demo.name

  user_data = <<-EOF
              #!/bin/bash
              yum update -y
              yum install -y java-11-amazon-corretto
              # Simulate app server
              echo "App server initialized" > /tmp/app.log
              EOF

  tags = {
    Name       = "${var.demo_name}-app-1"
    SystemName = "Payment-Prod"
    Tier       = "app"
    Role       = "appserver"
  }
}

# =============================================================================
# RDS DATABASE
# =============================================================================

resource "aws_db_subnet_group" "demo" {
  name       = "${var.demo_name}-db-subnet"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name       = "${var.demo_name}-db-subnet"
    SystemName = "Payment-Prod"
  }
}

resource "aws_db_instance" "demo" {
  identifier           = "${var.demo_name}-db"
  engine               = "mysql"
  engine_version       = "8.0"
  instance_class       = "db.t3.micro"
  allocated_storage    = 20
  storage_type         = "gp2"
  db_name              = "demoapp"
  username             = "admin"
  password             = var.db_password
  parameter_group_name = "default.mysql8.0"
  skip_final_snapshot  = true

  vpc_security_group_ids = [aws_security_group.db.id]
  db_subnet_group_name   = aws_db_subnet_group.demo.name

  tags = {
    Name       = "${var.demo_name}-db"
    SystemName = "Payment-Prod"
    Tier       = "database"
  }
}

# =============================================================================
# VPC FLOW LOGS (Critical for SafeRemediate)
# =============================================================================

resource "aws_cloudwatch_log_group" "flow_logs" {
  name              = "/aws/vpc/${var.demo_name}-flow-logs"
  retention_in_days = 30

  tags = {
    Name       = "${var.demo_name}-flow-logs"
    SystemName = "Payment-Prod"
  }
}

resource "aws_iam_role" "flow_logs" {
  name = "${var.demo_name}-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "vpc-flow-logs.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "flow_logs" {
  name = "${var.demo_name}-flow-logs-policy"
  role = aws_iam_role.flow_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ]
      Resource = "*"
    }]
  })
}

resource "aws_flow_log" "demo" {
  vpc_id                   = aws_vpc.demo.id
  traffic_type             = "ALL"
  log_destination_type     = "cloud-watch-logs"
  log_destination          = aws_cloudwatch_log_group.flow_logs.arn
  iam_role_arn             = aws_iam_role.flow_logs.arn
  max_aggregation_interval = 60

  tags = {
    Name       = "${var.demo_name}-flow-log"
    SystemName = "Payment-Prod"
  }
}

# =============================================================================
# CLOUDTRAIL (For IAM analysis)
# =============================================================================

resource "aws_s3_bucket" "cloudtrail" {
  bucket = "${var.demo_name}-cloudtrail-${random_id.bucket_suffix.hex}"

  tags = {
    Name       = "${var.demo_name}-cloudtrail"
    SystemName = "Payment-Prod"
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail.arn
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail.arn}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      }
    ]
  })
}

resource "aws_cloudtrail" "demo" {
  name                          = "${var.demo_name}-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = false
  enable_logging                = true

  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  tags = {
    Name       = "${var.demo_name}-trail"
    SystemName = "Payment-Prod"
  }

  depends_on = [aws_s3_bucket_policy.cloudtrail]
}

# =============================================================================
# OUTPUTS
# =============================================================================

output "vpc_id" {
  value = aws_vpc.demo.id
}

output "alb_dns" {
  value = aws_lb.demo.dns_name
}

output "web_instance_ids" {
  value = aws_instance.web[*].id
}

output "app_instance_id" {
  value = aws_instance.app.id
}

output "rds_endpoint" {
  value = aws_db_instance.demo.endpoint
}

output "s3_bucket" {
  value = aws_s3_bucket.demo.bucket
}

output "security_groups" {
  value = {
    alb = aws_security_group.alb.id
    web = aws_security_group.web.id
    app = aws_security_group.app.id
    db  = aws_security_group.db.id
  }
}

output "iam_roles" {
  value = {
    ec2    = aws_iam_role.ec2_demo.name
    lambda = aws_iam_role.lambda_demo.name
  }
}

output "demo_issues_summary" {
  value = <<-EOT

  ============================================
  DEMO SECURITY ISSUES CREATED
  ============================================

  SECURITY GROUPS:
  - ${aws_security_group.web.id}: SSH (22), RDP (3389), MySQL (3306) open to 0.0.0.0/0
  - ${aws_security_group.app.id}: SSH (22) open to 0.0.0.0/0, all ports open to 10.0.0.0/8
  - ${aws_security_group.db.id}: MySQL (3306) open to entire VPC (should be app-tier only)

  IAM ROLES:
  - ${aws_iam_role.ec2_demo.name}: Has ec2:*, rds:*, iam:List*, s3:Delete* (NEVER USED)
  - ${aws_iam_role.lambda_demo.name}: Has s3:*, ses:*, sns:*, sqs:* (mostly UNUSED)

  SafeRemediate will detect these issues and show:
  - Which rules/permissions are actually USED vs UNUSED
  - Confidence levels based on traffic analysis
  - One-click remediation to remove unused access

  EOT
}
