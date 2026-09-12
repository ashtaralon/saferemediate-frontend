# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:381:7

# Error details

```
Error: no flow badge is painted over a NAT gateway chip

expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 10

- Array []
+ Array [
+   Object {
+     "chip": "nat-0fd7cf8524e62aea9",
+     "label": "Egress · 3 flows",
+   },
+   Object {
+     "chip": "nat-0fd7cf8524e62aea9",
+     "label": "TG",
+   },
+ ]
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
          - generic [ref=e41]: scored 2026-09-12T00:27:52Z · 0 flagged · posture_correlated_at >= now() - 7d on any workload · VPC vpc-0c39cde96f29f8f4e · cached locally · backend timeout — serving stale
        - generic [ref=e42]:
          - generic [ref=e43]:
            - generic [ref=e44]: Evidence computed Sep 12, 2026, 12:27 AM
            - generic [ref=e46]: Snapshot 7h old
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
      - button "AutoScalingGroup (2)" [pressed] [ref=e63]
      - generic "Regional services are system-wide. Lambda inventory is system-wide too, while placement distinguishes VPC-attached functions from non-VPC-attached runtimes." [ref=e64]: System-wide
      - button "Lambda (6)" [pressed] [ref=e65]
      - button "EventBridge (6)" [pressed] [ref=e66]
      - button "S3 (3)" [pressed] [ref=e67]
      - button "KMSKey (3)" [pressed] [ref=e68]
      - button "DynamoDB (1)" [pressed] [ref=e69]
      - button "Show all" [ref=e70]
      - button "Clear all" [ref=e71]
    - generic [ref=e72]:
      - main [ref=e73]:
        - generic [ref=e74]:
          - tablist "Estate view" [ref=e75]:
            - tab "Command map" [ref=e76]
            - tab "Network topology" [selected] [ref=e77]
          - group "Map density" [ref=e78]:
            - button "Glance" [ref=e79]
            - button "Inventory" [ref=e80]
          - button "Shared neighbors" [pressed] [ref=e81]
          - button "Open map fullscreen" [ref=e82]:
            - img [ref=e83]
            - text: Map fullscreen
      - complementary [ref=e90]:
        - complementary [ref=e91]:
          - generic [ref=e92]:
            - generic [ref=e93]:
              - heading "Service index" [level=2] [ref=e94]
              - generic [ref=e95]: "35"
            - generic [ref=e96]:
              - img [ref=e97]
              - searchbox "Find service in topology" [ref=e100]
            - button "Filters" [ref=e103]:
              - img [ref=e104]
              - text: Filters
          - list [ref=e106]:
            - listitem [ref=e107]:
              - button "cyntro-tb-prod-appdata-1c8276f5 Current graph data S3 · global · regional 4 in · 1 out Aug 20, 04:53 PM" [ref=e108]:
                - generic [ref=e109]:
                  - img [ref=e111]
                  - generic [ref=e113]:
                    - generic [ref=e114]:
                      - generic [ref=e115]: cyntro-tb-prod-appdata-1c8276f5
                      - generic "Current graph data" [ref=e116]
                    - generic [ref=e118]: S3 · global · regional
                    - generic [ref=e119]:
                      - generic [ref=e120]: 4 in · 1 out
                      - generic [ref=e121]:
                        - img [ref=e122]
                        - text: Aug 20, 04:53 PM
            - listitem [ref=e125]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2 Current graph data KMSKey · global · regional 3 in · 0 out Sep 11, 07:35 PM" [ref=e126]:
                - generic [ref=e127]:
                  - img [ref=e129]
                  - generic [ref=e131]:
                    - generic [ref=e132]:
                      - generic [ref=e133]: arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2
                      - generic "Current graph data" [ref=e134]
                    - generic [ref=e136]: KMSKey · global · regional
                    - generic [ref=e137]:
                      - generic [ref=e138]: 3 in · 0 out
                      - generic [ref=e139]:
                        - img [ref=e140]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e143]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1b · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e144]:
                - generic [ref=e145]:
                  - img [ref=e147]
                  - generic [ref=e149]:
                    - generic [ref=e150]:
                      - generic [ref=e151]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e152]
                    - generic [ref=e154]: EC2 · eu-west-1b · app
                    - generic [ref=e155]:
                      - generic [ref=e156]: 2 in · 1 out
                      - generic [ref=e157]:
                        - img [ref=e158]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e161]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1a · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e162]:
                - generic [ref=e163]:
                  - img [ref=e165]
                  - generic [ref=e167]:
                    - generic [ref=e168]:
                      - generic [ref=e169]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e170]
                    - generic [ref=e172]: EC2 · eu-west-1a · app
                    - generic [ref=e173]:
                      - generic [ref=e174]: 2 in · 1 out
                      - generic [ref=e175]:
                        - img [ref=e176]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e179]:
              - button "cyntro-tb-prod-consumer-daily Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e180]:
                - generic [ref=e181]:
                  - img [ref=e183]
                  - generic [ref=e185]:
                    - generic [ref=e186]:
                      - generic [ref=e187]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e188]
                    - generic [ref=e190]: Lambda · eu-west-1 · regional
                    - generic [ref=e191]:
                      - generic [ref=e192]: 2 in · 1 out
                      - generic [ref=e193]:
                        - img [ref=e194]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e197]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e198]:
                - generic [ref=e199]:
                  - img [ref=e201]
                  - generic [ref=e203]:
                    - generic [ref=e204]:
                      - generic [ref=e205]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e206]
                    - generic [ref=e208]: Lambda · eu-west-1 · regional
                    - generic [ref=e209]:
                      - generic [ref=e210]: 2 in · 1 out
                      - generic [ref=e211]:
                        - img [ref=e212]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e215]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 1, 11:00 AM" [ref=e216]:
                - generic [ref=e217]:
                  - img [ref=e219]
                  - generic [ref=e221]:
                    - generic [ref=e222]:
                      - generic [ref=e223]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e224]
                    - generic [ref=e226]: Lambda · eu-west-1 · regional
                    - generic [ref=e227]:
                      - generic [ref=e228]: 2 in · 1 out
                      - generic [ref=e229]:
                        - img [ref=e230]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e233]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e234]:
                - generic [ref=e235]:
                  - img [ref=e237]
                  - generic [ref=e239]:
                    - generic [ref=e240]:
                      - generic [ref=e241]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e242]
                    - generic [ref=e244]: Lambda · eu-west-1 · regional
                    - generic [ref=e245]:
                      - generic [ref=e246]: 2 in · 1 out
                      - generic [ref=e247]:
                        - img [ref=e248]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e251]:
              - button "cyntro-tb-prod-tg-app Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e252]:
                - generic [ref=e253]:
                  - img [ref=e255]
                  - generic [ref=e257]:
                    - generic [ref=e258]:
                      - generic [ref=e259]: cyntro-tb-prod-tg-app
                      - generic "Current graph data" [ref=e260]
                    - generic [ref=e262]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e263]:
                      - generic [ref=e264]: 1 in · 2 out
                      - generic [ref=e265]:
                        - img [ref=e266]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e269]:
              - button "cyntro-tb-prod-tg-web Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e270]:
                - generic [ref=e271]:
                  - img [ref=e273]
                  - generic [ref=e275]:
                    - generic [ref=e276]:
                      - generic [ref=e277]: cyntro-tb-prod-tg-web
                      - generic "Current graph data" [ref=e278]
                    - generic [ref=e280]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e281]:
                      - generic [ref=e282]: 1 in · 2 out
                      - generic [ref=e283]:
                        - img [ref=e284]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e287]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453 Current graph data KMSKey · global · regional 2 in · 0 out Sep 11, 07:35 PM" [ref=e288]:
                - generic [ref=e289]:
                  - img [ref=e291]
                  - generic [ref=e293]:
                    - generic [ref=e294]:
                      - generic [ref=e295]: arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                      - generic "Current graph data" [ref=e296]
                    - generic [ref=e298]: KMSKey · global · regional
                    - generic [ref=e299]:
                      - generic [ref=e300]: 2 in · 0 out
                      - generic [ref=e301]:
                        - img [ref=e302]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e305]:
              - button "cyntro-tb-prod-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e306]:
                - generic [ref=e307]:
                  - img [ref=e309]
                  - generic [ref=e311]:
                    - generic [ref=e312]:
                      - generic [ref=e313]: cyntro-tb-prod-asg-app
                      - generic "Current graph data" [ref=e314]
                    - generic [ref=e316]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e317]:
                      - generic [ref=e318]: 0 in · 2 out
                      - generic [ref=e319]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e322]:
              - button "cyntro-tb-prod-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e323]:
                - generic [ref=e324]:
                  - img [ref=e326]
                  - generic [ref=e328]:
                    - generic [ref=e329]:
                      - generic [ref=e330]: cyntro-tb-prod-asg-web
                      - generic "Current graph data" [ref=e331]
                    - generic [ref=e333]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e334]:
                      - generic [ref=e335]: 0 in · 2 out
                      - generic [ref=e336]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e339]:
              - button "cyntro-tb-prod-consumer-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e340]:
                - generic [ref=e341]:
                  - img [ref=e343]
                  - generic [ref=e345]:
                    - generic [ref=e346]:
                      - generic [ref=e347]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e348]
                    - generic [ref=e350]: EventBridge · eu-west-1 · regional
                    - generic [ref=e351]:
                      - generic [ref=e352]: 0 in · 2 out
                      - generic [ref=e353]:
                        - img [ref=e354]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e357]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e358]:
                - generic [ref=e359]:
                  - img [ref=e361]
                  - generic [ref=e363]:
                    - generic [ref=e364]:
                      - generic [ref=e365]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e366]
                    - generic [ref=e368]: EventBridge · eu-west-1 · regional
                    - generic [ref=e369]:
                      - generic [ref=e370]: 0 in · 2 out
                      - generic [ref=e371]:
                        - img [ref=e372]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e375]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Sep 1, 11:00 AM" [ref=e376]:
                - generic [ref=e377]:
                  - img [ref=e379]
                  - generic [ref=e381]:
                    - generic [ref=e382]:
                      - generic [ref=e383]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e384]
                    - generic [ref=e386]: EventBridge · eu-west-1 · regional
                    - generic [ref=e387]:
                      - generic [ref=e388]: 0 in · 2 out
                      - generic [ref=e389]:
                        - img [ref=e390]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e393]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e394]:
                - generic [ref=e395]:
                  - img [ref=e397]
                  - generic [ref=e399]:
                    - generic [ref=e400]:
                      - generic [ref=e401]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e402]
                    - generic [ref=e404]: Lambda · eu-west-1 · regional
                    - generic [ref=e405]:
                      - generic [ref=e406]: 2 in · 0 out
                      - generic [ref=e407]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e410]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e411]:
                - generic [ref=e412]:
                  - img [ref=e414]
                  - generic [ref=e416]:
                    - generic [ref=e417]:
                      - generic [ref=e418]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e419]
                    - generic [ref=e421]: EventBridge · eu-west-1 · regional
                    - generic [ref=e422]:
                      - generic [ref=e423]: 0 in · 2 out
                      - generic [ref=e424]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e427]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e428]:
                - generic [ref=e429]:
                  - img [ref=e431]
                  - generic [ref=e433]:
                    - generic [ref=e434]:
                      - generic [ref=e435]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e436]
                    - generic [ref=e438]: EventBridge · eu-west-1 · regional
                    - generic [ref=e439]:
                      - generic [ref=e440]: 0 in · 2 out
                      - generic [ref=e441]:
                        - img [ref=e442]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e445]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out Aug 29, 11:00 AM" [ref=e446]:
                - generic [ref=e447]:
                  - img [ref=e449]
                  - generic [ref=e451]:
                    - generic [ref=e452]:
                      - generic [ref=e453]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e454]
                    - generic [ref=e456]: Lambda · eu-west-1 · regional
                    - generic [ref=e457]:
                      - generic [ref=e458]: 2 in · 0 out
                      - generic [ref=e459]:
                        - img [ref=e460]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e463]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 29, 11:00 AM" [ref=e464]:
                - generic [ref=e465]:
                  - img [ref=e467]
                  - generic [ref=e469]:
                    - generic [ref=e470]:
                      - generic [ref=e471]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e472]
                    - generic [ref=e474]: EventBridge · eu-west-1 · regional
                    - generic [ref=e475]:
                      - generic [ref=e476]: 0 in · 2 out
                      - generic [ref=e477]:
                        - img [ref=e478]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e481]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1a · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e482]:
                - generic [ref=e483]:
                  - img [ref=e485]
                  - generic [ref=e487]:
                    - generic [ref=e488]:
                      - generic [ref=e489]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e490]
                    - generic [ref=e492]: EC2 · eu-west-1a · web
                    - generic [ref=e493]:
                      - generic [ref=e494]: 2 in · 0 out
                      - generic [ref=e495]:
                        - img [ref=e496]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e499]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1b · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e500]:
                - generic [ref=e501]:
                  - img [ref=e503]
                  - generic [ref=e505]:
                    - generic [ref=e506]:
                      - generic [ref=e507]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e508]
                    - generic [ref=e510]: EC2 · eu-west-1b · web
                    - generic [ref=e511]:
                      - generic [ref=e512]: 2 in · 0 out
                      - generic [ref=e513]:
                        - img [ref=e514]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e517]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a Current graph data KMSKey · global · regional 1 in · 0 out No runtime timestamp" [ref=e518]:
                - generic [ref=e519]:
                  - img [ref=e521]
                  - generic [ref=e523]:
                    - generic [ref=e524]:
                      - generic [ref=e525]: arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a
                      - generic "Current graph data" [ref=e526]
                    - generic [ref=e528]: KMSKey · global · regional
                    - generic [ref=e529]:
                      - generic [ref=e530]: 1 in · 0 out
                      - generic [ref=e531]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e534]:
              - button "cyntro-evidence-testbed-webshop-950952 Current graph data S3 · global · regional 0 in · 1 out No runtime timestamp" [ref=e535]:
                - generic [ref=e536]:
                  - img [ref=e538]
                  - generic [ref=e540]:
                    - generic [ref=e541]:
                      - generic [ref=e542]: cyntro-evidence-testbed-webshop-950952
                      - generic "Current graph data" [ref=e543]
                    - generic [ref=e545]: S3 · global · regional
                    - generic [ref=e546]:
                      - generic [ref=e547]: 0 in · 1 out
                      - generic [ref=e548]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e551]:
              - button "cyntro-ingest-head-testbed-webshop Current graph data DynamoDB · eu-west-1 · regional 0 in · 1 out No runtime timestamp" [ref=e552]:
                - generic [ref=e553]:
                  - img [ref=e555]
                  - generic [ref=e557]:
                    - generic [ref=e558]:
                      - generic [ref=e559]: cyntro-ingest-head-testbed-webshop
                      - generic "Current graph data" [ref=e560]
                    - generic [ref=e562]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e563]:
                      - generic [ref=e564]: 0 in · 1 out
                      - generic [ref=e565]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e568]:
              - button "cyntro-tb-prod-alb-int Current graph data LoadBalancer · eu-west-1a · app 0 in · 1 out No runtime timestamp" [ref=e569]:
                - generic [ref=e570]:
                  - img [ref=e572]
                  - generic [ref=e574]:
                    - generic [ref=e575]:
                      - generic [ref=e576]: cyntro-tb-prod-alb-int
                      - generic "Current graph data" [ref=e577]
                    - generic [ref=e579]: LoadBalancer · eu-west-1a · app
                    - generic [ref=e580]:
                      - generic [ref=e581]: 0 in · 1 out
                      - generic [ref=e582]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e585]:
              - button "cyntro-tb-prod-alb-pub Current graph data LoadBalancer · eu-west-1a · web 0 in · 1 out No runtime timestamp" [ref=e586]:
                - generic [ref=e587]:
                  - img [ref=e589]
                  - generic [ref=e591]:
                    - generic [ref=e592]:
                      - generic [ref=e593]: cyntro-tb-prod-alb-pub
                      - generic "Current graph data" [ref=e594]
                    - generic [ref=e596]: LoadBalancer · eu-west-1a · web
                    - generic [ref=e597]:
                      - generic [ref=e598]: 0 in · 1 out
                      - generic [ref=e599]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e602]:
              - button "cyntro-tb-prod-aurora-0 Current graph data RDS · eu-west-1b · data 0 in · 1 out Sep 11, 07:35 PM" [ref=e603]:
                - generic [ref=e604]:
                  - img [ref=e606]
                  - generic [ref=e608]:
                    - generic [ref=e609]:
                      - generic [ref=e610]: cyntro-tb-prod-aurora-0
                      - generic "Current graph data" [ref=e611]
                    - generic [ref=e613]: RDS · eu-west-1b · data
                    - generic [ref=e614]:
                      - generic [ref=e615]: 0 in · 1 out
                      - generic [ref=e616]:
                        - img [ref=e617]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e620]:
              - button "cyntro-tb-prod-aurora-1 Current graph data RDS · eu-west-1a · data 0 in · 1 out Sep 11, 07:35 PM" [ref=e621]:
                - generic [ref=e622]:
                  - img [ref=e624]
                  - generic [ref=e626]:
                    - generic [ref=e627]:
                      - generic [ref=e628]: cyntro-tb-prod-aurora-1
                      - generic "Current graph data" [ref=e629]
                    - generic [ref=e631]: RDS · eu-west-1a · data
                    - generic [ref=e632]:
                      - generic [ref=e633]: 0 in · 1 out
                      - generic [ref=e634]:
                        - img [ref=e635]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e638]:
              - button "cyntro-tb-prod-loadgen Current graph data EC2 · eu-west-1a · app 0 in · 1 out Aug 18, 06:57 PM" [ref=e639]:
                - generic [ref=e640]:
                  - img [ref=e642]
                  - generic [ref=e644]:
                    - generic [ref=e645]:
                      - generic [ref=e646]: cyntro-tb-prod-loadgen
                      - generic "Current graph data" [ref=e647]
                    - generic [ref=e649]: EC2 · eu-west-1a · app
                    - generic [ref=e650]:
                      - generic [ref=e651]: 0 in · 1 out
                      - generic [ref=e652]:
                        - img [ref=e653]
                        - text: Aug 18, 06:57 PM
            - listitem [ref=e656]:
              - button "cyntro-testbed-webshop-writer Current graph data Neptune · eu-west-1a · web 0 in · 1 out Sep 11, 07:35 PM" [ref=e657]:
                - generic [ref=e658]:
                  - img [ref=e660]
                  - generic [ref=e662]:
                    - generic [ref=e663]:
                      - generic [ref=e664]: cyntro-testbed-webshop-writer
                      - generic "Current graph data" [ref=e665]
                    - generic [ref=e667]: Neptune · eu-west-1a · web
                    - generic [ref=e668]:
                      - generic [ref=e669]: 0 in · 1 out
                      - generic [ref=e670]:
                        - img [ref=e671]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e674]:
              - button "cyntro-tb-prod-aurora Current graph data RDS · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e675]:
                - generic [ref=e676]:
                  - img [ref=e678]
                  - generic [ref=e681]:
                    - generic [ref=e682]:
                      - generic [ref=e683]: cyntro-tb-prod-aurora
                      - generic "Current graph data" [ref=e684]
                    - generic [ref=e686]: RDS · eu-west-1 · regional
                    - generic [ref=e687]:
                      - generic [ref=e688]: 0 in · 0 out
                      - generic [ref=e689]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e692]:
              - button "cyntro-tb-prod-logs-1c8276f5 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp" [ref=e693]:
                - generic [ref=e694]:
                  - img [ref=e696]
                  - generic [ref=e699]:
                    - generic [ref=e700]:
                      - generic [ref=e701]: cyntro-tb-prod-logs-1c8276f5
                      - generic "Current graph data" [ref=e702]
                    - generic [ref=e704]: S3 · global · regional
                    - generic [ref=e705]:
                      - generic [ref=e706]: 0 in · 0 out
                      - generic [ref=e707]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e710]:
              - button "cyntro-testbed-webshop Current graph data Neptune · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e711]:
                - generic [ref=e712]:
                  - img [ref=e714]
                  - generic [ref=e717]:
                    - generic [ref=e718]:
                      - generic [ref=e719]: cyntro-testbed-webshop
                      - generic "Current graph data" [ref=e720]
                    - generic [ref=e722]: Neptune · eu-west-1 · regional
                    - generic [ref=e723]:
                      - generic [ref=e724]: 0 in · 0 out
                      - generic [ref=e725]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e728]:
      - text: Live read from
      - generic [ref=e729]: /api/topology-risk/testbed-webshop
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
    - dialog "Topology map full screen" [ref=e730]:
      - generic [ref=e731]:
        - generic [ref=e732]:
          - generic [ref=e733]: Cloud topology
          - generic [ref=e734]: testbed-webshop
        - button "Scope" [ref=e735]:
          - img [ref=e736]
          - text: Scope
        - group "Map density" [ref=e737]:
          - button "Glance" [ref=e738]
          - button "Inventory" [active] [ref=e739]
        - generic [ref=e740]:
          - button "100%" [ref=e741]:
            - img [ref=e742]
            - text: 100%
          - button "Zoom out" [ref=e747]:
            - img [ref=e748]
          - generic "Zoom relative to fit — 100% = map fills page width" [ref=e751]: 100%
          - button "Zoom in" [ref=e752]:
            - img [ref=e753]
        - button "Exit map fullscreen" [ref=e756]:
          - img [ref=e757]
          - text: Exit
      - generic [ref=e765]:
        - generic [ref=e766]:
          - generic [ref=e767]:
            - generic [ref=e768]: Platform map
            - generic [ref=e769]: 1 VPC · 2 AZ · 6 subnets · 35 resources
          - generic [ref=e770]:
            - generic [ref=e771]: Map lens
            - generic [ref=e772]:
              - button "Architecture" [ref=e773]:
                - img [ref=e774]
                - text: Architecture
              - button "Dependencies" [pressed] [ref=e784]:
                - img [ref=e785]
                - text: Dependencies
              - button "Attack paths" [ref=e789]:
                - img [ref=e790]
                - text: Attack paths
        - generic "Dependency line colors" [ref=e792]:
          - generic [ref=e793]: Flow colors
          - generic [ref=e794]:
            - img [ref=e795]
            - generic [ref=e797]: Service call
          - generic [ref=e798]:
            - img [ref=e799]
            - generic [ref=e801]: AWS data service
          - generic [ref=e802]:
            - img [ref=e803]
            - generic [ref=e805]: VPC endpoint
          - generic [ref=e806]:
            - img [ref=e807]
            - generic [ref=e809]: Internet egress
          - generic [ref=e810]:
            - img [ref=e811]
            - generic [ref=e813]: Database
          - generic [ref=e814]:
            - img [ref=e815]
            - generic [ref=e817]: Exposure / attack
          - generic [ref=e818]: Moving = authoritative observed
          - generic [ref=e822]:
            - img [ref=e823]
            - text: Outlined motion = historical direction
          - generic [ref=e826]:
            - img [ref=e827]
            - text: Solid = configured
          - generic [ref=e828]:
            - img [ref=e829]
            - text: Dashed = inferred / unverified
        - generic [ref=e830]:
          - generic [ref=e831]: Traffic evidence not yet authoritative
          - generic [ref=e832]: Outlined packets show historical source-to-target direction; they do not claim live traffic.
        - generic [ref=e833]:
          - generic [ref=e834]:
            - generic [ref=e835]: Flow-log coverage
            - generic [ref=e836]: Not measured
            - generic [ref=e837]: 16 eligible endpoints, coverage not measured · 19 not applicable
            - generic [ref=e838]:
              - 'generic "In-VPC: eligible 11, covered not measured (projection inactive), unknown 0, not applicable 0" [ref=e839]': In-VPC 11 not measured
              - 'generic "Database: eligible 5, covered not measured (projection inactive), unknown 0, not applicable 0" [ref=e840]': Database 5 not measured
              - 'generic "Lambda: eligible 0, covered 0, unknown 0, not applicable 6" [ref=e841]': Lambda 6 n/a
              - 'generic "Regional: eligible 0, covered 0, unknown 0, not applicable 13" [ref=e842]': Regional 13 n/a
          - list [ref=e843]:
            - 'listitem "Lambda → database: not collected. 6 function(s) run outside the VPC, so no flow log or CloudTrail data event observes their connections to the 5 database(s) in scope." [ref=e844]':
              - generic [ref=e845]: "Lambda:"
              - text: "Lambda → database: not collected. 6 function(s) run outside the VPC, so no flow log or CloudTrail data event observes their connections to the 5 database(s) in scope."
            - listitem "13 regional service(s) have no VPC network interface; VPC flow logs cannot observe them. Access to them is evidenced by CloudTrail data events, a separate lane." [ref=e846]:
              - generic [ref=e847]: "Regional:"
              - text: 13 regional service(s) have no VPC network interface; VPC flow logs cannot observe them. Access to them is evidenced by CloudTrail data events, a separate lane.
            - 'listitem "The canonical flow-log projection is not active for this scope (mode legacy), so coverage of the 16 eligible endpoint(s) is not measured. This is not a finding of zero coverage: no endpoint was examined." [ref=e848]':
              - generic [ref=e849]: "In-VPC:"
              - text: "The canonical flow-log projection is not active for this scope (mode legacy), so coverage of the 16 eligible endpoint(s) is not measured. This is not a finding of zero coverage: no endpoint was examined."
        - generic [ref=e850]:
          - generic [ref=e851]:
            - img [ref=e853]
            - generic [ref=e858]:
              - generic [ref=e859]: Users
              - generic [ref=e860]: Clients & operators
          - generic [ref=e862]:
            - img [ref=e864]
            - generic [ref=e869]:
              - generic [ref=e870]: Internet
              - generic [ref=e871]: Public path via IGW · igw-01b6c643a5c856abe
        - generic [ref=e872]:
          - generic [ref=e873]: ☁ AWS Cloud · acct 416651950952
          - generic [ref=e874]:
            - generic [ref=e875]: Region · eu-west-1
            - generic [ref=e876]:
              - generic [ref=e878]:
                - generic [ref=e879]:
                  - generic "vpc-0c39cde96f29f8f4e" [ref=e880]: VPC · vpc-0c39cde96f29f8f4e
                  - generic "7 of 8 workloads in this VPC drop the shared prefix \"cyntro-tb-prod-\" from their chip label — every tooltip still carries the full name" [ref=e881]: cyntro-tb-prod-… ×7
                - generic [ref=e882]:
                  - generic [ref=e883]:
                    - generic [ref=e884]:
                      - img [ref=e885]
                      - generic [ref=e891]: Load Balancers (2)
                    - generic [ref=e892]:
                      - button "cyntro-tb-prod-alb-int Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e893]:
                        - generic [ref=e895]:
                          - generic [ref=e896]:
                            - generic [ref=e897]: cyntro-tb-prod-alb-int
                            - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e898]: Multi-AZ
                          - generic [ref=e899]: LoadBalancer · arn:aws:elasticloadbalan
                        - generic [ref=e900]: "0"
                      - button "cyntro-tb-prod-alb-pub Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e901]:
                        - generic [ref=e903]:
                          - generic [ref=e904]:
                            - generic [ref=e905]: cyntro-tb-prod-alb-pub
                            - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e906]: Multi-AZ
                          - generic [ref=e907]: LoadBalancer · arn:aws:elasticloadbalan
                        - generic [ref=e908]: "0"
                  - generic [ref=e913]:
                    - generic "eu-west-1a" [ref=e914]
                    - generic "eu-west-1b" [ref=e915]
                - generic [ref=e916]:
                  - generic [ref=e917]: WEB TIER
                  - generic [ref=e919]:
                    - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1a · 10.42.0.0/24 · Owner: testbed-webshop" [ref=e920]':
                      - generic [ref=e921]:
                        - generic [ref=e922]: Public · cyntro-tb-prod-public-eu-west-1a
                        - generic [ref=e923]: 10.42.0.0/24
                      - generic "NAT gateway · nat-0fd7cf8524e62aea9 · public 54.229.208.150 · subnet subnet-05472c7cd0d3a7b90 (from vpc_topology.edges)" [ref=e925]:
                        - img [ref=e927]
                        - generic [ref=e930]: NAT GW · nat-0fd7cf8524e62aea9
                      - generic [ref=e931]:
                        - button "quiet posture score …web" [ref=e932]:
                          - generic "quiet posture score" [ref=e933]
                          - generic [ref=e936]: …web
                        - button "quiet posture score cyntro-testbed-webshop-writer" [ref=e937]:
                          - generic "quiet posture score" [ref=e938]
                          - generic [ref=e941]: cyntro-testbed-webshop-writer
                    - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1b · 10.42.1.0/24 · Owner: testbed-webshop" [ref=e942]':
                      - generic [ref=e943]:
                        - generic [ref=e944]: Public · cyntro-tb-prod-public-eu-west-1b
                        - generic [ref=e945]: 10.42.1.0/24
                      - button "quiet posture score …web" [ref=e947]:
                        - generic "quiet posture score" [ref=e948]
                        - generic [ref=e951]: …web
                - generic [ref=e952]:
                  - generic [ref=e953]: APPLICATION TIER
                  - generic [ref=e955]:
                    - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1a · 10.42.10.0/24 · Owner: testbed-webshop" [ref=e956]':
                      - generic [ref=e957]:
                        - generic [ref=e958]: Private · cyntro-tb-prod-app-eu-west-1a
                        - generic [ref=e959]: 10.42.10.0/24
                      - generic [ref=e960]:
                        - button "quiet posture score …loadgen" [ref=e961]:
                          - generic "quiet posture score" [ref=e962]
                          - generic [ref=e965]: …loadgen
                        - button "quiet posture score …app" [ref=e966]:
                          - generic "quiet posture score" [ref=e967]
                          - generic [ref=e970]: …app
                    - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1b · 10.42.11.0/24 · Owner: testbed-webshop" [ref=e971]':
                      - generic [ref=e972]:
                        - generic [ref=e973]: Private · cyntro-tb-prod-app-eu-west-1b
                        - generic [ref=e974]: 10.42.11.0/24
                      - button "quiet posture score …app" [ref=e976]:
                        - generic "quiet posture score" [ref=e977]
                        - generic [ref=e980]: …app
                - generic [ref=e981]:
                  - generic [ref=e982]: DATABASE TIER
                  - generic [ref=e984]:
                    - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1a · 10.42.20.0/24 · Owner: testbed-webshop" [ref=e985]':
                      - generic [ref=e986]:
                        - generic [ref=e987]: Data · cyntro-tb-prod-data-eu-west-1a
                        - generic [ref=e988]: 10.42.20.0/24
                      - button "quiet posture score …aurora-1" [ref=e990]:
                        - generic "quiet posture score" [ref=e991]
                        - generic [ref=e994]: …aurora-1
                    - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1b · 10.42.21.0/24 · Owner: testbed-webshop" [ref=e995]':
                      - generic [ref=e996]:
                        - generic [ref=e997]: Data · cyntro-tb-prod-data-eu-west-1b
                        - generic [ref=e998]: 10.42.21.0/24
                      - button "quiet posture score …aurora-0" [ref=e1000]:
                        - generic "quiet posture score" [ref=e1001]
                        - generic [ref=e1004]: …aurora-0
              - generic [ref=e1005]:
                - generic [ref=e1006]: VPC boundary
                - generic [ref=e1007]:
                  - generic [ref=e1008]: ↑ Internet
                  - generic [ref=e1009]:
                    - button "IGW igw-01b6c643a5c856abe" [ref=e1010]:
                      - img [ref=e1012]
                      - generic [ref=e1015]: IGW
                      - generic [ref=e1016]: igw-01b6c643a5c856abe
                    - generic "Workloads whose egress the map routes through this gateway — counted from the drawn edges." [ref=e1017]: "egress: 3 workloads"
                - generic [ref=e1019]:
                  - generic [ref=e1020]: Endpoints (1)
                  - generic [ref=e1021]:
                    - button "VPCE GW Amazon S3" [ref=e1022]:
                      - img [ref=e1024]
                      - generic [ref=e1028]: VPCE
                      - generic [ref=e1029]: GW
                      - generic [ref=e1030]: Amazon S3
                    - generic "Workloads the map draws reaching this endpoint — counted from the drawn edges, not from a route table." [ref=e1031]: "use: not observed"
              - generic [ref=e1033]:
                - generic [ref=e1034]:
                  - generic [ref=e1035]:
                    - generic [ref=e1036]: Lambda runtime (6)
                    - generic [ref=e1037]:
                      - text: outside subnet grid · 6 outside VPC (verified)
                      - generic "12 of 12 chips omit this shared prefix" [ref=e1038]: · cyntro-tb-prod-consumer-… ×12
                  - generic [ref=e1039]:
                    - generic [ref=e1040]: Triggers (6)
                    - generic [ref=e1041]:
                      - button "quiet posture score …daily" [ref=e1042]:
                        - generic "quiet posture score" [ref=e1043]
                        - generic [ref=e1047]: …daily
                      - button "quiet posture score …every_6h" [ref=e1048]:
                        - generic "quiet posture score" [ref=e1049]
                        - generic [ref=e1053]: …every_6h
                      - button "quiet posture score …frequent" [ref=e1054]:
                        - generic "quiet posture score" [ref=e1055]
                        - generic [ref=e1059]: …frequent
                      - button "quiet posture score …monthly" [ref=e1060]:
                        - generic "quiet posture score" [ref=e1061]
                        - generic [ref=e1065]: …monthly
                      - button "quiet posture score …nightly_burst" [ref=e1066]:
                        - generic "quiet posture score" [ref=e1067]
                        - generic [ref=e1071]: …nightly_burst
                      - button "quiet posture score …weekly" [ref=e1072]:
                        - generic "quiet posture score" [ref=e1073]
                        - generic [ref=e1077]: …weekly
                  - button "↑ 3 above" [ref=e1078]
                  - generic [ref=e1080]:
                    - button "quiet posture score …monthly" [ref=e1081]:
                      - generic "quiet posture score" [ref=e1082]
                      - generic [ref=e1086]: …monthly
                    - button "quiet posture score …weekly" [ref=e1087]:
                      - generic "quiet posture score" [ref=e1088]
                      - generic [ref=e1092]: …weekly
                    - button "quiet posture score …daily" [ref=e1093]:
                      - generic "quiet posture score" [ref=e1094]
                      - generic [ref=e1098]: …daily
                    - button "quiet posture score …every_6h" [ref=e1099]:
                      - generic "quiet posture score" [ref=e1100]
                      - generic [ref=e1104]: …every_6h
                    - button "quiet posture score …frequent" [ref=e1105]:
                      - generic "quiet posture score" [ref=e1106]
                      - generic [ref=e1110]: …frequent
                    - button "quiet posture score …nightly_burst" [ref=e1111]:
                      - generic "quiet posture score" [ref=e1112]
                      - generic [ref=e1116]: …nightly_burst
                - generic [ref=e1118]:
                  - generic [ref=e1119]:
                    - text: Regional · KMS / S3 / DDB (7)
                    - generic "3 of 7 chips omit this shared prefix" [ref=e1120]: arn:aws:kms:eu-west-1:416651950952:key/… ×3
                  - generic [ref=e1122]:
                    - button "quiet posture score cyntro-evidence-testbed-webshop-950952" [ref=e1123]:
                      - generic "quiet posture score" [ref=e1124]
                      - generic [ref=e1128]: cyntro-evidence-testbed-webshop-950952
                    - button "quiet posture score cyntro-ingest-head-testbed-webshop" [ref=e1129]:
                      - generic "quiet posture score" [ref=e1130]
                      - generic [ref=e1134]: cyntro-ingest-head-testbed-webshop
                    - button "quiet posture score cyntro-tb-prod-appdata-1c8276f5 4 fn · service-plane access" [ref=e1135]:
                      - generic "quiet posture score" [ref=e1136]
                      - generic [ref=e1139]:
                        - generic [ref=e1140]: cyntro-tb-prod-appdata-1c8276f5
                        - generic "4 fn · service-plane access" [ref=e1141]
                    - button "quiet posture score cyntro-tb-prod-logs-1c8276f5" [ref=e1142]:
                      - generic "quiet posture score" [ref=e1143]
                      - generic [ref=e1147]: cyntro-tb-prod-logs-1c8276f5
                    - button "quiet posture score …76bd5a63-602c-471e-b085-1df8b04128b2 3 other · service-plane access" [ref=e1148]:
                      - generic "quiet posture score" [ref=e1149]
                      - generic [ref=e1152]:
                        - generic [ref=e1153]: …76bd5a63-602c-471e-b085-1df8b04128b2
                        - generic "3 other · service-plane access" [ref=e1154]
                    - button "quiet posture score …d729e441-b319-4859-9974-9bd12d8e341a 1 other · service-plane access" [ref=e1155]:
                      - generic "quiet posture score" [ref=e1156]
                      - generic [ref=e1159]:
                        - generic [ref=e1160]: …d729e441-b319-4859-9974-9bd12d8e341a
                        - generic "1 other · service-plane access" [ref=e1161]
                    - button "quiet posture score …1a88e19d-2eb4-4bf7-a16d-35152bc8a453 2 other · service-plane access" [ref=e1162]:
                      - generic "quiet posture score" [ref=e1163]
                      - generic [ref=e1166]:
                        - generic [ref=e1167]: …1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                        - generic "2 other · service-plane access" [ref=e1168]
            - generic [ref=e1169]:
              - generic [ref=e1170]:
                - generic [ref=e1171]: Not placed · the graph does not say where (6)
                - generic [ref=e1172]: In this region, zone and subnet unknown. Never guessed into a cell.
              - generic [ref=e1173]:
                - generic [ref=e1174]: A group, not a placeable resource (6)
                - generic [ref=e1175]: "Target groups, auto-scaling groups and database clusters have no subnet of their own — their members carry the placement. Not a collector gap: a full sync will not move it."
                - generic [ref=e1176]:
                  - button "quiet posture score cyntro-tb-prod-aurora" [ref=e1178]:
                    - generic "quiet posture score" [ref=e1179]
                    - generic [ref=e1182]: cyntro-tb-prod-aurora
                  - button "quiet posture score cyntro-tb-prod-tg-app" [ref=e1184]:
                    - generic "quiet posture score" [ref=e1185]
                    - generic [ref=e1188]: cyntro-tb-prod-tg-app
                  - button "quiet posture score cyntro-tb-prod-tg-web" [ref=e1190]:
                    - generic "quiet posture score" [ref=e1191]
                    - generic [ref=e1194]: cyntro-tb-prod-tg-web
                  - button "quiet posture score cyntro-testbed-webshop" [ref=e1196]:
                    - generic "quiet posture score" [ref=e1197]
                    - generic [ref=e1200]: cyntro-testbed-webshop
                  - button "quiet posture score cyntro-tb-prod-asg-web" [ref=e1202]:
                    - generic "quiet posture score" [ref=e1203]
                    - generic [ref=e1206]: cyntro-tb-prod-asg-web
                  - button "quiet posture score cyntro-tb-prod-asg-app" [ref=e1208]:
                    - generic "quiet posture score" [ref=e1209]
                    - generic [ref=e1212]: cyntro-tb-prod-asg-app
        - img:
          - generic:
            - generic:
              - generic: Egress · 3 flows
          - generic:
            - generic:
              - generic: LAUNCHES
          - generic:
            - generic:
              - generic: LAUNCHES
          - generic:
            - generic:
              - generic: LAUNCHES
          - generic:
            - generic:
              - generic: LAUNCHES
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
              - generic: TRIGGERS ×6
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
  - region "Notifications (F8)":
    - list
  - alert [ref=e1213]
```

