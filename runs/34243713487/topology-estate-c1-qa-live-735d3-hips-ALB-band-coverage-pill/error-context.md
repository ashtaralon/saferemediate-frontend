# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:278:7

# Error details

```
Error: Estate must not add vpc_id when the opening URL did not ask for one

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "https://cyntro-c1.vercel.app/api/proxy/topology-risk/testbed-webshop?customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1&vpc_id=vpc-0c39cde96f29f8f4e",
+ ]
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
          - generic [ref=e41]: scored 2026-09-08T11:35:24Z · 0 flagged · posture_correlated_at >= now() - 7d on any workload · VPC vpc-0c39cde96f29f8f4e · cached locally · backend timeout — serving stale
        - generic [ref=e42]:
          - generic [ref=e43]:
            - generic [ref=e44]: Evidence computed Sep 8, 2026, 11:35 AM
            - generic [ref=e46]: Snapshot 4h old
          - button "System stats" [ref=e47]
    - generic [ref=e48]:
      - generic [ref=e49]: VPC scope
      - combobox "VPC scope" [ref=e50]:
        - option "All VPCs · Compare"
        - option "cyntro-tb-prod-vpc · vpc-0c39cde96f29f8f4e (7 workloads)" [selected]
      - generic [ref=e51]: Subnet-linked compute in tier cells; regional/serverless on the right rail.
    - generic [ref=e52]:
      - generic [ref=e53]: Availability zones
      - button "eu-west-1a" [pressed] [ref=e54]
      - button "eu-west-1b" [pressed] [ref=e55]
    - generic [ref=e56]:
      - generic "EC2 / RDS / LoadBalancer in the selected VPC" [ref=e57]: In this VPC
      - button "EC2 (5)" [pressed] [ref=e58]
      - button "RDS (3)" [pressed] [ref=e59]
      - button "LoadBalancer (2)" [pressed] [ref=e60]
      - button "TargetGroup (2)" [pressed] [ref=e61]
      - button "Neptune (2)" [pressed] [ref=e62]
      - generic "Regional services are system-wide. Lambda inventory is system-wide too, while placement distinguishes VPC-attached functions from non-VPC-attached runtimes." [ref=e63]: System-wide
      - button "Lambda (6)" [pressed] [ref=e64]
      - button "EventBridge (6)" [pressed] [ref=e65]
      - button "S3 (3)" [pressed] [ref=e66]
      - button "DynamoDB (1)" [pressed] [ref=e67]
      - button "Show all" [ref=e68]
      - button "Clear all" [ref=e69]
    - generic [ref=e70]:
      - main [ref=e71]:
        - tablist "Estate view" [ref=e73]:
          - tab "Command map" [selected] [ref=e74]
          - tab "Network topology" [ref=e75]
        - generic [ref=e78]:
          - generic [ref=e80]:
            - generic [ref=e81]:
              - generic [ref=e82]:
                - img [ref=e83]
                - text: Estate command map
              - heading "Understand what runs, what it depends on, and where to act." [level=2] [ref=e85]
              - paragraph [ref=e86]: One live operating model for platform engineering, SRE, cloud architecture, and security. Every count and relationship comes from the scoped topology evidence.
            - button "Network placement" [ref=e88]:
              - img [ref=e89]
              - text: Network placement
          - generic [ref=e91]:
            - generic [ref=e92]:
              - generic [ref=e93]: Live estate
              - generic [ref=e94]: "30"
              - generic [ref=e95]: 25 observed relationships
            - generic [ref=e96]:
              - generic [ref=e97]: Reliability
              - generic [ref=e98]: 2 AZ
              - generic [ref=e99]: 5 multi-AZ · 0 single-AZ stateful
            - generic [ref=e100]:
              - generic [ref=e101]: Exposure
              - generic [ref=e102]: "0"
              - generic [ref=e103]: 0 high-risk · 0 crown jewels
            - generic [ref=e104]:
              - generic [ref=e105]: Evidence
              - generic [ref=e106]: 0%
              - generic [ref=e107]: 0 stale · 11 degraded
            - generic [ref=e108]:
              - generic [ref=e109]: Scope
              - generic [ref=e110]: 1 VPC
              - generic [ref=e111]: 1 account · 1 region
          - generic [ref=e113]:
            - generic [ref=e114]:
              - generic [ref=e115]: Operating lens
              - generic [ref=e116]: resources and live dependencies
            - tablist "Estate operating lens" [ref=e117]:
              - tab "Operate" [selected] [ref=e118]:
                - img [ref=e119]
                - text: Operate
              - tab "Reliability" [ref=e121]:
                - img [ref=e122]
                - text: Reliability
              - tab "Security" [ref=e125]:
                - img [ref=e126]
                - text: Security
              - tab "Ownership" [ref=e135]:
                - img [ref=e136]
                - text: Ownership
          - generic [ref=e141]:
            - generic [ref=e142]:
              - generic [ref=e143]:
                - generic [ref=e144]: Architecture flow
                - generic [ref=e145]: Entry → runtime → state, with regional services and control dependencies alongside.
              - generic [ref=e146]:
                - generic [ref=e147]: high risk
                - generic [ref=e149]:
                  - img [ref=e150]
                  - text: crown jewel
                - generic [ref=e152]:
                  - img [ref=e153]
                  - text: shared
            - generic [ref=e159]:
              - generic [ref=e160]:
                - generic [ref=e161]:
                  - generic [ref=e163]:
                    - img [ref=e165]
                    - generic [ref=e172]:
                      - generic [ref=e173]: Edge & ingress
                      - generic [ref=e174]: How requests enter
                    - generic [ref=e175]: "8"
                  - generic [ref=e176]:
                    - button "cyntro-tb-prod-alb-int LoadBalancer · 1 relationship" [ref=e177]:
                      - generic [ref=e178]:
                        - generic "cyntro-tb-prod-alb-int" [ref=e180]
                        - img [ref=e181]
                      - generic [ref=e183]: LoadBalancer · 1 relationship
                    - button "cyntro-tb-prod-alb-pub LoadBalancer · 1 relationship" [ref=e184]:
                      - generic [ref=e185]:
                        - generic "cyntro-tb-prod-alb-pub" [ref=e187]
                        - img [ref=e188]
                      - generic [ref=e190]: LoadBalancer · 1 relationship
                    - button "cyntro-tb-prod-consumer-daily EventBridge · 2 relationships" [ref=e191]:
                      - generic [ref=e192]:
                        - generic "cyntro-tb-prod-consumer-daily" [ref=e194]
                        - img [ref=e195]
                      - generic [ref=e197]: EventBridge · 2 relationships
                    - button "cyntro-tb-prod-consumer-every_6h EventBridge · 2 relationships" [ref=e198]:
                      - generic [ref=e199]:
                        - generic "cyntro-tb-prod-consumer-every_6h" [ref=e201]
                        - img [ref=e202]
                      - generic [ref=e204]: EventBridge · 2 relationships
                    - button "cyntro-tb-prod-consumer-frequent EventBridge · 2 relationships" [ref=e205]:
                      - generic [ref=e206]:
                        - generic "cyntro-tb-prod-consumer-frequent" [ref=e208]
                        - img [ref=e209]
                      - generic [ref=e211]: EventBridge · 2 relationships
                    - button "cyntro-tb-prod-consumer-monthly EventBridge · 2 relationships" [ref=e212]:
                      - generic [ref=e213]:
                        - generic "cyntro-tb-prod-consumer-monthly" [ref=e215]
                        - img [ref=e216]
                      - generic [ref=e218]: EventBridge · 2 relationships
                    - button "cyntro-tb-prod-consumer-nightly_burst EventBridge · 2 relationships" [ref=e219]:
                      - generic [ref=e220]:
                        - generic "cyntro-tb-prod-consumer-nightly_burst" [ref=e222]
                        - img [ref=e223]
                      - generic [ref=e225]: EventBridge · 2 relationships
                    - button "cyntro-tb-prod-consumer-weekly EventBridge · 2 relationships" [ref=e226]:
                      - generic [ref=e227]:
                        - generic "cyntro-tb-prod-consumer-weekly" [ref=e229]
                        - img [ref=e230]
                      - generic [ref=e232]: EventBridge · 2 relationships
                - img [ref=e234]
              - generic [ref=e236]:
                - generic [ref=e237]:
                  - generic [ref=e239]:
                    - img [ref=e241]
                    - generic [ref=e244]:
                      - generic [ref=e245]: Runtime
                      - generic [ref=e246]: What executes the service
                    - generic [ref=e247]: "11"
                  - generic [ref=e248]:
                    - button "cyntro-tb-prod-consumer-monthly Lambda · 2 relationships" [ref=e249]:
                      - generic [ref=e250]:
                        - generic "cyntro-tb-prod-consumer-monthly" [ref=e252]
                        - img [ref=e253]
                      - generic [ref=e255]: Lambda · 2 relationships
                    - button "cyntro-tb-prod-consumer-weekly Lambda · 2 relationships" [ref=e256]:
                      - generic [ref=e257]:
                        - generic "cyntro-tb-prod-consumer-weekly" [ref=e259]
                        - img [ref=e260]
                      - generic [ref=e262]: Lambda · 2 relationships
                    - button "cyntro-tb-prod-loadgen EC2 · 1 relationship" [ref=e263]:
                      - generic [ref=e264]:
                        - generic "cyntro-tb-prod-loadgen" [ref=e266]
                        - img [ref=e267]
                      - generic [ref=e269]: EC2 · 1 relationship
                    - button "cyntro-tb-prod-web EC2 · 1 relationship" [ref=e270]:
                      - generic [ref=e271]:
                        - generic "cyntro-tb-prod-web" [ref=e273]
                        - img [ref=e274]
                      - generic [ref=e276]: EC2 · 1 relationship
                    - button "cyntro-tb-prod-web EC2 · 1 relationship" [ref=e277]:
                      - generic [ref=e278]:
                        - generic "cyntro-tb-prod-web" [ref=e280]
                        - img [ref=e281]
                      - generic [ref=e283]: EC2 · 1 relationship
                    - button "cyntro-tb-prod-app EC2 · 2 relationships" [ref=e284]:
                      - generic [ref=e285]:
                        - generic "cyntro-tb-prod-app" [ref=e287]
                        - img [ref=e288]
                      - generic [ref=e290]: EC2 · 2 relationships
                    - button "cyntro-tb-prod-app EC2 · 2 relationships" [ref=e291]:
                      - generic [ref=e292]:
                        - generic "cyntro-tb-prod-app" [ref=e294]
                        - img [ref=e295]
                      - generic [ref=e297]: EC2 · 2 relationships
                    - button "cyntro-tb-prod-consumer-daily Lambda · 3 relationships" [ref=e298]:
                      - generic [ref=e299]:
                        - generic "cyntro-tb-prod-consumer-daily" [ref=e301]
                        - img [ref=e302]
                      - generic [ref=e304]: Lambda · 3 relationships
                  - generic [ref=e305]: + 3 more in scope
                - img [ref=e307]
              - generic [ref=e309]:
                - generic [ref=e310]:
                  - generic [ref=e312]:
                    - img [ref=e314]
                    - generic [ref=e318]:
                      - generic [ref=e319]: Data & state
                      - generic [ref=e320]: What must survive
                    - generic [ref=e321]: "7"
                  - generic [ref=e322]:
                    - button "cyntro-evidence-testbed-webshop-950952 S3 · 0 relationships" [ref=e323]:
                      - generic [ref=e324]:
                        - generic "cyntro-evidence-testbed-webshop-950952" [ref=e326]
                        - img [ref=e327]
                      - generic [ref=e329]: S3 · 0 relationships
                    - button "cyntro-ingest-head-testbed-webshop DynamoDB · 0 relationships" [ref=e330]:
                      - generic [ref=e331]:
                        - generic "cyntro-ingest-head-testbed-webshop" [ref=e333]
                        - img [ref=e334]
                      - generic [ref=e336]: DynamoDB · 0 relationships
                    - button "cyntro-tb-prod-appdata-1c8276f5 S3 · 4 relationships" [ref=e337]:
                      - generic [ref=e338]:
                        - generic "cyntro-tb-prod-appdata-1c8276f5" [ref=e340]
                        - img [ref=e341]
                      - generic [ref=e343]: S3 · 4 relationships
                    - button "cyntro-tb-prod-aurora RDS · 0 relationships" [ref=e344]:
                      - generic [ref=e345]:
                        - generic "cyntro-tb-prod-aurora" [ref=e347]
                        - img [ref=e348]
                      - generic [ref=e350]: RDS · 0 relationships
                    - button "cyntro-tb-prod-aurora-0 RDS · 0 relationships" [ref=e351]:
                      - generic [ref=e352]:
                        - generic "cyntro-tb-prod-aurora-0" [ref=e354]
                        - img [ref=e355]
                      - generic [ref=e357]: RDS · 0 relationships
                    - button "cyntro-tb-prod-aurora-1 RDS · 0 relationships" [ref=e358]:
                      - generic [ref=e359]:
                        - generic "cyntro-tb-prod-aurora-1" [ref=e361]
                        - img [ref=e362]
                      - generic [ref=e364]: RDS · 0 relationships
                    - button "cyntro-tb-prod-logs-1c8276f5 S3 · 0 relationships" [ref=e365]:
                      - generic [ref=e366]:
                        - generic "cyntro-tb-prod-logs-1c8276f5" [ref=e368]
                        - img [ref=e369]
                      - generic [ref=e371]: S3 · 0 relationships
                - img [ref=e373]
              - generic [ref=e376]:
                - generic [ref=e378]:
                  - img [ref=e380]
                  - generic [ref=e391]:
                    - generic [ref=e392]: Control plane
                    - generic [ref=e393]: Regional and supporting services
                  - generic [ref=e394]: "4"
                - generic [ref=e395]:
                  - button "cyntro-tb-prod-tg-app TargetGroup · 3 relationships" [ref=e396]:
                    - generic [ref=e397]:
                      - generic "cyntro-tb-prod-tg-app" [ref=e399]
                      - img [ref=e400]
                    - generic [ref=e402]: TargetGroup · 3 relationships
                  - button "cyntro-tb-prod-tg-web TargetGroup · 3 relationships" [ref=e403]:
                    - generic [ref=e404]:
                      - generic "cyntro-tb-prod-tg-web" [ref=e406]
                      - img [ref=e407]
                    - generic [ref=e409]: TargetGroup · 3 relationships
                  - button "cyntro-testbed-webshop Neptune · 0 relationships" [ref=e410]:
                    - generic [ref=e411]:
                      - generic "cyntro-testbed-webshop" [ref=e413]
                      - img [ref=e414]
                    - generic [ref=e416]: Neptune · 0 relationships
                  - button "cyntro-testbed-webshop-writer Neptune · 0 relationships" [ref=e417]:
                    - generic [ref=e418]:
                      - generic "cyntro-testbed-webshop-writer" [ref=e420]
                      - img [ref=e421]
                    - generic [ref=e423]: Neptune · 0 relationships
            - generic [ref=e424]:
              - generic [ref=e425]:
                - generic [ref=e426]:
                  - img [ref=e427]
                  - generic [ref=e436]:
                    - generic [ref=e437]: Identity control plane
                    - generic [ref=e438]: Roles attached to workloads in this estate scope
                - generic [ref=e439]: 3 material gaps
              - generic [ref=e440]:
                - button "cyntro-tb-prod-loadgen-role 60% gap · 15/25 unused" [ref=e441]:
                  - generic [ref=e442]:
                    - img [ref=e443]
                    - generic [ref=e452]: cyntro-tb-prod-loadgen-role
                  - generic [ref=e453]: 60% gap · 15/25 unused
                - button "cyntro-tb-prod-web-role 59% gap · 17/29 unused" [ref=e454]:
                  - generic [ref=e455]:
                    - img [ref=e456]
                    - generic [ref=e465]: cyntro-tb-prod-web-role
                  - generic [ref=e466]: 59% gap · 17/29 unused
                - button "cyntro-tb-prod-app-role 52% gap · 15/29 unused" [ref=e467]:
                  - generic [ref=e468]:
                    - img [ref=e469]
                    - generic [ref=e478]: cyntro-tb-prod-app-role
                  - generic [ref=e479]: 52% gap · 15/29 unused
                - button "cyntro-tb-prod-consumer-daily 29% gap · 2/7 unused" [ref=e480]:
                  - generic [ref=e481]:
                    - img [ref=e482]
                    - generic [ref=e491]: cyntro-tb-prod-consumer-daily
                  - generic [ref=e492]: 29% gap · 2/7 unused
                - button "cyntro-tb-prod-consumer-every_6h 29% gap · 2/7 unused" [ref=e493]:
                  - generic [ref=e494]:
                    - img [ref=e495]
                    - generic [ref=e504]: cyntro-tb-prod-consumer-every_6h
                  - generic [ref=e505]: 29% gap · 2/7 unused
                - button "cyntro-tb-prod-consumer-frequent 29% gap · 2/7 unused" [ref=e506]:
                  - generic [ref=e507]:
                    - img [ref=e508]
                    - generic [ref=e517]: cyntro-tb-prod-consumer-frequent
                  - generic [ref=e518]: 29% gap · 2/7 unused
            - generic [ref=e519]:
              - generic [ref=e520]:
                - generic [ref=e521]:
                  - generic [ref=e522]:
                    - generic [ref=e523]: Operator brief
                    - generic [ref=e524]: Highest-value checks for the selected lens
                  - img [ref=e525]
                - generic [ref=e528]:
                  - button "cyntro-tb-prod-loadgen-role has a 60% permission gap 15/25 allowed actions are unused." [ref=e529]:
                    - generic [ref=e530]:
                      - img [ref=e531]
                      - generic [ref=e534]:
                        - generic [ref=e535]: cyntro-tb-prod-loadgen-role has a 60% permission gap
                        - generic [ref=e536]: 15/25 allowed actions are unused.
                      - img [ref=e537]
                  - button "Estate decisions have evidence gaps 0 stale · 11 degraded, low-confidence, or unscored." [ref=e541]:
                    - generic [ref=e542]:
                      - img [ref=e543]
                      - generic [ref=e546]:
                        - generic [ref=e547]: Estate decisions have evidence gaps
                        - generic [ref=e548]: 0 stale · 11 degraded, low-confidence, or unscored.
                  - button "1 VPC-bound resource is missing placement Refresh subnet attachment and ownership metadata before architecture review." [ref=e549]:
                    - generic [ref=e550]:
                      - img [ref=e551]
                      - generic [ref=e554]:
                        - generic [ref=e555]: 1 VPC-bound resource is missing placement
                        - generic [ref=e556]: Refresh subnet attachment and ownership metadata before architecture review.
              - generic [ref=e557]:
                - generic [ref=e558]:
                  - img [ref=e559]
                  - generic [ref=e563]: Estate readiness
                - generic [ref=e564]:
                  - generic [ref=e565]:
                    - generic [ref=e566]: "15"
                    - generic [ref=e567]: open findings
                  - generic [ref=e568]:
                    - generic [ref=e569]: "0"
                    - generic [ref=e570]: ready actions
                  - generic [ref=e571]:
                    - generic [ref=e572]: "0"
                    - generic [ref=e573]: shared resources
                  - generic [ref=e574]:
                    - generic [ref=e575]: "1"
                    - generic [ref=e576]: placement gaps
                - generic [ref=e577]:
                  - img [ref=e578]
                  - text: 0% of resources have posture scores. Evidence freshness is degraded; enforcement should remain gated.
      - complementary [ref=e588]:
        - complementary [ref=e589]:
          - generic [ref=e590]:
            - generic [ref=e591]:
              - heading "Service index" [level=2] [ref=e592]
              - generic [ref=e593]: "30"
            - generic [ref=e594]:
              - img [ref=e595]
              - searchbox "Find service in topology" [ref=e598]
            - button "Filters" [ref=e601]:
              - img [ref=e602]
              - text: Filters
          - list [ref=e604]:
            - listitem [ref=e605]:
              - button "cyntro-tb-prod-appdata-1c8276f5 Current graph data S3 · global · regional 4 in · 0 out Aug 20, 04:53 PM" [ref=e606]:
                - generic [ref=e607]:
                  - img [ref=e609]
                  - generic [ref=e611]:
                    - generic [ref=e612]:
                      - generic [ref=e613]: cyntro-tb-prod-appdata-1c8276f5
                      - generic "Current graph data" [ref=e614]
                    - generic [ref=e616]: S3 · global · regional
                    - generic [ref=e617]:
                      - generic [ref=e618]: 4 in · 0 out
                      - generic [ref=e619]:
                        - img [ref=e620]
                        - text: Aug 20, 04:53 PM
            - listitem [ref=e623]:
              - button "cyntro-tb-prod-consumer-daily Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e624]:
                - generic [ref=e625]:
                  - img [ref=e627]
                  - generic [ref=e629]:
                    - generic [ref=e630]:
                      - generic [ref=e631]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e632]
                    - generic [ref=e634]: Lambda · eu-west-1 · regional
                    - generic [ref=e635]:
                      - generic [ref=e636]: 2 in · 1 out
                      - generic [ref=e637]:
                        - img [ref=e638]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e641]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e642]:
                - generic [ref=e643]:
                  - img [ref=e645]
                  - generic [ref=e647]:
                    - generic [ref=e648]:
                      - generic [ref=e649]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e650]
                    - generic [ref=e652]: Lambda · eu-west-1 · regional
                    - generic [ref=e653]:
                      - generic [ref=e654]: 2 in · 1 out
                      - generic [ref=e655]:
                        - img [ref=e656]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e659]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 1, 11:00 AM" [ref=e660]:
                - generic [ref=e661]:
                  - img [ref=e663]
                  - generic [ref=e665]:
                    - generic [ref=e666]:
                      - generic [ref=e667]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e668]
                    - generic [ref=e670]: Lambda · eu-west-1 · regional
                    - generic [ref=e671]:
                      - generic [ref=e672]: 2 in · 1 out
                      - generic [ref=e673]:
                        - img [ref=e674]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e677]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e678]:
                - generic [ref=e679]:
                  - img [ref=e681]
                  - generic [ref=e683]:
                    - generic [ref=e684]:
                      - generic [ref=e685]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e686]
                    - generic [ref=e688]: Lambda · eu-west-1 · regional
                    - generic [ref=e689]:
                      - generic [ref=e690]: 2 in · 1 out
                      - generic [ref=e691]:
                        - img [ref=e692]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e695]:
              - button "cyntro-tb-prod-tg-app Current graph data TargetGroup · eu-west-1a · app 1 in · 2 out Aug 20, 04:58 PM" [ref=e696]:
                - generic [ref=e697]:
                  - img [ref=e699]
                  - generic [ref=e701]:
                    - generic [ref=e702]:
                      - generic [ref=e703]: cyntro-tb-prod-tg-app
                      - generic "Current graph data" [ref=e704]
                    - generic [ref=e706]: TargetGroup · eu-west-1a · app
                    - generic [ref=e707]:
                      - generic [ref=e708]: 1 in · 2 out
                      - generic [ref=e709]:
                        - img [ref=e710]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e713]:
              - button "cyntro-tb-prod-tg-web Current graph data TargetGroup · eu-west-1a · app 1 in · 2 out Aug 20, 04:58 PM" [ref=e714]:
                - generic [ref=e715]:
                  - img [ref=e717]
                  - generic [ref=e719]:
                    - generic [ref=e720]:
                      - generic [ref=e721]: cyntro-tb-prod-tg-web
                      - generic "Current graph data" [ref=e722]
                    - generic [ref=e724]: TargetGroup · eu-west-1a · app
                    - generic [ref=e725]:
                      - generic [ref=e726]: 1 in · 2 out
                      - generic [ref=e727]:
                        - img [ref=e728]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e731]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1b · app 1 in · 1 out Aug 20, 04:58 PM" [ref=e732]:
                - generic [ref=e733]:
                  - img [ref=e735]
                  - generic [ref=e737]:
                    - generic [ref=e738]:
                      - generic [ref=e739]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e740]
                    - generic [ref=e742]: EC2 · eu-west-1b · app
                    - generic [ref=e743]:
                      - generic [ref=e744]: 1 in · 1 out
                      - generic [ref=e745]:
                        - img [ref=e746]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e749]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1a · app 1 in · 1 out Aug 20, 04:58 PM" [ref=e750]:
                - generic [ref=e751]:
                  - img [ref=e753]
                  - generic [ref=e755]:
                    - generic [ref=e756]:
                      - generic [ref=e757]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e758]
                    - generic [ref=e760]: EC2 · eu-west-1a · app
                    - generic [ref=e761]:
                      - generic [ref=e762]: 1 in · 1 out
                      - generic [ref=e763]:
                        - img [ref=e764]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e767]:
              - button "cyntro-tb-prod-consumer-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e768]:
                - generic [ref=e769]:
                  - img [ref=e771]
                  - generic [ref=e773]:
                    - generic [ref=e774]:
                      - generic [ref=e775]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e776]
                    - generic [ref=e778]: EventBridge · eu-west-1 · regional
                    - generic [ref=e779]:
                      - generic [ref=e780]: 0 in · 2 out
                      - generic [ref=e781]:
                        - img [ref=e782]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e785]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e786]:
                - generic [ref=e787]:
                  - img [ref=e789]
                  - generic [ref=e791]:
                    - generic [ref=e792]:
                      - generic [ref=e793]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e794]
                    - generic [ref=e796]: EventBridge · eu-west-1 · regional
                    - generic [ref=e797]:
                      - generic [ref=e798]: 0 in · 2 out
                      - generic [ref=e799]:
                        - img [ref=e800]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e803]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Sep 1, 11:00 AM" [ref=e804]:
                - generic [ref=e805]:
                  - img [ref=e807]
                  - generic [ref=e809]:
                    - generic [ref=e810]:
                      - generic [ref=e811]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e812]
                    - generic [ref=e814]: EventBridge · eu-west-1 · regional
                    - generic [ref=e815]:
                      - generic [ref=e816]: 0 in · 2 out
                      - generic [ref=e817]:
                        - img [ref=e818]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e821]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e822]:
                - generic [ref=e823]:
                  - img [ref=e825]
                  - generic [ref=e827]:
                    - generic [ref=e828]:
                      - generic [ref=e829]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e830]
                    - generic [ref=e832]: Lambda · eu-west-1 · regional
                    - generic [ref=e833]:
                      - generic [ref=e834]: 2 in · 0 out
                      - generic [ref=e835]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e838]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e839]:
                - generic [ref=e840]:
                  - img [ref=e842]
                  - generic [ref=e844]:
                    - generic [ref=e845]:
                      - generic [ref=e846]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e847]
                    - generic [ref=e849]: EventBridge · eu-west-1 · regional
                    - generic [ref=e850]:
                      - generic [ref=e851]: 0 in · 2 out
                      - generic [ref=e852]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e855]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e856]:
                - generic [ref=e857]:
                  - img [ref=e859]
                  - generic [ref=e861]:
                    - generic [ref=e862]:
                      - generic [ref=e863]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e864]
                    - generic [ref=e866]: EventBridge · eu-west-1 · regional
                    - generic [ref=e867]:
                      - generic [ref=e868]: 0 in · 2 out
                      - generic [ref=e869]:
                        - img [ref=e870]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e873]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out Aug 29, 11:00 AM" [ref=e874]:
                - generic [ref=e875]:
                  - img [ref=e877]
                  - generic [ref=e879]:
                    - generic [ref=e880]:
                      - generic [ref=e881]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e882]
                    - generic [ref=e884]: Lambda · eu-west-1 · regional
                    - generic [ref=e885]:
                      - generic [ref=e886]: 2 in · 0 out
                      - generic [ref=e887]:
                        - img [ref=e888]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e891]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 29, 11:00 AM" [ref=e892]:
                - generic [ref=e893]:
                  - img [ref=e895]
                  - generic [ref=e897]:
                    - generic [ref=e898]:
                      - generic [ref=e899]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e900]
                    - generic [ref=e902]: EventBridge · eu-west-1 · regional
                    - generic [ref=e903]:
                      - generic [ref=e904]: 0 in · 2 out
                      - generic [ref=e905]:
                        - img [ref=e906]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e909]:
              - button "cyntro-tb-prod-alb-int Current graph data LoadBalancer · eu-west-1a · app 0 in · 1 out No runtime timestamp" [ref=e910]:
                - generic [ref=e911]:
                  - img [ref=e913]
                  - generic [ref=e915]:
                    - generic [ref=e916]:
                      - generic [ref=e917]: cyntro-tb-prod-alb-int
                      - generic "Current graph data" [ref=e918]
                    - generic [ref=e920]: LoadBalancer · eu-west-1a · app
                    - generic [ref=e921]:
                      - generic [ref=e922]: 0 in · 1 out
                      - generic [ref=e923]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e926]:
              - button "cyntro-tb-prod-alb-pub Current graph data LoadBalancer · eu-west-1a · web 0 in · 1 out No runtime timestamp" [ref=e927]:
                - generic [ref=e928]:
                  - img [ref=e930]
                  - generic [ref=e932]:
                    - generic [ref=e933]:
                      - generic [ref=e934]: cyntro-tb-prod-alb-pub
                      - generic "Current graph data" [ref=e935]
                    - generic [ref=e937]: LoadBalancer · eu-west-1a · web
                    - generic [ref=e938]:
                      - generic [ref=e939]: 0 in · 1 out
                      - generic [ref=e940]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e943]:
              - button "cyntro-tb-prod-loadgen Current graph data EC2 · eu-west-1a · app 0 in · 1 out Aug 18, 06:57 PM" [ref=e944]:
                - generic [ref=e945]:
                  - img [ref=e947]
                  - generic [ref=e949]:
                    - generic [ref=e950]:
                      - generic [ref=e951]: cyntro-tb-prod-loadgen
                      - generic "Current graph data" [ref=e952]
                    - generic [ref=e954]: EC2 · eu-west-1a · app
                    - generic [ref=e955]:
                      - generic [ref=e956]: 0 in · 1 out
                      - generic [ref=e957]:
                        - img [ref=e958]
                        - text: Aug 18, 06:57 PM
            - listitem [ref=e961]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1a · web 1 in · 0 out Aug 20, 04:58 PM" [ref=e962]:
                - generic [ref=e963]:
                  - img [ref=e965]
                  - generic [ref=e967]:
                    - generic [ref=e968]:
                      - generic [ref=e969]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e970]
                    - generic [ref=e972]: EC2 · eu-west-1a · web
                    - generic [ref=e973]:
                      - generic [ref=e974]: 1 in · 0 out
                      - generic [ref=e975]:
                        - img [ref=e976]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e979]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1b · web 1 in · 0 out Aug 20, 04:58 PM" [ref=e980]:
                - generic [ref=e981]:
                  - img [ref=e983]
                  - generic [ref=e985]:
                    - generic [ref=e986]:
                      - generic [ref=e987]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e988]
                    - generic [ref=e990]: EC2 · eu-west-1b · web
                    - generic [ref=e991]:
                      - generic [ref=e992]: 1 in · 0 out
                      - generic [ref=e993]:
                        - img [ref=e994]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e997]:
              - button "cyntro-evidence-testbed-webshop-950952 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp" [ref=e998]:
                - generic [ref=e999]:
                  - img [ref=e1001]
                  - generic [ref=e1004]:
                    - generic [ref=e1005]:
                      - generic [ref=e1006]: cyntro-evidence-testbed-webshop-950952
                      - generic "Current graph data" [ref=e1007]
                    - generic [ref=e1009]: S3 · global · regional
                    - generic [ref=e1010]:
                      - generic [ref=e1011]: 0 in · 0 out
                      - generic [ref=e1012]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1015]:
              - button "cyntro-ingest-head-testbed-webshop Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1016]:
                - generic [ref=e1017]:
                  - img [ref=e1019]
                  - generic [ref=e1022]:
                    - generic [ref=e1023]:
                      - generic [ref=e1024]: cyntro-ingest-head-testbed-webshop
                      - generic "Current graph data" [ref=e1025]
                    - generic [ref=e1027]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1028]:
                      - generic [ref=e1029]: 0 in · 0 out
                      - generic [ref=e1030]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1033]:
              - button "cyntro-tb-prod-aurora Current graph data RDS · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1034]:
                - generic [ref=e1035]:
                  - img [ref=e1037]
                  - generic [ref=e1040]:
                    - generic [ref=e1041]:
                      - generic [ref=e1042]: cyntro-tb-prod-aurora
                      - generic "Current graph data" [ref=e1043]
                    - generic [ref=e1045]: RDS · eu-west-1 · regional
                    - generic [ref=e1046]:
                      - generic [ref=e1047]: 0 in · 0 out
                      - generic [ref=e1048]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1051]:
              - button "cyntro-tb-prod-aurora-0 Current graph data RDS · eu-west-1a · data 0 in · 0 out No runtime timestamp" [ref=e1052]:
                - generic [ref=e1053]:
                  - img [ref=e1055]
                  - generic [ref=e1058]:
                    - generic [ref=e1059]:
                      - generic [ref=e1060]: cyntro-tb-prod-aurora-0
                      - generic "Current graph data" [ref=e1061]
                    - generic [ref=e1063]: RDS · eu-west-1a · data
                    - generic [ref=e1064]:
                      - generic [ref=e1065]: 0 in · 0 out
                      - generic [ref=e1066]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1069]:
              - button "cyntro-tb-prod-aurora-1 Current graph data RDS · eu-west-1a · data 0 in · 0 out No runtime timestamp" [ref=e1070]:
                - generic [ref=e1071]:
                  - img [ref=e1073]
                  - generic [ref=e1076]:
                    - generic [ref=e1077]:
                      - generic [ref=e1078]: cyntro-tb-prod-aurora-1
                      - generic "Current graph data" [ref=e1079]
                    - generic [ref=e1081]: RDS · eu-west-1a · data
                    - generic [ref=e1082]:
                      - generic [ref=e1083]: 0 in · 0 out
                      - generic [ref=e1084]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1087]:
              - button "cyntro-tb-prod-logs-1c8276f5 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp" [ref=e1088]:
                - generic [ref=e1089]:
                  - img [ref=e1091]
                  - generic [ref=e1094]:
                    - generic [ref=e1095]:
                      - generic [ref=e1096]: cyntro-tb-prod-logs-1c8276f5
                      - generic "Current graph data" [ref=e1097]
                    - generic [ref=e1099]: S3 · global · regional
                    - generic [ref=e1100]:
                      - generic [ref=e1101]: 0 in · 0 out
                      - generic [ref=e1102]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1105]:
              - button "cyntro-testbed-webshop Current graph data Neptune · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1106]:
                - generic [ref=e1107]:
                  - img [ref=e1109]
                  - generic [ref=e1112]:
                    - generic [ref=e1113]:
                      - generic [ref=e1114]: cyntro-testbed-webshop
                      - generic "Current graph data" [ref=e1115]
                    - generic [ref=e1117]: Neptune · eu-west-1 · regional
                    - generic [ref=e1118]:
                      - generic [ref=e1119]: 0 in · 0 out
                      - generic [ref=e1120]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1123]:
              - button "cyntro-testbed-webshop-writer Current graph data Neptune · eu-west-1a · web 0 in · 0 out No runtime timestamp" [ref=e1124]:
                - generic [ref=e1125]:
                  - img [ref=e1127]
                  - generic [ref=e1130]:
                    - generic [ref=e1131]:
                      - generic [ref=e1132]: cyntro-testbed-webshop-writer
                      - generic "Current graph data" [ref=e1133]
                    - generic [ref=e1135]: Neptune · eu-west-1a · web
                    - generic [ref=e1136]:
                      - generic [ref=e1137]: 0 in · 0 out
                      - generic [ref=e1138]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1141]:
      - text: Live read from
      - generic [ref=e1142]: /api/topology-risk/testbed-webshop
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1143]
```

