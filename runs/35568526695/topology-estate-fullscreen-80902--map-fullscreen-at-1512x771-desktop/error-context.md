# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-fullscreen-stacking-fixture.spec.ts >> external-destinations panel is topmost inside map fullscreen at 1512x771
- Location: tests/integration/topology-estate-fullscreen-stacking-fixture.spec.ts:136:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('topology-estate-map-fullscreen')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('topology-estate-map-fullscreen')

```

```yaml
- text: Scope
- img
- text: Organization
- combobox "Organization":
  - option "cyntro-dev" [selected]
- img
- text: Group
- combobox "Group":
  - option "All account groups" [selected]
- img
- text: Account
- combobox "Account":
  - option "All accounts" [selected]
  - option "ashtaralon · 745783559495"
- img
- text: Region
- combobox "Region":
  - option "All regions" [selected]
  - option "eu-west-1"
  - option "global"
  - option "us-east-1"
- text: 1 account in view
- banner:
  - text: Estate · Topology v0.2 · alon-prod SafeRemediate-Test-Frontend-1 is LATENT_EXPOSURE — inbound path open, unused (zero public inbound in 365 days). Observed egress to 566 external destinations (365d). scored 2026-07-09T11:36:31Z · 4 flagged · posture_correlated_at >= now() - 7d on any workload · VPC vpc-0329e985173bed24f Evidence computed Jul 9, 2026, 11:36 AM Live graph
  - button "System stats"
- text: Region scope
- combobox "Region scope":
  - option "eu-west-1" [selected]
  - option "global"
  - option "us-east-1"
- text: VPC scope
- combobox "VPC scope":
  - option "All VPCs · Compare"
  - option "alon-prod-vpc · vpc-0329e985173bed24f (6 workloads)" [selected]
  - option "vpc-086bcc2186fa42c96 · vpc-086bcc2186fa42c96 (8 workloads)"
