# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> inspector identity, refresh status, and the logical-group band across a reload
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:683:7

# Error details

```
Test timeout of 300000ms exceeded.
```

```
Error: locator.click: Test timeout of 300000ms exceeded.
Call log:
  - waiting for getByTestId('topology-estate-map-enlarge')

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
          - generic [ref=e42]: Refresh request submitted; worker status not confirmed.
        - generic [ref=e43]:
          - generic [ref=e44]:
            - generic [ref=e45]: Evidence computed Sep 12, 2026, 12:27 AM
            - generic [ref=e47]: Snapshot 32h old
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
  699 |       try {
  700 |         captured.payload = (await response.json()) as TopologyRisk
  701 |       } catch {
  702 |         // a non-JSON body is reported below as a missing payload
  703 |       }
  704 |     })
  705 | 
  706 |     const mapTab = page.getByTestId("topology-estate-view-map")
  707 |     const blocked = page.getByText(
  708 |       /Topology risk unavailable|No systems available yet|Estate map temporarily unavailable/i,
  709 |     )
  710 | 
  711 |     // A page that will not mount FAILS the probe. Reporting empty readings
  712 |     // instead would render a transport failure as "no resources", which is
  713 |     // the one thing this QA must never do.
  714 |     async function openEstate(label: string): Promise<void> {
  715 |       const loads: Array<{ attempt: number; mounted: boolean; ms: number; reason: string | null }> = []
  716 |       let mounted = false
  717 |       for (let attempt = 1; attempt <= 3 && !mounted; attempt += 1) {
  718 |         const t0 = Date.now()
  719 |         await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  720 |         await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 90_000 })
  721 |         mounted = await mapTab.isVisible().catch(() => false)
  722 |         const reason = mounted
  723 |           ? null
  724 |           : ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
  725 |         loads.push({ attempt, mounted, ms: Date.now() - t0, reason })
  726 |         if (!mounted && attempt < 3) await page.waitForTimeout(8_000)
  727 |       }
  728 |       report(`${label}-loads`, loads)
  729 |       if (!mounted) {
  730 |         await shot(page, `c1-${label}-blocked`)
  731 |         throw new Error(`estate map did not mount for ${label}: ${loads[loads.length - 1]?.reason}`)
  732 |       }
  733 |     }
  734 | 
  735 |     interface RefreshReading {
  736 |       banner: string | null
  737 |       payload_status: string | null
  738 |       refresh_state: string | null
  739 |       stale_reason: string | null
  740 |       last_successful_update_at: string | null
  741 |       snapshot_age_seconds: number | null
  742 |       from_snapshot: boolean | null
  743 |       from_stale_cache: boolean | null
  744 |     }
  745 | 
  746 |     /** The headline strip's refresh sentence beside what the payload claims.
  747 |      *  An absent banner is a legitimate reading — a fresh serve makes no
  748 |      *  claim — but an invented one is not, and neither is silence over a
  749 |      *  payload that says it is stale. */
  750 |     async function readRefresh(label: string): Promise<RefreshReading> {
  751 |       const raw = await page
  752 |         .getByTestId("topology-refresh-status")
  753 |         .first()
  754 |         .textContent()
  755 |         .catch(() => null)
  756 |       const banner = (raw ?? "").replace(/\s+/g, " ").trim() || null
  757 |       const payload = captured.payload as
  758 |         | (TopologyRisk & {
  759 |             staleReason?: string | null
  760 |             last_successful_update_at?: string | null
  761 |             snapshot_age_seconds?: number | null
  762 |             fromStaleCache?: boolean | null
  763 |           })
  764 |         | null
  765 |       const reading: RefreshReading = {
  766 |         banner,
  767 |         payload_status: payload?.status ?? null,
  768 |         refresh_state: payload?.refresh_state ?? null,
  769 |         stale_reason: payload?.staleReason ?? null,
  770 |         last_successful_update_at: payload?.last_successful_update_at ?? null,
  771 |         snapshot_age_seconds: payload?.snapshot_age_seconds ?? null,
  772 |         from_snapshot: payload?.from_snapshot ?? null,
  773 |         from_stale_cache: payload?.fromStaleCache ?? null,
  774 |       }
  775 |       report(`${label}-refresh-status`, reading)
  776 |       // THE defect this release removed.
  777 |       expect(
  778 |         banner ?? "",
  779 |         `${label}: the refresh banner must not print the old hardcoded timeout sentence`,
  780 |       ).not.toContain("backend timeout")
  781 |       // The other half of it: a stale serve that says nothing at all.
  782 |       if (reading.stale_reason) {
  783 |         expect(
  784 |           banner,
  785 |           `${label}: payload carries staleReason=${reading.stale_reason}, so the banner must say something`,
  786 |         ).toBeTruthy()
  787 |       }
  788 |       // "running" is deliberately absent from the closed set: the serving
  789 |       // process cannot prove a worker picked the job up.
  790 |       expect(reading.refresh_state ?? "", `${label}: refresh_state must not claim a running worker`).not.toBe(
  791 |         "running",
  792 |       )
  793 |       return reading
  794 |     }
  795 | 
  796 |     async function enterFullscreen(): Promise<ReturnType<typeof page.getByTestId>> {
  797 |       const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  798 |       if (!(await fullscreen.isVisible().catch(() => false))) {
> 799 |         await page.getByTestId("topology-estate-map-enlarge").click()
      |                                                               ^ Error: locator.click: Test timeout of 300000ms exceeded.
  800 |         await expect(fullscreen).toBeVisible({ timeout: 60_000 })
  801 |         await page.waitForTimeout(1500)
  802 |       }
  803 |       return fullscreen
  804 |     }
  805 | 
  806 |     /** Select the IGW chip and read the id the inspector actually asks about.
  807 |      *  `__igw__` is the CANVAS anchor every egress edge terminates at; it is
  808 |      *  not an AWS resource, and a dossier request carrying it answers
  809 |      *  "InternetGateway __igw__ not found in graph". */
  810 |     async function inspectIgw(label: string) {
  811 |       const fullscreen = await enterFullscreen()
  812 |       const chip = fullscreen.getByTestId("topology-igw-rail-chip").first()
  813 |       const payloadIgws = ((captured.payload?.vpc_topology?.edges?.igws ?? []) as Array<{ id?: string }>)
  814 |         .map(igw => igw?.id)
  815 |         .filter((id): id is string => typeof id === "string" && id.length > 0)
  816 |       const visible = await chip.isVisible().catch(() => false)
  817 |       if (!visible) {
  818 |         report(`${label}-igw-inspector`, { chip: false, payload_igws: payloadIgws })
  819 |         // A payload that carries an IGW must render one to select.
  820 |         expect(payloadIgws, `${label}: payload names IGWs but no chip is on the canvas`).toEqual([])
  821 |         return null
  822 |       }
  823 |       await chip.click()
  824 |       const panel = page.getByTestId("topology-service-detail-panel")
  825 |       await expect(panel).toBeVisible({ timeout: 30_000 })
  826 |       await page.waitForTimeout(1200)
  827 |       const shown = ((await panel
  828 |         .getByTestId("estate-operations-resource-id")
  829 |         .first()
  830 |         .textContent()
  831 |         .catch(() => null)) ?? "")
  832 |         .replace(/\s+/g, " ")
  833 |         .trim()
  834 |       const unresolved = await panel
  835 |         .getByTestId("estate-anchor-identity-unresolved")
  836 |         .first()
  837 |         .isVisible()
  838 |         .catch(() => false)
  839 |       const notFound = await panel
  840 |         .getByText(/not found in graph/i)
  841 |         .first()
  842 |         .isVisible()
  843 |         .catch(() => false)
  844 |       const reading = { chip: true, shown_resource_id: shown || null, unresolved, not_found: notFound, payload_igws: payloadIgws }
  845 |       report(`${label}-igw-inspector`, reading)
  846 |       await shot(page, `c1-${label}-igw-inspector`)
  847 | 
  848 |       // The canvas anchor must never reach the inspector as a resource id.
  849 |       expect(shown, `${label}: the inspector must not ask about the __igw__ canvas anchor`).not.toContain("__igw__")
  850 |       expect(notFound, `${label}: the IGW inspector must not report the gateway as missing from the graph`).toBe(false)
  851 |       if (payloadIgws.length > 0 && !unresolved) {
  852 |         // Whatever it shows must be a gateway the payload actually names.
  853 |         expect(
  854 |           payloadIgws.some(id => shown.includes(id)),
  855 |           `${label}: inspector shows ${shown || "<nothing>"}, payload names ${payloadIgws.join(", ")}`,
  856 |         ).toBe(true)
  857 |       }
  858 |       return reading
  859 |     }
  860 | 
  861 |     /** Close the drawer, select a different chip, and prove the panel follows
  862 |      *  the selection rather than keeping the previous resource. */
  863 |     async function reselect(label: string, previous: string | null) {
  864 |       const fullscreen = await enterFullscreen()
  865 |       await page.keyboard.press("Escape")
  866 |       await page.waitForTimeout(600)
  867 |       const panel = page.getByTestId("topology-service-detail-panel")
  868 |       const closed = !(await panel.isVisible().catch(() => false))
  869 |       const other = fullscreen.getByTestId("topology-service-node-icon").first()
  870 |       const haveOther = await other.isVisible().catch(() => false)
  871 |       let shown: string | null = null
  872 |       if (haveOther) {
  873 |         await other.click()
  874 |         await expect(panel).toBeVisible({ timeout: 30_000 })
  875 |         await page.waitForTimeout(1200)
  876 |         shown = ((await panel
  877 |           .getByTestId("estate-operations-resource-id")
  878 |           .first()
  879 |           .textContent()
  880 |           .catch(() => null)) ?? "")
  881 |           .replace(/\s+/g, " ")
  882 |           .trim() || null
  883 |       }
  884 |       const reading = { closed_on_escape: closed, reselected: haveOther, previous, shown_resource_id: shown }
  885 |       report(`${label}-drawer-reselect`, reading)
  886 |       expect(shown ?? "", `${label}: a reselected node must not show the __igw__ anchor`).not.toContain("__igw__")
  887 |       return reading
  888 |     }
  889 | 
  890 |     /** Logical groups carry their own band and are never counted as gaps. */
  891 |     async function readGroups(label: string) {
  892 |       const fullscreen = await enterFullscreen()
  893 |       const reading = await fullscreen.evaluate(root => {
  894 |         const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()
  895 |         const band = root.querySelector('[data-testid="topology-logical-group-band"]')
  896 |         const area = root.querySelector('[data-testid="topology-unplaced-area"]')
  897 |         const groups = band
  898 |           ? Array.from(band.querySelectorAll<HTMLElement>('[data-testid="topology-logical-group"]'))
  899 |           : []
```