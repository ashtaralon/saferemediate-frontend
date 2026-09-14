# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-fullscreen-stacking-fixture.spec.ts >> external-destinations panel is topmost inside map fullscreen at 1512x771
- Location: tests/integration/topology-estate-fullscreen-stacking-fixture.spec.ts:136:7

# Error details

```
Error: the panel never settled opaque and on top in fullscreen (1512x771 · measurement): {"hasWrapper":true,"wrapperZ":50,"contentZ":50,"fullscreenZ":200,"panelInsideFullscreen":false,"effectiveOpacity":1,"rect":{"x":944,"y":224,"w":460,"h":300},"covered":[{"probe":"top","x":1174,"y":230,"hit":"div.text-[11px] uppercase tracking-[0.14em] font-sem"},{"probe":"middle","x":1174,"y":374,"hit":"topology-interlane-corridor"},{"probe":"bottom","x":1174,"y":518,"hit":"topology-interlane-corridor"},{"probe":"left","x":950,"y":374,"hit":"topology-flow-corridor"},{"probe":"right","x":1398,"y":374,"hit":"topology-density-stack-tile"}]}
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
        - option "cyntro-dev" [selected]
    - generic [ref=e13]:
      - img [ref=e14]
      - generic [ref=e18]: Group
      - combobox "Group" [ref=e19]:
        - option "All account groups" [selected]
    - generic [ref=e20]:
      - img [ref=e21]
      - generic [ref=e23]: Account
      - combobox "Account" [ref=e24]:
        - option "All accounts" [selected]
        - option "ashtaralon · 745783559495"
    - generic [ref=e25]:
      - img [ref=e26]
      - generic [ref=e31]: Region
      - combobox "Region" [ref=e32]:
        - option "All regions" [selected]
        - option "eu-west-1"
        - option "global"
        - option "us-east-1"
    - generic [ref=e34]: 1 account in view
  - generic [ref=e35]:
    - banner [ref=e36]:
      - generic [ref=e37]:
        - generic [ref=e38]:
          - generic [ref=e39]: Estate · Topology v0.2 · alon-prod
          - generic [ref=e40]: SafeRemediate-Test-Frontend-1 is LATENT_EXPOSURE — inbound path open, unused (zero public inbound in 365 days). Observed egress to 566 external destinations (365d).
          - generic [ref=e41]: scored 2026-07-09T11:36:31Z · 4 flagged · posture_correlated_at >= now() - 7d on any workload · VPC vpc-0329e985173bed24f
        - generic [ref=e42]:
          - generic [ref=e43]:
            - generic [ref=e44]: Evidence computed Jul 9, 2026, 11:36 AM
            - generic [ref=e46]: Live graph
          - button "System stats" [ref=e47]
    - generic [ref=e48]:
      - generic [ref=e49]: Region scope
      - combobox "Region scope" [ref=e50]:
        - option "eu-west-1" [selected]
        - option "global"
        - option "us-east-1"
    - generic [ref=e51]:
      - generic [ref=e52]: VPC scope
      - combobox "VPC scope" [ref=e53]:
        - option "All VPCs · Compare"
        - option "alon-prod-vpc · vpc-0329e985173bed24f (6 workloads)" [selected]
        - option "vpc-086bcc2186fa42c96 · vpc-086bcc2186fa42c96 (8 workloads)"
      - generic [ref=e54]: Subnet-linked compute in tier cells; regional/serverless on the right rail.
    - generic [ref=e55]:
      - generic [ref=e56]: Availability zones
      - button "eu-west-1a" [pressed] [ref=e57]
      - button "eu-west-1b" [pressed] [ref=e58]
    - generic [ref=e59]:
      - generic "EC2 / RDS / LoadBalancer in the selected VPC" [ref=e60]: In this VPC
      - button "EC2 (3)" [pressed] [ref=e61]
      - button "RDS (2)" [pressed] [ref=e62]
      - button "Neptune (2)" [pressed] [ref=e63]
      - button "TargetGroup (2)" [pressed] [ref=e64]
      - button "AutoScalingGroup (2)" [pressed] [ref=e65]
      - generic "Regional services are system-wide. Lambda inventory is system-wide too, while placement distinguishes VPC-attached functions from non-VPC-attached runtimes." [ref=e66]: System-wide
      - button "S3 (10)" [pressed] [ref=e67]
      - button "DynamoDB (8)" [pressed] [ref=e68]
      - button "Lambda (6)" [pressed] [ref=e69]
      - button "EventBridge (6)" [pressed] [ref=e70]
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
              - generic [ref=e96]: "41"
            - generic [ref=e97]:
              - img [ref=e98]
              - searchbox "Find service in topology" [ref=e101]
            - button "Filters" [ref=e104]:
              - img [ref=e105]
              - text: Filters
          - list [ref=e107]:
            - listitem [ref=e108]:
              - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 3 in · 4 out Jul 9, 11:04 AM" [ref=e109]:
                - generic [ref=e110]:
                  - img [ref=e112]
                  - generic [ref=e114]:
                    - generic [ref=e115]:
                      - generic [ref=e116]: SafeRemediate-Test-Frontend-1
                      - generic "Current graph data" [ref=e117]
                    - generic [ref=e119]: EC2 · eu-west-1a · web
                    - generic [ref=e120]:
                      - generic [ref=e121]: 3 in · 4 out
                      - generic [ref=e122]:
                        - img [ref=e123]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e126]:
              - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 3 in · 3 out Jul 9, 10:40 AM" [ref=e127]:
                - generic [ref=e128]:
                  - img [ref=e130]
                  - generic [ref=e132]:
                    - generic [ref=e133]:
                      - generic [ref=e134]: SafeRemediate-Test-App-2
                      - generic "Current graph data" [ref=e135]
                    - generic [ref=e137]: EC2 · eu-west-1b · app
                    - generic [ref=e138]:
                      - generic [ref=e139]: 3 in · 3 out
                      - generic [ref=e140]:
                        - img [ref=e141]
                        - text: Jul 9, 10:40 AM
            - listitem [ref=e144]:
              - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 2 in · 3 out Jul 9, 11:04 AM" [ref=e145]:
                - generic [ref=e146]:
                  - img [ref=e148]
                  - generic [ref=e150]:
                    - generic [ref=e151]:
                      - generic [ref=e152]: SafeRemediate-Test-Frontend-2
                      - generic "Current graph data" [ref=e153]
                    - generic [ref=e155]: EC2 · eu-west-1b · web
                    - generic [ref=e156]:
                      - generic [ref=e157]: 2 in · 3 out
                      - generic [ref=e158]:
                        - img [ref=e159]
                        - text: Jul 9, 11:04 AM
            - listitem [ref=e162]:
              - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 4 in · 0 out Sep 12, 04:00 AM" [ref=e163]:
                - generic [ref=e164]:
                  - img [ref=e166]
                  - generic [ref=e168]:
                    - generic [ref=e169]:
                      - generic [ref=e170]: alon-demo-data-bucket-745783559495
                      - generic "Current graph data" [ref=e171]
                    - generic [ref=e173]: S3 · eu-west-1 · regional
                    - generic [ref=e174]:
                      - generic [ref=e175]: 4 in · 0 out
                      - generic [ref=e176]:
                        - img [ref=e177]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e180]:
              - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 4 in · 0 out Jul 6, 03:05 PM" [ref=e181]:
                - generic [ref=e182]:
                  - img [ref=e184]
                  - generic [ref=e186]:
                    - generic [ref=e187]:
                      - generic [ref=e188]: saferemediate-test-db
                      - generic "Current graph data" [ref=e189]
                    - generic [ref=e191]: RDS · eu-west-1a · data
                    - generic [ref=e192]:
                      - generic [ref=e193]: 4 in · 0 out
                      - generic [ref=e194]:
                        - img [ref=e195]
                        - text: Jul 6, 03:05 PM
            - listitem [ref=e198]:
              - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e199]:
                - generic [ref=e200]:
                  - img [ref=e202]
                  - generic [ref=e204]:
                    - generic [ref=e205]:
                      - generic [ref=e206]: AlonIAMTest-traffic-generator
                      - generic "Current graph data" [ref=e207]
                    - generic [ref=e209]: Lambda · eu-west-1 · regional
                    - generic [ref=e210]:
                      - generic [ref=e211]: 2 in · 1 out
                      - generic [ref=e212]:
                        - img [ref=e213]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e216]:
              - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e217]:
                - generic [ref=e218]:
                  - img [ref=e220]
                  - generic [ref=e222]:
                    - generic [ref=e223]:
                      - generic [ref=e224]: PaymentTrafficGenerator
                      - generic "Current graph data" [ref=e225]
                    - generic [ref=e227]: Lambda · eu-west-1 · regional
                    - generic [ref=e228]:
                      - generic [ref=e229]: 2 in · 1 out
                      - generic [ref=e230]:
                        - img [ref=e231]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e234]:
              - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e235]:
                - generic [ref=e236]:
                  - img [ref=e238]
                  - generic [ref=e240]:
                    - generic [ref=e241]:
                      - generic [ref=e242]: SafeRemediate-BehaviorAnalyzer
                      - generic "Current graph data" [ref=e243]
                    - generic [ref=e245]: Lambda · eu-west-1 · regional
                    - generic [ref=e246]:
                      - generic [ref=e247]: 2 in · 1 out
                      - generic [ref=e248]:
                        - img [ref=e249]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e252]:
              - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e253]:
                - generic [ref=e254]:
                  - img [ref=e256]
                  - generic [ref=e258]:
                    - generic [ref=e259]:
                      - generic [ref=e260]: SafeRemediate-ConfidenceScorer
                      - generic "Current graph data" [ref=e261]
                    - generic [ref=e263]: Lambda · eu-west-1 · regional
                    - generic [ref=e264]:
                      - generic [ref=e265]: 2 in · 1 out
                      - generic [ref=e266]:
                        - img [ref=e267]
                        - text: Sep 12, 04:00 AM
            - listitem [ref=e270]:
              - button "fixture-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e271]:
                - generic [ref=e272]:
                  - img [ref=e274]
                  - generic [ref=e276]:
                    - generic [ref=e277]:
                      - generic [ref=e278]: fixture-asg-app
                      - generic "Current graph data" [ref=e279]
                    - generic [ref=e281]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e282]:
                      - generic [ref=e283]: 0 in · 2 out
                      - generic [ref=e284]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e287]:
              - button "fixture-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e288]:
                - generic [ref=e289]:
                  - img [ref=e291]
                  - generic [ref=e293]:
                    - generic [ref=e294]:
                      - generic [ref=e295]: fixture-asg-web
                      - generic "Current graph data" [ref=e296]
                    - generic [ref=e298]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e299]:
                      - generic [ref=e300]: 0 in · 2 out
                      - generic [ref=e301]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e304]:
              - button "fixture-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e305]:
                - generic [ref=e306]:
                  - img [ref=e308]
                  - generic [ref=e310]:
                    - generic [ref=e311]:
                      - generic [ref=e312]: fixture-daily
                      - generic "Current graph data" [ref=e313]
                    - generic [ref=e315]: EventBridge · eu-west-1 · regional
                    - generic [ref=e316]:
                      - generic [ref=e317]: 0 in · 2 out
                      - generic [ref=e318]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e321]:
              - button "fixture-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e322]:
                - generic [ref=e323]:
                  - img [ref=e325]
                  - generic [ref=e327]:
                    - generic [ref=e328]:
                      - generic [ref=e329]: fixture-every_6h
                      - generic "Current graph data" [ref=e330]
                    - generic [ref=e332]: EventBridge · eu-west-1 · regional
                    - generic [ref=e333]:
                      - generic [ref=e334]: 0 in · 2 out
                      - generic [ref=e335]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e338]:
              - button "fixture-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e339]:
                - generic [ref=e340]:
                  - img [ref=e342]
                  - generic [ref=e344]:
                    - generic [ref=e345]:
                      - generic [ref=e346]: fixture-frequent
                      - generic "Current graph data" [ref=e347]
                    - generic [ref=e349]: EventBridge · eu-west-1 · regional
                    - generic [ref=e350]:
                      - generic [ref=e351]: 0 in · 2 out
                      - generic [ref=e352]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e355]:
              - button "fixture-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e356]:
                - generic [ref=e357]:
                  - img [ref=e359]
                  - generic [ref=e361]:
                    - generic [ref=e362]:
                      - generic [ref=e363]: fixture-monthly
                      - generic "Current graph data" [ref=e364]
                    - generic [ref=e366]: EventBridge · eu-west-1 · regional
                    - generic [ref=e367]:
                      - generic [ref=e368]: 0 in · 2 out
                      - generic [ref=e369]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e372]:
              - button "fixture-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e373]:
                - generic [ref=e374]:
                  - img [ref=e376]
                  - generic [ref=e378]:
                    - generic [ref=e379]:
                      - generic [ref=e380]: fixture-nightly_burst
                      - generic "Current graph data" [ref=e381]
                    - generic [ref=e383]: EventBridge · eu-west-1 · regional
                    - generic [ref=e384]:
                      - generic [ref=e385]: 0 in · 2 out
                      - generic [ref=e386]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e389]:
              - button "fixture-tg-app Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e390]:
                - generic [ref=e391]:
                  - img [ref=e393]
                  - generic [ref=e395]:
                    - generic [ref=e396]:
                      - generic [ref=e397]: fixture-tg-app
                      - generic "Current graph data" [ref=e398]
                    - generic [ref=e400]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e401]:
                      - generic [ref=e402]: 0 in · 2 out
                      - generic [ref=e403]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e406]:
              - button "fixture-tg-web Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e407]:
                - generic [ref=e408]:
                  - img [ref=e410]
                  - generic [ref=e412]:
                    - generic [ref=e413]:
                      - generic [ref=e414]: fixture-tg-web
                      - generic "Current graph data" [ref=e415]
                    - generic [ref=e417]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e418]:
                      - generic [ref=e419]: 0 in · 2 out
                      - generic [ref=e420]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e423]:
              - button "fixture-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e424]:
                - generic [ref=e425]:
                  - img [ref=e427]
                  - generic [ref=e429]:
                    - generic [ref=e430]:
                      - generic [ref=e431]: fixture-weekly
                      - generic "Current graph data" [ref=e432]
                    - generic [ref=e434]: EventBridge · eu-west-1 · regional
                    - generic [ref=e435]:
                      - generic [ref=e436]: 0 in · 2 out
                      - generic [ref=e437]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e440]:
              - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e441]:
                - generic [ref=e442]:
                  - img [ref=e444]
                  - generic [ref=e446]:
                    - generic [ref=e447]:
                      - generic [ref=e448]: SafeRemediate-CreateCheckpoint
                      - generic "Current graph data" [ref=e449]
                    - generic [ref=e451]: Lambda · eu-west-1 · regional
                    - generic [ref=e452]:
                      - generic [ref=e453]: 2 in · 0 out
                      - generic [ref=e454]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e457]:
              - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e458]:
                - generic [ref=e459]:
                  - img [ref=e461]
                  - generic [ref=e463]:
                    - generic [ref=e464]:
                      - generic [ref=e465]: SafeRemediate-PrismaWebhook
                      - generic "Current graph data" [ref=e466]
                    - generic [ref=e468]: Lambda · eu-west-1 · regional
                    - generic [ref=e469]:
                      - generic [ref=e470]: 2 in · 0 out
                      - generic [ref=e471]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e474]:
              - button "fixture-aurora Current graph data RDS · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e475]:
                - generic [ref=e476]:
                  - img [ref=e478]
                  - generic [ref=e480]:
                    - generic [ref=e481]:
                      - generic [ref=e482]: fixture-aurora
                      - generic "Current graph data" [ref=e483]
                    - generic [ref=e485]: RDS · eu-west-1 · VPC
                    - generic [ref=e486]:
                      - generic [ref=e487]: 0 in · 1 out
                      - generic [ref=e488]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e491]:
              - button "fixture-graph Current graph data Neptune · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e492]:
                - generic [ref=e493]:
                  - img [ref=e495]
                  - generic [ref=e497]:
                    - generic [ref=e498]:
                      - generic [ref=e499]: fixture-graph
                      - generic "Current graph data" [ref=e500]
                    - generic [ref=e502]: Neptune · eu-west-1 · VPC
                    - generic [ref=e503]:
                      - generic [ref=e504]: 0 in · 1 out
                      - generic [ref=e505]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e508]:
              - button "fixture-neptune-1 Current graph data Neptune · eu-west-1a · data 1 in · 0 out No runtime timestamp" [ref=e509]:
                - generic [ref=e510]:
                  - img [ref=e512]
                  - generic [ref=e514]:
                    - generic [ref=e515]:
                      - generic [ref=e516]: fixture-neptune-1
                      - generic "Current graph data" [ref=e517]
                    - generic [ref=e519]: Neptune · eu-west-1a · data
                    - generic [ref=e520]:
                      - generic [ref=e521]: 1 in · 0 out
                      - generic [ref=e522]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e525]:
              - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e526]:
                - generic [ref=e527]:
                  - img [ref=e529]
                  - generic [ref=e532]:
                    - generic [ref=e533]:
                      - generic [ref=e534]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                      - generic "Current graph data" [ref=e535]
                    - generic [ref=e537]: S3 · eu-west-1 · regional
                    - generic [ref=e538]:
                      - generic [ref=e539]: 0 in · 0 out
                      - generic [ref=e540]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e543]:
              - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e544]:
                - generic [ref=e545]:
                  - img [ref=e547]
                  - generic [ref=e550]:
                    - generic [ref=e551]:
                      - generic [ref=e552]: cyntro-demo-analytics-745783559495
                      - generic "Current graph data" [ref=e553]
                    - generic [ref=e555]: S3 · eu-west-1 · regional
                    - generic [ref=e556]:
                      - generic [ref=e557]: 0 in · 0 out
                      - generic [ref=e558]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e561]:
              - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e562]:
                - generic [ref=e563]:
                  - img [ref=e565]
                  - generic [ref=e568]:
                    - generic [ref=e569]:
                      - generic [ref=e570]: cyntro-demo-eu
                      - generic "Current graph data" [ref=e571]
                    - generic [ref=e573]: S3 · eu-west-1 · regional
                    - generic [ref=e574]:
                      - generic [ref=e575]: 0 in · 0 out
                      - generic [ref=e576]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e579]:
              - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e580]:
                - generic [ref=e581]:
                  - img [ref=e583]
                  - generic [ref=e586]:
                    - generic [ref=e587]:
                      - generic [ref=e588]: cyntro-demo-prod-data-745783559495
                      - generic "Current graph data" [ref=e589]
                    - generic [ref=e591]: S3 · eu-west-1 · regional
                    - generic [ref=e592]:
                      - generic [ref=e593]: 0 in · 0 out
                      - generic [ref=e594]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e597]:
              - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e598]:
                - generic [ref=e599]:
                  - img [ref=e601]
                  - generic [ref=e604]:
                    - generic [ref=e605]:
                      - generic [ref=e606]: cyntronewtestbucket
                      - generic "Current graph data" [ref=e607]
                    - generic [ref=e609]: S3 · eu-west-1 · regional
                    - generic [ref=e610]:
                      - generic [ref=e611]: 0 in · 0 out
                      - generic [ref=e612]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e615]:
              - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e616]:
                - generic [ref=e617]:
                  - img [ref=e619]
                  - generic [ref=e622]:
                    - generic [ref=e623]:
                      - generic [ref=e624]: cyntrotest2
                      - generic "Current graph data" [ref=e625]
                    - generic [ref=e627]: S3 · eu-west-1 · regional
                    - generic [ref=e628]:
                      - generic [ref=e629]: 0 in · 0 out
                      - generic [ref=e630]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e633]:
              - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e634]:
                - generic [ref=e635]:
                  - img [ref=e637]
                  - generic [ref=e640]:
                    - generic [ref=e641]:
                      - generic [ref=e642]: impaciq-findings
                      - generic "Current graph data" [ref=e643]
                    - generic [ref=e645]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e646]:
                      - generic [ref=e647]: 0 in · 0 out
                      - generic [ref=e648]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e651]:
              - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e652]:
                - generic [ref=e653]:
                  - img [ref=e655]
                  - generic [ref=e658]:
                    - generic [ref=e659]:
                      - generic [ref=e660]: impaciq-remediation-history
                      - generic "Current graph data" [ref=e661]
                    - generic [ref=e663]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e664]:
                      - generic [ref=e665]: 0 in · 0 out
                      - generic [ref=e666]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e669]:
              - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e670]:
                - generic [ref=e671]:
                  - img [ref=e673]
                  - generic [ref=e676]:
                    - generic [ref=e677]:
                      - generic [ref=e678]: impaciq-scan-status
                      - generic "Current graph data" [ref=e679]
                    - generic [ref=e681]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e682]:
                      - generic [ref=e683]: 0 in · 0 out
                      - generic [ref=e684]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e687]:
              - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e688]:
                - generic [ref=e689]:
                  - img [ref=e691]
                  - generic [ref=e694]:
                    - generic [ref=e695]:
                      - generic [ref=e696]: least_privilege_role_state
                      - generic "Current graph data" [ref=e697]
                    - generic [ref=e699]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e700]:
                      - generic [ref=e701]: 0 in · 0 out
                      - generic [ref=e702]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e705]:
              - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e706]:
                - generic [ref=e707]:
                  - img [ref=e709]
                  - generic [ref=e712]:
                    - generic [ref=e713]:
                      - generic [ref=e714]: saferemediate-access-logs-745783559495
                      - generic "Current graph data" [ref=e715]
                    - generic [ref=e717]: S3 · eu-west-1 · regional
                    - generic [ref=e718]:
                      - generic [ref=e719]: 0 in · 0 out
                      - generic [ref=e720]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e723]:
              - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e724]:
                - generic [ref=e725]:
                  - img [ref=e727]
                  - generic [ref=e730]:
                    - generic [ref=e731]:
                      - generic [ref=e732]: saferemediate-demo-cloudtrail-745783559495
                      - generic "Current graph data" [ref=e733]
                    - generic [ref=e735]: S3 · eu-west-1 · regional
                    - generic [ref=e736]:
                      - generic [ref=e737]: 0 in · 0 out
                      - generic [ref=e738]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e741]:
              - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e742]:
                - generic [ref=e743]:
                  - img [ref=e745]
                  - generic [ref=e748]:
                    - generic [ref=e749]:
                      - generic [ref=e750]: SafeRemediate-Executions
                      - generic "Current graph data" [ref=e751]
                    - generic [ref=e753]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e754]:
                      - generic [ref=e755]: 0 in · 0 out
                      - generic [ref=e756]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e759]:
              - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e760]:
                - generic [ref=e761]:
                  - img [ref=e763]
                  - generic [ref=e766]:
                    - generic [ref=e767]:
                      - generic [ref=e768]: SafeRemediate-Findings
                      - generic "Current graph data" [ref=e769]
                    - generic [ref=e771]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e772]:
                      - generic [ref=e773]: 0 in · 0 out
                      - generic [ref=e774]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e777]:
              - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e778]:
                - generic [ref=e779]:
                  - img [ref=e781]
                  - generic [ref=e784]:
                    - generic [ref=e785]:
                      - generic [ref=e786]: saferemediate-logs-745783559495
                      - generic "Current graph data" [ref=e787]
                    - generic [ref=e789]: S3 · eu-west-1 · regional
                    - generic [ref=e790]:
                      - generic [ref=e791]: 0 in · 0 out
                      - generic [ref=e792]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e795]:
              - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e796]:
                - generic [ref=e797]:
                  - img [ref=e799]
                  - generic [ref=e802]:
                    - generic [ref=e803]:
                      - generic [ref=e804]: SafeRemediate-Simulations
                      - generic "Current graph data" [ref=e805]
                    - generic [ref=e807]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e808]:
                      - generic [ref=e809]: 0 in · 0 out
                      - generic [ref=e810]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e813]:
              - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e814]:
                - generic [ref=e815]:
                  - img [ref=e817]
                  - generic [ref=e820]:
                    - generic [ref=e821]:
                      - generic [ref=e822]: sg_state
                      - generic "Current graph data" [ref=e823]
                    - generic [ref=e825]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e826]:
                      - generic [ref=e827]: 0 in · 0 out
                      - generic [ref=e828]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e831]:
      - text: Live read from
      - generic [ref=e832]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
    - dialog "Topology map full screen" [ref=e833]:
      - generic [ref=e834]:
        - generic [ref=e835]:
          - generic [ref=e836]: Cloud topology
          - generic [ref=e837]: alon-prod
        - button "Scope" [ref=e838]:
          - img [ref=e839]
          - text: Scope
        - group "Map density" [ref=e840]:
          - button "Glance" [ref=e841]
          - button "Inventory" [ref=e842]
        - generic [ref=e843]:
          - button "100%" [ref=e844]:
            - img [ref=e845]
            - text: 100%
          - button "Zoom out" [ref=e850]:
            - img [ref=e851]
          - generic "Zoom relative to fit — 100% = map fills page width" [ref=e854]: 100%
          - button "Zoom in" [ref=e855]:
            - img [ref=e856]
        - button "Exit map fullscreen" [ref=e859]:
          - img [ref=e860]
          - text: Exit
      - generic [ref=e868]:
        - generic [ref=e869]:
          - generic [ref=e870]:
            - generic [ref=e871]: Platform map
            - generic [ref=e872]: 1 VPC · 2 AZ · 6 subnets · 41 resources
          - generic [ref=e873]:
            - generic [ref=e874]: Map lens
            - generic [ref=e875]:
              - button "Architecture" [ref=e876]:
                - img [ref=e877]
                - text: Architecture
              - button "Dependencies" [pressed] [ref=e887]:
                - img [ref=e888]
                - text: Dependencies
              - button "Attack paths" [ref=e892]:
                - img [ref=e893]
                - text: Attack paths
        - generic "Dependency line colors" [ref=e895]:
          - generic [ref=e896]: Flow colors
          - generic [ref=e897]:
            - img [ref=e898]
            - generic [ref=e900]: Service call
          - generic [ref=e901]:
            - img [ref=e902]
            - generic [ref=e904]: AWS data service
          - generic [ref=e905]:
            - img [ref=e906]
            - generic [ref=e908]: VPC endpoint
          - generic [ref=e909]:
            - img [ref=e910]
            - generic [ref=e912]: Internet egress
          - generic [ref=e913]:
            - img [ref=e914]
            - generic [ref=e916]: Database
          - generic [ref=e917]:
            - img [ref=e918]
            - generic [ref=e920]: Exposure / attack
          - generic [ref=e921]: Moving = authoritative observed
          - generic [ref=e925]:
            - img [ref=e926]
            - text: Outlined motion = historical direction
          - generic [ref=e929]:
            - img [ref=e930]
            - text: Solid = configured
          - generic [ref=e931]:
            - img [ref=e932]
            - text: Dashed = inferred / unverified
        - generic [ref=e933]:
          - generic [ref=e934]: Confirmed TCP paths
          - generic [ref=e935]: Confirmed TCP segments are authoritative; a missing segment is not evidence of no traffic.
        - generic [ref=e937]:
          - generic [ref=e938]: Flow-log coverage
          - generic [ref=e939]: Partly covered
          - generic [ref=e940]: 12 of 12 eligible endpoints covered · 6 unknown · 18 not applicable · generation 7
          - button "Coverage details (2)" [ref=e941]
        - generic [ref=e942]:
          - generic [ref=e943]:
            - img [ref=e945]
            - generic [ref=e950]:
              - generic [ref=e951]: Users
              - generic [ref=e952]: Clients & operators
          - generic [ref=e954]:
            - img [ref=e956]
            - generic [ref=e961]:
              - generic [ref=e962]: Internet
              - generic [ref=e963]: Public path via IGW · alon-prod-igw
          - generic [ref=e964]:
            - generic [ref=e965]:
              - generic [ref=e966]: 9 workloads
              - generic [ref=e969]: ▸
              - generic [ref=e970]:
                - generic "NAT nat-fixture0a1b2c3d4" [ref=e971]:
                  - text: NAT
                  - generic [ref=e972]: nat-fixture0a1b2c3d4
                - generic [ref=e975]: ▸
              - generic [ref=e976]:
                - generic "IGW igw-03bb3f19b706abbc4" [ref=e977]:
                  - text: IGW
                  - generic [ref=e978]: igw-03bb3f19b706abbc4
                - generic [ref=e981]: ▸
            - button "External destinations 9 workloads · up to 2579 distinct · addresses sampled" [expanded] [ref=e982]:
              - img [ref=e984]
              - generic [ref=e989]:
                - generic [ref=e990]: External destinations
                - generic [ref=e991]: 9 workloads · up to 2579 distinct · addresses sampled
        - generic [ref=e992]:
          - generic [ref=e993]: ☁ AWS Cloud · acct 745783559495
          - generic [ref=e994]:
            - generic [ref=e995]: Region · eu-west-1
            - generic [ref=e996]:
              - generic [ref=e998]:
                - generic [ref=e999]:
                  - generic "vpc-0329e985173bed24f" [ref=e1000]: VPC · vpc-0329e985173bed24f
                  - generic "3 of 5 workloads in this VPC drop the shared prefix \"SafeRemediate-Test-\" from their chip label — every tooltip still carries the full name" [ref=e1001]: SafeRemediate-Test-… ×3
                - generic [ref=e1007]:
                  - generic "eu-west-1a" [ref=e1008]
                  - generic "eu-west-1b" [ref=e1009]
                - generic [ref=e1010]:
                  - generic [ref=e1011]: WEB TIER
                  - generic [ref=e1013]:
                    - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-1 · 10.0.1.0/24 · Owner: alon-prod" [ref=e1014]':
                      - generic [ref=e1015]:
                        - generic [ref=e1016]: Public · SafeRemediate-Test-Public-1
                        - generic [ref=e1017]: 10.0.1.0/24
                      - button "high posture score …Frontend-1" [ref=e1019]:
                        - generic "high posture score" [ref=e1020]
                        - generic [ref=e1023]: …Frontend-1
                    - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-2 · 10.0.2.0/24 · Owner: alon-prod" [ref=e1024]':
                      - generic [ref=e1025]:
                        - generic [ref=e1026]: Public · SafeRemediate-Test-Public-2
                        - generic [ref=e1027]: 10.0.2.0/24
                      - button "high posture score …Frontend-2" [ref=e1029]:
                        - generic "high posture score" [ref=e1030]
                        - generic [ref=e1033]: …Frontend-2
                - generic [ref=e1034]:
                  - generic [ref=e1035]: APPLICATION TIER
                  - generic [ref=e1037]:
                    - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-1 · 10.0.10.0/24 · Owner: alon-prod" [ref=e1038]':
                      - generic [ref=e1039]:
                        - generic [ref=e1040]: Private · SafeRemediate-Test-Private-App-1
                        - generic [ref=e1041]: 10.0.10.0/24
                      - generic [ref=e1042]: No workloads
                    - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-2 · 10.0.11.0/24 · Owner: alon-prod" [ref=e1043]':
                      - generic [ref=e1044]:
                        - generic [ref=e1045]: Private · SafeRemediate-Test-Private-App-2
                        - generic [ref=e1046]: 10.0.11.0/24
                      - button "quiet posture score …App-2" [ref=e1048]:
                        - generic "quiet posture score" [ref=e1049]
                        - generic [ref=e1052]: …App-2
                - generic [ref=e1053]:
                  - generic [ref=e1054]: DATABASE TIER
                  - generic [ref=e1056]:
                    - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-1 · 10.0.20.0/24 · Owner: alon-prod" [ref=e1057]':
                      - generic [ref=e1058]:
                        - generic [ref=e1059]: Data · SafeRemediate-Test-Private-DB-1
                        - generic [ref=e1060]: 10.0.20.0/24
                      - generic [ref=e1061]:
                        - button "quiet posture score saferemediate-test-db" [ref=e1062]:
                          - generic "quiet posture score" [ref=e1063]
                          - generic [ref=e1066]: saferemediate-test-db
                        - button "Posture not scored fixture-neptune-1" [ref=e1067]:
                          - generic "Posture not scored" [ref=e1068]
                          - generic [ref=e1071]: fixture-neptune-1
                    - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-2 · 10.0.21.0/24 · Owner: alon-prod" [ref=e1072]':
                      - generic [ref=e1073]:
                        - generic [ref=e1074]: Data · SafeRemediate-Test-Private-DB-2
                        - generic [ref=e1075]: 10.0.21.0/24
                      - generic [ref=e1076]: No workloads
              - generic [ref=e1077]:
                - generic [ref=e1078]: VPC boundary
                - generic [ref=e1079]:
                  - generic [ref=e1080]: ↑ Internet
                  - generic [ref=e1081]:
                    - button "IGW alon-prod-igw" [ref=e1082]:
                      - img [ref=e1084]
                      - generic [ref=e1087]: IGW
                      - generic [ref=e1088]: alon-prod-igw
                    - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e1089]: "egress: 9 workloads"
                - generic [ref=e1091]:
                  - generic [ref=e1092]: Endpoints (4)
                  - generic [ref=e1093]:
                    - button "VPCE IF EC2 Messages" [ref=e1094]:
                      - img [ref=e1096]
                      - generic [ref=e1100]: VPCE
                      - generic [ref=e1101]: IF
                      - generic [ref=e1102]: EC2 Messages
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e1103]: "use: not observed"
                  - generic [ref=e1104]:
                    - button "VPCE GW Amazon S3" [ref=e1105]:
                      - img [ref=e1107]
                      - generic [ref=e1111]: VPCE
                      - generic [ref=e1112]: GW
                      - generic [ref=e1113]: Amazon S3
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e1114]: "use: not observed"
                  - generic [ref=e1115]:
                    - button "VPCE IF AWS Systems Manager" [ref=e1116]:
                      - img [ref=e1118]
                      - generic [ref=e1122]: VPCE
                      - generic [ref=e1123]: IF
                      - generic [ref=e1124]: AWS Systems Manager
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e1125]: "use: 3 workloads"
                  - generic [ref=e1126]:
                    - button "VPCE IF SSM Messages" [ref=e1127]:
                      - img [ref=e1129]
                      - generic [ref=e1133]: VPCE
                      - generic [ref=e1134]: IF
                      - generic [ref=e1135]: SSM Messages
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e1136]: "use: 1 workload"
              - generic [ref=e1137]:
                - generic [ref=e1139]: Not in this VPC
                - generic "Application Load Balancer · alon-prod-3tier-alb Runs in vpc-086bcc2186fa42c96, not the VPC drawn here — so it gets no chip on this canvas. That VPC's subnets are tagged for \"payment-production\". Switch to All VPCs · Compare to see it in its own VPC." [ref=e1141]:
                  - generic [ref=e1142]: ALB · alon-prod-3tier-alb
                  - generic [ref=e1143]: VPC vpc-086bcc2186…
                  - generic [ref=e1144]: · payment-production
              - generic [ref=e1146]:
                - generic [ref=e1147]:
                  - generic [ref=e1148]:
                    - generic [ref=e1149]: Lambda runtime (6)
                    - generic [ref=e1150]:
                      - text: outside subnet grid · 6 attachment unverified
                      - generic "4 of 12 chips omit this shared prefix" [ref=e1151]: · SafeRemediate-… ×4
                    - button "S3 traffic from 4 of 6 functions" [ref=e1153]
                  - generic [ref=e1154]:
                    - generic [ref=e1155]: Triggers (6)
                    - generic [ref=e1156]:
                      - button "Posture not scored fixture-frequent" [ref=e1157]:
                        - generic "Posture not scored" [ref=e1158]
                        - generic [ref=e1162]: fixture-frequent
                      - button "Posture not scored fixture-every_6h" [ref=e1163]:
                        - generic "Posture not scored" [ref=e1164]
                        - generic [ref=e1168]: fixture-every_6h
                      - button "Posture not scored fixture-daily" [ref=e1169]:
                        - generic "Posture not scored" [ref=e1170]
                        - generic [ref=e1174]: fixture-daily
                      - button "Posture not scored fixture-nightly_burst" [ref=e1175]:
                        - generic "Posture not scored" [ref=e1176]
                        - generic [ref=e1180]: fixture-nightly_burst
                      - button "Posture not scored fixture-weekly" [ref=e1181]:
                        - generic "Posture not scored" [ref=e1182]
                        - generic [ref=e1186]: fixture-weekly
                      - button "Posture not scored fixture-monthly" [ref=e1187]:
                        - generic "Posture not scored" [ref=e1188]
                        - generic [ref=e1192]: fixture-monthly
                  - generic [ref=e1194]:
                    - button "quiet posture score AlonIAMTest-traffic-generator" [ref=e1195]:
                      - generic "quiet posture score" [ref=e1196]
                      - generic [ref=e1200]: AlonIAMTest-traffic-generator
                    - button "quiet posture score PaymentTrafficGenerator" [ref=e1201]:
                      - generic "quiet posture score" [ref=e1202]
                      - generic [ref=e1206]: PaymentTrafficGenerator
                    - button "quiet posture score …BehaviorAnalyzer" [ref=e1207]:
                      - generic "quiet posture score" [ref=e1208]
                      - generic [ref=e1212]: …BehaviorAnalyzer
                    - button "quiet posture score …ConfidenceScorer" [ref=e1213]:
                      - generic "quiet posture score" [ref=e1214]
                      - generic [ref=e1218]: …ConfidenceScorer
                    - button "quiet posture score …CreateCheckpoint" [ref=e1219]:
                      - generic "quiet posture score" [ref=e1220]
                      - generic [ref=e1224]: …CreateCheckpoint
                    - button "quiet posture score …PrismaWebhook" [ref=e1225]:
                      - generic "quiet posture score" [ref=e1226]
                      - generic [ref=e1230]: …PrismaWebhook
                  - button "+3 more ↓" [ref=e1231]
                - generic [ref=e1233]:
                  - generic [ref=e1234]:
                    - text: Regional · S3 / DDB (18)
                    - generic "3 of 18 chips omit this shared prefix" [ref=e1235]: SafeRemediate-… ×3
                  - generic [ref=e1237]:
                    - button "quiet posture score alon-demo-data-bucket-745783559495 4 fn · service-plane access" [ref=e1238]:
                      - generic "quiet posture score" [ref=e1239]
                      - generic [ref=e1242]:
                        - generic [ref=e1243]: alon-demo-data-bucket-745783559495
                        - generic "4 fn · service-plane access" [ref=e1244]
                    - button "S3×9" [ref=e1245]:
                      - generic [ref=e1249]:
                        - text: S3
                        - generic [ref=e1250]: ×9
                    - button "DynamoDB×8" [ref=e1251]:
                      - generic [ref=e1255]:
                        - text: DynamoDB
                        - generic [ref=e1256]: ×8
            - button "Logical groups · members carry the placement (6) Show members" [ref=e1258]:
              - generic [ref=e1259]: Logical groups · members carry the placement (6)
              - generic [ref=e1260]: Show members
        - img:
          - generic:
            - generic:
              - generic: VPCE · 4 flows
          - generic:
            - generic:
              - generic: Egress · 3 flows
          - generic:
            - generic:
              - generic: RDS · 5432
          - generic:
            - generic:
              - generic: RDS · 3306
          - generic:
            - generic:
              - generic: RDS
          - generic:
            - generic:
              - generic: 3 flows
          - generic:
            - generic:
              - generic: 3 flows
          - generic:
            - generic:
              - generic: 2 flows
          - generic:
            - generic:
              - generic: MEMBER_OF_CLUSTER
          - generic:
            - generic:
              - generic: MEMBER_OF_CLUSTER
          - generic:
            - generic:
              - generic: TARGETS ×6
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
  - alert [ref=e1261]
  - dialog [active] [ref=e1263]:
    - paragraph [ref=e1264]: 9 workloads leaving the VPC
    - paragraph [ref=e1265]: "Route is configured (route tables): NAT nat-fixture0a1b2c3d4 → IGW igw-03bb3f19b706abbc4. Counts are observed. The payload names no destination identities, so these addresses are evidence, not an inventory of services."
    - list [ref=e1266]:
      - listitem [ref=e1267]:
        - text: i-0e9b891793b5b2dbd · 3 distinct · all 3 shown
        - generic [ref=e1268]: — 54.217.69.183, 54.217.245.46, 3.253.225.145
      - listitem [ref=e1269]:
        - text: i-0f51b8b7ad29a359b · 532 distinct · 5 of 532 shown
        - generic [ref=e1270]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1271]:
        - text: i-03c72e120ff96216c · 588 distinct · 5 of 588 shown
        - generic [ref=e1272]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1273]:
        - text: i-0aa725bf8ff4c2001 · 927 distinct · 5 of 927 shown
        - generic [ref=e1274]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1275]:
        - text: i-0d4186a6b477dcd55 · 20 distinct · 5 of 20 shown
        - generic [ref=e1276]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1277]:
        - text: i-009a28b5cab755850 · 20 distinct · 5 of 20 shown
        - generic [ref=e1278]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1279]:
        - text: i-0e4edb2adb28e4f16 · 23 distinct · 5 of 23 shown
        - generic [ref=e1280]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1281]:
        - text: i-02a0da7f8373e6c8f · 32 distinct · 5 of 32 shown
        - generic [ref=e1282]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1283]:
        - text: i-0ee29afa0048943e0 · 434 distinct · 5 of 434 shown
        - generic [ref=e1284]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
```

