# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> release QA — egress destinations beyond the IGW >> egress map on live C1 at 1600x900
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:1962:9

# Error details

```
Error: 1600x900: Dependencies lens control is missing

expect(locator).toBeVisible() failed

Locator: getByTestId('topology-estate-flow-mode-all_access').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - 1600x900: Dependencies lens control is missing with timeout 5000ms
  - waiting for getByTestId('topology-estate-flow-mode-all_access').first()

```

```yaml
- text: Scope
- img
- text: Organization
- combobox "Organization":
  - option "Cyntro Testbed Webshop" [selected]
- img
- text: Group
- combobox "Group":
  - option "All account groups" [selected]
- img
- text: Account
- combobox "Account":
  - option "All accounts"
  - option "Testbed Webshop · 416651950952" [selected]
- img
- text: Region
- combobox "Region":
  - option "All regions"
  - option "eu-west-1" [selected]
- text: 1 account in view
- banner:
  - text: Estate · Topology v0.2 · testbed-webshop cyntro-tb-prod-loadgen-role has 15/25 unused permissions (60% gap) — attached to cyntro-tb-prod-loadgen scored 2026-09-14T18:15:43Z · 0 flagged · posture_correlated_at >= now() - 7d on any workload · VPC vpc-0c39cde96f29f8f4e Served from cache; not recomputed for this request. · Last updated Sep 14, 2026, 6:15 PM Evidence computed Sep 14, 2026, 6:15 PM Live graph
  - button "System stats"
- text: VPC scope
- combobox "VPC scope":
  - option "All VPCs · Compare"
  - option "cyntro-tb-prod-vpc · vpc-0c39cde96f29f8f4e (7 workloads)" [selected]
- text: Subnet-linked compute in tier cells; regional/serverless on the right rail. Availability zones
- button "eu-west-1a" [pressed]
- button "eu-west-1b" [pressed]
- text: In this VPC
- button "EC2 (5)" [pressed]
- button "RDS (3)" [pressed]
- button "LoadBalancer (2)" [pressed]
- button "TargetGroup (2)" [pressed]
- button "Neptune (2)" [pressed]
- button "AutoScalingGroup (2)" [pressed]
- text: System-wide
- button "Lambda (6)" [pressed]
- button "EventBridge (6)" [pressed]
- button "S3 (3)" [pressed]
- button "KMSKey (3)" [pressed]
- button "DynamoDB (1)" [pressed]
- button "Show all"
- button "Clear all"
- main:
  - tablist "Estate view":
    - tab "Command map"
    - tab "Network topology" [selected]
  - group "Map density":
    - button "Glance"
    - button "Inventory"
  - button "Shared neighbors" [pressed]
  - button "Open map fullscreen":
    - img
    - text: Map fullscreen
  - text: Platform map 1 VPC · 2 AZ · 6 subnets · 35 resources Map lens
  - button "Architecture":
    - img
    - text: Architecture
  - button "Dependencies" [pressed]:
    - img
    - text: Dependencies
  - button "Attack paths":
    - img
    - text: Attack paths
  - text: Flow colors Service call AWS data service VPC endpoint Internet egress Database Exposure / attack Moving = authoritative observed Outlined motion = historical direction Solid = configured Dashed = inferred / unverified Traffic evidence not yet authoritative Outlined packets show historical source-to-target direction; they do not claim live traffic. Flow-log coverage Not measured 16 eligible endpoints, coverage not measured · 19 not applicable
  - button "Coverage details (3)"
  - text: Users Clients & operators Internet Public path via IGW · igw-01b6c643a5c856abe ☁ AWS Cloud · acct 416651950952 Region · eu-west-1 VPC · vpc-0c39cde96f29f8f4e cyntro-tb-prod-… ×7 Load Balancers (2)
  - button "cyntro-tb-prod-alb-int Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0"
  - button "cyntro-tb-prod-alb-pub Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0"
  - text: Availability Zone · eu-west-1a Public · cyntro-tb-prod-public-eu-west-1a 10.42.0.0/24 NAT GW · nat-0fd7cf8524e62aea9
  - button "quiet posture score …web": …web
  - button "quiet posture score cyntro-testbed-webshop-writer": cyntro-testbed-webshop-writer
  - text: Private · cyntro-tb-prod-app-eu-west-1a 10.42.10.0/24
  - button "quiet posture score ×2 EC2": ×2 EC2
  - text: Data · cyntro-tb-prod-data-eu-west-1a 10.42.20.0/24
  - button "quiet posture score …aurora-1": …aurora-1
  - text: Availability Zone · eu-west-1b Public · cyntro-tb-prod-public-eu-west-1b 10.42.1.0/24
  - button "quiet posture score …web": …web
  - text: Private · cyntro-tb-prod-app-eu-west-1b 10.42.11.0/24
  - button "quiet posture score …app": …app
  - text: Data · cyntro-tb-prod-data-eu-west-1b 10.42.21.0/24
  - button "quiet posture score …aurora-0": …aurora-0
  - text: VPC boundary ↑ Internet
  - button "IGW igw-01b6c643a5c856abe"
  - text: "egress: 3 workloads Endpoints (1)"
  - button "VPCE GW Amazon S3"
  - text: "use: not observed Outside the VPC Destinations observed this generation · NAT → IGW is configured routing 3.253.225.145 address 3.5.64.0 address 3.5.64.128 address 3.5.67.254 address 3.5.69.34 address 3.5.72.119 address"
  - button "+7 more"
  - text: 3 workloads NAT nat-0fd7cf8524e62aea9 IGW igw-01b6c643a5c856abe
  - button "External destinations 3 workloads · up to 45 distinct · addresses sampled"
  - text: Lambda runtime (6) outside subnet grid · 6 outside VPC (verified) · cyntro-tb-prod-consumer-… ×12
  - button "S3 traffic from 4 of 6 functions"
  - text: Triggers (6)
  - button "quiet posture score …daily": …daily
  - button "quiet posture score …every_6h": …every_6h
  - button "quiet posture score …frequent": …frequent
  - button "quiet posture score …monthly": …monthly
  - button "quiet posture score …nightly_burst": …nightly_burst
  - button "quiet posture score …weekly": …weekly
  - button "quiet posture score …monthly": …monthly
  - button "quiet posture score …weekly": …weekly
  - button "quiet posture score …daily": …daily
  - button "quiet posture score …every_6h": …every_6h
  - button "quiet posture score …frequent": …frequent
  - button "quiet posture score …nightly_burst": …nightly_burst
  - text: Regional · KMS / S3 / DDB (7) arn:aws:kms:eu-west-1:416651950952:key/… ×3
  - button "quiet posture score cyntro-evidence-testbed-webshop-950952": cyntro-evidence-testbed-webshop-950952
  - button "quiet posture score cyntro-ingest-head-testbed-webshop": cyntro-ingest-head-testbed-webshop
  - button "quiet posture score cyntro-tb-prod-appdata-1c8276f5": cyntro-tb-prod-appdata-1c8276f5
  - button "quiet posture score …76bd5a63-602c-471e-b085-1df8b04128b2": …76bd5a63-602c-471e-b085-1df8b04128b2
  - button "quiet posture score …d729e441-b319-4859-9974-9bd12d8e341a": …d729e441-b319-4859-9974-9bd12d8e341a
  - button "quiet posture score …1a88e19d-2eb4-4bf7-a16d-35152bc8a453": …1a88e19d-2eb4-4bf7-a16d-35152bc8a453
  - button "quiet posture score cyntro-tb-prod-logs-1c8276f5 S3": cyntro-tb-prod-logs-1c8276f5 S3
  - button "Logical groups · members carry the placement (6) Show members"
  - button "Diagnostics 6 serverless · 38 flows ▴"
  - text: Serverless compute (6)
  - button "cyntro-tb-prod-consumer-monthly Lambda · arn:aws:lambda:eu-west-1 15"
  - button "cyntro-tb-prod-consumer-weekly Lambda · arn:aws:lambda:eu-west-1 15"
  - button "cyntro-tb-prod-consumer-daily Lambda · arn:aws:lambda:eu-west-1 4"
  - button "cyntro-tb-prod-consumer-every_6h Lambda · arn:aws:lambda:eu-west-1 4"
  - button "cyntro-tb-prod-consumer-frequent Lambda · arn:aws:lambda:eu-west-1 4"
  - button "cyntro-tb-prod-consumer-nightly_burst Lambda · arn:aws:lambda:eu-west-1 4"
  - text: Observed traffic — animated arrows above 38 flows · 25 internal · 10 edge-service · 0 vpce · 0 database · 3 egress cyntro-tb-prod-consumer-nightly_burst → cyntro-tb-prod-appdata-1c8276f5 ACTUAL_S3_ACCESS cyntro-tb-prod-consumer-daily → cyntro-tb-prod-appdata-1c8276f5 ACTUAL_S3_ACCESS cyntro-tb-prod-consumer-frequent → cyntro-tb-prod-appdata-1c8276f5 ACTUAL_S3_ACCESS cyntro-tb-prod-consumer-every_6h → cyntro-tb-prod-appdata-1c8276f5 ACTUAL_S3_ACCESS cyntro-tb-prod-app → Internet (via IGW) egress · 32 (ext 32) cyntro-tb-prod-loadgen → Internet (via IGW) egress · 3 (ext 3) cyntro-tb-prod-app → Internet (via IGW) egress · 10 (ext 10) cyntro-testbed-webshop-writer → cyntro-testbed-webshop MEMBER_OF_CLUSTER cyntro-tb-prod-aurora-1 → cyntro-tb-prod-aurora MEMBER_OF_CLUSTER cyntro-tb-prod-aurora-0 → cyntro-tb-prod-aurora MEMBER_OF_CLUSTER cyntro-tb-prod-tg-app → cyntro-tb-prod-app TARGETS cyntro-tb-prod-tg-app → cyntro-tb-prod-app TARGETS + 32 more flows Encoding Worst (carmine halo + pulse) High / elevated (ring only) ♛ Crown-jewel halo Clean · remediated (teal ring) Stale (dimmed) Coverage gap (not collected)
- complementary:
  - complementary:
    - heading "Service index" [level=2]
    - text: "35"
    - searchbox "Find service in topology"
    - button "Filters":
      - img
      - text: Filters
    - list:
      - listitem:
        - button "cyntro-tb-prod-appdata-1c8276f5 Current graph data S3 · global · regional 4 in · 1 out Aug 20, 04:53 PM":
          - img
          - text: cyntro-tb-prod-appdata-1c8276f5 S3 · global · regional 4 in · 1 out
          - img
          - text: Aug 20, 04:53 PM
      - listitem:
        - button "arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2 Current graph data KMSKey · global · regional 3 in · 0 out Sep 11, 07:35 PM":
          - img
          - text: arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2 KMSKey · global · regional 3 in · 0 out
          - img
          - text: Sep 11, 07:35 PM
      - listitem:
        - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1b · app 2 in · 1 out Aug 20, 04:58 PM":
          - img
          - text: cyntro-tb-prod-app EC2 · eu-west-1b · app 2 in · 1 out
          - img
          - text: Aug 20, 04:58 PM
      - listitem:
        - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1a · app 2 in · 1 out Aug 20, 04:58 PM":
          - img
          - text: cyntro-tb-prod-app EC2 · eu-west-1a · app 2 in · 1 out
          - img
          - text: Aug 20, 04:58 PM
      - listitem:
        - button "cyntro-tb-prod-consumer-daily Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM":
          - img
          - text: cyntro-tb-prod-consumer-daily Lambda · eu-west-1 · regional 2 in · 1 out
          - img
          - text: Aug 31, 11:00 AM
      - listitem:
        - button "cyntro-tb-prod-consumer-every_6h Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM":
          - img
          - text: cyntro-tb-prod-consumer-every_6h Lambda · eu-west-1 · regional 2 in · 1 out
          - img
          - text: Aug 31, 11:00 AM
      - listitem:
        - button "cyntro-tb-prod-consumer-frequent Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 1, 11:00 AM":
          - img
          - text: cyntro-tb-prod-consumer-frequent Lambda · eu-west-1 · regional 2 in · 1 out
          - img
          - text: Sep 1, 11:00 AM
      - listitem:
        - button "cyntro-tb-prod-consumer-nightly_burst Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM":
          - img
          - text: cyntro-tb-prod-consumer-nightly_burst Lambda · eu-west-1 · regional 2 in · 1 out
          - img
          - text: Aug 31, 11:00 AM
      - listitem:
        - button "cyntro-tb-prod-tg-app Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM":
          - img
          - text: cyntro-tb-prod-tg-app TargetGroup · eu-west-1 · VPC 1 in · 2 out
          - img
          - text: Aug 20, 04:58 PM
      - listitem:
        - button "cyntro-tb-prod-tg-web Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM":
          - img
          - text: cyntro-tb-prod-tg-web TargetGroup · eu-west-1 · VPC 1 in · 2 out
          - img
          - text: Aug 20, 04:58 PM
      - listitem:
        - button "arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453 Current graph data KMSKey · global · regional 2 in · 0 out Sep 11, 07:35 PM":
          - img
          - text: arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453 KMSKey · global · regional 2 in · 0 out
          - img
          - text: Sep 11, 07:35 PM
      - listitem:
        - button "cyntro-tb-prod-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp":
          - img
          - text: cyntro-tb-prod-asg-app AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntro-tb-prod-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp":
          - img
          - text: cyntro-tb-prod-asg-web AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntro-tb-prod-aurora Current graph data RDS · eu-west-1 · regional 2 in · 0 out Sep 11, 07:35 PM":
          - img
          - text: cyntro-tb-prod-aurora RDS · eu-west-1 · regional 2 in · 0 out
          - img
          - text: Sep 11, 07:35 PM
      - listitem:
        - button "cyntro-tb-prod-aurora-0 Current graph data RDS · eu-west-1b · data 0 in · 2 out Sep 11, 07:35 PM":
          - img
          - text: cyntro-tb-prod-aurora-0 RDS · eu-west-1b · data 0 in · 2 out
          - img
          - text: Sep 11, 07:35 PM
      - listitem:
        - button "cyntro-tb-prod-aurora-1 Current graph data RDS · eu-west-1a · data 0 in · 2 out Sep 11, 07:35 PM":
          - img
          - text: cyntro-tb-prod-aurora-1 RDS · eu-west-1a · data 0 in · 2 out
          - img
          - text: Sep 11, 07:35 PM
      - listitem:
        - button "cyntro-tb-prod-consumer-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM":
          - img
          - text: cyntro-tb-prod-consumer-daily EventBridge · eu-west-1 · regional 0 in · 2 out
          - img
          - text: Aug 31, 11:00 AM
      - listitem:
        - button "cyntro-tb-prod-consumer-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM":
          - img
          - text: cyntro-tb-prod-consumer-every_6h EventBridge · eu-west-1 · regional 0 in · 2 out
          - img
          - text: Aug 31, 11:00 AM
      - listitem:
        - button "cyntro-tb-prod-consumer-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Sep 1, 11:00 AM":
          - img
          - text: cyntro-tb-prod-consumer-frequent EventBridge · eu-west-1 · regional 0 in · 2 out
          - img
          - text: Sep 1, 11:00 AM
      - listitem:
        - button "cyntro-tb-prod-consumer-monthly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp":
          - img
          - text: cyntro-tb-prod-consumer-monthly Lambda · eu-west-1 · regional 2 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntro-tb-prod-consumer-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp":
          - img
          - text: cyntro-tb-prod-consumer-monthly EventBridge · eu-west-1 · regional 0 in · 2 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntro-tb-prod-consumer-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM":
          - img
          - text: cyntro-tb-prod-consumer-nightly_burst EventBridge · eu-west-1 · regional 0 in · 2 out
          - img
          - text: Aug 31, 11:00 AM
      - listitem:
        - button "cyntro-tb-prod-consumer-weekly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out Aug 29, 11:00 AM":
          - img
          - text: cyntro-tb-prod-consumer-weekly Lambda · eu-west-1 · regional 2 in · 0 out
          - img
          - text: Aug 29, 11:00 AM
      - listitem:
        - button "cyntro-tb-prod-consumer-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 29, 11:00 AM":
          - img
          - text: cyntro-tb-prod-consumer-weekly EventBridge · eu-west-1 · regional 0 in · 2 out
          - img
          - text: Aug 29, 11:00 AM
      - listitem:
        - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1a · web 2 in · 0 out Aug 20, 04:58 PM":
          - img
          - text: cyntro-tb-prod-web EC2 · eu-west-1a · web 2 in · 0 out
          - img
          - text: Aug 20, 04:58 PM
      - listitem:
        - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1b · web 2 in · 0 out Aug 20, 04:58 PM":
          - img
          - text: cyntro-tb-prod-web EC2 · eu-west-1b · web 2 in · 0 out
          - img
          - text: Aug 20, 04:58 PM
      - listitem:
        - button "cyntro-testbed-webshop-writer Current graph data Neptune · eu-west-1a · web 0 in · 2 out Sep 11, 07:35 PM":
          - img
          - text: cyntro-testbed-webshop-writer Neptune · eu-west-1a · web 0 in · 2 out
          - img
          - text: Sep 11, 07:35 PM
      - listitem:
        - button "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a Current graph data KMSKey · global · regional 1 in · 0 out No runtime timestamp":
          - img
          - text: arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a KMSKey · global · regional 1 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntro-evidence-testbed-webshop-950952 Current graph data S3 · global · regional 0 in · 1 out No runtime timestamp":
          - img
          - text: cyntro-evidence-testbed-webshop-950952 S3 · global · regional 0 in · 1 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntro-ingest-head-testbed-webshop Current graph data DynamoDB · eu-west-1 · regional 0 in · 1 out No runtime timestamp":
          - img
          - text: cyntro-ingest-head-testbed-webshop DynamoDB · eu-west-1 · regional 0 in · 1 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntro-tb-prod-alb-int Current graph data LoadBalancer · eu-west-1a · app 0 in · 1 out No runtime timestamp":
          - img
          - text: cyntro-tb-prod-alb-int LoadBalancer · eu-west-1a · app 0 in · 1 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntro-tb-prod-alb-pub Current graph data LoadBalancer · eu-west-1b · web 0 in · 1 out No runtime timestamp":
          - img
          - text: cyntro-tb-prod-alb-pub LoadBalancer · eu-west-1b · web 0 in · 1 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntro-tb-prod-loadgen Current graph data EC2 · eu-west-1a · app 0 in · 1 out Aug 18, 06:57 PM":
          - img
          - text: cyntro-tb-prod-loadgen EC2 · eu-west-1a · app 0 in · 1 out
          - img
          - text: Aug 18, 06:57 PM
      - listitem:
        - button "cyntro-testbed-webshop Current graph data Neptune · eu-west-1 · regional 1 in · 0 out Sep 11, 07:35 PM":
          - img
          - text: cyntro-testbed-webshop Neptune · eu-west-1 · regional 1 in · 0 out
          - img
          - text: Sep 11, 07:35 PM
      - listitem:
        - button "cyntro-tb-prod-logs-1c8276f5 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: cyntro-tb-prod-logs-1c8276f5 S3 · global · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
- contentinfo: Live read from /api/topology-risk/testbed-webshop. Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
- region "Notifications (F8)":
  - list
- alert
```

