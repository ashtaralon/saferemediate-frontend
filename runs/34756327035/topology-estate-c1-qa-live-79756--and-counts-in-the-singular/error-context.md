# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — Step 5 acceptance matrix >> the scope bar states the account id in full, and counts in the singular
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:1669:7

# Error details

```
Error: the account control clips its value: it needs 218px and has 208px, so the id is cut where an operator reads it

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 208
Received:    218
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
    - generic [ref=e34]: 1 accounts in view
  - generic [ref=e35]:
    - banner [ref=e36]:
      - generic [ref=e37]:
        - generic [ref=e38]:
          - generic [ref=e39]: Estate · Topology v0.2 · testbed-webshop
          - generic [ref=e40]: cyntro-tb-prod-loadgen-role has 15/25 unused permissions (60% gap) — attached to cyntro-tb-prod-loadgen
          - generic [ref=e41]: scored 2026-09-12T00:27:52Z · 0 flagged · posture_correlated_at >= now() - 7d on any workload · VPC vpc-0c39cde96f29f8f4e · cached locally
          - generic [ref=e42]: Refresh request submitted; worker status not confirmed. · Last updated Sep 12, 2026, 12:27 AM
        - generic [ref=e43]:
          - generic [ref=e44]:
            - generic [ref=e45]: Evidence computed Sep 12, 2026, 12:27 AM
            - generic [ref=e47]: Snapshot 36h old
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
                - button "Architecture" [pressed] [ref=e99]:
                  - img [ref=e100]
                  - text: Architecture
                - button "Dependencies" [ref=e110]:
                  - img [ref=e111]
                  - text: Dependencies
                - button "Attack paths" [ref=e115]:
                  - img [ref=e116]
                  - text: Attack paths
          - generic [ref=e118]:
            - generic [ref=e119]:
              - img [ref=e121]
              - generic [ref=e126]:
                - generic [ref=e127]: Users
                - generic [ref=e128]: Clients & operators
            - generic [ref=e130]:
              - img [ref=e132]
              - generic [ref=e137]:
                - generic [ref=e138]: Internet
                - generic [ref=e139]: Public path via IGW · igw-01b6c643a5c856abe
          - generic [ref=e140]:
            - generic [ref=e141]: ☁ AWS Cloud · acct 416651950952
            - generic [ref=e142]:
              - generic [ref=e143]: Region · eu-west-1
              - generic [ref=e144]:
                - generic [ref=e145]:
                  - generic [ref=e146]:
                    - generic "vpc-0c39cde96f29f8f4e" [ref=e147]: VPC · vpc-0c39cde96f29f8f4e
                    - generic "7 of 8 workloads in this VPC drop the shared prefix \"cyntro-tb-prod-\" from their chip label — every tooltip still carries the full name" [ref=e148]: cyntro-tb-prod-… ×7
                  - generic [ref=e150]:
                    - generic [ref=e151]:
                      - generic [ref=e152]:
                        - img [ref=e153]
                        - generic [ref=e159]: Load Balancers (2)
                      - generic [ref=e160]:
                        - button "cyntro-tb-prod-alb-int Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e161]:
                          - generic [ref=e163]:
                            - generic [ref=e164]:
                              - generic [ref=e165]: cyntro-tb-prod-alb-int
                              - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e166]: Multi-AZ
                            - generic [ref=e167]: LoadBalancer · arn:aws:elasticloadbalan
                          - generic [ref=e168]: "0"
                        - button "cyntro-tb-prod-alb-pub Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e169]:
                          - generic [ref=e171]:
                            - generic [ref=e172]:
                              - generic [ref=e173]: cyntro-tb-prod-alb-pub
                              - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e174]: Multi-AZ
                            - generic [ref=e175]: LoadBalancer · arn:aws:elasticloadbalan
                          - generic [ref=e176]: "0"
                    - generic [ref=e177]:
                      - generic [ref=e178]:
                        - generic "eu-west-1a" [ref=e179]: Availability Zone · eu-west-1a
                        - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1a · 10.42.0.0/24 · Owner: testbed-webshop" [ref=e180]':
                          - generic [ref=e181]:
                            - generic [ref=e182]: Public · cyntro-tb-prod-public-eu-west-1a
                            - generic [ref=e183]: 10.42.0.0/24
                          - generic "NAT gateway · nat-0fd7cf8524e62aea9 · public 54.229.208.150 · subnet subnet-05472c7cd0d3a7b90 (from vpc_topology.edges)" [ref=e185]:
                            - img [ref=e187]
                            - generic [ref=e190]: NAT GW · nat-0fd7cf8524e62aea9
                          - generic [ref=e191]:
                            - button "quiet posture score …web" [ref=e192]:
                              - generic "quiet posture score" [ref=e193]
                              - generic [ref=e196]: …web
                            - button "quiet posture score cyntro-testbed-webshop-writer" [ref=e197]:
                              - generic "quiet posture score" [ref=e198]
                              - generic [ref=e201]: cyntro-testbed-webshop-writer
                        - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1a · 10.42.10.0/24 · Owner: testbed-webshop" [ref=e202]':
                          - generic [ref=e203]:
                            - generic [ref=e204]: Private · cyntro-tb-prod-app-eu-west-1a
                            - generic [ref=e205]: 10.42.10.0/24
                          - button "quiet posture score ×2 EC2" [ref=e207]:
                            - generic "quiet posture score" [ref=e208]
                            - generic [ref=e213]: ×2
                            - generic [ref=e214]: EC2
                        - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1a · 10.42.20.0/24 · Owner: testbed-webshop" [ref=e215]':
                          - generic [ref=e216]:
                            - generic [ref=e217]: Data · cyntro-tb-prod-data-eu-west-1a
                            - generic [ref=e218]: 10.42.20.0/24
                          - button "quiet posture score …aurora-1" [ref=e220]:
                            - generic "quiet posture score" [ref=e221]
                            - generic [ref=e224]: …aurora-1
                      - generic [ref=e225]:
                        - generic "eu-west-1b" [ref=e226]: Availability Zone · eu-west-1b
                        - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1b · 10.42.1.0/24 · Owner: testbed-webshop" [ref=e227]':
                          - generic [ref=e228]:
                            - generic [ref=e229]: Public · cyntro-tb-prod-public-eu-west-1b
                            - generic [ref=e230]: 10.42.1.0/24
                          - button "quiet posture score …web" [ref=e232]:
                            - generic "quiet posture score" [ref=e233]
                            - generic [ref=e236]: …web
                        - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1b · 10.42.11.0/24 · Owner: testbed-webshop" [ref=e237]':
                          - generic [ref=e238]:
                            - generic [ref=e239]: Private · cyntro-tb-prod-app-eu-west-1b
                            - generic [ref=e240]: 10.42.11.0/24
                          - button "quiet posture score …app" [ref=e242]:
                            - generic "quiet posture score" [ref=e243]
                            - generic [ref=e246]: …app
                        - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1b · 10.42.21.0/24 · Owner: testbed-webshop" [ref=e247]':
                          - generic [ref=e248]:
                            - generic [ref=e249]: Data · cyntro-tb-prod-data-eu-west-1b
                            - generic [ref=e250]: 10.42.21.0/24
                          - button "quiet posture score …aurora-0" [ref=e252]:
                            - generic "quiet posture score" [ref=e253]
                            - generic [ref=e256]: …aurora-0
                - generic [ref=e257]:
                  - generic [ref=e258]: VPC boundary
                  - generic [ref=e259]:
                    - generic [ref=e260]: ↑ Internet
                    - generic [ref=e261]:
                      - button "IGW igw-01b6c643a5c856abe" [ref=e262]:
                        - img [ref=e264]
                        - generic [ref=e267]: IGW
                        - generic [ref=e268]: igw-01b6c643a5c856abe
                      - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e269]: "egress: 3 workloads"
                  - generic [ref=e271]:
                    - generic [ref=e272]: Endpoints (1)
                    - generic [ref=e273]:
                      - button "VPCE GW Amazon S3" [ref=e274]:
                        - img [ref=e276]
                        - generic [ref=e280]: VPCE
                        - generic [ref=e281]: GW
                        - generic [ref=e282]: Amazon S3
                      - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e283]: "use: not observed"
                - generic [ref=e285]:
                  - generic [ref=e286]:
                    - generic [ref=e287]:
                      - generic [ref=e288]: Lambda runtime (6)
                      - generic [ref=e289]:
                        - text: outside subnet grid · 6 outside VPC (verified)
                        - generic "12 of 12 chips omit this shared prefix" [ref=e290]: · cyntro-tb-prod-consumer-… ×12
                    - generic [ref=e291]:
                      - generic [ref=e292]: Triggers (6)
                      - generic [ref=e293]:
                        - button "quiet posture score …daily" [ref=e294]:
                          - generic "quiet posture score" [ref=e295]
                          - generic [ref=e298]: …daily
                        - button "quiet posture score …every_6h" [ref=e299]:
                          - generic "quiet posture score" [ref=e300]
                          - generic [ref=e303]: …every_6h
                        - button "quiet posture score …frequent" [ref=e304]:
                          - generic "quiet posture score" [ref=e305]
                          - generic [ref=e308]: …frequent
                        - button "quiet posture score …monthly" [ref=e309]:
                          - generic "quiet posture score" [ref=e310]
                          - generic [ref=e313]: …monthly
                        - button "quiet posture score …nightly_burst" [ref=e314]:
                          - generic "quiet posture score" [ref=e315]
                          - generic [ref=e318]: …nightly_burst
                        - button "quiet posture score …weekly" [ref=e319]:
                          - generic "quiet posture score" [ref=e320]
                          - generic [ref=e323]: …weekly
                    - button "Lambda×6" [ref=e326]:
                      - generic [ref=e330]:
                        - text: Lambda
                        - generic [ref=e331]: ×6
                  - generic [ref=e333]:
                    - generic [ref=e334]:
                      - text: Regional · KMS / S3 / DDB (7)
                      - generic "3 of 7 chips omit this shared prefix" [ref=e335]: arn:aws:kms:eu-west-1:416651950952:key/… ×3
                    - generic [ref=e337]:
                      - button "S3×3" [ref=e338]:
                        - generic [ref=e342]:
                          - text: S3
                          - generic [ref=e343]: ×3
                      - button "KMS×3" [ref=e344]:
                        - generic [ref=e348]:
                          - text: KMS
                          - generic [ref=e349]: ×3
                      - button "DynamoDB" [ref=e350]:
                        - generic [ref=e353]: DynamoDB
              - generic [ref=e354]:
                - generic [ref=e355]:
                  - generic [ref=e356]: Logical groups · members carry the placement (6)
                  - generic [ref=e357]: "Target groups, auto-scaling groups and database clusters have no subnet of their own — their members carry the placement. Not a collector gap: a full sync will not move it."
                - generic [ref=e358]:
                  - generic [ref=e359]:
                    - button "quiet posture score cyntro-tb-prod-aurora" [ref=e360]:
                      - generic "quiet posture score" [ref=e361]
                      - generic [ref=e364]: cyntro-tb-prod-aurora
                    - generic [ref=e365]: VPC not reported
                    - generic [ref=e366]: members not linked in this payload
                  - generic [ref=e367]:
                    - button "quiet posture score cyntro-tb-prod-tg-app" [ref=e368]:
                      - generic "quiet posture score" [ref=e369]
                      - generic [ref=e372]: cyntro-tb-prod-tg-app
                    - generic [ref=e373]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                    - generic [ref=e374]:
                      - button "cyntro-tb-prod-app" [ref=e375]
                      - button "cyntro-tb-prod-app" [ref=e376]
                  - generic [ref=e377]:
                    - button "quiet posture score cyntro-tb-prod-tg-web" [ref=e378]:
                      - generic "quiet posture score" [ref=e379]
                      - generic [ref=e382]: cyntro-tb-prod-tg-web
                    - generic [ref=e383]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                    - generic [ref=e384]:
                      - button "cyntro-tb-prod-web" [ref=e385]
                      - button "cyntro-tb-prod-web" [ref=e386]
                  - generic [ref=e387]:
                    - button "quiet posture score cyntro-testbed-webshop" [ref=e388]:
                      - generic "quiet posture score" [ref=e389]
                      - generic [ref=e392]: cyntro-testbed-webshop
                    - generic [ref=e393]: VPC not reported
                    - generic [ref=e394]: members not linked in this payload
                  - generic [ref=e395]:
                    - button "quiet posture score cyntro-tb-prod-asg-web" [ref=e396]:
                      - generic "quiet posture score" [ref=e397]
                      - generic [ref=e400]: cyntro-tb-prod-asg-web
                    - generic [ref=e401]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                    - generic [ref=e402]:
                      - button "cyntro-tb-prod-web" [ref=e403]
                      - button "cyntro-tb-prod-web" [ref=e404]
                  - generic [ref=e405]:
                    - button "quiet posture score cyntro-tb-prod-asg-app" [ref=e406]:
                      - generic "quiet posture score" [ref=e407]
                      - generic [ref=e410]: cyntro-tb-prod-asg-app
                    - generic [ref=e411]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                    - generic [ref=e412]:
                      - button "cyntro-tb-prod-app" [ref=e413]
                      - button "cyntro-tb-prod-app" [ref=e414]
          - generic [ref=e415]:
            - button "Diagnostics 6 serverless · 35 flows ▴" [ref=e416]:
              - generic [ref=e417]: Diagnostics
              - generic [ref=e418]: 6 serverless · 35 flows ▴
            - generic [ref=e419]:
              - generic [ref=e420]:
                - generic [ref=e421]: Serverless compute (6)
                - generic [ref=e422]:
                  - button "cyntro-tb-prod-consumer-monthly Lambda · arn:aws:lambda:eu-west-1 15" [ref=e423]:
                    - generic [ref=e425]:
                      - generic [ref=e427]: cyntro-tb-prod-consumer-monthly
                      - generic [ref=e428]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e429]: "15"
                  - button "cyntro-tb-prod-consumer-weekly Lambda · arn:aws:lambda:eu-west-1 15" [ref=e430]:
                    - generic [ref=e432]:
                      - generic [ref=e434]: cyntro-tb-prod-consumer-weekly
                      - generic [ref=e435]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e436]: "15"
                  - button "cyntro-tb-prod-consumer-daily Lambda · arn:aws:lambda:eu-west-1 4" [ref=e437]:
                    - generic [ref=e439]:
                      - generic [ref=e441]: cyntro-tb-prod-consumer-daily
                      - generic [ref=e442]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e443]: "4"
                  - button "cyntro-tb-prod-consumer-every_6h Lambda · arn:aws:lambda:eu-west-1 4" [ref=e444]:
                    - generic [ref=e446]:
                      - generic [ref=e448]: cyntro-tb-prod-consumer-every_6h
                      - generic [ref=e449]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e450]: "4"
                  - button "cyntro-tb-prod-consumer-frequent Lambda · arn:aws:lambda:eu-west-1 4" [ref=e451]:
                    - generic [ref=e453]:
                      - generic [ref=e455]: cyntro-tb-prod-consumer-frequent
                      - generic [ref=e456]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e457]: "4"
                  - button "cyntro-tb-prod-consumer-nightly_burst Lambda · arn:aws:lambda:eu-west-1 4" [ref=e458]:
                    - generic [ref=e460]:
                      - generic [ref=e462]: cyntro-tb-prod-consumer-nightly_burst
                      - generic [ref=e463]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e464]: "4"
              - generic [ref=e465]:
                - generic [ref=e466]:
                  - generic [ref=e467]: Observed traffic — animated arrows above
                  - generic [ref=e468]: 35 flows · 22 internal · 10 edge-service · 0 vpce · 0 database · 3 egress
                - generic [ref=e469]: Listing 0 of 35 — the current lens and selection hide the rest. The counts above are the full evidence.
                - generic [ref=e470]: 35 observed flows in this scope — none are drawn under the current lens and selection.
              - generic [ref=e471]:
                - generic [ref=e472]: Encoding
                - generic [ref=e473]:
                  - generic [ref=e476]: Worst (carmine halo + pulse)
                  - generic [ref=e479]: High / elevated (ring only)
                  - generic [ref=e480]:
                    - generic [ref=e481]: ♛
                    - generic [ref=e482]: Crown-jewel halo
                  - generic [ref=e485]: Clean · remediated (teal ring)
                  - generic [ref=e488]: Stale (dimmed)
                  - generic [ref=e491]: Coverage gap (not collected)
          - img
      - complementary [ref=e492]:
        - complementary [ref=e493]:
          - generic [ref=e494]:
            - generic [ref=e495]:
              - heading "Service index" [level=2] [ref=e496]
              - generic [ref=e497]: "35"
            - generic [ref=e498]:
              - img [ref=e499]
              - searchbox "Find service in topology" [ref=e502]
            - button "Filters" [ref=e505]:
              - img [ref=e506]
              - text: Filters
          - list [ref=e508]:
            - listitem [ref=e509]:
              - button "cyntro-tb-prod-appdata-1c8276f5 Current graph data S3 · global · regional 4 in · 1 out Aug 20, 04:53 PM" [ref=e510]:
                - generic [ref=e511]:
                  - img [ref=e513]
                  - generic [ref=e515]:
                    - generic [ref=e516]:
                      - generic [ref=e517]: cyntro-tb-prod-appdata-1c8276f5
                      - generic "Current graph data" [ref=e518]
                    - generic [ref=e520]: S3 · global · regional
                    - generic [ref=e521]:
                      - generic [ref=e522]: 4 in · 1 out
                      - generic [ref=e523]:
                        - img [ref=e524]
                        - text: Aug 20, 04:53 PM
            - listitem [ref=e527]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2 Current graph data KMSKey · global · regional 3 in · 0 out Sep 11, 07:35 PM" [ref=e528]:
                - generic [ref=e529]:
                  - img [ref=e531]
                  - generic [ref=e533]:
                    - generic [ref=e534]:
                      - generic [ref=e535]: arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2
                      - generic "Current graph data" [ref=e536]
                    - generic [ref=e538]: KMSKey · global · regional
                    - generic [ref=e539]:
                      - generic [ref=e540]: 3 in · 0 out
                      - generic [ref=e541]:
                        - img [ref=e542]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e545]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1b · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e546]:
                - generic [ref=e547]:
                  - img [ref=e549]
                  - generic [ref=e551]:
                    - generic [ref=e552]:
                      - generic [ref=e553]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e554]
                    - generic [ref=e556]: EC2 · eu-west-1b · app
                    - generic [ref=e557]:
                      - generic [ref=e558]: 2 in · 1 out
                      - generic [ref=e559]:
                        - img [ref=e560]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e563]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1a · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e564]:
                - generic [ref=e565]:
                  - img [ref=e567]
                  - generic [ref=e569]:
                    - generic [ref=e570]:
                      - generic [ref=e571]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e572]
                    - generic [ref=e574]: EC2 · eu-west-1a · app
                    - generic [ref=e575]:
                      - generic [ref=e576]: 2 in · 1 out
                      - generic [ref=e577]:
                        - img [ref=e578]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e581]:
              - button "cyntro-tb-prod-consumer-daily Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e582]:
                - generic [ref=e583]:
                  - img [ref=e585]
                  - generic [ref=e587]:
                    - generic [ref=e588]:
                      - generic [ref=e589]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e590]
                    - generic [ref=e592]: Lambda · eu-west-1 · regional
                    - generic [ref=e593]:
                      - generic [ref=e594]: 2 in · 1 out
                      - generic [ref=e595]:
                        - img [ref=e596]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e599]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e600]:
                - generic [ref=e601]:
                  - img [ref=e603]
                  - generic [ref=e605]:
                    - generic [ref=e606]:
                      - generic [ref=e607]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e608]
                    - generic [ref=e610]: Lambda · eu-west-1 · regional
                    - generic [ref=e611]:
                      - generic [ref=e612]: 2 in · 1 out
                      - generic [ref=e613]:
                        - img [ref=e614]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e617]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 1, 11:00 AM" [ref=e618]:
                - generic [ref=e619]:
                  - img [ref=e621]
                  - generic [ref=e623]:
                    - generic [ref=e624]:
                      - generic [ref=e625]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e626]
                    - generic [ref=e628]: Lambda · eu-west-1 · regional
                    - generic [ref=e629]:
                      - generic [ref=e630]: 2 in · 1 out
                      - generic [ref=e631]:
                        - img [ref=e632]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e635]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e636]:
                - generic [ref=e637]:
                  - img [ref=e639]
                  - generic [ref=e641]:
                    - generic [ref=e642]:
                      - generic [ref=e643]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e644]
                    - generic [ref=e646]: Lambda · eu-west-1 · regional
                    - generic [ref=e647]:
                      - generic [ref=e648]: 2 in · 1 out
                      - generic [ref=e649]:
                        - img [ref=e650]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e653]:
              - button "cyntro-tb-prod-tg-app Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e654]:
                - generic [ref=e655]:
                  - img [ref=e657]
                  - generic [ref=e659]:
                    - generic [ref=e660]:
                      - generic [ref=e661]: cyntro-tb-prod-tg-app
                      - generic "Current graph data" [ref=e662]
                    - generic [ref=e664]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e665]:
                      - generic [ref=e666]: 1 in · 2 out
                      - generic [ref=e667]:
                        - img [ref=e668]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e671]:
              - button "cyntro-tb-prod-tg-web Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e672]:
                - generic [ref=e673]:
                  - img [ref=e675]
                  - generic [ref=e677]:
                    - generic [ref=e678]:
                      - generic [ref=e679]: cyntro-tb-prod-tg-web
                      - generic "Current graph data" [ref=e680]
                    - generic [ref=e682]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e683]:
                      - generic [ref=e684]: 1 in · 2 out
                      - generic [ref=e685]:
                        - img [ref=e686]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e689]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453 Current graph data KMSKey · global · regional 2 in · 0 out Sep 11, 07:35 PM" [ref=e690]:
                - generic [ref=e691]:
                  - img [ref=e693]
                  - generic [ref=e695]:
                    - generic [ref=e696]:
                      - generic [ref=e697]: arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                      - generic "Current graph data" [ref=e698]
                    - generic [ref=e700]: KMSKey · global · regional
                    - generic [ref=e701]:
                      - generic [ref=e702]: 2 in · 0 out
                      - generic [ref=e703]:
                        - img [ref=e704]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e707]:
              - button "cyntro-tb-prod-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e708]:
                - generic [ref=e709]:
                  - img [ref=e711]
                  - generic [ref=e713]:
                    - generic [ref=e714]:
                      - generic [ref=e715]: cyntro-tb-prod-asg-app
                      - generic "Current graph data" [ref=e716]
                    - generic [ref=e718]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e719]:
                      - generic [ref=e720]: 0 in · 2 out
                      - generic [ref=e721]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e724]:
              - button "cyntro-tb-prod-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e725]:
                - generic [ref=e726]:
                  - img [ref=e728]
                  - generic [ref=e730]:
                    - generic [ref=e731]:
                      - generic [ref=e732]: cyntro-tb-prod-asg-web
                      - generic "Current graph data" [ref=e733]
                    - generic [ref=e735]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e736]:
                      - generic [ref=e737]: 0 in · 2 out
                      - generic [ref=e738]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e741]:
              - button "cyntro-tb-prod-consumer-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e742]:
                - generic [ref=e743]:
                  - img [ref=e745]
                  - generic [ref=e747]:
                    - generic [ref=e748]:
                      - generic [ref=e749]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e750]
                    - generic [ref=e752]: EventBridge · eu-west-1 · regional
                    - generic [ref=e753]:
                      - generic [ref=e754]: 0 in · 2 out
                      - generic [ref=e755]:
                        - img [ref=e756]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e759]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e760]:
                - generic [ref=e761]:
                  - img [ref=e763]
                  - generic [ref=e765]:
                    - generic [ref=e766]:
                      - generic [ref=e767]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e768]
                    - generic [ref=e770]: EventBridge · eu-west-1 · regional
                    - generic [ref=e771]:
                      - generic [ref=e772]: 0 in · 2 out
                      - generic [ref=e773]:
                        - img [ref=e774]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e777]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Sep 1, 11:00 AM" [ref=e778]:
                - generic [ref=e779]:
                  - img [ref=e781]
                  - generic [ref=e783]:
                    - generic [ref=e784]:
                      - generic [ref=e785]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e786]
                    - generic [ref=e788]: EventBridge · eu-west-1 · regional
                    - generic [ref=e789]:
                      - generic [ref=e790]: 0 in · 2 out
                      - generic [ref=e791]:
                        - img [ref=e792]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e795]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e796]:
                - generic [ref=e797]:
                  - img [ref=e799]
                  - generic [ref=e801]:
                    - generic [ref=e802]:
                      - generic [ref=e803]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e804]
                    - generic [ref=e806]: Lambda · eu-west-1 · regional
                    - generic [ref=e807]:
                      - generic [ref=e808]: 2 in · 0 out
                      - generic [ref=e809]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e812]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e813]:
                - generic [ref=e814]:
                  - img [ref=e816]
                  - generic [ref=e818]:
                    - generic [ref=e819]:
                      - generic [ref=e820]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e821]
                    - generic [ref=e823]: EventBridge · eu-west-1 · regional
                    - generic [ref=e824]:
                      - generic [ref=e825]: 0 in · 2 out
                      - generic [ref=e826]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e829]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e830]:
                - generic [ref=e831]:
                  - img [ref=e833]
                  - generic [ref=e835]:
                    - generic [ref=e836]:
                      - generic [ref=e837]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e838]
                    - generic [ref=e840]: EventBridge · eu-west-1 · regional
                    - generic [ref=e841]:
                      - generic [ref=e842]: 0 in · 2 out
                      - generic [ref=e843]:
                        - img [ref=e844]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e847]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out Aug 29, 11:00 AM" [ref=e848]:
                - generic [ref=e849]:
                  - img [ref=e851]
                  - generic [ref=e853]:
                    - generic [ref=e854]:
                      - generic [ref=e855]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e856]
                    - generic [ref=e858]: Lambda · eu-west-1 · regional
                    - generic [ref=e859]:
                      - generic [ref=e860]: 2 in · 0 out
                      - generic [ref=e861]:
                        - img [ref=e862]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e865]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 29, 11:00 AM" [ref=e866]:
                - generic [ref=e867]:
                  - img [ref=e869]
                  - generic [ref=e871]:
                    - generic [ref=e872]:
                      - generic [ref=e873]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e874]
                    - generic [ref=e876]: EventBridge · eu-west-1 · regional
                    - generic [ref=e877]:
                      - generic [ref=e878]: 0 in · 2 out
                      - generic [ref=e879]:
                        - img [ref=e880]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e883]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1a · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e884]:
                - generic [ref=e885]:
                  - img [ref=e887]
                  - generic [ref=e889]:
                    - generic [ref=e890]:
                      - generic [ref=e891]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e892]
                    - generic [ref=e894]: EC2 · eu-west-1a · web
                    - generic [ref=e895]:
                      - generic [ref=e896]: 2 in · 0 out
                      - generic [ref=e897]:
                        - img [ref=e898]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e901]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1b · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e902]:
                - generic [ref=e903]:
                  - img [ref=e905]
                  - generic [ref=e907]:
                    - generic [ref=e908]:
                      - generic [ref=e909]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e910]
                    - generic [ref=e912]: EC2 · eu-west-1b · web
                    - generic [ref=e913]:
                      - generic [ref=e914]: 2 in · 0 out
                      - generic [ref=e915]:
                        - img [ref=e916]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e919]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a Current graph data KMSKey · global · regional 1 in · 0 out No runtime timestamp" [ref=e920]:
                - generic [ref=e921]:
                  - img [ref=e923]
                  - generic [ref=e925]:
                    - generic [ref=e926]:
                      - generic [ref=e927]: arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a
                      - generic "Current graph data" [ref=e928]
                    - generic [ref=e930]: KMSKey · global · regional
                    - generic [ref=e931]:
                      - generic [ref=e932]: 1 in · 0 out
                      - generic [ref=e933]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e936]:
              - button "cyntro-evidence-testbed-webshop-950952 Current graph data S3 · global · regional 0 in · 1 out No runtime timestamp" [ref=e937]:
                - generic [ref=e938]:
                  - img [ref=e940]
                  - generic [ref=e942]:
                    - generic [ref=e943]:
                      - generic [ref=e944]: cyntro-evidence-testbed-webshop-950952
                      - generic "Current graph data" [ref=e945]
                    - generic [ref=e947]: S3 · global · regional
                    - generic [ref=e948]:
                      - generic [ref=e949]: 0 in · 1 out
                      - generic [ref=e950]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e953]:
              - button "cyntro-ingest-head-testbed-webshop Current graph data DynamoDB · eu-west-1 · regional 0 in · 1 out No runtime timestamp" [ref=e954]:
                - generic [ref=e955]:
                  - img [ref=e957]
                  - generic [ref=e959]:
                    - generic [ref=e960]:
                      - generic [ref=e961]: cyntro-ingest-head-testbed-webshop
                      - generic "Current graph data" [ref=e962]
                    - generic [ref=e964]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e965]:
                      - generic [ref=e966]: 0 in · 1 out
                      - generic [ref=e967]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e970]:
              - button "cyntro-tb-prod-alb-int Current graph data LoadBalancer · eu-west-1a · app 0 in · 1 out No runtime timestamp" [ref=e971]:
                - generic [ref=e972]:
                  - img [ref=e974]
                  - generic [ref=e976]:
                    - generic [ref=e977]:
                      - generic [ref=e978]: cyntro-tb-prod-alb-int
                      - generic "Current graph data" [ref=e979]
                    - generic [ref=e981]: LoadBalancer · eu-west-1a · app
                    - generic [ref=e982]:
                      - generic [ref=e983]: 0 in · 1 out
                      - generic [ref=e984]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e987]:
              - button "cyntro-tb-prod-alb-pub Current graph data LoadBalancer · eu-west-1a · web 0 in · 1 out No runtime timestamp" [ref=e988]:
                - generic [ref=e989]:
                  - img [ref=e991]
                  - generic [ref=e993]:
                    - generic [ref=e994]:
                      - generic [ref=e995]: cyntro-tb-prod-alb-pub
                      - generic "Current graph data" [ref=e996]
                    - generic [ref=e998]: LoadBalancer · eu-west-1a · web
                    - generic [ref=e999]:
                      - generic [ref=e1000]: 0 in · 1 out
                      - generic [ref=e1001]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1004]:
              - button "cyntro-tb-prod-aurora-0 Current graph data RDS · eu-west-1b · data 0 in · 1 out Sep 11, 07:35 PM" [ref=e1005]:
                - generic [ref=e1006]:
                  - img [ref=e1008]
                  - generic [ref=e1010]:
                    - generic [ref=e1011]:
                      - generic [ref=e1012]: cyntro-tb-prod-aurora-0
                      - generic "Current graph data" [ref=e1013]
                    - generic [ref=e1015]: RDS · eu-west-1b · data
                    - generic [ref=e1016]:
                      - generic [ref=e1017]: 0 in · 1 out
                      - generic [ref=e1018]:
                        - img [ref=e1019]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e1022]:
              - button "cyntro-tb-prod-aurora-1 Current graph data RDS · eu-west-1a · data 0 in · 1 out Sep 11, 07:35 PM" [ref=e1023]:
                - generic [ref=e1024]:
                  - img [ref=e1026]
                  - generic [ref=e1028]:
                    - generic [ref=e1029]:
                      - generic [ref=e1030]: cyntro-tb-prod-aurora-1
                      - generic "Current graph data" [ref=e1031]
                    - generic [ref=e1033]: RDS · eu-west-1a · data
                    - generic [ref=e1034]:
                      - generic [ref=e1035]: 0 in · 1 out
                      - generic [ref=e1036]:
                        - img [ref=e1037]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e1040]:
              - button "cyntro-tb-prod-loadgen Current graph data EC2 · eu-west-1a · app 0 in · 1 out Aug 18, 06:57 PM" [ref=e1041]:
                - generic [ref=e1042]:
                  - img [ref=e1044]
                  - generic [ref=e1046]:
                    - generic [ref=e1047]:
                      - generic [ref=e1048]: cyntro-tb-prod-loadgen
                      - generic "Current graph data" [ref=e1049]
                    - generic [ref=e1051]: EC2 · eu-west-1a · app
                    - generic [ref=e1052]:
                      - generic [ref=e1053]: 0 in · 1 out
                      - generic [ref=e1054]:
                        - img [ref=e1055]
                        - text: Aug 18, 06:57 PM
            - listitem [ref=e1058]:
              - button "cyntro-testbed-webshop-writer Current graph data Neptune · eu-west-1a · web 0 in · 1 out Sep 11, 07:35 PM" [ref=e1059]:
                - generic [ref=e1060]:
                  - img [ref=e1062]
                  - generic [ref=e1064]:
                    - generic [ref=e1065]:
                      - generic [ref=e1066]: cyntro-testbed-webshop-writer
                      - generic "Current graph data" [ref=e1067]
                    - generic [ref=e1069]: Neptune · eu-west-1a · web
                    - generic [ref=e1070]:
                      - generic [ref=e1071]: 0 in · 1 out
                      - generic [ref=e1072]:
                        - img [ref=e1073]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e1076]:
              - button "cyntro-tb-prod-aurora Current graph data RDS · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1077]:
                - generic [ref=e1078]:
                  - img [ref=e1080]
                  - generic [ref=e1083]:
                    - generic [ref=e1084]:
                      - generic [ref=e1085]: cyntro-tb-prod-aurora
                      - generic "Current graph data" [ref=e1086]
                    - generic [ref=e1088]: RDS · eu-west-1 · regional
                    - generic [ref=e1089]:
                      - generic [ref=e1090]: 0 in · 0 out
                      - generic [ref=e1091]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1094]:
              - button "cyntro-tb-prod-logs-1c8276f5 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp" [ref=e1095]:
                - generic [ref=e1096]:
                  - img [ref=e1098]
                  - generic [ref=e1101]:
                    - generic [ref=e1102]:
                      - generic [ref=e1103]: cyntro-tb-prod-logs-1c8276f5
                      - generic "Current graph data" [ref=e1104]
                    - generic [ref=e1106]: S3 · global · regional
                    - generic [ref=e1107]:
                      - generic [ref=e1108]: 0 in · 0 out
                      - generic [ref=e1109]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1112]:
              - button "cyntro-testbed-webshop Current graph data Neptune · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1113]:
                - generic [ref=e1114]:
                  - img [ref=e1116]
                  - generic [ref=e1119]:
                    - generic [ref=e1120]:
                      - generic [ref=e1121]: cyntro-testbed-webshop
                      - generic "Current graph data" [ref=e1122]
                    - generic [ref=e1124]: Neptune · eu-west-1 · regional
                    - generic [ref=e1125]:
                      - generic [ref=e1126]: 0 in · 0 out
                      - generic [ref=e1127]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1130]:
      - text: Live read from
      - generic [ref=e1131]: /api/topology-risk/testbed-webshop
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1132]
```

