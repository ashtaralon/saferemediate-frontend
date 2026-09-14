# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-egress-map-fixture.spec.ts >> the IGW continues into the external lane at 1512x771 · glance
- Location: tests/integration/topology-estate-egress-map-fixture.spec.ts:148:9

# Error details

```
Error: the external-destination lane is not drawn by default

expect(locator).toBeVisible() failed

Locator: getByTestId('topology-external-destinations-lane')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - the external-destination lane is not drawn by default with timeout 5000ms
  - waiting for getByTestId('topology-external-destinations-lane')

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
  - text: Users Clients & operators Internet Public path via IGW · alon-prod-igw 9 workloads NAT nat-fixture0a1b2c3d4 IGW igw-03bb3f19b706abbc4
  - button "External destinations 9 workloads · up to 2579 distinct · addresses sampled"
  - text: ☁ AWS Cloud · acct 745783559495 Region · eu-west-1 VPC · vpc-0329e985173bed24f SafeRemediate-Test-… ×3 Availability Zone · eu-west-1a Public · SafeRemediate-Test-Public-1 10.0.1.0/24
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
  - text: "use: 1 workload Not in this VPC ALB · alon-prod-3tier-alb VPC vpc-086bcc2186… · payment-production Lambda runtime (6) outside subnet grid · 6 attachment unverified · SafeRemediate-… ×4"
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
  - text: Observed traffic — animated arrows above 51 flows · 30 internal · 4 edge-service · 4 vpce · 4 database · 9 egress Listing 36 of 51 — the current lens and selection hide the rest. The counts above are the full evidence. SafeRemediate-Test-App-2 → vpce-0f983779fff3bbae7 VPCE SafeRemediate-Test-Frontend-1 → vpce-0f983779fff3bbae7 VPCE SafeRemediate-Test-Frontend-1 → vpce-04ffe43eea196bf89 VPCE SafeRemediate-Test-Frontend-2 → vpce-0f983779fff3bbae7 VPCE SafeRemediate-Test-App-2 → Internet (via IGW) egress · 3 (ext 3) SafeRemediate-Test-Frontend-1 → Internet (via IGW) egress · 532 (ext 532 · S3 2) SafeRemediate-Test-Frontend-2 → Internet (via IGW) egress · 588 (ext 588) SafeRemediate-Test-Frontend-1 → saferemediate-test-db RDS · 5432 SafeRemediate-Test-Frontend-2 → saferemediate-test-db RDS · 3306 SafeRemediate-Test-App-2 → saferemediate-test-db RDS fixture-tg-web → SafeRemediate-Test-App-2 TARGETS fixture-tg-web → SafeRemediate-Test-Frontend-1 TARGETS + 24 more flows Encoding Worst (carmine halo + pulse) High / elevated (ring only) ♛ Crown-jewel halo Clean · remediated (teal ring) Stale (dimmed) Coverage gap (not collected)
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
  66  |     const path = g.querySelector('path[d]')
  67  |     if (!path) continue
  68  |     const total = path.getTotalLength()
  69  |     if (!total) continue
  70  |     const m = path.getScreenCTM()
  71  |     if (!m) continue
  72  |     const a = path.getPointAtLength(0).matrixTransform(m)
  73  |     const b = path.getPointAtLength(total).matrixTransform(m)
  74  |     out.paths.push({ target: target, start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y }, length: total })
  75  |   }
  76  |   return out
  77  | })()`
  78  | 
  79  | interface Rect {
  80  |   left: number
  81  |   top: number
  82  |   right: number
  83  |   bottom: number
  84  | }
  85  | 
  86  | /** Within `pad` px of the rect. The overlay leaves a small gap at each end for
  87  |  *  the arrowhead and the chip's own border, so an endpoint that lands exactly
  88  |  *  on the edge is correct and one that lands 200px away is not. */
  89  | function near(p: { x: number; y: number }, r: Rect, pad = 28): boolean {
  90  |   return (
  91  |     p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad
  92  |   )
  93  | }
  94  | 
  95  | function overlap(a: Rect, b: Rect): number {
  96  |   const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  97  |   const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  98  |   return w > 0 && h > 0 ? w * h : 0
  99  | }
  100 | 
  101 | async function rectOf(loc: Locator): Promise<Rect | null> {
  102 |   const b = await loc.boundingBox()
  103 |   return b ? { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height } : null
  104 | }
  105 | 
  106 | /** Topmost + opaque, the same predicate the fullscreen stacking spec uses:
  107 |  *  a panel drawn under the map has opacity 1 and correct geometry and is
  108 |  *  still invisible. */
  109 | const PANEL_TOPMOST = (testid: string) => `(() => {
  110 |   const el = document.querySelector('[data-testid="${testid}"]')
  111 |   if (!el) return null
  112 |   let node = el, product = 1
  113 |   while (node && node !== document.documentElement) {
  114 |     product *= Number(getComputedStyle(node).opacity)
  115 |     node = node.parentElement
  116 |   }
  117 |   const r = el.getBoundingClientRect()
  118 |   const probes = [
  119 |     ['top', r.left + r.width * 0.5, r.top + 6],
  120 |     ['middle', r.left + r.width * 0.5, r.top + r.height * 0.5],
  121 |     ['bottom', r.left + r.width * 0.5, r.bottom - 6],
  122 |   ]
  123 |   const covered = []
  124 |   for (const [name, x, y] of probes) {
  125 |     const top = document.elementFromPoint(x, y)
  126 |     if (!top || !(el === top || el.contains(top))) {
  127 |       covered.push({ probe: name, hit: top ? (top.getAttribute('data-testid') || top.tagName.toLowerCase()) : 'nothing' })
  128 |     }
  129 |   }
  130 |   return { effectiveOpacity: product, covered, rect: { x: r.left, y: r.top, w: r.width, h: r.height } }
  131 | })()`
  132 | 
  133 | async function waitTopmost(page: Page, testid: string, where: string) {
  134 |   try {
  135 |     await page.waitForFunction(
  136 |       `(() => { const s = ${PANEL_TOPMOST(testid)}; return !!s && s.effectiveOpacity >= 0.999 && s.covered.length === 0 })()`,
  137 |       undefined,
  138 |       { timeout: 10_000 },
  139 |     )
  140 |   } catch {
  141 |     const state = await page.evaluate(PANEL_TOPMOST(testid))
  142 |     throw new Error(`${testid} never settled opaque and on top (${where}): ${JSON.stringify(state)}`)
  143 |   }
  144 | }
  145 | 
  146 | for (const density of DENSITIES) {
  147 |   for (const vp of VIEWPORTS) {
  148 |     test(`the IGW continues into the external lane at ${vp.name} · ${density}`, async ({
  149 |       context,
  150 |       page,
  151 |     }) => {
  152 |       test.setTimeout(150_000)
  153 |       const groups = logicalGroupSnapshot()
  154 |       const triggers = triggerBundleSnapshot(groups.snapshot)
  155 |       const egress = externalEgressSnapshot(triggers.snapshot)
  156 |       await seedAuthCookie(context)
  157 |       await routeSnapshot(page, egress.snapshot)
  158 |       await page.setViewportSize({ width: vp.width, height: vp.height })
  159 |       await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  160 |       await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  161 |       await page.getByRole("tab", { name: "Network topology" }).click()
  162 |       await page.getByTestId(`topology-estate-density-${density}`).click()
  163 | 
  164 |       // --- DEFAULT state: the lane is on the canvas without a click ---------
  165 |       const lane = page.getByTestId("topology-external-destinations-lane")
> 166 |       await expect(lane, "the external-destination lane is not drawn by default").toBeVisible()
      |                                                                                   ^ Error: the external-destination lane is not drawn by default
  167 |       const nodeCount = Number(await lane.getAttribute("data-node-count"))
  168 |       expect(nodeCount, `no destination node drawn at ${vp.name}·${density}`).toBeGreaterThan(0)
  169 |       await expect(lane).toHaveAttribute("data-gateway-id", egress.igwId)
  170 |       expect(Number(await lane.getAttribute("data-total-named"))).toBe(egress.expectedNamed)
  171 | 
  172 |       // Identity, not decoration: exactly one node carries the payload's
  173 |       // attribution and every other drawn node stays an address.
  174 |       expect(Number(await lane.getAttribute("data-attributed-count"))).toBe(1)
  175 |       const attributed = lane.locator('[data-identity="aws_service"]')
  176 |       await expect(attributed).toHaveCount(1)
  177 |       await expect(attributed).toContainText(egress.attributedService)
  178 |       const addresses = lane.locator('[data-identity="address"]')
  179 |       expect(await addresses.count()).toBeGreaterThan(0)
  180 | 
  181 |       // Two provenances, never merged into one claim.
  182 |       const provenance = page.getByTestId("topology-external-destinations-provenance")
  183 |       await expect(provenance).toContainText("observed")
  184 |       await expect(provenance).toContainText("configured routing")
  185 | 
  186 |       // --- the acceptance: a DRAWN edge, gateway chip to destination chip ---
  187 |       await expect
  188 |         .poll(
  189 |           async () => {
  190 |             const g = (await page.evaluate(CONTINUATION_GEOMETRY)) as {
  191 |               paths: Array<{ target: string }>
  192 |             }
  193 |             return g.paths.length
  194 |           },
  195 |           {
  196 |             timeout: 20_000,
  197 |             message: `no IGW → external-destination edge is drawn at ${vp.name}·${density}`,
  198 |           },
  199 |         )
  200 |         .toBeGreaterThan(0)
  201 | 
  202 |       const geo = (await page.evaluate(CONTINUATION_GEOMETRY)) as {
  203 |         hasOverlay: boolean
  204 |         hasIgw: boolean
  205 |         igwRect: Rect | null
  206 |         paths: Array<{ target: string; start: { x: number; y: number }; end: { x: number; y: number }; length: number }>
  207 |         destinations: Array<{ flowId: string; identity: string; rect: Rect }>
  208 |       }
  209 |       expect(geo.hasOverlay, "the flow overlay is drawn").toBe(true)
  210 |       expect(geo.hasIgw, "the in-map IGW chip is drawn").toBe(true)
  211 |       expect(geo.igwRect, "the IGW chip has a rect to leave from").not.toBeNull()
  212 | 
  213 |       const byId = new Map(geo.destinations.map(d => [d.flowId, d.rect]))
  214 |       const landed = geo.paths.filter(p => {
  215 |         const dst = byId.get(p.target)
  216 |         if (!dst) return false
  217 |         // Either orientation: the overlay routes right-to-left when the
  218 |         // destination sits left of the gateway at a narrow viewport.
  219 |         const forward = near(p.start, geo.igwRect!) && near(p.end, dst)
  220 |         const reverse = near(p.end, geo.igwRect!) && near(p.start, dst)
  221 |         return forward || reverse
  222 |       })
  223 |       expect(
  224 |         landed.length,
  225 |         `a gateway→destination path is drawn but neither end lands on the chips at ${vp.name}·${density}: ${JSON.stringify(
  226 |           { igw: geo.igwRect, paths: geo.paths, destinations: geo.destinations },
  227 |         )}`,
  228 |       ).toBeGreaterThan(0)
  229 |       // A zero-length or hairline path would satisfy "an edge exists" while
  230 |       // drawing nothing a reader can see.
  231 |       expect(Math.max(...landed.map(p => p.length)), "the drawn continuation is a hairline").toBeGreaterThan(8)
  232 | 
  233 |       // --- containment: past the boundary, clear of the tiers it must not hide
  234 |       const laneRect = (await rectOf(lane))!
  235 |       const boundaryRect = await rectOf(page.getByTestId("topology-vpc-boundary-column"))
  236 |       if (boundaryRect) {
  237 |         expect(
  238 |           laneRect.left,
  239 |           `the external lane is not outside the VPC boundary at ${vp.name}·${density}`,
  240 |         ).toBeGreaterThanOrEqual(boundaryRect.right - 1)
  241 |       }
  242 |       const canvas = (await rectOf(page.getByTestId("topology-region-fill-grid")))!
  243 |       expect(laneRect.right, `lane spills out of the canvas at ${vp.name}·${density}`).toBeLessThanOrEqual(
  244 |         canvas.right + 1,
  245 |       )
  246 |       const dataCells = page.locator('[data-tier="data"]')
  247 |       const cells = await dataCells.count()
  248 |       for (let i = 0; i < cells; i++) {
  249 |         const cell = await rectOf(dataCells.nth(i))
  250 |         if (!cell) continue
  251 |         expect(
  252 |           overlap(laneRect, cell),
  253 |           `the external lane overlaps data-tier cell ${i} at ${vp.name}·${density}`,
  254 |         ).toBe(0)
  255 |       }
  256 |       const rail = await rectOf(page.getByTestId("topology-edge-services-rail"))
  257 |       if (rail) {
  258 |         expect(
  259 |           overlap(laneRect, rail),
  260 |           `the external lane overlaps the services rail at ${vp.name}·${density}`,
  261 |         ).toBe(0)
  262 |       }
  263 |       // Readable, not a 6px sliver.
  264 |       expect(laneRect.right - laneRect.left, `lane too narrow to read at ${vp.name}`).toBeGreaterThanOrEqual(120)
  265 | 
  266 |       await page.screenshot({
```