# Test source

```ts
  1895 |         motion: g.getAttribute('data-flow-motion'),
  1896 |         dash: dash && dash !== 'none' ? dash : null,
  1897 |         animations: g.querySelectorAll('animate, animateMotion, animateTransform').length,
  1898 |       })
  1899 |     }
  1900 |     return out
  1901 |   })()`
  1902 | 
  1903 |   const TOPMOST = (testid: string): string => `(() => {
  1904 |     const el = document.querySelector('[data-testid="${testid}"]')
  1905 |     if (!el) return null
  1906 |     let n = el, o = 1
  1907 |     while (n && n !== document.documentElement) { o *= Number(getComputedStyle(n).opacity); n = n.parentElement }
  1908 |     const r = el.getBoundingClientRect()
  1909 |     const probes = [[r.left + r.width/2, r.top + 6], [r.left + r.width/2, r.top + r.height/2], [r.left + r.width/2, r.bottom - 6]]
  1910 |     const covered = []
  1911 |     for (const [x, y] of probes) {
  1912 |       const t = document.elementFromPoint(x, y)
  1913 |       if (!t || !(el === t || el.contains(t))) covered.push(t ? (t.getAttribute('data-testid') || t.tagName.toLowerCase()) : 'nothing')
  1914 |     }
  1915 |     return { effectiveOpacity: o, covered, rect: { x: r.left, y: r.top, w: r.width, h: r.height }, inViewport: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 }
  1916 |   })()`
  1917 | 
  1918 |   /** Client-space shapes the LIVE_CONTINUATION probe returns. Named rather
  1919 |    *  than inlined: the probe runs in the browser and its result crosses back
  1920 |    *  as `any`, so these are the only place the shape is written down. */
  1921 |   interface ProbePoint {
  1922 |     x: number
  1923 |     y: number
  1924 |   }
  1925 |   interface ProbeRect {
  1926 |     left: number
  1927 |     top: number
  1928 |     right: number
  1929 |     bottom: number
  1930 |   }
  1931 | 
  1932 |   /** One drawn continuation path and the treatment the renderer gave it. */
  1933 |   interface ProbePath {
  1934 |     target: string
  1935 |     length: number
  1936 |     start: ProbePoint
  1937 |     end: ProbePoint
  1938 |     authority: string | null
  1939 |     pathBasis: string | null
  1940 |     motion: string | null
  1941 |     dash: string | null
  1942 |     animations: number
  1943 |   }
  1944 |   interface ProbeDestination {
  1945 |     flowId: string
  1946 |     identity: string
  1947 |     label: string
  1948 |     rect: ProbeRect
  1949 |   }
  1950 |   interface ContinuationProbe {
  1951 |     hasOverlay: boolean
  1952 |     hasIgw: boolean
  1953 |     igwRect: ProbeRect | null
  1954 |     paths: ProbePath[]
  1955 |     destinations: ProbeDestination[]
  1956 |   }
  1957 | 
  1958 |   const near = (p: ProbePoint, r: ProbeRect, pad = 30): boolean =>
  1959 |     p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad
  1960 | 
  1961 |   for (const vp of RELEASE_VIEWPORTS) {
  1962 |     test(`egress map on live C1 at ${vp.name}`, async ({ context, page }) => {
  1963 |       test.setTimeout(240_000)
  1964 |       // The same readiness every other live test establishes first. Without
  1965 |       // it the run reaches the login page and measures nothing — a second
  1966 |       // harness defect the ReferenceError was hiding behind.
  1967 |       await seedAuthCookie(context)
  1968 |       const consoleErrors: string[] = []
  1969 |       const failedRequests: string[] = []
  1970 |       const pageErrors: string[] = []
  1971 |       page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)) })
  1972 |       page.on("requestfailed", r => failedRequests.push(`${r.method()} ${r.url().slice(0, 200)}`))
  1973 |       page.on("pageerror", e => pageErrors.push(String(e).slice(0, 300)))
  1974 | 
  1975 |       await page.setViewportSize({ width: vp.width, height: vp.height })
  1976 | 
  1977 |       // The deployed revision this QA is about.
  1978 |       const bv = await page.request.get("/api/build-version")
  1979 |       expect(bv.ok(), `${vp.name}: /api/build-version returned HTTP ${bv.status()}`).toBe(true)
  1980 |       const build = await bv.json()
  1981 |       report("release-build-version", build)
  1982 |       expect(
  1983 |         String(build?.deploymentVersion ?? ""),
  1984 |         `${vp.name}: deploymentVersion is not a full Git SHA`,
  1985 |       ).toMatch(/^[0-9a-f]{40}$/)
  1986 |       if (EXPECTED_FRONTEND_SHA) {
  1987 |         expect(
  1988 |           build?.deploymentVersion,
  1989 |           `${vp.name}: tested a different frontend revision than the release under review`,
  1990 |         ).toBe(EXPECTED_FRONTEND_SHA)
  1991 |       }
  1992 | 
  1993 |       await openMap(page, `release-${vp.name}`)
  1994 |       const deps = page.getByTestId("topology-estate-flow-mode-all_access").first()
