# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> inspector identity, refresh status, and the logical-group band across a reload
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:683:7

# Error details

```
Error: open: Escape must dismiss the service drawer -- it covers the map header controls

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
      - complementary [ref=e91]:
        - complementary [ref=e92]:
          - generic [ref=e93]:
            - generic [ref=e94]:
              - heading "Service index" [level=2] [ref=e95]
              - generic [ref=e96]: "35"
            - generic [ref=e97]:
              - img [ref=e98]
              - searchbox "Find service in topology" [ref=e101]
            - button "Filters" [ref=e104]:
              - img [ref=e105]
              - text: Filters
          - list [ref=e107]:
            - listitem [ref=e108]:
              - button "cyntro-tb-prod-appdata-1c8276f5 Current graph data S3 · global · regional 4 in · 1 out Aug 20, 04:53 PM" [ref=e109]:
                - generic [ref=e110]:
                  - img [ref=e112]
                  - generic [ref=e114]:
                    - generic [ref=e115]:
                      - generic [ref=e116]: cyntro-tb-prod-appdata-1c8276f5
                      - generic "Current graph data" [ref=e117]
                    - generic [ref=e119]: S3 · global · regional
                    - generic [ref=e120]:
                      - generic [ref=e121]: 4 in · 1 out
                      - generic [ref=e122]:
                        - img [ref=e123]
                        - text: Aug 20, 04:53 PM
            - listitem [ref=e126]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2 Current graph data KMSKey · global · regional 3 in · 0 out Sep 11, 07:35 PM" [ref=e127]:
                - generic [ref=e128]:
                  - img [ref=e130]
                  - generic [ref=e132]:
                    - generic [ref=e133]:
                      - generic [ref=e134]: arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2
                      - generic "Current graph data" [ref=e135]
                    - generic [ref=e137]: KMSKey · global · regional
                    - generic [ref=e138]:
                      - generic [ref=e139]: 3 in · 0 out
                      - generic [ref=e140]:
                        - img [ref=e141]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e144]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1b · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e145]:
                - generic [ref=e146]:
                  - img [ref=e148]
                  - generic [ref=e150]:
                    - generic [ref=e151]:
                      - generic [ref=e152]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e153]
                    - generic [ref=e155]: EC2 · eu-west-1b · app
                    - generic [ref=e156]:
                      - generic [ref=e157]: 2 in · 1 out
                      - generic [ref=e158]:
                        - img [ref=e159]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e162]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1a · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e163]:
                - generic [ref=e164]:
                  - img [ref=e166]
                  - generic [ref=e168]:
                    - generic [ref=e169]:
                      - generic [ref=e170]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e171]
                    - generic [ref=e173]: EC2 · eu-west-1a · app
                    - generic [ref=e174]:
                      - generic [ref=e175]: 2 in · 1 out
                      - generic [ref=e176]:
                        - img [ref=e177]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e180]:
              - button "cyntro-tb-prod-consumer-daily Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e181]:
                - generic [ref=e182]:
                  - img [ref=e184]
                  - generic [ref=e186]:
                    - generic [ref=e187]:
                      - generic [ref=e188]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e189]
                    - generic [ref=e191]: Lambda · eu-west-1 · regional
                    - generic [ref=e192]:
                      - generic [ref=e193]: 2 in · 1 out
                      - generic [ref=e194]:
                        - img [ref=e195]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e198]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e199]:
                - generic [ref=e200]:
                  - img [ref=e202]
                  - generic [ref=e204]:
                    - generic [ref=e205]:
                      - generic [ref=e206]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e207]
                    - generic [ref=e209]: Lambda · eu-west-1 · regional
                    - generic [ref=e210]:
                      - generic [ref=e211]: 2 in · 1 out
                      - generic [ref=e212]:
                        - img [ref=e213]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e216]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 1, 11:00 AM" [ref=e217]:
                - generic [ref=e218]:
                  - img [ref=e220]
                  - generic [ref=e222]:
                    - generic [ref=e223]:
                      - generic [ref=e224]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e225]
                    - generic [ref=e227]: Lambda · eu-west-1 · regional
                    - generic [ref=e228]:
                      - generic [ref=e229]: 2 in · 1 out
                      - generic [ref=e230]:
                        - img [ref=e231]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e234]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e235]:
                - generic [ref=e236]:
                  - img [ref=e238]
                  - generic [ref=e240]:
                    - generic [ref=e241]:
                      - generic [ref=e242]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e243]
                    - generic [ref=e245]: Lambda · eu-west-1 · regional
                    - generic [ref=e246]:
                      - generic [ref=e247]: 2 in · 1 out
                      - generic [ref=e248]:
                        - img [ref=e249]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e252]:
              - button "cyntro-tb-prod-tg-app Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e253]:
                - generic [ref=e254]:
                  - img [ref=e256]
                  - generic [ref=e258]:
                    - generic [ref=e259]:
                      - generic [ref=e260]: cyntro-tb-prod-tg-app
                      - generic "Current graph data" [ref=e261]
                    - generic [ref=e263]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e264]:
                      - generic [ref=e265]: 1 in · 2 out
                      - generic [ref=e266]:
                        - img [ref=e267]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e270]:
              - button "cyntro-tb-prod-tg-web Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e271]:
                - generic [ref=e272]:
                  - img [ref=e274]
                  - generic [ref=e276]:
                    - generic [ref=e277]:
                      - generic [ref=e278]: cyntro-tb-prod-tg-web
                      - generic "Current graph data" [ref=e279]
                    - generic [ref=e281]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e282]:
                      - generic [ref=e283]: 1 in · 2 out
                      - generic [ref=e284]:
                        - img [ref=e285]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e288]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453 Current graph data KMSKey · global · regional 2 in · 0 out Sep 11, 07:35 PM" [ref=e289]:
                - generic [ref=e290]:
                  - img [ref=e292]
                  - generic [ref=e294]:
                    - generic [ref=e295]:
                      - generic [ref=e296]: arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                      - generic "Current graph data" [ref=e297]
                    - generic [ref=e299]: KMSKey · global · regional
                    - generic [ref=e300]:
                      - generic [ref=e301]: 2 in · 0 out
                      - generic [ref=e302]:
                        - img [ref=e303]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e306]:
              - button "cyntro-tb-prod-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e307]:
                - generic [ref=e308]:
                  - img [ref=e310]
                  - generic [ref=e312]:
                    - generic [ref=e313]:
                      - generic [ref=e314]: cyntro-tb-prod-asg-app
                      - generic "Current graph data" [ref=e315]
                    - generic [ref=e317]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e318]:
                      - generic [ref=e319]: 0 in · 2 out
                      - generic [ref=e320]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e323]:
              - button "cyntro-tb-prod-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e324]:
                - generic [ref=e325]:
                  - img [ref=e327]
                  - generic [ref=e329]:
                    - generic [ref=e330]:
                      - generic [ref=e331]: cyntro-tb-prod-asg-web
                      - generic "Current graph data" [ref=e332]
                    - generic [ref=e334]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e335]:
                      - generic [ref=e336]: 0 in · 2 out
                      - generic [ref=e337]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e340]:
              - button "cyntro-tb-prod-consumer-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e341]:
                - generic [ref=e342]:
                  - img [ref=e344]
                  - generic [ref=e346]:
                    - generic [ref=e347]:
                      - generic [ref=e348]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e349]
                    - generic [ref=e351]: EventBridge · eu-west-1 · regional
                    - generic [ref=e352]:
                      - generic [ref=e353]: 0 in · 2 out
                      - generic [ref=e354]:
                        - img [ref=e355]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e358]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e359]:
                - generic [ref=e360]:
                  - img [ref=e362]
                  - generic [ref=e364]:
                    - generic [ref=e365]:
                      - generic [ref=e366]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e367]
                    - generic [ref=e369]: EventBridge · eu-west-1 · regional
                    - generic [ref=e370]:
                      - generic [ref=e371]: 0 in · 2 out
                      - generic [ref=e372]:
                        - img [ref=e373]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e376]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Sep 1, 11:00 AM" [ref=e377]:
                - generic [ref=e378]:
                  - img [ref=e380]
                  - generic [ref=e382]:
                    - generic [ref=e383]:
                      - generic [ref=e384]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e385]
                    - generic [ref=e387]: EventBridge · eu-west-1 · regional
                    - generic [ref=e388]:
                      - generic [ref=e389]: 0 in · 2 out
                      - generic [ref=e390]:
                        - img [ref=e391]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e394]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e395]:
                - generic [ref=e396]:
                  - img [ref=e398]
                  - generic [ref=e400]:
                    - generic [ref=e401]:
                      - generic [ref=e402]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e403]
                    - generic [ref=e405]: Lambda · eu-west-1 · regional
                    - generic [ref=e406]:
                      - generic [ref=e407]: 2 in · 0 out
                      - generic [ref=e408]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e411]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e412]:
                - generic [ref=e413]:
                  - img [ref=e415]
                  - generic [ref=e417]:
                    - generic [ref=e418]:
                      - generic [ref=e419]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e420]
                    - generic [ref=e422]: EventBridge · eu-west-1 · regional
                    - generic [ref=e423]:
                      - generic [ref=e424]: 0 in · 2 out
                      - generic [ref=e425]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e428]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e429]:
                - generic [ref=e430]:
                  - img [ref=e432]
                  - generic [ref=e434]:
                    - generic [ref=e435]:
                      - generic [ref=e436]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e437]
                    - generic [ref=e439]: EventBridge · eu-west-1 · regional
                    - generic [ref=e440]:
                      - generic [ref=e441]: 0 in · 2 out
                      - generic [ref=e442]:
                        - img [ref=e443]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e446]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out Aug 29, 11:00 AM" [ref=e447]:
                - generic [ref=e448]:
                  - img [ref=e450]
                  - generic [ref=e452]:
                    - generic [ref=e453]:
                      - generic [ref=e454]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e455]
                    - generic [ref=e457]: Lambda · eu-west-1 · regional
                    - generic [ref=e458]:
                      - generic [ref=e459]: 2 in · 0 out
                      - generic [ref=e460]:
                        - img [ref=e461]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e464]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 29, 11:00 AM" [ref=e465]:
                - generic [ref=e466]:
                  - img [ref=e468]
                  - generic [ref=e470]:
                    - generic [ref=e471]:
                      - generic [ref=e472]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e473]
                    - generic [ref=e475]: EventBridge · eu-west-1 · regional
                    - generic [ref=e476]:
                      - generic [ref=e477]: 0 in · 2 out
                      - generic [ref=e478]:
                        - img [ref=e479]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e482]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1a · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e483]:
                - generic [ref=e484]:
                  - img [ref=e486]
                  - generic [ref=e488]:
                    - generic [ref=e489]:
                      - generic [ref=e490]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e491]
                    - generic [ref=e493]: EC2 · eu-west-1a · web
                    - generic [ref=e494]:
                      - generic [ref=e495]: 2 in · 0 out
                      - generic [ref=e496]:
                        - img [ref=e497]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e500]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1b · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e501]:
                - generic [ref=e502]:
                  - img [ref=e504]
                  - generic [ref=e506]:
                    - generic [ref=e507]:
                      - generic [ref=e508]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e509]
                    - generic [ref=e511]: EC2 · eu-west-1b · web
                    - generic [ref=e512]:
                      - generic [ref=e513]: 2 in · 0 out
                      - generic [ref=e514]:
                        - img [ref=e515]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e518]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a Current graph data KMSKey · global · regional 1 in · 0 out No runtime timestamp" [ref=e519]:
                - generic [ref=e520]:
                  - img [ref=e522]
                  - generic [ref=e524]:
                    - generic [ref=e525]:
                      - generic [ref=e526]: arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a
                      - generic "Current graph data" [ref=e527]
                    - generic [ref=e529]: KMSKey · global · regional
                    - generic [ref=e530]:
                      - generic [ref=e531]: 1 in · 0 out
                      - generic [ref=e532]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e535]:
              - button "cyntro-evidence-testbed-webshop-950952 Current graph data S3 · global · regional 0 in · 1 out No runtime timestamp" [ref=e536]:
                - generic [ref=e537]:
                  - img [ref=e539]
                  - generic [ref=e541]:
                    - generic [ref=e542]:
                      - generic [ref=e543]: cyntro-evidence-testbed-webshop-950952
                      - generic "Current graph data" [ref=e544]
                    - generic [ref=e546]: S3 · global · regional
                    - generic [ref=e547]:
                      - generic [ref=e548]: 0 in · 1 out
                      - generic [ref=e549]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e552]:
              - button "cyntro-ingest-head-testbed-webshop Current graph data DynamoDB · eu-west-1 · regional 0 in · 1 out No runtime timestamp" [ref=e553]:
                - generic [ref=e554]:
                  - img [ref=e556]
                  - generic [ref=e558]:
                    - generic [ref=e559]:
                      - generic [ref=e560]: cyntro-ingest-head-testbed-webshop
                      - generic "Current graph data" [ref=e561]
                    - generic [ref=e563]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e564]:
                      - generic [ref=e565]: 0 in · 1 out
                      - generic [ref=e566]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e569]:
              - button "cyntro-tb-prod-alb-int Current graph data LoadBalancer · eu-west-1a · app 0 in · 1 out No runtime timestamp" [ref=e570]:
                - generic [ref=e571]:
                  - img [ref=e573]
                  - generic [ref=e575]:
                    - generic [ref=e576]:
                      - generic [ref=e577]: cyntro-tb-prod-alb-int
                      - generic "Current graph data" [ref=e578]
                    - generic [ref=e580]: LoadBalancer · eu-west-1a · app
                    - generic [ref=e581]:
                      - generic [ref=e582]: 0 in · 1 out
                      - generic [ref=e583]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e586]:
              - button "cyntro-tb-prod-alb-pub Current graph data LoadBalancer · eu-west-1a · web 0 in · 1 out No runtime timestamp" [ref=e587]:
                - generic [ref=e588]:
                  - img [ref=e590]
                  - generic [ref=e592]:
                    - generic [ref=e593]:
                      - generic [ref=e594]: cyntro-tb-prod-alb-pub
                      - generic "Current graph data" [ref=e595]
                    - generic [ref=e597]: LoadBalancer · eu-west-1a · web
                    - generic [ref=e598]:
                      - generic [ref=e599]: 0 in · 1 out
                      - generic [ref=e600]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e603]:
              - button "cyntro-tb-prod-aurora-0 Current graph data RDS · eu-west-1b · data 0 in · 1 out Sep 11, 07:35 PM" [ref=e604]:
                - generic [ref=e605]:
                  - img [ref=e607]
                  - generic [ref=e609]:
                    - generic [ref=e610]:
                      - generic [ref=e611]: cyntro-tb-prod-aurora-0
                      - generic "Current graph data" [ref=e612]
                    - generic [ref=e614]: RDS · eu-west-1b · data
                    - generic [ref=e615]:
                      - generic [ref=e616]: 0 in · 1 out
                      - generic [ref=e617]:
                        - img [ref=e618]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e621]:
              - button "cyntro-tb-prod-aurora-1 Current graph data RDS · eu-west-1a · data 0 in · 1 out Sep 11, 07:35 PM" [ref=e622]:
                - generic [ref=e623]:
                  - img [ref=e625]
                  - generic [ref=e627]:
                    - generic [ref=e628]:
                      - generic [ref=e629]: cyntro-tb-prod-aurora-1
                      - generic "Current graph data" [ref=e630]
                    - generic [ref=e632]: RDS · eu-west-1a · data
                    - generic [ref=e633]:
                      - generic [ref=e634]: 0 in · 1 out
                      - generic [ref=e635]:
                        - img [ref=e636]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e639]:
              - button "cyntro-tb-prod-loadgen Current graph data EC2 · eu-west-1a · app 0 in · 1 out Aug 18, 06:57 PM" [ref=e640]:
                - generic [ref=e641]:
                  - img [ref=e643]
                  - generic [ref=e645]:
                    - generic [ref=e646]:
                      - generic [ref=e647]: cyntro-tb-prod-loadgen
                      - generic "Current graph data" [ref=e648]
                    - generic [ref=e650]: EC2 · eu-west-1a · app
                    - generic [ref=e651]:
                      - generic [ref=e652]: 0 in · 1 out
                      - generic [ref=e653]:
                        - img [ref=e654]
                        - text: Aug 18, 06:57 PM
            - listitem [ref=e657]:
              - button "cyntro-testbed-webshop-writer Current graph data Neptune · eu-west-1a · web 0 in · 1 out Sep 11, 07:35 PM" [ref=e658]:
                - generic [ref=e659]:
                  - img [ref=e661]
                  - generic [ref=e663]:
                    - generic [ref=e664]:
                      - generic [ref=e665]: cyntro-testbed-webshop-writer
                      - generic "Current graph data" [ref=e666]
                    - generic [ref=e668]: Neptune · eu-west-1a · web
                    - generic [ref=e669]:
                      - generic [ref=e670]: 0 in · 1 out
                      - generic [ref=e671]:
                        - img [ref=e672]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e675]:
              - button "cyntro-tb-prod-aurora Current graph data RDS · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e676]:
                - generic [ref=e677]:
                  - img [ref=e679]
                  - generic [ref=e682]:
                    - generic [ref=e683]:
                      - generic [ref=e684]: cyntro-tb-prod-aurora
                      - generic "Current graph data" [ref=e685]
                    - generic [ref=e687]: RDS · eu-west-1 · regional
                    - generic [ref=e688]:
                      - generic [ref=e689]: 0 in · 0 out
                      - generic [ref=e690]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e693]:
              - button "cyntro-tb-prod-logs-1c8276f5 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp" [ref=e694]:
                - generic [ref=e695]:
                  - img [ref=e697]
                  - generic [ref=e700]:
                    - generic [ref=e701]:
                      - generic [ref=e702]: cyntro-tb-prod-logs-1c8276f5
                      - generic "Current graph data" [ref=e703]
                    - generic [ref=e705]: S3 · global · regional
                    - generic [ref=e706]:
                      - generic [ref=e707]: 0 in · 0 out
                      - generic [ref=e708]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e711]:
              - button "cyntro-testbed-webshop Current graph data Neptune · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e712]:
                - generic [ref=e713]:
                  - img [ref=e715]
                  - generic [ref=e718]:
                    - generic [ref=e719]:
                      - generic [ref=e720]: cyntro-testbed-webshop
                      - generic "Current graph data" [ref=e721]
                    - generic [ref=e723]: Neptune · eu-west-1 · regional
                    - generic [ref=e724]:
                      - generic [ref=e725]: 0 in · 0 out
                      - generic [ref=e726]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e729]:
      - text: Live read from
      - generic [ref=e730]: /api/topology-risk/testbed-webshop
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
    - dialog "Topology map full screen" [ref=e731]:
      - generic [ref=e732]:
        - generic [ref=e733]:
          - generic [ref=e734]: Cloud topology
          - generic [ref=e735]: testbed-webshop
        - button "Scope" [ref=e736]:
          - img [ref=e737]
          - text: Scope
        - group "Map density" [ref=e738]:
          - button "Glance" [ref=e739]
          - button "Inventory" [ref=e740]
        - generic [ref=e741]:
          - button "100%" [ref=e742]:
            - img [ref=e743]
            - text: 100%
          - button "Zoom out" [ref=e748]:
            - img [ref=e749]
          - generic "Zoom relative to fit — 100% = map fills page width" [ref=e752]: 100%
          - button "Zoom in" [ref=e753]:
            - img [ref=e754]
        - button "Exit map fullscreen" [ref=e757]:
          - img [ref=e758]
          - text: Exit
      - generic [ref=e766]:
        - generic [ref=e767]:
          - generic [ref=e768]:
            - generic [ref=e769]: Platform map
            - generic [ref=e770]: 1 VPC · 2 AZ · 6 subnets · 35 resources
          - generic [ref=e771]:
            - generic [ref=e772]: Map lens
            - generic [ref=e773]:
              - button "Architecture" [ref=e774]:
                - img [ref=e775]
                - text: Architecture
              - button "Dependencies" [pressed] [ref=e785]:
                - img [ref=e786]
                - text: Dependencies
              - button "Attack paths" [ref=e790]:
                - img [ref=e791]
                - text: Attack paths
        - generic "Dependency line colors" [ref=e793]:
          - generic [ref=e794]: Flow colors
          - generic [ref=e795]:
            - img [ref=e796]
            - generic [ref=e798]: Service call
          - generic [ref=e799]:
            - img [ref=e800]
            - generic [ref=e802]: AWS data service
          - generic [ref=e803]:
            - img [ref=e804]
            - generic [ref=e806]: VPC endpoint
          - generic [ref=e807]:
            - img [ref=e808]
            - generic [ref=e810]: Internet egress
          - generic [ref=e811]:
            - img [ref=e812]
            - generic [ref=e814]: Database
          - generic [ref=e815]:
            - img [ref=e816]
            - generic [ref=e818]: Exposure / attack
          - generic [ref=e819]: Moving = authoritative observed
          - generic [ref=e823]:
            - img [ref=e824]
            - text: Outlined motion = historical direction
          - generic [ref=e827]:
            - img [ref=e828]
            - text: Solid = configured
          - generic [ref=e829]:
            - img [ref=e830]
            - text: Dashed = inferred / unverified
        - generic [ref=e831]:
          - generic [ref=e832]: Traffic evidence not yet authoritative
          - generic [ref=e833]: Outlined packets show historical source-to-target direction; they do not claim live traffic.
        - generic [ref=e834]:
          - generic [ref=e835]:
            - generic [ref=e836]: Flow-log coverage
            - generic [ref=e837]: Not measured
            - generic [ref=e838]: 16 eligible endpoints, coverage not measured · 19 not applicable
            - generic [ref=e839]:
              - 'generic "In-VPC: eligible 11, covered not measured (projection inactive), unknown 0, not applicable 0" [ref=e840]': In-VPC 11 not measured
              - 'generic "Database: eligible 5, covered not measured (projection inactive), unknown 0, not applicable 0" [ref=e841]': Database 5 not measured
              - 'generic "Lambda: eligible 0, covered 0, unknown 0, not applicable 6" [ref=e842]': Lambda 6 n/a
              - 'generic "Regional: eligible 0, covered 0, unknown 0, not applicable 13" [ref=e843]': Regional 13 n/a
          - list [ref=e844]:
            - 'listitem "Lambda → database: not collected. 6 function(s) run outside the VPC, so no flow log or CloudTrail data event observes their connections to the 5 database(s) in scope." [ref=e845]':
              - generic [ref=e846]: "Lambda:"
              - text: "Lambda → database: not collected. 6 function(s) run outside the VPC, so no flow log or CloudTrail data event observes their connections to the 5 database(s) in scope."
            - listitem "13 regional service(s) have no VPC network interface; VPC flow logs cannot observe them. Access to them is evidenced by CloudTrail data events, a separate lane." [ref=e847]:
              - generic [ref=e848]: "Regional:"
              - text: 13 regional service(s) have no VPC network interface; VPC flow logs cannot observe them. Access to them is evidenced by CloudTrail data events, a separate lane.
            - 'listitem "The canonical flow-log projection is not active for this scope (mode legacy), so coverage of the 16 eligible endpoint(s) is not measured. This is not a finding of zero coverage: no endpoint was examined." [ref=e849]':
              - generic [ref=e850]: "In-VPC:"
              - text: "The canonical flow-log projection is not active for this scope (mode legacy), so coverage of the 16 eligible endpoint(s) is not measured. This is not a finding of zero coverage: no endpoint was examined."
        - generic [ref=e851]:
          - generic [ref=e852]:
            - img [ref=e854]
            - generic [ref=e859]:
              - generic [ref=e860]: Users
              - generic [ref=e861]: Clients & operators
          - generic [ref=e863]:
            - img [ref=e865]
            - generic [ref=e870]:
              - generic [ref=e871]: Internet
              - generic [ref=e872]: Public path via IGW · igw-01b6c643a5c856abe
        - generic [ref=e873]:
          - generic [ref=e874]: ☁ AWS Cloud · acct 416651950952
          - generic [ref=e875]:
            - generic [ref=e876]: Region · eu-west-1
            - generic [ref=e877]:
              - generic [ref=e879]:
                - generic [ref=e880]:
                  - generic "vpc-0c39cde96f29f8f4e" [ref=e881]: VPC · vpc-0c39cde96f29f8f4e
                  - generic "7 of 8 workloads in this VPC drop the shared prefix \"cyntro-tb-prod-\" from their chip label — every tooltip still carries the full name" [ref=e882]: cyntro-tb-prod-… ×7
                - generic [ref=e883]:
                  - generic [ref=e884]:
                    - generic [ref=e885]:
                      - img [ref=e886]
                      - generic [ref=e892]: Load Balancers (2)
                    - generic [ref=e893]:
                      - button "cyntro-tb-prod-alb-int Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e894]:
                        - generic [ref=e896]:
                          - generic [ref=e897]:
                            - generic [ref=e898]: cyntro-tb-prod-alb-int
                            - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e899]: Multi-AZ
                          - generic [ref=e900]: LoadBalancer · arn:aws:elasticloadbalan
                        - generic [ref=e901]: "0"
                      - button "cyntro-tb-prod-alb-pub Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e902]:
                        - generic [ref=e904]:
                          - generic [ref=e905]:
                            - generic [ref=e906]: cyntro-tb-prod-alb-pub
                            - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e907]: Multi-AZ
                          - generic [ref=e908]: LoadBalancer · arn:aws:elasticloadbalan
                        - generic [ref=e909]: "0"
                  - generic [ref=e914]:
                    - generic "eu-west-1a" [ref=e915]
                    - generic "eu-west-1b" [ref=e916]
                - generic [ref=e917]:
                  - generic [ref=e918]: WEB TIER
                  - generic [ref=e920]:
                    - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1a · 10.42.0.0/24 · Owner: testbed-webshop" [ref=e921]':
                      - generic [ref=e922]:
                        - generic [ref=e923]: Public · cyntro-tb-prod-public-eu-west-1a
                        - generic [ref=e924]: 10.42.0.0/24
                      - generic "NAT gateway · nat-0fd7cf8524e62aea9 · public 54.229.208.150 · subnet subnet-05472c7cd0d3a7b90 (from vpc_topology.edges)" [ref=e926]:
                        - img [ref=e928]
                        - generic [ref=e931]: NAT GW · nat-0fd7cf8524e62aea9
                      - generic [ref=e932]:
                        - button "quiet posture score …web" [ref=e933]:
                          - generic "quiet posture score" [ref=e934]
                          - generic [ref=e937]: …web
                        - button "quiet posture score cyntro-testbed-webshop-writer" [ref=e938]:
                          - generic "quiet posture score" [ref=e939]
                          - generic [ref=e942]: cyntro-testbed-webshop-writer
                    - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1b · 10.42.1.0/24 · Owner: testbed-webshop" [ref=e943]':
                      - generic [ref=e944]:
                        - generic [ref=e945]: Public · cyntro-tb-prod-public-eu-west-1b
                        - generic [ref=e946]: 10.42.1.0/24
                      - button "quiet posture score …web" [ref=e948]:
                        - generic "quiet posture score" [ref=e949]
                        - generic [ref=e952]: …web
                - generic [ref=e953]:
                  - generic [ref=e954]: APPLICATION TIER
                  - generic [ref=e956]:
                    - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1a · 10.42.10.0/24 · Owner: testbed-webshop" [ref=e957]':
                      - generic [ref=e958]:
                        - generic [ref=e959]: Private · cyntro-tb-prod-app-eu-west-1a
                        - generic [ref=e960]: 10.42.10.0/24
                      - button "quiet posture score ×2 EC2" [ref=e962]:
                        - generic "quiet posture score" [ref=e963]
                        - generic [ref=e968]: ×2
                        - generic [ref=e969]: EC2
                    - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1b · 10.42.11.0/24 · Owner: testbed-webshop" [ref=e970]':
                      - generic [ref=e971]:
                        - generic [ref=e972]: Private · cyntro-tb-prod-app-eu-west-1b
                        - generic [ref=e973]: 10.42.11.0/24
                      - button "quiet posture score …app" [ref=e975]:
                        - generic "quiet posture score" [ref=e976]
                        - generic [ref=e979]: …app
                - generic [ref=e980]:
                  - generic [ref=e981]: DATABASE TIER
                  - generic [ref=e983]:
                    - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1a · 10.42.20.0/24 · Owner: testbed-webshop" [ref=e984]':
                      - generic [ref=e985]:
                        - generic [ref=e986]: Data · cyntro-tb-prod-data-eu-west-1a
                        - generic [ref=e987]: 10.42.20.0/24
                      - button "quiet posture score …aurora-1" [ref=e989]:
                        - generic "quiet posture score" [ref=e990]
                        - generic [ref=e993]: …aurora-1
                    - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1b · 10.42.21.0/24 · Owner: testbed-webshop" [ref=e994]':
                      - generic [ref=e995]:
                        - generic [ref=e996]: Data · cyntro-tb-prod-data-eu-west-1b
                        - generic [ref=e997]: 10.42.21.0/24
                      - button "quiet posture score …aurora-0" [ref=e999]:
                        - generic "quiet posture score" [ref=e1000]
                        - generic [ref=e1003]: …aurora-0
              - generic [ref=e1004]:
                - generic [ref=e1005]: VPC boundary
                - generic [ref=e1006]:
                  - generic [ref=e1007]: ↑ Internet
                  - generic [ref=e1008]:
                    - button "IGW igw-01b6c643a5c856abe" [ref=e1009]:
                      - img [ref=e1011]
                      - generic [ref=e1014]: IGW
                      - generic [ref=e1015]: igw-01b6c643a5c856abe
                    - generic "Workloads whose egress the map routes through this gateway — counted from the drawn edges." [ref=e1016]: "egress: not observed"
                - generic [ref=e1018]:
                  - generic [ref=e1019]: Endpoints (1)
                  - generic [ref=e1020]:
                    - button "VPCE GW Amazon S3" [ref=e1021]:
                      - img [ref=e1023]
                      - generic [ref=e1027]: VPCE
                      - generic [ref=e1028]: GW
                      - generic [ref=e1029]: Amazon S3
                    - generic "Workloads the map draws reaching this endpoint — counted from the drawn edges, not from a route table." [ref=e1030]: "use: not observed"
              - generic [ref=e1032]:
                - generic [ref=e1033]:
                  - generic [ref=e1034]:
                    - generic [ref=e1035]: Lambda runtime (6)
                    - generic [ref=e1036]:
                      - text: outside subnet grid · 6 outside VPC (verified)
                      - generic "12 of 12 chips omit this shared prefix" [ref=e1037]: · cyntro-tb-prod-consumer-… ×12
                  - generic [ref=e1038]:
                    - generic [ref=e1039]: Triggers (6)
                    - generic [ref=e1040]:
                      - button "quiet posture score …daily" [active] [ref=e1041]:
                        - generic "quiet posture score" [ref=e1042]
                        - generic [ref=e1046]: …daily
                      - button "quiet posture score …every_6h" [ref=e1047]:
                        - generic "quiet posture score" [ref=e1048]
                        - generic [ref=e1052]: …every_6h
                      - button "quiet posture score …frequent" [ref=e1053]:
                        - generic "quiet posture score" [ref=e1054]
                        - generic [ref=e1058]: …frequent
                      - button "quiet posture score …monthly" [ref=e1059]:
                        - generic "quiet posture score" [ref=e1060]
                        - generic [ref=e1064]: …monthly
                      - button "quiet posture score …nightly_burst" [ref=e1065]:
                        - generic "quiet posture score" [ref=e1066]
                        - generic [ref=e1070]: …nightly_burst
                      - button "quiet posture score …weekly" [ref=e1071]:
                        - generic "quiet posture score" [ref=e1072]
                        - generic [ref=e1076]: …weekly
                  - generic [ref=e1078]:
                    - button "quiet posture score …monthly" [ref=e1079]:
                      - generic "quiet posture score" [ref=e1080]
                      - generic [ref=e1084]: …monthly
                    - button "quiet posture score …weekly" [ref=e1085]:
                      - generic "quiet posture score" [ref=e1086]
                      - generic [ref=e1090]: …weekly
                    - button "quiet posture score …daily" [ref=e1091]:
                      - generic "quiet posture score" [ref=e1092]
                      - generic [ref=e1096]: …daily
                    - button "quiet posture score …every_6h" [ref=e1097]:
                      - generic "quiet posture score" [ref=e1098]
                      - generic [ref=e1102]: …every_6h
                    - button "quiet posture score …frequent" [ref=e1103]:
                      - generic "quiet posture score" [ref=e1104]
                      - generic [ref=e1108]: …frequent
                    - button "quiet posture score …nightly_burst" [ref=e1109]:
                      - generic "quiet posture score" [ref=e1110]
                      - generic [ref=e1114]: …nightly_burst
                  - button "+3 more ↓" [ref=e1115]
                - generic [ref=e1117]:
                  - generic [ref=e1118]:
                    - text: Regional · KMS / S3 / DDB (7)
                    - generic "3 of 7 chips omit this shared prefix" [ref=e1119]: arn:aws:kms:eu-west-1:416651950952:key/… ×3
                  - generic [ref=e1121]:
                    - button "quiet posture score cyntro-evidence-testbed-webshop-950952" [ref=e1122]:
                      - generic "quiet posture score" [ref=e1123]
                      - generic [ref=e1127]: cyntro-evidence-testbed-webshop-950952
                    - button "quiet posture score cyntro-ingest-head-testbed-webshop" [ref=e1128]:
                      - generic "quiet posture score" [ref=e1129]
                      - generic [ref=e1133]: cyntro-ingest-head-testbed-webshop
                    - button "quiet posture score cyntro-tb-prod-appdata-1c8276f5 4 fn · service-plane access" [ref=e1134]:
                      - generic "quiet posture score" [ref=e1135]
                      - generic [ref=e1138]:
                        - generic [ref=e1139]: cyntro-tb-prod-appdata-1c8276f5
                        - generic "4 fn · service-plane access" [ref=e1140]
                    - button "quiet posture score …76bd5a63-602c-471e-b085-1df8b04128b2" [ref=e1141]:
                      - generic "quiet posture score" [ref=e1142]
                      - generic [ref=e1146]: …76bd5a63-602c-471e-b085-1df8b04128b2
                    - button "quiet posture score …d729e441-b319-4859-9974-9bd12d8e341a 1 other · service-plane access" [ref=e1147]:
                      - generic "quiet posture score" [ref=e1148]
                      - generic [ref=e1151]:
                        - generic [ref=e1152]: …d729e441-b319-4859-9974-9bd12d8e341a
                        - generic "1 other · service-plane access" [ref=e1153]
                    - button "quiet posture score …1a88e19d-2eb4-4bf7-a16d-35152bc8a453" [ref=e1154]:
                      - generic "quiet posture score" [ref=e1155]
                      - generic [ref=e1159]: …1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                    - button "quiet posture score cyntro-tb-prod-logs-1c8276f5" [ref=e1160]:
                      - generic "quiet posture score" [ref=e1161]
                      - generic [ref=e1165]: cyntro-tb-prod-logs-1c8276f5
            - generic [ref=e1166]:
              - generic [ref=e1167]:
                - generic [ref=e1168]: Logical groups · members carry the placement (6)
                - generic [ref=e1169]: "Target groups, auto-scaling groups and database clusters have no subnet of their own — their members carry the placement. Not a collector gap: a full sync will not move it."
              - generic [ref=e1170]:
                - generic [ref=e1171]:
                  - button "quiet posture score cyntro-tb-prod-aurora" [ref=e1172]:
                    - generic "quiet posture score" [ref=e1173]
                    - generic [ref=e1176]: cyntro-tb-prod-aurora
                  - generic [ref=e1177]: VPC not reported
                  - generic [ref=e1178]: members not linked in this payload
                - generic [ref=e1179]:
                  - button "quiet posture score cyntro-tb-prod-tg-app" [ref=e1180]:
                    - generic "quiet posture score" [ref=e1181]
                    - generic [ref=e1184]: cyntro-tb-prod-tg-app
                  - generic [ref=e1185]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                  - generic [ref=e1186]:
                    - button "cyntro-tb-prod-app" [ref=e1187]
                    - button "cyntro-tb-prod-app" [ref=e1188]
                - generic [ref=e1189]:
                  - button "quiet posture score cyntro-tb-prod-tg-web" [ref=e1190]:
                    - generic "quiet posture score" [ref=e1191]
                    - generic [ref=e1194]: cyntro-tb-prod-tg-web
                  - generic [ref=e1195]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                  - generic [ref=e1196]:
                    - button "cyntro-tb-prod-web" [ref=e1197]
                    - button "cyntro-tb-prod-web" [ref=e1198]
                - generic [ref=e1199]:
                  - button "quiet posture score cyntro-testbed-webshop" [ref=e1200]:
                    - generic "quiet posture score" [ref=e1201]
                    - generic [ref=e1204]: cyntro-testbed-webshop
                  - generic [ref=e1205]: VPC not reported
                  - generic [ref=e1206]: members not linked in this payload
                - generic [ref=e1207]:
                  - button "quiet posture score cyntro-tb-prod-asg-web" [ref=e1208]:
                    - generic "quiet posture score" [ref=e1209]
                    - generic [ref=e1212]: cyntro-tb-prod-asg-web
                  - generic [ref=e1213]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                  - generic [ref=e1214]:
                    - button "cyntro-tb-prod-web" [ref=e1215]
                    - button "cyntro-tb-prod-web" [ref=e1216]
                - generic [ref=e1217]:
                  - button "quiet posture score cyntro-tb-prod-asg-app" [ref=e1218]:
                    - generic "quiet posture score" [ref=e1219]
                    - generic [ref=e1222]: cyntro-tb-prod-asg-app
                  - generic [ref=e1223]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                  - generic [ref=e1224]:
                    - button "cyntro-tb-prod-app" [ref=e1225]
                    - button "cyntro-tb-prod-app" [ref=e1226]
        - img:
          - generic:
            - generic:
              - generic: TARGETS
          - generic:
            - generic:
              - generic: TRIGGERS
          - generic:
            - generic:
              - generic: TARGETS ×3
          - generic:
            - generic:
              - generic: TRIGGERS ×3
          - generic:
            - generic:
              - generic: KMS
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
      - dialog "Operations for cyntro-tb-prod-consumer-daily" [ref=e1227]:
        - banner [ref=e1228]:
          - generic [ref=e1229]:
            - img "Resource" [ref=e1230]:
              - img [ref=e1231]
            - generic [ref=e1234]:
              - generic [ref=e1235]: Estate operations · EventBridge
              - generic [ref=e1236]: Cloud service · scoped operational context
              - heading "cyntro-tb-prod-consumer-daily" [level=2] [ref=e1237]
              - generic [ref=e1239]: arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-daily
            - button "Enlarge service details" [ref=e1240]:
              - img [ref=e1241]
            - button "Close service details" [ref=e1246]:
              - img [ref=e1247]
          - tablist "Resource operations" [ref=e1250]:
            - tab "Resource" [selected] [ref=e1251]:
              - img [ref=e1252]
              - text: Resource
            - tab "Dependencies" [ref=e1264]:
              - img [ref=e1265]
              - text: Dependencies
            - tab "Change impact" [ref=e1269]:
              - img [ref=e1270]
              - text: Change impact
        - generic [ref=e1272]:
          - generic [ref=e1273]:
            - generic [ref=e1274]:
              - generic [ref=e1275]:
                - heading "Service inspector" [level=3] [ref=e1276]
                - paragraph [ref=e1277]: Neptune graph · incident dependency segments and deterministic service routing
              - generic [ref=e1278]: Unverified traffic context
            - generic [ref=e1279]:
              - generic [ref=e1280]:
                - generic [ref=e1281]: Legacy unverified
                - generic [ref=e1282]:
                  - generic [ref=e1283]:
                    - generic [ref=e1284]:
                      - generic "cyntro-tb-prod-consumer-daily" [ref=e1285]
                      - generic [ref=e1286]: EventBridge
                    - generic [ref=e1287]:
                      - img "TARGETS" [ref=e1288]
                      - generic "TARGETS" [ref=e1291]
                  - generic [ref=e1292]:
                    - generic [ref=e1293]:
                      - generic "cyntro-tb-prod-consumer-daily" [ref=e1294]
                      - generic [ref=e1295]: Lambda
                    - generic [ref=e1296]:
                      - img "S3 access" [ref=e1297]
                      - generic "S3 access · ACTUAL_S3_ACCESS" [ref=e1299]: S3 access
                  - generic [ref=e1300]:
                    - generic [ref=e1301]:
                      - generic "cyntro-tb-prod-appdata-1c8276f5" [ref=e1302]
                      - generic [ref=e1303]: S3
                    - generic [ref=e1304]:
                      - img "KMS" [ref=e1305]
                      - generic "KMS · ENCRYPTED_BY" [ref=e1307]: KMS
                  - generic [ref=e1309]:
                    - generic "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a" [ref=e1310]
                    - generic [ref=e1311]: KMSKey
              - generic [ref=e1312]:
                - generic [ref=e1313]: Legacy unverified
                - generic [ref=e1314]:
                  - generic [ref=e1315]:
                    - generic [ref=e1316]:
                      - generic "cyntro-tb-prod-consumer-daily" [ref=e1317]
                      - generic [ref=e1318]: EventBridge
                    - generic [ref=e1319]:
                      - img "TRIGGERS" [ref=e1320]
                      - generic "TRIGGERS" [ref=e1323]
                  - generic [ref=e1324]:
                    - generic [ref=e1325]:
                      - generic "cyntro-tb-prod-consumer-daily" [ref=e1326]
                      - generic [ref=e1327]: Lambda
                    - generic [ref=e1328]:
                      - img "S3 access" [ref=e1329]
                      - generic "S3 access · ACTUAL_S3_ACCESS" [ref=e1331]: S3 access
                  - generic [ref=e1332]:
                    - generic [ref=e1333]:
                      - generic "cyntro-tb-prod-appdata-1c8276f5" [ref=e1334]
                      - generic [ref=e1335]: S3
                    - generic [ref=e1336]:
                      - img "KMS" [ref=e1337]
                      - generic "KMS · ENCRYPTED_BY" [ref=e1339]: KMS
                  - generic [ref=e1341]:
                    - generic "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a" [ref=e1342]
                    - generic [ref=e1343]: KMSKey
          - generic [ref=e1344]:
            - generic [ref=e1345]:
              - generic [ref=e1346]:
                - img [ref=e1347]
                - text: Live configuration from Inventory
              - paragraph [ref=e1350]: Same resource inspector and evidence used by All Services. The map adds dependency and change scope around it.
            - generic [ref=e1351]:
              - generic [ref=e1353]:
                - img [ref=e1355]
                - text: Operator summary
              - paragraph [ref=e1357]: Narrative summary is unavailable. Verified configuration and evidence remain available below.
            - generic [ref=e1358]:
              - generic [ref=e1359]: Data readiness is not scored for this resource type yet.
              - generic [ref=e1360]:
                - generic [ref=e1361]:
                  - heading "Key insights" [level=3] [ref=e1362]
                  - list [ref=e1363]:
                    - listitem [ref=e1364]:
                      - generic [ref=e1365]: No observed usage in window
                      - paragraph [ref=e1366]: Rule targets and invocation direction are shown in the Dependencies tab.
                - generic [ref=e1367]:
                  - heading "EventBridge rule" [level=3] [ref=e1368]
                  - generic [ref=e1369]:
                    - generic [ref=e1370]:
                      - term [ref=e1371]: title
                      - definition [ref=e1372]: EventBridge rule
                    - generic [ref=e1373]:
                      - term [ref=e1374]: source
                      - definition [ref=e1375]: Neo4j (collector:eventbridge_rules)
                  - paragraph [ref=e1376]: "Source: Neo4j (collector:eventbridge_rules)"
                - generic [ref=e1377]:
                  - heading "Configured targets" [level=3] [ref=e1378]
                  - paragraph [ref=e1379]: Rule targets and invocation direction are shown in the Dependencies tab.
                  - paragraph [ref=e1380]: "Source: EventBridge TARGETS relationships"
  - region "Notifications (F8)":
    - list
  - alert [ref=e1381]
```

