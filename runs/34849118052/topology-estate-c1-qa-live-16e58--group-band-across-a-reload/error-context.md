# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> inspector identity, refresh status, and the logical-group band across a reload
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:683:7

# Error details

```
Error: open: the logical-group band's disclosure must open

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
    - generic [ref=e34]: 1 account in view
  - generic [ref=e35]:
    - banner [ref=e36]:
      - generic [ref=e37]:
        - generic [ref=e38]:
          - generic [ref=e39]: Estate · Topology v0.2 · testbed-webshop
          - generic [ref=e40]: cyntro-tb-prod-loadgen-role has 15/25 unused permissions (60% gap) — attached to cyntro-tb-prod-loadgen
          - generic [ref=e41]: scored 2026-09-14T13:04:17Z · 0 flagged · posture_correlated_at >= now() - 7d on any workload · VPC vpc-0c39cde96f29f8f4e
          - generic [ref=e42]: Served from cache; not recomputed for this request. · Last updated Sep 14, 2026, 1:04 PM
        - generic [ref=e43]:
          - generic [ref=e44]:
            - generic [ref=e45]: Evidence computed Sep 14, 2026, 1:04 PM
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
              - button "cyntro-tb-prod-aurora Current graph data RDS · eu-west-1 · regional 2 in · 0 out Sep 11, 07:35 PM" [ref=e341]:
                - generic [ref=e342]:
                  - img [ref=e344]
                  - generic [ref=e346]:
                    - generic [ref=e347]:
                      - generic [ref=e348]: cyntro-tb-prod-aurora
                      - generic "Current graph data" [ref=e349]
                    - generic [ref=e351]: RDS · eu-west-1 · regional
                    - generic [ref=e352]:
                      - generic [ref=e353]: 2 in · 0 out
                      - generic [ref=e354]:
                        - img [ref=e355]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e358]:
              - button "cyntro-tb-prod-aurora-0 Current graph data RDS · eu-west-1b · data 0 in · 2 out Sep 11, 07:35 PM" [ref=e359]:
                - generic [ref=e360]:
                  - img [ref=e362]
                  - generic [ref=e364]:
                    - generic [ref=e365]:
                      - generic [ref=e366]: cyntro-tb-prod-aurora-0
                      - generic "Current graph data" [ref=e367]
                    - generic [ref=e369]: RDS · eu-west-1b · data
                    - generic [ref=e370]:
                      - generic [ref=e371]: 0 in · 2 out
                      - generic [ref=e372]:
                        - img [ref=e373]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e376]:
              - button "cyntro-tb-prod-aurora-1 Current graph data RDS · eu-west-1a · data 0 in · 2 out Sep 11, 07:35 PM" [ref=e377]:
                - generic [ref=e378]:
                  - img [ref=e380]
                  - generic [ref=e382]:
                    - generic [ref=e383]:
                      - generic [ref=e384]: cyntro-tb-prod-aurora-1
                      - generic "Current graph data" [ref=e385]
                    - generic [ref=e387]: RDS · eu-west-1a · data
                    - generic [ref=e388]:
                      - generic [ref=e389]: 0 in · 2 out
                      - generic [ref=e390]:
                        - img [ref=e391]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e394]:
              - button "cyntro-tb-prod-consumer-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e395]:
                - generic [ref=e396]:
                  - img [ref=e398]
                  - generic [ref=e400]:
                    - generic [ref=e401]:
                      - generic [ref=e402]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e403]
                    - generic [ref=e405]: EventBridge · eu-west-1 · regional
                    - generic [ref=e406]:
                      - generic [ref=e407]: 0 in · 2 out
                      - generic [ref=e408]:
                        - img [ref=e409]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e412]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e413]:
                - generic [ref=e414]:
                  - img [ref=e416]
                  - generic [ref=e418]:
                    - generic [ref=e419]:
                      - generic [ref=e420]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e421]
                    - generic [ref=e423]: EventBridge · eu-west-1 · regional
                    - generic [ref=e424]:
                      - generic [ref=e425]: 0 in · 2 out
                      - generic [ref=e426]:
                        - img [ref=e427]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e430]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Sep 1, 11:00 AM" [ref=e431]:
                - generic [ref=e432]:
                  - img [ref=e434]
                  - generic [ref=e436]:
                    - generic [ref=e437]:
                      - generic [ref=e438]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e439]
                    - generic [ref=e441]: EventBridge · eu-west-1 · regional
                    - generic [ref=e442]:
                      - generic [ref=e443]: 0 in · 2 out
                      - generic [ref=e444]:
                        - img [ref=e445]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e448]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e449]:
                - generic [ref=e450]:
                  - img [ref=e452]
                  - generic [ref=e454]:
                    - generic [ref=e455]:
                      - generic [ref=e456]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e457]
                    - generic [ref=e459]: Lambda · eu-west-1 · regional
                    - generic [ref=e460]:
                      - generic [ref=e461]: 2 in · 0 out
                      - generic [ref=e462]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e465]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e466]:
                - generic [ref=e467]:
                  - img [ref=e469]
                  - generic [ref=e471]:
                    - generic [ref=e472]:
                      - generic [ref=e473]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e474]
                    - generic [ref=e476]: EventBridge · eu-west-1 · regional
                    - generic [ref=e477]:
                      - generic [ref=e478]: 0 in · 2 out
                      - generic [ref=e479]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e482]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e483]:
                - generic [ref=e484]:
                  - img [ref=e486]
                  - generic [ref=e488]:
                    - generic [ref=e489]:
                      - generic [ref=e490]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e491]
                    - generic [ref=e493]: EventBridge · eu-west-1 · regional
                    - generic [ref=e494]:
                      - generic [ref=e495]: 0 in · 2 out
                      - generic [ref=e496]:
                        - img [ref=e497]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e500]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out Aug 29, 11:00 AM" [ref=e501]:
                - generic [ref=e502]:
                  - img [ref=e504]
                  - generic [ref=e506]:
                    - generic [ref=e507]:
                      - generic [ref=e508]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e509]
                    - generic [ref=e511]: Lambda · eu-west-1 · regional
                    - generic [ref=e512]:
                      - generic [ref=e513]: 2 in · 0 out
                      - generic [ref=e514]:
                        - img [ref=e515]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e518]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 29, 11:00 AM" [ref=e519]:
                - generic [ref=e520]:
                  - img [ref=e522]
                  - generic [ref=e524]:
                    - generic [ref=e525]:
                      - generic [ref=e526]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e527]
                    - generic [ref=e529]: EventBridge · eu-west-1 · regional
                    - generic [ref=e530]:
                      - generic [ref=e531]: 0 in · 2 out
                      - generic [ref=e532]:
                        - img [ref=e533]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e536]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1a · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e537]:
                - generic [ref=e538]:
                  - img [ref=e540]
                  - generic [ref=e542]:
                    - generic [ref=e543]:
                      - generic [ref=e544]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e545]
                    - generic [ref=e547]: EC2 · eu-west-1a · web
                    - generic [ref=e548]:
                      - generic [ref=e549]: 2 in · 0 out
                      - generic [ref=e550]:
                        - img [ref=e551]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e554]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1b · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e555]:
                - generic [ref=e556]:
                  - img [ref=e558]
                  - generic [ref=e560]:
                    - generic [ref=e561]:
                      - generic [ref=e562]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e563]
                    - generic [ref=e565]: EC2 · eu-west-1b · web
                    - generic [ref=e566]:
                      - generic [ref=e567]: 2 in · 0 out
                      - generic [ref=e568]:
                        - img [ref=e569]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e572]:
              - button "cyntro-testbed-webshop-writer Current graph data Neptune · eu-west-1a · web 0 in · 2 out Sep 11, 07:35 PM" [ref=e573]:
                - generic [ref=e574]:
                  - img [ref=e576]
                  - generic [ref=e578]:
                    - generic [ref=e579]:
                      - generic [ref=e580]: cyntro-testbed-webshop-writer
                      - generic "Current graph data" [ref=e581]
                    - generic [ref=e583]: Neptune · eu-west-1a · web
                    - generic [ref=e584]:
                      - generic [ref=e585]: 0 in · 2 out
                      - generic [ref=e586]:
                        - img [ref=e587]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e590]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a Current graph data KMSKey · global · regional 1 in · 0 out No runtime timestamp" [ref=e591]:
                - generic [ref=e592]:
                  - img [ref=e594]
                  - generic [ref=e596]:
                    - generic [ref=e597]:
                      - generic [ref=e598]: arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a
                      - generic "Current graph data" [ref=e599]
                    - generic [ref=e601]: KMSKey · global · regional
                    - generic [ref=e602]:
                      - generic [ref=e603]: 1 in · 0 out
                      - generic [ref=e604]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e607]:
              - button "cyntro-evidence-testbed-webshop-950952 Current graph data S3 · global · regional 0 in · 1 out No runtime timestamp" [ref=e608]:
                - generic [ref=e609]:
                  - img [ref=e611]
                  - generic [ref=e613]:
                    - generic [ref=e614]:
                      - generic [ref=e615]: cyntro-evidence-testbed-webshop-950952
                      - generic "Current graph data" [ref=e616]
                    - generic [ref=e618]: S3 · global · regional
                    - generic [ref=e619]:
                      - generic [ref=e620]: 0 in · 1 out
                      - generic [ref=e621]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e624]:
              - button "cyntro-ingest-head-testbed-webshop Current graph data DynamoDB · eu-west-1 · regional 0 in · 1 out No runtime timestamp" [ref=e625]:
                - generic [ref=e626]:
                  - img [ref=e628]
                  - generic [ref=e630]:
                    - generic [ref=e631]:
                      - generic [ref=e632]: cyntro-ingest-head-testbed-webshop
                      - generic "Current graph data" [ref=e633]
                    - generic [ref=e635]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e636]:
                      - generic [ref=e637]: 0 in · 1 out
                      - generic [ref=e638]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e641]:
              - button "cyntro-tb-prod-alb-int Current graph data LoadBalancer · eu-west-1a · app 0 in · 1 out No runtime timestamp" [ref=e642]:
                - generic [ref=e643]:
                  - img [ref=e645]
                  - generic [ref=e647]:
                    - generic [ref=e648]:
                      - generic [ref=e649]: cyntro-tb-prod-alb-int
                      - generic "Current graph data" [ref=e650]
                    - generic [ref=e652]: LoadBalancer · eu-west-1a · app
                    - generic [ref=e653]:
                      - generic [ref=e654]: 0 in · 1 out
                      - generic [ref=e655]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e658]:
              - button "cyntro-tb-prod-alb-pub Current graph data LoadBalancer · eu-west-1b · web 0 in · 1 out No runtime timestamp" [ref=e659]:
                - generic [ref=e660]:
                  - img [ref=e662]
                  - generic [ref=e664]:
                    - generic [ref=e665]:
                      - generic [ref=e666]: cyntro-tb-prod-alb-pub
                      - generic "Current graph data" [ref=e667]
                    - generic [ref=e669]: LoadBalancer · eu-west-1b · web
                    - generic [ref=e670]:
                      - generic [ref=e671]: 0 in · 1 out
                      - generic [ref=e672]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e675]:
              - button "cyntro-tb-prod-loadgen Current graph data EC2 · eu-west-1a · app 0 in · 1 out Aug 18, 06:57 PM" [ref=e676]:
                - generic [ref=e677]:
                  - img [ref=e679]
                  - generic [ref=e681]:
                    - generic [ref=e682]:
                      - generic [ref=e683]: cyntro-tb-prod-loadgen
                      - generic "Current graph data" [ref=e684]
                    - generic [ref=e686]: EC2 · eu-west-1a · app
                    - generic [ref=e687]:
                      - generic [ref=e688]: 0 in · 1 out
                      - generic [ref=e689]:
                        - img [ref=e690]
                        - text: Aug 18, 06:57 PM
            - listitem [ref=e693]:
              - button "cyntro-testbed-webshop Current graph data Neptune · eu-west-1 · regional 1 in · 0 out Sep 11, 07:35 PM" [ref=e694]:
                - generic [ref=e695]:
                  - img [ref=e697]
                  - generic [ref=e699]:
                    - generic [ref=e700]:
                      - generic [ref=e701]: cyntro-testbed-webshop
                      - generic "Current graph data" [ref=e702]
                    - generic [ref=e704]: Neptune · eu-west-1 · regional
                    - generic [ref=e705]:
                      - generic [ref=e706]: 1 in · 0 out
                      - generic [ref=e707]:
                        - img [ref=e708]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e711]:
              - button "cyntro-tb-prod-logs-1c8276f5 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp" [ref=e712]:
                - generic [ref=e713]:
                  - img [ref=e715]
                  - generic [ref=e718]:
                    - generic [ref=e719]:
                      - generic [ref=e720]: cyntro-tb-prod-logs-1c8276f5
                      - generic "Current graph data" [ref=e721]
                    - generic [ref=e723]: S3 · global · regional
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
                    - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e1016]: "egress: 3 workloads"
                - generic [ref=e1018]:
                  - generic [ref=e1019]: Endpoints (1)
                  - generic [ref=e1020]:
                    - button "VPCE GW Amazon S3" [ref=e1021]:
                      - img [ref=e1023]
                      - generic [ref=e1027]: VPCE
                      - generic [ref=e1028]: GW
                      - generic [ref=e1029]: Amazon S3
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e1030]: "use: not observed"
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
                    - button "quiet posture score …76bd5a63-602c-471e-b085-1df8b04128b2 3 other · service-plane access" [ref=e1141]:
                      - generic "quiet posture score" [ref=e1142]
                      - generic [ref=e1145]:
                        - generic [ref=e1146]: …76bd5a63-602c-471e-b085-1df8b04128b2
                        - generic "3 other · service-plane access" [ref=e1147]
                    - button "quiet posture score …d729e441-b319-4859-9974-9bd12d8e341a 1 other · service-plane access" [ref=e1148]:
                      - generic "quiet posture score" [ref=e1149]
                      - generic [ref=e1152]:
                        - generic [ref=e1153]: …d729e441-b319-4859-9974-9bd12d8e341a
                        - generic "1 other · service-plane access" [ref=e1154]
                    - button "quiet posture score …1a88e19d-2eb4-4bf7-a16d-35152bc8a453 2 other · service-plane access" [ref=e1155]:
                      - generic "quiet posture score" [ref=e1156]
                      - generic [ref=e1159]:
                        - generic [ref=e1160]: …1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                        - generic "2 other · service-plane access" [ref=e1161]
                    - button "quiet posture score cyntro-tb-prod-logs-1c8276f5" [ref=e1162]:
                      - generic "quiet posture score" [ref=e1163]
                      - generic [ref=e1167]: cyntro-tb-prod-logs-1c8276f5
            - generic [ref=e1168]:
              - generic [ref=e1169]:
                - generic [ref=e1170]: Logical groups · members carry the placement (6)
                - generic [ref=e1171]: "Target groups, auto-scaling groups and database clusters have no subnet of their own — their members carry the placement. Not a collector gap: a full sync will not move it."
              - generic [ref=e1172]:
                - generic [ref=e1173]:
                  - button "quiet posture score cyntro-tb-prod-aurora" [ref=e1174]:
                    - generic "quiet posture score" [ref=e1175]
                    - generic [ref=e1178]: cyntro-tb-prod-aurora
                  - generic [ref=e1179]: VPC not reported · spans eu-west-1a, eu-west-1b
                  - generic [ref=e1180]:
                    - button "cyntro-tb-prod-aurora-1" [ref=e1181]
                    - button "cyntro-tb-prod-aurora-0" [ref=e1182]
                - generic [ref=e1183]:
                  - button "quiet posture score cyntro-tb-prod-tg-app" [ref=e1184]:
                    - generic "quiet posture score" [ref=e1185]
                    - generic [ref=e1188]: cyntro-tb-prod-tg-app
                  - generic [ref=e1189]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                  - generic [ref=e1190]:
                    - button "cyntro-tb-prod-app" [ref=e1191]
                    - button "cyntro-tb-prod-app" [ref=e1192]
                - generic [ref=e1193]:
                  - button "quiet posture score cyntro-tb-prod-tg-web" [ref=e1194]:
                    - generic "quiet posture score" [ref=e1195]
                    - generic [ref=e1198]: cyntro-tb-prod-tg-web
                  - generic [ref=e1199]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                  - generic [ref=e1200]:
                    - button "cyntro-tb-prod-web" [ref=e1201]
                    - button "cyntro-tb-prod-web" [ref=e1202]
                - generic [ref=e1203]:
                  - button "quiet posture score cyntro-testbed-webshop" [ref=e1204]:
                    - generic "quiet posture score" [ref=e1205]
                    - generic [ref=e1208]: cyntro-testbed-webshop
                  - generic [ref=e1209]: VPC not reported · spans eu-west-1a
                  - button "cyntro-testbed-webshop-writer" [ref=e1211]
                - generic [ref=e1212]:
                  - button "quiet posture score cyntro-tb-prod-asg-web" [ref=e1213]:
                    - generic "quiet posture score" [ref=e1214]
                    - generic [ref=e1217]: cyntro-tb-prod-asg-web
                  - generic [ref=e1218]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                  - generic [ref=e1219]:
                    - button "cyntro-tb-prod-web" [ref=e1220]
                    - button "cyntro-tb-prod-web" [ref=e1221]
                - generic [ref=e1222]:
                  - button "quiet posture score cyntro-tb-prod-asg-app" [ref=e1223]:
                    - generic "quiet posture score" [ref=e1224]
                    - generic [ref=e1227]: cyntro-tb-prod-asg-app
                  - generic [ref=e1228]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                  - generic [ref=e1229]:
                    - button "cyntro-tb-prod-app" [ref=e1230]
                    - button "cyntro-tb-prod-app" [ref=e1231]
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
      - dialog "Operations for cyntro-tb-prod-consumer-daily" [ref=e1232]:
        - banner [ref=e1233]:
          - generic [ref=e1234]:
            - img "Resource" [ref=e1235]:
              - img [ref=e1236]
            - generic [ref=e1239]:
              - generic [ref=e1240]: Estate operations · EventBridge
              - generic [ref=e1241]: Cloud service · scoped operational context
              - heading "cyntro-tb-prod-consumer-daily" [level=2] [ref=e1242]
              - generic [ref=e1244]: arn:aws:events:eu-west-1:416651950952:rule/cyntro-tb-prod-consumer-daily
            - button "Enlarge service details" [ref=e1245]:
              - img [ref=e1246]
            - button "Close service details" [ref=e1251]:
              - img [ref=e1252]
          - tablist "Resource operations" [ref=e1255]:
            - tab "Resource" [selected] [ref=e1256]:
              - img [ref=e1257]
              - text: Resource
            - tab "Dependencies" [ref=e1269]:
              - img [ref=e1270]
              - text: Dependencies
            - tab "Change impact" [ref=e1274]:
              - img [ref=e1275]
              - text: Change impact
        - generic [ref=e1277]:
          - generic [ref=e1278]:
            - generic [ref=e1279]:
              - generic [ref=e1280]:
                - heading "Service inspector" [level=3] [ref=e1281]
                - paragraph [ref=e1282]: Neptune graph · incident dependency segments and deterministic service routing
              - generic [ref=e1283]: Unverified traffic context
            - generic [ref=e1284]:
              - generic [ref=e1285]:
                - generic [ref=e1286]: Legacy unverified
                - generic [ref=e1287]:
                  - generic [ref=e1288]:
                    - generic [ref=e1289]:
                      - generic "cyntro-tb-prod-consumer-daily" [ref=e1290]
                      - generic [ref=e1291]: EventBridge
                    - generic [ref=e1292]:
                      - img "TARGETS" [ref=e1293]
                      - generic "TARGETS" [ref=e1296]
                  - generic [ref=e1297]:
                    - generic [ref=e1298]:
                      - generic "cyntro-tb-prod-consumer-daily" [ref=e1299]
                      - generic [ref=e1300]: Lambda
                    - generic [ref=e1301]:
                      - img "S3 access" [ref=e1302]
                      - generic "S3 access · ACTUAL_S3_ACCESS" [ref=e1304]: S3 access
                  - generic [ref=e1305]:
                    - generic [ref=e1306]:
                      - generic "cyntro-tb-prod-appdata-1c8276f5" [ref=e1307]
                      - generic [ref=e1308]: S3
                    - generic [ref=e1309]:
                      - img "KMS" [ref=e1310]
                      - generic "KMS · ENCRYPTED_BY" [ref=e1312]: KMS
                  - generic [ref=e1314]:
                    - generic "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a" [ref=e1315]
                    - generic [ref=e1316]: KMSKey
              - generic [ref=e1317]:
                - generic [ref=e1318]: Legacy unverified
                - generic [ref=e1319]:
                  - generic [ref=e1320]:
                    - generic [ref=e1321]:
                      - generic "cyntro-tb-prod-consumer-daily" [ref=e1322]
                      - generic [ref=e1323]: EventBridge
                    - generic [ref=e1324]:
                      - img "TRIGGERS" [ref=e1325]
                      - generic "TRIGGERS" [ref=e1328]
                  - generic [ref=e1329]:
                    - generic [ref=e1330]:
                      - generic "cyntro-tb-prod-consumer-daily" [ref=e1331]
                      - generic [ref=e1332]: Lambda
                    - generic [ref=e1333]:
                      - img "S3 access" [ref=e1334]
                      - generic "S3 access · ACTUAL_S3_ACCESS" [ref=e1336]: S3 access
                  - generic [ref=e1337]:
                    - generic [ref=e1338]:
                      - generic "cyntro-tb-prod-appdata-1c8276f5" [ref=e1339]
                      - generic [ref=e1340]: S3
                    - generic [ref=e1341]:
                      - img "KMS" [ref=e1342]
                      - generic "KMS · ENCRYPTED_BY" [ref=e1344]: KMS
                  - generic [ref=e1346]:
                    - generic "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a" [ref=e1347]
                    - generic [ref=e1348]: KMSKey
          - generic [ref=e1349]:
            - generic [ref=e1350]:
              - generic [ref=e1351]:
                - img [ref=e1352]
                - text: Live configuration from Inventory
              - paragraph [ref=e1355]: Same resource inspector and evidence used by All Services. The map adds dependency and change scope around it.
            - generic [ref=e1356]:
              - generic [ref=e1358]:
                - img [ref=e1360]
                - text: Operator summary
              - paragraph [ref=e1362]: Narrative summary is unavailable. Verified configuration and evidence remain available below.
            - generic [ref=e1363]:
              - generic [ref=e1364]: Data readiness is not scored for this resource type yet.
              - generic [ref=e1365]:
                - generic [ref=e1366]:
                  - heading "Key insights" [level=3] [ref=e1367]
                  - list [ref=e1368]:
                    - listitem [ref=e1369]:
                      - generic [ref=e1370]: No observed usage in window
                      - paragraph [ref=e1371]: Rule targets and invocation direction are shown in the Dependencies tab.
                - generic [ref=e1372]:
                  - heading "EventBridge rule" [level=3] [ref=e1373]
                  - generic [ref=e1374]:
                    - generic [ref=e1375]:
                      - term [ref=e1376]: title
                      - definition [ref=e1377]: EventBridge rule
                    - generic [ref=e1378]:
                      - term [ref=e1379]: source
                      - definition [ref=e1380]: Neo4j (collector:eventbridge_rules)
                  - paragraph [ref=e1381]: "Source: Neo4j (collector:eventbridge_rules)"
                - generic [ref=e1382]:
                  - heading "Configured targets" [level=3] [ref=e1383]
                  - paragraph [ref=e1384]: Rule targets and invocation direction are shown in the Dependencies tab.
                  - paragraph [ref=e1385]: "Source: EventBridge TARGETS relationships"
  - region "Notifications (F8)":
    - list
  - alert [ref=e1386]
```