> 1995 |       await expect(deps, `${vp.name}: Dependencies lens control is missing`).toBeVisible()
       |                                                                              ^ Error: 1600x900: Dependencies lens control is missing
  1996 |       await deps.click()
  1997 |       await page.waitForTimeout(1200)
  1998 | 
  1999 |       // --- the page's OWN payload, so the screen is checked against the graph
  2000 |       const res = await page.request.get(TOPOLOGY_RISK_PATH)
  2001 |       expect(res.ok(), `${vp.name}: topology-risk returned HTTP ${res.status()}`).toBe(true)
  2002 |       const payload = await res.json()
  2003 |       const edges = (payload?.traffic_edges ?? payload?.data?.traffic_edges ?? []) as Array<Record<string, unknown>>
  2004 |       const observedEgress = edges.filter(e => {
  2005 |         const t = String(e.target_id ?? "")
  2006 |         if (!(t === "__igw__" || t.startsWith("igw-"))) return false
  2007 |         if (e.evidence_type === "configured" || e.path_basis === "configured_route" || e.authority_state === "configured") return false
  2008 |         return e.evidence_type === "observed" || e.external_destinations != null || ((e.egress_breakdown as unknown[]) ?? []).length > 0
  2009 |       })
  2010 |       const gateways = [...new Set(observedEgress.flatMap(e => ((e.egress_hops as Array<{kind:string;id:string}>) ?? []).filter(h => h.kind === "igw").map(h => h.id)))]
  2011 |       report("release-payload", { observed_egress_legs: observedEgress.length, gateways })
  2012 |       expect(
  2013 |         observedEgress.length,
  2014 |         `${vp.name}: the release acceptance payload has no observed egress legs`,
  2015 |       ).toBeGreaterThan(0)
  2016 |       expect(gateways.length, `${vp.name}: observed egress names no IGW hop`).toBeGreaterThan(0)
  2017 | 
  2018 |       // --- Glance (default) then Inventory, embedded -----------------------
  2019 |       for (const density of ["glance", "inventory"] as const) {
  2020 |         const toggle = page.getByTestId(`topology-estate-density-${density}`)
  2021 |         await expect(toggle, `${vp.name}: no embedded ${density} control`).toBeVisible()
  2022 |         await toggle.click()
  2023 |         await page.waitForTimeout(1200)
  2024 | 
  2025 |         const lane = page.getByTestId("topology-external-destinations-lane")
  2026 |         const laneVisible = await lane.isVisible().catch(() => false)
  2027 |         report(`release-lane-${density}-${vp.name}`, {
  2028 |           visible: laneVisible,
  2029 |           nodes: laneVisible ? await lane.getAttribute("data-node-count") : null,
  2030 |           totalNamed: laneVisible ? await lane.getAttribute("data-total-named") : null,
  2031 |           hidden: laneVisible ? await lane.getAttribute("data-hidden-count") : null,
  2032 |           attributed: laneVisible ? await lane.getAttribute("data-attributed-count") : null,
  2033 |           gateway: laneVisible ? await lane.getAttribute("data-gateway-id") : null,
  2034 |         })
  2035 | 
  2036 |         if (observedEgress.length > 0) {
  2037 |           expect(laneVisible, `${density}·${vp.name}: payload has ${observedEgress.length} observed egress legs and no lane is drawn`).toBe(true)
  2038 |           await lane.scrollIntoViewIfNeeded()
  2039 |           if (gateways.length > 0) {
  2040 |             expect(gateways, `${density}·${vp.name}: the lane names a gateway the payload does not`).toContain(
  2041 |               await lane.getAttribute("data-gateway-id"),
  2042 |             )
  2043 |           }
  2044 | 
  2045 |           // The continuation, and how it was DRAWN.
  2046 |           const geo = (await page.evaluate(LIVE_CONTINUATION)) as ContinuationProbe
  2047 |           report(`release-continuation-${density}-${vp.name}`, {
  2048 |             paths: geo.paths.length,
  2049 |             destinations: geo.destinations.length,
  2050 |             treatments: geo.paths.map(p => ({ authority: p.authority, pathBasis: p.pathBasis, motion: p.motion, dash: p.dash, animations: p.animations })),
  2051 |           })
  2052 |           expect(geo.paths.length, `${density}·${vp.name}: no IGW → destination path is drawn`).toBeGreaterThan(0)
  2053 |           // Narrowed, not asserted: the probe returns null for igwRect when the
  2054 |           // gateway chip is absent, and a non-null assertion there would turn a
  2055 |           // missing IGW into a confusing geometry failure instead of this one.
  2056 |           expect(geo.igwRect, `${density}·${vp.name}: the in-map IGW chip has no rect to leave from`).not.toBeNull()
  2057 |           const igwRect = geo.igwRect as ProbeRect
  2058 |           const byId = new Map<string, ProbeRect>(geo.destinations.map(d => [d.flowId, d.rect]))
  2059 |           const landed = geo.paths.filter(p => {
  2060 |             const dst = byId.get(p.target); if (!dst) return false
  2061 |             return (near(p.start, igwRect) && near(p.end, dst)) || (near(p.end, igwRect) && near(p.start, dst))
  2062 |           })
  2063 |           expect(landed.length, `${density}·${vp.name}: a continuation path lands on neither chip`).toBeGreaterThan(0)
  2064 |           // Dashed, static, never live.
  2065 |           for (const p of geo.paths) {
  2066 |             expect(p.authority, `${density}·${vp.name}: continuation not marked inferred`).toBe("inferred")
  2067 |             expect(p.pathBasis, `${density}·${vp.name}: continuation not marked synthetic`).toBe("synthetic_expansion")
  2068 |             expect(p.motion, `${density}·${vp.name}: continuation qualified for traffic motion`).toBe("none")
  2069 |             expect(p.dash, `${density}·${vp.name}: continuation drawn SOLID — reads as a measured path`).not.toBeNull()
  2070 |             expect(p.animations, `${density}·${vp.name}: continuation animated as live traffic`).toBe(0)
  2071 |           }
  2072 | 
  2073 |           // The Data tier stays clear of the lane.
  2074 |           const laneBox = await lane.boundingBox()
  2075 |           const cells = page.locator('[data-tier="data"]')
  2076 |           for (let i = 0; i < (await cells.count()); i++) {
  2077 |             const c = await cells.nth(i).boundingBox()
  2078 |             if (!c || !laneBox) continue
  2079 |             const w = Math.min(laneBox.x + laneBox.width, c.x + c.width) - Math.max(laneBox.x, c.x)
  2080 |             const h = Math.min(laneBox.y + laneBox.height, c.y + c.height) - Math.max(laneBox.y, c.y)
  2081 |             expect(w > 0 && h > 0 ? Math.round(w * h) : 0, `${density}·${vp.name}: lane overlaps data-tier cell ${i}`).toBe(0)
  2082 |           }
  2083 | 
  2084 |           // "+N more" must HOLD what it offers.
  2085 |           const hidden = Number(await lane.getAttribute("data-hidden-count"))
  2086 |           if (hidden > 0) {
  2087 |             const more = page.getByTestId("topology-external-destinations-more")
  2088 |             await more.click()
  2089 |             const panel = page.getByTestId("topology-external-destinations-more-details")
  2090 |             await expect(panel).toBeVisible()
  2091 |             await page.waitForTimeout(400)
  2092 |             const items = panel.getByTestId("topology-external-destinations-more-item")
  2093 |             const listed = await items.count()
  2094 |             const stack = (await page.evaluate(TOPMOST("topology-external-destinations-more-details"))) as any
  2095 |             report(`release-more-${density}-${vp.name}`, { hidden, listed, stack })
```