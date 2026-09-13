# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — Step 5 acceptance matrix >> viewport 1366x768: the page never scrolls sideways, and clipping is measured
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:1444:9

# Error details

```
Error: 1366x768: no subnet tiers or cells rendered — the measurement would be vacuous

expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
            - generic [ref=e47]: Snapshot 35h old
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
        - tablist "Estate view" [ref=e76]:
          - tab "Command map" [selected] [ref=e77]
          - tab "Network topology" [ref=e78]
        - generic [ref=e81]:
          - generic [ref=e83]:
            - generic [ref=e84]:
              - generic [ref=e85]:
                - img [ref=e86]
                - text: Estate command map
              - heading "Understand what runs, what it depends on, and where to act." [level=2] [ref=e88]
              - paragraph [ref=e89]: One live operating model for platform engineering, SRE, cloud architecture, and security. Every count and relationship comes from the scoped topology evidence.
            - button "Network placement" [ref=e91]:
              - img [ref=e92]
              - text: Network placement
          - generic [ref=e94]:
            - generic [ref=e95]:
              - generic [ref=e96]: Live estate
              - generic [ref=e97]: "35"
              - generic [ref=e98]: 35 observed relationships
            - generic [ref=e99]:
              - generic [ref=e100]: Reliability
              - generic [ref=e101]: 2 AZ
              - generic [ref=e102]: 2 multi-AZ · 2 single-AZ stateful
            - generic [ref=e103]:
              - generic [ref=e104]: Exposure
              - generic [ref=e105]: "0"
              - generic [ref=e106]: 0 high-risk · 0 crown jewels
            - generic [ref=e107]:
              - generic [ref=e108]: Evidence
              - generic [ref=e109]: 0%
              - generic [ref=e110]: 0 stale · 11 degraded
            - generic [ref=e111]:
              - generic [ref=e112]: Scope
              - generic [ref=e113]: 1 VPC
              - generic [ref=e114]: 1 account · 1 region
          - generic [ref=e116]:
            - generic [ref=e117]:
              - generic [ref=e118]: Operating lens
              - generic [ref=e119]: resources and live dependencies
            - tablist "Estate operating lens" [ref=e120]:
              - tab "Operate" [selected] [ref=e121]:
                - img [ref=e122]
                - text: Operate
              - tab "Reliability" [ref=e124]:
                - img [ref=e125]
                - text: Reliability
              - tab "Security" [ref=e128]:
                - img [ref=e129]
                - text: Security
              - tab "Ownership" [ref=e138]:
                - img [ref=e139]
                - text: Ownership
          - generic [ref=e144]:
            - generic [ref=e145]:
              - generic [ref=e146]:
                - generic [ref=e147]: Architecture flow
                - generic [ref=e148]: Entry → runtime → state, with regional services and control dependencies alongside.
              - generic [ref=e149]:
                - generic [ref=e150]: high risk
                - generic [ref=e152]:
                  - img [ref=e153]
                  - text: crown jewel
                - generic [ref=e155]:
                  - img [ref=e156]
                  - text: shared
            - generic [ref=e162]:
              - generic [ref=e163]:
                - generic [ref=e164]:
                  - generic [ref=e166]:
                    - img [ref=e168]
                    - generic [ref=e175]:
                      - generic [ref=e176]: Edge & ingress
                      - generic [ref=e177]: How requests enter
                    - generic [ref=e178]: "8"
                  - generic [ref=e179]:
                    - button "cyntro-tb-prod-alb-int LoadBalancer · 1 relationship" [ref=e180]:
                      - generic [ref=e181]:
                        - generic "cyntro-tb-prod-alb-int" [ref=e183]
                        - img [ref=e184]
                      - generic [ref=e186]: LoadBalancer · 1 relationship
                    - button "cyntro-tb-prod-alb-pub LoadBalancer · 1 relationship" [ref=e187]:
                      - generic [ref=e188]:
                        - generic "cyntro-tb-prod-alb-pub" [ref=e190]
                        - img [ref=e191]
                      - generic [ref=e193]: LoadBalancer · 1 relationship
                    - button "cyntro-tb-prod-consumer-daily EventBridge · 2 relationships" [ref=e194]:
                      - generic [ref=e195]:
                        - generic "cyntro-tb-prod-consumer-daily" [ref=e197]
                        - img [ref=e198]
                      - generic [ref=e200]: EventBridge · 2 relationships
                    - button "cyntro-tb-prod-consumer-every_6h EventBridge · 2 relationships" [ref=e201]:
                      - generic [ref=e202]:
                        - generic "cyntro-tb-prod-consumer-every_6h" [ref=e204]
                        - img [ref=e205]
                      - generic [ref=e207]: EventBridge · 2 relationships
                    - button "cyntro-tb-prod-consumer-frequent EventBridge · 2 relationships" [ref=e208]:
                      - generic [ref=e209]:
                        - generic "cyntro-tb-prod-consumer-frequent" [ref=e211]
                        - img [ref=e212]
                      - generic [ref=e214]: EventBridge · 2 relationships
                    - button "cyntro-tb-prod-consumer-monthly EventBridge · 2 relationships" [ref=e215]:
                      - generic [ref=e216]:
                        - generic "cyntro-tb-prod-consumer-monthly" [ref=e218]
                        - img [ref=e219]
                      - generic [ref=e221]: EventBridge · 2 relationships
                    - button "cyntro-tb-prod-consumer-nightly_burst EventBridge · 2 relationships" [ref=e222]:
                      - generic [ref=e223]:
                        - generic "cyntro-tb-prod-consumer-nightly_burst" [ref=e225]
                        - img [ref=e226]
                      - generic [ref=e228]: EventBridge · 2 relationships
                    - button "cyntro-tb-prod-consumer-weekly EventBridge · 2 relationships" [ref=e229]:
                      - generic [ref=e230]:
                        - generic "cyntro-tb-prod-consumer-weekly" [ref=e232]
                        - img [ref=e233]
                      - generic [ref=e235]: EventBridge · 2 relationships
                - img [ref=e237]
              - generic [ref=e239]:
                - generic [ref=e240]:
                  - generic [ref=e242]:
                    - img [ref=e244]
                    - generic [ref=e247]:
                      - generic [ref=e248]: Runtime
                      - generic [ref=e249]: What executes the service
                    - generic [ref=e250]: "13"
                  - generic [ref=e251]:
                    - button "cyntro-tb-prod-consumer-monthly Lambda · 2 relationships" [ref=e252]:
                      - generic [ref=e253]:
                        - generic "cyntro-tb-prod-consumer-monthly" [ref=e255]
                        - img [ref=e256]
                      - generic [ref=e258]: Lambda · 2 relationships
                    - button "cyntro-tb-prod-consumer-weekly Lambda · 2 relationships" [ref=e259]:
                      - generic [ref=e260]:
                        - generic "cyntro-tb-prod-consumer-weekly" [ref=e262]
                        - img [ref=e263]
                      - generic [ref=e265]: Lambda · 2 relationships
                    - button "cyntro-tb-prod-loadgen EC2 · 1 relationship" [ref=e266]:
                      - generic [ref=e267]:
                        - generic "cyntro-tb-prod-loadgen" [ref=e269]
                        - img [ref=e270]
                      - generic [ref=e272]: EC2 · 1 relationship
                    - button "cyntro-tb-prod-web EC2 · 2 relationships" [ref=e273]:
                      - generic [ref=e274]:
                        - generic "cyntro-tb-prod-web" [ref=e276]
                        - img [ref=e277]
                      - generic [ref=e279]: EC2 · 2 relationships
                    - button "cyntro-tb-prod-web EC2 · 2 relationships" [ref=e280]:
                      - generic [ref=e281]:
                        - generic "cyntro-tb-prod-web" [ref=e283]
                        - img [ref=e284]
                      - generic [ref=e286]: EC2 · 2 relationships
                    - button "cyntro-tb-prod-app EC2 · 3 relationships" [ref=e287]:
                      - generic [ref=e288]:
                        - generic "cyntro-tb-prod-app" [ref=e290]
                        - img [ref=e291]
                      - generic [ref=e293]: EC2 · 3 relationships
                    - button "cyntro-tb-prod-app EC2 · 3 relationships" [ref=e294]:
                      - generic [ref=e295]:
                        - generic "cyntro-tb-prod-app" [ref=e297]
                        - img [ref=e298]
                      - generic [ref=e300]: EC2 · 3 relationships
                    - button "cyntro-tb-prod-consumer-daily Lambda · 3 relationships" [ref=e301]:
                      - generic [ref=e302]:
                        - generic "cyntro-tb-prod-consumer-daily" [ref=e304]
                        - img [ref=e305]
                      - generic [ref=e307]: Lambda · 3 relationships
                  - generic [ref=e308]: + 5 more in scope
                - img [ref=e310]
              - generic [ref=e312]:
                - generic [ref=e313]:
                  - generic [ref=e315]:
                    - img [ref=e317]
                    - generic [ref=e321]:
                      - generic [ref=e322]: Data & state
                      - generic [ref=e323]: What must survive
                    - generic [ref=e324]: "10"
                  - generic [ref=e325]:
                    - button "arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453 KMSKey · 2 relationships" [ref=e326]:
                      - generic [ref=e327]:
                        - generic "arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453" [ref=e329]
                        - img [ref=e330]
                      - generic [ref=e332]: KMSKey · 2 relationships
                    - button "arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2 KMSKey · 3 relationships" [ref=e333]:
                      - generic [ref=e334]:
                        - generic "arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2" [ref=e336]
                        - img [ref=e337]
                      - generic [ref=e339]: KMSKey · 3 relationships
                    - button "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a KMSKey · 1 relationship" [ref=e340]:
                      - generic [ref=e341]:
                        - generic "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a" [ref=e343]
                        - img [ref=e344]
                      - generic [ref=e346]: KMSKey · 1 relationship
                    - button "cyntro-evidence-testbed-webshop-950952 S3 · 1 relationship" [ref=e347]:
                      - generic [ref=e348]:
                        - generic "cyntro-evidence-testbed-webshop-950952" [ref=e350]
                        - img [ref=e351]
                      - generic [ref=e353]: S3 · 1 relationship
                    - button "cyntro-ingest-head-testbed-webshop DynamoDB · 1 relationship" [ref=e354]:
                      - generic [ref=e355]:
                        - generic "cyntro-ingest-head-testbed-webshop" [ref=e357]
                        - img [ref=e358]
                      - generic [ref=e360]: DynamoDB · 1 relationship
                    - button "cyntro-tb-prod-appdata-1c8276f5 S3 · 5 relationships" [ref=e361]:
                      - generic [ref=e362]:
                        - generic "cyntro-tb-prod-appdata-1c8276f5" [ref=e364]
                        - img [ref=e365]
                      - generic [ref=e367]: S3 · 5 relationships
                    - button "cyntro-tb-prod-aurora RDS · 0 relationships" [ref=e368]:
                      - generic [ref=e369]:
                        - generic "cyntro-tb-prod-aurora" [ref=e371]
                        - img [ref=e372]
                      - generic [ref=e374]: RDS · 0 relationships
                    - button "cyntro-tb-prod-aurora-0 RDS · 1 relationship" [ref=e375]:
                      - generic [ref=e376]:
                        - generic "cyntro-tb-prod-aurora-0" [ref=e378]
                        - img [ref=e379]
                      - generic [ref=e381]: RDS · 1 relationship
                  - generic [ref=e382]: + 2 more in scope
                - img [ref=e384]
              - generic [ref=e387]:
                - generic [ref=e389]:
                  - img [ref=e391]
                  - generic [ref=e402]:
                    - generic [ref=e403]: Control plane
                    - generic [ref=e404]: Regional and supporting services
                  - generic [ref=e405]: "4"
                - generic [ref=e406]:
                  - button "cyntro-tb-prod-tg-app TargetGroup · 3 relationships" [ref=e407]:
                    - generic [ref=e408]:
                      - generic "cyntro-tb-prod-tg-app" [ref=e410]
                      - img [ref=e411]
                    - generic [ref=e413]: TargetGroup · 3 relationships
                  - button "cyntro-tb-prod-tg-web TargetGroup · 3 relationships" [ref=e414]:
                    - generic [ref=e415]:
                      - generic "cyntro-tb-prod-tg-web" [ref=e417]
                      - img [ref=e418]
                    - generic [ref=e420]: TargetGroup · 3 relationships
                  - button "cyntro-testbed-webshop Neptune · 0 relationships" [ref=e421]:
                    - generic [ref=e422]:
                      - generic "cyntro-testbed-webshop" [ref=e424]
                      - img [ref=e425]
                    - generic [ref=e427]: Neptune · 0 relationships
                  - button "cyntro-testbed-webshop-writer Neptune · 1 relationship" [ref=e428]:
                    - generic [ref=e429]:
                      - generic "cyntro-testbed-webshop-writer" [ref=e431]
                      - img [ref=e432]
                    - generic [ref=e434]: Neptune · 1 relationship
            - generic [ref=e435]:
              - generic [ref=e436]:
                - generic [ref=e437]:
                  - img [ref=e438]
                  - generic [ref=e447]:
                    - generic [ref=e448]: Identity control plane
                    - generic [ref=e449]: Roles attached to workloads in this estate scope
                - generic [ref=e450]: 3 material gaps
              - generic [ref=e451]:
                - button "cyntro-tb-prod-loadgen-role 60% gap · 15/25 unused" [ref=e452]:
                  - generic [ref=e453]:
                    - img [ref=e454]
                    - generic [ref=e463]: cyntro-tb-prod-loadgen-role
                  - generic [ref=e464]: 60% gap · 15/25 unused
                - button "cyntro-tb-prod-web-role 59% gap · 17/29 unused" [ref=e465]:
                  - generic [ref=e466]:
                    - img [ref=e467]
                    - generic [ref=e476]: cyntro-tb-prod-web-role
                  - generic [ref=e477]: 59% gap · 17/29 unused
                - button "cyntro-tb-prod-app-role 52% gap · 15/29 unused" [ref=e478]:
                  - generic [ref=e479]:
                    - img [ref=e480]
                    - generic [ref=e489]: cyntro-tb-prod-app-role
                  - generic [ref=e490]: 52% gap · 15/29 unused
                - button "cyntro-tb-prod-consumer-daily 29% gap · 2/7 unused" [ref=e491]:
                  - generic [ref=e492]:
                    - img [ref=e493]
                    - generic [ref=e502]: cyntro-tb-prod-consumer-daily
                  - generic [ref=e503]: 29% gap · 2/7 unused
                - button "cyntro-tb-prod-consumer-every_6h 29% gap · 2/7 unused" [ref=e504]:
                  - generic [ref=e505]:
                    - img [ref=e506]
                    - generic [ref=e515]: cyntro-tb-prod-consumer-every_6h
                  - generic [ref=e516]: 29% gap · 2/7 unused
                - button "cyntro-tb-prod-consumer-frequent 29% gap · 2/7 unused" [ref=e517]:
                  - generic [ref=e518]:
                    - img [ref=e519]
                    - generic [ref=e528]: cyntro-tb-prod-consumer-frequent
                  - generic [ref=e529]: 29% gap · 2/7 unused
            - generic [ref=e530]:
              - generic [ref=e531]:
                - generic [ref=e532]:
                  - generic [ref=e533]:
                    - generic [ref=e534]: Operator brief
                    - generic [ref=e535]: Highest-value checks for the selected lens
                  - img [ref=e536]
                - generic [ref=e539]:
                  - button "cyntro-tb-prod-aurora-0 is observed in one availability zone Validate failover configuration and recovery objectives for this stateful service." [ref=e540]:
                    - generic [ref=e541]:
                      - img [ref=e542]
                      - generic [ref=e545]:
                        - generic [ref=e546]: cyntro-tb-prod-aurora-0 is observed in one availability zone
                        - generic [ref=e547]: Validate failover configuration and recovery objectives for this stateful service.
                      - img [ref=e548]
                  - button "cyntro-tb-prod-loadgen-role has a 60% permission gap 15/25 allowed actions are unused." [ref=e552]:
                    - generic [ref=e553]:
                      - img [ref=e554]
                      - generic [ref=e557]:
                        - generic [ref=e558]: cyntro-tb-prod-loadgen-role has a 60% permission gap
                        - generic [ref=e559]: 15/25 allowed actions are unused.
                      - img [ref=e560]
                  - button "Estate decisions have evidence gaps 0 stale · 11 degraded, low-confidence, or unscored." [ref=e564]:
                    - generic [ref=e565]:
                      - img [ref=e566]
                      - generic [ref=e569]:
                        - generic [ref=e570]: Estate decisions have evidence gaps
                        - generic [ref=e571]: 0 stale · 11 degraded, low-confidence, or unscored.
                  - button "3 VPC-bound resources are missing placement Refresh subnet attachment and ownership metadata before architecture review." [ref=e572]:
                    - generic [ref=e573]:
                      - img [ref=e574]
                      - generic [ref=e577]:
                        - generic [ref=e578]: 3 VPC-bound resources are missing placement
                        - generic [ref=e579]: Refresh subnet attachment and ownership metadata before architecture review.
              - generic [ref=e580]:
                - generic [ref=e581]:
                  - img [ref=e582]
                  - generic [ref=e586]: Estate readiness
                - generic [ref=e587]:
                  - generic [ref=e588]:
                    - generic [ref=e589]: "15"
                    - generic [ref=e590]: open findings
                  - generic [ref=e591]:
                    - generic [ref=e592]: "0"
                    - generic [ref=e593]: ready actions
                  - generic [ref=e594]:
                    - generic [ref=e595]: "0"
                    - generic [ref=e596]: shared resources
                  - generic [ref=e597]:
                    - generic [ref=e598]: "3"
                    - generic [ref=e599]: placement gaps
                - generic [ref=e600]:
                  - img [ref=e601]
                  - text: 0% of resources have posture scores. Evidence freshness is degraded; enforcement should remain gated.
      - complementary [ref=e611]:
        - complementary [ref=e612]:
          - generic [ref=e613]:
            - generic [ref=e614]:
              - heading "Service index" [level=2] [ref=e615]
              - generic [ref=e616]: "35"
            - generic [ref=e617]:
              - img [ref=e618]
              - searchbox "Find service in topology" [ref=e621]
            - button "Filters" [ref=e624]:
              - img [ref=e625]
              - text: Filters
          - list [ref=e627]:
            - listitem [ref=e628]:
              - button "cyntro-tb-prod-appdata-1c8276f5 Current graph data S3 · global · regional 4 in · 1 out Aug 20, 04:53 PM" [ref=e629]:
                - generic [ref=e630]:
                  - img [ref=e632]
                  - generic [ref=e634]:
                    - generic [ref=e635]:
                      - generic [ref=e636]: cyntro-tb-prod-appdata-1c8276f5
                      - generic "Current graph data" [ref=e637]
                    - generic [ref=e639]: S3 · global · regional
                    - generic [ref=e640]:
                      - generic [ref=e641]: 4 in · 1 out
                      - generic [ref=e642]:
                        - img [ref=e643]
                        - text: Aug 20, 04:53 PM
            - listitem [ref=e646]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2 Current graph data KMSKey · global · regional 3 in · 0 out Sep 11, 07:35 PM" [ref=e647]:
                - generic [ref=e648]:
                  - img [ref=e650]
                  - generic [ref=e652]:
                    - generic [ref=e653]:
                      - generic [ref=e654]: arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2
                      - generic "Current graph data" [ref=e655]
                    - generic [ref=e657]: KMSKey · global · regional
                    - generic [ref=e658]:
                      - generic [ref=e659]: 3 in · 0 out
                      - generic [ref=e660]:
                        - img [ref=e661]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e664]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1b · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e665]:
                - generic [ref=e666]:
                  - img [ref=e668]
                  - generic [ref=e670]:
                    - generic [ref=e671]:
                      - generic [ref=e672]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e673]
                    - generic [ref=e675]: EC2 · eu-west-1b · app
                    - generic [ref=e676]:
                      - generic [ref=e677]: 2 in · 1 out
                      - generic [ref=e678]:
                        - img [ref=e679]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e682]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1a · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e683]:
                - generic [ref=e684]:
                  - img [ref=e686]
                  - generic [ref=e688]:
                    - generic [ref=e689]:
                      - generic [ref=e690]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e691]
                    - generic [ref=e693]: EC2 · eu-west-1a · app
                    - generic [ref=e694]:
                      - generic [ref=e695]: 2 in · 1 out
                      - generic [ref=e696]:
                        - img [ref=e697]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e700]:
              - button "cyntro-tb-prod-consumer-daily Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e701]:
                - generic [ref=e702]:
                  - img [ref=e704]
                  - generic [ref=e706]:
                    - generic [ref=e707]:
                      - generic [ref=e708]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e709]
                    - generic [ref=e711]: Lambda · eu-west-1 · regional
                    - generic [ref=e712]:
                      - generic [ref=e713]: 2 in · 1 out
                      - generic [ref=e714]:
                        - img [ref=e715]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e718]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e719]:
                - generic [ref=e720]:
                  - img [ref=e722]
                  - generic [ref=e724]:
                    - generic [ref=e725]:
                      - generic [ref=e726]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e727]
                    - generic [ref=e729]: Lambda · eu-west-1 · regional
                    - generic [ref=e730]:
                      - generic [ref=e731]: 2 in · 1 out
                      - generic [ref=e732]:
                        - img [ref=e733]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e736]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 1, 11:00 AM" [ref=e737]:
                - generic [ref=e738]:
                  - img [ref=e740]
                  - generic [ref=e742]:
                    - generic [ref=e743]:
                      - generic [ref=e744]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e745]
                    - generic [ref=e747]: Lambda · eu-west-1 · regional
                    - generic [ref=e748]:
                      - generic [ref=e749]: 2 in · 1 out
                      - generic [ref=e750]:
                        - img [ref=e751]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e754]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e755]:
                - generic [ref=e756]:
                  - img [ref=e758]
                  - generic [ref=e760]:
                    - generic [ref=e761]:
                      - generic [ref=e762]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e763]
                    - generic [ref=e765]: Lambda · eu-west-1 · regional
                    - generic [ref=e766]:
                      - generic [ref=e767]: 2 in · 1 out
                      - generic [ref=e768]:
                        - img [ref=e769]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e772]:
              - button "cyntro-tb-prod-tg-app Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e773]:
                - generic [ref=e774]:
                  - img [ref=e776]
                  - generic [ref=e778]:
                    - generic [ref=e779]:
                      - generic [ref=e780]: cyntro-tb-prod-tg-app
                      - generic "Current graph data" [ref=e781]
                    - generic [ref=e783]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e784]:
                      - generic [ref=e785]: 1 in · 2 out
                      - generic [ref=e786]:
                        - img [ref=e787]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e790]:
              - button "cyntro-tb-prod-tg-web Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e791]:
                - generic [ref=e792]:
                  - img [ref=e794]
                  - generic [ref=e796]:
                    - generic [ref=e797]:
                      - generic [ref=e798]: cyntro-tb-prod-tg-web
                      - generic "Current graph data" [ref=e799]
                    - generic [ref=e801]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e802]:
                      - generic [ref=e803]: 1 in · 2 out
                      - generic [ref=e804]:
                        - img [ref=e805]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e808]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453 Current graph data KMSKey · global · regional 2 in · 0 out Sep 11, 07:35 PM" [ref=e809]:
                - generic [ref=e810]:
                  - img [ref=e812]
                  - generic [ref=e814]:
                    - generic [ref=e815]:
                      - generic [ref=e816]: arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                      - generic "Current graph data" [ref=e817]
                    - generic [ref=e819]: KMSKey · global · regional
                    - generic [ref=e820]:
                      - generic [ref=e821]: 2 in · 0 out
                      - generic [ref=e822]:
                        - img [ref=e823]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e826]:
              - button "cyntro-tb-prod-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e827]:
                - generic [ref=e828]:
                  - img [ref=e830]
                  - generic [ref=e832]:
                    - generic [ref=e833]:
                      - generic [ref=e834]: cyntro-tb-prod-asg-app
                      - generic "Current graph data" [ref=e835]
                    - generic [ref=e837]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e838]:
                      - generic [ref=e839]: 0 in · 2 out
                      - generic [ref=e840]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e843]:
              - button "cyntro-tb-prod-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e844]:
                - generic [ref=e845]:
                  - img [ref=e847]
                  - generic [ref=e849]:
                    - generic [ref=e850]:
                      - generic [ref=e851]: cyntro-tb-prod-asg-web
                      - generic "Current graph data" [ref=e852]
                    - generic [ref=e854]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e855]:
                      - generic [ref=e856]: 0 in · 2 out
                      - generic [ref=e857]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e860]:
              - button "cyntro-tb-prod-consumer-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e861]:
                - generic [ref=e862]:
                  - img [ref=e864]
                  - generic [ref=e866]:
                    - generic [ref=e867]:
                      - generic [ref=e868]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e869]
                    - generic [ref=e871]: EventBridge · eu-west-1 · regional
                    - generic [ref=e872]:
                      - generic [ref=e873]: 0 in · 2 out
                      - generic [ref=e874]:
                        - img [ref=e875]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e878]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e879]:
                - generic [ref=e880]:
                  - img [ref=e882]
                  - generic [ref=e884]:
                    - generic [ref=e885]:
                      - generic [ref=e886]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e887]
                    - generic [ref=e889]: EventBridge · eu-west-1 · regional
                    - generic [ref=e890]:
                      - generic [ref=e891]: 0 in · 2 out
                      - generic [ref=e892]:
                        - img [ref=e893]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e896]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Sep 1, 11:00 AM" [ref=e897]:
                - generic [ref=e898]:
                  - img [ref=e900]
                  - generic [ref=e902]:
                    - generic [ref=e903]:
                      - generic [ref=e904]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e905]
                    - generic [ref=e907]: EventBridge · eu-west-1 · regional
                    - generic [ref=e908]:
                      - generic [ref=e909]: 0 in · 2 out
                      - generic [ref=e910]:
                        - img [ref=e911]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e914]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e915]:
                - generic [ref=e916]:
                  - img [ref=e918]
                  - generic [ref=e920]:
                    - generic [ref=e921]:
                      - generic [ref=e922]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e923]
                    - generic [ref=e925]: Lambda · eu-west-1 · regional
                    - generic [ref=e926]:
                      - generic [ref=e927]: 2 in · 0 out
                      - generic [ref=e928]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e931]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e932]:
                - generic [ref=e933]:
                  - img [ref=e935]
                  - generic [ref=e937]:
                    - generic [ref=e938]:
                      - generic [ref=e939]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e940]
                    - generic [ref=e942]: EventBridge · eu-west-1 · regional
                    - generic [ref=e943]:
                      - generic [ref=e944]: 0 in · 2 out
                      - generic [ref=e945]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e948]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e949]:
                - generic [ref=e950]:
                  - img [ref=e952]
                  - generic [ref=e954]:
                    - generic [ref=e955]:
                      - generic [ref=e956]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e957]
                    - generic [ref=e959]: EventBridge · eu-west-1 · regional
                    - generic [ref=e960]:
                      - generic [ref=e961]: 0 in · 2 out
                      - generic [ref=e962]:
                        - img [ref=e963]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e966]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out Aug 29, 11:00 AM" [ref=e967]:
                - generic [ref=e968]:
                  - img [ref=e970]
                  - generic [ref=e972]:
                    - generic [ref=e973]:
                      - generic [ref=e974]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e975]
                    - generic [ref=e977]: Lambda · eu-west-1 · regional
                    - generic [ref=e978]:
                      - generic [ref=e979]: 2 in · 0 out
                      - generic [ref=e980]:
                        - img [ref=e981]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e984]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 29, 11:00 AM" [ref=e985]:
                - generic [ref=e986]:
                  - img [ref=e988]
                  - generic [ref=e990]:
                    - generic [ref=e991]:
                      - generic [ref=e992]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e993]
                    - generic [ref=e995]: EventBridge · eu-west-1 · regional
                    - generic [ref=e996]:
                      - generic [ref=e997]: 0 in · 2 out
                      - generic [ref=e998]:
                        - img [ref=e999]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e1002]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1a · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e1003]:
                - generic [ref=e1004]:
                  - img [ref=e1006]
                  - generic [ref=e1008]:
                    - generic [ref=e1009]:
                      - generic [ref=e1010]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e1011]
                    - generic [ref=e1013]: EC2 · eu-west-1a · web
                    - generic [ref=e1014]:
                      - generic [ref=e1015]: 2 in · 0 out
                      - generic [ref=e1016]:
                        - img [ref=e1017]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e1020]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1b · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e1021]:
                - generic [ref=e1022]:
                  - img [ref=e1024]
                  - generic [ref=e1026]:
                    - generic [ref=e1027]:
                      - generic [ref=e1028]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e1029]
                    - generic [ref=e1031]: EC2 · eu-west-1b · web
                    - generic [ref=e1032]:
                      - generic [ref=e1033]: 2 in · 0 out
                      - generic [ref=e1034]:
                        - img [ref=e1035]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e1038]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a Current graph data KMSKey · global · regional 1 in · 0 out No runtime timestamp" [ref=e1039]:
                - generic [ref=e1040]:
                  - img [ref=e1042]
                  - generic [ref=e1044]:
                    - generic [ref=e1045]:
                      - generic [ref=e1046]: arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a
                      - generic "Current graph data" [ref=e1047]
                    - generic [ref=e1049]: KMSKey · global · regional
                    - generic [ref=e1050]:
                      - generic [ref=e1051]: 1 in · 0 out
                      - generic [ref=e1052]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1055]:
              - button "cyntro-evidence-testbed-webshop-950952 Current graph data S3 · global · regional 0 in · 1 out No runtime timestamp" [ref=e1056]:
                - generic [ref=e1057]:
                  - img [ref=e1059]
                  - generic [ref=e1061]:
                    - generic [ref=e1062]:
                      - generic [ref=e1063]: cyntro-evidence-testbed-webshop-950952
                      - generic "Current graph data" [ref=e1064]
                    - generic [ref=e1066]: S3 · global · regional
                    - generic [ref=e1067]:
                      - generic [ref=e1068]: 0 in · 1 out
                      - generic [ref=e1069]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1072]:
              - button "cyntro-ingest-head-testbed-webshop Current graph data DynamoDB · eu-west-1 · regional 0 in · 1 out No runtime timestamp" [ref=e1073]:
                - generic [ref=e1074]:
                  - img [ref=e1076]
                  - generic [ref=e1078]:
                    - generic [ref=e1079]:
                      - generic [ref=e1080]: cyntro-ingest-head-testbed-webshop
                      - generic "Current graph data" [ref=e1081]
                    - generic [ref=e1083]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1084]:
                      - generic [ref=e1085]: 0 in · 1 out
                      - generic [ref=e1086]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1089]:
              - button "cyntro-tb-prod-alb-int Current graph data LoadBalancer · eu-west-1a · app 0 in · 1 out No runtime timestamp" [ref=e1090]:
                - generic [ref=e1091]:
                  - img [ref=e1093]
                  - generic [ref=e1095]:
                    - generic [ref=e1096]:
                      - generic [ref=e1097]: cyntro-tb-prod-alb-int
                      - generic "Current graph data" [ref=e1098]
                    - generic [ref=e1100]: LoadBalancer · eu-west-1a · app
                    - generic [ref=e1101]:
                      - generic [ref=e1102]: 0 in · 1 out
                      - generic [ref=e1103]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1106]:
              - button "cyntro-tb-prod-alb-pub Current graph data LoadBalancer · eu-west-1a · web 0 in · 1 out No runtime timestamp" [ref=e1107]:
                - generic [ref=e1108]:
                  - img [ref=e1110]
                  - generic [ref=e1112]:
                    - generic [ref=e1113]:
                      - generic [ref=e1114]: cyntro-tb-prod-alb-pub
                      - generic "Current graph data" [ref=e1115]
                    - generic [ref=e1117]: LoadBalancer · eu-west-1a · web
                    - generic [ref=e1118]:
                      - generic [ref=e1119]: 0 in · 1 out
                      - generic [ref=e1120]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1123]:
              - button "cyntro-tb-prod-aurora-0 Current graph data RDS · eu-west-1b · data 0 in · 1 out Sep 11, 07:35 PM" [ref=e1124]:
                - generic [ref=e1125]:
                  - img [ref=e1127]
                  - generic [ref=e1129]:
                    - generic [ref=e1130]:
                      - generic [ref=e1131]: cyntro-tb-prod-aurora-0
                      - generic "Current graph data" [ref=e1132]
                    - generic [ref=e1134]: RDS · eu-west-1b · data
                    - generic [ref=e1135]:
                      - generic [ref=e1136]: 0 in · 1 out
                      - generic [ref=e1137]:
                        - img [ref=e1138]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e1141]:
              - button "cyntro-tb-prod-aurora-1 Current graph data RDS · eu-west-1a · data 0 in · 1 out Sep 11, 07:35 PM" [ref=e1142]:
                - generic [ref=e1143]:
                  - img [ref=e1145]
                  - generic [ref=e1147]:
                    - generic [ref=e1148]:
                      - generic [ref=e1149]: cyntro-tb-prod-aurora-1
                      - generic "Current graph data" [ref=e1150]
                    - generic [ref=e1152]: RDS · eu-west-1a · data
                    - generic [ref=e1153]:
                      - generic [ref=e1154]: 0 in · 1 out
                      - generic [ref=e1155]:
                        - img [ref=e1156]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e1159]:
              - button "cyntro-tb-prod-loadgen Current graph data EC2 · eu-west-1a · app 0 in · 1 out Aug 18, 06:57 PM" [ref=e1160]:
                - generic [ref=e1161]:
                  - img [ref=e1163]
                  - generic [ref=e1165]:
                    - generic [ref=e1166]:
                      - generic [ref=e1167]: cyntro-tb-prod-loadgen
                      - generic "Current graph data" [ref=e1168]
                    - generic [ref=e1170]: EC2 · eu-west-1a · app
                    - generic [ref=e1171]:
                      - generic [ref=e1172]: 0 in · 1 out
                      - generic [ref=e1173]:
                        - img [ref=e1174]
                        - text: Aug 18, 06:57 PM
            - listitem [ref=e1177]:
              - button "cyntro-testbed-webshop-writer Current graph data Neptune · eu-west-1a · web 0 in · 1 out Sep 11, 07:35 PM" [ref=e1178]:
                - generic [ref=e1179]:
                  - img [ref=e1181]
                  - generic [ref=e1183]:
                    - generic [ref=e1184]:
                      - generic [ref=e1185]: cyntro-testbed-webshop-writer
                      - generic "Current graph data" [ref=e1186]
                    - generic [ref=e1188]: Neptune · eu-west-1a · web
                    - generic [ref=e1189]:
                      - generic [ref=e1190]: 0 in · 1 out
                      - generic [ref=e1191]:
                        - img [ref=e1192]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e1195]:
              - button "cyntro-tb-prod-aurora Current graph data RDS · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1196]:
                - generic [ref=e1197]:
                  - img [ref=e1199]
                  - generic [ref=e1202]:
                    - generic [ref=e1203]:
                      - generic [ref=e1204]: cyntro-tb-prod-aurora
                      - generic "Current graph data" [ref=e1205]
                    - generic [ref=e1207]: RDS · eu-west-1 · regional
                    - generic [ref=e1208]:
                      - generic [ref=e1209]: 0 in · 0 out
                      - generic [ref=e1210]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1213]:
              - button "cyntro-tb-prod-logs-1c8276f5 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp" [ref=e1214]:
                - generic [ref=e1215]:
                  - img [ref=e1217]
                  - generic [ref=e1220]:
                    - generic [ref=e1221]:
                      - generic [ref=e1222]: cyntro-tb-prod-logs-1c8276f5
                      - generic "Current graph data" [ref=e1223]
                    - generic [ref=e1225]: S3 · global · regional
                    - generic [ref=e1226]:
                      - generic [ref=e1227]: 0 in · 0 out
                      - generic [ref=e1228]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1231]:
              - button "cyntro-testbed-webshop Current graph data Neptune · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1232]:
                - generic [ref=e1233]:
                  - img [ref=e1235]
                  - generic [ref=e1238]:
                    - generic [ref=e1239]:
                      - generic [ref=e1240]: cyntro-testbed-webshop
                      - generic "Current graph data" [ref=e1241]
                    - generic [ref=e1243]: Neptune · eu-west-1 · regional
                    - generic [ref=e1244]:
                      - generic [ref=e1245]: 0 in · 0 out
                      - generic [ref=e1246]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1249]:
      - text: Live read from
      - generic [ref=e1250]: /api/topology-risk/testbed-webshop
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1251]
```