# Test source

```ts
  1615 |     await expect(enlarge).toBeVisible()
  1616 |     await enlarge.click()
  1617 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  1618 |     await expect(fullscreen).toBeVisible({ timeout: 60_000 })
  1619 | 
  1620 |     // A chip opens the detail drawer. Fail closed: if nothing is clickable the
  1621 |     // rest of this test proves nothing, so say so rather than skipping quietly.
  1622 |     const chips = fullscreen.getByTestId("topology-chip-label")
  1623 |     const chipCount = await chips.count()
  1624 |     expect(chipCount, "no chips rendered — the drawer path cannot be exercised").toBeGreaterThan(0)
  1625 |     await chips.first().click()
  1626 | 
  1627 |     const drawer = page.getByTestId("topology-service-detail-panel")
  1628 |     const drawerOpened = await drawer.isVisible({ timeout: 15_000 }).catch(() => false)
  1629 |     report("matrix-keyboard-drawer", { chips: chipCount, drawer_opened: drawerOpened })
  1630 | 
  1631 |     if (drawerOpened) {
  1632 |       // Escape dismisses the TOPMOST surface first. Before this shipped, the
  1633 |       // drawer swallowed the click and nothing dismissed it, which is what
  1634 |       // made probe 3 time out (run 34747728564) — the product defect, not a
  1635 |       // flaky probe.
  1636 |       await page.keyboard.press("Escape")
  1637 |       await expect(drawer).toBeHidden({ timeout: 15_000 })
  1638 |       await expect(fullscreen).toBeVisible()
  1639 |     }
  1640 | 
  1641 |     // A second Escape leaves fullscreen, and focus returns to the control that
  1642 |     // opened it, so a keyboard operator is not stranded at the document root.
  1643 |     await page.keyboard.press("Escape")
  1644 |     await expect(fullscreen).toBeHidden({ timeout: 15_000 })
  1645 |     const focus = await page.evaluate(() => {
  1646 |       const el = document.activeElement as HTMLElement | null
  1647 |       return {
  1648 |         testid: el?.getAttribute("data-testid") ?? null,
  1649 |         tag: el?.tagName ?? null,
  1650 |         is_body: el === document.body,
  1651 |       }
  1652 |     })
  1653 |     report("matrix-keyboard-focus-after-escape", focus)
  1654 | 
  1655 |     // Reported before it was asserted, on purpose: the first run measured
  1656 |     // {"tag":"BODY","is_body":true} on C1 (run 34754792418) — Escape worked and
  1657 |     // the RETURN did not, so a keyboard operator had to Tab in from the top of
  1658 |     // the page to reach the map again. Now that the opener's element is
  1659 |     // restored, this is a guard rather than an observation.
  1660 |     expect(
  1661 |       focus.is_body,
  1662 |       "focus was dropped to the document root when fullscreen closed",
  1663 |     ).toBe(false)
  1664 |     expect(focus.testid, "focus did not return to the control that opened fullscreen").toBe(
  1665 |       "topology-estate-map-enlarge",
  1666 |     )
  1667 |   })
  1668 | 
  1669 |   test("the scope bar states the account id in full, and counts in the singular", async ({
  1670 |     context,
  1671 |     page,
  1672 |   }) => {
  1673 |     /** Seen at 1366x768 in run 34754792418: the account control rendered
  1674 |      *  "Testbed Webshop · 4166519509" with the last digits cut off, and the
  1675 |      *  counter read "1 accounts in view".
  1676 |      *
  1677 |      *  The first is not cosmetic. An AWS account id is 12 digits, and a
  1678 |      *  partly-shown one reads as a different, valid-looking account in a
  1679 |      *  product whose whole job is attributing a resource to the right one.
  1680 |      *  The label's own width cap was doing the cutting.
  1681 |      */
  1682 |     test.setTimeout(300_000)
  1683 |     await seedAuthCookie(context)
  1684 |     await page.setViewportSize({ width: 1366, height: 768 })
  1685 |     await openMap(page, "scope-bar")
  1686 | 
  1687 |     const account = page.getByLabel("Account", { exact: true })
  1688 |     await expect(account).toBeVisible({ timeout: 30_000 })
  1689 | 
  1690 |     const state = await account.evaluate(el => {
  1691 |       const select = el as HTMLSelectElement
  1692 |       const option = select.selectedOptions[0]
  1693 |       return {
  1694 |         selected_text: option?.textContent?.trim() ?? null,
  1695 |         title: select.getAttribute("title"),
  1696 |         // The rendered box versus the text the browser wants to draw in it.
  1697 |         client_width: Math.round(select.clientWidth),
  1698 |         scroll_width: Math.round(select.scrollWidth),
  1699 |       }
  1700 |     })
  1701 |     const counter = (await page.getByText(/account(s)? in view/).first().textContent()) ?? ""
  1702 |     report("matrix-scope-bar", { ...state, counter: counter.trim() })
  1703 | 
  1704 |     // THE detector, and it had to be measured to be found. The DOM text always
  1705 |     // carries the full id -- run 34756120023 recorded
  1706 |     // selected_text "Testbed Webshop · 416651950952" while the control was
  1707 |     // visibly cut -- so asserting on the text can never catch the clipping.
  1708 |     // What catches it is the box: the same run measured client_width 208
  1709 |     // against scroll_width 218, i.e. ten pixels of the value the operator
  1710 |     // could not see.
  1711 |     expect(
  1712 |       state.scroll_width,
  1713 |       `the account control clips its value: it needs ${state.scroll_width}px and has ` +
  1714 |         `${state.client_width}px, so the id is cut where an operator reads it`,
> 1715 |     ).toBeLessThanOrEqual(state.client_width)
       |       ^ Error: the account control clips its value: it needs 218px and has 208px, so the id is cut where an operator reads it
  1716 | 
  1717 |     // Then the belt and braces: the value is intact in the DOM, and reachable
  1718 |     // on hover for a display name long enough to outrun any cap.
  1719 |     expect(state.selected_text, "the selected account option").toContain(ACCOUNT)
  1720 |     expect(state.title, "the hover title must carry the full id").toContain(ACCOUNT)
  1721 | 
  1722 |     // Singular when there is one. "1 accounts" is the tell that a count is
  1723 |     // being pasted into a fixed string.
  1724 |     expect(counter).not.toMatch(/\b1 accounts in view\b/)
  1725 |   })
  1726 | 
  1727 |   test("reduced motion: the map still renders and reports its animation state", async ({
  1728 |     context,
  1729 |     page,
  1730 |   }) => {
  1731 |     test.setTimeout(300_000)
  1732 |     await seedAuthCookie(context)
  1733 |     await page.setViewportSize({ width: 1600, height: 900 })
  1734 |     const pageErrors: string[] = []
  1735 |     page.on("pageerror", error => pageErrors.push(String(error.message ?? error)))
  1736 | 
  1737 |     /** Flow packets present, and how many are actually animating. */
  1738 |     const measure = () =>
  1739 |       page.evaluate(() => {
  1740 |         const packets = Array.from(
  1741 |           document.querySelectorAll<SVGElement>('[data-testid="topology-flow-packet"]'),
  1742 |         )
  1743 |         const animated = packets.filter(el => {
  1744 |           const style = getComputedStyle(el)
  1745 |           return style.animationName !== "none" && style.animationPlayState === "running"
  1746 |         })
  1747 |         return {
  1748 |           honours_query: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  1749 |           packets: packets.length,
  1750 |           animating: animated.length,
  1751 |         }
  1752 |       })
  1753 | 
  1754 |     // A CONTROLLED comparison. The first run of this probe reported
  1755 |     // `packets: 0, animating: 0` under reduced motion and concluded nothing:
  1756 |     // zero animating packets out of zero packets says only that the map drew
  1757 |     // no packets, which is equally consistent with reduced motion working, with
  1758 |     // no flow mode being active, and with the feature being broken outright.
  1759 |     // So the baseline is measured first, in the same browser, on the same page.
  1760 |     const normalLoads = await openMap(page, "reduced-motion-baseline")
  1761 |     const baseline = await measure()
  1762 | 
  1763 |     await page.emulateMedia({ reducedMotion: "reduce" })
  1764 |     const loads = await openMap(page, "reduced-motion")
  1765 |     const state = await measure()
  1766 | 
  1767 |     report("matrix-reduced-motion", {
  1768 |       baseline: { loads: normalLoads, ...baseline },
  1769 |       reduced: { loads, ...state },
  1770 |       page_errors: pageErrors,
  1771 |     })
  1772 |     await shot(page, "c1-matrix-reduced-motion")
  1773 | 
  1774 |     expect(baseline.honours_query, "the baseline load already reported reduced motion").toBe(false)
  1775 |     expect(state.honours_query, "the browser did not report reduced motion").toBe(true)
  1776 |     // Reduced motion may legitimately render the packets and hold them still,
  1777 |     // or not render them at all. What it must never do is leave them running.
  1778 |     expect(
  1779 |       state.animating,
  1780 |       `reduced motion left ${state.animating} flow packets animating ` +
  1781 |         `(baseline drew ${baseline.packets}, of which ${baseline.animating} animated)`,
  1782 |     ).toBe(0)
  1783 |     expect(pageErrors, "reduced motion: uncaught page errors").toEqual([])
  1784 |   })
  1785 | })
  1786 | 
```