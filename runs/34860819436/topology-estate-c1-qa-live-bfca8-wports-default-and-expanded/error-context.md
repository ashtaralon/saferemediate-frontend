# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> estate map release QA on the deployed C1 frontend >> five reported defects, four viewports, default and expanded
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:1857:7

# Error details

```
Error: 1600x900: focus did not return to the toggle

expect(received).toBe(expected) // Object.is equality

Expected: "topology-external-destinations-toggle"
Received: "topology-external-destinations-details"
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
          - generic [ref=e41]: scored 2026-09-14T15:07:29Z · 0 flagged · posture_correlated_at >= now() - 7d on any workload · VPC vpc-0c39cde96f29f8f4e
          - generic [ref=e42]: Served from cache; not recomputed for this request. · Last updated Sep 14, 2026, 3:07 PM
        - generic [ref=e43]:
          - generic [ref=e44]:
            - generic [ref=e45]: Evidence computed Sep 14, 2026, 3:07 PM
            - generic [ref=e47]: Live graph
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
            - tab "Network topology" [selected] [ref=e78]
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
              - generic [ref=e188]:
                - generic [ref=e189]: 3 workloads
                - generic [ref=e192]: ▸
                - generic [ref=e193]:
                  - generic "NAT nat-0fd7cf8524e62aea9" [ref=e194]:
                    - text: NAT
                    - generic [ref=e195]: nat-0fd7cf8524e62aea9
                  - generic [ref=e198]: ▸
                - generic [ref=e199]:
                  - generic "IGW igw-01b6c643a5c856abe" [ref=e200]:
                    - text: IGW
                    - generic [ref=e201]: igw-01b6c643a5c856abe
                  - generic [ref=e204]: ▸
              - button "External destinations 3 workloads · up to 45 distinct · addresses sampled" [active] [ref=e205]:
                - img [ref=e207]
                - generic [ref=e212]:
                  - generic [ref=e213]: External destinations
                  - generic [ref=e214]: 3 workloads · up to 45 distinct · addresses sampled
          - generic [ref=e215]:
            - generic [ref=e216]: ☁ AWS Cloud · acct 416651950952
            - generic [ref=e217]:
              - generic [ref=e218]: Region · eu-west-1
              - generic [ref=e219]:
                - generic [ref=e220]:
                  - generic [ref=e221]:
                    - generic "vpc-0c39cde96f29f8f4e" [ref=e222]: VPC · vpc-0c39cde96f29f8f4e
                    - generic "7 of 8 workloads in this VPC drop the shared prefix \"cyntro-tb-prod-\" from their chip label — every tooltip still carries the full name" [ref=e223]: cyntro-tb-prod-… ×7
                  - generic [ref=e225]:
                    - generic [ref=e226]:
                      - generic [ref=e227]:
                        - img [ref=e228]
                        - generic [ref=e234]: Load Balancers (2)
                      - generic [ref=e235]:
                        - button "cyntro-tb-prod-alb-int Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e236]:
                          - generic [ref=e238]:
                            - generic [ref=e239]:
                              - generic [ref=e240]: cyntro-tb-prod-alb-int
                              - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e241]: Multi-AZ
                            - generic [ref=e242]: LoadBalancer · arn:aws:elasticloadbalan
                          - generic [ref=e243]: "0"
                        - button "cyntro-tb-prod-alb-pub Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e244]:
                          - generic [ref=e246]:
                            - generic [ref=e247]:
                              - generic [ref=e248]: cyntro-tb-prod-alb-pub
                              - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e249]: Multi-AZ
                            - generic [ref=e250]: LoadBalancer · arn:aws:elasticloadbalan
                          - generic [ref=e251]: "0"
                    - generic [ref=e252]:
                      - generic [ref=e253]:
                        - generic "eu-west-1a" [ref=e254]: Availability Zone · eu-west-1a
                        - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1a · 10.42.0.0/24 · Owner: testbed-webshop" [ref=e255]':
                          - generic [ref=e256]:
                            - generic [ref=e257]: Public · cyntro-tb-prod-public-eu-west-1a
                            - generic [ref=e258]: 10.42.0.0/24
                          - generic "NAT gateway · nat-0fd7cf8524e62aea9 · public 54.229.208.150 · subnet subnet-05472c7cd0d3a7b90 (from vpc_topology.edges)" [ref=e260]:
                            - img [ref=e262]
                            - generic [ref=e265]: NAT GW · nat-0fd7cf8524e62aea9
                          - generic [ref=e266]:
                            - button "quiet posture score …web" [ref=e267]:
                              - generic "quiet posture score" [ref=e268]
                              - generic [ref=e271]: …web
                            - button "quiet posture score cyntro-testbed-webshop-writer" [ref=e272]:
                              - generic "quiet posture score" [ref=e273]
                              - generic [ref=e276]: cyntro-testbed-webshop-writer
                        - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1a · 10.42.10.0/24 · Owner: testbed-webshop" [ref=e277]':
                          - generic [ref=e278]:
                            - generic [ref=e279]: Private · cyntro-tb-prod-app-eu-west-1a
                            - generic [ref=e280]: 10.42.10.0/24
                          - button "quiet posture score ×2 EC2" [ref=e282]:
                            - generic "quiet posture score" [ref=e283]
                            - generic [ref=e288]: ×2
                            - generic [ref=e289]: EC2
                        - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1a · 10.42.20.0/24 · Owner: testbed-webshop" [ref=e290]':
                          - generic [ref=e291]:
                            - generic [ref=e292]: Data · cyntro-tb-prod-data-eu-west-1a
                            - generic [ref=e293]: 10.42.20.0/24
                          - button "quiet posture score …aurora-1" [ref=e295]:
                            - generic "quiet posture score" [ref=e296]
                            - generic [ref=e299]: …aurora-1
                      - generic [ref=e300]:
                        - generic "eu-west-1b" [ref=e301]: Availability Zone · eu-west-1b
                        - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1b · 10.42.1.0/24 · Owner: testbed-webshop" [ref=e302]':
                          - generic [ref=e303]:
                            - generic [ref=e304]: Public · cyntro-tb-prod-public-eu-west-1b
                            - generic [ref=e305]: 10.42.1.0/24
                          - button "quiet posture score …web" [ref=e307]:
                            - generic "quiet posture score" [ref=e308]
                            - generic [ref=e311]: …web
                        - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1b · 10.42.11.0/24 · Owner: testbed-webshop" [ref=e312]':
                          - generic [ref=e313]:
                            - generic [ref=e314]: Private · cyntro-tb-prod-app-eu-west-1b
                            - generic [ref=e315]: 10.42.11.0/24
                          - button "quiet posture score …app" [ref=e317]:
                            - generic "quiet posture score" [ref=e318]
                            - generic [ref=e321]: …app
                        - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1b · 10.42.21.0/24 · Owner: testbed-webshop" [ref=e322]':
                          - generic [ref=e323]:
                            - generic [ref=e324]: Data · cyntro-tb-prod-data-eu-west-1b
                            - generic [ref=e325]: 10.42.21.0/24
                          - button "quiet posture score …aurora-0" [ref=e327]:
                            - generic "quiet posture score" [ref=e328]
                            - generic [ref=e331]: …aurora-0
                - generic [ref=e332]:
                  - generic [ref=e333]: VPC boundary
                  - generic [ref=e334]:
                    - generic [ref=e335]: ↑ Internet
                    - generic [ref=e336]:
                      - button "IGW igw-01b6c643a5c856abe" [ref=e337]:
                        - img [ref=e339]
                        - generic [ref=e342]: IGW
                        - generic [ref=e343]: igw-01b6c643a5c856abe
                      - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e344]: "egress: 3 workloads"
                  - generic [ref=e346]:
                    - generic [ref=e347]: Endpoints (1)
                    - generic [ref=e348]:
                      - button "VPCE GW Amazon S3" [ref=e349]:
                        - img [ref=e351]
                        - generic [ref=e355]: VPCE
                        - generic [ref=e356]: GW
                        - generic [ref=e357]: Amazon S3
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e358]: "use: not observed"
                - generic [ref=e360]:
                  - generic [ref=e361]:
                    - generic [ref=e362]:
                      - generic [ref=e363]: Lambda runtime (6)
                      - generic [ref=e364]:
                        - text: outside subnet grid · 6 outside VPC (verified)
                        - generic "12 of 12 chips omit this shared prefix" [ref=e365]: · cyntro-tb-prod-consumer-… ×12
                      - button "S3 traffic from 4 of 6 functions" [ref=e367]
                    - generic [ref=e368]:
                      - generic [ref=e369]: Triggers (6)
                      - generic [ref=e370]:
                        - button "quiet posture score …daily" [ref=e371]:
                          - generic "quiet posture score" [ref=e372]
                          - generic [ref=e375]: …daily
                        - button "quiet posture score …every_6h" [ref=e376]:
                          - generic "quiet posture score" [ref=e377]
                          - generic [ref=e380]: …every_6h
                        - button "quiet posture score …frequent" [ref=e381]:
                          - generic "quiet posture score" [ref=e382]
                          - generic [ref=e385]: …frequent
                        - button "quiet posture score …monthly" [ref=e386]:
                          - generic "quiet posture score" [ref=e387]
                          - generic [ref=e390]: …monthly
                        - button "quiet posture score …nightly_burst" [ref=e391]:
                          - generic "quiet posture score" [ref=e392]
                          - generic [ref=e395]: …nightly_burst
                        - button "quiet posture score …weekly" [ref=e396]:
                          - generic "quiet posture score" [ref=e397]
                          - generic [ref=e400]: …weekly
                    - generic [ref=e402]:
                      - button "quiet posture score …monthly" [ref=e403]:
                        - generic "quiet posture score" [ref=e404]
                        - generic [ref=e407]: …monthly
                      - button "quiet posture score …weekly" [ref=e408]:
                        - generic "quiet posture score" [ref=e409]
                        - generic [ref=e412]: …weekly
                      - button "quiet posture score …daily" [ref=e413]:
                        - generic "quiet posture score" [ref=e414]
                        - generic [ref=e417]: …daily
                      - button "quiet posture score …every_6h" [ref=e418]:
                        - generic "quiet posture score" [ref=e419]
                        - generic [ref=e422]: …every_6h
                      - button "quiet posture score …frequent" [ref=e423]:
                        - generic "quiet posture score" [ref=e424]
                        - generic [ref=e427]: …frequent
                      - button "quiet posture score …nightly_burst" [ref=e428]:
                        - generic "quiet posture score" [ref=e429]
                        - generic [ref=e432]: …nightly_burst
                  - generic [ref=e434]:
                    - generic [ref=e435]:
                      - text: Regional · KMS / S3 / DDB (7)
                      - generic "3 of 7 chips omit this shared prefix" [ref=e436]: arn:aws:kms:eu-west-1:416651950952:key/… ×3
                    - generic [ref=e438]:
                      - button "quiet posture score cyntro-evidence-testbed-webshop-950952" [ref=e439]:
                        - generic "quiet posture score" [ref=e440]
                        - generic [ref=e443]: cyntro-evidence-testbed-webshop-950952
                      - button "quiet posture score cyntro-ingest-head-testbed-webshop" [ref=e444]:
                        - generic "quiet posture score" [ref=e445]
                        - generic [ref=e448]: cyntro-ingest-head-testbed-webshop
                      - button "quiet posture score cyntro-tb-prod-appdata-1c8276f5" [ref=e449]:
                        - generic "quiet posture score" [ref=e450]
                        - generic [ref=e453]: cyntro-tb-prod-appdata-1c8276f5
                      - button "quiet posture score …76bd5a63-602c-471e-b085-1df8b04128b2" [ref=e454]:
                        - generic "quiet posture score" [ref=e455]
                        - generic [ref=e458]: …76bd5a63-602c-471e-b085-1df8b04128b2
                      - button "quiet posture score …d729e441-b319-4859-9974-9bd12d8e341a" [ref=e459]:
                        - generic "quiet posture score" [ref=e460]
                        - generic [ref=e463]: …d729e441-b319-4859-9974-9bd12d8e341a
                      - button "quiet posture score …1a88e19d-2eb4-4bf7-a16d-35152bc8a453" [ref=e464]:
                        - generic "quiet posture score" [ref=e465]
                        - generic [ref=e468]: …1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                      - button "quiet posture score cyntro-tb-prod-logs-1c8276f5 S3" [ref=e469]:
                        - generic "quiet posture score" [ref=e470]
                        - generic [ref=e473]: cyntro-tb-prod-logs-1c8276f5
                        - generic [ref=e474]: S3
              - button "Logical groups · members carry the placement (6) Show members" [ref=e476]:
                - generic [ref=e477]: Logical groups · members carry the placement (6)
                - generic [ref=e478]: Show members
          - generic [ref=e479]:
            - button "Diagnostics 6 serverless · 38 flows ▴" [ref=e480]:
              - generic [ref=e481]: Diagnostics
              - generic [ref=e482]: 6 serverless · 38 flows ▴
            - generic [ref=e483]:
              - generic [ref=e484]:
                - generic [ref=e485]: Serverless compute (6)
                - generic [ref=e486]:
                  - button "cyntro-tb-prod-consumer-monthly Lambda · arn:aws:lambda:eu-west-1 15" [ref=e487]:
                    - generic [ref=e489]:
                      - generic [ref=e491]: cyntro-tb-prod-consumer-monthly
                      - generic [ref=e492]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e493]: "15"
                  - button "cyntro-tb-prod-consumer-weekly Lambda · arn:aws:lambda:eu-west-1 15" [ref=e494]:
                    - generic [ref=e496]:
                      - generic [ref=e498]: cyntro-tb-prod-consumer-weekly
                      - generic [ref=e499]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e500]: "15"
                  - button "cyntro-tb-prod-consumer-daily Lambda · arn:aws:lambda:eu-west-1 4" [ref=e501]:
                    - generic [ref=e503]:
                      - generic [ref=e505]: cyntro-tb-prod-consumer-daily
                      - generic [ref=e506]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e507]: "4"
                  - button "cyntro-tb-prod-consumer-every_6h Lambda · arn:aws:lambda:eu-west-1 4" [ref=e508]:
                    - generic [ref=e510]:
                      - generic [ref=e512]: cyntro-tb-prod-consumer-every_6h
                      - generic [ref=e513]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e514]: "4"
                  - button "cyntro-tb-prod-consumer-frequent Lambda · arn:aws:lambda:eu-west-1 4" [ref=e515]:
                    - generic [ref=e517]:
                      - generic [ref=e519]: cyntro-tb-prod-consumer-frequent
                      - generic [ref=e520]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e521]: "4"
                  - button "cyntro-tb-prod-consumer-nightly_burst Lambda · arn:aws:lambda:eu-west-1 4" [ref=e522]:
                    - generic [ref=e524]:
                      - generic [ref=e526]: cyntro-tb-prod-consumer-nightly_burst
                      - generic [ref=e527]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e528]: "4"
              - generic [ref=e529]:
                - generic [ref=e530]:
                  - generic [ref=e531]: Observed traffic — animated arrows above
                  - generic [ref=e532]: 38 flows · 25 internal · 10 edge-service · 0 vpce · 0 database · 3 egress
                - generic [ref=e533]:
                  - generic [ref=e534]:
                    - generic [ref=e535]: cyntro-tb-prod-consumer-nightly_burst
                    - generic [ref=e536]: →
                    - generic [ref=e537]: cyntro-tb-prod-appdata-1c8276f5
                    - generic [ref=e538]: ACTUAL_S3_ACCESS
                  - generic [ref=e539]:
                    - generic [ref=e540]: cyntro-tb-prod-consumer-daily
                    - generic [ref=e541]: →
                    - generic [ref=e542]: cyntro-tb-prod-appdata-1c8276f5
                    - generic [ref=e543]: ACTUAL_S3_ACCESS
                  - generic [ref=e544]:
                    - generic [ref=e545]: cyntro-tb-prod-consumer-frequent
                    - generic [ref=e546]: →
                    - generic [ref=e547]: cyntro-tb-prod-appdata-1c8276f5
                    - generic [ref=e548]: ACTUAL_S3_ACCESS
                  - generic [ref=e549]:
                    - generic [ref=e550]: cyntro-tb-prod-consumer-every_6h
                    - generic [ref=e551]: →
                    - generic [ref=e552]: cyntro-tb-prod-appdata-1c8276f5
                    - generic [ref=e553]: ACTUAL_S3_ACCESS
                  - generic [ref=e554]:
                    - generic [ref=e555]: cyntro-tb-prod-app
                    - generic [ref=e556]: →
                    - generic [ref=e557]: Internet (via IGW)
                    - generic [ref=e558]: egress · 32 (ext 32)
                  - generic [ref=e559]:
                    - generic [ref=e560]: cyntro-tb-prod-loadgen
                    - generic [ref=e561]: →
                    - generic [ref=e562]: Internet (via IGW)
                    - generic [ref=e563]: egress · 3 (ext 3)
                  - generic [ref=e564]:
                    - generic [ref=e565]: cyntro-tb-prod-app
                    - generic [ref=e566]: →
                    - generic [ref=e567]: Internet (via IGW)
                    - generic [ref=e568]: egress · 10 (ext 10)
                  - generic [ref=e569]:
                    - generic [ref=e570]: cyntro-testbed-webshop-writer
                    - generic [ref=e571]: →
                    - generic [ref=e572]: cyntro-testbed-webshop
                    - generic [ref=e573]: MEMBER_OF_CLUSTER
                  - generic [ref=e574]:
                    - generic [ref=e575]: cyntro-tb-prod-aurora-1
                    - generic [ref=e576]: →
                    - generic [ref=e577]: cyntro-tb-prod-aurora
                    - generic [ref=e578]: MEMBER_OF_CLUSTER
                  - generic [ref=e579]:
                    - generic [ref=e580]: cyntro-tb-prod-aurora-0
                    - generic [ref=e581]: →
                    - generic [ref=e582]: cyntro-tb-prod-aurora
                    - generic [ref=e583]: MEMBER_OF_CLUSTER
                  - generic [ref=e584]:
                    - generic [ref=e585]: cyntro-tb-prod-tg-app
                    - generic [ref=e586]: →
                    - generic [ref=e587]: cyntro-tb-prod-app
                    - generic [ref=e588]: TARGETS
                  - generic [ref=e589]:
                    - generic [ref=e590]: cyntro-tb-prod-tg-app
                    - generic [ref=e591]: →
                    - generic [ref=e592]: cyntro-tb-prod-app
                    - generic [ref=e593]: TARGETS
                  - generic [ref=e594]: + 26 more flows
              - generic [ref=e595]:
                - generic [ref=e596]: Encoding
                - generic [ref=e597]:
                  - generic [ref=e600]: Worst (carmine halo + pulse)
                  - generic [ref=e603]: High / elevated (ring only)
                  - generic [ref=e604]:
                    - generic [ref=e605]: ♛
                    - generic [ref=e606]: Crown-jewel halo
                  - generic [ref=e609]: Clean · remediated (teal ring)
                  - generic [ref=e612]: Stale (dimmed)
                  - generic [ref=e615]: Coverage gap (not collected)
          - img:
            - generic:
              - generic:
                - generic: Egress · 3 flows
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
      - complementary [ref=e616]:
        - complementary [ref=e617]:
          - generic [ref=e618]:
            - generic [ref=e619]:
              - heading "Service index" [level=2] [ref=e620]
              - generic [ref=e621]: "35"
            - generic [ref=e622]:
              - img [ref=e623]
              - searchbox "Find service in topology" [ref=e626]
            - button "Filters" [ref=e629]:
              - img [ref=e630]
              - text: Filters
          - list [ref=e632]:
            - listitem [ref=e633]:
              - button "cyntro-tb-prod-appdata-1c8276f5 Current graph data S3 · global · regional 4 in · 1 out Aug 20, 04:53 PM" [ref=e634]:
                - generic [ref=e635]:
                  - img [ref=e637]
                  - generic [ref=e639]:
                    - generic [ref=e640]:
                      - generic [ref=e641]: cyntro-tb-prod-appdata-1c8276f5
                      - generic "Current graph data" [ref=e642]
                    - generic [ref=e644]: S3 · global · regional
                    - generic [ref=e645]:
                      - generic [ref=e646]: 4 in · 1 out
                      - generic [ref=e647]:
                        - img [ref=e648]
                        - text: Aug 20, 04:53 PM
            - listitem [ref=e651]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2 Current graph data KMSKey · global · regional 3 in · 0 out Sep 11, 07:35 PM" [ref=e652]:
                - generic [ref=e653]:
                  - img [ref=e655]
                  - generic [ref=e657]:
                    - generic [ref=e658]:
                      - generic [ref=e659]: arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2
                      - generic "Current graph data" [ref=e660]
                    - generic [ref=e662]: KMSKey · global · regional
                    - generic [ref=e663]:
                      - generic [ref=e664]: 3 in · 0 out
                      - generic [ref=e665]:
                        - img [ref=e666]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e669]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1b · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e670]:
                - generic [ref=e671]:
                  - img [ref=e673]
                  - generic [ref=e675]:
                    - generic [ref=e676]:
                      - generic [ref=e677]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e678]
                    - generic [ref=e680]: EC2 · eu-west-1b · app
                    - generic [ref=e681]:
                      - generic [ref=e682]: 2 in · 1 out
                      - generic [ref=e683]:
                        - img [ref=e684]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e687]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1a · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e688]:
                - generic [ref=e689]:
                  - img [ref=e691]
                  - generic [ref=e693]:
                    - generic [ref=e694]:
                      - generic [ref=e695]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e696]
                    - generic [ref=e698]: EC2 · eu-west-1a · app
                    - generic [ref=e699]:
                      - generic [ref=e700]: 2 in · 1 out
                      - generic [ref=e701]:
                        - img [ref=e702]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e705]:
              - button "cyntro-tb-prod-consumer-daily Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e706]:
                - generic [ref=e707]:
                  - img [ref=e709]
                  - generic [ref=e711]:
                    - generic [ref=e712]:
                      - generic [ref=e713]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e714]
                    - generic [ref=e716]: Lambda · eu-west-1 · regional
                    - generic [ref=e717]:
                      - generic [ref=e718]: 2 in · 1 out
                      - generic [ref=e719]:
                        - img [ref=e720]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e723]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e724]:
                - generic [ref=e725]:
                  - img [ref=e727]
                  - generic [ref=e729]:
                    - generic [ref=e730]:
                      - generic [ref=e731]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e732]
                    - generic [ref=e734]: Lambda · eu-west-1 · regional
                    - generic [ref=e735]:
                      - generic [ref=e736]: 2 in · 1 out
                      - generic [ref=e737]:
                        - img [ref=e738]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e741]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 1, 11:00 AM" [ref=e742]:
                - generic [ref=e743]:
                  - img [ref=e745]
                  - generic [ref=e747]:
                    - generic [ref=e748]:
                      - generic [ref=e749]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e750]
                    - generic [ref=e752]: Lambda · eu-west-1 · regional
                    - generic [ref=e753]:
                      - generic [ref=e754]: 2 in · 1 out
                      - generic [ref=e755]:
                        - img [ref=e756]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e759]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e760]:
                - generic [ref=e761]:
                  - img [ref=e763]
                  - generic [ref=e765]:
                    - generic [ref=e766]:
                      - generic [ref=e767]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e768]
                    - generic [ref=e770]: Lambda · eu-west-1 · regional
                    - generic [ref=e771]:
                      - generic [ref=e772]: 2 in · 1 out
                      - generic [ref=e773]:
                        - img [ref=e774]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e777]:
              - button "cyntro-tb-prod-tg-app Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e778]:
                - generic [ref=e779]:
                  - img [ref=e781]
                  - generic [ref=e783]:
                    - generic [ref=e784]:
                      - generic [ref=e785]: cyntro-tb-prod-tg-app
                      - generic "Current graph data" [ref=e786]
                    - generic [ref=e788]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e789]:
                      - generic [ref=e790]: 1 in · 2 out
                      - generic [ref=e791]:
                        - img [ref=e792]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e795]:
              - button "cyntro-tb-prod-tg-web Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e796]:
                - generic [ref=e797]:
                  - img [ref=e799]
                  - generic [ref=e801]:
                    - generic [ref=e802]:
                      - generic [ref=e803]: cyntro-tb-prod-tg-web
                      - generic "Current graph data" [ref=e804]
                    - generic [ref=e806]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e807]:
                      - generic [ref=e808]: 1 in · 2 out
                      - generic [ref=e809]:
                        - img [ref=e810]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e813]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453 Current graph data KMSKey · global · regional 2 in · 0 out Sep 11, 07:35 PM" [ref=e814]:
                - generic [ref=e815]:
                  - img [ref=e817]
                  - generic [ref=e819]:
                    - generic [ref=e820]:
                      - generic [ref=e821]: arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                      - generic "Current graph data" [ref=e822]
                    - generic [ref=e824]: KMSKey · global · regional
                    - generic [ref=e825]:
                      - generic [ref=e826]: 2 in · 0 out
                      - generic [ref=e827]:
                        - img [ref=e828]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e831]:
              - button "cyntro-tb-prod-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e832]:
                - generic [ref=e833]:
                  - img [ref=e835]
                  - generic [ref=e837]:
                    - generic [ref=e838]:
                      - generic [ref=e839]: cyntro-tb-prod-asg-app
                      - generic "Current graph data" [ref=e840]
                    - generic [ref=e842]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e843]:
                      - generic [ref=e844]: 0 in · 2 out
                      - generic [ref=e845]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e848]:
              - button "cyntro-tb-prod-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e849]:
                - generic [ref=e850]:
                  - img [ref=e852]
                  - generic [ref=e854]:
                    - generic [ref=e855]:
                      - generic [ref=e856]: cyntro-tb-prod-asg-web
                      - generic "Current graph data" [ref=e857]
                    - generic [ref=e859]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e860]:
                      - generic [ref=e861]: 0 in · 2 out
                      - generic [ref=e862]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e865]:
              - button "cyntro-tb-prod-aurora Current graph data RDS · eu-west-1 · regional 2 in · 0 out Sep 11, 07:35 PM" [ref=e866]:
                - generic [ref=e867]:
                  - img [ref=e869]
                  - generic [ref=e871]:
                    - generic [ref=e872]:
                      - generic [ref=e873]: cyntro-tb-prod-aurora
                      - generic "Current graph data" [ref=e874]
                    - generic [ref=e876]: RDS · eu-west-1 · regional
                    - generic [ref=e877]:
                      - generic [ref=e878]: 2 in · 0 out
                      - generic [ref=e879]:
                        - img [ref=e880]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e883]:
              - button "cyntro-tb-prod-aurora-0 Current graph data RDS · eu-west-1b · data 0 in · 2 out Sep 11, 07:35 PM" [ref=e884]:
                - generic [ref=e885]:
                  - img [ref=e887]
                  - generic [ref=e889]:
                    - generic [ref=e890]:
                      - generic [ref=e891]: cyntro-tb-prod-aurora-0
                      - generic "Current graph data" [ref=e892]
                    - generic [ref=e894]: RDS · eu-west-1b · data
                    - generic [ref=e895]:
                      - generic [ref=e896]: 0 in · 2 out
                      - generic [ref=e897]:
                        - img [ref=e898]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e901]:
              - button "cyntro-tb-prod-aurora-1 Current graph data RDS · eu-west-1a · data 0 in · 2 out Sep 11, 07:35 PM" [ref=e902]:
                - generic [ref=e903]:
                  - img [ref=e905]
                  - generic [ref=e907]:
                    - generic [ref=e908]:
                      - generic [ref=e909]: cyntro-tb-prod-aurora-1
                      - generic "Current graph data" [ref=e910]
                    - generic [ref=e912]: RDS · eu-west-1a · data
                    - generic [ref=e913]:
                      - generic [ref=e914]: 0 in · 2 out
                      - generic [ref=e915]:
                        - img [ref=e916]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e919]:
              - button "cyntro-tb-prod-consumer-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e920]:
                - generic [ref=e921]:
                  - img [ref=e923]
                  - generic [ref=e925]:
                    - generic [ref=e926]:
                      - generic [ref=e927]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e928]
                    - generic [ref=e930]: EventBridge · eu-west-1 · regional
                    - generic [ref=e931]:
                      - generic [ref=e932]: 0 in · 2 out
                      - generic [ref=e933]:
                        - img [ref=e934]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e937]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e938]:
                - generic [ref=e939]:
                  - img [ref=e941]
                  - generic [ref=e943]:
                    - generic [ref=e944]:
                      - generic [ref=e945]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e946]
                    - generic [ref=e948]: EventBridge · eu-west-1 · regional
                    - generic [ref=e949]:
                      - generic [ref=e950]: 0 in · 2 out
                      - generic [ref=e951]:
                        - img [ref=e952]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e955]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Sep 1, 11:00 AM" [ref=e956]:
                - generic [ref=e957]:
                  - img [ref=e959]
                  - generic [ref=e961]:
                    - generic [ref=e962]:
                      - generic [ref=e963]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e964]
                    - generic [ref=e966]: EventBridge · eu-west-1 · regional
                    - generic [ref=e967]:
                      - generic [ref=e968]: 0 in · 2 out
                      - generic [ref=e969]:
                        - img [ref=e970]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e973]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e974]:
                - generic [ref=e975]:
                  - img [ref=e977]
                  - generic [ref=e979]:
                    - generic [ref=e980]:
                      - generic [ref=e981]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e982]
                    - generic [ref=e984]: Lambda · eu-west-1 · regional
                    - generic [ref=e985]:
                      - generic [ref=e986]: 2 in · 0 out
                      - generic [ref=e987]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e990]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e991]:
                - generic [ref=e992]:
                  - img [ref=e994]
                  - generic [ref=e996]:
                    - generic [ref=e997]:
                      - generic [ref=e998]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e999]
                    - generic [ref=e1001]: EventBridge · eu-west-1 · regional
                    - generic [ref=e1002]:
                      - generic [ref=e1003]: 0 in · 2 out
                      - generic [ref=e1004]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1007]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e1008]:
                - generic [ref=e1009]:
                  - img [ref=e1011]
                  - generic [ref=e1013]:
                    - generic [ref=e1014]:
                      - generic [ref=e1015]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e1016]
                    - generic [ref=e1018]: EventBridge · eu-west-1 · regional
                    - generic [ref=e1019]:
                      - generic [ref=e1020]: 0 in · 2 out
                      - generic [ref=e1021]:
                        - img [ref=e1022]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e1025]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out Aug 29, 11:00 AM" [ref=e1026]:
                - generic [ref=e1027]:
                  - img [ref=e1029]
                  - generic [ref=e1031]:
                    - generic [ref=e1032]:
                      - generic [ref=e1033]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e1034]
                    - generic [ref=e1036]: Lambda · eu-west-1 · regional
                    - generic [ref=e1037]:
                      - generic [ref=e1038]: 2 in · 0 out
                      - generic [ref=e1039]:
                        - img [ref=e1040]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e1043]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 29, 11:00 AM" [ref=e1044]:
                - generic [ref=e1045]:
                  - img [ref=e1047]
                  - generic [ref=e1049]:
                    - generic [ref=e1050]:
                      - generic [ref=e1051]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e1052]
                    - generic [ref=e1054]: EventBridge · eu-west-1 · regional
                    - generic [ref=e1055]:
                      - generic [ref=e1056]: 0 in · 2 out
                      - generic [ref=e1057]:
                        - img [ref=e1058]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e1061]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1a · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e1062]:
                - generic [ref=e1063]:
                  - img [ref=e1065]
                  - generic [ref=e1067]:
                    - generic [ref=e1068]:
                      - generic [ref=e1069]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e1070]
                    - generic [ref=e1072]: EC2 · eu-west-1a · web
                    - generic [ref=e1073]:
                      - generic [ref=e1074]: 2 in · 0 out
                      - generic [ref=e1075]:
                        - img [ref=e1076]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e1079]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1b · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e1080]:
                - generic [ref=e1081]:
                  - img [ref=e1083]
                  - generic [ref=e1085]:
                    - generic [ref=e1086]:
                      - generic [ref=e1087]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e1088]
                    - generic [ref=e1090]: EC2 · eu-west-1b · web
                    - generic [ref=e1091]:
                      - generic [ref=e1092]: 2 in · 0 out
                      - generic [ref=e1093]:
                        - img [ref=e1094]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e1097]:
              - button "cyntro-testbed-webshop-writer Current graph data Neptune · eu-west-1a · web 0 in · 2 out Sep 11, 07:35 PM" [ref=e1098]:
                - generic [ref=e1099]:
                  - img [ref=e1101]
                  - generic [ref=e1103]:
                    - generic [ref=e1104]:
                      - generic [ref=e1105]: cyntro-testbed-webshop-writer
                      - generic "Current graph data" [ref=e1106]
                    - generic [ref=e1108]: Neptune · eu-west-1a · web
                    - generic [ref=e1109]:
                      - generic [ref=e1110]: 0 in · 2 out
                      - generic [ref=e1111]:
                        - img [ref=e1112]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e1115]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a Current graph data KMSKey · global · regional 1 in · 0 out No runtime timestamp" [ref=e1116]:
                - generic [ref=e1117]:
                  - img [ref=e1119]
                  - generic [ref=e1121]:
                    - generic [ref=e1122]:
                      - generic [ref=e1123]: arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a
                      - generic "Current graph data" [ref=e1124]
                    - generic [ref=e1126]: KMSKey · global · regional
                    - generic [ref=e1127]:
                      - generic [ref=e1128]: 1 in · 0 out
                      - generic [ref=e1129]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1132]:
              - button "cyntro-evidence-testbed-webshop-950952 Current graph data S3 · global · regional 0 in · 1 out No runtime timestamp" [ref=e1133]:
                - generic [ref=e1134]:
                  - img [ref=e1136]
                  - generic [ref=e1138]:
                    - generic [ref=e1139]:
                      - generic [ref=e1140]: cyntro-evidence-testbed-webshop-950952
                      - generic "Current graph data" [ref=e1141]
                    - generic [ref=e1143]: S3 · global · regional
                    - generic [ref=e1144]:
                      - generic [ref=e1145]: 0 in · 1 out
                      - generic [ref=e1146]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1149]:
              - button "cyntro-ingest-head-testbed-webshop Current graph data DynamoDB · eu-west-1 · regional 0 in · 1 out No runtime timestamp" [ref=e1150]:
                - generic [ref=e1151]:
                  - img [ref=e1153]
                  - generic [ref=e1155]:
                    - generic [ref=e1156]:
                      - generic [ref=e1157]: cyntro-ingest-head-testbed-webshop
                      - generic "Current graph data" [ref=e1158]
                    - generic [ref=e1160]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1161]:
                      - generic [ref=e1162]: 0 in · 1 out
                      - generic [ref=e1163]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1166]:
              - button "cyntro-tb-prod-alb-int Current graph data LoadBalancer · eu-west-1a · app 0 in · 1 out No runtime timestamp" [ref=e1167]:
                - generic [ref=e1168]:
                  - img [ref=e1170]
                  - generic [ref=e1172]:
                    - generic [ref=e1173]:
                      - generic [ref=e1174]: cyntro-tb-prod-alb-int
                      - generic "Current graph data" [ref=e1175]
                    - generic [ref=e1177]: LoadBalancer · eu-west-1a · app
                    - generic [ref=e1178]:
                      - generic [ref=e1179]: 0 in · 1 out
                      - generic [ref=e1180]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1183]:
              - button "cyntro-tb-prod-alb-pub Current graph data LoadBalancer · eu-west-1b · web 0 in · 1 out No runtime timestamp" [ref=e1184]:
                - generic [ref=e1185]:
                  - img [ref=e1187]
                  - generic [ref=e1189]:
                    - generic [ref=e1190]:
                      - generic [ref=e1191]: cyntro-tb-prod-alb-pub
                      - generic "Current graph data" [ref=e1192]
                    - generic [ref=e1194]: LoadBalancer · eu-west-1b · web
                    - generic [ref=e1195]:
                      - generic [ref=e1196]: 0 in · 1 out
                      - generic [ref=e1197]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1200]:
              - button "cyntro-tb-prod-loadgen Current graph data EC2 · eu-west-1a · app 0 in · 1 out Aug 18, 06:57 PM" [ref=e1201]:
                - generic [ref=e1202]:
                  - img [ref=e1204]
                  - generic [ref=e1206]:
                    - generic [ref=e1207]:
                      - generic [ref=e1208]: cyntro-tb-prod-loadgen
                      - generic "Current graph data" [ref=e1209]
                    - generic [ref=e1211]: EC2 · eu-west-1a · app
                    - generic [ref=e1212]:
                      - generic [ref=e1213]: 0 in · 1 out
                      - generic [ref=e1214]:
                        - img [ref=e1215]
                        - text: Aug 18, 06:57 PM
            - listitem [ref=e1218]:
              - button "cyntro-testbed-webshop Current graph data Neptune · eu-west-1 · regional 1 in · 0 out Sep 11, 07:35 PM" [ref=e1219]:
                - generic [ref=e1220]:
                  - img [ref=e1222]
                  - generic [ref=e1224]:
                    - generic [ref=e1225]:
                      - generic [ref=e1226]: cyntro-testbed-webshop
                      - generic "Current graph data" [ref=e1227]
                    - generic [ref=e1229]: Neptune · eu-west-1 · regional
                    - generic [ref=e1230]:
                      - generic [ref=e1231]: 1 in · 0 out
                      - generic [ref=e1232]:
                        - img [ref=e1233]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e1236]:
              - button "cyntro-tb-prod-logs-1c8276f5 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp" [ref=e1237]:
                - generic [ref=e1238]:
                  - img [ref=e1240]
                  - generic [ref=e1243]:
                    - generic [ref=e1244]:
                      - generic [ref=e1245]: cyntro-tb-prod-logs-1c8276f5
                      - generic "Current graph data" [ref=e1246]
                    - generic [ref=e1248]: S3 · global · regional
                    - generic [ref=e1249]:
                      - generic [ref=e1250]: 0 in · 0 out
                      - generic [ref=e1251]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1254]:
      - text: Live read from
      - generic [ref=e1255]: /api/topology-risk/testbed-webshop
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1256]
```