# Test source

```ts
  1404 |  *
  1405 |  * Two rules this block holds itself to:
  1406 |  *
  1407 |  *   1. FAIL CLOSED ON AN EMPTY MATCH. A selector that matches nothing makes an
  1408 |  *      iteration assertion vacuously true, which reads as a pass. Every loop
  1409 |  *      below asserts its population is non-empty BEFORE measuring it.
  1410 |  *   2. ASSERT ONLY WHAT IS UNAMBIGUOUS; REPORT THE REST. A map pane that
  1411 |  *      scrolls horizontally is a legitimate design; the PAGE BODY doing so is
  1412 |  *      not. So overflow is asserted at the document and reported per element,
  1413 |  *      and the report is the evidence for a human judgement rather than a
  1414 |  *      threshold invented here.
  1415 |  */
  1416 | test.describe("C1 live QA — Step 5 acceptance matrix", () => {
  1417 |   /** Viewports named the way the acceptance list names them. The narrow one is
  1418 |    *  a real desktop-narrow, not a phone: this map is a desktop surface and a
  1419 |    *  phone-width claim would be a check nobody asked for. */
  1420 |   const VIEWPORTS = [
  1421 |     { name: "1366x768", width: 1366, height: 768 },
  1422 |     { name: "1600x900", width: 1600, height: 900 },
  1423 |     { name: "narrow-1024x720", width: 1024, height: 720 },
  1424 |   ] as const
  1425 | 
  1426 |   /** Open the estate map and wait for it to mount, the same retry an operator
  1427 |    *  makes: an uncached topology-risk on C1 runs close to the proxy ceiling,
  1428 |    *  so the first load can land on the loading card. Returns how many loads it
  1429 |    *  took, so a slow mount is reported rather than hidden by the retry. */
  1430 |   async function openMap(page: Page, label: string): Promise<number> {
  1431 |     const mapTab = page.getByTestId("topology-estate-view-map")
  1432 |     const blocked = page.getByText(
  1433 |       /Topology risk unavailable|No systems available yet|Estate map temporarily unavailable/i,
  1434 |     )
  1435 |     for (let attempt = 1; attempt <= 3; attempt += 1) {
  1436 |       await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  1437 |       await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 90_000 })
  1438 |       if (await mapTab.isVisible().catch(() => false)) return attempt
  1439 |     }
  1440 |     throw new Error(`${label}: estate map did not mount in 3 loads`)
  1441 |   }
  1442 | 
  1443 |   for (const vp of VIEWPORTS) {
  1444 |     test(`viewport ${vp.name}: the page never scrolls sideways, and clipping is measured`, async ({
  1445 |       context,
  1446 |       page,
  1447 |     }) => {
  1448 |       test.setTimeout(300_000)
  1449 |       await seedAuthCookie(context)
  1450 |       await page.setViewportSize({ width: vp.width, height: vp.height })
  1451 |       const pageErrors: string[] = []
  1452 |       page.on("pageerror", error => pageErrors.push(String(error.message ?? error)))
  1453 | 
  1454 |       const loads = await openMap(page, vp.name)
  1455 | 
  1456 |       const geometry = await page.evaluate(() => {
  1457 |         const doc = document.documentElement
  1458 |         /** How far past its scroll container's visible right edge an element
  1459 |          *  sits. Positive means part of it cannot be reached without
  1460 |          *  scrolling that container. */
  1461 |         const clip = (selector: string) =>
  1462 |           Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${selector}"]`)).map(
  1463 |             el => {
  1464 |               let parent = el.parentElement
  1465 |               while (
  1466 |                 parent &&
  1467 |                 parent !== document.body &&
  1468 |                 getComputedStyle(parent).overflowX === "visible"
  1469 |               ) {
  1470 |                 parent = parent.parentElement
  1471 |               }
  1472 |               const box = el.getBoundingClientRect()
  1473 |               const host = (parent ?? document.body).getBoundingClientRect()
  1474 |               return {
  1475 |                 width: Math.round(box.width),
  1476 |                 overflow_right_px: Math.round(box.right - host.right),
  1477 |                 clipped_by_viewport_px: Math.round(box.right - window.innerWidth),
  1478 |               }
  1479 |             },
  1480 |           )
  1481 |         return {
  1482 |           inner_width: window.innerWidth,
  1483 |           doc_scroll_width: doc.scrollWidth,
  1484 |           body_scroll_width: document.body.scrollWidth,
  1485 |           horizontal_page_scroll_px: Math.max(
  1486 |             0,
  1487 |             Math.max(doc.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  1488 |           ),
  1489 |           tier_stacks: clip("topology-tier-stack"),
  1490 |           subnet_cells: clip("topology-subnet-cell-chrome"),
  1491 |           rails: clip("topology-edge-services-rail"),
  1492 |           vpc_frames: clip("topology-vpc-frame"),
  1493 |         }
  1494 |       })
  1495 | 
  1496 |       report(`matrix-viewport-${vp.name}`, { loads, page_errors: pageErrors, ...geometry })
  1497 |       await shot(page, `c1-matrix-${vp.name}`)
  1498 | 
  1499 |       // Fail closed: an empty population would make every clipping number
  1500 |       // below trivially absent, which would read as "nothing is clipped".
  1501 |       expect(
  1502 |         geometry.tier_stacks.length + geometry.subnet_cells.length,
  1503 |         `${vp.name}: no subnet tiers or cells rendered — the measurement would be vacuous`,
> 1504 |       ).toBeGreaterThan(0)
       |         ^ Error: 1366x768: no subnet tiers or cells rendered — the measurement would be vacuous
  1505 | 
  1506 |       // The one unambiguous rule. A pane may scroll; the page may not.
  1507 |       expect(
  1508 |         geometry.horizontal_page_scroll_px,
  1509 |         `${vp.name}: the page body scrolls horizontally by ${geometry.horizontal_page_scroll_px}px`,
  1510 |       ).toBeLessThanOrEqual(1)
  1511 | 
  1512 |       expect(pageErrors, `${vp.name}: uncaught page errors`).toEqual([])
  1513 |     })
  1514 |   }
  1515 | 
  1516 |   test("five reloads: the map mounts every time and the scope never silently drops", async ({
  1517 |     context,
  1518 |     page,
  1519 |   }) => {
  1520 |     test.setTimeout(600_000)
  1521 |     await seedAuthCookie(context)
  1522 |     await page.setViewportSize({ width: 1600, height: 900 })
  1523 | 
  1524 |     const riskUrls: string[] = []
  1525 |     page.on("request", request => {
  1526 |       const href = request.url()
  1527 |       if (href.includes("/api/proxy/topology-risk/")) riskUrls.push(href)
  1528 |     })
  1529 | 
  1530 |     const reloads: Array<{
  1531 |       reload: number
  1532 |       loads: number
  1533 |       url_scope: Record<string, string | null>
  1534 |       risk_requests: number
  1535 |     }> = []
  1536 | 
  1537 |     for (let i = 1; i <= 5; i += 1) {
  1538 |       riskUrls.length = 0
  1539 |       const loads = await openMap(page, `reload-${i}`)
  1540 |       const url = new URL(page.url())
  1541 |       reloads.push({
  1542 |         reload: i,
  1543 |         loads,
  1544 |         url_scope: {
  1545 |           systemName: url.searchParams.get("systemName"),
  1546 |           customer_id: url.searchParams.get("customer_id"),
  1547 |           account_id: url.searchParams.get("account_id"),
  1548 |           region: url.searchParams.get("region"),
  1549 |         },
  1550 |         risk_requests: riskUrls.length,
  1551 |       })
  1552 | 
  1553 |       // Scope retention: the address bar still describes the scope the
  1554 |       // operator asked for. A dropped param is how a tenant-scoped view
  1555 |       // silently becomes an unscoped one.
  1556 |       expect(url.searchParams.get("systemName"), `reload ${i}: systemName`).toBe(SYSTEM)
  1557 |       expect(url.searchParams.get("account_id"), `reload ${i}: account_id`).toBe(ACCOUNT)
  1558 |       expect(url.searchParams.get("region"), `reload ${i}: region`).toBe(REGION)
  1559 | 
  1560 |       // And the read the page actually fired carried it too — the URL can be
  1561 |       // right while the fetch is not, which is the failure that matters.
  1562 |       const unscoped = riskUrls.filter(
  1563 |         href => !href.includes("account_id=") || !href.includes("region="),
  1564 |       )
  1565 |       expect(unscoped, `reload ${i}: unscoped topology-risk GET`).toEqual([])
  1566 |     }
  1567 | 
  1568 |     report("matrix-five-reloads", reloads)
  1569 |     expect(reloads).toHaveLength(5)
  1570 |   })
  1571 | 
  1572 |   test("keyboard: Escape closes the drawer, then fullscreen, and focus comes back", async ({
  1573 |     context,
  1574 |     page,
  1575 |   }) => {
  1576 |     test.setTimeout(300_000)
  1577 |     await seedAuthCookie(context)
  1578 |     await page.setViewportSize({ width: 1600, height: 900 })
  1579 |     await openMap(page, "keyboard")
  1580 | 
  1581 |     const enlarge = page.getByTestId("topology-estate-map-enlarge")
  1582 |     await enlarge.click()
  1583 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  1584 |     await expect(fullscreen).toBeVisible({ timeout: 60_000 })
  1585 | 
  1586 |     // A chip opens the detail drawer. Fail closed: if nothing is clickable the
  1587 |     // rest of this test proves nothing, so say so rather than skipping quietly.
  1588 |     const chips = fullscreen.getByTestId("topology-chip-label")
  1589 |     const chipCount = await chips.count()
  1590 |     expect(chipCount, "no chips rendered — the drawer path cannot be exercised").toBeGreaterThan(0)
  1591 |     await chips.first().click()
  1592 | 
  1593 |     const drawer = page.getByTestId("topology-service-detail-panel")
  1594 |     const drawerOpened = await drawer.isVisible({ timeout: 15_000 }).catch(() => false)
  1595 |     report("matrix-keyboard-drawer", { chips: chipCount, drawer_opened: drawerOpened })
  1596 | 
  1597 |     if (drawerOpened) {
  1598 |       // Escape dismisses the TOPMOST surface first. Before this shipped, the
  1599 |       // drawer swallowed the click and nothing dismissed it, which is what
  1600 |       // made probe 3 time out (run 34747728564) — the product defect, not a
  1601 |       // flaky probe.
  1602 |       await page.keyboard.press("Escape")
  1603 |       await expect(drawer).toBeHidden({ timeout: 15_000 })
  1604 |       await expect(fullscreen).toBeVisible()
```