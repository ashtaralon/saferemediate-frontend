# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-fullscreen-stacking-fixture.spec.ts >> external-destinations panel is topmost inside map fullscreen at 1024x720
- Location: tests/integration/topology-estate-fullscreen-stacking-fixture.spec.ts:136:7

# Error details

```
Error: the panel never settled opaque and on top in fullscreen (1024x720 · measurement): {"hasWrapper":true,"wrapperZ":50,"contentZ":50,"fullscreenZ":200,"panelInsideFullscreen":false,"effectiveOpacity":1,"rect":{"x":406,"y":286,"w":460,"h":300},"covered":[{"probe":"top","x":636,"y":292,"hit":"div.text-[11px] uppercase tracking-[0.14em] font-sem"},{"probe":"middle","x":636,"y":436,"hit":"div.text-[9px] uppercase tracking-[0.12em] font-semi"},{"probe":"bottom","x":636,"y":580,"hit":"div.flex flex-col gap-1 max-w-full"},{"probe":"left","x":412,"y":436,"hit":"topology-region-fill-grid"},{"probe":"right","x":860,"y":436,"hit":"topology-density-stack-tile"}]}
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
    - complementary [ref=e90]:
      - generic [ref=e91]:
        - generic [ref=e92]:
          - heading "Service index" [level=2] [ref=e93]
          - generic [ref=e94]: "41"
        - generic [ref=e95]:
          - img [ref=e96]
          - searchbox "Find service in topology" [ref=e99]
        - button "Filters" [ref=e102]:
          - img [ref=e103]
          - text: Filters
      - list [ref=e105]:
        - listitem [ref=e106]:
          - button "SafeRemediate-Test-Frontend-1 Current graph data EC2 · eu-west-1a · web 3 in · 4 out Jul 9, 11:04 AM" [ref=e107]:
            - generic [ref=e108]:
              - img [ref=e110]
              - generic [ref=e112]:
                - generic [ref=e113]:
                  - generic [ref=e114]: SafeRemediate-Test-Frontend-1
                  - generic "Current graph data" [ref=e115]
                - generic [ref=e117]: EC2 · eu-west-1a · web
                - generic [ref=e118]:
                  - generic [ref=e119]: 3 in · 4 out
                  - generic [ref=e120]:
                    - img [ref=e121]
                    - text: Jul 9, 11:04 AM
        - listitem [ref=e124]:
          - button "SafeRemediate-Test-App-2 Current graph data EC2 · eu-west-1b · app 3 in · 3 out Jul 9, 10:40 AM" [ref=e125]:
            - generic [ref=e126]:
              - img [ref=e128]
              - generic [ref=e130]:
                - generic [ref=e131]:
                  - generic [ref=e132]: SafeRemediate-Test-App-2
                  - generic "Current graph data" [ref=e133]
                - generic [ref=e135]: EC2 · eu-west-1b · app
                - generic [ref=e136]:
                  - generic [ref=e137]: 3 in · 3 out
                  - generic [ref=e138]:
                    - img [ref=e139]
                    - text: Jul 9, 10:40 AM
        - listitem [ref=e142]:
          - button "SafeRemediate-Test-Frontend-2 Current graph data EC2 · eu-west-1b · web 2 in · 3 out Jul 9, 11:04 AM" [ref=e143]:
            - generic [ref=e144]:
              - img [ref=e146]
              - generic [ref=e148]:
                - generic [ref=e149]:
                  - generic [ref=e150]: SafeRemediate-Test-Frontend-2
                  - generic "Current graph data" [ref=e151]
                - generic [ref=e153]: EC2 · eu-west-1b · web
                - generic [ref=e154]:
                  - generic [ref=e155]: 2 in · 3 out
                  - generic [ref=e156]:
                    - img [ref=e157]
                    - text: Jul 9, 11:04 AM
        - listitem [ref=e160]:
          - button "alon-demo-data-bucket-745783559495 Current graph data S3 · eu-west-1 · regional 4 in · 0 out Sep 12, 04:00 AM" [ref=e161]:
            - generic [ref=e162]:
              - img [ref=e164]
              - generic [ref=e166]:
                - generic [ref=e167]:
                  - generic [ref=e168]: alon-demo-data-bucket-745783559495
                  - generic "Current graph data" [ref=e169]
                - generic [ref=e171]: S3 · eu-west-1 · regional
                - generic [ref=e172]:
                  - generic [ref=e173]: 4 in · 0 out
                  - generic [ref=e174]:
                    - img [ref=e175]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e178]:
          - button "saferemediate-test-db Current graph data RDS · eu-west-1a · data 4 in · 0 out Jul 6, 03:05 PM" [ref=e179]:
            - generic [ref=e180]:
              - img [ref=e182]
              - generic [ref=e184]:
                - generic [ref=e185]:
                  - generic [ref=e186]: saferemediate-test-db
                  - generic "Current graph data" [ref=e187]
                - generic [ref=e189]: RDS · eu-west-1a · data
                - generic [ref=e190]:
                  - generic [ref=e191]: 4 in · 0 out
                  - generic [ref=e192]:
                    - img [ref=e193]
                    - text: Jul 6, 03:05 PM
        - listitem [ref=e196]:
          - button "AlonIAMTest-traffic-generator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e197]:
            - generic [ref=e198]:
              - img [ref=e200]
              - generic [ref=e202]:
                - generic [ref=e203]:
                  - generic [ref=e204]: AlonIAMTest-traffic-generator
                  - generic "Current graph data" [ref=e205]
                - generic [ref=e207]: Lambda · eu-west-1 · regional
                - generic [ref=e208]:
                  - generic [ref=e209]: 2 in · 1 out
                  - generic [ref=e210]:
                    - img [ref=e211]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e214]:
          - button "PaymentTrafficGenerator Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e215]:
            - generic [ref=e216]:
              - img [ref=e218]
              - generic [ref=e220]:
                - generic [ref=e221]:
                  - generic [ref=e222]: PaymentTrafficGenerator
                  - generic "Current graph data" [ref=e223]
                - generic [ref=e225]: Lambda · eu-west-1 · regional
                - generic [ref=e226]:
                  - generic [ref=e227]: 2 in · 1 out
                  - generic [ref=e228]:
                    - img [ref=e229]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e232]:
          - button "SafeRemediate-BehaviorAnalyzer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e233]:
            - generic [ref=e234]:
              - img [ref=e236]
              - generic [ref=e238]:
                - generic [ref=e239]:
                  - generic [ref=e240]: SafeRemediate-BehaviorAnalyzer
                  - generic "Current graph data" [ref=e241]
                - generic [ref=e243]: Lambda · eu-west-1 · regional
                - generic [ref=e244]:
                  - generic [ref=e245]: 2 in · 1 out
                  - generic [ref=e246]:
                    - img [ref=e247]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e250]:
          - button "SafeRemediate-ConfidenceScorer Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 12, 04:00 AM" [ref=e251]:
            - generic [ref=e252]:
              - img [ref=e254]
              - generic [ref=e256]:
                - generic [ref=e257]:
                  - generic [ref=e258]: SafeRemediate-ConfidenceScorer
                  - generic "Current graph data" [ref=e259]
                - generic [ref=e261]: Lambda · eu-west-1 · regional
                - generic [ref=e262]:
                  - generic [ref=e263]: 2 in · 1 out
                  - generic [ref=e264]:
                    - img [ref=e265]
                    - text: Sep 12, 04:00 AM
        - listitem [ref=e268]:
          - button "fixture-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e269]:
            - generic [ref=e270]:
              - img [ref=e272]
              - generic [ref=e274]:
                - generic [ref=e275]:
                  - generic [ref=e276]: fixture-asg-app
                  - generic "Current graph data" [ref=e277]
                - generic [ref=e279]: AutoScalingGroup · eu-west-1 · VPC
                - generic [ref=e280]:
                  - generic [ref=e281]: 0 in · 2 out
                  - generic [ref=e282]:
                    - img [ref=e283]
                    - text: No runtime timestamp
        - listitem [ref=e286]:
          - button "fixture-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e287]:
            - generic [ref=e288]:
              - img [ref=e290]
              - generic [ref=e292]:
                - generic [ref=e293]:
                  - generic [ref=e294]: fixture-asg-web
                  - generic "Current graph data" [ref=e295]
                - generic [ref=e297]: AutoScalingGroup · eu-west-1 · VPC
                - generic [ref=e298]:
                  - generic [ref=e299]: 0 in · 2 out
                  - generic [ref=e300]:
                    - img [ref=e301]
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
                    - img [ref=e319]
                    - text: No runtime timestamp
        - listitem [ref=e322]:
          - button "fixture-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e323]:
            - generic [ref=e324]:
              - img [ref=e326]
              - generic [ref=e328]:
                - generic [ref=e329]:
                  - generic [ref=e330]: fixture-every_6h
                  - generic "Current graph data" [ref=e331]
                - generic [ref=e333]: EventBridge · eu-west-1 · regional
                - generic [ref=e334]:
                  - generic [ref=e335]: 0 in · 2 out
                  - generic [ref=e336]:
                    - img [ref=e337]
                    - text: No runtime timestamp
        - listitem [ref=e340]:
          - button "fixture-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e341]:
            - generic [ref=e342]:
              - img [ref=e344]
              - generic [ref=e346]:
                - generic [ref=e347]:
                  - generic [ref=e348]: fixture-frequent
                  - generic "Current graph data" [ref=e349]
                - generic [ref=e351]: EventBridge · eu-west-1 · regional
                - generic [ref=e352]:
                  - generic [ref=e353]: 0 in · 2 out
                  - generic [ref=e354]:
                    - img [ref=e355]
                    - text: No runtime timestamp
        - listitem [ref=e358]:
          - button "fixture-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e359]:
            - generic [ref=e360]:
              - img [ref=e362]
              - generic [ref=e364]:
                - generic [ref=e365]:
                  - generic [ref=e366]: fixture-monthly
                  - generic "Current graph data" [ref=e367]
                - generic [ref=e369]: EventBridge · eu-west-1 · regional
                - generic [ref=e370]:
                  - generic [ref=e371]: 0 in · 2 out
                  - generic [ref=e372]:
                    - img [ref=e373]
                    - text: No runtime timestamp
        - listitem [ref=e376]:
          - button "fixture-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e377]:
            - generic [ref=e378]:
              - img [ref=e380]
              - generic [ref=e382]:
                - generic [ref=e383]:
                  - generic [ref=e384]: fixture-nightly_burst
                  - generic "Current graph data" [ref=e385]
                - generic [ref=e387]: EventBridge · eu-west-1 · regional
                - generic [ref=e388]:
                  - generic [ref=e389]: 0 in · 2 out
                  - generic [ref=e390]:
                    - img [ref=e391]
                    - text: No runtime timestamp
        - listitem [ref=e394]:
          - button "fixture-tg-app Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e395]:
            - generic [ref=e396]:
              - img [ref=e398]
              - generic [ref=e400]:
                - generic [ref=e401]:
                  - generic [ref=e402]: fixture-tg-app
                  - generic "Current graph data" [ref=e403]
                - generic [ref=e405]: TargetGroup · eu-west-1 · VPC
                - generic [ref=e406]:
                  - generic [ref=e407]: 0 in · 2 out
                  - generic [ref=e408]:
                    - img [ref=e409]
                    - text: No runtime timestamp
        - listitem [ref=e412]:
          - button "fixture-tg-web Current graph data TargetGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e413]:
            - generic [ref=e414]:
              - img [ref=e416]
              - generic [ref=e418]:
                - generic [ref=e419]:
                  - generic [ref=e420]: fixture-tg-web
                  - generic "Current graph data" [ref=e421]
                - generic [ref=e423]: TargetGroup · eu-west-1 · VPC
                - generic [ref=e424]:
                  - generic [ref=e425]: 0 in · 2 out
                  - generic [ref=e426]:
                    - img [ref=e427]
                    - text: No runtime timestamp
        - listitem [ref=e430]:
          - button "fixture-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e431]:
            - generic [ref=e432]:
              - img [ref=e434]
              - generic [ref=e436]:
                - generic [ref=e437]:
                  - generic [ref=e438]: fixture-weekly
                  - generic "Current graph data" [ref=e439]
                - generic [ref=e441]: EventBridge · eu-west-1 · regional
                - generic [ref=e442]:
                  - generic [ref=e443]: 0 in · 2 out
                  - generic [ref=e444]:
                    - img [ref=e445]
                    - text: No runtime timestamp
        - listitem [ref=e448]:
          - button "SafeRemediate-CreateCheckpoint Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e449]:
            - generic [ref=e450]:
              - img [ref=e452]
              - generic [ref=e454]:
                - generic [ref=e455]:
                  - generic [ref=e456]: SafeRemediate-CreateCheckpoint
                  - generic "Current graph data" [ref=e457]
                - generic [ref=e459]: Lambda · eu-west-1 · regional
                - generic [ref=e460]:
                  - generic [ref=e461]: 2 in · 0 out
                  - generic [ref=e462]:
                    - img [ref=e463]
                    - text: No runtime timestamp
        - listitem [ref=e466]:
          - button "SafeRemediate-PrismaWebhook Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e467]:
            - generic [ref=e468]:
              - img [ref=e470]
              - generic [ref=e472]:
                - generic [ref=e473]:
                  - generic [ref=e474]: SafeRemediate-PrismaWebhook
                  - generic "Current graph data" [ref=e475]
                - generic [ref=e477]: Lambda · eu-west-1 · regional
                - generic [ref=e478]:
                  - generic [ref=e479]: 2 in · 0 out
                  - generic [ref=e480]:
                    - img [ref=e481]
                    - text: No runtime timestamp
        - listitem [ref=e484]:
          - button "fixture-aurora Current graph data RDS · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e485]:
            - generic [ref=e486]:
              - img [ref=e488]
              - generic [ref=e490]:
                - generic [ref=e491]:
                  - generic [ref=e492]: fixture-aurora
                  - generic "Current graph data" [ref=e493]
                - generic [ref=e495]: RDS · eu-west-1 · VPC
                - generic [ref=e496]:
                  - generic [ref=e497]: 0 in · 1 out
                  - generic [ref=e498]:
                    - img [ref=e499]
                    - text: No runtime timestamp
        - listitem [ref=e502]:
          - button "fixture-graph Current graph data Neptune · eu-west-1 · VPC 0 in · 1 out No runtime timestamp" [ref=e503]:
            - generic [ref=e504]:
              - img [ref=e506]
              - generic [ref=e508]:
                - generic [ref=e509]:
                  - generic [ref=e510]: fixture-graph
                  - generic "Current graph data" [ref=e511]
                - generic [ref=e513]: Neptune · eu-west-1 · VPC
                - generic [ref=e514]:
                  - generic [ref=e515]: 0 in · 1 out
                  - generic [ref=e516]:
                    - img [ref=e517]
                    - text: No runtime timestamp
        - listitem [ref=e520]:
          - button "fixture-neptune-1 Current graph data Neptune · eu-west-1a · data 1 in · 0 out No runtime timestamp" [ref=e521]:
            - generic [ref=e522]:
              - img [ref=e524]
              - generic [ref=e526]:
                - generic [ref=e527]:
                  - generic [ref=e528]: fixture-neptune-1
                  - generic "Current graph data" [ref=e529]
                - generic [ref=e531]: Neptune · eu-west-1a · data
                - generic [ref=e532]:
                  - generic [ref=e533]: 1 in · 0 out
                  - generic [ref=e534]:
                    - img [ref=e535]
                    - text: No runtime timestamp
        - listitem [ref=e538]:
          - button "aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e539]:
            - generic [ref=e540]:
              - img [ref=e542]
              - generic [ref=e545]:
                - generic [ref=e546]:
                  - generic [ref=e547]: aws-sam-cli-managed-default-samclisourcebucket-zpixwbu9coth
                  - generic "Current graph data" [ref=e548]
                - generic [ref=e550]: S3 · eu-west-1 · regional
                - generic [ref=e551]:
                  - generic [ref=e552]: 0 in · 0 out
                  - generic [ref=e553]:
                    - img [ref=e554]
                    - text: No runtime timestamp
        - listitem [ref=e557]:
          - button "cyntro-demo-analytics-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e558]:
            - generic [ref=e559]:
              - img [ref=e561]
              - generic [ref=e564]:
                - generic [ref=e565]:
                  - generic [ref=e566]: cyntro-demo-analytics-745783559495
                  - generic "Current graph data" [ref=e567]
                - generic [ref=e569]: S3 · eu-west-1 · regional
                - generic [ref=e570]:
                  - generic [ref=e571]: 0 in · 0 out
                  - generic [ref=e572]:
                    - img [ref=e573]
                    - text: No runtime timestamp
        - listitem [ref=e576]:
          - button "cyntro-demo-eu Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e577]:
            - generic [ref=e578]:
              - img [ref=e580]
              - generic [ref=e583]:
                - generic [ref=e584]:
                  - generic [ref=e585]: cyntro-demo-eu
                  - generic "Current graph data" [ref=e586]
                - generic [ref=e588]: S3 · eu-west-1 · regional
                - generic [ref=e589]:
                  - generic [ref=e590]: 0 in · 0 out
                  - generic [ref=e591]:
                    - img [ref=e592]
                    - text: No runtime timestamp
        - listitem [ref=e595]:
          - button "cyntro-demo-prod-data-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e596]:
            - generic [ref=e597]:
              - img [ref=e599]
              - generic [ref=e602]:
                - generic [ref=e603]:
                  - generic [ref=e604]: cyntro-demo-prod-data-745783559495
                  - generic "Current graph data" [ref=e605]
                - generic [ref=e607]: S3 · eu-west-1 · regional
                - generic [ref=e608]:
                  - generic [ref=e609]: 0 in · 0 out
                  - generic [ref=e610]:
                    - img [ref=e611]
                    - text: No runtime timestamp
        - listitem [ref=e614]:
          - button "cyntronewtestbucket Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e615]:
            - generic [ref=e616]:
              - img [ref=e618]
              - generic [ref=e621]:
                - generic [ref=e622]:
                  - generic [ref=e623]: cyntronewtestbucket
                  - generic "Current graph data" [ref=e624]
                - generic [ref=e626]: S3 · eu-west-1 · regional
                - generic [ref=e627]:
                  - generic [ref=e628]: 0 in · 0 out
                  - generic [ref=e629]:
                    - img [ref=e630]
                    - text: No runtime timestamp
        - listitem [ref=e633]:
          - button "cyntrotest2 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e634]:
            - generic [ref=e635]:
              - img [ref=e637]
              - generic [ref=e640]:
                - generic [ref=e641]:
                  - generic [ref=e642]: cyntrotest2
                  - generic "Current graph data" [ref=e643]
                - generic [ref=e645]: S3 · eu-west-1 · regional
                - generic [ref=e646]:
                  - generic [ref=e647]: 0 in · 0 out
                  - generic [ref=e648]:
                    - img [ref=e649]
                    - text: No runtime timestamp
        - listitem [ref=e652]:
          - button "impaciq-findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e653]:
            - generic [ref=e654]:
              - img [ref=e656]
              - generic [ref=e659]:
                - generic [ref=e660]:
                  - generic [ref=e661]: impaciq-findings
                  - generic "Current graph data" [ref=e662]
                - generic [ref=e664]: DynamoDB · eu-west-1 · regional
                - generic [ref=e665]:
                  - generic [ref=e666]: 0 in · 0 out
                  - generic [ref=e667]:
                    - img [ref=e668]
                    - text: No runtime timestamp
        - listitem [ref=e671]:
          - button "impaciq-remediation-history Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e672]:
            - generic [ref=e673]:
              - img [ref=e675]
              - generic [ref=e678]:
                - generic [ref=e679]:
                  - generic [ref=e680]: impaciq-remediation-history
                  - generic "Current graph data" [ref=e681]
                - generic [ref=e683]: DynamoDB · eu-west-1 · regional
                - generic [ref=e684]:
                  - generic [ref=e685]: 0 in · 0 out
                  - generic [ref=e686]:
                    - img [ref=e687]
                    - text: No runtime timestamp
        - listitem [ref=e690]:
          - button "impaciq-scan-status Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e691]:
            - generic [ref=e692]:
              - img [ref=e694]
              - generic [ref=e697]:
                - generic [ref=e698]:
                  - generic [ref=e699]: impaciq-scan-status
                  - generic "Current graph data" [ref=e700]
                - generic [ref=e702]: DynamoDB · eu-west-1 · regional
                - generic [ref=e703]:
                  - generic [ref=e704]: 0 in · 0 out
                  - generic [ref=e705]:
                    - img [ref=e706]
                    - text: No runtime timestamp
        - listitem [ref=e709]:
          - button "least_privilege_role_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e710]:
            - generic [ref=e711]:
              - img [ref=e713]
              - generic [ref=e716]:
                - generic [ref=e717]:
                  - generic [ref=e718]: least_privilege_role_state
                  - generic "Current graph data" [ref=e719]
                - generic [ref=e721]: DynamoDB · eu-west-1 · regional
                - generic [ref=e722]:
                  - generic [ref=e723]: 0 in · 0 out
                  - generic [ref=e724]:
                    - img [ref=e725]
                    - text: No runtime timestamp
        - listitem [ref=e728]:
          - button "saferemediate-access-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e729]:
            - generic [ref=e730]:
              - img [ref=e732]
              - generic [ref=e735]:
                - generic [ref=e736]:
                  - generic [ref=e737]: saferemediate-access-logs-745783559495
                  - generic "Current graph data" [ref=e738]
                - generic [ref=e740]: S3 · eu-west-1 · regional
                - generic [ref=e741]:
                  - generic [ref=e742]: 0 in · 0 out
                  - generic [ref=e743]:
                    - img [ref=e744]
                    - text: No runtime timestamp
        - listitem [ref=e747]:
          - button "saferemediate-demo-cloudtrail-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e748]:
            - generic [ref=e749]:
              - img [ref=e751]
              - generic [ref=e754]:
                - generic [ref=e755]:
                  - generic [ref=e756]: saferemediate-demo-cloudtrail-745783559495
                  - generic "Current graph data" [ref=e757]
                - generic [ref=e759]: S3 · eu-west-1 · regional
                - generic [ref=e760]:
                  - generic [ref=e761]: 0 in · 0 out
                  - generic [ref=e762]:
                    - img [ref=e763]
                    - text: No runtime timestamp
        - listitem [ref=e766]:
          - button "SafeRemediate-Executions Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e767]:
            - generic [ref=e768]:
              - img [ref=e770]
              - generic [ref=e773]:
                - generic [ref=e774]:
                  - generic [ref=e775]: SafeRemediate-Executions
                  - generic "Current graph data" [ref=e776]
                - generic [ref=e778]: DynamoDB · eu-west-1 · regional
                - generic [ref=e779]:
                  - generic [ref=e780]: 0 in · 0 out
                  - generic [ref=e781]:
                    - img [ref=e782]
                    - text: No runtime timestamp
        - listitem [ref=e785]:
          - button "SafeRemediate-Findings Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e786]:
            - generic [ref=e787]:
              - img [ref=e789]
              - generic [ref=e792]:
                - generic [ref=e793]:
                  - generic [ref=e794]: SafeRemediate-Findings
                  - generic "Current graph data" [ref=e795]
                - generic [ref=e797]: DynamoDB · eu-west-1 · regional
                - generic [ref=e798]:
                  - generic [ref=e799]: 0 in · 0 out
                  - generic [ref=e800]:
                    - img [ref=e801]
                    - text: No runtime timestamp
        - listitem [ref=e804]:
          - button "saferemediate-logs-745783559495 Current graph data S3 · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e805]:
            - generic [ref=e806]:
              - img [ref=e808]
              - generic [ref=e811]:
                - generic [ref=e812]:
                  - generic [ref=e813]: saferemediate-logs-745783559495
                  - generic "Current graph data" [ref=e814]
                - generic [ref=e816]: S3 · eu-west-1 · regional
                - generic [ref=e817]:
                  - generic [ref=e818]: 0 in · 0 out
                  - generic [ref=e819]:
                    - img [ref=e820]
                    - text: No runtime timestamp
        - listitem [ref=e823]:
          - button "SafeRemediate-Simulations Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e824]:
            - generic [ref=e825]:
              - img [ref=e827]
              - generic [ref=e830]:
                - generic [ref=e831]:
                  - generic [ref=e832]: SafeRemediate-Simulations
                  - generic "Current graph data" [ref=e833]
                - generic [ref=e835]: DynamoDB · eu-west-1 · regional
                - generic [ref=e836]:
                  - generic [ref=e837]: 0 in · 0 out
                  - generic [ref=e838]:
                    - img [ref=e839]
                    - text: No runtime timestamp
        - listitem [ref=e842]:
          - button "sg_state Current graph data DynamoDB · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e843]:
            - generic [ref=e844]:
              - img [ref=e846]
              - generic [ref=e849]:
                - generic [ref=e850]:
                  - generic [ref=e851]: sg_state
                  - generic "Current graph data" [ref=e852]
                - generic [ref=e854]: DynamoDB · eu-west-1 · regional
                - generic [ref=e855]:
                  - generic [ref=e856]: 0 in · 0 out
                  - generic [ref=e857]:
                    - img [ref=e858]
                    - text: No runtime timestamp
    - contentinfo [ref=e861]:
      - text: Live read from
      - generic [ref=e862]: /api/topology-risk/alon-prod
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
    - dialog "Topology map full screen" [ref=e863]:
      - generic [ref=e864]:
        - generic [ref=e865]:
          - generic [ref=e866]: Cloud topology
          - generic [ref=e867]: alon-prod
        - button "Scope" [ref=e868]:
          - img [ref=e869]
          - text: Scope
        - group "Map density" [ref=e870]:
          - button "Glance" [ref=e871]
          - button "Inventory" [ref=e872]
        - generic [ref=e873]:
          - button "100%" [ref=e874]:
            - img [ref=e875]
            - text: 100%
          - button "Zoom out" [ref=e880]:
            - img [ref=e881]
          - generic "Zoom relative to fit — 100% = map fills page width" [ref=e884]: 100%
          - button "Zoom in" [ref=e885]:
            - img [ref=e886]
        - button "Exit map fullscreen" [ref=e889]:
          - img [ref=e890]
          - text: Exit
      - generic [ref=e898]:
        - generic [ref=e899]:
          - generic [ref=e900]:
            - generic [ref=e901]: Platform map
            - generic [ref=e902]: 1 VPC · 2 AZ · 6 subnets · 41 resources
          - generic [ref=e903]:
            - generic [ref=e904]: Map lens
            - generic [ref=e905]:
              - button "Architecture" [ref=e906]:
                - img [ref=e907]
                - text: Architecture
              - button "Dependencies" [pressed] [ref=e917]:
                - img [ref=e918]
                - text: Dependencies
              - button "Attack paths" [ref=e922]:
                - img [ref=e923]
                - text: Attack paths
        - generic "Dependency line colors" [ref=e925]:
          - generic [ref=e926]: Flow colors
          - generic [ref=e927]:
            - img [ref=e928]
            - generic [ref=e930]: Service call
          - generic [ref=e931]:
            - img [ref=e932]
            - generic [ref=e934]: AWS data service
          - generic [ref=e935]:
            - img [ref=e936]
            - generic [ref=e938]: VPC endpoint
          - generic [ref=e939]:
            - img [ref=e940]
            - generic [ref=e942]: Internet egress
          - generic [ref=e943]:
            - img [ref=e944]
            - generic [ref=e946]: Database
          - generic [ref=e947]:
            - img [ref=e948]
            - generic [ref=e950]: Exposure / attack
          - generic [ref=e951]: Moving = authoritative observed
          - generic [ref=e955]:
            - img [ref=e956]
            - text: Outlined motion = historical direction
          - generic [ref=e959]:
            - img [ref=e960]
            - text: Solid = configured
          - generic [ref=e961]:
            - img [ref=e962]
            - text: Dashed = inferred / unverified
        - generic [ref=e963]:
          - generic [ref=e964]: Confirmed TCP paths
          - generic [ref=e965]: Confirmed TCP segments are authoritative; a missing segment is not evidence of no traffic.
        - generic [ref=e967]:
          - generic [ref=e968]: Flow-log coverage
          - generic [ref=e969]: Partly covered
          - generic [ref=e970]: 12 of 12 eligible endpoints covered · 6 unknown · 18 not applicable · generation 7
          - button "Coverage details (2)" [ref=e971]
        - generic [ref=e972]:
          - generic [ref=e973]:
            - img [ref=e975]
            - generic [ref=e980]:
              - generic [ref=e981]: Users
              - generic [ref=e982]: Clients & operators
          - generic [ref=e984]:
            - img [ref=e986]
            - generic [ref=e991]:
              - generic [ref=e992]: Internet
              - generic [ref=e993]: Public path via IGW · alon-prod-igw
          - generic [ref=e994]:
            - generic [ref=e995]:
              - generic [ref=e996]: 9 workloads
              - generic [ref=e999]: ▸
              - generic [ref=e1000]:
                - generic "NAT nat-fixture0a1b2c3d4" [ref=e1001]:
                  - text: NAT
                  - generic [ref=e1002]: nat-fixture0a1b2c3d4
                - generic [ref=e1005]: ▸
              - generic [ref=e1006]:
                - generic "IGW igw-03bb3f19b706abbc4" [ref=e1007]:
                  - text: IGW
                  - generic [ref=e1008]: igw-03bb3f19b706abbc4
                - generic [ref=e1011]: ▸
            - button "External destinations 9 workloads · up to 2579 distinct · addresses sampled" [expanded] [ref=e1012]:
              - img [ref=e1014]
              - generic [ref=e1019]:
                - generic [ref=e1020]: External destinations
                - generic [ref=e1021]: 9 workloads · up to 2579 distinct · addresses sampled
        - generic [ref=e1022]:
          - generic [ref=e1023]: ☁ AWS Cloud · acct 745783559495
          - generic [ref=e1024]:
            - generic [ref=e1025]: Region · eu-west-1
            - generic [ref=e1026]:
              - generic [ref=e1028]:
                - generic [ref=e1029]:
                  - generic "vpc-0329e985173bed24f" [ref=e1030]: VPC · vpc-0329e985173bed24f
                  - generic "3 of 5 workloads in this VPC drop the shared prefix \"SafeRemediate-Test-\" from their chip label — every tooltip still carries the full name" [ref=e1031]: SafeRemediate-Test-… ×3
                - generic [ref=e1037]:
                  - generic "eu-west-1a" [ref=e1038]
                  - generic "eu-west-1b" [ref=e1039]
                - generic [ref=e1040]:
                  - generic [ref=e1041]: WEB TIER
                  - generic [ref=e1043]:
                    - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-1 · 10.0.1.0/24 · Owner: alon-prod" [ref=e1044]':
                      - generic [ref=e1045]:
                        - generic [ref=e1046]: Public · SafeRemediate-Test-Public-1
                        - generic [ref=e1047]: 10.0.1.0/24
                      - button "high posture score …Frontend-1" [ref=e1049]:
                        - generic "high posture score" [ref=e1050]
                        - generic [ref=e1053]: …Frontend-1
                    - 'generic "Public subnet (web tier) · SafeRemediate-Test-Public-2 · 10.0.2.0/24 · Owner: alon-prod" [ref=e1054]':
                      - generic [ref=e1055]:
                        - generic [ref=e1056]: Public · SafeRemediate-Test-Public-2
                        - generic [ref=e1057]: 10.0.2.0/24
                      - button "high posture score …Frontend-2" [ref=e1059]:
                        - generic "high posture score" [ref=e1060]
                        - generic [ref=e1063]: …Frontend-2
                - generic [ref=e1064]:
                  - generic [ref=e1065]: APPLICATION TIER
                  - generic [ref=e1067]:
                    - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-1 · 10.0.10.0/24 · Owner: alon-prod" [ref=e1068]':
                      - generic [ref=e1069]:
                        - generic [ref=e1070]: Private · SafeRemediate-Test-Private-App-1
                        - generic [ref=e1071]: 10.0.10.0/24
                      - generic [ref=e1072]: No workloads
                    - 'generic "Private subnet (app tier) · SafeRemediate-Test-Private-App-2 · 10.0.11.0/24 · Owner: alon-prod" [ref=e1073]':
                      - generic [ref=e1074]:
                        - generic [ref=e1075]: Private · SafeRemediate-Test-Private-App-2
                        - generic [ref=e1076]: 10.0.11.0/24
                      - button "quiet posture score …App-2" [ref=e1078]:
                        - generic "quiet posture score" [ref=e1079]
                        - generic [ref=e1082]: …App-2
                - generic [ref=e1083]:
                  - generic [ref=e1084]: DATABASE TIER
                  - generic [ref=e1086]:
                    - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-1 · 10.0.20.0/24 · Owner: alon-prod" [ref=e1087]':
                      - generic [ref=e1088]:
                        - generic [ref=e1089]: Data · SafeRemediate-Test-Private-DB-1
                        - generic [ref=e1090]: 10.0.20.0/24
                      - generic [ref=e1091]:
                        - button "quiet posture score saferemediate-test-db" [ref=e1092]:
                          - generic "quiet posture score" [ref=e1093]
                          - generic [ref=e1096]: saferemediate-test-db
                        - button "Posture not scored fixture-neptune-1" [ref=e1097]:
                          - generic "Posture not scored" [ref=e1098]
                          - generic [ref=e1101]: fixture-neptune-1
                    - 'generic "Private subnet (data tier) · SafeRemediate-Test-Private-DB-2 · 10.0.21.0/24 · Owner: alon-prod" [ref=e1102]':
                      - generic [ref=e1103]:
                        - generic [ref=e1104]: Data · SafeRemediate-Test-Private-DB-2
                        - generic [ref=e1105]: 10.0.21.0/24
                      - generic [ref=e1106]: No workloads
              - generic [ref=e1107]:
                - generic [ref=e1108]: VPC boundary
                - generic [ref=e1109]:
                  - generic [ref=e1110]: ↑ Internet
                  - generic [ref=e1111]:
                    - button "IGW alon-prod-igw" [ref=e1112]:
                      - img [ref=e1114]
                      - generic [ref=e1117]: IGW
                      - generic [ref=e1118]: alon-prod-igw
                    - generic "Workloads whose egress routes through this gateway, counted from the payload's edges. Hiding lines does not change this count." [ref=e1119]: "egress: 9 workloads"
                - generic [ref=e1121]:
                  - generic [ref=e1122]: Endpoints (4)
                  - generic [ref=e1123]:
                    - button "VPCE IF EC2 Messages" [ref=e1124]:
                      - img [ref=e1126]
                      - generic [ref=e1130]: VPCE
                      - generic [ref=e1131]: IF
                      - generic [ref=e1132]: EC2 Messages
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e1133]: "use: not observed"
                  - generic [ref=e1134]:
                    - button "VPCE GW Amazon S3" [ref=e1135]:
                      - img [ref=e1137]
                      - generic [ref=e1141]: VPCE
                      - generic [ref=e1142]: GW
                      - generic [ref=e1143]: Amazon S3
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e1144]: "use: not observed"
                  - generic [ref=e1145]:
                    - button "VPCE IF AWS Systems Manager" [ref=e1146]:
                      - img [ref=e1148]
                      - generic [ref=e1152]: VPCE
                      - generic [ref=e1153]: IF
                      - generic [ref=e1154]: AWS Systems Manager
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e1155]: "use: 3 workloads"
                  - generic [ref=e1156]:
                    - button "VPCE IF SSM Messages" [ref=e1157]:
                      - img [ref=e1159]
                      - generic [ref=e1163]: VPCE
                      - generic [ref=e1164]: IF
                      - generic [ref=e1165]: SSM Messages
                    - generic "Workloads reaching this endpoint, counted from the payload's edges rather than a route table. Hiding lines does not change this count." [ref=e1166]: "use: 1 workload"
              - generic [ref=e1167]:
                - generic [ref=e1169]: Not in this VPC
                - generic "Application Load Balancer · alon-prod-3tier-alb Runs in vpc-086bcc2186fa42c96, not the VPC drawn here — so it gets no chip on this canvas. That VPC's subnets are tagged for \"payment-production\". Switch to All VPCs · Compare to see it in its own VPC." [ref=e1171]:
                  - generic [ref=e1172]: ALB · alon-prod-3tier-alb
                  - generic [ref=e1173]: VPC vpc-086bcc2186…
                  - generic [ref=e1174]: · payment-production
              - generic [ref=e1176]:
                - generic [ref=e1177]:
                  - generic [ref=e1178]:
                    - generic [ref=e1179]: Lambda runtime (6)
                    - generic [ref=e1180]:
                      - text: outside subnet grid · 6 attachment unverified
                      - generic "4 of 12 chips omit this shared prefix" [ref=e1181]: · SafeRemediate-… ×4
                    - button "S3 traffic from 4 of 6 functions" [ref=e1183]
                  - generic [ref=e1184]:
                    - generic [ref=e1185]: Triggers (6)
                    - generic [ref=e1186]:
                      - button "Posture not scored fixture-frequent" [ref=e1187]:
                        - generic "Posture not scored" [ref=e1188]
                        - generic [ref=e1192]: fixture-frequent
                      - button "Posture not scored fixture-every_6h" [ref=e1193]:
                        - generic "Posture not scored" [ref=e1194]
                        - generic [ref=e1198]: fixture-every_6h
                      - button "Posture not scored fixture-daily" [ref=e1199]:
                        - generic "Posture not scored" [ref=e1200]
                        - generic [ref=e1204]: fixture-daily
                      - button "Posture not scored fixture-nightly_burst" [ref=e1205]:
                        - generic "Posture not scored" [ref=e1206]
                        - generic [ref=e1210]: fixture-nightly_burst
                      - button "Posture not scored fixture-weekly" [ref=e1211]:
                        - generic "Posture not scored" [ref=e1212]
                        - generic [ref=e1216]: fixture-weekly
                      - button "Posture not scored fixture-monthly" [ref=e1217]:
                        - generic "Posture not scored" [ref=e1218]
                        - generic [ref=e1222]: fixture-monthly
                  - generic [ref=e1224]:
                    - button "quiet posture score AlonIAMTest-traffic-generator" [ref=e1225]:
                      - generic "quiet posture score" [ref=e1226]
                      - generic [ref=e1230]: AlonIAMTest-traffic-generator
                    - button "quiet posture score PaymentTrafficGenerator" [ref=e1231]:
                      - generic "quiet posture score" [ref=e1232]
                      - generic [ref=e1236]: PaymentTrafficGenerator
                    - button "quiet posture score …BehaviorAnalyzer" [ref=e1237]:
                      - generic "quiet posture score" [ref=e1238]
                      - generic [ref=e1242]: …BehaviorAnalyzer
                    - button "quiet posture score …ConfidenceScorer" [ref=e1243]:
                      - generic "quiet posture score" [ref=e1244]
                      - generic [ref=e1248]: …ConfidenceScorer
                    - button "quiet posture score …CreateCheckpoint" [ref=e1249]:
                      - generic "quiet posture score" [ref=e1250]
                      - generic [ref=e1254]: …CreateCheckpoint
                    - button "quiet posture score …PrismaWebhook" [ref=e1255]:
                      - generic "quiet posture score" [ref=e1256]
                      - generic [ref=e1260]: …PrismaWebhook
                  - button "+4 more ↓" [ref=e1261]
                - generic [ref=e1263]:
                  - generic [ref=e1264]:
                    - text: Regional · S3 / DDB (18)
                    - generic "3 of 18 chips omit this shared prefix" [ref=e1265]: SafeRemediate-… ×3
                  - generic [ref=e1267]:
                    - button "quiet posture score alon-demo-data-bucket-745783559495 4 fn · service-plane access" [ref=e1268]:
                      - generic "quiet posture score" [ref=e1269]
                      - generic [ref=e1272]:
                        - generic [ref=e1273]: alon-demo-data-bucket-745783559495
                        - generic "4 fn · service-plane access" [ref=e1274]
                    - button "S3×9" [ref=e1275]:
                      - generic [ref=e1279]:
                        - text: S3
                        - generic [ref=e1280]: ×9
                    - button "DynamoDB×8" [ref=e1281]:
                      - generic [ref=e1285]:
                        - text: DynamoDB
                        - generic [ref=e1286]: ×8
            - button "Logical groups · members carry the placement (6) Show members" [ref=e1288]:
              - generic [ref=e1289]: Logical groups · members carry the placement (6)
              - generic [ref=e1290]: Show members
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
  - alert [ref=e1291]
  - dialog [active] [ref=e1293]:
    - paragraph [ref=e1294]: 9 workloads leaving the VPC
    - paragraph [ref=e1295]: "Route is configured (route tables): NAT nat-fixture0a1b2c3d4 → IGW igw-03bb3f19b706abbc4. Counts are observed. The payload names no destination identities, so these addresses are evidence, not an inventory of services."
    - list [ref=e1296]:
      - listitem [ref=e1297]:
        - text: i-0e9b891793b5b2dbd · 3 distinct · all 3 shown
        - generic [ref=e1298]: — 54.217.69.183, 54.217.245.46, 3.253.225.145
      - listitem [ref=e1299]:
        - text: i-0f51b8b7ad29a359b · 532 distinct · 5 of 532 shown
        - generic [ref=e1300]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1301]:
        - text: i-03c72e120ff96216c · 588 distinct · 5 of 588 shown
        - generic [ref=e1302]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1303]:
        - text: i-0aa725bf8ff4c2001 · 927 distinct · 5 of 927 shown
        - generic [ref=e1304]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1305]:
        - text: i-0d4186a6b477dcd55 · 20 distinct · 5 of 20 shown
        - generic [ref=e1306]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1307]:
        - text: i-009a28b5cab755850 · 20 distinct · 5 of 20 shown
        - generic [ref=e1308]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1309]:
        - text: i-0e4edb2adb28e4f16 · 23 distinct · 5 of 23 shown
        - generic [ref=e1310]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1311]:
        - text: i-02a0da7f8373e6c8f · 32 distinct · 5 of 32 shown
        - generic [ref=e1312]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
      - listitem [ref=e1313]:
        - text: i-0ee29afa0048943e0 · 434 distinct · 5 of 434 shown
        - generic [ref=e1314]: — 3.5.73.1, 3.5.72.73, 3.5.72.119, 3.5.69.34, 3.5.67.254
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
      |           ^ Error: the panel never settled opaque and on top in fullscreen (1024x720 · measurement): {"hasWrapper":true,"wrapperZ":50,"contentZ":50,"fullscreenZ":200,"panelInsideFullscreen":false,"effectiveOpacity":1,"rect":{"x":406,"y":286,"w":460,"h":300},"covered":[{"probe":"top","x":636,"y":292,"hit":"div.text-[11px] uppercase tracking-[0.14em] font-sem"},{"probe":"middle","x":636,"y":436,"hit":"div.text-[9px] uppercase tracking-[0.12em] font-semi"},{"probe":"bottom","x":636,"y":580,"hit":"div.flex flex-col gap-1 max-w-full"},{"probe":"left","x":412,"y":436,"hit":"topology-region-fill-grid"},{"probe":"right","x":860,"y":436,"hit":"topology-density-stack-tile"}]}
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