# Test source

```ts
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
  946  |         ).toBe(true)
  947  |       }
  948  |       return reading
  949  |     }
  950  | 
  951  |     /** Logical groups carry their own band and are never counted as gaps. */
  952  |     async function readGroups(label: string) {
  953  |       const fullscreen = await enterFullscreen()
  954  |       // The band collapses by default (it was spending the data tier's rows on
  955  |       // C1 at 1512x771). Open it first: a reading of a closed band would count
  956  |       // its members as zero and read as a regression in the projection.
  957  |       const opened = await openDisclosure(page, "fullscreen", "topology-logical-group-band-toggle")
  958  |       const reading = await fullscreen.evaluate(root => {
  959  |         const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()
  960  |         const band = root.querySelector('[data-testid="topology-logical-group-band"]')
  961  |         const area = root.querySelector('[data-testid="topology-unplaced-area"]')
  962  |         const groups = band
  963  |           ? Array.from(band.querySelectorAll<HTMLElement>('[data-testid="topology-logical-group"]'))
  964  |           : []
  965  |         return {
  966  |           band_header: text(band?.querySelector('[data-testid="topology-logical-group-band-header"]')) || null,
  967  |           band_open: band?.getAttribute("data-groups-open") ?? null,
  968  |           groups: groups.map(group => ({
  969  |             node_id: group.getAttribute("data-node-id"),
  970  |             scope: text(group.querySelector('[data-testid="topology-logical-group-scope"]')) || null,
  971  |             members: group.querySelectorAll('[data-testid="topology-logical-group-member"]').length,
  972  |             unlinked: Boolean(group.querySelector('[data-testid="topology-logical-group-members-unlinked"]')),
  973  |           })),
  974  |           unplaced_header: text(area?.querySelector("span")) || null,
  975  |           unplaced_chips: area
  976  |             ? area.querySelectorAll('[data-testid="topology-service-node-icon"]').length
  977  |             : 0,
  978  |           // A group drawn INSIDE the amber gap area is the misclassification
  979  |           // this band exists to remove.
  980  |           groups_inside_unplaced: area
  981  |             ? area.querySelectorAll('[data-testid="topology-logical-group"]').length
  982  |             : 0,
  983  |         }
  984  |       })
  985  |       report(`${label}-logical-groups`, reading)
  986  |       expect(
  987  |         reading.groups_inside_unplaced,
  988  |         `${label}: a logical group must never be drawn inside the placement-gap area`,
  989  |       ).toBe(0)
  990  |       // Only meaningful when the band exists at all; when it does, the members
  991  |       // this reading counts must be the OPEN band's, not a hidden zero.
  992  |       if (reading.band_header) {
> 993  |         expect(opened, `${label}: the logical-group band's disclosure must open`).toBe(true)
       |                                                                                   ^ Error: open: the logical-group band's disclosure must open
  994  |         expect(reading.band_open, `${label}: the band must report itself open once toggled`).toBe("true")
  995  |       }
  996  |       return reading
  997  |     }
  998  | 
  999  |     // ---- round A: first navigation -------------------------------------
  1000 |     await openEstate("open")
  1001 |     const refreshA = await readRefresh("open")
  1002 |     const igwA = await inspectIgw("open")
  1003 |     await reselect("open", igwA?.shown_resource_id ?? null)
  1004 |     const groupsA = await readGroups("open")
  1005 | 
  1006 |     // ---- round B: the same reads after a reload ------------------------
  1007 |     await openEstate("reload")
  1008 |     const refreshB = await readRefresh("reload")
  1009 |     const igwB = await inspectIgw("reload")
  1010 |     const groupsB = await readGroups("reload")
  1011 | 
  1012 |     report("reload-stability", {
  1013 |       igw_identity_stable: (igwA?.shown_resource_id ?? null) === (igwB?.shown_resource_id ?? null),
  1014 |       group_count_stable: groupsA.groups.length === groupsB.groups.length,
  1015 |       refresh_state_before: refreshA.refresh_state,
  1016 |       refresh_state_after: refreshB.refresh_state,
  1017 |       banner_before: refreshA.banner,
  1018 |       banner_after: refreshB.banner,
  1019 |     })
  1020 |     // The gateway's identity is a property of the estate, not of one paint.
  1021 |     expect(
  1022 |       igwB?.shown_resource_id ?? null,
  1023 |       "the IGW inspector identity must survive a reload",
  1024 |     ).toBe(igwA?.shown_resource_id ?? null)
  1025 |     expect(groupsB.groups.length, "the logical-group count must survive a reload").toBe(groupsA.groups.length)
  1026 | 
  1027 |     report("page-errors", pageErrors)
  1028 |     expect(pageErrors, "no uncaught page errors").toEqual([])
  1029 |   })
  1030 | })
  1031 | 
  1032 | /** Embedded map: labels painted over off-VPC rail chips, and unknown-glyph nodes. */
  1033 | async function measureEmbeddedLegibility(page: Page): Promise<{
  1034 |   labels_over_rail_chips: Array<{ label: string; chip: string | null }>
  1035 |   unknown_glyph_nodes: Array<{ name: string; title: string | null }>
  1036 |   rail_chips: number
  1037 |   flow_badges: number
  1038 | }> {
  1039 |   return page.evaluate(() => {
  1040 |     const fullscreen = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
  1041 |     const rails = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="topology-edge-services-rail"]')).filter(
  1042 |       el => !fullscreen || !fullscreen.contains(el),
  1043 |     )
  1044 |     const rail = rails[0] ?? null
  1045 |     const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()
  1046 |     const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  1047 |     const chips = rail
  1048 |       ? Array.from(rail.querySelectorAll<HTMLElement>("[data-flow-id], [data-flow-ids]")).filter(chip => chip.getBoundingClientRect().height > 0)
  1049 |       : []
  1050 |     const badges = Array.from(document.querySelectorAll<SVGGElement>('[data-testid="topology-flow-badge"]')).filter(
  1051 |       badge => !fullscreen || !fullscreen.contains(badge),
  1052 |     )
  1053 |     const labelsOver: Array<{ label: string; chip: string | null }> = []
  1054 |     for (const badge of badges) {
  1055 |       const box = badge.querySelector("rect")
  1056 |       if (!box) continue
  1057 |       const r = box.getBoundingClientRect()
  1058 |       if (r.width === 0 || r.height === 0) continue
  1059 |       const label = (badge.querySelector("text")?.textContent ?? "").trim()
  1060 |       for (const chip of chips) {
  1061 |         if (intersects(r, chip.getBoundingClientRect())) {
  1062 |           labelsOver.push({ label, chip: chip.getAttribute("data-flow-id") ?? chip.getAttribute("data-flow-ids") })
  1063 |         }
  1064 |       }
  1065 |     }
  1066 |     const unknown = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="topology-service-node-icon"]'))
  1067 |       .filter(chip => !fullscreen || !fullscreen.contains(chip))
  1068 |       .filter(chip => Array.from(chip.querySelectorAll("span")).some(span => span.childElementCount === 0 && span.textContent?.trim() === "?"))
  1069 |       .map(chip => ({ name: text(chip), title: chip.getAttribute("title") }))
  1070 |     return { labels_over_rail_chips: labelsOver, unknown_glyph_nodes: unknown, rail_chips: chips.length, flow_badges: badges.length }
  1071 |   })
  1072 | }
  1073 | 
  1074 | async function bannerText(page: Page, scope: "page" | "fullscreen"): Promise<string | null> {
  1075 |   return page.evaluate(scopeArg => {
  1076 |     const root =
  1077 |       scopeArg === "fullscreen"
  1078 |         ? document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
  1079 |         : document
  1080 |     const el = root?.querySelector('[data-testid="topology-traffic-authority-state"]')
  1081 |     const text = (el?.textContent ?? "").replace(/\s+/g, " ").trim()
  1082 |     return text || null
  1083 |   }, scope)
  1084 | }
  1085 | 
  1086 | interface PillReading {
  1087 |   state: string | null
  1088 |   totals: string
  1089 |   lanes: Array<{ testid: string | null; state: string | null; text: string }>
  1090 |   warnings: Array<{ code: string | null; text: string }>
  1091 | }
  1092 | 
  1093 | /** Open a disclosure by testid within one scope, and report whether it opened.
```