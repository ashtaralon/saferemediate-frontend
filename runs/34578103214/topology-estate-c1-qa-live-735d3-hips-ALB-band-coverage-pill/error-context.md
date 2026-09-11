# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:297:7

# Error details

```
Error: no subnet cell starts above the AZ header row's bottom edge

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 2
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
          - generic [ref=e41]: scored 2026-09-11T07:39:15Z · 0 flagged · posture_correlated_at >= now() - 7d on any workload · VPC vpc-0c39cde96f29f8f4e · cached locally · backend timeout — serving stale
        - generic [ref=e42]:
          - generic [ref=e43]:
            - generic [ref=e44]: Evidence computed Sep 11, 2026, 7:39 AM
            - generic [ref=e46]: Last-good cache
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
        - generic [ref=e72]:
          - tablist "Estate view" [ref=e73]:
            - tab "Command map" [ref=e74]
            - tab "Network topology" [selected] [ref=e75]
          - group "Map density" [ref=e76]:
            - button "Glance" [ref=e77]
            - button "Inventory" [ref=e78]
          - button "Shared neighbors" [pressed] [ref=e79]
          - button "Open map fullscreen" [ref=e80]:
            - img [ref=e81]
            - text: Map fullscreen
      - complementary [ref=e88]:
        - complementary [ref=e89]:
          - generic [ref=e90]:
            - generic [ref=e91]:
              - heading "Service index" [level=2] [ref=e92]
              - generic [ref=e93]: "30"
            - generic [ref=e94]:
              - img [ref=e95]
              - searchbox "Find service in topology" [ref=e98]
            - button "Filters" [ref=e101]:
              - img [ref=e102]
              - text: Filters
          - list [ref=e104]:
            - listitem [ref=e105]:
              - button "cyntro-tb-prod-appdata-1c8276f5 Current graph data S3 · global · regional 4 in · 0 out Aug 20, 04:53 PM" [ref=e106]:
                - generic [ref=e107]:
                  - img [ref=e109]
                  - generic [ref=e111]:
                    - generic [ref=e112]:
                      - generic [ref=e113]: cyntro-tb-prod-appdata-1c8276f5
                      - generic "Current graph data" [ref=e114]
                    - generic [ref=e116]: S3 · global · regional
                    - generic [ref=e117]:
                      - generic [ref=e118]: 4 in · 0 out
                      - generic [ref=e119]:
                        - img [ref=e120]
                        - text: Aug 20, 04:53 PM
            - listitem [ref=e123]:
              - button "cyntro-tb-prod-consumer-daily Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e124]:
                - generic [ref=e125]:
                  - img [ref=e127]
                  - generic [ref=e129]:
                    - generic [ref=e130]:
                      - generic [ref=e131]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e132]
                    - generic [ref=e134]: Lambda · eu-west-1 · regional
                    - generic [ref=e135]:
                      - generic [ref=e136]: 2 in · 1 out
                      - generic [ref=e137]:
                        - img [ref=e138]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e141]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e142]:
                - generic [ref=e143]:
                  - img [ref=e145]
                  - generic [ref=e147]:
                    - generic [ref=e148]:
                      - generic [ref=e149]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e150]
                    - generic [ref=e152]: Lambda · eu-west-1 · regional
                    - generic [ref=e153]:
                      - generic [ref=e154]: 2 in · 1 out
                      - generic [ref=e155]:
                        - img [ref=e156]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e159]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 1, 11:00 AM" [ref=e160]:
                - generic [ref=e161]:
                  - img [ref=e163]
                  - generic [ref=e165]:
                    - generic [ref=e166]:
                      - generic [ref=e167]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e168]
                    - generic [ref=e170]: Lambda · eu-west-1 · regional
                    - generic [ref=e171]:
                      - generic [ref=e172]: 2 in · 1 out
                      - generic [ref=e173]:
                        - img [ref=e174]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e177]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e178]:
                - generic [ref=e179]:
                  - img [ref=e181]
                  - generic [ref=e183]:
                    - generic [ref=e184]:
                      - generic [ref=e185]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e186]
                    - generic [ref=e188]: Lambda · eu-west-1 · regional
                    - generic [ref=e189]:
                      - generic [ref=e190]: 2 in · 1 out
                      - generic [ref=e191]:
                        - img [ref=e192]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e195]:
              - button "cyntro-tb-prod-tg-app Current graph data TargetGroup · eu-west-1a · app 1 in · 2 out Aug 20, 04:58 PM" [ref=e196]:
                - generic [ref=e197]:
                  - img [ref=e199]
                  - generic [ref=e201]:
                    - generic [ref=e202]:
                      - generic [ref=e203]: cyntro-tb-prod-tg-app
                      - generic "Current graph data" [ref=e204]
                    - generic [ref=e206]: TargetGroup · eu-west-1a · app
                    - generic [ref=e207]:
                      - generic [ref=e208]: 1 in · 2 out
                      - generic [ref=e209]:
                        - img [ref=e210]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e213]:
              - button "cyntro-tb-prod-tg-web Current graph data TargetGroup · eu-west-1a · app 1 in · 2 out Aug 20, 04:58 PM" [ref=e214]:
                - generic [ref=e215]:
                  - img [ref=e217]
                  - generic [ref=e219]:
                    - generic [ref=e220]:
                      - generic [ref=e221]: cyntro-tb-prod-tg-web
                      - generic "Current graph data" [ref=e222]
                    - generic [ref=e224]: TargetGroup · eu-west-1a · app
                    - generic [ref=e225]:
                      - generic [ref=e226]: 1 in · 2 out
                      - generic [ref=e227]:
                        - img [ref=e228]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e231]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1b · app 1 in · 1 out Aug 20, 04:58 PM" [ref=e232]:
                - generic [ref=e233]:
                  - img [ref=e235]
                  - generic [ref=e237]:
                    - generic [ref=e238]:
                      - generic [ref=e239]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e240]
                    - generic [ref=e242]: EC2 · eu-west-1b · app
                    - generic [ref=e243]:
                      - generic [ref=e244]: 1 in · 1 out
                      - generic [ref=e245]:
                        - img [ref=e246]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e249]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1a · app 1 in · 1 out Aug 20, 04:58 PM" [ref=e250]:
                - generic [ref=e251]:
                  - img [ref=e253]
                  - generic [ref=e255]:
                    - generic [ref=e256]:
                      - generic [ref=e257]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e258]
                    - generic [ref=e260]: EC2 · eu-west-1a · app
                    - generic [ref=e261]:
                      - generic [ref=e262]: 1 in · 1 out
                      - generic [ref=e263]:
                        - img [ref=e264]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e267]:
              - button "cyntro-tb-prod-consumer-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e268]:
                - generic [ref=e269]:
                  - img [ref=e271]
                  - generic [ref=e273]:
                    - generic [ref=e274]:
                      - generic [ref=e275]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e276]
                    - generic [ref=e278]: EventBridge · eu-west-1 · regional
                    - generic [ref=e279]:
                      - generic [ref=e280]: 0 in · 2 out
                      - generic [ref=e281]:
                        - img [ref=e282]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e285]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e286]:
                - generic [ref=e287]:
                  - img [ref=e289]
                  - generic [ref=e291]:
                    - generic [ref=e292]:
                      - generic [ref=e293]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e294]
                    - generic [ref=e296]: EventBridge · eu-west-1 · regional
                    - generic [ref=e297]:
                      - generic [ref=e298]: 0 in · 2 out
                      - generic [ref=e299]:
                        - img [ref=e300]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e303]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Sep 1, 11:00 AM" [ref=e304]:
                - generic [ref=e305]:
                  - img [ref=e307]
                  - generic [ref=e309]:
                    - generic [ref=e310]:
                      - generic [ref=e311]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e312]
                    - generic [ref=e314]: EventBridge · eu-west-1 · regional
                    - generic [ref=e315]:
                      - generic [ref=e316]: 0 in · 2 out
                      - generic [ref=e317]:
                        - img [ref=e318]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e321]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e322]:
                - generic [ref=e323]:
                  - img [ref=e325]
                  - generic [ref=e327]:
                    - generic [ref=e328]:
                      - generic [ref=e329]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e330]
                    - generic [ref=e332]: Lambda · eu-west-1 · regional
                    - generic [ref=e333]:
                      - generic [ref=e334]: 2 in · 0 out
                      - generic [ref=e335]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e338]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e339]:
                - generic [ref=e340]:
                  - img [ref=e342]
                  - generic [ref=e344]:
                    - generic [ref=e345]:
                      - generic [ref=e346]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e347]
                    - generic [ref=e349]: EventBridge · eu-west-1 · regional
                    - generic [ref=e350]:
                      - generic [ref=e351]: 0 in · 2 out
                      - generic [ref=e352]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e355]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e356]:
                - generic [ref=e357]:
                  - img [ref=e359]
                  - generic [ref=e361]:
                    - generic [ref=e362]:
                      - generic [ref=e363]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e364]
                    - generic [ref=e366]: EventBridge · eu-west-1 · regional
                    - generic [ref=e367]:
                      - generic [ref=e368]: 0 in · 2 out
                      - generic [ref=e369]:
                        - img [ref=e370]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e373]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out Aug 29, 11:00 AM" [ref=e374]:
                - generic [ref=e375]:
                  - img [ref=e377]
                  - generic [ref=e379]:
                    - generic [ref=e380]:
                      - generic [ref=e381]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e382]
                    - generic [ref=e384]: Lambda · eu-west-1 · regional
                    - generic [ref=e385]:
                      - generic [ref=e386]: 2 in · 0 out
                      - generic [ref=e387]:
                        - img [ref=e388]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e391]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 29, 11:00 AM" [ref=e392]:
                - generic [ref=e393]:
                  - img [ref=e395]
                  - generic [ref=e397]:
                    - generic [ref=e398]:
                      - generic [ref=e399]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e400]
                    - generic [ref=e402]: EventBridge · eu-west-1 · regional
                    - generic [ref=e403]:
                      - generic [ref=e404]: 0 in · 2 out
                      - generic [ref=e405]:
                        - img [ref=e406]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e409]:
              - button "cyntro-tb-prod-alb-int Current graph data LoadBalancer · eu-west-1a · app 0 in · 1 out No runtime timestamp" [ref=e410]:
                - generic [ref=e411]:
                  - img [ref=e413]
                  - generic [ref=e415]:
                    - generic [ref=e416]:
                      - generic [ref=e417]: cyntro-tb-prod-alb-int
                      - generic "Current graph data" [ref=e418]
                    - generic [ref=e420]: LoadBalancer · eu-west-1a · app
                    - generic [ref=e421]:
                      - generic [ref=e422]: 0 in · 1 out
                      - generic [ref=e423]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e426]:
              - button "cyntro-tb-prod-alb-pub Current graph data LoadBalancer · eu-west-1a · web 0 in · 1 out No runtime timestamp" [ref=e427]:
                - generic [ref=e428]:
                  - img [ref=e430]
                  - generic [ref=e432]:
                    - generic [ref=e433]:
                      - generic [ref=e434]: cyntro-tb-prod-alb-pub
                      - generic "Current graph data" [ref=e435]
                    - generic [ref=e437]: LoadBalancer · eu-west-1a · web
                    - generic [ref=e438]:
                      - generic [ref=e439]: 0 in · 1 out
                      - generic [ref=e440]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e443]:
              - button "cyntro-tb-prod-loadgen Current graph data EC2 · eu-west-1a · app 0 in · 1 out Aug 18, 06:57 PM" [ref=e444]:
                - generic [ref=e445]:
                  - img [ref=e447]
                  - generic [ref=e449]:
                    - generic [ref=e450]:
                      - generic [ref=e451]: cyntro-tb-prod-loadgen
                      - generic "Current graph data" [ref=e452]
                    - generic [ref=e454]: EC2 · eu-west-1a · app
                    - generic [ref=e455]:
                      - generic [ref=e456]: 0 in · 1 out
                      - generic [ref=e457]:
                        - img [ref=e458]
                        - text: Aug 18, 06:57 PM
            - listitem [ref=e461]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1a · web 1 in · 0 out Aug 20, 04:58 PM" [ref=e462]:
                - generic [ref=e463]:
                  - img [ref=e465]
                  - generic [ref=e467]:
                    - generic [ref=e468]:
                      - generic [ref=e469]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e470]
                    - generic [ref=e472]: EC2 · eu-west-1a · web
                    - generic [ref=e473]:
                      - generic [ref=e474]: 1 in · 0 out
                      - generic [ref=e475]:
                        - img [ref=e476]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e479]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1b · web 1 in · 0 out Aug 20, 04:58 PM" [ref=e480]:
                - generic [ref=e481]:
                  - img [ref=e483]
                  - generic [ref=e485]:
                    - generic [ref=e486]:
                      - generic [ref=e487]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e488]
                    - generic [ref=e490]: EC2 · eu-west-1b · web
                    - generic [ref=e491]:
                      - generic [ref=e492]: 1 in · 0 out
                      - generic [ref=e493]:
                        - img [ref=e494]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e497]:
              - button "cyntro-evidence-testbed-webshop-950952 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp" [ref=e498]:
                - generic [ref=e499]:
                  - img [ref=e501]
                  - generic [ref=e504]:
                    - generic [ref=e505]:
                      - generic [ref=e506]: cyntro-evidence-testbed-webshop-950952
                      - generic "Current graph data" [ref=e507]
                    - generic [ref=e509]: S3 · global · regional
                    - generic [ref=e510]:
                      - generic [ref=e511]: 0 in · 0 out
                      - generic [ref=e512]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e515]:
              - button "cyntro-ingest-head-testbed-webshop Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e516]:
                - generic [ref=e517]:
                  - img [ref=e519]
                  - generic [ref=e522]:
                    - generic [ref=e523]:
                      - generic [ref=e524]: cyntro-ingest-head-testbed-webshop
                      - generic "Current graph data" [ref=e525]
                    - generic [ref=e527]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e528]:
                      - generic [ref=e529]: 0 in · 0 out
                      - generic [ref=e530]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e533]:
              - button "cyntro-tb-prod-aurora Current graph data RDS · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e534]:
                - generic [ref=e535]:
                  - img [ref=e537]
                  - generic [ref=e540]:
                    - generic [ref=e541]:
                      - generic [ref=e542]: cyntro-tb-prod-aurora
                      - generic "Current graph data" [ref=e543]
                    - generic [ref=e545]: RDS · eu-west-1 · regional
                    - generic [ref=e546]:
                      - generic [ref=e547]: 0 in · 0 out
                      - generic [ref=e548]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e551]:
              - button "cyntro-tb-prod-aurora-0 Current graph data RDS · eu-west-1a · data 0 in · 0 out No runtime timestamp" [ref=e552]:
                - generic [ref=e553]:
                  - img [ref=e555]
                  - generic [ref=e558]:
                    - generic [ref=e559]:
                      - generic [ref=e560]: cyntro-tb-prod-aurora-0
                      - generic "Current graph data" [ref=e561]
                    - generic [ref=e563]: RDS · eu-west-1a · data
                    - generic [ref=e564]:
                      - generic [ref=e565]: 0 in · 0 out
                      - generic [ref=e566]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e569]:
              - button "cyntro-tb-prod-aurora-1 Current graph data RDS · eu-west-1a · data 0 in · 0 out No runtime timestamp" [ref=e570]:
                - generic [ref=e571]:
                  - img [ref=e573]
                  - generic [ref=e576]:
                    - generic [ref=e577]:
                      - generic [ref=e578]: cyntro-tb-prod-aurora-1
                      - generic "Current graph data" [ref=e579]
                    - generic [ref=e581]: RDS · eu-west-1a · data
                    - generic [ref=e582]:
                      - generic [ref=e583]: 0 in · 0 out
                      - generic [ref=e584]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e587]:
              - button "cyntro-tb-prod-logs-1c8276f5 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp" [ref=e588]:
                - generic [ref=e589]:
                  - img [ref=e591]
                  - generic [ref=e594]:
                    - generic [ref=e595]:
                      - generic [ref=e596]: cyntro-tb-prod-logs-1c8276f5
                      - generic "Current graph data" [ref=e597]
                    - generic [ref=e599]: S3 · global · regional
                    - generic [ref=e600]:
                      - generic [ref=e601]: 0 in · 0 out
                      - generic [ref=e602]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e605]:
              - button "cyntro-testbed-webshop Current graph data Neptune · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e606]:
                - generic [ref=e607]:
                  - img [ref=e609]
                  - generic [ref=e612]:
                    - generic [ref=e613]:
                      - generic [ref=e614]: cyntro-testbed-webshop
                      - generic "Current graph data" [ref=e615]
                    - generic [ref=e617]: Neptune · eu-west-1 · regional
                    - generic [ref=e618]:
                      - generic [ref=e619]: 0 in · 0 out
                      - generic [ref=e620]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e623]:
              - button "cyntro-testbed-webshop-writer Current graph data Neptune · eu-west-1a · web 0 in · 0 out No runtime timestamp" [ref=e624]:
                - generic [ref=e625]:
                  - img [ref=e627]
                  - generic [ref=e630]:
                    - generic [ref=e631]:
                      - generic [ref=e632]: cyntro-testbed-webshop-writer
                      - generic "Current graph data" [ref=e633]
                    - generic [ref=e635]: Neptune · eu-west-1a · web
                    - generic [ref=e636]:
                      - generic [ref=e637]: 0 in · 0 out
                      - generic [ref=e638]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e641]:
      - text: Live read from
      - generic [ref=e642]: /api/topology-risk/testbed-webshop
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
    - dialog "Topology map full screen" [ref=e643]:
      - generic [ref=e644]:
        - generic [ref=e645]:
          - generic [ref=e646]: Cloud topology
          - generic [ref=e647]: testbed-webshop
        - button "Scope" [ref=e648]:
          - img [ref=e649]
          - text: Scope
        - group "Map density" [ref=e650]:
          - button "Glance" [ref=e651]
          - button "Inventory" [active] [ref=e652]
        - generic [ref=e653]:
          - button "100%" [ref=e654]:
            - img [ref=e655]
            - text: 100%
          - button "Zoom out" [ref=e660]:
            - img [ref=e661]
          - generic "Zoom relative to fit — 100% = map fills page width" [ref=e664]: 100%
          - button "Zoom in" [ref=e665]:
            - img [ref=e666]
        - button "Exit map fullscreen" [ref=e669]:
          - img [ref=e670]
          - text: Exit
      - generic [ref=e678]:
        - generic [ref=e679]:
          - generic [ref=e680]:
            - generic [ref=e681]: Platform map
            - generic [ref=e682]: 1 VPC · 2 AZ · 6 subnets · 30 resources
          - generic [ref=e683]:
            - generic [ref=e684]: Map lens
            - generic [ref=e685]:
              - button "Architecture" [ref=e686]:
                - img [ref=e687]
                - text: Architecture
              - button "Dependencies" [pressed] [ref=e697]:
                - img [ref=e698]
                - text: Dependencies
              - button "Attack paths" [ref=e702]:
                - img [ref=e703]
                - text: Attack paths
        - generic "Dependency line colors" [ref=e705]:
          - generic [ref=e706]: Flow colors
          - generic [ref=e707]:
            - img [ref=e708]
            - generic [ref=e710]: Service call
          - generic [ref=e711]:
            - img [ref=e712]
            - generic [ref=e714]: AWS data service
          - generic [ref=e715]:
            - img [ref=e716]
            - generic [ref=e718]: VPC endpoint
          - generic [ref=e719]:
            - img [ref=e720]
            - generic [ref=e722]: Internet egress
          - generic [ref=e723]:
            - img [ref=e724]
            - generic [ref=e726]: Database
          - generic [ref=e727]:
            - img [ref=e728]
            - generic [ref=e730]: Exposure / attack
          - generic [ref=e731]: Moving = authoritative observed
          - generic [ref=e735]:
            - img [ref=e736]
            - text: Outlined motion = historical direction
          - generic [ref=e739]:
            - img [ref=e740]
            - text: Solid = configured
          - generic [ref=e741]:
            - img [ref=e742]
            - text: Dashed = inferred / unverified
        - generic [ref=e743]:
          - generic [ref=e744]: Traffic evidence not yet authoritative
          - generic [ref=e745]: Outlined packets show historical source-to-target direction; they do not claim live traffic.
        - generic [ref=e746]:
          - generic [ref=e747]:
            - generic [ref=e748]: Flow-log coverage
            - generic [ref=e749]: Not covered
            - generic [ref=e750]: 0 of 14 eligible endpoints covered · 16 not applicable
            - generic [ref=e751]:
              - 'generic "In-VPC: eligible 9, covered 0, unknown 0, not applicable 0" [ref=e752]': In-VPC 0/9
              - 'generic "Database: eligible 5, covered 0, unknown 0, not applicable 0" [ref=e753]': Database 0/5
              - 'generic "Lambda: eligible 0, covered 0, unknown 0, not applicable 6" [ref=e754]': Lambda 6 n/a
              - 'generic "Regional: eligible 0, covered 0, unknown 0, not applicable 10" [ref=e755]': Regional 10 n/a
          - list [ref=e756]:
            - 'listitem "Lambda → database: not collected. 6 function(s) run outside the VPC, so no flow log or CloudTrail data event observes their connections to the 5 database(s) in scope." [ref=e757]':
              - generic [ref=e758]: "Lambda:"
              - text: "Lambda → database: not collected. 6 function(s) run outside the VPC, so no flow log or CloudTrail data event observes their connections to the 5 database(s) in scope."
            - listitem "10 regional service(s) have no VPC network interface; VPC flow logs cannot observe them. Access to them is evidenced by CloudTrail data events, a separate lane." [ref=e759]:
              - generic [ref=e760]: "Regional:"
              - text: 10 regional service(s) have no VPC network interface; VPC flow logs cannot observe them. Access to them is evidenced by CloudTrail data events, a separate lane.
            - listitem "The canonical flow-log projection is not active for this scope (mode legacy); none of the 14 eligible endpoint(s) is covered yet." [ref=e761]:
              - generic [ref=e762]: "In-VPC:"
              - text: The canonical flow-log projection is not active for this scope (mode legacy); none of the 14 eligible endpoint(s) is covered yet.
        - generic [ref=e763]:
          - generic [ref=e764]:
            - img [ref=e766]
            - generic [ref=e771]:
              - generic [ref=e772]: Users
              - generic [ref=e773]: Clients & operators
          - generic [ref=e775]:
            - img [ref=e777]
            - generic [ref=e782]:
              - generic [ref=e783]: Internet
              - generic [ref=e784]: Public path via IGW · igw-01b6c643a5c856abe
        - generic [ref=e785]:
          - generic [ref=e786]: ☁ AWS Cloud · acct 416651950952
          - generic [ref=e787]:
            - generic [ref=e788]: Region · eu-west-1
            - generic [ref=e789]:
              - generic [ref=e791]:
                - generic [ref=e792]:
                  - generic "vpc-0c39cde96f29f8f4e" [ref=e793]: VPC · vpc-0c39cde96f29f8f4e
                  - generic "9 of 10 workloads in this VPC drop the shared prefix \"cyntro-tb-prod-\" from their chip label — every tooltip still carries the full name" [ref=e794]: cyntro-tb-prod-… ×9
                  - generic [ref=e796]:
                    - button "IGW igw-01b6c643a5c856abe" [ref=e797]:
                      - img [ref=e799]
                      - generic [ref=e802]: IGW
                      - generic [ref=e803]: igw-01b6c643a5c856abe
                    - button "VPCE GW Amazon S3" [ref=e804]:
                      - img [ref=e806]
                      - generic [ref=e810]: VPCE
                      - generic [ref=e811]: GW
                      - generic [ref=e812]: Amazon S3
                - generic [ref=e813]:
                  - generic [ref=e814]:
                    - generic [ref=e815]:
                      - img [ref=e816]
                      - generic [ref=e822]: Load Balancers (2)
                    - generic [ref=e823]:
                      - button "cyntro-tb-prod-alb-int Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e824]:
                        - generic [ref=e826]:
                          - generic [ref=e827]:
                            - generic [ref=e828]: cyntro-tb-prod-alb-int
                            - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e829]: Multi-AZ
                          - generic [ref=e830]: LoadBalancer · arn:aws:elasticloadbalan
                        - generic [ref=e831]: "0"
                      - button "cyntro-tb-prod-alb-pub Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e832]:
                        - generic [ref=e834]:
                          - generic [ref=e835]:
                            - generic [ref=e836]: cyntro-tb-prod-alb-pub
                            - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e837]: Multi-AZ
                          - generic [ref=e838]: LoadBalancer · arn:aws:elasticloadbalan
                        - generic [ref=e839]: "0"
                  - generic [ref=e844]:
                    - generic "eu-west-1a" [ref=e845]
                    - generic "eu-west-1b" [ref=e846]
                - generic [ref=e847]:
                  - generic [ref=e848]: WEB TIER
                  - generic [ref=e850]:
                    - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1a · 10.42.0.0/24 · Owner: testbed-webshop" [ref=e851]':
                      - generic [ref=e852]:
                        - generic [ref=e853]: Public · cyntro-tb-prod-public-eu-west-1a
                        - generic [ref=e854]: 10.42.0.0/24
                      - generic "NAT gateway · nat-0fd7cf8524e62aea9 · subnet subnet-05472c7cd0d3a7b90 (from vpc_topology.edges)" [ref=e856]:
                        - img [ref=e858]
                        - generic [ref=e861]: NAT GW · nat-0fd7cf8524e62aea9
                      - generic [ref=e862]:
                        - button "quiet posture score …web" [ref=e863]:
                          - generic "quiet posture score" [ref=e864]
                          - generic [ref=e867]: …web
                        - button "quiet posture score …tg-app" [ref=e868]:
                          - generic "quiet posture score" [ref=e869]
                          - generic [ref=e872]: …tg-app
                        - button "quiet posture score …tg-web" [ref=e873]:
                          - generic "quiet posture score" [ref=e874]
                          - generic [ref=e877]: …tg-web
                    - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1b · 10.42.1.0/24 · Owner: testbed-webshop" [ref=e878]':
                      - generic [ref=e879]:
                        - generic [ref=e880]: Public · cyntro-tb-prod-public-eu-west-1b
                        - generic [ref=e881]: 10.42.1.0/24
                      - button "quiet posture score …web" [ref=e883]:
                        - generic "quiet posture score" [ref=e884]
                        - generic [ref=e887]: …web
                - generic [ref=e888]:
                  - generic [ref=e889]: APPLICATION TIER
                  - generic [ref=e891]:
                    - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1a · 10.42.10.0/24 · Owner: testbed-webshop" [ref=e892]':
                      - generic [ref=e893]:
                        - generic [ref=e894]: Private · cyntro-tb-prod-app-eu-west-1a
                        - generic [ref=e895]: 10.42.10.0/24
                      - generic [ref=e896]:
                        - button "quiet posture score …loadgen" [ref=e897]:
                          - generic "quiet posture score" [ref=e898]
                          - generic [ref=e901]: …loadgen
                        - button "quiet posture score …app" [ref=e902]:
                          - generic "quiet posture score" [ref=e903]
                          - generic [ref=e906]: …app
                    - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1b · 10.42.11.0/24 · Owner: testbed-webshop" [ref=e907]':
                      - generic [ref=e908]:
                        - generic [ref=e909]: Private · cyntro-tb-prod-app-eu-west-1b
                        - generic [ref=e910]: 10.42.11.0/24
                      - button "quiet posture score …app" [ref=e912]:
                        - generic "quiet posture score" [ref=e913]
                        - generic [ref=e916]: …app
                - generic [ref=e917]:
                  - generic [ref=e918]: DATABASE TIER
                  - generic [ref=e920]:
                    - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1a · 10.42.20.0/24 · Owner: testbed-webshop" [ref=e921]':
                      - generic [ref=e922]:
                        - generic [ref=e923]: Data · cyntro-tb-prod-data-eu-west-1a
                        - generic [ref=e924]: 10.42.20.0/24
                      - generic [ref=e925]:
                        - button "quiet posture score AZ+ …aurora-0" [ref=e926]:
                          - generic "quiet posture score" [ref=e927]
                          - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e930]: AZ+
                          - generic [ref=e931]: …aurora-0
                        - button "quiet posture score AZ+ …aurora-1" [ref=e932]:
                          - generic "quiet posture score" [ref=e933]
                          - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e936]: AZ+
                          - generic [ref=e937]: …aurora-1
                        - button "quiet posture score AZ+ cyntro-testbed-webshop-writer" [ref=e938]:
                          - generic "quiet posture score" [ref=e939]
                          - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e942]: AZ+
                          - generic [ref=e943]: cyntro-testbed-webshop-writer
                    - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1b · 10.42.21.0/24 · Owner: testbed-webshop" [ref=e944]':
                      - generic [ref=e945]:
                        - generic [ref=e946]: Data · cyntro-tb-prod-data-eu-west-1b
                        - generic [ref=e947]: 10.42.21.0/24
                      - generic [ref=e948]:
                        - button "quiet posture score AZ+ …aurora-0" [ref=e949]:
                          - generic "quiet posture score" [ref=e950]
                          - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e953]: AZ+
                          - generic [ref=e954]: …aurora-0
                        - button "quiet posture score AZ+ …aurora-1" [ref=e955]:
                          - generic "quiet posture score" [ref=e956]
                          - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e959]: AZ+
                          - generic [ref=e960]: …aurora-1
                        - button "quiet posture score AZ+ cyntro-testbed-webshop-writer" [ref=e961]:
                          - generic "quiet posture score" [ref=e962]
                          - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e965]: AZ+
                          - generic [ref=e966]: cyntro-testbed-webshop-writer
              - generic [ref=e968]:
                - generic [ref=e969]:
                  - generic [ref=e970]:
                    - generic [ref=e971]: Lambda runtime (6)
                    - generic [ref=e972]:
                      - text: outside subnet grid · 6 attachment unverified
                      - generic "12 of 12 chips omit this shared prefix" [ref=e973]: · cyntro-tb-prod-consumer-… ×12
                  - generic [ref=e974]:
                    - generic [ref=e975]: Triggers (6)
                    - generic [ref=e976]:
                      - button "quiet posture score …daily" [ref=e977]:
                        - generic "quiet posture score" [ref=e978]
                        - generic [ref=e981]: …daily
                      - button "quiet posture score …every_6h" [ref=e982]:
                        - generic "quiet posture score" [ref=e983]
                        - generic [ref=e986]: …every_6h
                      - button "quiet posture score …frequent" [ref=e987]:
                        - generic "quiet posture score" [ref=e988]
                        - generic [ref=e991]: …frequent
                      - button "quiet posture score …monthly" [ref=e992]:
                        - generic "quiet posture score" [ref=e993]
                        - generic [ref=e996]: …monthly
                      - button "quiet posture score …nightly_burst" [ref=e997]:
                        - generic "quiet posture score" [ref=e998]
                        - generic [ref=e1001]: …nightly_burst
                      - button "quiet posture score …weekly" [ref=e1002]:
                        - generic "quiet posture score" [ref=e1003]
                        - generic [ref=e1006]: …weekly
                  - button "↑ 3 above" [ref=e1007]
                  - generic [ref=e1009]:
                    - button "quiet posture score …monthly" [ref=e1010]:
                      - generic "quiet posture score" [ref=e1011]
                      - generic [ref=e1014]: …monthly
                    - button "quiet posture score …weekly" [ref=e1015]:
                      - generic "quiet posture score" [ref=e1016]
                      - generic [ref=e1019]: …weekly
                    - button "quiet posture score …daily" [ref=e1020]:
                      - generic "quiet posture score" [ref=e1021]
                      - generic [ref=e1024]: …daily
                    - button "quiet posture score …every_6h" [ref=e1025]:
                      - generic "quiet posture score" [ref=e1026]
                      - generic [ref=e1029]: …every_6h
                    - button "quiet posture score …frequent" [ref=e1030]:
                      - generic "quiet posture score" [ref=e1031]
                      - generic [ref=e1034]: …frequent
                    - button "quiet posture score …nightly_burst" [ref=e1035]:
                      - generic "quiet posture score" [ref=e1036]
                      - generic [ref=e1039]: …nightly_burst
                - generic [ref=e1041]:
                  - generic [ref=e1042]:
                    - text: Regional · S3 / DDB (4)
                    - generic "4 of 4 chips omit this shared prefix" [ref=e1043]: cyntro-… ×4
                  - generic [ref=e1045]:
                    - button "quiet posture score …evidence-testbed-webshop-950952" [ref=e1046]:
                      - generic "quiet posture score" [ref=e1047]
                      - generic [ref=e1050]: …evidence-testbed-webshop-950952
                    - button "quiet posture score …ingest-head-testbed-webshop" [ref=e1051]:
                      - generic "quiet posture score" [ref=e1052]
                      - generic [ref=e1055]: …ingest-head-testbed-webshop
                    - button "quiet posture score …tb-prod-appdata-1c8276f5" [ref=e1056]:
                      - generic "quiet posture score" [ref=e1057]
                      - generic [ref=e1060]: …tb-prod-appdata-1c8276f5
                    - button "quiet posture score …tb-prod-logs-1c8276f5" [ref=e1061]:
                      - generic "quiet posture score" [ref=e1062]
                      - generic [ref=e1065]: …tb-prod-logs-1c8276f5
            - generic [ref=e1066]:
              - generic [ref=e1067]:
                - generic [ref=e1068]: Not placed · the graph does not say where (2)
                - generic [ref=e1069]: In this region, zone and subnet unknown. Never guessed into a cell.
              - generic [ref=e1070]:
                - generic [ref=e1071]: No subnet in the graph (2)
                - generic [ref=e1072]: The resource carries no subnet_id and no IN_SUBNET edge. Usually a collector gap — run a full sync, then re-check.
                - generic [ref=e1073]:
                  - generic [ref=e1074]:
                    - button "quiet posture score cyntro-tb-prod-aurora" [ref=e1075]:
                      - generic "quiet posture score" [ref=e1076]
                      - generic [ref=e1079]: cyntro-tb-prod-aurora
                    - combobox "Place arn:aws:rds:eu-west-1:416651950952:cluster:cyntro-tb-prod-aurora in a subnet tier" [ref=e1080]:
                      - option "Place…" [selected]
                      - option "eu-west-1a · web"
                      - option "eu-west-1a · app"
                      - option "eu-west-1a · data"
                      - option "eu-west-1b · web"
                      - option "eu-west-1b · app"
                      - option "eu-west-1b · data"
                  - generic [ref=e1081]:
                    - button "quiet posture score cyntro-testbed-webshop" [ref=e1082]:
                      - generic "quiet posture score" [ref=e1083]
                      - generic [ref=e1086]: cyntro-testbed-webshop
                    - combobox "Place arn:aws:rds:eu-west-1:416651950952:cluster:cyntro-testbed-webshop in a subnet tier" [ref=e1087]:
                      - option "Place…" [selected]
                      - option "eu-west-1a · web"
                      - option "eu-west-1a · app"
                      - option "eu-west-1a · data"
                      - option "eu-west-1b · web"
                      - option "eu-west-1b · app"
                      - option "eu-west-1b · data"
        - img:
          - generic:
            - generic:
              - generic: Egress · 3 flows
          - generic:
            - generic:
              - generic: TG
          - generic:
            - generic:
              - generic: TG
          - generic:
            - generic:
              - generic: TARGETS
          - generic:
            - generic:
              - generic: TARGETS
          - generic:
            - generic:
              - generic: TARGETS
          - generic:
            - generic:
              - generic: TARGETS
          - generic:
            - generic:
              - generic: S3 access ×4
          - generic:
            - generic:
              - generic: TARGETS ×6
          - generic:
            - generic:
              - generic: TRIGGERS ×6
  - region "Notifications (F8)":
    - list
  - alert [ref=e1088]
```