# Test source

```ts
  29  |  *      against it — the removed `z-index: 60` rule was inert;
  30  |  *    · the panel is portaled to the body, OUTSIDE the fullscreen layer, so
  31  |  *      the two are siblings in the root stacking context and the numbers
  32  |  *      alone decide; and
  33  |  *    · the number that matters is the wrapper's, not the content's.
  34  |  *
  35  |  *  The hit test is the assertion of record. An opaque panel painted under
  36  |  *  the map has opacity 1, an opaque background and correct geometry — every
  37  |  *  property except the one a reader actually experiences. Only
  38  |  *  `elementFromPoint` distinguishes "drawn" from "visible". */
  39  | const VIEWPORTS = [
  40  |   { name: "1600x900", width: 1600, height: 900 },
  41  |   { name: "1512x771", width: 1512, height: 771 },
  42  |   { name: "1366x768", width: 1366, height: 768 },
  43  |   { name: "1024x720", width: 1024, height: 720 },
  44  | ] as const
  45  | 
  46  | /** Everything needed to say WHY the panel is or is not on top, in one read.
  47  |  *
  48  |  *  Reported together on purpose: a bare "covered" tells you the panel lost
  49  |  *  without saying to what or by how much, and that costs a CI round trip to
  50  |  *  find out. `hit` names the element that won each probe. */
  51  | const STACKING_PROBE = `(() => {
  52  |   const el = document.querySelector('[data-testid="topology-external-destinations-details"]')
  53  |   if (!el) return null
  54  |   const wrapper = el.closest('[data-radix-popper-content-wrapper]')
  55  |   const fs = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
  56  |   const zOf = (n) => {
  57  |     if (!n) return null
  58  |     const v = getComputedStyle(n).zIndex
  59  |     return v === 'auto' ? null : Number(v)
  60  |   }
  61  |   let node = el
  62  |   let product = 1
  63  |   while (node && node !== document.documentElement) {
  64  |     product *= Number(getComputedStyle(node).opacity)
  65  |     node = node.parentElement
  66  |   }
  67  |   const r = el.getBoundingClientRect()
  68  |   const probes = [
  69  |     ['top', r.left + r.width * 0.5, r.top + 6],
  70  |     ['middle', r.left + r.width * 0.5, r.top + r.height * 0.5],
  71  |     ['bottom', r.left + r.width * 0.5, r.bottom - 6],
  72  |     ['left', r.left + 6, r.top + r.height * 0.5],
  73  |     ['right', r.right - 6, r.top + r.height * 0.5],
  74  |   ]
  75  |   const covered = []
  76  |   for (const [name, x, y] of probes) {
  77  |     const top = document.elementFromPoint(x, y)
  78  |     if (!top || !(el === top || el.contains(top))) {
  79  |       covered.push({
  80  |         probe: name,
  81  |         x: Math.round(x),
  82  |         y: Math.round(y),
  83  |         hit: top
  84  |           ? (top.getAttribute('data-testid') || top.tagName.toLowerCase() + '.' + String(top.className).slice(0, 48))
  85  |           : 'nothing',
  86  |       })
  87  |     }
  88  |   }
  89  |   return {
  90  |     hasWrapper: !!wrapper,
  91  |     wrapperZ: zOf(wrapper),
  92  |     contentZ: zOf(el),
  93  |     fullscreenZ: zOf(fs),
  94  |     // The panel is portaled to the body, so it is NOT a descendant of the
  95  |     // fullscreen layer. That is precisely why the z-indexes have to be
  96  |     // compared: if this were ever true, the layer would carry the panel with
  97  |     // it and the numbers would stop mattering.
  98  |     panelInsideFullscreen: !!(fs && wrapper && fs.contains(wrapper)),
  99  |     effectiveOpacity: product,
  100 |     rect: { x: r.left, y: r.top, w: r.width, h: r.height },
  101 |     covered,
  102 |   }
  103 | })()`
  104 | 
  105 | async function probe(page: Page) {
  106 |   return page.evaluate(STACKING_PROBE) as Promise<{
  107 |     hasWrapper: boolean
  108 |     wrapperZ: number | null
  109 |     contentZ: number | null
  110 |     fullscreenZ: number | null
  111 |     panelInsideFullscreen: boolean
  112 |     effectiveOpacity: number
  113 |     rect: { x: number; y: number; w: number; h: number }
  114 |     covered: Array<{ probe: string; x: number; y: number; hit: string }>
  115 |   } | null>
  116 | }
  117 | 
  118 | /** Settle on the same predicate the assertions use, so a screenshot can never
  119 |  *  capture a frame the measurements would have rejected. */
  120 | async function waitForSettledPanel(page: Page, where: string) {
  121 |   try {
  122 |     await page.waitForFunction(
  123 |       `(() => { const s = ${STACKING_PROBE}; return !!s && s.effectiveOpacity >= 0.999 && s.covered.length === 0 })()`,
  124 |       undefined,
  125 |       { timeout: 10_000 },
  126 |     )
  127 |   } catch {
  128 |     const state = await probe(page)
> 129 |     throw new Error(
      |           ^ Error: the panel never settled opaque and on top in fullscreen (1512x771 · measurement): {"hasWrapper":true,"wrapperZ":50,"contentZ":50,"fullscreenZ":200,"panelInsideFullscreen":false,"effectiveOpacity":1,"rect":{"x":944,"y":224,"w":460,"h":300},"covered":[{"probe":"top","x":1174,"y":230,"hit":"div.text-[11px] uppercase tracking-[0.14em] font-sem"},{"probe":"middle","x":1174,"y":374,"hit":"topology-interlane-corridor"},{"probe":"bottom","x":1174,"y":518,"hit":"topology-interlane-corridor"},{"probe":"left","x":950,"y":374,"hit":"topology-flow-corridor"},{"probe":"right","x":1398,"y":374,"hit":"topology-density-stack-tile"}]}
  130 |       `the panel never settled opaque and on top in fullscreen (${where}): ${JSON.stringify(state)}`,
  131 |     )
  132 |   }
  133 | }
  134 | 
  135 | for (const vp of VIEWPORTS) {
  136 |   test(`external-destinations panel is topmost inside map fullscreen at ${vp.name}`, async ({
  137 |     context,
  138 |     page,
  139 |   }) => {
  140 |     test.setTimeout(150_000)
  141 |     const groups = logicalGroupSnapshot()
  142 |     const triggers = triggerBundleSnapshot(groups.snapshot)
  143 |     const egress = externalEgressSnapshot(triggers.snapshot)
  144 |     await seedAuthCookie(context)
  145 |     await routeSnapshot(page, egress.snapshot)
  146 |     await page.setViewportSize({ width: vp.width, height: vp.height })
  147 |     await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  148 |     await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  149 |     await page.getByRole("tab", { name: "Network topology" }).click()
  150 | 
  151 |     // --- enter the real z-200 layer ----------------------------------------
  152 |     await page.getByTestId("topology-estate-map-enlarge").click()
  153 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  154 |     await expect(fullscreen).toBeVisible()
  155 | 
  156 |     // Anchor the test to the layer it is about. If the fullscreen z-index is
  157 |     // ever changed, this line says so directly instead of leaving a hit test
  158 |     // to fail somewhere further down with a confusing message.
  159 |     const fullscreenZ = await fullscreen.evaluate(el => getComputedStyle(el).zIndex)
  160 |     expect(fullscreenZ, "the fullscreen layer no longer carries z-index 200").toBe("200")
  161 | 
  162 |     // The trigger lives INSIDE that layer; the panel will not.
  163 |     const external = fullscreen.getByTestId("topology-external-destinations")
  164 |     await expect(external).toBeVisible()
  165 |     await expect(external).toHaveAttribute("data-open", "false")
  166 |     await expect(external).toHaveAttribute("data-leg-count", String(egress.legCount))
  167 |     await page.screenshot({
  168 |       path: `test-results/estate-fullscreen-default-${vp.name}.png`,
  169 |       fullPage: false,
  170 |     })
  171 | 
  172 |     // --- open it and measure the paint order -------------------------------
  173 |     await external.getByTestId("topology-external-destinations-toggle").click()
  174 |     await expect(external).toHaveAttribute("data-open", "true")
  175 |     const panel = page.getByTestId("topology-external-destinations-details")
  176 |     await expect(panel).toHaveCount(1)
  177 |     await expect(panel).toBeVisible()
  178 |     await waitForSettledPanel(page, `${vp.name} · measurement`)
  179 | 
  180 |     const s = await probe(page)
  181 |     expect(s, "the panel is measurable in fullscreen").not.toBeNull()
  182 |     expect(s!.hasWrapper, "Radix no longer wraps the content in a popper wrapper").toBe(true)
  183 |     expect(
  184 |       s!.panelInsideFullscreen,
  185 |       "the panel is portaled into the fullscreen layer now — the z-index comparison below no longer describes the real stacking",
  186 |     ).toBe(false)
  187 | 
  188 |     // The mechanism, asserted rather than trusted: the wrapper's order is the
  189 |     // CONTENT's order, copied inline. If Radix ever stops propagating it, the
  190 |     // wrapper falls back to `auto` and this fails with that fact named.
  191 |     expect(s!.contentZ, `the panel content carries no z-index at ${vp.name}`).not.toBeNull()
  192 |     expect(s!.wrapperZ, `the popper wrapper carries no z-index at ${vp.name}`).not.toBeNull()
  193 |     expect(
  194 |       s!.wrapperZ,
  195 |       `Radix did not copy the content's z-index onto the wrapper at ${vp.name} (content ${s!.contentZ}, wrapper ${s!.wrapperZ})`,
  196 |     ).toBe(s!.contentZ)
  197 | 
  198 |     // The invariant that makes it visible, stated as the comparison rather
  199 |     // than as a magic number, so it keeps holding if either layer moves.
  200 |     expect(s!.fullscreenZ, "the fullscreen layer is measurable").not.toBeNull()
  201 |     expect(
  202 |       s!.wrapperZ!,
  203 |       `the panel's wrapper (${s!.wrapperZ}) is not above the fullscreen layer (${s!.fullscreenZ}) at ${vp.name}`,
  204 |     ).toBeGreaterThan(s!.fullscreenZ!)
  205 | 
  206 |     // The assertion of record. Everything above can be right and the reader
  207 |     // still see the map: this is the one that matches what they experience.
  208 |     expect(
  209 |       s!.covered,
  210 |       `something paints over the panel inside fullscreen at ${vp.name} — an opaque panel under the map is invisible, not translucent: ${JSON.stringify(s!.covered)}`,
  211 |     ).toEqual([])
  212 |     expect(
  213 |       s!.effectiveOpacity,
  214 |       `panel's effective opacity is below 1 in fullscreen at ${vp.name}`,
  215 |     ).toBeGreaterThanOrEqual(0.999)
  216 | 
  217 |     // Contained and legible where it landed — fullscreen has its own chrome
  218 |     // and its own collision boundary, so the embedded measurement does not
  219 |     // carry over.
  220 |     expect(s!.rect.x, `panel off the left at ${vp.name}`).toBeGreaterThanOrEqual(-1)
  221 |     expect(s!.rect.y, `panel off the top at ${vp.name}`).toBeGreaterThanOrEqual(-1)
  222 |     expect(s!.rect.x + s!.rect.w, `panel off the right at ${vp.name}`).toBeLessThanOrEqual(vp.width + 1)
  223 |     expect(s!.rect.y + s!.rect.h, `panel off the bottom at ${vp.name}`).toBeLessThanOrEqual(
  224 |       vp.height + 1,
  225 |     )
  226 |     expect(s!.rect.w, `panel too narrow to read at ${vp.name}`).toBeGreaterThanOrEqual(260)
  227 |     await expect(panel.getByTestId("topology-external-destination-leg")).toHaveCount(egress.legCount)
  228 | 
  229 |     const legible = await panel.evaluate(p => {
```