- text: Subnet-linked compute in tier cells; regional/serverless on the right rail. Availability zones
- button "eu-west-1a" [pressed]
- button "eu-west-1b" [pressed]
- text: In this VPC
- button "EC2 (3)" [pressed]
- button "RDS (2)" [pressed]
- button "Neptune (2)" [pressed]
- button "TargetGroup (2)" [pressed]
- button "AutoScalingGroup (2)" [pressed]
- text: System-wide
- button "S3 (10)" [pressed]
- button "DynamoDB (8)" [pressed]
- button "Lambda (6)" [pressed]
- button "EventBridge (6)" [pressed]
- button "Show all"
- button "Clear all"
- main:
  - tablist "Estate view":
    - tab "Command map"
    - tab "Network topology" [selected]
    - tab "Identity & access"
  - group "Map density":
    - button "Glance"
    - button "Inventory"
  - button "Shared neighbors" [pressed]
  - button "Open map fullscreen":
    - img
    - text: Map fullscreen
  - text: Platform map 1 VPC · 2 AZ · 6 subnets · 41 resources Map lens
  - button "Architecture":
    - img
    - text: Architecture
  - button "Dependencies" [pressed]:
    - img
    - text: Dependencies
  - button "Attack paths":
    - img
    - text: Attack paths
  - text: Flow colors Service call AWS data service VPC endpoint Internet egress Database Exposure / attack Moving = authoritative observed Outlined motion = historical direction Solid = configured Dashed = inferred / unverified Confirmed TCP paths Confirmed TCP segments are authoritative; a missing segment is not evidence of no traffic. Flow-log coverage Partly covered 12 of 12 eligible endpoints covered · 6 unknown · 18 not applicable · generation 7
  - button "Coverage details (2)"
  - text: Users Clients & operators Internet Public path via IGW · alon-prod-igw ☁ AWS Cloud · acct 745783559495 Region · eu-west-1 VPC · vpc-0329e985173bed24f SafeRemediate-Test-… ×3 Availability Zone · eu-west-1a Public · SafeRemediate-Test-Public-1 10.0.1.0/24
  - button "high posture score …Frontend-1": …Frontend-1
  - text: Private · SafeRemediate-Test-Private-App-1 10.0.10.0/24 No workloads Data · SafeRemediate-Test-Private-DB-1 10.0.20.0/24
  - button "quiet posture score saferemediate-test-db": saferemediate-test-db
  - button "Posture not scored fixture-neptune-1": fixture-neptune-1
  - text: Availability Zone · eu-west-1b Public · SafeRemediate-Test-Public-2 10.0.2.0/24
  - button "high posture score …Frontend-2": …Frontend-2
  - text: Private · SafeRemediate-Test-Private-App-2 10.0.11.0/24
  - button "quiet posture score …App-2": …App-2
  - text: Data · SafeRemediate-Test-Private-DB-2 10.0.21.0/24 No workloads VPC boundary ↑ Internet
  - button "IGW alon-prod-igw"
  - text: "egress: 9 workloads Endpoints (4)"
  - button "VPCE IF EC2 Messages"
  - text: "use: not observed"
  - button "VPCE GW Amazon S3"
  - text: "use: not observed"
  - button "VPCE IF AWS Systems Manager"
  - text: "use: 3 workloads"
  - button "VPCE IF SSM Messages"
  - text: "use: 1 workload Outside the VPC Destinations observed this generation · NAT → IGW is configured routing S3 AWS service 3.253.225.145 address 3.5.67.254 address · 8 workloads 3.5.69.34 address · 8 workloads 3.5.72.119 address · 8 workloads 3.5.72.73 address · 8 workloads"
  - button "+3 more"
  - text: 9 workloads NAT nat-fixture0a1b2c3d4 IGW igw-03bb3f19b706abbc4
  - button "External destinations 9 workloads · up to 2579 distinct · addresses sampled"
  - text: Not in this VPC ALB · alon-prod-3tier-alb VPC vpc-086bcc2186… · payment-production Lambda runtime (6) outside subnet grid · 6 attachment unverified · SafeRemediate-… ×4
  - button "S3 traffic from 4 of 6 functions"
  - text: Triggers (6)
  - button "Posture not scored fixture-frequent": fixture-frequent
  - button "Posture not scored fixture-every_6h": fixture-every_6h
  - button "Posture not scored fixture-daily": fixture-daily
  - button "Posture not scored fixture-nightly_burst": fixture-nightly_burst
  - button "Posture not scored fixture-weekly": fixture-weekly
  - button "Posture not scored fixture-monthly": fixture-monthly
  - button "quiet posture score AlonIAMTest-traffic-generator": AlonIAMTest-traffic-generator
  - button "quiet posture score PaymentTrafficGenerator": PaymentTrafficGenerator
  - button "quiet posture score …BehaviorAnalyzer": …BehaviorAnalyzer
  - button "quiet posture score …ConfidenceScorer": …ConfidenceScorer
  - button "quiet posture score …CreateCheckpoint": …CreateCheckpoint
  - button "quiet posture score …PrismaWebhook": …PrismaWebhook
  - text: Regional · S3 / DDB (18) SafeRemediate-… ×3
  - button "quiet posture score alon-demo-data-bucket-745783559495": alon-demo-data-bucket-745783559495
  - button "S3×9"
  - button "DynamoDB×8"
  - button "Logical groups · members carry the placement (6) Show members"
  - button "Diagnostics 6 serverless · 51 flows ▴"
  - text: Serverless compute (6)
  - button "AlonIAMTest-traffic-generator Lambda · arn:aws:lambda:eu-west-1 24"
  - button "PaymentTrafficGenerator Lambda · arn:aws:lambda:eu-west-1 18"
  - button "SafeRemediate-BehaviorAnalyzer Lambda · arn:aws:lambda:eu-west-1 18"
  - button "SafeRemediate-ConfidenceScorer Lambda · arn:aws:lambda:eu-west-1 18"
  - button "SafeRemediate-CreateCheckpoint Lambda · arn:aws:lambda:eu-west-1 18"
  - button "SafeRemediate-PrismaWebhook Lambda · arn:aws:lambda:eu-west-1 18"
  - text: Observed traffic — animated arrows above 51 flows · 30 internal · 4 edge-service · 4 vpce · 4 database · 9 egress Listing 42 of 51 — the current lens and selection hide the rest. The counts above are the full evidence. SafeRemediate-Test-App-2 → vpce-0f983779fff3bbae7 VPCE SafeRemediate-Test-Frontend-1 → vpce-0f983779fff3bbae7 VPCE SafeRemediate-Test-Frontend-1 → vpce-04ffe43eea196bf89 VPCE SafeRemediate-Test-Frontend-2 → vpce-0f983779fff3bbae7 VPCE SafeRemediate-Test-App-2 → Internet (via IGW) egress · 3 (ext 3) SafeRemediate-Test-Frontend-1 → Internet (via IGW) egress · 532 (ext 532 · S3 2) SafeRemediate-Test-Frontend-2 → Internet (via IGW) egress · 588 (ext 588) SafeRemediate-Test-Frontend-1 → saferemediate-test-db RDS · 5432 SafeRemediate-Test-Frontend-2 → saferemediate-test-db RDS · 3306 SafeRemediate-Test-App-2 → saferemediate-test-db RDS fixture-tg-web → SafeRemediate-Test-App-2 TARGETS fixture-tg-web → SafeRemediate-Test-Frontend-1 TARGETS + 30 more flows Encoding Worst (carmine halo + pulse) High / elevated (ring only) ♛ Crown-jewel halo Clean · remediated (teal ring) Stale (dimmed) Coverage gap (not collected)