# Test source

```ts
  382 |         .waitForRequest(request => request.url().includes("/api/proxy/topology-risk/"), { timeout: 60_000 })
  383 |         .catch(() => null)
  384 |       const unscoped = riskUrls.filter(
  385 |         href => !href.includes("account_id=") || !href.includes("region="),
  386 |       )
  387 |       report("estate-topology-risk-urls", {
  388 |         attempt,
  389 |         first: firstRisk?.url() ?? null,
  390 |         urls: [...riskUrls],
  391 |         unscoped,
  392 |         responses: [...riskResponses],
  393 |       })
  394 |       expect(unscoped, "Estate must not fire an unscoped topology-risk GET on a scoped C1 URL").toEqual([])
  395 |       await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 90_000 })
  396 |       mounted = await mapTab.isVisible().catch(() => false)
  397 |       expect(
  398 |         riskUrls.filter(href => href.includes("vpc_id=")),
  399 |         "Estate must not add vpc_id when the opening URL did not ask for one",
  400 |       ).toEqual([])
  401 |       const reason = mounted
  402 |         ? null
  403 |         : ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
  404 |       loads.push({ attempt, mounted, reason, ms: Date.now() - t0 })
  405 |       if (!mounted && attempt < 3) await page.waitForTimeout(8_000)
  406 |     }
  407 |     report("estate-page", { mounted, loads, gate })
  408 |     if (!mounted) {
  409 |       await shot(page, "c1-estate-blocked")
  410 |       throw new Error(`estate map did not mount after ${loads.length} loads: ${loads[loads.length - 1]?.reason}`)
  411 |     }
  412 |     await page.getByRole("tab", { name: "Network topology" }).click()
  413 |     const dependencies = page
  414 |       .getByTestId("topology-flow-mode-toggle")
  415 |       .getByRole("button", { name: "Dependencies" })
  416 |       .first()
  417 |     await dependencies.click()
  418 |     await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  419 |     await page.waitForTimeout(1500)
  420 |     await shot(page, "c1-estate-embedded")
  421 | 
  422 |     const vpcOptions = await page
  423 |       .getByTestId("topology-vpc-select")
  424 |       .locator("option")
  425 |       .allTextContents()
  426 |       .catch(() => [] as string[])
  427 |     report("scope-gate", gate)
  428 |     report("embedded", {
  429 |       vpc_options: vpcOptions,
  430 |       authority_banner: await bannerText(page, "page"),
  431 |       coverage_pill: await readPill(page, "page"),
  432 |       payload_captured: Boolean(captured.payload),
  433 |       ...(await measureEmbeddedLegibility(page)),
  434 |     })
  435 | 
  436 |     // Fullscreen — Glance first (the default), then Inventory (one icon per node).
  437 |     await page.getByTestId("topology-estate-map-enlarge").click()
  438 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  439 |     await expect(fullscreen).toBeVisible()
  440 |     await page.waitForTimeout(1500)
  441 |     await shot(page, "c1-fullscreen-glance")
  442 |     const glance = await measureFullscreen(page)
  443 |     report("fullscreen-glance", { ...glance, header_overlaps: await railHeaderBadgeOverlaps(page) })
  444 | 
  445 |     await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
  446 |     await page.waitForTimeout(1500)
  447 |     await shot(page, "c1-fullscreen-inventory")
  448 |     const inventory = await measureFullscreen(page)
  449 |     const overlaps = await railHeaderBadgeOverlaps(page)
  450 |     const pill = await readPill(page, "fullscreen")
  451 |     report("fullscreen-inventory", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  452 |     await attachJson("fullscreen-inventory.json", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  453 | 
  454 |     // --- Assertions. Soft where the graph's shape decides what is present.
  455 |     const overlapping = overlaps.filter(o => {
  456 |       const depth = Math.min(o.badge.b, o.headerBox.b) - Math.max(o.badge.t, o.headerBox.t)
  457 |       return depth > 1
  458 |     })
  459 |     expect.soft(overlapping, "no flow label paints over a rail header (touches ≤ 1px are reported, not failed)").toEqual([])
  460 |     for (const lane of ["serverless", "regional"] as const) {
  461 |       const measured = inventory.lanes[lane]
  462 |       if (!measured || !inventory.rail) continue
  463 |       expect.soft(measured.header.t, `${lane} header inside the rail`).toBeGreaterThanOrEqual(inventory.rail.t - 1)
  464 |       expect.soft(measured.header.b, `${lane} header inside the rail`).toBeLessThanOrEqual(inventory.rail.b + 1)
  465 |       expect.soft(measured.header.b, `${lane} header inside the viewport`).toBeLessThanOrEqual(inventory.viewport.h)
  466 |       expect.soft(measured.overflowY, `${lane} lane body owns its scroll`).toBe("auto")
  467 |       if (measured.scrollHeight > measured.clientHeight + 4) {
  468 |         expect.soft(measured.more_pill, `${lane} fold footer counts the chips below`).toBe(`+${measured.below} more ↓`)
  469 |       } else {
  470 |         expect.soft(measured.more_pill, `${lane} has no fold footer without overflow`).toBeNull()
  471 |       }
  472 |     }
  473 |     if (inventory.alb_band && inventory.az_headers) {
  474 |       expect.soft(inventory.alb_band.b, "load balancer band above the AZ headers").toBeLessThanOrEqual(inventory.az_headers.t + 1)
  475 |     }
  476 |     if (inventory.band_row && inventory.first_tier) {
  477 |       expect.soft(
  478 |         inventory.first_tier.t,
  479 |         "the Web tier starts below the band row (load balancers · NAT fallback · AZ headers)",
  480 |       ).toBeGreaterThanOrEqual(inventory.band_row.b - 1)
  481 |     }
> 482 |     expect.soft(inventory.cells_under_az_headers, "no subnet cell starts above the AZ header row's bottom edge").toBe(0)
      |                                                                                                                  ^ Error: no subnet cell starts above the AZ header row's bottom edge
  483 |     for (const nat of inventory.nat) {
  484 |       if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
  485 |       else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
  486 |     }
  487 |     const payload = captured.payload
  488 |     const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
  489 |     if (payload) {
  490 |       expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
  491 |     }
  492 | 
  493 |     // Coverage pill: exactly the payload's numbers, or absent when the payload has none.
  494 |     const coverage = payload?.traffic_authority?.lane_coverage ?? null
  495 |     if (coverage) {
  496 |       expect.soft(pill, "coverage pill rendered for a payload with lane_coverage").not.toBeNull()
  497 |       if (pill) {
  498 |         expect.soft(pill.state, "pill state").toBe(coverage.state ?? null)
  499 |         expect.soft(pill.totals, "pill totals").toBe(expectedTotalsText(coverage))
  500 |         for (const lane of COVERAGE_LANES) {
  501 |           const counts = coverage.by_lane?.[lane]
  502 |           const chip = pill.lanes.find(entry => entry.testid === `topology-lane-coverage-${lane}`)
  503 |           if (!counts || counts.state === "empty") expect.soft(chip, `${lane} chip absent for an empty lane`).toBeUndefined()
  504 |           else expect.soft(chip?.state, `${lane} chip state`).toBe(counts.state)
  505 |         }
  506 |         expect.soft(pill.warnings.map(warning => warning.code), "warnings, in the backend's order").toEqual(
  507 |           (coverage.warnings ?? []).map(warning => warning.code),
  508 |         )
  509 |       }
  510 |     } else {
  511 |       expect.soft(pill, "no coverage pill without lane_coverage in the payload").toBeNull()
  512 |     }
  513 | 
  514 |     // Scroll the Lambda lane when it overflows: the last chip must land inside
  515 |     // a lane body that is at least one chip tall, with both fold pills up.
  516 |     const serverless = inventory.lanes.serverless
  517 |     if (serverless && serverless.scrollHeight > serverless.clientHeight + 4) {
  518 |       const laneBody = fullscreen.getByTestId("topology-serverless-lane-body")
  519 |       const chips = laneBody.locator("[data-flow-id], [data-flow-ids]")
  520 |       const chipCount = await chips.count()
  521 |       const last = chips.nth(chipCount - 1)
  522 |       const pageScrollBefore = await page.evaluate(() => window.scrollY)
  523 |       // scrollIntoViewIfNeeded waits on the page viewport. The last Lambda
  524 |       // chip lives in a nested overflow lane, so that wait never finishes
  525 |       // (c1-ui-qa #32 hit the 300s test timeout after the map had mounted).
  526 |       await laneBody.evaluate(el => {
  527 |         el.scrollTop = el.scrollHeight
  528 |       })
  529 |       await page.waitForTimeout(500)
  530 |       const after = await last.boundingBox()
  531 |       const bodyAfter = await laneBody.boundingBox()
  532 |       const scrolled = {
  533 |         chip: after,
  534 |         body: bodyAfter,
  535 |         lane_scrollTop: await laneBody.evaluate(el => el.scrollTop),
  536 |         page_scrolled: (await page.evaluate(() => window.scrollY)) !== pageScrollBefore,
  537 |         above_pill: await page.evaluate(() => {
  538 |           const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
  539 |           const el = root?.querySelector('[data-testid="topology-serverless-lane-above"]')
  540 |           return (el?.textContent ?? "").replace(/\s+/g, " ").trim() || null
  541 |         }),
  542 |         more_pill: await page.evaluate(() => {
  543 |           const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
  544 |           const el = root?.querySelector('[data-testid="topology-serverless-lane-more"]')
  545 |           return (el?.textContent ?? "").replace(/\s+/g, " ").trim() || null
  546 |         }),
  547 |         header_overlaps: await railHeaderBadgeOverlaps(page),
  548 |       }
  549 |       report("fullscreen-inventory-scrolled", scrolled)
  550 |       await shot(page, "c1-fullscreen-inventory-scrolled")
  551 |       if (after && bodyAfter) {
  552 |         expect.soft(after.y, "scrolled chip inside its lane body (top)").toBeGreaterThanOrEqual(bodyAfter.y - 1)
  553 |         expect.soft(after.y + after.height, "scrolled chip inside its lane body (bottom)").toBeLessThanOrEqual(bodyAfter.y + bodyAfter.height + 1)
  554 |         expect.soft(bodyAfter.height, "lane body at least one chip tall").toBeGreaterThanOrEqual(after.height)
  555 |       }
  556 |       expect.soft(scrolled.page_scrolled, "the lane scrolled, not the page").toBe(false)
  557 |       expect.soft(scrolled.header_overlaps, "headers still clear after the scroll").toEqual([])
  558 |     }
  559 | 
  560 |     report("page-errors", pageErrors)
  561 |     expect.soft(pageErrors, "no uncaught page errors").toEqual([])
  562 |   })
  563 | })
  564 | 
  565 | /** Embedded map: labels painted over off-VPC rail chips, and unknown-glyph nodes. */
  566 | async function measureEmbeddedLegibility(page: Page): Promise<{
  567 |   labels_over_rail_chips: Array<{ label: string; chip: string | null }>
  568 |   unknown_glyph_nodes: Array<{ name: string; title: string | null }>
  569 |   rail_chips: number
  570 |   flow_badges: number
  571 | }> {
  572 |   return page.evaluate(() => {
  573 |     const fullscreen = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
  574 |     const rails = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="topology-edge-services-rail"]')).filter(
  575 |       el => !fullscreen || !fullscreen.contains(el),
  576 |     )
  577 |     const rail = rails[0] ?? null
  578 |     const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()
  579 |     const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  580 |     const chips = rail
  581 |       ? Array.from(rail.querySelectorAll<HTMLElement>("[data-flow-id], [data-flow-ids]")).filter(chip => chip.getBoundingClientRect().height > 0)
  582 |       : []
```