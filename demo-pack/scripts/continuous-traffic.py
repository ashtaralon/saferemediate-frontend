#!/usr/bin/env python3
"""
SafeRemediate Demo - Continuous Traffic Simulator
Generates realistic traffic patterns over time for demo purposes

Usage:
    python3 continuous-traffic.py --duration 3600 --alb-dns your-alb-dns.amazonaws.com
"""

import argparse
import boto3
import json
import random
import requests
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import threading

# Configuration
DEFAULT_REGION = "eu-west-1"

class TrafficSimulator:
    def __init__(self, region: str, alb_dns: str, s3_bucket: str):
        self.region = region
        self.alb_dns = alb_dns
        self.s3_bucket = s3_bucket
        self.s3_client = boto3.client('s3', region_name=region)
        self.logs_client = boto3.client('logs', region_name=region)
        self.stats = {
            'web_requests': 0,
            's3_get': 0,
            's3_put': 0,
            's3_list': 0,
            'logs': 0,
            'errors': 0
        }
        self.running = True

    def print_status(self):
        """Print current stats"""
        print(f"\r[{datetime.now().strftime('%H:%M:%S')}] "
              f"Web: {self.stats['web_requests']} | "
              f"S3 Get: {self.stats['s3_get']} | "
              f"S3 Put: {self.stats['s3_put']} | "
              f"S3 List: {self.stats['s3_list']} | "
              f"Logs: {self.stats['logs']} | "
              f"Errors: {self.stats['errors']}", end='')

    def simulate_web_traffic(self):
        """Simulate web requests to ALB"""
        endpoints = ['/', '/api/health', '/api/data', '/static/app.js']

        while self.running:
            try:
                endpoint = random.choice(endpoints)
                url = f"http://{self.alb_dns}{endpoint}"
                response = requests.get(url, timeout=5)
                self.stats['web_requests'] += 1
            except Exception as e:
                self.stats['errors'] += 1

            # Random delay between 1-10 seconds
            time.sleep(random.uniform(1, 10))

    def simulate_s3_reads(self):
        """Simulate S3 GetObject operations (USED permission)"""
        while self.running:
            try:
                # List objects
                response = self.s3_client.list_objects_v2(
                    Bucket=self.s3_bucket,
                    Prefix='demo-data/',
                    MaxKeys=10
                )
                self.stats['s3_list'] += 1

                # Get a random object if any exist
                if 'Contents' in response and response['Contents']:
                    obj = random.choice(response['Contents'])
                    self.s3_client.get_object(
                        Bucket=self.s3_bucket,
                        Key=obj['Key']
                    )
                    self.stats['s3_get'] += 1

            except Exception as e:
                self.stats['errors'] += 1

            time.sleep(random.uniform(5, 15))

    def simulate_s3_writes(self):
        """Simulate S3 PutObject operations (USED permission)"""
        while self.running:
            try:
                key = f"demo-data/traffic-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{random.randint(1000,9999)}.json"
                data = {
                    'timestamp': datetime.now().isoformat(),
                    'type': 'traffic_simulation',
                    'random_value': random.random()
                }
                self.s3_client.put_object(
                    Bucket=self.s3_bucket,
                    Key=key,
                    Body=json.dumps(data),
                    ContentType='application/json'
                )
                self.stats['s3_put'] += 1
            except Exception as e:
                self.stats['errors'] += 1

            time.sleep(random.uniform(10, 30))

    def simulate_cloudwatch_logs(self):
        """Simulate CloudWatch Logs operations (USED permission)"""
        log_group = '/aws/saferemediate-demo/application'
        log_stream = f"demo-{datetime.now().strftime('%Y%m%d')}"

        # Ensure log group and stream exist
        try:
            self.logs_client.create_log_group(logGroupName=log_group)
        except self.logs_client.exceptions.ResourceAlreadyExistsException:
            pass

        try:
            self.logs_client.create_log_stream(
                logGroupName=log_group,
                logStreamName=log_stream
            )
        except self.logs_client.exceptions.ResourceAlreadyExistsException:
            pass

        sequence_token = None

        while self.running:
            try:
                log_event = {
                    'timestamp': int(time.time() * 1000),
                    'message': json.dumps({
                        'level': random.choice(['INFO', 'DEBUG', 'WARN']),
                        'service': 'payment-api',
                        'message': f'Processing transaction {random.randint(10000, 99999)}',
                        'duration_ms': random.randint(10, 500)
                    })
                }

                kwargs = {
                    'logGroupName': log_group,
                    'logStreamName': log_stream,
                    'logEvents': [log_event]
                }

                if sequence_token:
                    kwargs['sequenceToken'] = sequence_token

                response = self.logs_client.put_log_events(**kwargs)
                sequence_token = response.get('nextSequenceToken')
                self.stats['logs'] += 1

            except Exception as e:
                self.stats['errors'] += 1
                sequence_token = None

            time.sleep(random.uniform(2, 8))

    def run(self, duration: int):
        """Run traffic simulation for specified duration"""
        print(f"\n{'='*60}")
        print("SafeRemediate Traffic Simulator")
        print(f"{'='*60}")
        print(f"ALB: {self.alb_dns}")
        print(f"S3 Bucket: {self.s3_bucket}")
        print(f"Duration: {duration} seconds")
        print(f"\nNOTE: The following permissions are intentionally NOT used:")
        print("  - s3:DeleteObject, s3:DeleteBucket")
        print("  - ec2:*, rds:*, iam:List*, iam:Get*")
        print("  - lambda:InvokeFunction, ses:*, sns:*, sqs:*")
        print(f"\nSafeRemediate will detect these as UNUSED!\n")
        print(f"{'='*60}\n")

        # Start traffic threads
        with ThreadPoolExecutor(max_workers=5) as executor:
            executor.submit(self.simulate_web_traffic)
            executor.submit(self.simulate_s3_reads)
            executor.submit(self.simulate_s3_writes)
            executor.submit(self.simulate_cloudwatch_logs)

            # Status printer
            start_time = time.time()
            try:
                while time.time() - start_time < duration:
                    self.print_status()
                    time.sleep(1)
            except KeyboardInterrupt:
                print("\n\nInterrupted by user")
            finally:
                self.running = False

        print(f"\n\n{'='*60}")
        print("Simulation Complete!")
        print(f"{'='*60}")
        print(f"\nFinal Statistics:")
        for key, value in self.stats.items():
            print(f"  {key}: {value}")
        print(f"\nNow open SafeRemediate dashboard to see:")
        print("  1. Least Privilege tab - unused IAM permissions detected")
        print("  2. Security Group Analysis - unused ports detected")
        print("  3. Cloud Graph - system architecture")


def main():
    parser = argparse.ArgumentParser(description='SafeRemediate Traffic Simulator')
    parser.add_argument('--region', default=DEFAULT_REGION, help='AWS region')
    parser.add_argument('--alb-dns', required=True, help='ALB DNS name')
    parser.add_argument('--s3-bucket', required=True, help='S3 bucket name')
    parser.add_argument('--duration', type=int, default=300, help='Duration in seconds')

    args = parser.parse_args()

    simulator = TrafficSimulator(args.region, args.alb_dns, args.s3_bucket)
    simulator.run(args.duration)


if __name__ == '__main__':
    main()
