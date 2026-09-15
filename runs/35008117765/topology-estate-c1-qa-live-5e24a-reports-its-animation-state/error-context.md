# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — Step 5 acceptance matrix >> reduced motion: the map still renders and reports its animation state
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:1782:7

# Error details

```
Error: reduced motion left 6 flow packets animating (baseline drew 6, of which 6 animated)

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 6
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
        - option "Cyntro Testbed Webshop" [selected]
    - generic [ref=e13]:
      - img [ref=e14]
      - generic [ref=e18]: Group
      - combobox "Group" [ref=e19]:
        - option "All account groups" [selected]
    - generic [ref=e20]:
      - img [ref=e21]
      - generic [ref=e23]: Account
      - combobox "Account" [ref=e24]:
        - option "All accounts"
        - option "Testbed Webshop · 416651950952" [selected]
    - generic [ref=e25]:
      - img [ref=e26]
      - generic [ref=e31]: Region
      - combobox "Region" [ref=e32]:
        - option "All regions"
        - option "eu-west-1" [selected]
    - generic [ref=e34]: 1 account in view
  - generic [ref=e35]:
    - banner [ref=e36]:
      - generic [ref=e37]:
        - generic [ref=e38]:
          - generic [ref=e39]: Estate · Topology v0.2 · testbed-webshop
          - generic [ref=e40]: cyntro-tb-prod-loadgen-role has 15/25 unused permissions (60% gap) — attached to cyntro-tb-prod-loadgen
          - generic [ref=e41]: scored 2026-09-14T10:02:14Z · 0 flagged · posture_correlated_at >= now() - 7d on any workload · VPC vpc-0c39cde96f29f8f4e · cached locally
          - generic [ref=e42]: Refresh request submitted; worker status not confirmed. · Last updated Sep 14, 2026, 10:01 AM
        - generic [ref=e43]:
          - generic [ref=e44]:
            - generic [ref=e45]: Evidence computed Sep 14, 2026, 10:02 AM
            - generic [ref=e47]: Snapshot 33h old
          - button "System stats" [ref=e48]
    - generic [ref=e49]:
      - generic [ref=e50]: VPC scope
      - combobox "VPC scope" [ref=e51]:
        - option "All VPCs · Compare"
        - option "cyntro-tb-prod-vpc · vpc-0c39cde96f29f8f4e (7 workloads)" [selected]
      - generic [ref=e52]: Subnet-linked compute in tier cells; regional/serverless on the right rail.
    - generic [ref=e53]:
      - generic [ref=e54]: Availability zones
      - button "eu-west-1a" [pressed] [ref=e55]
      - button "eu-west-1b" [pressed] [ref=e56]
    - generic [ref=e57]:
      - generic "EC2 / RDS / LoadBalancer in the selected VPC" [ref=e58]: In this VPC
      - button "EC2 (5)" [pressed] [ref=e59]
      - button "RDS (3)" [pressed] [ref=e60]
      - button "LoadBalancer (2)" [pressed] [ref=e61]
      - button "TargetGroup (2)" [pressed] [ref=e62]
      - button "Neptune (2)" [pressed] [ref=e63]
      - button "AutoScalingGroup (2)" [pressed] [ref=e64]
      - generic "Regional services are system-wide. Lambda inventory is system-wide too, while placement distinguishes VPC-attached functions from non-VPC-attached runtimes." [ref=e65]: System-wide
      - button "Lambda (6)" [pressed] [ref=e66]
      - button "EventBridge (6)" [pressed] [ref=e67]
      - button "S3 (3)" [pressed] [ref=e68]
      - button "KMSKey (3)" [pressed] [ref=e69]
      - button "DynamoDB (1)" [pressed] [ref=e70]
      - button "Show all" [ref=e71]
      - button "Clear all" [ref=e72]
    - generic [ref=e73]:
      - main [ref=e74]:
        - generic [ref=e75]:
          - tablist "Estate view" [ref=e76]:
            - tab "Command map" [ref=e77]
            - tab "Network topology" [active] [selected] [ref=e78]
          - group "Map density" [ref=e79]:
            - button "Glance" [ref=e80]
            - button "Inventory" [ref=e81]
          - button "Shared neighbors" [pressed] [ref=e82]
          - button "Open map fullscreen" [ref=e83]:
            - img [ref=e84]
            - text: Map fullscreen
        - generic [ref=e91]:
          - generic [ref=e92]:
            - generic [ref=e93]:
              - generic [ref=e94]: Platform map
              - generic [ref=e95]: 1 VPC · 2 AZ · 6 subnets · 35 resources
            - generic [ref=e96]:
              - generic [ref=e97]: Map lens
              - generic [ref=e98]:
                - button "Architecture" [ref=e99]:
                  - img [ref=e100]
                  - text: Architecture
                - button "Dependencies" [pressed] [ref=e110]:
                  - img [ref=e111]
                  - text: Dependencies
                - button "Attack paths" [ref=e115]:
                  - img [ref=e116]
                  - text: Attack paths
          - generic "Dependency line colors" [ref=e118]:
            - generic [ref=e119]: Flow colors
            - generic [ref=e120]:
              - img [ref=e121]
              - generic [ref=e123]: Service call
            - generic [ref=e124]:
              - img [ref=e125]
              - generic [ref=e127]: AWS data service
            - generic [ref=e128]:
              - img [ref=e129]
              - generic [ref=e131]: VPC endpoint
            - generic [ref=e132]:
              - img [ref=e133]
              - generic [ref=e135]: Internet egress
            - generic [ref=e136]:
              - img [ref=e137]
              - generic [ref=e139]: Database
            - generic [ref=e140]:
              - img [ref=e141]
              - generic [ref=e143]: Exposure / attack
            - generic [ref=e144]: Moving = authoritative observed
            - generic [ref=e148]:
              - img [ref=e149]
              - text: Outlined motion = historical direction
            - generic [ref=e152]:
              - img [ref=e153]
              - text: Solid = configured
            - generic [ref=e154]:
              - img [ref=e155]
              - text: Dashed = inferred / unverified
          - generic [ref=e156]:
            - generic [ref=e157]: Traffic evidence not yet authoritative
            - generic [ref=e158]: Outlined packets show historical source-to-target direction; they do not claim live traffic.
          - generic [ref=e160]:
            - generic [ref=e161]: Flow-log coverage
            - generic [ref=e162]: Not measured
            - generic [ref=e163]: 16 eligible endpoints, coverage not measured · 19 not applicable
            - button "Coverage details (3)" [ref=e164]
          - generic [ref=e165]:
            - generic [ref=e166]:
              - img [ref=e168]
              - generic [ref=e173]:
                - generic [ref=e174]: Users
                - generic [ref=e175]: Clients & operators
            - generic [ref=e177]:
              - img [ref=e179]
              - generic [ref=e184]:
                - generic [ref=e185]: Internet
                - generic [ref=e186]: Public path via IGW · igw-01b6c643a5c856abe
          - generic [ref=e187]:
            - generic [ref=e188]: ☁ AWS Cloud · acct 416651950952
            - generic [ref=e189]:
              - generic [ref=e190]: Region · eu-west-1
              - generic [ref=e191]:
                - generic [ref=e192]:
                  - generic [ref=e193]:
                    - generic "vpc-0c39cde96f29f8f4e" [ref=e194]: VPC · vpc-0c39cde96f29f8f4e
                    - generic "7 of 8 workloads in this VPC drop the shared prefix \"cyntro-tb-prod-\" from their chip label — every tooltip still carries the full name" [ref=e195]: cyntro-tb-prod-… ×7
                  - generic [ref=e197]:
                    - generic [ref=e198]:
                      - generic [ref=e199]:
                        - img [ref=e200]
                        - generic [ref=e206]: Load Balancers (2)
                      - generic [ref=e207]:
                        - button "cyntro-tb-prod-alb-int Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e208]:
                          - generic [ref=e210]:
                            - generic [ref=e211]:
                              - generic [ref=e212]: cyntro-tb-prod-alb-int
                              - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e213]: Multi-AZ
                            - generic [ref=e214]: LoadBalancer · arn:aws:elasticloadbalan
                          - generic [ref=e215]: "0"
                        - button "cyntro-tb-prod-alb-pub Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e216]:
                          - generic [ref=e218]:
                            - generic [ref=e219]:
                              - generic [ref=e220]: cyntro-tb-prod-alb-pub
                              - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e221]: Multi-AZ
                            - generic [ref=e222]: LoadBalancer · arn:aws:elasticloadbalan
                          - generic [ref=e223]: "0"
                    - generic [ref=e224]:
                      - generic [ref=e225]:
                        - generic "eu-west-1a" [ref=e226]: Availability Zone · eu-west-1a
                        - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1a · 10.42.0.0/24 · Owner: testbed-webshop" [ref=e227]':
                          - generic [ref=e228]:
                            - generic [ref=e229]: Public · cyntro-tb-prod-public-eu-west-1a
                            - generic [ref=e230]: 10.42.0.0/24
                          - generic "NAT gateway · nat-0fd7cf8524e62aea9 · public 54.229.208.150 · subnet subnet-05472c7cd0d3a7b90 (from vpc_topology.edges)" [ref=e232]:
                            - img [ref=e234]
                            - generic [ref=e237]: NAT GW · nat-0fd7cf8524e62aea9
                          - generic [ref=e238]:
                            - button "quiet posture score …web" [ref=e239]:
                              - generic "quiet posture score" [ref=e240]
                              - generic [ref=e243]: …web
                            - button "quiet posture score cyntro-testbed-webshop-writer" [ref=e244]:
                              - generic "quiet posture score" [ref=e245]
                              - generic [ref=e248]: cyntro-testbed-webshop-writer
                        - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1a · 10.42.10.0/24 · Owner: testbed-webshop" [ref=e249]':
                          - generic [ref=e250]:
                            - generic [ref=e251]: Private · cyntro-tb-prod-app-eu-west-1a
                            - generic [ref=e252]: 10.42.10.0/24
                          - button "quiet posture score ×2 EC2" [ref=e254]:
                            - generic "quiet posture score" [ref=e255]
                            - generic [ref=e260]: ×2
                            - generic [ref=e261]: EC2
                        - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1a · 10.42.20.0/24 · Owner: testbed-webshop" [ref=e262]':
                          - generic [ref=e263]:
                            - generic [ref=e264]: Data · cyntro-tb-prod-data-eu-west-1a
                            - generic [ref=e265]: 10.42.20.0/24
                          - button "quiet posture score …aurora-1" [ref=e267]:
                            - generic "quiet posture score" [ref=e268]
                            - generic [ref=e271]: …aurora-1
                      - generic [ref=e272]:
                        - generic "eu-west-1b" [ref=e273]: Availability Zone · eu-west-1b
                        - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1b · 10.42.1.0/24 · Owner: testbed-webshop" [ref=e274]':
                          - generic [ref=e275]:
                            - generic [ref=e276]: Public · cyntro-tb-prod-public-eu-west-1b
                            - generic [ref=e277]: 10.42.1.0/24
                          - button "quiet posture score …web" [ref=e279]:
                            - generic "quiet posture score" [ref=e280]
                            - generic [ref=e283]: …web
                        - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1b · 10.42.11.0/24 · Owner: testbed-webshop" [ref=e284]':
                          - generic [ref=e285]:
                            - generic [ref=e286]: Private · cyntro-tb-prod-app-eu-west-1b
                            - generic [ref=e287]: 10.42.11.0/24
                          - button "quiet posture score …app" [ref=e289]:
                            - generic "quiet posture score" [ref=e290]
                            - generic [ref=e293]: …app
                        - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1b · 10.42.21.0/24 · Owner: testbed-webshop" [ref=e294]':
                          - generic [ref=e295]:
                            - generic [ref=e296]: Data · cyntro-tb-prod-data-eu-west-1b
                            - generic [ref=e297]: 10.42.21.0/24
                          - button "quiet posture score …aurora-0" [ref=e299]:
                            - generic "quiet posture score" [ref=e300]
                            - generic [ref=e303]: …aurora-0
                - generic [ref=e304]:
                  - generic [ref=e305]: VPC boundary
                  - generic [ref=e306]:
                    - generic [ref=e307]: ↑ Internet
                    - generic [ref=e308]:
                      - button "IGW igw-01b6c643a5c856abe" [ref=e309]:
                        - img [ref=e311]
                        - generic [ref=e314]: IGW
                        - generic [ref=e315]: igw-01b6c643a5c856abe
                      - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e316]: "egress: 3 workloads"
                  - generic [ref=e318]:
                    - generic [ref=e319]: Endpoints (1)
                    - generic [ref=e320]:
                      - button "VPCE GW Amazon S3" [ref=e321]:
                        - img [ref=e323]
                        - generic [ref=e327]: VPCE
                        - generic [ref=e328]: GW
                        - generic [ref=e329]: Amazon S3
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e330]: "use: not observed"
                - generic [ref=e331]:
                  - generic [ref=e332]: Outside the VPC
                  - generic [ref=e333]: Destinations observed this generation · NAT → IGW is configured routing
                  - generic [ref=e334]:
                    - generic "3.253.225.145 — an address; the evidence names no service" [ref=e335]:
                      - generic [ref=e336]: 3.253.225.145
                      - generic [ref=e337]: address
                    - generic "3.5.64.0 — an address; the evidence names no service" [ref=e338]:
                      - generic [ref=e339]: 3.5.64.0
                      - generic [ref=e340]: address
                    - generic "3.5.64.128 — an address; the evidence names no service" [ref=e341]:
                      - generic [ref=e342]: 3.5.64.128
                      - generic [ref=e343]: address
                    - generic "3.5.67.254 — an address; the evidence names no service" [ref=e344]:
                      - generic [ref=e345]: 3.5.67.254
                      - generic [ref=e346]: address
                    - generic "3.5.69.34 — an address; the evidence names no service" [ref=e347]:
                      - generic [ref=e348]: 3.5.69.34
                      - generic [ref=e349]: address
                    - generic "3.5.72.119 — an address; the evidence names no service" [ref=e350]:
                      - generic [ref=e351]: 3.5.72.119
                      - generic [ref=e352]: address
                    - button "+7 more" [ref=e353]
                  - generic [ref=e355]:
                    - generic [ref=e356]:
                      - generic [ref=e357]: 3 workloads
                      - generic [ref=e360]: ▸
                      - generic [ref=e361]:
                        - generic "NAT nat-0fd7cf8524e62aea9" [ref=e362]:
                          - text: NAT
                          - generic [ref=e363]: nat-0fd7cf8524e62aea9
                        - generic [ref=e366]: ▸
                      - generic [ref=e367]:
                        - generic "IGW igw-01b6c643a5c856abe" [ref=e368]:
                          - text: IGW
                          - generic [ref=e369]: igw-01b6c643a5c856abe
                        - generic [ref=e372]: ▸
                    - button "External destinations 3 workloads · up to 45 distinct · addresses sampled" [ref=e373]:
                      - img [ref=e375]
                      - generic [ref=e380]:
                        - generic [ref=e381]: External destinations
                        - generic [ref=e382]: 3 workloads · up to 45 distinct · addresses sampled
                - generic [ref=e384]:
                  - generic [ref=e385]:
                    - generic [ref=e386]:
                      - generic [ref=e387]: Lambda runtime (6)
                      - generic [ref=e388]:
                        - text: outside subnet grid · 6 outside VPC (verified)
                        - generic "12 of 12 chips omit this shared prefix" [ref=e389]: · cyntro-tb-prod-consumer-… ×12
                      - button "S3 traffic from 4 of 6 functions" [ref=e391]
                    - generic [ref=e392]:
                      - generic [ref=e393]: Triggers (6)
                      - generic [ref=e394]:
                        - button "quiet posture score …daily" [ref=e395]:
                          - generic "quiet posture score" [ref=e396]
                          - generic [ref=e399]: …daily
                        - button "quiet posture score …every_6h" [ref=e400]:
                          - generic "quiet posture score" [ref=e401]
                          - generic [ref=e404]: …every_6h
                        - button "quiet posture score …frequent" [ref=e405]:
                          - generic "quiet posture score" [ref=e406]
                          - generic [ref=e409]: …frequent
                        - button "quiet posture score …monthly" [ref=e410]:
                          - generic "quiet posture score" [ref=e411]
                          - generic [ref=e414]: …monthly
                        - button "quiet posture score …nightly_burst" [ref=e415]:
                          - generic "quiet posture score" [ref=e416]
                          - generic [ref=e419]: …nightly_burst
                        - button "quiet posture score …weekly" [ref=e420]:
                          - generic "quiet posture score" [ref=e421]
                          - generic [ref=e424]: …weekly
                    - generic [ref=e426]:
                      - button "quiet posture score …monthly" [ref=e427]:
                        - generic "quiet posture score" [ref=e428]
                        - generic [ref=e431]: …monthly
                      - button "quiet posture score …weekly" [ref=e432]:
                        - generic "quiet posture score" [ref=e433]
                        - generic [ref=e436]: …weekly
                      - button "quiet posture score …daily" [ref=e437]:
                        - generic "quiet posture score" [ref=e438]
                        - generic [ref=e441]: …daily
                      - button "quiet posture score …every_6h" [ref=e442]:
                        - generic "quiet posture score" [ref=e443]
                        - generic [ref=e446]: …every_6h
                      - button "quiet posture score …frequent" [ref=e447]:
                        - generic "quiet posture score" [ref=e448]
                        - generic [ref=e451]: …frequent
                      - button "quiet posture score …nightly_burst" [ref=e452]:
                        - generic "quiet posture score" [ref=e453]
                        - generic [ref=e456]: …nightly_burst
                  - generic [ref=e458]:
                    - generic [ref=e459]:
                      - text: Regional · KMS / S3 / DDB (7)
                      - generic "3 of 7 chips omit this shared prefix" [ref=e460]: arn:aws:kms:eu-west-1:416651950952:key/… ×3
                    - generic [ref=e462]:
                      - button "quiet posture score cyntro-evidence-testbed-webshop-950952" [ref=e463]:
                        - generic "quiet posture score" [ref=e464]
                        - generic [ref=e467]: cyntro-evidence-testbed-webshop-950952
                      - button "quiet posture score cyntro-ingest-head-testbed-webshop" [ref=e468]:
                        - generic "quiet posture score" [ref=e469]
                        - generic [ref=e472]: cyntro-ingest-head-testbed-webshop
                      - button "quiet posture score cyntro-tb-prod-appdata-1c8276f5" [ref=e473]:
                        - generic "quiet posture score" [ref=e474]
                        - generic [ref=e477]: cyntro-tb-prod-appdata-1c8276f5
                      - button "quiet posture score …76bd5a63-602c-471e-b085-1df8b04128b2" [ref=e478]:
                        - generic "quiet posture score" [ref=e479]
                        - generic [ref=e482]: …76bd5a63-602c-471e-b085-1df8b04128b2
                      - button "quiet posture score …d729e441-b319-4859-9974-9bd12d8e341a" [ref=e483]:
                        - generic "quiet posture score" [ref=e484]
                        - generic [ref=e487]: …d729e441-b319-4859-9974-9bd12d8e341a
                      - button "quiet posture score …1a88e19d-2eb4-4bf7-a16d-35152bc8a453" [ref=e488]:
                        - generic "quiet posture score" [ref=e489]
                        - generic [ref=e492]: …1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                      - button "quiet posture score cyntro-tb-prod-logs-1c8276f5 S3" [ref=e493]:
                        - generic "quiet posture score" [ref=e494]
                        - generic [ref=e497]: cyntro-tb-prod-logs-1c8276f5
                        - generic [ref=e498]: S3
              - button "Logical groups · members carry the placement (6) Show members" [ref=e500]:
                - generic [ref=e501]: Logical groups · members carry the placement (6)
                - generic [ref=e502]: Show members
          - generic [ref=e503]:
            - button "Diagnostics 6 serverless · 38 flows ▴" [ref=e504]:
              - generic [ref=e505]: Diagnostics
              - generic [ref=e506]: 6 serverless · 38 flows ▴
            - generic [ref=e507]:
              - generic [ref=e508]:
                - generic [ref=e509]: Serverless compute (6)
                - generic [ref=e510]:
                  - button "cyntro-tb-prod-consumer-monthly Lambda · arn:aws:lambda:eu-west-1 15" [ref=e511]:
                    - generic [ref=e513]:
                      - generic [ref=e515]: cyntro-tb-prod-consumer-monthly
                      - generic [ref=e516]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e517]: "15"
                  - button "cyntro-tb-prod-consumer-weekly Lambda · arn:aws:lambda:eu-west-1 15" [ref=e518]:
                    - generic [ref=e520]:
                      - generic [ref=e522]: cyntro-tb-prod-consumer-weekly
                      - generic [ref=e523]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e524]: "15"
                  - button "cyntro-tb-prod-consumer-daily Lambda · arn:aws:lambda:eu-west-1 4" [ref=e525]:
                    - generic [ref=e527]:
                      - generic [ref=e529]: cyntro-tb-prod-consumer-daily
                      - generic [ref=e530]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e531]: "4"
                  - button "cyntro-tb-prod-consumer-every_6h Lambda · arn:aws:lambda:eu-west-1 4" [ref=e532]:
                    - generic [ref=e534]:
                      - generic [ref=e536]: cyntro-tb-prod-consumer-every_6h
                      - generic [ref=e537]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e538]: "4"
                  - button "cyntro-tb-prod-consumer-frequent Lambda · arn:aws:lambda:eu-west-1 4" [ref=e539]:
                    - generic [ref=e541]:
                      - generic [ref=e543]: cyntro-tb-prod-consumer-frequent
                      - generic [ref=e544]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e545]: "4"
                  - button "cyntro-tb-prod-consumer-nightly_burst Lambda · arn:aws:lambda:eu-west-1 4" [ref=e546]:
                    - generic [ref=e548]:
                      - generic [ref=e550]: cyntro-tb-prod-consumer-nightly_burst
                      - generic [ref=e551]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e552]: "4"
              - generic [ref=e553]:
                - generic [ref=e554]:
                  - generic [ref=e555]: Observed traffic — animated arrows above
                  - generic [ref=e556]: 38 flows · 25 internal · 10 edge-service · 0 vpce · 0 database · 3 egress
                - generic [ref=e557]:
                  - generic [ref=e558]:
                    - generic [ref=e559]: cyntro-tb-prod-consumer-nightly_burst
                    - generic [ref=e560]: →
                    - generic [ref=e561]: cyntro-tb-prod-appdata-1c8276f5
                    - generic [ref=e562]: ACTUAL_S3_ACCESS
                  - generic [ref=e563]:
                    - generic [ref=e564]: cyntro-tb-prod-consumer-daily
                    - generic [ref=e565]: →
                    - generic [ref=e566]: cyntro-tb-prod-appdata-1c8276f5
                    - generic [ref=e567]: ACTUAL_S3_ACCESS
                  - generic [ref=e568]:
                    - generic [ref=e569]: cyntro-tb-prod-consumer-frequent
                    - generic [ref=e570]: →
                    - generic [ref=e571]: cyntro-tb-prod-appdata-1c8276f5
                    - generic [ref=e572]: ACTUAL_S3_ACCESS
                  - generic [ref=e573]:
                    - generic [ref=e574]: cyntro-tb-prod-consumer-every_6h
                    - generic [ref=e575]: →
                    - generic [ref=e576]: cyntro-tb-prod-appdata-1c8276f5
                    - generic [ref=e577]: ACTUAL_S3_ACCESS
                  - generic [ref=e578]:
                    - generic [ref=e579]: cyntro-tb-prod-app
                    - generic [ref=e580]: →
                    - generic [ref=e581]: Internet (via IGW)
                    - generic [ref=e582]: egress · 32 (ext 32)
                  - generic [ref=e583]:
                    - generic [ref=e584]: cyntro-tb-prod-loadgen
                    - generic [ref=e585]: →
                    - generic [ref=e586]: Internet (via IGW)
                    - generic [ref=e587]: egress · 3 (ext 3)
                  - generic [ref=e588]:
                    - generic [ref=e589]: cyntro-tb-prod-app
                    - generic [ref=e590]: →
                    - generic [ref=e591]: Internet (via IGW)
                    - generic [ref=e592]: egress · 10 (ext 10)
                  - generic [ref=e593]:
                    - generic [ref=e594]: cyntro-testbed-webshop-writer
                    - generic [ref=e595]: →
                    - generic [ref=e596]: cyntro-testbed-webshop
                    - generic [ref=e597]: MEMBER_OF_CLUSTER
                  - generic [ref=e598]:
                    - generic [ref=e599]: cyntro-tb-prod-aurora-1
                    - generic [ref=e600]: →
                    - generic [ref=e601]: cyntro-tb-prod-aurora
                    - generic [ref=e602]: MEMBER_OF_CLUSTER
                  - generic [ref=e603]:
                    - generic [ref=e604]: cyntro-tb-prod-aurora-0
                    - generic [ref=e605]: →
                    - generic [ref=e606]: cyntro-tb-prod-aurora
                    - generic [ref=e607]: MEMBER_OF_CLUSTER
                  - generic [ref=e608]:
                    - generic [ref=e609]: cyntro-tb-prod-tg-app
                    - generic [ref=e610]: →
                    - generic [ref=e611]: cyntro-tb-prod-app
                    - generic [ref=e612]: TARGETS
                  - generic [ref=e613]:
                    - generic [ref=e614]: cyntro-tb-prod-tg-app
                    - generic [ref=e615]: →
                    - generic [ref=e616]: cyntro-tb-prod-app
                    - generic [ref=e617]: TARGETS
                  - generic [ref=e618]: + 32 more flows
              - generic [ref=e619]:
                - generic [ref=e620]: Encoding
                - generic [ref=e621]:
                  - generic [ref=e624]: Worst (carmine halo + pulse)
                  - generic [ref=e627]: High / elevated (ring only)
                  - generic [ref=e628]:
                    - generic [ref=e629]: ♛
                    - generic [ref=e630]: Crown-jewel halo
                  - generic [ref=e633]: Clean · remediated (teal ring)
                  - generic [ref=e636]: Stale (dimmed)
                  - generic [ref=e639]: Coverage gap (not collected)
          - img:
            - generic:
              - generic:
                - generic: MEMBER_OF_CLUSTER
            - generic:
              - generic:
                - generic: MEMBER_OF_CLUSTER
            - generic:
              - generic:
                - generic: MEMBER_OF_CLUSTER
            - generic:
              - generic:
                - generic: 2 flows
            - generic:
              - generic:
                - generic: 2 flows
            - generic:
              - generic:
                - generic: 2 flows
            - generic:
              - generic:
                - generic: 2 flows
            - generic:
              - generic:
                - generic: TG
            - generic:
              - generic:
                - generic: TG
            - generic:
              - generic:
                - generic: KMS
            - generic:
              - generic:
                - generic: KMS
            - generic:
              - generic:
                - generic: KMS
            - generic:
              - generic:
                - generic: Egress · 9 flows
            - generic:
              - generic:
                - generic: TARGETS ×6
            - generic:
              - generic:
                - generic: KMS ×3
            - generic:
              - generic:
                - generic: S3 access ×4
              - generic:
                - generic: API
              - generic:
                - generic: API
              - generic:
                - generic: API
              - generic:
                - generic: API
      - complementary [ref=e640]:
        - complementary [ref=e641]:
          - generic [ref=e642]:
            - generic [ref=e643]:
              - heading "Service index" [level=2] [ref=e644]
              - generic [ref=e645]: "35"
            - generic [ref=e646]:
              - img [ref=e647]
              - searchbox "Find service in topology" [ref=e650]
            - button "Filters" [ref=e653]:
              - img [ref=e654]
              - text: Filters
          - list [ref=e656]:
            - listitem [ref=e657]:
              - button "cyntro-tb-prod-appdata-1c8276f5 Current graph data S3 · global · regional 4 in · 1 out Aug 20, 04:53 PM" [ref=e658]:
                - generic [ref=e659]:
                  - img [ref=e661]
                  - generic [ref=e663]:
                    - generic [ref=e664]:
                      - generic [ref=e665]: cyntro-tb-prod-appdata-1c8276f5
                      - generic "Current graph data" [ref=e666]
                    - generic [ref=e668]: S3 · global · regional
                    - generic [ref=e669]:
                      - generic [ref=e670]: 4 in · 1 out
                      - generic [ref=e671]:
                        - img [ref=e672]
                        - text: Aug 20, 04:53 PM
            - listitem [ref=e675]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2 Current graph data KMSKey · global · regional 3 in · 0 out Sep 11, 07:35 PM" [ref=e676]:
                - generic [ref=e677]:
                  - img [ref=e679]
                  - generic [ref=e681]:
                    - generic [ref=e682]:
                      - generic [ref=e683]: arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2
                      - generic "Current graph data" [ref=e684]
                    - generic [ref=e686]: KMSKey · global · regional
                    - generic [ref=e687]:
                      - generic [ref=e688]: 3 in · 0 out
                      - generic [ref=e689]:
                        - img [ref=e690]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e693]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1b · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e694]:
                - generic [ref=e695]:
                  - img [ref=e697]
                  - generic [ref=e699]:
                    - generic [ref=e700]:
                      - generic [ref=e701]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e702]
                    - generic [ref=e704]: EC2 · eu-west-1b · app
                    - generic [ref=e705]:
                      - generic [ref=e706]: 2 in · 1 out
                      - generic [ref=e707]:
                        - img [ref=e708]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e711]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1a · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e712]:
                - generic [ref=e713]:
                  - img [ref=e715]
                  - generic [ref=e717]:
                    - generic [ref=e718]:
                      - generic [ref=e719]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e720]
                    - generic [ref=e722]: EC2 · eu-west-1a · app
                    - generic [ref=e723]:
                      - generic [ref=e724]: 2 in · 1 out
                      - generic [ref=e725]:
                        - img [ref=e726]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e729]:
              - button "cyntro-tb-prod-consumer-daily Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e730]:
                - generic [ref=e731]:
                  - img [ref=e733]
                  - generic [ref=e735]:
                    - generic [ref=e736]:
                      - generic [ref=e737]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e738]
                    - generic [ref=e740]: Lambda · eu-west-1 · regional
                    - generic [ref=e741]:
                      - generic [ref=e742]: 2 in · 1 out
                      - generic [ref=e743]:
                        - img [ref=e744]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e747]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e748]:
                - generic [ref=e749]:
                  - img [ref=e751]
                  - generic [ref=e753]:
                    - generic [ref=e754]:
                      - generic [ref=e755]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e756]
                    - generic [ref=e758]: Lambda · eu-west-1 · regional
                    - generic [ref=e759]:
                      - generic [ref=e760]: 2 in · 1 out
                      - generic [ref=e761]:
                        - img [ref=e762]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e765]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 1, 11:00 AM" [ref=e766]:
                - generic [ref=e767]:
                  - img [ref=e769]
                  - generic [ref=e771]:
                    - generic [ref=e772]:
                      - generic [ref=e773]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e774]
                    - generic [ref=e776]: Lambda · eu-west-1 · regional
                    - generic [ref=e777]:
                      - generic [ref=e778]: 2 in · 1 out
                      - generic [ref=e779]:
                        - img [ref=e780]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e783]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e784]:
                - generic [ref=e785]:
                  - img [ref=e787]
                  - generic [ref=e789]:
                    - generic [ref=e790]:
                      - generic [ref=e791]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e792]
                    - generic [ref=e794]: Lambda · eu-west-1 · regional
                    - generic [ref=e795]:
                      - generic [ref=e796]: 2 in · 1 out
                      - generic [ref=e797]:
                        - img [ref=e798]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e801]:
              - button "cyntro-tb-prod-tg-app Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e802]:
                - generic [ref=e803]:
                  - img [ref=e805]
                  - generic [ref=e807]:
                    - generic [ref=e808]:
                      - generic [ref=e809]: cyntro-tb-prod-tg-app
                      - generic "Current graph data" [ref=e810]
                    - generic [ref=e812]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e813]:
                      - generic [ref=e814]: 1 in · 2 out
                      - generic [ref=e815]:
                        - img [ref=e816]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e819]:
              - button "cyntro-tb-prod-tg-web Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e820]:
                - generic [ref=e821]:
                  - img [ref=e823]
                  - generic [ref=e825]:
                    - generic [ref=e826]:
                      - generic [ref=e827]: cyntro-tb-prod-tg-web
                      - generic "Current graph data" [ref=e828]
                    - generic [ref=e830]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e831]:
                      - generic [ref=e832]: 1 in · 2 out
                      - generic [ref=e833]:
                        - img [ref=e834]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e837]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453 Current graph data KMSKey · global · regional 2 in · 0 out Sep 11, 07:35 PM" [ref=e838]:
                - generic [ref=e839]:
                  - img [ref=e841]
                  - generic [ref=e843]:
                    - generic [ref=e844]:
                      - generic [ref=e845]: arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                      - generic "Current graph data" [ref=e846]
                    - generic [ref=e848]: KMSKey · global · regional
                    - generic [ref=e849]:
                      - generic [ref=e850]: 2 in · 0 out
                      - generic [ref=e851]:
                        - img [ref=e852]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e855]:
              - button "cyntro-tb-prod-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e856]:
                - generic [ref=e857]:
                  - img [ref=e859]
                  - generic [ref=e861]:
                    - generic [ref=e862]:
                      - generic [ref=e863]: cyntro-tb-prod-asg-app
                      - generic "Current graph data" [ref=e864]
                    - generic [ref=e866]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e867]:
                      - generic [ref=e868]: 0 in · 2 out
                      - generic [ref=e869]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e872]:
              - button "cyntro-tb-prod-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e873]:
                - generic [ref=e874]:
                  - img [ref=e876]
                  - generic [ref=e878]:
                    - generic [ref=e879]:
                      - generic [ref=e880]: cyntro-tb-prod-asg-web
                      - generic "Current graph data" [ref=e881]
                    - generic [ref=e883]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e884]:
                      - generic [ref=e885]: 0 in · 2 out
                      - generic [ref=e886]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e889]:
              - button "cyntro-tb-prod-aurora Current graph data RDS · eu-west-1 · regional 2 in · 0 out Sep 11, 07:35 PM" [ref=e890]:
                - generic [ref=e891]:
                  - img [ref=e893]
                  - generic [ref=e895]:
                    - generic [ref=e896]:
                      - generic [ref=e897]: cyntro-tb-prod-aurora
                      - generic "Current graph data" [ref=e898]
                    - generic [ref=e900]: RDS · eu-west-1 · regional
                    - generic [ref=e901]:
                      - generic [ref=e902]: 2 in · 0 out
                      - generic [ref=e903]:
                        - img [ref=e904]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e907]:
              - button "cyntro-tb-prod-aurora-0 Current graph data RDS · eu-west-1b · data 0 in · 2 out Sep 11, 07:35 PM" [ref=e908]:
                - generic [ref=e909]:
                  - img [ref=e911]
                  - generic [ref=e913]:
                    - generic [ref=e914]:
                      - generic [ref=e915]: cyntro-tb-prod-aurora-0
                      - generic "Current graph data" [ref=e916]
                    - generic [ref=e918]: RDS · eu-west-1b · data
                    - generic [ref=e919]:
                      - generic [ref=e920]: 0 in · 2 out
                      - generic [ref=e921]:
                        - img [ref=e922]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e925]:
              - button "cyntro-tb-prod-aurora-1 Current graph data RDS · eu-west-1a · data 0 in · 2 out Sep 11, 07:35 PM" [ref=e926]:
                - generic [ref=e927]:
                  - img [ref=e929]
                  - generic [ref=e931]:
                    - generic [ref=e932]:
                      - generic [ref=e933]: cyntro-tb-prod-aurora-1
                      - generic "Current graph data" [ref=e934]
                    - generic [ref=e936]: RDS · eu-west-1a · data
                    - generic [ref=e937]:
                      - generic [ref=e938]: 0 in · 2 out
                      - generic [ref=e939]:
                        - img [ref=e940]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e943]:
              - button "cyntro-tb-prod-consumer-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e944]:
                - generic [ref=e945]:
                  - img [ref=e947]
                  - generic [ref=e949]:
                    - generic [ref=e950]:
                      - generic [ref=e951]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e952]
                    - generic [ref=e954]: EventBridge · eu-west-1 · regional
                    - generic [ref=e955]:
                      - generic [ref=e956]: 0 in · 2 out
                      - generic [ref=e957]:
                        - img [ref=e958]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e961]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e962]:
                - generic [ref=e963]:
                  - img [ref=e965]
                  - generic [ref=e967]:
                    - generic [ref=e968]:
                      - generic [ref=e969]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e970]
                    - generic [ref=e972]: EventBridge · eu-west-1 · regional
                    - generic [ref=e973]:
                      - generic [ref=e974]: 0 in · 2 out
                      - generic [ref=e975]:
                        - img [ref=e976]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e979]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Sep 1, 11:00 AM" [ref=e980]:
                - generic [ref=e981]:
                  - img [ref=e983]
                  - generic [ref=e985]:
                    - generic [ref=e986]:
                      - generic [ref=e987]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e988]
                    - generic [ref=e990]: EventBridge · eu-west-1 · regional
                    - generic [ref=e991]:
                      - generic [ref=e992]: 0 in · 2 out
                      - generic [ref=e993]:
                        - img [ref=e994]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e997]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e998]:
                - generic [ref=e999]:
                  - img [ref=e1001]
                  - generic [ref=e1003]:
                    - generic [ref=e1004]:
                      - generic [ref=e1005]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e1006]
                    - generic [ref=e1008]: Lambda · eu-west-1 · regional
                    - generic [ref=e1009]:
                      - generic [ref=e1010]: 2 in · 0 out
                      - generic [ref=e1011]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1014]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e1015]:
                - generic [ref=e1016]:
                  - img [ref=e1018]
                  - generic [ref=e1020]:
                    - generic [ref=e1021]:
                      - generic [ref=e1022]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e1023]
                    - generic [ref=e1025]: EventBridge · eu-west-1 · regional
                    - generic [ref=e1026]:
                      - generic [ref=e1027]: 0 in · 2 out
                      - generic [ref=e1028]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1031]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e1032]:
                - generic [ref=e1033]:
                  - img [ref=e1035]
                  - generic [ref=e1037]:
                    - generic [ref=e1038]:
                      - generic [ref=e1039]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e1040]
                    - generic [ref=e1042]: EventBridge · eu-west-1 · regional
                    - generic [ref=e1043]:
                      - generic [ref=e1044]: 0 in · 2 out
                      - generic [ref=e1045]:
                        - img [ref=e1046]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e1049]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out Aug 29, 11:00 AM" [ref=e1050]:
                - generic [ref=e1051]:
                  - img [ref=e1053]
                  - generic [ref=e1055]:
                    - generic [ref=e1056]:
                      - generic [ref=e1057]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e1058]
                    - generic [ref=e1060]: Lambda · eu-west-1 · regional
                    - generic [ref=e1061]:
                      - generic [ref=e1062]: 2 in · 0 out
                      - generic [ref=e1063]:
                        - img [ref=e1064]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e1067]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 29, 11:00 AM" [ref=e1068]:
                - generic [ref=e1069]:
                  - img [ref=e1071]
                  - generic [ref=e1073]:
                    - generic [ref=e1074]:
                      - generic [ref=e1075]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e1076]
                    - generic [ref=e1078]: EventBridge · eu-west-1 · regional
                    - generic [ref=e1079]:
                      - generic [ref=e1080]: 0 in · 2 out
                      - generic [ref=e1081]:
                        - img [ref=e1082]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e1085]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1a · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e1086]:
                - generic [ref=e1087]:
                  - img [ref=e1089]
                  - generic [ref=e1091]:
                    - generic [ref=e1092]:
                      - generic [ref=e1093]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e1094]
                    - generic [ref=e1096]: EC2 · eu-west-1a · web
                    - generic [ref=e1097]:
                      - generic [ref=e1098]: 2 in · 0 out
                      - generic [ref=e1099]:
                        - img [ref=e1100]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e1103]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1b · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e1104]:
                - generic [ref=e1105]:
                  - img [ref=e1107]
                  - generic [ref=e1109]:
                    - generic [ref=e1110]:
                      - generic [ref=e1111]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e1112]
                    - generic [ref=e1114]: EC2 · eu-west-1b · web
                    - generic [ref=e1115]:
                      - generic [ref=e1116]: 2 in · 0 out
                      - generic [ref=e1117]:
                        - img [ref=e1118]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e1121]:
              - button "cyntro-testbed-webshop-writer Current graph data Neptune · eu-west-1a · web 0 in · 2 out Sep 11, 07:35 PM" [ref=e1122]:
                - generic [ref=e1123]:
                  - img [ref=e1125]
                  - generic [ref=e1127]:
                    - generic [ref=e1128]:
                      - generic [ref=e1129]: cyntro-testbed-webshop-writer
                      - generic "Current graph data" [ref=e1130]
                    - generic [ref=e1132]: Neptune · eu-west-1a · web
                    - generic [ref=e1133]:
                      - generic [ref=e1134]: 0 in · 2 out
                      - generic [ref=e1135]:
                        - img [ref=e1136]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e1139]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a Current graph data KMSKey · global · regional 1 in · 0 out No runtime timestamp" [ref=e1140]:
                - generic [ref=e1141]:
                  - img [ref=e1143]
                  - generic [ref=e1145]:
                    - generic [ref=e1146]:
                      - generic [ref=e1147]: arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a
                      - generic "Current graph data" [ref=e1148]
                    - generic [ref=e1150]: KMSKey · global · regional
                    - generic [ref=e1151]:
                      - generic [ref=e1152]: 1 in · 0 out
                      - generic [ref=e1153]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1156]:
              - button "cyntro-evidence-testbed-webshop-950952 Current graph data S3 · global · regional 0 in · 1 out No runtime timestamp" [ref=e1157]:
                - generic [ref=e1158]:
                  - img [ref=e1160]
                  - generic [ref=e1162]:
                    - generic [ref=e1163]:
                      - generic [ref=e1164]: cyntro-evidence-testbed-webshop-950952
                      - generic "Current graph data" [ref=e1165]
                    - generic [ref=e1167]: S3 · global · regional
                    - generic [ref=e1168]:
                      - generic [ref=e1169]: 0 in · 1 out
                      - generic [ref=e1170]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1173]:
              - button "cyntro-ingest-head-testbed-webshop Current graph data DynamoDB · eu-west-1 · regional 0 in · 1 out No runtime timestamp" [ref=e1174]:
                - generic [ref=e1175]:
                  - img [ref=e1177]
                  - generic [ref=e1179]:
                    - generic [ref=e1180]:
                      - generic [ref=e1181]: cyntro-ingest-head-testbed-webshop
                      - generic "Current graph data" [ref=e1182]
                    - generic [ref=e1184]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1185]:
                      - generic [ref=e1186]: 0 in · 1 out
                      - generic [ref=e1187]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1190]:
              - button "cyntro-tb-prod-alb-int Current graph data LoadBalancer · eu-west-1a · app 0 in · 1 out No runtime timestamp" [ref=e1191]:
                - generic [ref=e1192]:
                  - img [ref=e1194]
                  - generic [ref=e1196]:
                    - generic [ref=e1197]:
                      - generic [ref=e1198]: cyntro-tb-prod-alb-int
                      - generic "Current graph data" [ref=e1199]
                    - generic [ref=e1201]: LoadBalancer · eu-west-1a · app
                    - generic [ref=e1202]:
                      - generic [ref=e1203]: 0 in · 1 out
                      - generic [ref=e1204]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1207]:
              - button "cyntro-tb-prod-alb-pub Current graph data LoadBalancer · eu-west-1b · web 0 in · 1 out No runtime timestamp" [ref=e1208]:
                - generic [ref=e1209]:
                  - img [ref=e1211]
                  - generic [ref=e1213]:
                    - generic [ref=e1214]:
                      - generic [ref=e1215]: cyntro-tb-prod-alb-pub
                      - generic "Current graph data" [ref=e1216]
                    - generic [ref=e1218]: LoadBalancer · eu-west-1b · web
                    - generic [ref=e1219]:
                      - generic [ref=e1220]: 0 in · 1 out
                      - generic [ref=e1221]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1224]:
              - button "cyntro-tb-prod-loadgen Current graph data EC2 · eu-west-1a · app 0 in · 1 out Aug 18, 06:57 PM" [ref=e1225]:
                - generic [ref=e1226]:
                  - img [ref=e1228]
                  - generic [ref=e1230]:
                    - generic [ref=e1231]:
                      - generic [ref=e1232]: cyntro-tb-prod-loadgen
                      - generic "Current graph data" [ref=e1233]
                    - generic [ref=e1235]: EC2 · eu-west-1a · app
                    - generic [ref=e1236]:
                      - generic [ref=e1237]: 0 in · 1 out
                      - generic [ref=e1238]:
                        - img [ref=e1239]
                        - text: Aug 18, 06:57 PM
            - listitem [ref=e1242]:
              - button "cyntro-testbed-webshop Current graph data Neptune · eu-west-1 · regional 1 in · 0 out Sep 11, 07:35 PM" [ref=e1243]:
                - generic [ref=e1244]:
                  - img [ref=e1246]
                  - generic [ref=e1248]:
                    - generic [ref=e1249]:
                      - generic [ref=e1250]: cyntro-testbed-webshop
                      - generic "Current graph data" [ref=e1251]
                    - generic [ref=e1253]: Neptune · eu-west-1 · regional
                    - generic [ref=e1254]:
                      - generic [ref=e1255]: 1 in · 0 out
                      - generic [ref=e1256]:
                        - img [ref=e1257]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e1260]:
              - button "cyntro-tb-prod-logs-1c8276f5 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp" [ref=e1261]:
                - generic [ref=e1262]:
                  - img [ref=e1264]
                  - generic [ref=e1267]:
                    - generic [ref=e1268]:
                      - generic [ref=e1269]: cyntro-tb-prod-logs-1c8276f5
                      - generic "Current graph data" [ref=e1270]
                    - generic [ref=e1272]: S3 · global · regional
                    - generic [ref=e1273]:
                      - generic [ref=e1274]: 0 in · 0 out
                      - generic [ref=e1275]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1278]:
      - text: Live read from
      - generic [ref=e1279]: /api/topology-risk/testbed-webshop
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1280]
```

