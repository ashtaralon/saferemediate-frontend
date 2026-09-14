# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-semantics-fixture.spec.ts >> external egress continues past the IGW, and says the route is configured and the addresses sampled
- Location: tests/integration/topology-estate-semantics-fixture.spec.ts:38:5

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('topology-external-destinations-details').getByTestId('topology-external-destination-leg').filter({ hasText: '5 of' })
Expected: 8
Received: 7
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for getByTestId('topology-external-destinations-details').getByTestId('topology-external-destination-leg').filter({ hasText: '5 of' })
    14 × locator resolved to 7 elements
       - unexpected value "7"

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e5]: Scope
    - generic [ref=e6]:
      - img [ref=e7]
      - generic [ref=e11]: Organization
      - combobox "Organization" [ref=e12]:
        - option "cyntro-dev" [selected]
    - generic [ref=e13]:
      - img [ref=e14]
      - generic [ref=e18]: Group
      - combobox "Group" [ref=e19]:
        - option "All account groups" [selected]
    - generic [ref=e20]:
      - img [ref=e21]
      - generic [ref=e23]: Account
      - combobox "Account" [ref=e24]:
        - option "All accounts" [selected]
        - option "ashtaralon · 745783559495"
    - generic [ref=e25]:
      - img [ref=e26]
      - generic [ref=e31]: Region
      - combobox "Region" [ref=e32]:
        - option "All regions" [selected]
        - option "eu-west-1"
        - option "global"
        - option "us-east-1"
    - generic [ref=e34]: 1 account in view
  - generic [ref=e35]:
    - banner [ref=e36]:
      - generic [ref=e37]:
        - generic [ref=e38]:
          - generic [ref=e39]: Estate · Topology v0.2 · alon-prod
          - generic [ref=e40]: SafeRemediate-Test-Frontend-1 is LATENT_EXPOSURE — inbound path open, unused (zero public inbound in 365 days). Observed egress to 566 external destinations (365d).
          - generic [ref=e41]: scored 2026-07-09T11:36:31Z · 4 flagged · posture_correlated_at >= now() - 7d on any workload · VPC vpc-0329e985173bed24f
        - generic [ref=e42]:
          - generic [ref=e43]:
            - generic [ref=e44]: Evidence computed Jul 9, 2026, 11:36 AM
            - generic [ref=e46]: Live graph
          - button "System stats" [ref=e47]
    - generic [ref=e48]:
      - generic [ref=e49]: Region scope
      - combobox "Region scope" [ref=e50]:
        - option "eu-west-1" [selected]
        - option "global"
        - option "us-east-1"
    - generic [ref=e51]:
      - generic [ref=e52]: VPC scope
      - combobox "VPC scope" [ref=e53]:
        - option "All VPCs · Compare"
        - option "alon-prod-vpc · vpc-0329e985173bed24f (6 workloads)" [selected]
        - option "vpc-086bcc2186fa42c96 · vpc-086bcc2186fa42c96 (8 workloads)"
      - generic [ref=e54]: Subnet-linked compute in tier cells; regional/serverless on the right rail.
    - generic [ref=e55]:
      - generic [ref=e56]: Availability zones
      - button "eu-west-1a" [pressed] [ref=e57]
      - button "eu-west-1b" [pressed] [ref=e58]
    - generic [ref=e59]:
      - generic "EC2 / RDS / LoadBalancer in the selected VPC" [ref=e60]: In this VPC
      - button "EC2 (3)" [pressed] [ref=e61]
      - button "RDS (1)" [pressed] [ref=e62]
      - generic "Regional services are system-wide. Lambda inventory is system-wide too, while placement distinguishes VPC-attached functions from non-VPC-attached runtimes." [ref=e63]: System-wide
      - button "Lambda (16)" [pressed] [ref=e64]
      - button "S3 (10)" [pressed] [ref=e65]
      - button "DynamoDB (8)" [pressed] [ref=e66]
      - button "Show all" [ref=e67]
      - button "Clear all" [ref=e68]
    - generic [ref=e69]:
      - main [ref=e70]:
        - generic [ref=e71]:
          - tablist "Estate view" [ref=e72]:
            - tab "Command map" [ref=e73]
            - tab "Network topology" [selected] [ref=e74]
          - group "Map density" [ref=e75]:
            - button "Glance" [ref=e76]
            - button "Inventory" [ref=e77]
          - button "Shared neighbors" [pressed] [ref=e78]
          - button "Open map fullscreen" [ref=e79]:
            - img [ref=e80]
            - text: Map fullscreen
        - generic [ref=e87]:
          - generic [ref=e88]:
            - generic [ref=e89]:
              - generic [ref=e90]: Platform map
              - generic [ref=e91]: 1 VPC · 2 AZ · 6 subnets · 38 resources
            - generic [ref=e92]:
              - generic [ref=e93]: Map lens
              - generic [ref=e94]:
                - button "Architecture" [ref=e95]:
                  - img [ref=e96]
                  - text: Architecture
                - button "Dependencies" [pressed] [ref=e106]:
                  - img [ref=e107]
                  - text: Dependencies
                - button "Attack paths" [ref=e111]:
                  - img [ref=e112]
                  - text: Attack paths
          - generic "Dependency line colors" [ref=e114]:
            - generic [ref=e115]: Flow colors
            - generic [ref=e116]:
              - img [ref=e117]
              - generic [ref=e119]: Service call
            - generic [ref=e120]:
              - img [ref=e121]
              - generic [ref=e123]: AWS data service
            - generic [ref=e124]:
              - img [ref=e125]
              - generic [ref=e127]: VPC endpoint
            - generic [ref=e128]:
              - img [ref=e129]
              - generic [ref=e131]: Internet egress
            - generic [ref=e132]:
              - img [ref=e133]
              - generic [ref=e135]: Database
            - generic [ref=e136]:
              - img [ref=e137]
              - generic [ref=e139]: Exposure / attack
            - generic [ref=e140]: Moving = authoritative observed
            - generic [ref=e144]:
              - img [ref=e145]
              - text: Outlined motion = historical direction
            - generic [ref=e148]:
              - img [ref=e149]
              - text: Solid = configured
            - generic [ref=e150]:
              - img [ref=e151]
              - text: Dashed = inferred / unverified
          - generic [ref=e152]:
            - generic [ref=e153]: Confirmed TCP paths
            - generic [ref=e154]: Confirmed TCP segments are authoritative; a missing segment is not evidence of no traffic.
          - generic [ref=e156]:
            - generic [ref=e157]: Flow-log coverage
            - generic [ref=e158]: Partly covered
            - generic [ref=e159]: 12 of 12 eligible endpoints covered · 16 unknown · 18 not applicable · generation 7
            - button "Coverage details (2)" [ref=e160]
          - generic [ref=e161]:
            - generic [ref=e162]:
              - img [ref=e164]
              - generic [ref=e169]:
                - generic [ref=e170]: Users
                - generic [ref=e171]: Clients & operators
            - generic [ref=e173]:
              - img [ref=e175]
              - generic [ref=e180]:
                - generic [ref=e181]: Internet
                - generic [ref=e182]: Public path via IGW · alon-prod-igw
            - generic [ref=e183]:
              - generic [ref=e184]:
                - generic [ref=e185]: 9 workloads
                - generic [ref=e188]: ▸
                - generic [ref=e189]:
                  - generic "NAT nat-fixture0a1b2c3d4" [ref=e190]:
                    - text: NAT
                    - generic [ref=e191]: nat-fixture0a1b2c3d4
                  - generic [ref=e194]: ▸
                - generic [ref=e195]:
                  - generic "IGW igw-03bb3f19b706abbc4" [ref=e196]:
                    - text: IGW
                    - generic [ref=e197]: igw-03bb3f19b706abbc4
                  - generic [ref=e200]: ▸
              - button "External destinations 9 workloads · up to 2579 distinct · addresses sampled" [expanded] [ref=e201]:
                - img [ref=e203]
                - generic [ref=e208]:
                  - generic [ref=e209]: External destinations
                  - generic [ref=e210]: 9 workloads · up to 2579 distinct · addresses sampled
          - generic [ref=e211]:
            - generic [ref=e212]: ☁ AWS Cloud · acct 745783559495
            - generic [ref=e213]:
              - generic [ref=e214]: Region · eu-west-1
              - generic [ref=e215]:
                - generic [ref=e216]:
                  - generic [ref=e217]:
                    - generic "vpc-0329e985173bed24f" [ref=e218]: VPC · vpc-0329e985173bed24f
                    - generic "3 of 6 workloads in this VPC drop the shared prefix \"SafeRemediate-Test-\" from their chip label — every tooltip still carries the full name" [ref=e219]: SafeRemediate-Test-… ×3
                  - generic [ref=e222]:
                    - generic [ref=e223]:
                      - generic "eu-west-1a" [ref=e224]: Availability Zone · eu-west-1a
                      - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-1 · 10.0.1.0/24 · Owner: alon-prod" [ref=e225]':
                        - generic [ref=e226]:
                          - generic [ref=e227]: Public · SafeRemediate-Test-Public-1
                          - generic [ref=e228]: 10.0.1.0/24
                        - button "high posture score …Frontend-1" [ref=e230]:
                          - generic "high posture score" [ref=e231]
                          - generic [ref=e234]: …Frontend-1
                      - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-1 · 10.0.10.0/24 · Owner: alon-prod" [ref=e235]':
                        - generic [ref=e236]:
                          - generic [ref=e237]: Private · SafeRemediate-Test-Private-App-1
                          - generic [ref=e238]: 10.0.10.0/24
                        - button "quiet posture score PaymentProductionAPI" [ref=e240]:
                          - generic "quiet posture score" [ref=e241]
                          - generic [ref=e244]: PaymentProductionAPI
                      - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-1 · 10.0.20.0/24 · Owner: alon-prod" [ref=e245]':
                        - generic [ref=e246]:
                          - generic [ref=e247]: Data · SafeRemediate-Test-Private-DB-1
                          - generic [ref=e248]: 10.0.20.0/24
                        - button "quiet posture score saferemediate-test-db" [ref=e250]:
                          - generic "quiet posture score" [ref=e251]
                          - generic [ref=e254]: saferemediate-test-db
                    - generic [ref=e255]:
                      - generic "eu-west-1b" [ref=e256]: Availability Zone · eu-west-1b
                      - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-2 · 10.0.2.0/24 · Owner: alon-prod" [ref=e257]':
                        - generic [ref=e258]:
                          - generic [ref=e259]: Public · SafeRemediate-Test-Public-2
                          - generic [ref=e260]: 10.0.2.0/24
                        - button "high posture score …Frontend-2" [ref=e262]:
                          - generic "high posture score" [ref=e263]
                          - generic [ref=e266]: …Frontend-2
                      - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-2 · 10.0.11.0/24 · Owner: alon-prod" [ref=e267]':
                        - generic [ref=e268]:
                          - generic [ref=e269]: Private · SafeRemediate-Test-Private-App-2
                          - generic [ref=e270]: 10.0.11.0/24
                        - generic [ref=e271]:
                          - button "quiet posture score …App-2" [ref=e272]:
                            - generic "quiet posture score" [ref=e273]
                            - generic [ref=e276]: …App-2
                          - button "quiet posture score VPCTrafficGenerator" [ref=e277]:
                            - generic "quiet posture score" [ref=e278]
                            - generic [ref=e281]: VPCTrafficGenerator
                      - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-2 · 10.0.21.0/24 · Owner: alon-prod" [ref=e282]':
                        - generic [ref=e283]:
                          - generic [ref=e284]: Data · SafeRemediate-Test-Private-DB-2
                          - generic [ref=e285]: 10.0.21.0/24
                        - generic [ref=e286]: No workloads
                - generic [ref=e287]:
                  - generic [ref=e288]: VPC boundary
                  - generic [ref=e289]:
                    - generic [ref=e290]: ↑ Internet
                    - generic [ref=e291]:
                      - button "IGW alon-prod-igw" [ref=e292]:
                        - img [ref=e294]
                        - generic [ref=e297]: IGW
                        - generic [ref=e298]: alon-prod-igw
                      - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e299]: "egress: 9 workloads"
                  - generic [ref=e301]:
                    - generic [ref=e302]: Endpoints (4)
                    - generic [ref=e303]:
                      - button "VPCE IF EC2 Messages" [ref=e304]:
                        - img [ref=e306]
                        - generic [ref=e310]: VPCE
                        - generic [ref=e311]: IF
                        - generic [ref=e312]: EC2 Messages
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e313]: "use: not observed"
                    - generic [ref=e314]:
                      - button "VPCE GW Amazon S3" [ref=e315]:
                        - img [ref=e317]
                        - generic [ref=e321]: VPCE
                        - generic [ref=e322]: GW
                        - generic [ref=e323]: Amazon S3
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e324]: "use: 1 workload"
                    - generic [ref=e325]:
                      - button "VPCE IF AWS Systems Manager" [ref=e326]:
                        - img [ref=e328]
                        - generic [ref=e332]: VPCE
                        - generic [ref=e333]: IF
                        - generic [ref=e334]: AWS Systems Manager
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e335]: "use: 3 workloads"
                    - generic [ref=e336]:
                      - button "VPCE IF SSM Messages" [ref=e337]:
                        - img [ref=e339]
                        - generic [ref=e343]: VPCE
                        - generic [ref=e344]: IF
                        - generic [ref=e345]: SSM Messages
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e346]: "use: 1 workload"
                - generic [ref=e347]:
                  - generic [ref=e349]: Not in this VPC
                  - generic "Application Load Balancer · alon-prod-3tier-alb Runs in vpc-086bcc2186fa42c96, not the VPC drawn here — so it gets no chip on this canvas. That VPC's subnets are tagged for \"payment-production\". Switch to All VPCs · Compare to see it in its own VPC." [ref=e351]:
                    - generic [ref=e352]: ALB · alon-prod-3tier-alb
                    - generic [ref=e353]: VPC vpc-086bcc2186…
                    - generic [ref=e354]: · payment-production
                - generic [ref=e356]:
                  - generic [ref=e357]:
                    - generic [ref=e358]:
                      - generic [ref=e359]: Lambda runtime (14)
                      - generic [ref=e360]:
                        - text: outside subnet grid · 14 attachment unverified
                        - generic "11 of 14 chips omit this shared prefix" [ref=e361]: · SafeRemediate-… ×11
                      - button "S3 traffic from 1 of 14 functions" [ref=e363]
                    - generic [ref=e365]:
                      - button "quiet posture score alon-prod-continuous-traffic" [ref=e366]:
                        - generic "quiet posture score" [ref=e367]
                        - generic [ref=e370]: alon-prod-continuous-traffic
                      - button "Lambda×13" [ref=e371]:
                        - generic [ref=e375]:
                          - text: Lambda
                          - generic [ref=e376]: ×13
                  - generic [ref=e378]:
                    - generic [ref=e379]:
                      - text: Regional · S3 / DDB (18)
                      - generic "3 of 18 chips omit this shared prefix" [ref=e380]: SafeRemediate-… ×3
                    - generic [ref=e382]:
                      - button "quiet posture score alon-demo-data-bucket-745783559495" [ref=e383]:
                        - generic "quiet posture score" [ref=e384]
                        - generic [ref=e387]: alon-demo-data-bucket-745783559495
                      - button "S3×9" [ref=e388]:
                        - generic [ref=e392]:
                          - text: S3
                          - generic [ref=e393]: ×9
                      - button "DynamoDB×8" [ref=e394]:
                        - generic [ref=e398]:
                          - text: DynamoDB
                          - generic [ref=e399]: ×8
          - generic [ref=e400]:
            - button "Diagnostics 14 serverless · 27 flows ▴" [ref=e401]:
              - generic [ref=e402]: Diagnostics
              - generic [ref=e403]: 14 serverless · 27 flows ▴
            - generic [ref=e404]:
              - generic [ref=e405]:
                - generic [ref=e406]: Serverless compute (14)
                - generic [ref=e407]:
                  - button "AlonIAMTest-traffic-generator Lambda · arn:aws:lambda:eu-west-1 24" [ref=e408]:
                    - generic [ref=e410]:
                      - generic [ref=e412]: AlonIAMTest-traffic-generator
                      - generic [ref=e413]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e414]: "24"
                  - button "PaymentTrafficGenerator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e415]:
                    - generic [ref=e417]:
                      - generic [ref=e419]: PaymentTrafficGenerator
                      - generic [ref=e420]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e421]: "18"
                  - button "SafeRemediate-BehaviorAnalyzer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e422]:
                    - generic [ref=e424]:
                      - generic [ref=e426]: SafeRemediate-BehaviorAnalyzer
                      - generic [ref=e427]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e428]: "18"
                  - button "SafeRemediate-ConfidenceScorer Lambda · arn:aws:lambda:eu-west-1 18" [ref=e429]:
                    - generic [ref=e431]:
                      - generic [ref=e433]: SafeRemediate-ConfidenceScorer
                      - generic [ref=e434]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e435]: "18"
                  - button "SafeRemediate-CreateCheckpoint Lambda · arn:aws:lambda:eu-west-1 18" [ref=e436]:
                    - generic [ref=e438]:
                      - generic [ref=e440]: SafeRemediate-CreateCheckpoint
                      - generic [ref=e441]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e442]: "18"
                  - button "SafeRemediate-PrismaWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e443]:
                    - generic [ref=e445]:
                      - generic [ref=e447]: SafeRemediate-PrismaWebhook
                      - generic [ref=e448]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e449]: "18"
                  - button "SafeRemediate-RemediationExecutor Lambda · arn:aws:lambda:eu-west-1 18" [ref=e450]:
                    - generic [ref=e452]:
                      - generic [ref=e454]: SafeRemediate-RemediationExecutor
                      - generic [ref=e455]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e456]: "18"
                  - button "SafeRemediate-RollbackExecutor Lambda · arn:aws:lambda:eu-west-1 18" [ref=e457]:
                    - generic [ref=e459]:
                      - generic [ref=e461]: SafeRemediate-RollbackExecutor
                      - generic [ref=e462]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e463]: "18"
                  - button "SafeRemediate-RollbackMonitor Lambda · arn:aws:lambda:eu-west-1 18" [ref=e464]:
                    - generic [ref=e466]:
                      - generic [ref=e468]: SafeRemediate-RollbackMonitor
                      - generic [ref=e469]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e470]: "18"
                  - button "SafeRemediate-ServiceAwareSimulator Lambda · arn:aws:lambda:eu-west-1 18" [ref=e471]:
                    - generic [ref=e473]:
                      - generic [ref=e475]: SafeRemediate-ServiceAwareSimulator
                      - generic [ref=e476]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e477]: "18"
                  - button "SafeRemediate-ServiceCatalogBuilder Lambda · arn:aws:lambda:eu-west-1 18" [ref=e478]:
                    - generic [ref=e480]:
                      - generic [ref=e482]: SafeRemediate-ServiceCatalogBuilder
                      - generic [ref=e483]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e484]: "18"
                  - button "SafeRemediate-SimulationEngine Lambda · arn:aws:lambda:eu-west-1 18" [ref=e485]:
                    - generic [ref=e487]:
                      - generic [ref=e489]: SafeRemediate-SimulationEngine
                      - generic [ref=e490]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e491]: "18"
                  - button "SafeRemediate-WizWebhook Lambda · arn:aws:lambda:eu-west-1 18" [ref=e492]:
                    - generic [ref=e494]:
                      - generic [ref=e496]: SafeRemediate-WizWebhook
                      - generic [ref=e497]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e498]: "18"
                  - button "alon-prod-continuous-traffic Lambda · arn:aws:lambda:eu-west-1 17" [ref=e499]:
                    - generic [ref=e501]:
                      - generic [ref=e503]: alon-prod-continuous-traffic
                      - generic [ref=e504]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e505]: "17"
              - generic [ref=e506]:
                - generic [ref=e507]:
                  - generic [ref=e508]: Observed traffic — animated arrows above
                  - generic [ref=e509]: 27 flows · 8 internal · 2 edge-service · 4 vpce · 4 database · 9 egress
                - generic [ref=e510]: Listing 11 of 27 — the current lens and selection hide the rest. The counts above are the full evidence.
                - generic [ref=e511]:
                  - generic [ref=e512]:
                    - generic [ref=e513]: alon-prod-continuous-traffic
                    - generic [ref=e514]: →
                    - generic [ref=e515]: alon-demo-data-bucket-745783559495
                    - generic [ref=e516]: ACTUAL_S3_ACCESS
                  - generic [ref=e517]:
                    - generic [ref=e518]: SafeRemediate-Test-App-2
                    - generic [ref=e519]: →
                    - generic [ref=e520]: vpce-0f983779fff3bbae7
                    - generic [ref=e521]: VPCE
                  - generic [ref=e522]:
                    - generic [ref=e523]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e524]: →
                    - generic [ref=e525]: vpce-0f983779fff3bbae7
                    - generic [ref=e526]: VPCE
                  - generic [ref=e527]:
                    - generic [ref=e528]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e529]: →
                    - generic [ref=e530]: vpce-04ffe43eea196bf89
                    - generic [ref=e531]: VPCE
                  - generic [ref=e532]:
                    - generic [ref=e533]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e534]: →
                    - generic [ref=e535]: vpce-0f983779fff3bbae7
                    - generic [ref=e536]: VPCE
                  - generic [ref=e537]:
                    - generic [ref=e538]: SafeRemediate-Test-App-2
                    - generic [ref=e539]: →
                    - generic [ref=e540]: Internet (via IGW)
                    - generic [ref=e541]: egress · 3 (ext 3)
                  - generic [ref=e542]:
                    - generic [ref=e543]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e544]: →
                    - generic [ref=e545]: Internet (via IGW)
                    - generic [ref=e546]: egress · 532 (ext 532 · S3 2)
                  - generic [ref=e547]:
                    - generic [ref=e548]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e549]: →
                    - generic [ref=e550]: Internet (via IGW)
                    - generic [ref=e551]: egress · 588 (ext 588)
                  - generic [ref=e552]:
                    - generic [ref=e553]: SafeRemediate-Test-Frontend-1
                    - generic [ref=e554]: →
                    - generic [ref=e555]: saferemediate-test-db
                    - generic [ref=e556]: RDS · 5432
                  - generic [ref=e557]:
                    - generic [ref=e558]: SafeRemediate-Test-Frontend-2
                    - generic [ref=e559]: →
                    - generic [ref=e560]: saferemediate-test-db
                    - generic [ref=e561]: RDS · 3306
                  - generic [ref=e562]:
                    - generic [ref=e563]: SafeRemediate-Test-App-2
                    - generic [ref=e564]: →
                    - generic [ref=e565]: saferemediate-test-db
                    - generic [ref=e566]: RDS
              - generic [ref=e567]:
                - generic [ref=e568]: Encoding
                - generic [ref=e569]:
                  - generic [ref=e572]: Worst (carmine halo + pulse)
                  - generic [ref=e575]: High / elevated (ring only)
                  - generic [ref=e576]:
                    - generic [ref=e577]: ♛
                    - generic [ref=e578]: Crown-jewel halo
                  - generic [ref=e581]: Clean · remediated (teal ring)
                  - generic [ref=e584]: Stale (dimmed)
                  - generic [ref=e587]: Coverage gap (not collected)
          - img:
            - generic:
              - generic:
                - generic: VPCE · 4 flows
            - generic:
              - generic:
                - generic: Egress · 3 flows
            - generic:
              - generic:
                - generic: RDS · 5432
            - generic:
              - generic:
                - generic: RDS · 3306
            - generic:
              - generic:
                - generic: RDS
            - generic:
              - generic:
                - generic: S3 access
              - generic:
                - generic: API
      - complementary [ref=e588]:
        - complementary [ref=e589]:
          - generic [ref=e590]:
            - generic [ref=e591]:
              - heading "Service index" [level=2] [ref=e592]
              - generic [ref=e593]: "38"
            - generic [ref=e594]:
              - img [ref=e595]
              - searchbox "Find service in topology" [ref=e598]
            - button "Filters" [ref=e601]:
              - img [ref=e602]
              - text: Filters
          - list [ref=e604]:
            - listitem [ref=e605]:
              - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 0 in · 4 out Jul 9, 11:04 AM" [ref=e606]:
                - generic [ref=e607]:
                  - img [ref=e609]
                  - generic [ref=e611]:
                    - generic [ref=e612]:
                      - generic [ref=e613]: SafeRemediate-Test-Frontend-1
                      - generic "Current graph data" [ref=e614]
                    - generic [ref=e616]: EC2 · eu-west-1a · web
                    - generic [ref=e617]:
                      - generic [ref=e618]: 0 in · 4 out
                      - generic [ref=e619]:
                        - img [ref=e620]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e623]:
              - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 0 in · 3 out Jul 9, 10:40 AM" [ref=e624]:
                - generic [ref=e625]:
                  - img [ref=e627]
                  - generic [ref=e629]:
                    - generic [ref=e630]:
                      - generic [ref=e631]: SafeRemediate-Test-App-2
                      - generic "Current graph data" [ref=e632]
                    - generic [ref=e634]: EC2 · eu-west-1b · app
                    - generic [ref=e635]:
                      - generic [ref=e636]: 0 in · 3 out
                      - generic [ref=e637]:
                        - img [ref=e638]
                        - text: Jul 9, 10:40 AM
            - listitem [ref=e641]:
              - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 3 in · 0 out Jul 6, 03:05 PM" [ref=e642]:
                - generic [ref=e643]:
                  - img [ref=e645]
                  - generic [ref=e647]:
                    - generic [ref=e648]:
                      - generic [ref=e649]: saferemediate-test-db
                      - generic "Current graph data" [ref=e650]
                    - generic [ref=e652]: RDS · eu-west-1a · data
                    - generic [ref=e653]:
                      - generic [ref=e654]: 3 in · 0 out
                      - generic [ref=e655]:
                        - img [ref=e656]
                        - text: Jul 6, 03:05 PM
            - listitem [ref=e659]:
              - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 0 in · 3 out Jul 9, 11:04 AM" [ref=e660]:
                - generic [ref=e661]:
                  - img [ref=e663]
                  - generic [ref=e665]:
                    - generic [ref=e666]:
                      - generic [ref=e667]: SafeRemediate-Test-Frontend-2
                      - generic "Current graph data" [ref=e668]
                    - generic [ref=e670]: EC2 · eu-west-1b · web
                    - generic [ref=e671]:
                      - generic [ref=e672]: 0 in · 3 out
                      - generic [ref=e673]:
                        - img [ref=e674]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e677]:
              - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 1 in · 0 out Jun 25, 08:58 AM" [ref=e678]:
                - generic [ref=e679]:
                  - img [ref=e681]
                  - generic [ref=e683]:
                    - generic [ref=e684]:
                      - generic [ref=e685]: alon-demo-data-bucket-745783559495
                      - generic "Current graph data" [ref=e686]
                    - generic [ref=e688]: S3 · eu-west-1 · regional
                    - generic [ref=e689]:
                      - generic [ref=e690]: 1 in · 0 out
                      - generic [ref=e691]:
                        - img [ref=e692]
                        - text: Jun 25, 08:58 AM
            - listitem [ref=e695]:
              - button "alon-prod-continuous-traffic Current graph data Lambda · eu-west-1 · regional 0 in · 1 out Jun 25, 08:58 AM" [ref=e696]:
                - generic [ref=e697]:
                  - img [ref=e699]
                  - generic [ref=e701]:
                    - generic [ref=e702]:
                      - generic [ref=e703]: alon-prod-continuous-traffic
                      - generic "Current graph data" [ref=e704]
                    - generic [ref=e706]: Lambda · eu-west-1 · regional
                    - generic [ref=e707]:
                      - generic [ref=e708]: 0 in · 1 out
                      - generic [ref=e709]:
                        - img [ref=e710]
                        - text: Jun 25, 08:58 AM
            - listitem [ref=e713]:
              - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e714]:
                - generic [ref=e715]:
                  - img [ref=e717]
                  - generic [ref=e720]:
                    - generic [ref=e721]:
                      - generic [ref=e722]: AlonIAMTest-traffic-generator
                      - generic "Current graph data" [ref=e723]
                    - generic [ref=e725]: Lambda · eu-west-1 · regional
                    - generic [ref=e726]:
                      - generic [ref=e727]: 0 in · 0 out
                      - generic [ref=e728]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e731]:
              - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e732]:
                - generic [ref=e733]:
                  - img [ref=e735]
                  - generic [ref=e738]:
                    - generic [ref=e739]:
                      - generic [ref=e740]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                      - generic "Current graph data" [ref=e741]
                    - generic [ref=e743]: S3 · eu-west-1 · regional
                    - generic [ref=e744]:
                      - generic [ref=e745]: 0 in · 0 out
                      - generic [ref=e746]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e749]:
              - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e750]:
                - generic [ref=e751]:
                  - img [ref=e753]
                  - generic [ref=e756]:
                    - generic [ref=e757]:
                      - generic [ref=e758]: cyntro-demo-analytics-745783559495
                      - generic "Current graph data" [ref=e759]
                    - generic [ref=e761]: S3 · eu-west-1 · regional
                    - generic [ref=e762]:
                      - generic [ref=e763]: 0 in · 0 out
                      - generic [ref=e764]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e767]:
              - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e768]:
                - generic [ref=e769]:
                  - img [ref=e771]
                  - generic [ref=e774]:
                    - generic [ref=e775]:
                      - generic [ref=e776]: cyntro-demo-eu
                      - generic "Current graph data" [ref=e777]
                    - generic [ref=e779]: S3 · eu-west-1 · regional
                    - generic [ref=e780]:
                      - generic [ref=e781]: 0 in · 0 out
                      - generic [ref=e782]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e785]:
              - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e786]:
                - generic [ref=e787]:
                  - img [ref=e789]
                  - generic [ref=e792]:
                    - generic [ref=e793]:
                      - generic [ref=e794]: cyntro-demo-prod-data-745783559495
                      - generic "Current graph data" [ref=e795]
                    - generic [ref=e797]: S3 · eu-west-1 · regional
                    - generic [ref=e798]:
                      - generic [ref=e799]: 0 in · 0 out
                      - generic [ref=e800]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e803]:
              - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e804]:
                - generic [ref=e805]:
                  - img [ref=e807]
                  - generic [ref=e810]:
                    - generic [ref=e811]:
                      - generic [ref=e812]: cyntronewtestbucket
                      - generic "Current graph data" [ref=e813]
                    - generic [ref=e815]: S3 · eu-west-1 · regional
                    - generic [ref=e816]:
                      - generic [ref=e817]: 0 in · 0 out
                      - generic [ref=e818]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e821]:
              - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e822]:
                - generic [ref=e823]:
                  - img [ref=e825]
                  - generic [ref=e828]:
                    - generic [ref=e829]:
                      - generic [ref=e830]: cyntrotest2
                      - generic "Current graph data" [ref=e831]
                    - generic [ref=e833]: S3 · eu-west-1 · regional
                    - generic [ref=e834]:
                      - generic [ref=e835]: 0 in · 0 out
                      - generic [ref=e836]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e839]:
              - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e840]:
                - generic [ref=e841]:
                  - img [ref=e843]
                  - generic [ref=e846]:
                    - generic [ref=e847]:
                      - generic [ref=e848]: impaciq-findings
                      - generic "Current graph data" [ref=e849]
                    - generic [ref=e851]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e852]:
                      - generic [ref=e853]: 0 in · 0 out
                      - generic [ref=e854]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e857]:
              - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e858]:
                - generic [ref=e859]:
                  - img [ref=e861]
                  - generic [ref=e864]:
                    - generic [ref=e865]:
                      - generic [ref=e866]: impaciq-remediation-history
                      - generic "Current graph data" [ref=e867]
                    - generic [ref=e869]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e870]:
                      - generic [ref=e871]: 0 in · 0 out
                      - generic [ref=e872]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e875]:
              - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e876]:
                - generic [ref=e877]:
                  - img [ref=e879]
                  - generic [ref=e882]:
                    - generic [ref=e883]:
                      - generic [ref=e884]: impaciq-scan-status
                      - generic "Current graph data" [ref=e885]
                    - generic [ref=e887]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e888]:
                      - generic [ref=e889]: 0 in · 0 out
                      - generic [ref=e890]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e893]:
              - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e894]:
                - generic [ref=e895]:
                  - img [ref=e897]
                  - generic [ref=e900]:
                    - generic [ref=e901]:
                      - generic [ref=e902]: least_privilege_role_state
                      - generic "Current graph data" [ref=e903]
                    - generic [ref=e905]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e906]:
                      - generic [ref=e907]: 0 in · 0 out
                      - generic [ref=e908]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e911]:
              - button "PaymentProductionAPI Current graph data Lambda · eu-west-1a · app 0 in · 0 out No runtime timestamp" [ref=e912]:
                - generic [ref=e913]:
                  - img [ref=e915]
                  - generic [ref=e918]:
                    - generic [ref=e919]:
                      - generic [ref=e920]: PaymentProductionAPI
                      - generic "Current graph data" [ref=e921]
                    - generic [ref=e923]: Lambda · eu-west-1a · app
                    - generic [ref=e924]:
                      - generic [ref=e925]: 0 in · 0 out
                      - generic [ref=e926]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e929]:
              - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e930]:
                - generic [ref=e931]:
                  - img [ref=e933]
                  - generic [ref=e936]:
                    - generic [ref=e937]:
                      - generic [ref=e938]: PaymentTrafficGenerator
                      - generic "Current graph data" [ref=e939]
                    - generic [ref=e941]: Lambda · eu-west-1 · regional
                    - generic [ref=e942]:
                      - generic [ref=e943]: 0 in · 0 out
                      - generic [ref=e944]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e947]:
              - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e948]:
                - generic [ref=e949]:
                  - img [ref=e951]
                  - generic [ref=e954]:
                    - generic [ref=e955]:
                      - generic [ref=e956]: saferemediate-access-logs-745783559495
                      - generic "Current graph data" [ref=e957]
                    - generic [ref=e959]: S3 · eu-west-1 · regional
                    - generic [ref=e960]:
                      - generic [ref=e961]: 0 in · 0 out
                      - generic [ref=e962]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e965]:
              - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e966]:
                - generic [ref=e967]:
                  - img [ref=e969]
                  - generic [ref=e972]:
                    - generic [ref=e973]:
                      - generic [ref=e974]: SafeRemediate-BehaviorAnalyzer
                      - generic "Current graph data" [ref=e975]
                    - generic [ref=e977]: Lambda · eu-west-1 · regional
                    - generic [ref=e978]:
                      - generic [ref=e979]: 0 in · 0 out
                      - generic [ref=e980]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e983]:
              - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e984]:
                - generic [ref=e985]:
                  - img [ref=e987]
                  - generic [ref=e990]:
                    - generic [ref=e991]:
                      - generic [ref=e992]: SafeRemediate-ConfidenceScorer
                      - generic "Current graph data" [ref=e993]
                    - generic [ref=e995]: Lambda · eu-west-1 · regional
                    - generic [ref=e996]:
                      - generic [ref=e997]: 0 in · 0 out
                      - generic [ref=e998]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1001]:
              - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1002]:
                - generic [ref=e1003]:
                  - img [ref=e1005]
                  - generic [ref=e1008]:
                    - generic [ref=e1009]:
                      - generic [ref=e1010]: SafeRemediate-CreateCheckpoint
                      - generic "Current graph data" [ref=e1011]
                    - generic [ref=e1013]: Lambda · eu-west-1 · regional
                    - generic [ref=e1014]:
                      - generic [ref=e1015]: 0 in · 0 out
                      - generic [ref=e1016]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1019]:
              - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1020]:
                - generic [ref=e1021]:
                  - img [ref=e1023]
                  - generic [ref=e1026]:
                    - generic [ref=e1027]:
                      - generic [ref=e1028]: saferemediate-demo-cloudtrail-745783559495
                      - generic "Current graph data" [ref=e1029]
                    - generic [ref=e1031]: S3 · eu-west-1 · regional
                    - generic [ref=e1032]:
                      - generic [ref=e1033]: 0 in · 0 out
                      - generic [ref=e1034]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1037]:
              - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1038]:
                - generic [ref=e1039]:
                  - img [ref=e1041]
                  - generic [ref=e1044]:
                    - generic [ref=e1045]:
                      - generic [ref=e1046]: SafeRemediate-Executions
                      - generic "Current graph data" [ref=e1047]
                    - generic [ref=e1049]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1050]:
                      - generic [ref=e1051]: 0 in · 0 out
                      - generic [ref=e1052]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1055]:
              - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1056]:
                - generic [ref=e1057]:
                  - img [ref=e1059]
                  - generic [ref=e1062]:
                    - generic [ref=e1063]:
                      - generic [ref=e1064]: SafeRemediate-Findings
                      - generic "Current graph data" [ref=e1065]
                    - generic [ref=e1067]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1068]:
                      - generic [ref=e1069]: 0 in · 0 out
                      - generic [ref=e1070]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1073]:
              - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1074]:
                - generic [ref=e1075]:
                  - img [ref=e1077]
                  - generic [ref=e1080]:
                    - generic [ref=e1081]:
                      - generic [ref=e1082]: saferemediate-logs-745783559495
                      - generic "Current graph data" [ref=e1083]
                    - generic [ref=e1085]: S3 · eu-west-1 · regional
                    - generic [ref=e1086]:
                      - generic [ref=e1087]: 0 in · 0 out
                      - generic [ref=e1088]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1091]:
              - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1092]:
                - generic [ref=e1093]:
                  - img [ref=e1095]
                  - generic [ref=e1098]:
                    - generic [ref=e1099]:
                      - generic [ref=e1100]: SafeRemediate-PrismaWebhook
                      - generic "Current graph data" [ref=e1101]
                    - generic [ref=e1103]: Lambda · eu-west-1 · regional
                    - generic [ref=e1104]:
                      - generic [ref=e1105]: 0 in · 0 out
                      - generic [ref=e1106]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1109]:
              - button "SafeRemediate-RemediationExecutor Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1110]:
                - generic [ref=e1111]:
                  - img [ref=e1113]
                  - generic [ref=e1116]:
                    - generic [ref=e1117]:
                      - generic [ref=e1118]: SafeRemediate-RemediationExecutor
                      - generic "Current graph data" [ref=e1119]
                    - generic [ref=e1121]: Lambda · eu-west-1 · regional
                    - generic [ref=e1122]:
                      - generic [ref=e1123]: 0 in · 0 out
                      - generic [ref=e1124]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1127]:
              - button "SafeRemediate-RollbackExecutor Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1128]:
                - generic [ref=e1129]:
                  - img [ref=e1131]
                  - generic [ref=e1134]:
                    - generic [ref=e1135]:
                      - generic [ref=e1136]: SafeRemediate-RollbackExecutor
                      - generic "Current graph data" [ref=e1137]
                    - generic [ref=e1139]: Lambda · eu-west-1 · regional
                    - generic [ref=e1140]:
                      - generic [ref=e1141]: 0 in · 0 out
                      - generic [ref=e1142]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1145]:
              - button "SafeRemediate-RollbackMonitor Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1146]:
                - generic [ref=e1147]:
                  - img [ref=e1149]
                  - generic [ref=e1152]:
                    - generic [ref=e1153]:
                      - generic [ref=e1154]: SafeRemediate-RollbackMonitor
                      - generic "Current graph data" [ref=e1155]
                    - generic [ref=e1157]: Lambda · eu-west-1 · regional
                    - generic [ref=e1158]:
                      - generic [ref=e1159]: 0 in · 0 out
                      - generic [ref=e1160]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1163]:
              - button "SafeRemediate-ServiceAwareSimulator Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1164]:
                - generic [ref=e1165]:
                  - img [ref=e1167]
                  - generic [ref=e1170]:
                    - generic [ref=e1171]:
                      - generic [ref=e1172]: SafeRemediate-ServiceAwareSimulator
                      - generic "Current graph data" [ref=e1173]
                    - generic [ref=e1175]: Lambda · eu-west-1 · regional
                    - generic [ref=e1176]:
                      - generic [ref=e1177]: 0 in · 0 out
                      - generic [ref=e1178]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1181]:
              - button "SafeRemediate-ServiceCatalogBuilder Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1182]:
                - generic [ref=e1183]:
                  - img [ref=e1185]
                  - generic [ref=e1188]:
                    - generic [ref=e1189]:
                      - generic [ref=e1190]: SafeRemediate-ServiceCatalogBuilder
                      - generic "Current graph data" [ref=e1191]
                    - generic [ref=e1193]: Lambda · eu-west-1 · regional
                    - generic [ref=e1194]:
                      - generic [ref=e1195]: 0 in · 0 out
                      - generic [ref=e1196]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1199]:
              - button "SafeRemediate-SimulationEngine Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1200]:
                - generic [ref=e1201]:
                  - img [ref=e1203]
                  - generic [ref=e1206]:
                    - generic [ref=e1207]:
                      - generic [ref=e1208]: SafeRemediate-SimulationEngine
                      - generic "Current graph data" [ref=e1209]
                    - generic [ref=e1211]: Lambda · eu-west-1 · regional
                    - generic [ref=e1212]:
                      - generic [ref=e1213]: 0 in · 0 out
                      - generic [ref=e1214]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1217]:
              - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1218]:
                - generic [ref=e1219]:
                  - img [ref=e1221]
                  - generic [ref=e1224]:
                    - generic [ref=e1225]:
                      - generic [ref=e1226]: SafeRemediate-Simulations
                      - generic "Current graph data" [ref=e1227]
                    - generic [ref=e1229]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1230]:
                      - generic [ref=e1231]: 0 in · 0 out
                      - generic [ref=e1232]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1235]:
              - button "SafeRemediate-WizWebhook Current graph data Lambda · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1236]:
                - generic [ref=e1237]:
                  - img [ref=e1239]
                  - generic [ref=e1242]:
                    - generic [ref=e1243]:
                      - generic [ref=e1244]: SafeRemediate-WizWebhook
                      - generic "Current graph data" [ref=e1245]
                    - generic [ref=e1247]: Lambda · eu-west-1 · regional
                    - generic [ref=e1248]:
                      - generic [ref=e1249]: 0 in · 0 out
                      - generic [ref=e1250]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1253]:
              - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1254]:
                - generic [ref=e1255]:
                  - img [ref=e1257]
                  - generic [ref=e1260]:
                    - generic [ref=e1261]:
                      - generic [ref=e1262]: sg_state
                      - generic "Current graph data" [ref=e1263]
                    - generic [ref=e1265]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1266]:
                      - generic [ref=e1267]: 0 in · 0 out
                      - generic [ref=e1268]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1271]:
              - button "VPCTrafficGenerator Current graph data Lambda · eu-west-1b · app 0 in · 0 out No runtime timestamp" [ref=e1272]:
                - generic [ref=e1273]:
                  - img [ref=e1275]
                  - generic [ref=e1278]:
                    - generic [ref=e1279]:
                      - generic [ref=e1280]: VPCTrafficGenerator
                      - generic "Current graph data" [ref=e1281]
                    - generic [ref=e1283]: Lambda · eu-west-1b · app
                    - generic [ref=e1284]:
                      - generic [ref=e1285]: 0 in · 0 out
                      - generic [ref=e1286]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1289]:
      - text: Live read from
      - generic [ref=e1290]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1291]
  - dialog [active] [ref=e1293]:
    - paragraph [ref=e1294]: 9 workloads leaving the VPC
    - paragraph [ref=e1295]: "Route is configured (route tables): NAT nat-fixture0a1b2c3d4 → IGW igw-03bb3f19b706abbc4. Counts are observed. The payload names no destination identities, so these addresses are evidence, not an inventory of services."
    - list [ref=e1296]:
      - listitem [ref=e1297]:
        - text: i-0e9b891793b5b2dbd · 3 distinct · all 3 shown
        - generic [ref=e1298]: — 54.217.69.183, 54.217.245.46, 3.253.225.145
      - listitem [ref=e1299]:
        - text: i-0f51b8b7ad29a359b · 532 distinct · 6 of 532 shown
        - generic [ref=e1300]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254, 52.218.0.200
      - listitem [ref=e1301]:
        - text: i-03c72e120ff96216c · 588 distinct · 5 of 588 shown
        - generic [ref=e1302]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1303]:
        - text: i-0aa725bf8ff4c2001 · 927 distinct · 5 of 927 shown
        - generic [ref=e1304]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1305]:
        - text: i-0d4186a6b477dcd55 · 20 distinct · 5 of 20 shown
        - generic [ref=e1306]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1307]:
        - text: i-009a28b5cab755850 · 20 distinct · 5 of 20 shown
        - generic [ref=e1308]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1309]:
        - text: i-0e4edb2adb28e4f16 · 23 distinct · 5 of 23 shown
        - generic [ref=e1310]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1311]:
        - text: i-02a0da7f8373e6c8f · 32 distinct · 5 of 32 shown
        - generic [ref=e1312]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1313]:
        - text: i-0ee29afa0048943e0 · 434 distinct · 5 of 434 shown
        - generic [ref=e1314]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test"
  2   | import { seedAuthCookie } from "./live-auth"
  3   | import {
  4   |   ESTATE_URL,
  5   |   SNAPSHOT,
  6   |   externalEgressSnapshot,
  7   |   noEgressSnapshot,
  8   |   routeSnapshot,
  9   |   triggerBundleSnapshot,
  10  | } from "./topology-fixture"
  11  | 
  12  | /** What the map SAYS, not where it draws it.
  13  |  *
  14  |  *  Independent production UI QA found three claims the Dependencies view made
  15  |  *  that its payload does not support: traffic stopped dead at the IGW, six
  16  |  *  EventBridge rules firing six Lambdas read as twelve relationships, and the
  17  |  *  Lambda -> S3 lane reduced six functions to a bare "x4". Each is a semantic
  18  |  *  defect with correct geometry, so each needs an assertion on the words and
  19  |  *  the counts. The negative cases matter as much: an external node drawn when
  20  |  *  nothing leaves the VPC would be the same class of error in the other
  21  |  *  direction.
  22  |  *
  23  |  *  1512x771 is the viewport the defects were reported at. */
  24  | const VIEWPORT = { width: 1512, height: 771 }
  25  | 
  26  | async function openMap(context: import("@playwright/test").BrowserContext, page: import("@playwright/test").Page, snapshot: typeof SNAPSHOT) {
  27  |   await seedAuthCookie(context)
  28  |   await routeSnapshot(page, snapshot)
  29  |   await page.setViewportSize(VIEWPORT)
  30  |   await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  31  |   await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  32  |   await page.getByRole("tab", { name: "Network topology" }).click()
  33  | }
  34  | 
  35  | // ---------------------------------------------------------------------------
  36  | // F3 — the traffic that leaves does not stop at the IGW.
  37  | // ---------------------------------------------------------------------------
  38  | test("external egress continues past the IGW, and says the route is configured and the addresses sampled", async ({
  39  |   context,
  40  |   page,
  41  | }) => {
  42  |   test.setTimeout(120_000)
  43  |   const egress = externalEgressSnapshot()
  44  |   expect(egress.legCount, "the captured payload has egress legs to continue").toBeGreaterThan(0)
  45  |   expect(egress.completeLegs, "one leg's sample covers its whole count").toBe(1)
  46  |   await openMap(context, page, egress.snapshot)
  47  | 
  48  |   const node = page.getByTestId("topology-external-destinations").first()
  49  |   await expect(node).toBeVisible()
  50  |   await expect(node).toHaveAttribute("data-leg-count", String(egress.legCount))
  51  |   await expect(node).toHaveAttribute("data-max-distinct-upper-bound", String(egress.expectedUpperBound))
  52  |   await expect(node).toHaveAttribute("data-unknown-distinct-legs", "0")
  53  |   // Not every sample is complete, so the node may not claim an inventory.
  54  |   await expect(node).toHaveAttribute("data-sample-complete", "false")
  55  |   const summary = node.getByTestId("topology-external-destinations-summary")
  56  |   await expect(summary).toContainText(`up to ${egress.expectedUpperBound} distinct`)
  57  |   await expect(summary).toContainText("addresses sampled")
  58  |   await expect(summary).not.toContainText("addresses complete")
  59  |   await expect(summary).not.toContainText("up to 0 distinct")
  60  | 
  61  |   await node.getByTestId("topology-external-destinations-toggle").click()
  62  |   const details = page.getByTestId("topology-external-destinations-details")
  63  |   await expect(details).toBeVisible()
  64  |   // The hops, in path order, and the honesty about what kind of claim each is.
  65  |   await expect(details).toContainText(egress.hopCaption)
  66  |   await expect(details).toContainText("Route is configured (route tables)")
  67  |   await expect(details).toContainText("Counts are observed")
  68  |   await expect(details).toContainText("names no destination identities")
  69  |   // Never an AWS service identity: the payload's destinations[] is empty.
  70  |   await expect(details).not.toContainText("Amazon S3")
  71  |   await expect(details).not.toContainText("AWS service")
  72  | 
  73  |   const legs = details.getByTestId("topology-external-destination-leg")
  74  |   await expect(legs).toHaveCount(egress.legCount)
  75  |   await expect(legs.filter({ hasText: "all 3 shown" })).toHaveCount(egress.completeLegs)
> 76  |   await expect(legs.filter({ hasText: "5 of" })).toHaveCount(egress.legCount - egress.completeLegs)
      |                                                  ^ Error: expect(locator).toHaveCount(expected) failed
  77  | })
  78  | 
  79  | // ---------------------------------------------------------------------------
  80  | // The chain, not another Internet block. Independent review, 2026-09-14: the
  81  | // node followed the static Internet chip on the same neutral dashed rule that
  82  | // joins Users to Internet, so it read as `Users -> Internet -> another
  83  | // Internet` rather than as the continuation of the workloads' egress.
  84  | // ---------------------------------------------------------------------------
  85  | test("the egress chain names the map's own gateway, so the continuation is the IGW the map draws", async ({
  86  |   context,
  87  |   page,
  88  | }) => {
  89  |   test.setTimeout(120_000)
  90  |   const egress = externalEgressSnapshot()
  91  |   await openMap(context, page, egress.snapshot)
  92  | 
  93  |   const chain = page.getByTestId("topology-external-egress-chain").first()
  94  |   await expect(chain).toBeVisible()
  95  |   await expect(chain).toHaveAttribute("data-workloads", String(egress.legCount))
  96  |   await expect(chain).toHaveAttribute("data-nat-ids", egress.natId)
  97  |   await expect(chain).toHaveAttribute("data-igw-ids", egress.igwId)
  98  |   // It reads as a path, source first: N workloads, then each gateway.
  99  |   await expect(chain.getByTestId("topology-egress-chain-source")).toHaveText(
  100 |     `${egress.legCount} workloads`,
  101 |   )
  102 |   const hops = chain.getByTestId("topology-egress-hop")
  103 |   await expect(hops).toHaveCount(2)
  104 |   await expect(hops.nth(0)).toHaveAttribute("data-hop-kind", "nat")
  105 |   await expect(hops.nth(1)).toHaveAttribute("data-hop-kind", "igw")
  106 | 
  107 |   // THE connection: the gateway the chain names is the gateway chip the map
  108 |   // draws on the VPC boundary, not some other account's.
  109 |   const mapIgws = page.locator('[data-testid="topology-igw-rail-chip"]')
  110 |   const drawnIgwIds = await mapIgws.evaluateAll(els =>
  111 |     els.map(el => el.getAttribute("data-igw-id") ?? ""),
  112 |   )
  113 |   expect(drawnIgwIds.length, "the fixture draws an IGW chip to connect to").toBeGreaterThan(0)
  114 |   expect(drawnIgwIds, "the chain's gateway is one the map actually draws").toContain(egress.igwId)
  115 |   await expect(hops.nth(1)).toHaveAttribute("data-hop-id", egress.igwId)
  116 | 
  117 |   // And it is laid out as a continuation: the chain runs from the Internet
  118 |   // block into the External node, left to right, on one baseline.
  119 |   const geom = await page.evaluate(() => {
  120 |     const box = (sel: string) => {
  121 |       const el = document.querySelector(sel)
  122 |       if (!el) return null
  123 |       const r = el.getBoundingClientRect()
  124 |       return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
  125 |     }
  126 |     return {
  127 |       internet: box('[data-testid="topology-internet-node"]'),
  128 |       chain: box('[data-testid="topology-external-egress-chain"]'),
  129 |       node: box('[data-testid="topology-external-destinations"]'),
  130 |     }
  131 |   })
  132 |   expect(geom.internet, "the Internet block is drawn").not.toBeNull()
  133 |   expect(geom.chain, "the chain is drawn").not.toBeNull()
  134 |   // The chain is the segment BETWEEN the Internet block and the globe, not a
  135 |   // second terminal beside them: it starts after the Internet block (or on a
  136 |   // wrapped row below it at the narrowest widths) and ends inside the node.
  137 |   const afterInternet =
  138 |     geom.chain!.x >= geom.internet!.right - 1 || geom.chain!.y >= geom.internet!.bottom - 1
  139 |   expect(afterInternet, "the chain does not follow the Internet block").toBe(true)
  140 |   expect(geom.chain!.right).toBeLessThanOrEqual(geom.node!.right + 1)
  141 | })
  142 | 
  143 | test("an older generation that recorded no addresses says so rather than promising a sample", async ({
  144 |   context,
  145 |   page,
  146 | }) => {
  147 |   test.setTimeout(120_000)
  148 |   // The captured payload itself: distinct COUNTS on every egress leg, no
  149 |   // egress_breakdown and no sample_hosts at all.
  150 |   await openMap(context, page, SNAPSHOT)
  151 |   const node = page.getByTestId("topology-external-destinations").first()
  152 |   await expect(node).toBeVisible()
  153 |   const summary = node.getByTestId("topology-external-destinations-summary")
  154 |   await expect(summary).toContainText("no addresses recorded")
  155 |   await expect(summary).not.toContainText("addresses sampled")
  156 |   await node.getByTestId("topology-external-destinations-toggle").click()
  157 |   await expect(page.getByTestId("topology-external-destinations-details")).toContainText(
  158 |     "recorded no addresses at all",
  159 |   )
  160 | })
  161 | 
  162 | test("no external destinations node when nothing leaves the VPC", async ({ context, page }) => {
  163 |   test.setTimeout(120_000)
  164 |   const none = noEgressSnapshot()
  165 |   // Guard against passing because the map failed to draw: the payload still
  166 |   // holds its other edges, and the map still renders its cells.
  167 |   expect(none.remainingEdges, "the payload still has non-egress edges").toBeGreaterThan(0)
  168 |   await openMap(context, page, none.snapshot)
  169 |   await expect(page.locator('[data-tier="data"]').first()).toBeVisible()
  170 |   await expect(page.getByTestId("topology-external-destinations")).toHaveCount(0)
  171 |   await expect(page.getByTestId("topology-external-egress-chain")).toHaveCount(0)
  172 | })
  173 | 
  174 | test("a configured route to the gateway is not drawn as observed egress", async ({ context, page }) => {
  175 |   test.setTimeout(120_000)
  176 |   // A route table entry points at the internet gateway too. Admitted, the node
```