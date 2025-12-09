#!/usr/bin/env python3
"""
SafeRemediate Live Traffic Simulator
Generates real AWS API calls and traffic for your system.

This creates REAL CloudTrail events that SafeRemediate will analyze.

Usage:
    python3 simulate-live-traffic.py --system alon-prod --duration 3600
    python3 simulate-live-traffic.py --system alon-prod --continuous
"""

import argparse
import boto3
import json
import random
import time
from datetime import datetime
from botocore.exceptions import ClientError

class LiveTrafficSimulator:
    def __init__(self, system_name: str, region: str = "eu-west-1"):
        self.system_name = system_name
        self.region = region

        # Initialize AWS clients
        self.s3 = boto3.client('s3', region_name=region)
        self.ec2 = boto3.client('ec2', region_name=region)
        self.iam = boto3.client('iam', region_name=region)
        self.logs = boto3.client('logs', region_name=region)
        self.sts = boto3.client('sts', region_name=region)

        # Try Lambda (may not have permissions)
        try:
            self.lambda_client = boto3.client('lambda', region_name=region)
        except:
            self.lambda_client = None

        self.account_id = self.sts.get_caller_identity()['Account']

        # Stats
        self.stats = {
            's3_list': 0,
            's3_get': 0,
            's3_put': 0,
            'ec2_describe': 0,
            'iam_get': 0,
            'iam_list': 0,
            'logs_put': 0,
            'lambda_get': 0,
            'errors': 0
        }

        self.running = True

        # Discover resources
        self.buckets = []
        self.security_groups = []
        self.roles = []
        self.functions = []

    def discover_resources(self):
        """Discover AWS resources to generate traffic for"""
        print(f"\n{'='*50}")
        print(f"Discovering resources for system: {self.system_name}")
        print(f"{'='*50}\n")

        # S3 Buckets
        try:
            response = self.s3.list_buckets()
            self.buckets = [b['Name'] for b in response.get('Buckets', [])]
            print(f"Found {len(self.buckets)} S3 buckets")
        except ClientError as e:
            print(f"Could not list S3 buckets: {e}")

        # Security Groups
        try:
            response = self.ec2.describe_security_groups(MaxResults=50)
            self.security_groups = [sg['GroupId'] for sg in response.get('SecurityGroups', [])]
            print(f"Found {len(self.security_groups)} security groups")
        except ClientError as e:
            print(f"Could not list security groups: {e}")

        # IAM Roles
        try:
            response = self.iam.list_roles(MaxItems=50)
            self.roles = [r['RoleName'] for r in response.get('Roles', [])]
            print(f"Found {len(self.roles)} IAM roles")
        except ClientError as e:
            print(f"Could not list IAM roles: {e}")

        # Lambda Functions
        if self.lambda_client:
            try:
                response = self.lambda_client.list_functions(MaxItems=20)
                self.functions = [f['FunctionName'] for f in response.get('Functions', [])]
                print(f"Found {len(self.functions)} Lambda functions")
            except ClientError as e:
                print(f"Could not list Lambda functions: {e}")

        print()

    def simulate_s3_traffic(self):
        """Generate S3 API calls - these will appear in CloudTrail"""
        if not self.buckets:
            return

        bucket = random.choice(self.buckets)

        try:
            # List objects (commonly used)
            self.s3.list_objects_v2(Bucket=bucket, MaxKeys=10)
            self.stats['s3_list'] += 1
        except ClientError:
            self.stats['errors'] += 1

        try:
            # Put object (commonly used)
            key = f"saferemediate-traffic/{self.system_name}/{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
            data = {
                'timestamp': datetime.now().isoformat(),
                'system': self.system_name,
                'type': 'traffic_simulation'
            }
            self.s3.put_object(Bucket=bucket, Key=key, Body=json.dumps(data))
            self.stats['s3_put'] += 1
        except ClientError:
            self.stats['errors'] += 1

        # NOTE: We intentionally do NOT call delete_object
        # SafeRemediate will detect s3:DeleteObject as UNUSED

    def simulate_ec2_traffic(self):
        """Generate EC2 API calls - these will appear in CloudTrail"""
        try:
            # Describe instances (commonly used)
            self.ec2.describe_instances(MaxResults=10)
            self.stats['ec2_describe'] += 1
        except ClientError:
            self.stats['errors'] += 1

        try:
            # Describe security groups (commonly used)
            self.ec2.describe_security_groups(MaxResults=10)
            self.stats['ec2_describe'] += 1
        except ClientError:
            self.stats['errors'] += 1

        # NOTE: We intentionally do NOT call run_instances, terminate_instances
        # SafeRemediate will detect these as UNUSED

    def simulate_iam_traffic(self):
        """Generate IAM API calls - these will appear in CloudTrail"""
        if not self.roles:
            return

        role = random.choice(self.roles)

        try:
            # Get role (commonly used)
            self.iam.get_role(RoleName=role)
            self.stats['iam_get'] += 1
        except ClientError:
            self.stats['errors'] += 1

        try:
            # List role policies (commonly used)
            self.iam.list_role_policies(RoleName=role)
            self.stats['iam_list'] += 1
        except ClientError:
            self.stats['errors'] += 1

        try:
            # List attached policies (commonly used)
            self.iam.list_attached_role_policies(RoleName=role)
            self.stats['iam_list'] += 1
        except ClientError:
            self.stats['errors'] += 1

        # NOTE: We intentionally do NOT call create_role, delete_role, attach_role_policy
        # SafeRemediate will detect these as UNUSED

    def simulate_cloudwatch_traffic(self):
        """Generate CloudWatch Logs API calls"""
        log_group = f"/aws/saferemediate/{self.system_name}"
        log_stream = f"traffic-{datetime.now().strftime('%Y%m%d')}"

        try:
            # Create log group if not exists
            try:
                self.logs.create_log_group(logGroupName=log_group)
            except self.logs.exceptions.ResourceAlreadyExistsException:
                pass

            # Create log stream if not exists
            try:
                self.logs.create_log_stream(logGroupName=log_group, logStreamName=log_stream)
            except self.logs.exceptions.ResourceAlreadyExistsException:
                pass

            # Put log event
            self.logs.put_log_events(
                logGroupName=log_group,
                logStreamName=log_stream,
                logEvents=[{
                    'timestamp': int(time.time() * 1000),
                    'message': json.dumps({
                        'system': self.system_name,
                        'timestamp': datetime.now().isoformat(),
                        'type': 'traffic_simulation',
                        'stats': self.stats
                    })
                }]
            )
            self.stats['logs_put'] += 1
        except ClientError:
            self.stats['errors'] += 1

    def simulate_lambda_traffic(self):
        """Generate Lambda API calls (read-only)"""
        if not self.lambda_client or not self.functions:
            return

        func = random.choice(self.functions)

        try:
            # Get function (commonly used)
            self.lambda_client.get_function(FunctionName=func)
            self.stats['lambda_get'] += 1
        except ClientError:
            self.stats['errors'] += 1

        # NOTE: We intentionally do NOT call invoke_function
        # SafeRemediate will detect lambda:InvokeFunction as UNUSED

    def print_status(self):
        """Print current status"""
        print(f"\r[{datetime.now().strftime('%H:%M:%S')}] "
              f"S3: {self.stats['s3_list']}L/{self.stats['s3_put']}P | "
              f"EC2: {self.stats['ec2_describe']} | "
              f"IAM: {self.stats['iam_get']}G/{self.stats['iam_list']}L | "
              f"Logs: {self.stats['logs_put']} | "
              f"Errors: {self.stats['errors']}", end='', flush=True)

    def run(self, duration: int = 300, continuous: bool = False):
        """Run traffic simulation"""
        print(f"\n{'='*60}")
        print(f"SafeRemediate Live Traffic Simulator")
        print(f"{'='*60}")
        print(f"System: {self.system_name}")
        print(f"Account: {self.account_id}")
        print(f"Region: {self.region}")
        print(f"Duration: {'Continuous' if continuous else f'{duration} seconds'}")

        self.discover_resources()

        print("\nGenerating traffic (USED permissions):")
        print("  - s3:ListBucket, s3:PutObject")
        print("  - ec2:DescribeInstances, ec2:DescribeSecurityGroups")
        print("  - iam:GetRole, iam:ListRolePolicies")
        print("  - logs:PutLogEvents")

        print("\nNOT using (SafeRemediate will detect as UNUSED):")
        print("  - s3:DeleteObject, s3:DeleteBucket")
        print("  - ec2:RunInstances, ec2:TerminateInstances")
        print("  - iam:CreateRole, iam:DeleteRole")
        print("  - lambda:InvokeFunction")

        print(f"\n{'='*60}\n")

        start_time = time.time()
        iteration = 0

        try:
            while self.running:
                if not continuous and time.time() - start_time > duration:
                    break

                iteration += 1

                # Generate traffic
                self.simulate_s3_traffic()
                self.simulate_ec2_traffic()
                self.simulate_iam_traffic()
                self.simulate_lambda_traffic()

                # Log to CloudWatch every 10 iterations
                if iteration % 10 == 0:
                    self.simulate_cloudwatch_traffic()

                self.print_status()

                # Wait between iterations (random 5-15 seconds)
                time.sleep(random.uniform(5, 15))

        except KeyboardInterrupt:
            print("\n\nStopped by user")

        self.running = False

        print(f"\n\n{'='*60}")
        print("Traffic Simulation Complete!")
        print(f"{'='*60}")
        print(f"\nFinal Statistics:")
        for key, value in self.stats.items():
            print(f"  {key}: {value}")

        print(f"\nCloudTrail events are being processed...")
        print(f"Wait 5-15 minutes, then check SafeRemediate:")
        print(f"  1. Least Privilege tab → IAM analysis")
        print(f"  2. Security Group Analysis → Network rules")
        print(f"  3. Cloud Graph → System architecture")


def main():
    parser = argparse.ArgumentParser(description='SafeRemediate Live Traffic Simulator')
    parser.add_argument('--system', '-s', default='alon-prod',
                        help='System name (default: alon-prod)')
    parser.add_argument('--region', '-r', default='eu-west-1',
                        help='AWS region (default: eu-west-1)')
    parser.add_argument('--duration', '-d', type=int, default=300,
                        help='Duration in seconds (default: 300)')
    parser.add_argument('--continuous', '-c', action='store_true',
                        help='Run continuously until interrupted')

    args = parser.parse_args()

    simulator = LiveTrafficSimulator(args.system, args.region)
    simulator.run(args.duration, args.continuous)


if __name__ == '__main__':
    main()