# Test source

```ts
  281 |     await page.setViewportSize({ width: 1600, height: 900 })
  282 |     const pageErrors: string[] = []
  283 |     page.on("pageerror", error => pageErrors.push(String(error.message ?? error)))
  284 |     // Assigned from a response listener: an object property, not a `let`, so
  285 |     // control-flow analysis does not narrow it to null at the read sites.
  286 |     const captured: { payload: TopologyRisk | null } = { payload: null }
  287 |     // The product-scope gate (organization roster, account options, scoped
  288 |     // systems catalog) decides whether the map mounts at all; record what each
  289 |     // of those calls answered so a blocked page comes with its cause.
  290 |     const gate: Array<{ path: string; status: number; body: string }> = []
  291 |     const riskResponses: Array<{
  292 |       path: string
  293 |       status: number
  294 |       body_status: string | null
  295 |       from_snapshot: boolean | null
  296 |       system_kpis: boolean
  297 |       nodes: number
  298 |     }> = []
  299 |     page.on("response", async response => {
  300 |       const url = new URL(response.url())
  301 |       const isGate =
  302 |         url.pathname === "/api/proxy/admin/customers" ||
  303 |         url.pathname === "/api/proxy/admin/accounts/scope/options/all" ||
  304 |         url.pathname === "/api/proxy/systems" ||
  305 |         url.pathname.startsWith("/api/proxy/topology-risk/")
  306 |       if (isGate) {
  307 |         let body = ""
  308 |         try {
  309 |           body = (await response.text()).slice(0, 400)
  310 |         } catch {
  311 |           body = "<unreadable>"
  312 |         }
  313 |         gate.push({ path: url.pathname + url.search, status: response.status(), body })
  314 |       }
  315 |       if (
  316 |         url.pathname.startsWith("/api/proxy/topology-risk/") &&
  317 |         response.request().method() === "GET"
  318 |       ) {
  319 |         try {
  320 |           const payload = (await response.json()) as TopologyRisk
  321 |           riskResponses.push({
  322 |             path: url.pathname + url.search,
  323 |             status: response.status(),
  324 |             body_status: payload.status ?? null,
  325 |             from_snapshot: payload.from_snapshot ?? null,
  326 |             system_kpis: Boolean((payload as { system_kpis?: unknown }).system_kpis),
  327 |             nodes: (payload.nodes ?? []).length,
  328 |           })
  329 |           if (response.status() === 200) captured.payload = payload
  330 |         } catch {
  331 |           // a non-JSON body is reported below as a missing payload
  332 |         }
  333 |       }
  334 |     })
  335 | 
  336 |     // Cold reads are the norm here, not an error: the proxy's cache key
  337 |     // carries the page's scope (customer_id and friends), so the map's own
  338 |     // read is uncached even after an unscoped probe, and an uncached
  339 |     // topology-risk on C1 runs close to the proxy's 55s ceiling. The first
  340 |     // load therefore both fills that scoped cache and, if it times out,
  341 |     // leaves the page on its "Preparing …" / "unavailable" state. Reload and
  342 |     // wait again — the same thing an operator does — and report how many
  343 |     // loads it took.
  344 |     const mapTab = page.getByTestId("topology-estate-view-map")
  345 |     // "Preparing <system>" / "Building estate map" is the LOADING card, not a
  346 |     // blocked state: matching it as success made every load return at once
  347 |     // (run 33675359540). It is a signal to keep waiting. The timeout card
  348 |     // ("Estate map temporarily unavailable") is a real refusal.
  349 |     const blocked = page.getByText(
  350 |       /Topology risk unavailable|No systems available yet|Estate map temporarily unavailable/i,
  351 |     )
  352 |     const riskUrls: string[] = []
  353 |     page.on("request", request => {
  354 |       const href = request.url()
  355 |       if (href.includes("/api/proxy/topology-risk/")) riskUrls.push(href)
  356 |     })
  357 |     const loads: Array<{ attempt: number; mounted: boolean; reason: string | null; ms: number }> = []
  358 |     let mounted = false
  359 |     for (let attempt = 1; attempt <= 3 && !mounted; attempt += 1) {
  360 |       const t0 = Date.now()
  361 |       await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  362 |       const firstRisk = await page
  363 |         .waitForRequest(request => request.url().includes("/api/proxy/topology-risk/"), { timeout: 60_000 })
  364 |         .catch(() => null)
  365 |       const unscoped = riskUrls.filter(
  366 |         href => !href.includes("account_id=") || !href.includes("region="),
  367 |       )
  368 |       report("estate-topology-risk-urls", {
  369 |         attempt,
  370 |         first: firstRisk?.url() ?? null,
  371 |         urls: [...riskUrls],
  372 |         unscoped,
  373 |         responses: [...riskResponses],
  374 |       })
  375 |       expect(unscoped, "Estate must not fire an unscoped topology-risk GET on a scoped C1 URL").toEqual([])
  376 |       await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 90_000 })
  377 |       mounted = await mapTab.isVisible().catch(() => false)
  378 |       expect(
  379 |         riskUrls.filter(href => href.includes("vpc_id=")),
  380 |         "Estate must not add vpc_id when the opening URL did not ask for one",
> 381 |       ).toEqual([])
      |         ^ Error: Estate must not add vpc_id when the opening URL did not ask for one
  382 |       const reason = mounted
  383 |         ? null
  384 |         : ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
  385 |       loads.push({ attempt, mounted, reason, ms: Date.now() - t0 })
  386 |       if (!mounted && attempt < 3) await page.waitForTimeout(8_000)
  387 |     }
  388 |     report("estate-page", { mounted, loads, gate })
  389 |     if (!mounted) {
  390 |       await shot(page, "c1-estate-blocked")
  391 |       throw new Error(`estate map did not mount after ${loads.length} loads: ${loads[loads.length - 1]?.reason}`)
  392 |     }
  393 |     await page.getByRole("tab", { name: "Network topology" }).click()
  394 |     const dependencies = page
  395 |       .getByTestId("topology-flow-mode-toggle")
  396 |       .getByRole("button", { name: "Dependencies" })
  397 |       .first()
  398 |     await dependencies.click()
  399 |     await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  400 |     await page.waitForTimeout(1500)
  401 |     await shot(page, "c1-estate-embedded")
  402 | 
  403 |     const vpcOptions = await page
  404 |       .getByTestId("topology-vpc-select")
  405 |       .locator("option")
  406 |       .allTextContents()
  407 |       .catch(() => [] as string[])
  408 |     report("scope-gate", gate)
  409 |     report("embedded", {
  410 |       vpc_options: vpcOptions,
  411 |       authority_banner: await bannerText(page, "page"),
  412 |       coverage_pill: await readPill(page, "page"),
  413 |       payload_captured: Boolean(captured.payload),
  414 |       ...(await measureEmbeddedLegibility(page)),
  415 |     })
  416 | 
  417 |     // Fullscreen — Glance first (the default), then Inventory (one icon per node).
  418 |     await page.getByTestId("topology-estate-map-enlarge").click()
  419 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  420 |     await expect(fullscreen).toBeVisible()
  421 |     await page.waitForTimeout(1500)
  422 |     await shot(page, "c1-fullscreen-glance")
  423 |     const glance = await measureFullscreen(page)
  424 |     report("fullscreen-glance", { ...glance, header_overlaps: await railHeaderBadgeOverlaps(page) })
  425 | 
  426 |     await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
  427 |     await page.waitForTimeout(1500)
  428 |     await shot(page, "c1-fullscreen-inventory")
  429 |     const inventory = await measureFullscreen(page)
  430 |     const overlaps = await railHeaderBadgeOverlaps(page)
  431 |     const pill = await readPill(page, "fullscreen")
  432 |     report("fullscreen-inventory", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  433 |     await attachJson("fullscreen-inventory.json", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  434 | 
  435 |     // --- Assertions. Soft where the graph's shape decides what is present.
  436 |     const overlapping = overlaps.filter(o => {
  437 |       const depth = Math.min(o.badge.b, o.headerBox.b) - Math.max(o.badge.t, o.headerBox.t)
  438 |       return depth > 1
  439 |     })
  440 |     expect.soft(overlapping, "no flow label paints over a rail header (touches ≤ 1px are reported, not failed)").toEqual([])
  441 |     for (const lane of ["serverless", "regional"] as const) {
  442 |       const measured = inventory.lanes[lane]
  443 |       if (!measured || !inventory.rail) continue
  444 |       expect.soft(measured.header.t, `${lane} header inside the rail`).toBeGreaterThanOrEqual(inventory.rail.t - 1)
  445 |       expect.soft(measured.header.b, `${lane} header inside the rail`).toBeLessThanOrEqual(inventory.rail.b + 1)
  446 |       expect.soft(measured.header.b, `${lane} header inside the viewport`).toBeLessThanOrEqual(inventory.viewport.h)
  447 |       expect.soft(measured.overflowY, `${lane} lane body owns its scroll`).toBe("auto")
  448 |       if (measured.scrollHeight > measured.clientHeight + 4) {
  449 |         expect.soft(measured.more_pill, `${lane} fold footer counts the chips below`).toBe(`+${measured.below} more ↓`)
  450 |       } else {
  451 |         expect.soft(measured.more_pill, `${lane} has no fold footer without overflow`).toBeNull()
  452 |       }
  453 |     }
  454 |     if (inventory.alb_band && inventory.az_headers) {
  455 |       expect.soft(inventory.alb_band.b, "load balancer band above the AZ headers").toBeLessThanOrEqual(inventory.az_headers.t + 1)
  456 |     }
  457 |     for (const nat of inventory.nat) {
  458 |       if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
  459 |       else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
  460 |     }
  461 |     const payload = captured.payload
  462 |     const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
  463 |     if (payload) {
  464 |       expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
  465 |     }
  466 | 
  467 |     // Coverage pill: exactly the payload's numbers, or absent when the payload has none.
  468 |     const coverage = payload?.traffic_authority?.lane_coverage ?? null
  469 |     if (coverage) {
  470 |       expect.soft(pill, "coverage pill rendered for a payload with lane_coverage").not.toBeNull()
  471 |       if (pill) {
  472 |         expect.soft(pill.state, "pill state").toBe(coverage.state ?? null)
  473 |         expect.soft(pill.totals, "pill totals").toBe(expectedTotalsText(coverage))
  474 |         for (const lane of COVERAGE_LANES) {
  475 |           const counts = coverage.by_lane?.[lane]
  476 |           const chip = pill.lanes.find(entry => entry.testid === `topology-lane-coverage-${lane}`)
  477 |           if (!counts || counts.state === "empty") expect.soft(chip, `${lane} chip absent for an empty lane`).toBeUndefined()
  478 |           else expect.soft(chip?.state, `${lane} chip state`).toBe(counts.state)
  479 |         }
  480 |         expect.soft(pill.warnings.map(warning => warning.code), "warnings, in the backend's order").toEqual(
  481 |           (coverage.warnings ?? []).map(warning => warning.code),
```