- complementary:
  - complementary:
    - heading "Service index" [level=2]
    - text: "41"
    - searchbox "Find service in topology"
    - button "Filters":
      - img
      - text: Filters
    - list:
      - listitem:
        - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 3 in · 4 out Jul 9, 11:04 AM":
          - img
          - text: SafeRemediate-Test-Frontend-1 EC2 · eu-west-1a · web 3 in · 4 out
          - img
          - text: Jul 9, 11:04 AM
      - listitem:
        - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 3 in · 3 out Jul 9, 10:40 AM":
          - img
          - text: SafeRemediate-Test-App-2 EC2 · eu-west-1b · app 3 in · 3 out
          - img
          - text: Jul 9, 10:40 AM
      - listitem:
        - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 2 in · 3 out Jul 9, 11:04 AM":
          - img
          - text: SafeRemediate-Test-Frontend-2 EC2 · eu-west-1b · web 2 in · 3 out
          - img
          - text: Jul 9, 11:04 AM
      - listitem:
        - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 4 in · 0 out Sep 12, 04:00 AM":
          - img
          - text: alon-demo-data-bucket-745783559495 S3 · eu-west-1 · regional 4 in · 0 out
          - img
          - text: Sep 12, 04:00 AM
      - listitem:
        - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 4 in · 0 out Jul 6, 03:05 PM":
          - img
          - text: saferemediate-test-db RDS · eu-west-1a · data 4 in · 0 out
          - img
          - text: Jul 6, 03:05 PM
      - listitem:
        - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM":
          - img
          - text: AlonIAMTest-traffic-generator Lambda · eu-west-1 · regional 2 in · 1 out
          - img
          - text: Sep 12, 04:00 AM
      - listitem:
        - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM":
          - img
          - text: PaymentTrafficGenerator Lambda · eu-west-1 · regional 2 in · 1 out
          - img
          - text: Sep 12, 04:00 AM
      - listitem:
        - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM":
          - img
          - text: SafeRemediate-BehaviorAnalyzer Lambda · eu-west-1 · regional 2 in · 1 out
          - img
          - text: Sep 12, 04:00 AM
      - listitem:
        - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM":
          - img
          - text: SafeRemediate-ConfidenceScorer Lambda · eu-west-1 · regional 2 in · 1 out
          - img
          - text: Sep 12, 04:00 AM
      - listitem:
        - button "fixture-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp":
          - img
          - text: fixture-asg-app AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "fixture-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp":
          - img
          - text: fixture-asg-web AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "fixture-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp":
          - img
          - text: fixture-daily EventBridge · eu-west-1 · regional 0 in · 2 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "fixture-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp":
          - img
          - text: fixture-every_6h EventBridge · eu-west-1 · regional 0 in · 2 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "fixture-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp":
          - img
          - text: fixture-frequent EventBridge · eu-west-1 · regional 0 in · 2 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "fixture-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp":
          - img
          - text: fixture-monthly EventBridge · eu-west-1 · regional 0 in · 2 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "fixture-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp":
          - img
          - text: fixture-nightly_burst EventBridge · eu-west-1 · regional 0 in · 2 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "fixture-tg-app Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp":
          - img
          - text: fixture-tg-app TargetGroup · eu-west-1 · VPC 0 in · 2 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "fixture-tg-web Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp":
          - img
          - text: fixture-tg-web TargetGroup · eu-west-1 · VPC 0 in · 2 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "fixture-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp":
          - img
          - text: fixture-weekly EventBridge · eu-west-1 · regional 0 in · 2 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp":
          - img
          - text: SafeRemediate-CreateCheckpoint Lambda · eu-west-1 · regional 2 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp":
          - img
          - text: SafeRemediate-PrismaWebhook Lambda · eu-west-1 · regional 2 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "fixture-aurora Current graph data RDS · eu-west-1 · VPC 0 in · 1 out No runtime timestamp":
          - img
          - text: fixture-aurora RDS · eu-west-1 · VPC 0 in · 1 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "fixture-graph Current graph data Neptune · eu-west-1 · VPC 0 in · 1 out No runtime timestamp":
          - img
          - text: fixture-graph Neptune · eu-west-1 · VPC 0 in · 1 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "fixture-neptune-1 Current graph data Neptune · eu-west-1a · data 1 in · 0 out No runtime timestamp":
          - img
          - text: fixture-neptune-1 Neptune · eu-west-1a · data 1 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth S3 · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: cyntro-demo-analytics-745783559495 S3 · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: cyntro-demo-eu S3 · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: cyntro-demo-prod-data-745783559495 S3 · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: cyntronewtestbucket S3 · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: cyntrotest2 S3 · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: impaciq-findings DynamoDB · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: impaciq-remediation-history DynamoDB · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: impaciq-scan-status DynamoDB · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: least_privilege_role_state DynamoDB · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: saferemediate-access-logs-745783559495 S3 · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: saferemediate-demo-cloudtrail-745783559495 S3 · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: SafeRemediate-Executions DynamoDB · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: SafeRemediate-Findings DynamoDB · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: saferemediate-logs-745783559495 S3 · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: SafeRemediate-Simulations DynamoDB · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
      - listitem:
        - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp":
          - img
          - text: sg_state DynamoDB · eu-west-1 · regional 0 in · 0 out
          - img
          - text: No runtime timestamp