# Test source

```ts
  846  |       const payloadIgws = ((captured.payload?.vpc_topology?.edges?.igws ?? []) as Array<{ id?: string }>)
  847  |         .map(igw => igw?.id)
  848  |         .filter((id): id is string => typeof id === "string" && id.length > 0)
  849  |       const visible = await chip.isVisible().catch(() => false)
  850  |       if (!visible) {
  851  |         report(`${label}-igw-inspector`, { chip: false, payload_igws: payloadIgws })
  852  |         // A payload that carries an IGW must render one to select.
  853  |         expect(payloadIgws, `${label}: payload names IGWs but no chip is on the canvas`).toEqual([])
  854  |         return null
  855  |       }
  856  |       await chip.click()
  857  |       const panel = page.getByTestId("topology-service-detail-panel")
  858  |       await expect(panel).toBeVisible({ timeout: 30_000 })
  859  |       await page.waitForTimeout(1200)
  860  |       const shown = ((await panel
  861  |         .getByTestId("estate-operations-resource-id")
  862  |         .first()
  863  |         .textContent()
  864  |         .catch(() => null)) ?? "")
  865  |         .replace(/\s+/g, " ")
  866  |         .trim()
  867  |       const unresolved = await panel
  868  |         .getByTestId("estate-anchor-identity-unresolved")
  869  |         .first()
  870  |         .isVisible()
  871  |         .catch(() => false)
  872  |       const notFound = await panel
  873  |         .getByText(/not found in graph/i)
  874  |         .first()
  875  |         .isVisible()
  876  |         .catch(() => false)
  877  |       const reading = { chip: true, shown_resource_id: shown || null, unresolved, not_found: notFound, payload_igws: payloadIgws }
  878  |       report(`${label}-igw-inspector`, reading)
  879  |       await shot(page, `c1-${label}-igw-inspector`)
  880  | 
  881  |       // The canvas anchor must never reach the inspector as a resource id.
  882  |       expect(shown, `${label}: the inspector must not ask about the __igw__ canvas anchor`).not.toContain("__igw__")
  883  |       expect(notFound, `${label}: the IGW inspector must not report the gateway as missing from the graph`).toBe(false)
  884  |       if (payloadIgws.length > 0 && !unresolved) {
  885  |         // Whatever it shows must be a gateway the payload actually names.
  886  |         expect(
  887  |           payloadIgws.some(id => shown.includes(id)),
  888  |           `${label}: inspector shows ${shown || "<nothing>"}, payload names ${payloadIgws.join(", ")}`,
  889  |         ).toBe(true)
  890  |       }
  891  |       return reading
  892  |     }
  893  | 
  894  |     /** Escape dismisses the drawer; then a different chip proves the panel
  895  |      *  follows the selection rather than keeping the previous resource.
  896  |      *
  897  |      *  Escape is pressed FIRST and asserted, because the drawer is a fixed
  898  |      *  720px surface over the map header: one that will not dismiss blocks
  899  |      *  every control behind it. Run 34747728564 measured `closed_on_escape:
  900  |      *  false` and then burned its entire 300s budget retrying a click the
  901  |      *  drawer was intercepting -- so the close button is used as a fallback
  902  |      *  here. A probe must fail with a reading, never with a timeout. */
  903  |     async function reselect(label: string, previous: string | null) {
  904  |       const panel = page.getByTestId("topology-service-detail-panel")
  905  |       const was_open = await panel.isVisible().catch(() => false)
  906  |       await page.keyboard.press("Escape")
  907  |       await page.waitForTimeout(600)
  908  |       const closed = !(await panel.isVisible().catch(() => false))
  909  |       if (!closed) {
  910  |         await panel
  911  |           .getByRole("button", { name: "Close service details" })
  912  |           .click({ timeout: 10_000 })
  913  |           .catch(() => {})
  914  |         await page.waitForTimeout(600)
  915  |       }
  916  |       const fullscreen = await enterFullscreen()
  917  |       const other = fullscreen.getByTestId("topology-service-node-icon").first()
  918  |       const haveOther = await other.isVisible().catch(() => false)
  919  |       let shown: string | null = null
  920  |       if (haveOther) {
  921  |         await other.click()
  922  |         await expect(panel).toBeVisible({ timeout: 30_000 })
  923  |         await page.waitForTimeout(1200)
  924  |         shown = ((await panel
  925  |           .getByTestId("estate-operations-resource-id")
  926  |           .first()
  927  |           .textContent()
  928  |           .catch(() => null)) ?? "")
  929  |           .replace(/\s+/g, " ")
  930  |           .trim() || null
  931  |       }
  932  |       const reading = {
  933  |         drawer_was_open: was_open,
  934  |         closed_on_escape: closed,
  935  |         reselected: haveOther,
  936  |         previous,
  937  |         shown_resource_id: shown,
  938  |       }
  939  |       report(`${label}-drawer-reselect`, reading)
  940  |       expect(shown ?? "", `${label}: a reselected node must not show the __igw__ anchor`).not.toContain("__igw__")
  941  |       // Only meaningful when a drawer was actually open to dismiss.
  942  |       if (was_open) {
  943  |         expect(
  944  |           closed,
  945  |           `${label}: Escape must dismiss the service drawer -- it covers the map header controls`,
> 946  |         ).toBe(true)
       |           ^ Error: open: Escape must dismiss the service drawer -- it covers the map header controls
  947  |       }
  948  |       return reading
  949  |     }
  950  | 
  951  |     /** Logical groups carry their own band and are never counted as gaps. */
  952  |     async function readGroups(label: string) {
  953  |       const fullscreen = await enterFullscreen()
  954  |       const reading = await fullscreen.evaluate(root => {
  955  |         const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()
  956  |         const band = root.querySelector('[data-testid="topology-logical-group-band"]')
  957  |         const area = root.querySelector('[data-testid="topology-unplaced-area"]')
  958  |         const groups = band
  959  |           ? Array.from(band.querySelectorAll<HTMLElement>('[data-testid="topology-logical-group"]'))
  960  |           : []
  961  |         return {
  962  |           band_header: text(band?.querySelector('[data-testid="topology-logical-group-band-header"]')) || null,
  963  |           groups: groups.map(group => ({
  964  |             node_id: group.getAttribute("data-node-id"),
  965  |             scope: text(group.querySelector('[data-testid="topology-logical-group-scope"]')) || null,
  966  |             members: group.querySelectorAll('[data-testid="topology-logical-group-member"]').length,
  967  |             unlinked: Boolean(group.querySelector('[data-testid="topology-logical-group-members-unlinked"]')),
  968  |           })),
  969  |           unplaced_header: text(area?.querySelector("span")) || null,
  970  |           unplaced_chips: area
  971  |             ? area.querySelectorAll('[data-testid="topology-service-node-icon"]').length
  972  |             : 0,
  973  |           // A group drawn INSIDE the amber gap area is the misclassification
  974  |           // this band exists to remove.
  975  |           groups_inside_unplaced: area
  976  |             ? area.querySelectorAll('[data-testid="topology-logical-group"]').length
  977  |             : 0,
  978  |         }
  979  |       })
  980  |       report(`${label}-logical-groups`, reading)
  981  |       expect(
  982  |         reading.groups_inside_unplaced,
  983  |         `${label}: a logical group must never be drawn inside the placement-gap area`,
  984  |       ).toBe(0)
  985  |       return reading
  986  |     }
  987  | 
  988  |     // ---- round A: first navigation -------------------------------------
  989  |     await openEstate("open")
  990  |     const refreshA = await readRefresh("open")
  991  |     const igwA = await inspectIgw("open")
  992  |     await reselect("open", igwA?.shown_resource_id ?? null)
  993  |     const groupsA = await readGroups("open")
  994  | 
  995  |     // ---- round B: the same reads after a reload ------------------------
  996  |     await openEstate("reload")
  997  |     const refreshB = await readRefresh("reload")
  998  |     const igwB = await inspectIgw("reload")
  999  |     const groupsB = await readGroups("reload")
  1000 | 
  1001 |     report("reload-stability", {
  1002 |       igw_identity_stable: (igwA?.shown_resource_id ?? null) === (igwB?.shown_resource_id ?? null),
  1003 |       group_count_stable: groupsA.groups.length === groupsB.groups.length,
  1004 |       refresh_state_before: refreshA.refresh_state,
  1005 |       refresh_state_after: refreshB.refresh_state,
  1006 |       banner_before: refreshA.banner,
  1007 |       banner_after: refreshB.banner,
  1008 |     })
  1009 |     // The gateway's identity is a property of the estate, not of one paint.
  1010 |     expect(
  1011 |       igwB?.shown_resource_id ?? null,
  1012 |       "the IGW inspector identity must survive a reload",
  1013 |     ).toBe(igwA?.shown_resource_id ?? null)
  1014 |     expect(groupsB.groups.length, "the logical-group count must survive a reload").toBe(groupsA.groups.length)
  1015 | 
  1016 |     report("page-errors", pageErrors)
  1017 |     expect(pageErrors, "no uncaught page errors").toEqual([])
  1018 |   })
  1019 | })
  1020 | 
  1021 | /** Embedded map: labels painted over off-VPC rail chips, and unknown-glyph nodes. */
  1022 | async function measureEmbeddedLegibility(page: Page): Promise<{
  1023 |   labels_over_rail_chips: Array<{ label: string; chip: string | null }>
  1024 |   unknown_glyph_nodes: Array<{ name: string; title: string | null }>
  1025 |   rail_chips: number
  1026 |   flow_badges: number
  1027 | }> {
  1028 |   return page.evaluate(() => {
  1029 |     const fullscreen = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
  1030 |     const rails = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="topology-edge-services-rail"]')).filter(
  1031 |       el => !fullscreen || !fullscreen.contains(el),
  1032 |     )
  1033 |     const rail = rails[0] ?? null
  1034 |     const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()
  1035 |     const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  1036 |     const chips = rail
  1037 |       ? Array.from(rail.querySelectorAll<HTMLElement>("[data-flow-id], [data-flow-ids]")).filter(chip => chip.getBoundingClientRect().height > 0)
  1038 |       : []
  1039 |     const badges = Array.from(document.querySelectorAll<SVGGElement>('[data-testid="topology-flow-badge"]')).filter(
  1040 |       badge => !fullscreen || !fullscreen.contains(badge),
  1041 |     )
  1042 |     const labelsOver: Array<{ label: string; chip: string | null }> = []
  1043 |     for (const badge of badges) {
  1044 |       const box = badge.querySelector("rect")
  1045 |       if (!box) continue
  1046 |       const r = box.getBoundingClientRect()
```