# Test source

```ts
  485 |       const reason = mounted
  486 |         ? null
  487 |         : ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
  488 |       loads.push({ attempt, mounted, reason, ms: Date.now() - t0 })
  489 |       if (!mounted && attempt < 3) await page.waitForTimeout(8_000)
  490 |     }
  491 |     report("estate-page", { mounted, loads, gate })
  492 |     if (!mounted) {
  493 |       await shot(page, "c1-estate-blocked")
  494 |       throw new Error(`estate map did not mount after ${loads.length} loads: ${loads[loads.length - 1]?.reason}`)
  495 |     }
  496 |     await page.getByRole("tab", { name: "Network topology" }).click()
  497 |     const dependencies = page
  498 |       .getByTestId("topology-flow-mode-toggle")
  499 |       .getByRole("button", { name: "Dependencies" })
  500 |       .first()
  501 |     await dependencies.click()
  502 |     await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  503 |     await page.waitForTimeout(1500)
  504 |     await shot(page, "c1-estate-embedded")
  505 | 
  506 |     const vpcOptions = await page
  507 |       .getByTestId("topology-vpc-select")
  508 |       .locator("option")
  509 |       .allTextContents()
  510 |       .catch(() => [] as string[])
  511 |     report("scope-gate", gate)
  512 |     report("embedded", {
  513 |       vpc_options: vpcOptions,
  514 |       authority_banner: await bannerText(page, "page"),
  515 |       coverage_pill: await readPill(page, "page"),
  516 |       payload_captured: Boolean(captured.payload),
  517 |       ...(await measureEmbeddedLegibility(page)),
  518 |     })
  519 | 
  520 |     // Fullscreen — Glance first (the default), then Inventory (one icon per node).
  521 |     await page.getByTestId("topology-estate-map-enlarge").click()
  522 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  523 |     await expect(fullscreen).toBeVisible()
  524 |     await page.waitForTimeout(1500)
  525 |     await shot(page, "c1-fullscreen-glance")
  526 |     const glance = await measureFullscreen(page)
  527 |     report("fullscreen-glance", { ...glance, header_overlaps: await railHeaderBadgeOverlaps(page) })
  528 | 
  529 |     await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
  530 |     await page.waitForTimeout(1500)
  531 |     await shot(page, "c1-fullscreen-inventory")
  532 |     const inventory = await measureFullscreen(page)
  533 |     const overlaps = await railHeaderBadgeOverlaps(page)
  534 |     const pill = await readPill(page, "fullscreen")
  535 |     report("fullscreen-inventory", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  536 |     await attachJson("fullscreen-inventory.json", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  537 | 
  538 |     // --- Assertions. Soft where the graph's shape decides what is present.
  539 |     const overlapping = overlaps.filter(o => {
  540 |       const depth = Math.min(o.badge.b, o.headerBox.b) - Math.max(o.badge.t, o.headerBox.t)
  541 |       return depth > 1
  542 |     })
  543 |     expect.soft(overlapping, "no flow label paints over a rail header (touches ≤ 1px are reported, not failed)").toEqual([])
  544 |     for (const lane of ["serverless", "regional"] as const) {
  545 |       const measured = inventory.lanes[lane]
  546 |       if (!measured || !inventory.rail) continue
  547 |       expect.soft(measured.header.t, `${lane} header inside the rail`).toBeGreaterThanOrEqual(inventory.rail.t - 1)
  548 |       expect.soft(measured.header.b, `${lane} header inside the rail`).toBeLessThanOrEqual(inventory.rail.b + 1)
  549 |       expect.soft(measured.header.b, `${lane} header inside the viewport`).toBeLessThanOrEqual(inventory.viewport.h)
  550 |       expect.soft(measured.overflowY, `${lane} lane body owns its scroll`).toBe("auto")
  551 |       if (measured.scrollHeight > measured.clientHeight + 4) {
  552 |         expect.soft(measured.more_pill, `${lane} fold footer counts the chips below`).toBe(`+${measured.below} more ↓`)
  553 |       } else {
  554 |         expect.soft(measured.more_pill, `${lane} has no fold footer without overflow`).toBeNull()
  555 |       }
  556 |     }
  557 |     if (inventory.alb_band && inventory.az_headers) {
  558 |       expect.soft(inventory.alb_band.b, "load balancer band above the AZ headers").toBeLessThanOrEqual(inventory.az_headers.t + 1)
  559 |     }
  560 |     if (inventory.band_row && inventory.first_tier) {
  561 |       expect.soft(
  562 |         inventory.first_tier.t,
  563 |         "the Web tier starts below the band row (load balancers · NAT fallback · AZ headers)",
  564 |       ).toBeGreaterThanOrEqual(inventory.band_row.b - 1)
  565 |     }
  566 |     expect.soft(inventory.cells_under_az_headers, "no subnet cell starts above the AZ header row's bottom edge").toBe(0)
  567 |     for (const nat of inventory.nat) {
  568 |       if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
  569 |       else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
  570 |     }
  571 |     const payload = captured.payload
  572 |     const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
  573 |     // Placement honesty, both sides of the proxy: what the payload leaves
  574 |     // without a subnet and what the map put in the unplaced area. Reported,
  575 |     // not asserted — the renderer decides per type which of the former belong
  576 |     // in the latter (a regional service has no subnet and is not unplaced).
  577 |     const placement = payload ? summarizeTopology(payload) : null
  578 |     report("unplaced", {
  579 |       ui: inventory.unplaced,
  580 |       payload_no_subnet_by_type: placement?.no_subnet_by_type ?? null,
  581 |       payload_vpc_but_no_subnet_by_type: placement?.vpc_but_no_subnet_by_type ?? null,
  582 |     })
  583 |     if (payload) {
  584 |       expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
> 585 |       expect.soft(inventory.labels_over_nat_chips, "no flow badge is painted over a NAT gateway chip").toEqual([])
      |                                                                                                        ^ Error: no flow badge is painted over a NAT gateway chip
  586 |     }
  587 | 
  588 |     // Coverage pill: exactly the payload's numbers, or absent when the payload has none.
  589 |     const coverage = payload?.traffic_authority?.lane_coverage ?? null
  590 |     if (coverage) {
  591 |       expect.soft(pill, "coverage pill rendered for a payload with lane_coverage").not.toBeNull()
  592 |       if (pill) {
  593 |         expect.soft(pill.state, "pill state").toBe(coverage.state ?? null)
  594 |         expect.soft(pill.totals, "pill totals").toBe(expectedTotalsText(coverage))
  595 |         for (const lane of COVERAGE_LANES) {
  596 |           const counts = coverage.by_lane?.[lane]
  597 |           const chip = pill.lanes.find(entry => entry.testid === `topology-lane-coverage-${lane}`)
  598 |           if (!counts || counts.state === "empty") expect.soft(chip, `${lane} chip absent for an empty lane`).toBeUndefined()
  599 |           else expect.soft(chip?.state, `${lane} chip state`).toBe(counts.state)
  600 |         }
  601 |         expect.soft(pill.warnings.map(warning => warning.code), "warnings, in the backend's order").toEqual(
  602 |           (coverage.warnings ?? []).map(warning => warning.code),
  603 |         )
  604 |       }
  605 |     } else {
  606 |       expect.soft(pill, "no coverage pill without lane_coverage in the payload").toBeNull()
  607 |     }
  608 | 
  609 |     // Scroll the Lambda lane when it overflows: the last chip must land inside
  610 |     // a lane body that is at least one chip tall, with both fold pills up.
  611 |     const serverless = inventory.lanes.serverless
  612 |     if (serverless && serverless.scrollHeight > serverless.clientHeight + 4) {
  613 |       const laneBody = fullscreen.getByTestId("topology-serverless-lane-body")
  614 |       const chips = laneBody.locator("[data-flow-id], [data-flow-ids]")
  615 |       const chipCount = await chips.count()
  616 |       const last = chips.nth(chipCount - 1)
  617 |       const pageScrollBefore = await page.evaluate(() => window.scrollY)
  618 |       // scrollIntoViewIfNeeded waits on the page viewport. The last Lambda
  619 |       // chip lives in a nested overflow lane, so that wait never finishes
  620 |       // (c1-ui-qa #32 hit the 300s test timeout after the map had mounted).
  621 |       await laneBody.evaluate(el => {
  622 |         el.scrollTop = el.scrollHeight
  623 |       })
  624 |       await page.waitForTimeout(500)
  625 |       const after = await last.boundingBox()
  626 |       const bodyAfter = await laneBody.boundingBox()
  627 |       const scrolled = {
  628 |         chip: after,
  629 |         body: bodyAfter,
  630 |         lane_scrollTop: await laneBody.evaluate(el => el.scrollTop),
  631 |         page_scrolled: (await page.evaluate(() => window.scrollY)) !== pageScrollBefore,
  632 |         above_pill: await page.evaluate(() => {
  633 |           const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
  634 |           const el = root?.querySelector('[data-testid="topology-serverless-lane-above"]')
  635 |           return (el?.textContent ?? "").replace(/\s+/g, " ").trim() || null
  636 |         }),
  637 |         more_pill: await page.evaluate(() => {
  638 |           const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
  639 |           const el = root?.querySelector('[data-testid="topology-serverless-lane-more"]')
  640 |           return (el?.textContent ?? "").replace(/\s+/g, " ").trim() || null
  641 |         }),
  642 |         header_overlaps: await railHeaderBadgeOverlaps(page),
  643 |       }
  644 |       report("fullscreen-inventory-scrolled", scrolled)
  645 |       await shot(page, "c1-fullscreen-inventory-scrolled")
  646 |       if (after && bodyAfter) {
  647 |         expect.soft(after.y, "scrolled chip inside its lane body (top)").toBeGreaterThanOrEqual(bodyAfter.y - 1)
  648 |         expect.soft(after.y + after.height, "scrolled chip inside its lane body (bottom)").toBeLessThanOrEqual(bodyAfter.y + bodyAfter.height + 1)
  649 |         expect.soft(bodyAfter.height, "lane body at least one chip tall").toBeGreaterThanOrEqual(after.height)
  650 |       }
  651 |       expect.soft(scrolled.page_scrolled, "the lane scrolled, not the page").toBe(false)
  652 |       expect.soft(scrolled.header_overlaps, "headers still clear after the scroll").toEqual([])
  653 |     }
  654 | 
  655 |     report("page-errors", pageErrors)
  656 |     expect.soft(pageErrors, "no uncaught page errors").toEqual([])
  657 |   })
  658 | })
  659 | 
  660 | /** Embedded map: labels painted over off-VPC rail chips, and unknown-glyph nodes. */
  661 | async function measureEmbeddedLegibility(page: Page): Promise<{
  662 |   labels_over_rail_chips: Array<{ label: string; chip: string | null }>
  663 |   unknown_glyph_nodes: Array<{ name: string; title: string | null }>
  664 |   rail_chips: number
  665 |   flow_badges: number
  666 | }> {
  667 |   return page.evaluate(() => {
  668 |     const fullscreen = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
  669 |     const rails = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="topology-edge-services-rail"]')).filter(
  670 |       el => !fullscreen || !fullscreen.contains(el),
  671 |     )
  672 |     const rail = rails[0] ?? null
  673 |     const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()
  674 |     const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  675 |     const chips = rail
  676 |       ? Array.from(rail.querySelectorAll<HTMLElement>("[data-flow-id], [data-flow-ids]")).filter(chip => chip.getBoundingClientRect().height > 0)
  677 |       : []
  678 |     const badges = Array.from(document.querySelectorAll<SVGGElement>('[data-testid="topology-flow-badge"]')).filter(
  679 |       badge => !fullscreen || !fullscreen.contains(badge),
  680 |     )
  681 |     const labelsOver: Array<{ label: string; chip: string | null }> = []
  682 |     for (const badge of badges) {
  683 |       const box = badge.querySelector("rect")
  684 |       if (!box) continue
  685 |       const r = box.getBoundingClientRect()
```