- contentinfo: Live read from /api/topology-risk/alon-prod. Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
- region "Notifications (F8)":
  - list
- alert
```

# Test source

```ts
  54  |   const wrapper = el.closest('[data-radix-popper-content-wrapper]')
  55  |   const fs = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
  56  |   const zOf = (n) => {
  57  |     if (!n) return null
  58  |     const v = getComputedStyle(n).zIndex
  59  |     return v === 'auto' ? null : Number(v)
  60  |   }
  61  |   let node = el
  62  |   let product = 1
  63  |   while (node && node !== document.documentElement) {
  64  |     product *= Number(getComputedStyle(node).opacity)
  65  |     node = node.parentElement
  66  |   }
  67  |   const r = el.getBoundingClientRect()
  68  |   const probes = [
  69  |     ['top', r.left + r.width * 0.5, r.top + 6],
  70  |     ['middle', r.left + r.width * 0.5, r.top + r.height * 0.5],
  71  |     ['bottom', r.left + r.width * 0.5, r.bottom - 6],
  72  |     ['left', r.left + 6, r.top + r.height * 0.5],
  73  |     ['right', r.right - 6, r.top + r.height * 0.5],
  74  |   ]
  75  |   const covered = []
  76  |   for (const [name, x, y] of probes) {
  77  |     const top = document.elementFromPoint(x, y)
  78  |     if (!top || !(el === top || el.contains(top))) {
  79  |       covered.push({
  80  |         probe: name,
  81  |         x: Math.round(x),
  82  |         y: Math.round(y),
  83  |         hit: top
  84  |           ? (top.getAttribute('data-testid') || top.tagName.toLowerCase() + '.' + String(top.className).slice(0, 48))
  85  |           : 'nothing',
  86  |       })
  87  |     }
  88  |   }
  89  |   return {
  90  |     hasWrapper: !!wrapper,
  91  |     wrapperZ: zOf(wrapper),
  92  |     contentZ: zOf(el),
  93  |     fullscreenZ: zOf(fs),
  94  |     // The panel is portaled to the body, so it is NOT a descendant of the
  95  |     // fullscreen layer. That is precisely why the z-indexes have to be
  96  |     // compared: if this were ever true, the layer would carry the panel with
  97  |     // it and the numbers would stop mattering.
  98  |     panelInsideFullscreen: !!(fs && wrapper && fs.contains(wrapper)),
  99  |     effectiveOpacity: product,
  100 |     rect: { x: r.left, y: r.top, w: r.width, h: r.height },
  101 |     covered,
  102 |   }
  103 | })()`
  104 | 
  105 | async function probe(page: Page) {
  106 |   return page.evaluate(STACKING_PROBE) as Promise<{
  107 |     hasWrapper: boolean
  108 |     wrapperZ: number | null
  109 |     contentZ: number | null
  110 |     fullscreenZ: number | null
  111 |     panelInsideFullscreen: boolean
  112 |     effectiveOpacity: number
  113 |     rect: { x: number; y: number; w: number; h: number }
  114 |     covered: Array<{ probe: string; x: number; y: number; hit: string }>
  115 |   } | null>
  116 | }
  117 | 
  118 | /** Settle on the same predicate the assertions use, so a screenshot can never
  119 |  *  capture a frame the measurements would have rejected. */
  120 | async function waitForSettledPanel(page: Page, where: string) {
  121 |   try {
  122 |     await page.waitForFunction(
  123 |       `(() => { const s = ${STACKING_PROBE}; return !!s && s.effectiveOpacity >= 0.999 && s.covered.length === 0 })()`,
  124 |       undefined,
  125 |       { timeout: 10_000 },
  126 |     )
  127 |   } catch {
  128 |     const state = await probe(page)
  129 |     throw new Error(
  130 |       `the panel never settled opaque and on top in fullscreen (${where}): ${JSON.stringify(state)}`,
  131 |     )
  132 |   }
  133 | }
  134 | 
  135 | for (const vp of VIEWPORTS) {
  136 |   test(`external-destinations panel is topmost inside map fullscreen at ${vp.name}`, async ({
  137 |     context,
  138 |     page,
  139 |   }) => {
  140 |     test.setTimeout(150_000)
  141 |     const groups = logicalGroupSnapshot()
  142 |     const triggers = triggerBundleSnapshot(groups.snapshot)
  143 |     const egress = externalEgressSnapshot(triggers.snapshot)
  144 |     await seedAuthCookie(context)
  145 |     await routeSnapshot(page, egress.snapshot)
  146 |     await page.setViewportSize({ width: vp.width, height: vp.height })
  147 |     await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  148 |     await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  149 |     await page.getByRole("tab", { name: "Network topology" }).click()
  150 | 
  151 |     // --- enter the real z-200 layer ----------------------------------------
  152 |     await page.getByTestId("topology-estate-map-enlarge").click()
  153 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
> 154 |     await expect(fullscreen).toBeVisible()
      |                              ^ Error: expect(locator).toBeVisible() failed
  155 | 
  156 |     // Anchor the test to the layer it is about. If the fullscreen z-index is
  157 |     // ever changed, this line says so directly instead of leaving a hit test
  158 |     // to fail somewhere further down with a confusing message.
  159 |     const fullscreenZ = await fullscreen.evaluate(el => getComputedStyle(el).zIndex)
  160 |     expect(fullscreenZ, "the fullscreen layer no longer carries z-index 200").toBe("200")
  161 | 
  162 |     // The trigger lives INSIDE that layer; the panel will not.
  163 |     const external = fullscreen.getByTestId("topology-external-destinations")
  164 |     await expect(external).toBeVisible()
  165 |     await expect(external).toHaveAttribute("data-open", "false")
  166 |     await expect(external).toHaveAttribute("data-leg-count", String(egress.legCount))
  167 |     await page.screenshot({
  168 |       path: `test-results/estate-fullscreen-default-${vp.name}.png`,
  169 |       fullPage: false,
  170 |     })
  171 | 
  172 |     // --- open it and measure the paint order -------------------------------
  173 |     await external.getByTestId("topology-external-destinations-toggle").click()
  174 |     await expect(external).toHaveAttribute("data-open", "true")
  175 |     const panel = page.getByTestId("topology-external-destinations-details")
  176 |     await expect(panel).toHaveCount(1)
  177 |     await expect(panel).toBeVisible()
  178 |     await waitForSettledPanel(page, `${vp.name} · measurement`)
  179 | 
  180 |     const s = await probe(page)
  181 |     expect(s, "the panel is measurable in fullscreen").not.toBeNull()
  182 |     expect(s!.hasWrapper, "Radix no longer wraps the content in a popper wrapper").toBe(true)
  183 |     expect(
  184 |       s!.panelInsideFullscreen,
  185 |       "the panel is portaled into the fullscreen layer now — the z-index comparison below no longer describes the real stacking",
  186 |     ).toBe(false)
  187 | 
  188 |     // The mechanism, asserted rather than trusted: the wrapper's order is the
  189 |     // CONTENT's order, copied inline. If Radix ever stops propagating it, the
  190 |     // wrapper falls back to `auto` and this fails with that fact named.
  191 |     expect(s!.contentZ, `the panel content carries no z-index at ${vp.name}`).not.toBeNull()
  192 |     expect(s!.wrapperZ, `the popper wrapper carries no z-index at ${vp.name}`).not.toBeNull()
  193 |     expect(
  194 |       s!.wrapperZ,
  195 |       `Radix did not copy the content's z-index onto the wrapper at ${vp.name} (content ${s!.contentZ}, wrapper ${s!.wrapperZ})`,
  196 |     ).toBe(s!.contentZ)
  197 | 
  198 |     // The invariant that makes it visible, stated as the comparison rather
  199 |     // than as a magic number, so it keeps holding if either layer moves.
  200 |     expect(s!.fullscreenZ, "the fullscreen layer is measurable").not.toBeNull()
  201 |     expect(
  202 |       s!.wrapperZ!,
  203 |       `the panel's wrapper (${s!.wrapperZ}) is not above the fullscreen layer (${s!.fullscreenZ}) at ${vp.name}`,
  204 |     ).toBeGreaterThan(s!.fullscreenZ!)
  205 | 
  206 |     // The assertion of record. Everything above can be right and the reader
  207 |     // still see the map: this is the one that matches what they experience.
  208 |     expect(
  209 |       s!.covered,
  210 |       `something paints over the panel inside fullscreen at ${vp.name} — an opaque panel under the map is invisible, not translucent: ${JSON.stringify(s!.covered)}`,
  211 |     ).toEqual([])
  212 |     expect(
  213 |       s!.effectiveOpacity,
  214 |       `panel's effective opacity is below 1 in fullscreen at ${vp.name}`,
  215 |     ).toBeGreaterThanOrEqual(0.999)
  216 | 
  217 |     // Contained and legible where it landed — fullscreen has its own chrome
  218 |     // and its own collision boundary, so the embedded measurement does not
  219 |     // carry over.
  220 |     expect(s!.rect.x, `panel off the left at ${vp.name}`).toBeGreaterThanOrEqual(-1)
  221 |     expect(s!.rect.y, `panel off the top at ${vp.name}`).toBeGreaterThanOrEqual(-1)
  222 |     expect(s!.rect.x + s!.rect.w, `panel off the right at ${vp.name}`).toBeLessThanOrEqual(vp.width + 1)
  223 |     expect(s!.rect.y + s!.rect.h, `panel off the bottom at ${vp.name}`).toBeLessThanOrEqual(
  224 |       vp.height + 1,
  225 |     )
  226 |     expect(s!.rect.w, `panel too narrow to read at ${vp.name}`).toBeGreaterThanOrEqual(260)
  227 |     await expect(panel.getByTestId("topology-external-destination-leg")).toHaveCount(egress.legCount)
  228 | 
  229 |     const legible = await panel.evaluate(p => {
  230 |       const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize)
  231 |       const legs = Array.from(
  232 |         p.querySelectorAll<HTMLElement>('[data-testid="topology-external-destination-leg"]'),
  233 |       )
  234 |       return {
  235 |         captionPx: px(p.querySelector("p")!),
  236 |         minLegPx: Math.min(...legs.map(px)),
  237 |         clipped: legs.filter(el => el.scrollWidth > el.clientWidth + 1).length,
  238 |       }
  239 |     })
  240 |     expect(legible.captionPx, `panel caption below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
  241 |     expect(legible.minLegPx, `panel leg text below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
  242 |     expect(legible.clipped, `clipped leg lines at ${vp.name}`).toBe(0)
  243 | 
  244 |     await page.screenshot({
  245 |       path: `test-results/estate-fullscreen-expanded-${vp.name}.png`,
  246 |       fullPage: false,
  247 |     })
  248 | 
  249 |     // The panel closes with its own control and fullscreen still stands: a
  250 |     // popover that tore the layer down would also "pass" every check above.
  251 |     await external.getByTestId("topology-external-destinations-toggle").click()
  252 |     await expect(external).toHaveAttribute("data-open", "false")
  253 |     await expect(fullscreen).toBeVisible()
  254 |   })
```