# Test source

```ts
  2083 |         }
  2084 |         const cells = Array.from(document.querySelectorAll('[data-tier="data"]'))
  2085 |         const overlapWith = (r: DOMRect | null) =>
  2086 |           !r
  2087 |             ? 0
  2088 |             : cells.reduce((worst, c) => {
  2089 |                 const b = c.getBoundingClientRect()
  2090 |                 const w = Math.min(r.right, b.right) - Math.max(r.left, b.left)
  2091 |                 const h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)
  2092 |                 return Math.max(worst, w > 0 && h > 0 ? Math.round(w * h) : 0)
  2093 |               }, 0)
  2094 |         const svg = document.querySelector('[data-testid="topology-flow-overlay"]')
  2095 |         const o = svg?.getBoundingClientRect() ?? null
  2096 |         const escaped: string[] = []
  2097 |         if (o) {
  2098 |           for (const g of Array.from(document.querySelectorAll('[data-testid="topology-flow-badge"]'))) {
  2099 |             const r = g.getBoundingClientRect()
  2100 |             if (r.width === 0 && r.height === 0) continue
  2101 |             if (r.left < o.left - 1 || r.right > o.right + 1 || r.top < o.top - 1 || r.bottom > o.bottom + 1) {
  2102 |               escaped.push((g.querySelector("text")?.textContent ?? "").trim().slice(0, 30))
  2103 |             }
  2104 |           }
  2105 |         }
  2106 |         const users = rect('[data-testid="topology-users-node"]')
  2107 |         const strip = rect('[data-testid="topology-users-internet-strip"]')
  2108 |         return {
  2109 |           data_cells: cells.length,
  2110 |           band_over_data: overlapWith(rect('[data-testid="topology-logical-group-band"]')),
  2111 |           external_over_data: overlapWith(rect('[data-testid="topology-external-destinations"]')),
  2112 |           badges_outside_overlay: escaped,
  2113 |           users_clipped: users && strip ? users.left < strip.left - 1 || users.left < -1 : false,
  2114 |           strip_width: strip ? Math.round(strip.width) : null,
  2115 |         }
  2116 |       })
  2117 |       expect(geom.data_cells, `${vp.name}: the map draws a data tier`).toBeGreaterThan(0)
  2118 |       expect(geom.band_over_data, `${vp.name}: the logical-group band covers the data tier`).toBe(0)
  2119 |       expect(geom.external_over_data, `${vp.name}: the external node covers the data tier`).toBe(0)
  2120 |       expect(geom.badges_outside_overlay, `${vp.name}: flow badges outside the map`).toEqual([])
  2121 |       expect(geom.users_clipped, `${vp.name}: the Users block is clipped`).toBe(false)
  2122 |       await shot(page, `c1-release-default-${vp.name}`)
  2123 | 
  2124 |       // expanded
  2125 |       let expanded: Record<string, unknown> | null = null
  2126 |       if (await external.count()) {
  2127 |         await external.getByTestId("topology-external-destinations-toggle").click()
  2128 |         const panel = page.getByTestId("topology-external-destinations-details")
  2129 |         await expect(panel).toBeVisible()
  2130 |         await page
  2131 |           .waitForFunction(
  2132 |             `(() => {
  2133 |               const el = document.querySelector('[data-testid="topology-external-destinations-details"]')
  2134 |               if (!el) return false
  2135 |               let n = el, p = 1
  2136 |               while (n && n !== document.documentElement) { p *= Number(getComputedStyle(n).opacity); n = n.parentElement }
  2137 |               const r = el.getBoundingClientRect()
  2138 |               const probes = [[r.left + r.width/2, r.top + 6], [r.left + r.width/2, r.top + r.height/2], [r.left + r.width/2, r.bottom - 6]]
  2139 |               const covered = probes.filter(([x,y]) => { const t = document.elementFromPoint(x,y); return !t || !(el === t || el.contains(t)) })
  2140 |               return p >= 0.999 && covered.length === 0
  2141 |             })()`,
  2142 |             undefined,
  2143 |             { timeout: 15_000 },
  2144 |           )
  2145 |           .catch(() => {
  2146 |             throw new Error(`${vp.name}: the detail panel never settled opaque and on top`)
  2147 |           })
  2148 |         expanded = await page.evaluate(vpArg => {
  2149 |           const p = document.querySelector('[data-testid="topology-external-destinations-details"]')!
  2150 |           const strip = document.querySelector('[data-testid="topology-users-internet-strip"]')
  2151 |           const r = p.getBoundingClientRect()
  2152 |           const legs = Array.from(p.querySelectorAll('[data-testid="topology-external-destination-leg"]'))
  2153 |           const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize)
  2154 |           return {
  2155 |             inside_viewport:
  2156 |               r.left >= -1 && r.top >= -1 && r.right <= vpArg.width + 1 && r.bottom <= vpArg.height + 1,
  2157 |             width: Math.round(r.width),
  2158 |             caption_px: px(p.querySelector("p")!),
  2159 |             min_leg_px: legs.length ? Math.min(...legs.map(px)) : null,
  2160 |             clipped_legs: legs.filter(el => el.scrollWidth > el.clientWidth + 1).length,
  2161 |             legs: legs.length,
  2162 |             strip_width: strip ? Math.round(strip.getBoundingClientRect().width) : null,
  2163 |           }
  2164 |         }, { width: vp.width, height: vp.height })
  2165 |         expect(expanded!.inside_viewport, `${vp.name}: the panel leaves the viewport`).toBe(true)
  2166 |         expect(expanded!.width as number, `${vp.name}: the panel is too narrow to read`).toBeGreaterThanOrEqual(260)
  2167 |         expect(expanded!.caption_px as number, `${vp.name}: panel caption below 11px`).toBeGreaterThanOrEqual(11)
  2168 |         if (expanded!.min_leg_px != null) {
  2169 |           expect(expanded!.min_leg_px as number, `${vp.name}: panel leg text below 11px`).toBeGreaterThanOrEqual(11)
  2170 |         }
  2171 |         expect(expanded!.clipped_legs, `${vp.name}: clipped leg lines`).toBe(0)
  2172 |         expect(
  2173 |           Math.abs((expanded!.strip_width as number) - (geom.strip_width as number)),
  2174 |           `${vp.name}: opening the panel widened the top strip`,
  2175 |         ).toBeLessThanOrEqual(1)
  2176 |         await shot(page, `c1-release-expanded-${vp.name}`)
  2177 |         // Keyboard close, and focus returns to the control that opened it.
  2178 |         await page.keyboard.press("Escape")
  2179 |         await expect(external).toHaveAttribute("data-open", "false")
  2180 |         const focused = await page.evaluate(
  2181 |           () => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName ?? null,
  2182 |         )
> 2183 |         expect(focused, `${vp.name}: focus did not return to the toggle`).toBe(
       |                                                                           ^ Error: 1600x900: focus did not return to the toggle
  2184 |           "topology-external-destinations-toggle",
  2185 |         )
  2186 |       }
  2187 |       measurements.push({ ...defaults, ...geom, expanded })
  2188 |     }
  2189 |     report("release-viewport-matrix", measurements)
  2190 |     await attachJson("c1-release-matrix.json", measurements)
  2191 | 
  2192 |     report("release-console-errors", consoleErrors)
  2193 |     report("release-failed-requests", failedRequests)
  2194 |     report("release-page-errors", pageErrors)
  2195 |     await stopTracing()
  2196 |     expect(pageErrors, "uncaught page errors").toEqual([])
  2197 |     expect(consoleErrors, "console errors").toEqual([])
  2198 |     expect(failedRequests, "failed network requests").toEqual([])
  2199 |   })
  2200 | 
  2201 |   // A failing run is exactly the one whose trace is worth having.
  2202 |   test.afterEach(async ({ context }) => {
  2203 |     await context.tracing.stop().catch(() => undefined)
  2204 |   })
  2205 | })
  2206 | 
```