# Test source

```ts
  1748 |       return {
  1749 |         selected_text: option?.textContent?.trim() ?? null,
  1750 |         title: select.getAttribute("title"),
  1751 |         // The rendered box versus the text the browser wants to draw in it.
  1752 |         client_width: Math.round(select.clientWidth),
  1753 |         scroll_width: Math.round(select.scrollWidth),
  1754 |       }
  1755 |     })
  1756 |     const counter = (await page.getByText(/account(s)? in view/).first().textContent()) ?? ""
  1757 |     report("matrix-scope-bar", { ...state, counter: counter.trim() })
  1758 | 
  1759 |     // THE detector, and it had to be measured to be found. The DOM text always
  1760 |     // carries the full id -- run 34756120023 recorded
  1761 |     // selected_text "Testbed Webshop · 416651950952" while the control was
  1762 |     // visibly cut -- so asserting on the text can never catch the clipping.
  1763 |     // What catches it is the box: the same run measured client_width 208
  1764 |     // against scroll_width 218, i.e. ten pixels of the value the operator
  1765 |     // could not see.
  1766 |     expect(
  1767 |       state.scroll_width,
  1768 |       `the account control clips its value: it needs ${state.scroll_width}px and has ` +
  1769 |         `${state.client_width}px, so the id is cut where an operator reads it`,
  1770 |     ).toBeLessThanOrEqual(state.client_width)
  1771 | 
  1772 |     // Then the belt and braces: the value is intact in the DOM, and reachable
  1773 |     // on hover for a display name long enough to outrun any cap.
  1774 |     expect(state.selected_text, "the selected account option").toContain(ACCOUNT)
  1775 |     expect(state.title, "the hover title must carry the full id").toContain(ACCOUNT)
  1776 | 
  1777 |     // Singular when there is one. "1 accounts" is the tell that a count is
  1778 |     // being pasted into a fixed string.
  1779 |     expect(counter).not.toMatch(/\b1 accounts in view\b/)
  1780 |   })
  1781 | 
  1782 |   test("reduced motion: the map still renders and reports its animation state", async ({
  1783 |     context,
  1784 |     page,
  1785 |   }) => {
  1786 |     test.setTimeout(300_000)
  1787 |     await seedAuthCookie(context)
  1788 |     await page.setViewportSize({ width: 1600, height: 900 })
  1789 |     const pageErrors: string[] = []
  1790 |     page.on("pageerror", error => pageErrors.push(String(error.message ?? error)))
  1791 | 
  1792 |     /** Flow packets present, and how many are actually animating. */
  1793 |     const measure = () =>
  1794 |       page.evaluate(() => {
  1795 |         const packets = Array.from(
  1796 |           document.querySelectorAll<SVGElement>('[data-testid="topology-flow-packet"]'),
  1797 |         )
  1798 |         // Packets move by SMIL <animateMotion>, which getComputedStyle never
  1799 |         // reports: this probe previously read CSS animation state only and so
  1800 |         // counted zero animating packets whether or not they moved. A packet
  1801 |         // animates when its motion repeats or takes measurable time; a frozen,
  1802 |         // instant positioning holds it still.
  1803 |         const animated = packets.filter(el => {
  1804 |           const style = getComputedStyle(el)
  1805 |           const cssRunning = style.animationName !== "none" && style.animationPlayState === "running"
  1806 |           const smilRunning = Array.from(el.querySelectorAll("animateMotion, animate, animateTransform")).some(
  1807 |             motion =>
  1808 |               motion.getAttribute("repeatCount") === "indefinite" ||
  1809 |               parseFloat(motion.getAttribute("dur") || "0") > 0.01,
  1810 |           )
  1811 |           return cssRunning || smilRunning
  1812 |         })
  1813 |         return {
  1814 |           honours_query: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  1815 |           packets: packets.length,
  1816 |           animating: animated.length,
  1817 |         }
  1818 |       })
  1819 | 
  1820 |     // A CONTROLLED comparison. The first run of this probe reported
  1821 |     // `packets: 0, animating: 0` under reduced motion and concluded nothing:
  1822 |     // zero animating packets out of zero packets says only that the map drew
  1823 |     // no packets, which is equally consistent with reduced motion working, with
  1824 |     // no flow mode being active, and with the feature being broken outright.
  1825 |     // So the baseline is measured first, in the same browser, on the same page.
  1826 |     const normalLoads = await openMap(page, "reduced-motion-baseline")
  1827 |     const baseline = await measure()
  1828 | 
  1829 |     await page.emulateMedia({ reducedMotion: "reduce" })
  1830 |     const loads = await openMap(page, "reduced-motion")
  1831 |     const state = await measure()
  1832 | 
  1833 |     report("matrix-reduced-motion", {
  1834 |       baseline: { loads: normalLoads, ...baseline },
  1835 |       reduced: { loads, ...state },
  1836 |       page_errors: pageErrors,
  1837 |     })
  1838 |     await shot(page, "c1-matrix-reduced-motion")
  1839 | 
  1840 |     expect(baseline.honours_query, "the baseline load already reported reduced motion").toBe(false)
  1841 |     expect(state.honours_query, "the browser did not report reduced motion").toBe(true)
  1842 |     // Reduced motion may legitimately render the packets and hold them still,
  1843 |     // or not render them at all. What it must never do is leave them running.
  1844 |     expect(
  1845 |       state.animating,
  1846 |       `reduced motion left ${state.animating} flow packets animating ` +
  1847 |         `(baseline drew ${baseline.packets}, of which ${baseline.animating} animated)`,
> 1848 |     ).toBe(0)
       |       ^ Error: reduced motion left 6 flow packets animating (baseline drew 6, of which 6 animated)
  1849 |     expect(pageErrors, "reduced motion: uncaught page errors").toEqual([])
  1850 |   })
  1851 | })
  1852 | 
  1853 | // ---------------------------------------------------------------------------
  1854 | // Release QA — the egress map on the DEPLOYED C1 build (merge 53549ead).
  1855 | //
  1856 | // Read-only. Everything here is measured against the payload THE SAME PAGE
  1857 | // fetched, so a screen that agrees with itself but not with the graph fails.
  1858 | //
  1859 | // The claims under test are the ones the review named: the IGW continues into
  1860 | // destination nodes; that continuation is drawn DASHED and never animated,
  1861 | // because ACTUAL_TRAFFIC to a NetworkEndpoint plus ROUTES_VIA is not proof a
  1862 | // packet crossed the gateway; the "+N more" disclosure holds the destinations
  1863 | // it offers; panels stack above the map; the Data tier stays clear; a mirrored
  1864 | // relationship is badged once; and the diagnostics stay collapsed by default.
  1865 | // ---------------------------------------------------------------------------
  1866 | test.describe("release QA — egress destinations beyond the IGW", () => {
  1867 |   const RELEASE_VIEWPORTS = [
  1868 |     { name: "1600x900", width: 1600, height: 900 },
  1869 |     { name: "1512x771", width: 1512, height: 771 },
  1870 |     { name: "1366x768", width: 1366, height: 768 },
  1871 |     { name: "1024x720", width: 1024, height: 720 },
  1872 |   ] as const
  1873 | 
  1874 |   /** Every continuation path on the live page, with the treatment the renderer
  1875 |    *  gave it — read off the DOM, not off the payload. */
  1876 |   const LIVE_CONTINUATION = `(() => {
  1877 |     const svg = document.querySelector('[data-testid="topology-flow-overlay"]')
  1878 |     const igw = document.querySelector('[data-flow-id="__igw__"]')
  1879 |     const out = { hasOverlay: !!svg, hasIgw: !!igw, igwRect: null, paths: [], destinations: [] }
  1880 |     if (igw) { const r = igw.getBoundingClientRect(); out.igwRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
  1881 |     for (const n of Array.from(document.querySelectorAll('[data-testid="topology-external-destination-node"], [data-testid="topology-external-destination-unknown"]'))) {
  1882 |       const r = n.getBoundingClientRect()
  1883 |       out.destinations.push({
  1884 |         flowId: n.getAttribute('data-flow-id'),
  1885 |         identity: n.getAttribute('data-identity') || 'unknown-group',
  1886 |         label: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
  1887 |         rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
  1888 |       })
  1889 |     }
  1890 |     if (!svg) return out
  1891 |     for (const g of Array.from(svg.querySelectorAll('g[data-flow-source="__igw__"]'))) {
  1892 |       const target = g.getAttribute('data-flow-target') || ''
  1893 |       if (target.indexOf('extdst:') !== 0) continue
  1894 |       const path = g.querySelector('path[data-flow-line="stroke"]') || g.querySelector('path[d]')
  1895 |       if (!path) continue
  1896 |       const total = path.getTotalLength(); if (!total) continue
  1897 |       const m = path.getScreenCTM(); if (!m) continue
  1898 |       const a = path.getPointAtLength(0).matrixTransform(m)
  1899 |       const b = path.getPointAtLength(total).matrixTransform(m)
  1900 |       const dash = getComputedStyle(path).strokeDasharray
  1901 |       out.paths.push({
  1902 |         target, length: total,
  1903 |         start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
  1904 |         authority: g.getAttribute('data-flow-authority'),
  1905 |         pathBasis: g.getAttribute('data-flow-path-basis'),
  1906 |         motion: g.getAttribute('data-flow-motion'),
  1907 |         dash: dash && dash !== 'none' ? dash : null,
  1908 |         animations: g.querySelectorAll('animate, animateMotion, animateTransform').length,
  1909 |       })
  1910 |     }
  1911 |     return out
  1912 |   })()`
  1913 | 
  1914 |   const TOPMOST = (testid: string): string => `(() => {
  1915 |     const el = document.querySelector('[data-testid="${testid}"]')
  1916 |     if (!el) return null
  1917 |     let n = el, o = 1
  1918 |     while (n && n !== document.documentElement) { o *= Number(getComputedStyle(n).opacity); n = n.parentElement }
  1919 |     const r = el.getBoundingClientRect()
  1920 |     const probes = [[r.left + r.width/2, r.top + 6], [r.left + r.width/2, r.top + r.height/2], [r.left + r.width/2, r.bottom - 6]]
  1921 |     const covered = []
  1922 |     for (const [x, y] of probes) {
  1923 |       const t = document.elementFromPoint(x, y)
  1924 |       if (!t || !(el === t || el.contains(t))) covered.push(t ? (t.getAttribute('data-testid') || t.tagName.toLowerCase()) : 'nothing')
  1925 |     }
  1926 |     return { effectiveOpacity: o, covered, rect: { x: r.left, y: r.top, w: r.width, h: r.height }, inViewport: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 }
  1927 |   })()`
  1928 | 
  1929 |   /** Client-space shapes the LIVE_CONTINUATION probe returns. Named rather
  1930 |    *  than inlined: the probe runs in the browser and its result crosses back
  1931 |    *  as `any`, so these are the only place the shape is written down. */
  1932 |   interface ProbePoint {
  1933 |     x: number
  1934 |     y: number
  1935 |   }
  1936 |   interface ProbeRect {
  1937 |     left: number
  1938 |     top: number
  1939 |     right: number
  1940 |     bottom: number
  1941 |   }
  1942 | 
  1943 |   /** One drawn continuation path and the treatment the renderer gave it. */
  1944 |   interface ProbePath {
  1945 |     target: string
  1946 |     length: number
  1947 |     start: ProbePoint
  1948 |     end: ProbePoint
```