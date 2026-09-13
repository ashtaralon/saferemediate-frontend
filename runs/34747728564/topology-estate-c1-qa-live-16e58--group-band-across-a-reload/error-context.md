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
    - locator resolved to <button type="button" aria-label="Open map fullscreen" data-testid="topology-estate-map-enlarge" class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide shadow-sm hover:bg-[#F8FAFC] transition-colors shrink-0">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="overflow-x-auto border-b pb-3 last:border-b-0">…</div> from <aside role="dialog" data-expanded="false" data-testid="topology-service-detail-panel" aria-label="Operations for igw-01b6c643a5c856abe" class="fixed inset-y-0 right-0 z-[220] flex w-full flex-col border-l shadow-2xl md:w-[720px]">…</aside> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div class="overflow-x-auto border-b pb-3 last:border-b-0">…</div> from <aside role="dialog" data-expanded="false" data-testid="topology-service-detail-panel" aria-label="Operations for igw-01b6c643a5c856abe" class="fixed inset-y-0 right-0 z-[220] flex w-full flex-col border-l shadow-2xl md:w-[720px]">…</aside> subtree intercepts pointer events
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="mt-0.5 text-[10px] font-medium">Cloud service · scoped operational context</div> from <aside role="dialog" data-expanded="false" data-testid="topology-service-detail-panel" aria-label="Operations for igw-01b6c643a5c856abe" class="fixed inset-y-0 right-0 z-[220] flex w-full flex-col border-l shadow-2xl md:w-[720px]">…</aside> subtree intercepts pointer events
  137 × retrying click action
        - waiting 500ms
        - waiting for element to be visible, enabled and stable
        - element is visible, enabled and stable
        - scrolling into view if needed
        - done scrolling
        - <div class="overflow-x-auto border-b pb-3 last:border-b-0">…</div> from <aside role="dialog" data-expanded="false" data-testid="topology-service-detail-panel" aria-label="Operations for igw-01b6c643a5c856abe" class="fixed inset-y-0 right-0 z-[220] flex w-full flex-col border-l shadow-2xl md:w-[720px]">…</aside> subtree intercepts pointer events
      - retrying click action
        - waiting 500ms
        - waiting for element to be visible, enabled and stable
        - element is visible, enabled and stable
        - scrolling into view if needed
        - done scrolling
        - <div class="overflow-x-auto border-b pb-3 last:border-b-0">…</div> from <aside role="dialog" data-expanded="false" data-testid="topology-service-detail-panel" aria-label="Operations for igw-01b6c643a5c856abe" class="fixed inset-y-0 right-0 z-[220] flex w-full flex-col border-l shadow-2xl md:w-[720px]">…</aside> subtree intercepts pointer events
      - retrying click action
        - waiting 500ms
        - waiting for element to be visible, enabled and stable
        - element is visible, enabled and stable
        - scrolling into view if needed
        - done scrolling
        - <div class="mt-0.5 text-[10px] font-medium">Cloud service · scoped operational context</div> from <aside role="dialog" data-expanded="false" data-testid="topology-service-detail-panel" aria-label="Operations for igw-01b6c643a5c856abe" class="fixed inset-y-0 right-0 z-[220] flex w-full flex-col border-l shadow-2xl md:w-[720px]">…</aside> subtree intercepts pointer events
      - retrying click action
        - waiting 500ms
        - waiting for element to be visible, enabled and stable
        - element is visible, enabled and stable
        - scrolling into view if needed
        - done scrolling
        - <div class="mt-0.5 text-[10px] font-medium">Cloud service · scoped operational context</div> from <aside role="dialog" data-expanded="false" data-testid="topology-service-detail-panel" aria-label="Operations for igw-01b6c643a5c856abe" class="fixed inset-y-0 right-0 z-[220] flex w-full flex-col border-l shadow-2xl md:w-[720px]">…</aside> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable

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
        - generic [ref=e91]:
          - generic [ref=e92]:
            - generic [ref=e93]:
              - generic [ref=e94]: Platform map
              - generic [ref=e95]: 1 VPC · 2 AZ · 6 subnets · 35 resources
            - generic [ref=e96]:
              - generic [ref=e97]: Map lens
              - generic [ref=e98]:
                - button "Architecture" [ref=e99]:
                  - img [ref=e100]
                  - text: Architecture
                - button "Dependencies" [pressed] [ref=e110]:
                  - img [ref=e111]
                  - text: Dependencies
                - button "Attack paths" [ref=e115]:
                  - img [ref=e116]
                  - text: Attack paths
          - generic "Dependency line colors" [ref=e118]:
            - generic [ref=e119]: Flow colors
            - generic [ref=e120]:
              - img [ref=e121]
              - generic [ref=e123]: Service call
            - generic [ref=e124]:
              - img [ref=e125]
              - generic [ref=e127]: AWS data service
            - generic [ref=e128]:
              - img [ref=e129]
              - generic [ref=e131]: VPC endpoint
            - generic [ref=e132]:
              - img [ref=e133]
              - generic [ref=e135]: Internet egress
            - generic [ref=e136]:
              - img [ref=e137]
              - generic [ref=e139]: Database
            - generic [ref=e140]:
              - img [ref=e141]
              - generic [ref=e143]: Exposure / attack
            - generic [ref=e144]: Moving = authoritative observed
            - generic [ref=e148]:
              - img [ref=e149]
              - text: Outlined motion = historical direction
            - generic [ref=e152]:
              - img [ref=e153]
              - text: Solid = configured
            - generic [ref=e154]:
              - img [ref=e155]
              - text: Dashed = inferred / unverified
          - generic [ref=e156]:
            - generic [ref=e157]: Traffic evidence not yet authoritative
            - generic [ref=e158]: Outlined packets show historical source-to-target direction; they do not claim live traffic.
          - generic [ref=e159]:
            - generic [ref=e160]:
              - generic [ref=e161]: Flow-log coverage
              - generic [ref=e162]: Not measured
              - generic [ref=e163]: 16 eligible endpoints, coverage not measured · 19 not applicable
              - generic [ref=e164]:
                - 'generic "In-VPC: eligible 11, covered not measured (projection inactive), unknown 0, not applicable 0" [ref=e165]': In-VPC 11 not measured
                - 'generic "Database: eligible 5, covered not measured (projection inactive), unknown 0, not applicable 0" [ref=e166]': Database 5 not measured
                - 'generic "Lambda: eligible 0, covered 0, unknown 0, not applicable 6" [ref=e167]': Lambda 6 n/a
                - 'generic "Regional: eligible 0, covered 0, unknown 0, not applicable 13" [ref=e168]': Regional 13 n/a
            - list [ref=e169]:
              - 'listitem "Lambda → database: not collected. 6 function(s) run outside the VPC, so no flow log or CloudTrail data event observes their connections to the 5 database(s) in scope." [ref=e170]':
                - generic [ref=e171]: "Lambda:"
                - text: "Lambda → database: not collected. 6 function(s) run outside the VPC, so no flow log or CloudTrail data event observes their connections to the 5 database(s) in scope."
              - listitem "13 regional service(s) have no VPC network interface; VPC flow logs cannot observe them. Access to them is evidenced by CloudTrail data events, a separate lane." [ref=e172]:
                - generic [ref=e173]: "Regional:"
                - text: 13 regional service(s) have no VPC network interface; VPC flow logs cannot observe them. Access to them is evidenced by CloudTrail data events, a separate lane.
              - 'listitem "The canonical flow-log projection is not active for this scope (mode legacy), so coverage of the 16 eligible endpoint(s) is not measured. This is not a finding of zero coverage: no endpoint was examined." [ref=e174]':
                - generic [ref=e175]: "In-VPC:"
                - text: "The canonical flow-log projection is not active for this scope (mode legacy), so coverage of the 16 eligible endpoint(s) is not measured. This is not a finding of zero coverage: no endpoint was examined."
          - generic [ref=e176]:
            - generic [ref=e177]:
              - img [ref=e179]
              - generic [ref=e184]:
                - generic [ref=e185]: Users
                - generic [ref=e186]: Clients & operators
            - generic [ref=e188]:
              - img [ref=e190]
              - generic [ref=e195]:
                - generic [ref=e196]: Internet
                - generic [ref=e197]: Public path via IGW · igw-01b6c643a5c856abe
          - generic [ref=e198]:
            - generic [ref=e199]: ☁ AWS Cloud · acct 416651950952
            - generic [ref=e200]:
              - generic [ref=e201]: Region · eu-west-1
              - generic [ref=e202]:
                - generic [ref=e203]:
                  - generic [ref=e204]:
                    - generic "vpc-0c39cde96f29f8f4e" [ref=e205]: VPC · vpc-0c39cde96f29f8f4e
                    - generic "7 of 8 workloads in this VPC drop the shared prefix \"cyntro-tb-prod-\" from their chip label — every tooltip still carries the full name" [ref=e206]: cyntro-tb-prod-… ×7
                  - generic [ref=e208]:
                    - generic [ref=e209]:
                      - generic [ref=e210]:
                        - img [ref=e211]
                        - generic [ref=e217]: Load Balancers (2)
                      - generic [ref=e218]:
                        - button "cyntro-tb-prod-alb-int Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e219]:
                          - generic [ref=e221]:
                            - generic [ref=e222]:
                              - generic [ref=e223]: cyntro-tb-prod-alb-int
                              - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e224]: Multi-AZ
                            - generic [ref=e225]: LoadBalancer · arn:aws:elasticloadbalan
                          - generic [ref=e226]: "0"
                        - button "cyntro-tb-prod-alb-pub Multi-AZ LoadBalancer · arn:aws:elasticloadbalan 0" [ref=e227]:
                          - generic [ref=e229]:
                            - generic [ref=e230]:
                              - generic [ref=e231]: cyntro-tb-prod-alb-pub
                              - generic "Multi-AZ — one resource spanning multiple availability zones (shown in each zone's cell, counted once)" [ref=e232]: Multi-AZ
                            - generic [ref=e233]: LoadBalancer · arn:aws:elasticloadbalan
                          - generic [ref=e234]: "0"
                    - generic [ref=e235]:
                      - generic [ref=e236]:
                        - generic "eu-west-1a" [ref=e237]: Availability Zone · eu-west-1a
                        - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1a · 10.42.0.0/24 · Owner: testbed-webshop" [ref=e238]':
                          - generic [ref=e239]:
                            - generic [ref=e240]: Public · cyntro-tb-prod-public-eu-west-1a
                            - generic [ref=e241]: 10.42.0.0/24
                          - generic "NAT gateway · nat-0fd7cf8524e62aea9 · public 54.229.208.150 · subnet subnet-05472c7cd0d3a7b90 (from vpc_topology.edges)" [ref=e243]:
                            - img [ref=e245]
                            - generic [ref=e248]: NAT GW · nat-0fd7cf8524e62aea9
                          - generic [ref=e249]:
                            - button "quiet posture score …web" [ref=e250]:
                              - generic "quiet posture score" [ref=e251]
                              - generic [ref=e254]: …web
                            - button "quiet posture score cyntro-testbed-webshop-writer" [ref=e255]:
                              - generic "quiet posture score" [ref=e256]
                              - generic [ref=e259]: cyntro-testbed-webshop-writer
                        - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1a · 10.42.10.0/24 · Owner: testbed-webshop" [ref=e260]':
                          - generic [ref=e261]:
                            - generic [ref=e262]: Private · cyntro-tb-prod-app-eu-west-1a
                            - generic [ref=e263]: 10.42.10.0/24
                          - button "quiet posture score ×2 EC2" [ref=e265]:
                            - generic "quiet posture score" [ref=e266]
                            - generic [ref=e271]: ×2
                            - generic [ref=e272]: EC2
                        - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1a · 10.42.20.0/24 · Owner: testbed-webshop" [ref=e273]':
                          - generic [ref=e274]:
                            - generic [ref=e275]: Data · cyntro-tb-prod-data-eu-west-1a
                            - generic [ref=e276]: 10.42.20.0/24
                          - button "quiet posture score …aurora-1" [ref=e278]:
                            - generic "quiet posture score" [ref=e279]
                            - generic [ref=e282]: …aurora-1
                      - generic [ref=e283]:
                        - generic "eu-west-1b" [ref=e284]: Availability Zone · eu-west-1b
                        - 'generic "Public subnet (web tier) · cyntro-tb-prod-public-eu-west-1b · 10.42.1.0/24 · Owner: testbed-webshop" [ref=e285]':
                          - generic [ref=e286]:
                            - generic [ref=e287]: Public · cyntro-tb-prod-public-eu-west-1b
                            - generic [ref=e288]: 10.42.1.0/24
                          - button "quiet posture score …web" [ref=e290]:
                            - generic "quiet posture score" [ref=e291]
                            - generic [ref=e294]: …web
                        - 'generic "Private subnet (app tier) · cyntro-tb-prod-app-eu-west-1b · 10.42.11.0/24 · Owner: testbed-webshop" [ref=e295]':
                          - generic [ref=e296]:
                            - generic [ref=e297]: Private · cyntro-tb-prod-app-eu-west-1b
                            - generic [ref=e298]: 10.42.11.0/24
                          - button "quiet posture score …app" [ref=e300]:
                            - generic "quiet posture score" [ref=e301]
                            - generic [ref=e304]: …app
                        - 'generic "Private subnet (data tier) · cyntro-tb-prod-data-eu-west-1b · 10.42.21.0/24 · Owner: testbed-webshop" [ref=e305]':
                          - generic [ref=e306]:
                            - generic [ref=e307]: Data · cyntro-tb-prod-data-eu-west-1b
                            - generic [ref=e308]: 10.42.21.0/24
                          - button "quiet posture score …aurora-0" [ref=e310]:
                            - generic "quiet posture score" [ref=e311]
                            - generic [ref=e314]: …aurora-0
                - generic [ref=e315]:
                  - generic [ref=e316]: VPC boundary
                  - generic [ref=e317]:
                    - generic [ref=e318]: ↑ Internet
                    - generic [ref=e319]:
                      - button "IGW igw-01b6c643a5c856abe" [pressed] [ref=e320]:
                        - img [ref=e322]
                        - generic [ref=e325]: IGW
                        - generic [ref=e326]: igw-01b6c643a5c856abe
                      - generic "Workloads whose egress the map routes through this gateway — counted from the drawn edges." [ref=e327]: "egress: 3 workloads"
                  - generic [ref=e329]:
                    - generic [ref=e330]: Endpoints (1)
                    - generic [ref=e331]:
                      - button "VPCE GW Amazon S3" [ref=e332]:
                        - img [ref=e334]
                        - generic [ref=e338]: VPCE
                        - generic [ref=e339]: GW
                        - generic [ref=e340]: Amazon S3
                      - generic "Workloads the map draws reaching this endpoint — counted from the drawn edges, not from a route table." [ref=e341]: "use: not observed"
                - generic [ref=e343]:
                  - generic [ref=e344]:
                    - generic [ref=e345]:
                      - generic [ref=e346]: Lambda runtime (6)
                      - generic [ref=e347]:
                        - text: outside subnet grid · 6 outside VPC (verified)
                        - generic "12 of 12 chips omit this shared prefix" [ref=e348]: · cyntro-tb-prod-consumer-… ×12
                    - generic [ref=e349]:
                      - generic [ref=e350]: Triggers (6)
                      - generic [ref=e351]:
                        - button "quiet posture score …daily" [ref=e352]:
                          - generic "quiet posture score" [ref=e353]
                          - generic [ref=e356]: …daily
                        - button "quiet posture score …every_6h" [ref=e357]:
                          - generic "quiet posture score" [ref=e358]
                          - generic [ref=e361]: …every_6h
                        - button "quiet posture score …frequent" [ref=e362]:
                          - generic "quiet posture score" [ref=e363]
                          - generic [ref=e366]: …frequent
                        - button "quiet posture score …monthly" [ref=e367]:
                          - generic "quiet posture score" [ref=e368]
                          - generic [ref=e371]: …monthly
                        - button "quiet posture score …nightly_burst" [ref=e372]:
                          - generic "quiet posture score" [ref=e373]
                          - generic [ref=e376]: …nightly_burst
                        - button "quiet posture score …weekly" [ref=e377]:
                          - generic "quiet posture score" [ref=e378]
                          - generic [ref=e381]: …weekly
                    - generic [ref=e383]:
                      - button "quiet posture score …monthly" [ref=e384]:
                        - generic "quiet posture score" [ref=e385]
                        - generic [ref=e388]: …monthly
                      - button "quiet posture score …weekly" [ref=e389]:
                        - generic "quiet posture score" [ref=e390]
                        - generic [ref=e393]: …weekly
                      - button "quiet posture score …daily" [ref=e394]:
                        - generic "quiet posture score" [ref=e395]
                        - generic [ref=e398]: …daily
                      - button "quiet posture score …every_6h" [ref=e399]:
                        - generic "quiet posture score" [ref=e400]
                        - generic [ref=e403]: …every_6h
                      - button "quiet posture score …frequent" [ref=e404]:
                        - generic "quiet posture score" [ref=e405]
                        - generic [ref=e408]: …frequent
                      - button "quiet posture score …nightly_burst" [ref=e409]:
                        - generic "quiet posture score" [ref=e410]
                        - generic [ref=e413]: …nightly_burst
                  - generic [ref=e415]:
                    - generic [ref=e416]:
                      - text: Regional · KMS / S3 / DDB (7)
                      - generic "3 of 7 chips omit this shared prefix" [ref=e417]: arn:aws:kms:eu-west-1:416651950952:key/… ×3
                    - generic [ref=e419]:
                      - button "quiet posture score cyntro-evidence-testbed-webshop-950952" [ref=e420]:
                        - generic "quiet posture score" [ref=e421]
                        - generic [ref=e424]: cyntro-evidence-testbed-webshop-950952
                      - button "quiet posture score cyntro-ingest-head-testbed-webshop" [ref=e425]:
                        - generic "quiet posture score" [ref=e426]
                        - generic [ref=e429]: cyntro-ingest-head-testbed-webshop
                      - button "quiet posture score cyntro-tb-prod-appdata-1c8276f5" [ref=e430]:
                        - generic "quiet posture score" [ref=e431]
                        - generic [ref=e434]: cyntro-tb-prod-appdata-1c8276f5
                      - button "quiet posture score …76bd5a63-602c-471e-b085-1df8b04128b2" [ref=e435]:
                        - generic "quiet posture score" [ref=e436]
                        - generic [ref=e439]: …76bd5a63-602c-471e-b085-1df8b04128b2
                      - button "quiet posture score …d729e441-b319-4859-9974-9bd12d8e341a" [ref=e440]:
                        - generic "quiet posture score" [ref=e441]
                        - generic [ref=e444]: …d729e441-b319-4859-9974-9bd12d8e341a
                      - button "quiet posture score …1a88e19d-2eb4-4bf7-a16d-35152bc8a453" [ref=e445]:
                        - generic "quiet posture score" [ref=e446]
                        - generic [ref=e449]: …1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                      - button "quiet posture score cyntro-tb-prod-logs-1c8276f5 S3" [ref=e450]:
                        - generic "quiet posture score" [ref=e451]
                        - generic [ref=e454]: cyntro-tb-prod-logs-1c8276f5
                        - generic [ref=e455]: S3
              - generic [ref=e456]:
                - generic [ref=e457]:
                  - generic [ref=e458]: Logical groups · members carry the placement (6)
                  - generic [ref=e459]: "Target groups, auto-scaling groups and database clusters have no subnet of their own — their members carry the placement. Not a collector gap: a full sync will not move it."
                - generic [ref=e460]:
                  - generic [ref=e461]:
                    - button "quiet posture score cyntro-tb-prod-aurora" [ref=e462]:
                      - generic "quiet posture score" [ref=e463]
                      - generic [ref=e466]: cyntro-tb-prod-aurora
                    - generic [ref=e467]: VPC not reported
                    - generic [ref=e468]: members not linked in this payload
                  - generic [ref=e469]:
                    - button "quiet posture score cyntro-tb-prod-tg-app" [ref=e470]:
                      - generic "quiet posture score" [ref=e471]
                      - generic [ref=e474]: cyntro-tb-prod-tg-app
                    - generic [ref=e475]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                    - generic [ref=e476]:
                      - button "cyntro-tb-prod-app" [ref=e477]
                      - button "cyntro-tb-prod-app" [ref=e478]
                  - generic [ref=e479]:
                    - button "quiet posture score cyntro-tb-prod-tg-web" [ref=e480]:
                      - generic "quiet posture score" [ref=e481]
                      - generic [ref=e484]: cyntro-tb-prod-tg-web
                    - generic [ref=e485]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                    - generic [ref=e486]:
                      - button "cyntro-tb-prod-web" [ref=e487]
                      - button "cyntro-tb-prod-web" [ref=e488]
                  - generic [ref=e489]:
                    - button "quiet posture score cyntro-testbed-webshop" [ref=e490]:
                      - generic "quiet posture score" [ref=e491]
                      - generic [ref=e494]: cyntro-testbed-webshop
                    - generic [ref=e495]: VPC not reported
                    - generic [ref=e496]: members not linked in this payload
                  - generic [ref=e497]:
                    - button "quiet posture score cyntro-tb-prod-asg-web" [ref=e498]:
                      - generic "quiet posture score" [ref=e499]
                      - generic [ref=e502]: cyntro-tb-prod-asg-web
                    - generic [ref=e503]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                    - generic [ref=e504]:
                      - button "cyntro-tb-prod-web" [ref=e505]
                      - button "cyntro-tb-prod-web" [ref=e506]
                  - generic [ref=e507]:
                    - button "quiet posture score cyntro-tb-prod-asg-app" [ref=e508]:
                      - generic "quiet posture score" [ref=e509]
                      - generic [ref=e512]: cyntro-tb-prod-asg-app
                    - generic [ref=e513]: VPC vpc-0c39cde96f29f8f4e · spans eu-west-1a, eu-west-1b
                    - generic [ref=e514]:
                      - button "cyntro-tb-prod-app" [ref=e515]
                      - button "cyntro-tb-prod-app" [ref=e516]
          - generic [ref=e517]:
            - button "Diagnostics 6 serverless · 8 flows ▴" [ref=e518]:
              - generic [ref=e519]: Diagnostics
              - generic [ref=e520]: 6 serverless · 8 flows ▴
            - generic [ref=e521]:
              - generic [ref=e522]:
                - generic [ref=e523]: Serverless compute (6)
                - generic [ref=e524]:
                  - button "cyntro-tb-prod-consumer-monthly Lambda · arn:aws:lambda:eu-west-1 15" [ref=e525]:
                    - generic [ref=e527]:
                      - generic [ref=e529]: cyntro-tb-prod-consumer-monthly
                      - generic [ref=e530]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e531]: "15"
                  - button "cyntro-tb-prod-consumer-weekly Lambda · arn:aws:lambda:eu-west-1 15" [ref=e532]:
                    - generic [ref=e534]:
                      - generic [ref=e536]: cyntro-tb-prod-consumer-weekly
                      - generic [ref=e537]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e538]: "15"
                  - button "cyntro-tb-prod-consumer-daily Lambda · arn:aws:lambda:eu-west-1 4" [ref=e539]:
                    - generic [ref=e541]:
                      - generic [ref=e543]: cyntro-tb-prod-consumer-daily
                      - generic [ref=e544]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e545]: "4"
                  - button "cyntro-tb-prod-consumer-every_6h Lambda · arn:aws:lambda:eu-west-1 4" [ref=e546]:
                    - generic [ref=e548]:
                      - generic [ref=e550]: cyntro-tb-prod-consumer-every_6h
                      - generic [ref=e551]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e552]: "4"
                  - button "cyntro-tb-prod-consumer-frequent Lambda · arn:aws:lambda:eu-west-1 4" [ref=e553]:
                    - generic [ref=e555]:
                      - generic [ref=e557]: cyntro-tb-prod-consumer-frequent
                      - generic [ref=e558]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e559]: "4"
                  - button "cyntro-tb-prod-consumer-nightly_burst Lambda · arn:aws:lambda:eu-west-1 4" [ref=e560]:
                    - generic [ref=e562]:
                      - generic [ref=e564]: cyntro-tb-prod-consumer-nightly_burst
                      - generic [ref=e565]: Lambda · arn:aws:lambda:eu-west-1
                    - generic [ref=e566]: "4"
              - generic [ref=e567]:
                - generic [ref=e568]:
                  - generic [ref=e569]: Observed traffic — animated arrows above
                  - generic [ref=e570]: 8 flows · 5 internal · 0 edge-service · 0 vpce · 0 database · 3 egress
                - generic [ref=e571]:
                  - generic [ref=e572]:
                    - generic [ref=e573]: cyntro-tb-prod-app
                    - generic [ref=e574]: →
                    - generic [ref=e575]: Internet (via IGW)
                    - generic [ref=e576]: egress · 32 (ext 32)
                  - generic [ref=e577]:
                    - generic [ref=e578]: cyntro-tb-prod-loadgen
                    - generic [ref=e579]: →
                    - generic [ref=e580]: Internet (via IGW)
                    - generic [ref=e581]: egress · 3 (ext 3)
                  - generic [ref=e582]:
                    - generic [ref=e583]: cyntro-tb-prod-app
                    - generic [ref=e584]: →
                    - generic [ref=e585]: Internet (via IGW)
                    - generic [ref=e586]: egress · 10 (ext 10)
                  - generic [ref=e587]:
                    - generic [ref=e588]: cyntro-tb-prod-asg-app
                    - generic [ref=e589]: →
                    - generic [ref=e590]: cyntro-tb-prod-app
                    - generic [ref=e591]: LAUNCHES
                  - generic [ref=e592]:
                    - generic [ref=e593]: cyntro-tb-prod-asg-app
                    - generic [ref=e594]: →
                    - generic [ref=e595]: cyntro-tb-prod-app
                    - generic [ref=e596]: LAUNCHES
                  - generic [ref=e597]:
                    - generic [ref=e598]: cyntro-tb-prod-alb-int
                    - generic [ref=e599]: →
                    - generic [ref=e600]: cyntro-tb-prod-tg-app
                    - generic [ref=e601]: HAS_TARGET_GROUP
                  - generic [ref=e602]:
                    - generic [ref=e603]: cyntro-tb-prod-tg-app
                    - generic [ref=e604]: →
                    - generic [ref=e605]: cyntro-tb-prod-app
                    - generic [ref=e606]: TARGETS
                  - generic [ref=e607]:
                    - generic [ref=e608]: cyntro-tb-prod-tg-app
                    - generic [ref=e609]: →
                    - generic [ref=e610]: cyntro-tb-prod-app
                    - generic [ref=e611]: TARGETS
              - generic [ref=e612]:
                - generic [ref=e613]: Encoding
                - generic [ref=e614]:
                  - generic [ref=e617]: Worst (carmine halo + pulse)
                  - generic [ref=e620]: High / elevated (ring only)
                  - generic [ref=e621]:
                    - generic [ref=e622]: ♛
                    - generic [ref=e623]: Crown-jewel halo
                  - generic [ref=e626]: Clean · remediated (teal ring)
                  - generic [ref=e629]: Stale (dimmed)
                  - generic [ref=e632]: Coverage gap (not collected)
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
                - generic: TG
            - generic:
              - generic:
                - generic: TARGETS
            - generic:
              - generic:
                - generic: TARGETS
      - complementary [ref=e633]:
        - complementary [ref=e634]:
          - generic [ref=e635]:
            - generic [ref=e636]:
              - heading "Service index" [level=2] [ref=e637]
              - generic [ref=e638]: "35"
            - generic [ref=e639]:
              - img [ref=e640]
              - searchbox "Find service in topology" [ref=e643]
            - button "Filters" [ref=e646]:
              - img [ref=e647]
              - text: Filters
          - list [ref=e649]:
            - listitem [ref=e650]:
              - button "cyntro-tb-prod-appdata-1c8276f5 Current graph data S3 · global · regional 4 in · 1 out Aug 20, 04:53 PM" [ref=e651]:
                - generic [ref=e652]:
                  - img [ref=e654]
                  - generic [ref=e656]:
                    - generic [ref=e657]:
                      - generic [ref=e658]: cyntro-tb-prod-appdata-1c8276f5
                      - generic "Current graph data" [ref=e659]
                    - generic [ref=e661]: S3 · global · regional
                    - generic [ref=e662]:
                      - generic [ref=e663]: 4 in · 1 out
                      - generic [ref=e664]:
                        - img [ref=e665]
                        - text: Aug 20, 04:53 PM
            - listitem [ref=e668]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2 Current graph data KMSKey · global · regional 3 in · 0 out Sep 11, 07:35 PM" [ref=e669]:
                - generic [ref=e670]:
                  - img [ref=e672]
                  - generic [ref=e674]:
                    - generic [ref=e675]:
                      - generic [ref=e676]: arn:aws:kms:eu-west-1:416651950952:key/76bd5a63-602c-471e-b085-1df8b04128b2
                      - generic "Current graph data" [ref=e677]
                    - generic [ref=e679]: KMSKey · global · regional
                    - generic [ref=e680]:
                      - generic [ref=e681]: 3 in · 0 out
                      - generic [ref=e682]:
                        - img [ref=e683]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e686]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1b · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e687]:
                - generic [ref=e688]:
                  - img [ref=e690]
                  - generic [ref=e692]:
                    - generic [ref=e693]:
                      - generic [ref=e694]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e695]
                    - generic [ref=e697]: EC2 · eu-west-1b · app
                    - generic [ref=e698]:
                      - generic [ref=e699]: 2 in · 1 out
                      - generic [ref=e700]:
                        - img [ref=e701]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e704]:
              - button "cyntro-tb-prod-app Current graph data EC2 · eu-west-1a · app 2 in · 1 out Aug 20, 04:58 PM" [ref=e705]:
                - generic [ref=e706]:
                  - img [ref=e708]
                  - generic [ref=e710]:
                    - generic [ref=e711]:
                      - generic [ref=e712]: cyntro-tb-prod-app
                      - generic "Current graph data" [ref=e713]
                    - generic [ref=e715]: EC2 · eu-west-1a · app
                    - generic [ref=e716]:
                      - generic [ref=e717]: 2 in · 1 out
                      - generic [ref=e718]:
                        - img [ref=e719]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e722]:
              - button "cyntro-tb-prod-consumer-daily Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e723]:
                - generic [ref=e724]:
                  - img [ref=e726]
                  - generic [ref=e728]:
                    - generic [ref=e729]:
                      - generic [ref=e730]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e731]
                    - generic [ref=e733]: Lambda · eu-west-1 · regional
                    - generic [ref=e734]:
                      - generic [ref=e735]: 2 in · 1 out
                      - generic [ref=e736]:
                        - img [ref=e737]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e740]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e741]:
                - generic [ref=e742]:
                  - img [ref=e744]
                  - generic [ref=e746]:
                    - generic [ref=e747]:
                      - generic [ref=e748]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e749]
                    - generic [ref=e751]: Lambda · eu-west-1 · regional
                    - generic [ref=e752]:
                      - generic [ref=e753]: 2 in · 1 out
                      - generic [ref=e754]:
                        - img [ref=e755]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e758]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Sep 1, 11:00 AM" [ref=e759]:
                - generic [ref=e760]:
                  - img [ref=e762]
                  - generic [ref=e764]:
                    - generic [ref=e765]:
                      - generic [ref=e766]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e767]
                    - generic [ref=e769]: Lambda · eu-west-1 · regional
                    - generic [ref=e770]:
                      - generic [ref=e771]: 2 in · 1 out
                      - generic [ref=e772]:
                        - img [ref=e773]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e776]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data Lambda · eu-west-1 · regional 2 in · 1 out Aug 31, 11:00 AM" [ref=e777]:
                - generic [ref=e778]:
                  - img [ref=e780]
                  - generic [ref=e782]:
                    - generic [ref=e783]:
                      - generic [ref=e784]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e785]
                    - generic [ref=e787]: Lambda · eu-west-1 · regional
                    - generic [ref=e788]:
                      - generic [ref=e789]: 2 in · 1 out
                      - generic [ref=e790]:
                        - img [ref=e791]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e794]:
              - button "cyntro-tb-prod-tg-app Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e795]:
                - generic [ref=e796]:
                  - img [ref=e798]
                  - generic [ref=e800]:
                    - generic [ref=e801]:
                      - generic [ref=e802]: cyntro-tb-prod-tg-app
                      - generic "Current graph data" [ref=e803]
                    - generic [ref=e805]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e806]:
                      - generic [ref=e807]: 1 in · 2 out
                      - generic [ref=e808]:
                        - img [ref=e809]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e812]:
              - button "cyntro-tb-prod-tg-web Current graph data TargetGroup · eu-west-1 · VPC 1 in · 2 out Aug 20, 04:58 PM" [ref=e813]:
                - generic [ref=e814]:
                  - img [ref=e816]
                  - generic [ref=e818]:
                    - generic [ref=e819]:
                      - generic [ref=e820]: cyntro-tb-prod-tg-web
                      - generic "Current graph data" [ref=e821]
                    - generic [ref=e823]: TargetGroup · eu-west-1 · VPC
                    - generic [ref=e824]:
                      - generic [ref=e825]: 1 in · 2 out
                      - generic [ref=e826]:
                        - img [ref=e827]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e830]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453 Current graph data KMSKey · global · regional 2 in · 0 out Sep 11, 07:35 PM" [ref=e831]:
                - generic [ref=e832]:
                  - img [ref=e834]
                  - generic [ref=e836]:
                    - generic [ref=e837]:
                      - generic [ref=e838]: arn:aws:kms:eu-west-1:416651950952:key/1a88e19d-2eb4-4bf7-a16d-35152bc8a453
                      - generic "Current graph data" [ref=e839]
                    - generic [ref=e841]: KMSKey · global · regional
                    - generic [ref=e842]:
                      - generic [ref=e843]: 2 in · 0 out
                      - generic [ref=e844]:
                        - img [ref=e845]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e848]:
              - button "cyntro-tb-prod-asg-app Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e849]:
                - generic [ref=e850]:
                  - img [ref=e852]
                  - generic [ref=e854]:
                    - generic [ref=e855]:
                      - generic [ref=e856]: cyntro-tb-prod-asg-app
                      - generic "Current graph data" [ref=e857]
                    - generic [ref=e859]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e860]:
                      - generic [ref=e861]: 0 in · 2 out
                      - generic [ref=e862]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e865]:
              - button "cyntro-tb-prod-asg-web Current graph data AutoScalingGroup · eu-west-1 · VPC 0 in · 2 out No runtime timestamp" [ref=e866]:
                - generic [ref=e867]:
                  - img [ref=e869]
                  - generic [ref=e871]:
                    - generic [ref=e872]:
                      - generic [ref=e873]: cyntro-tb-prod-asg-web
                      - generic "Current graph data" [ref=e874]
                    - generic [ref=e876]: AutoScalingGroup · eu-west-1 · VPC
                    - generic [ref=e877]:
                      - generic [ref=e878]: 0 in · 2 out
                      - generic [ref=e879]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e882]:
              - button "cyntro-tb-prod-consumer-daily Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e883]:
                - generic [ref=e884]:
                  - img [ref=e886]
                  - generic [ref=e888]:
                    - generic [ref=e889]:
                      - generic [ref=e890]: cyntro-tb-prod-consumer-daily
                      - generic "Current graph data" [ref=e891]
                    - generic [ref=e893]: EventBridge · eu-west-1 · regional
                    - generic [ref=e894]:
                      - generic [ref=e895]: 0 in · 2 out
                      - generic [ref=e896]:
                        - img [ref=e897]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e900]:
              - button "cyntro-tb-prod-consumer-every_6h Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e901]:
                - generic [ref=e902]:
                  - img [ref=e904]
                  - generic [ref=e906]:
                    - generic [ref=e907]:
                      - generic [ref=e908]: cyntro-tb-prod-consumer-every_6h
                      - generic "Current graph data" [ref=e909]
                    - generic [ref=e911]: EventBridge · eu-west-1 · regional
                    - generic [ref=e912]:
                      - generic [ref=e913]: 0 in · 2 out
                      - generic [ref=e914]:
                        - img [ref=e915]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e918]:
              - button "cyntro-tb-prod-consumer-frequent Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Sep 1, 11:00 AM" [ref=e919]:
                - generic [ref=e920]:
                  - img [ref=e922]
                  - generic [ref=e924]:
                    - generic [ref=e925]:
                      - generic [ref=e926]: cyntro-tb-prod-consumer-frequent
                      - generic "Current graph data" [ref=e927]
                    - generic [ref=e929]: EventBridge · eu-west-1 · regional
                    - generic [ref=e930]:
                      - generic [ref=e931]: 0 in · 2 out
                      - generic [ref=e932]:
                        - img [ref=e933]
                        - text: Sep 1, 11:00 AM
            - listitem [ref=e936]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out No runtime timestamp" [ref=e937]:
                - generic [ref=e938]:
                  - img [ref=e940]
                  - generic [ref=e942]:
                    - generic [ref=e943]:
                      - generic [ref=e944]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e945]
                    - generic [ref=e947]: Lambda · eu-west-1 · regional
                    - generic [ref=e948]:
                      - generic [ref=e949]: 2 in · 0 out
                      - generic [ref=e950]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e953]:
              - button "cyntro-tb-prod-consumer-monthly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out No runtime timestamp" [ref=e954]:
                - generic [ref=e955]:
                  - img [ref=e957]
                  - generic [ref=e959]:
                    - generic [ref=e960]:
                      - generic [ref=e961]: cyntro-tb-prod-consumer-monthly
                      - generic "Current graph data" [ref=e962]
                    - generic [ref=e964]: EventBridge · eu-west-1 · regional
                    - generic [ref=e965]:
                      - generic [ref=e966]: 0 in · 2 out
                      - generic [ref=e967]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e970]:
              - button "cyntro-tb-prod-consumer-nightly_burst Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 31, 11:00 AM" [ref=e971]:
                - generic [ref=e972]:
                  - img [ref=e974]
                  - generic [ref=e976]:
                    - generic [ref=e977]:
                      - generic [ref=e978]: cyntro-tb-prod-consumer-nightly_burst
                      - generic "Current graph data" [ref=e979]
                    - generic [ref=e981]: EventBridge · eu-west-1 · regional
                    - generic [ref=e982]:
                      - generic [ref=e983]: 0 in · 2 out
                      - generic [ref=e984]:
                        - img [ref=e985]
                        - text: Aug 31, 11:00 AM
            - listitem [ref=e988]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data Lambda · eu-west-1 · regional 2 in · 0 out Aug 29, 11:00 AM" [ref=e989]:
                - generic [ref=e990]:
                  - img [ref=e992]
                  - generic [ref=e994]:
                    - generic [ref=e995]:
                      - generic [ref=e996]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e997]
                    - generic [ref=e999]: Lambda · eu-west-1 · regional
                    - generic [ref=e1000]:
                      - generic [ref=e1001]: 2 in · 0 out
                      - generic [ref=e1002]:
                        - img [ref=e1003]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e1006]:
              - button "cyntro-tb-prod-consumer-weekly Current graph data EventBridge · eu-west-1 · regional 0 in · 2 out Aug 29, 11:00 AM" [ref=e1007]:
                - generic [ref=e1008]:
                  - img [ref=e1010]
                  - generic [ref=e1012]:
                    - generic [ref=e1013]:
                      - generic [ref=e1014]: cyntro-tb-prod-consumer-weekly
                      - generic "Current graph data" [ref=e1015]
                    - generic [ref=e1017]: EventBridge · eu-west-1 · regional
                    - generic [ref=e1018]:
                      - generic [ref=e1019]: 0 in · 2 out
                      - generic [ref=e1020]:
                        - img [ref=e1021]
                        - text: Aug 29, 11:00 AM
            - listitem [ref=e1024]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1a · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e1025]:
                - generic [ref=e1026]:
                  - img [ref=e1028]
                  - generic [ref=e1030]:
                    - generic [ref=e1031]:
                      - generic [ref=e1032]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e1033]
                    - generic [ref=e1035]: EC2 · eu-west-1a · web
                    - generic [ref=e1036]:
                      - generic [ref=e1037]: 2 in · 0 out
                      - generic [ref=e1038]:
                        - img [ref=e1039]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e1042]:
              - button "cyntro-tb-prod-web Current graph data EC2 · eu-west-1b · web 2 in · 0 out Aug 20, 04:58 PM" [ref=e1043]:
                - generic [ref=e1044]:
                  - img [ref=e1046]
                  - generic [ref=e1048]:
                    - generic [ref=e1049]:
                      - generic [ref=e1050]: cyntro-tb-prod-web
                      - generic "Current graph data" [ref=e1051]
                    - generic [ref=e1053]: EC2 · eu-west-1b · web
                    - generic [ref=e1054]:
                      - generic [ref=e1055]: 2 in · 0 out
                      - generic [ref=e1056]:
                        - img [ref=e1057]
                        - text: Aug 20, 04:58 PM
            - listitem [ref=e1060]:
              - button "arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a Current graph data KMSKey · global · regional 1 in · 0 out No runtime timestamp" [ref=e1061]:
                - generic [ref=e1062]:
                  - img [ref=e1064]
                  - generic [ref=e1066]:
                    - generic [ref=e1067]:
                      - generic [ref=e1068]: arn:aws:kms:eu-west-1:416651950952:key/d729e441-b319-4859-9974-9bd12d8e341a
                      - generic "Current graph data" [ref=e1069]
                    - generic [ref=e1071]: KMSKey · global · regional
                    - generic [ref=e1072]:
                      - generic [ref=e1073]: 1 in · 0 out
                      - generic [ref=e1074]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1077]:
              - button "cyntro-evidence-testbed-webshop-950952 Current graph data S3 · global · regional 0 in · 1 out No runtime timestamp" [ref=e1078]:
                - generic [ref=e1079]:
                  - img [ref=e1081]
                  - generic [ref=e1083]:
                    - generic [ref=e1084]:
                      - generic [ref=e1085]: cyntro-evidence-testbed-webshop-950952
                      - generic "Current graph data" [ref=e1086]
                    - generic [ref=e1088]: S3 · global · regional
                    - generic [ref=e1089]:
                      - generic [ref=e1090]: 0 in · 1 out
                      - generic [ref=e1091]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1094]:
              - button "cyntro-ingest-head-testbed-webshop Current graph data DynamoDB · eu-west-1 · regional 0 in · 1 out No runtime timestamp" [ref=e1095]:
                - generic [ref=e1096]:
                  - img [ref=e1098]
                  - generic [ref=e1100]:
                    - generic [ref=e1101]:
                      - generic [ref=e1102]: cyntro-ingest-head-testbed-webshop
                      - generic "Current graph data" [ref=e1103]
                    - generic [ref=e1105]: DynamoDB · eu-west-1 · regional
                    - generic [ref=e1106]:
                      - generic [ref=e1107]: 0 in · 1 out
                      - generic [ref=e1108]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1111]:
              - button "cyntro-tb-prod-alb-int Current graph data LoadBalancer · eu-west-1a · app 0 in · 1 out No runtime timestamp" [ref=e1112]:
                - generic [ref=e1113]:
                  - img [ref=e1115]
                  - generic [ref=e1117]:
                    - generic [ref=e1118]:
                      - generic [ref=e1119]: cyntro-tb-prod-alb-int
                      - generic "Current graph data" [ref=e1120]
                    - generic [ref=e1122]: LoadBalancer · eu-west-1a · app
                    - generic [ref=e1123]:
                      - generic [ref=e1124]: 0 in · 1 out
                      - generic [ref=e1125]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1128]:
              - button "cyntro-tb-prod-alb-pub Current graph data LoadBalancer · eu-west-1a · web 0 in · 1 out No runtime timestamp" [ref=e1129]:
                - generic [ref=e1130]:
                  - img [ref=e1132]
                  - generic [ref=e1134]:
                    - generic [ref=e1135]:
                      - generic [ref=e1136]: cyntro-tb-prod-alb-pub
                      - generic "Current graph data" [ref=e1137]
                    - generic [ref=e1139]: LoadBalancer · eu-west-1a · web
                    - generic [ref=e1140]:
                      - generic [ref=e1141]: 0 in · 1 out
                      - generic [ref=e1142]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1145]:
              - button "cyntro-tb-prod-aurora-0 Current graph data RDS · eu-west-1b · data 0 in · 1 out Sep 11, 07:35 PM" [ref=e1146]:
                - generic [ref=e1147]:
                  - img [ref=e1149]
                  - generic [ref=e1151]:
                    - generic [ref=e1152]:
                      - generic [ref=e1153]: cyntro-tb-prod-aurora-0
                      - generic "Current graph data" [ref=e1154]
                    - generic [ref=e1156]: RDS · eu-west-1b · data
                    - generic [ref=e1157]:
                      - generic [ref=e1158]: 0 in · 1 out
                      - generic [ref=e1159]:
                        - img [ref=e1160]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e1163]:
              - button "cyntro-tb-prod-aurora-1 Current graph data RDS · eu-west-1a · data 0 in · 1 out Sep 11, 07:35 PM" [ref=e1164]:
                - generic [ref=e1165]:
                  - img [ref=e1167]
                  - generic [ref=e1169]:
                    - generic [ref=e1170]:
                      - generic [ref=e1171]: cyntro-tb-prod-aurora-1
                      - generic "Current graph data" [ref=e1172]
                    - generic [ref=e1174]: RDS · eu-west-1a · data
                    - generic [ref=e1175]:
                      - generic [ref=e1176]: 0 in · 1 out
                      - generic [ref=e1177]:
                        - img [ref=e1178]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e1181]:
              - button "cyntro-tb-prod-loadgen Current graph data EC2 · eu-west-1a · app 0 in · 1 out Aug 18, 06:57 PM" [ref=e1182]:
                - generic [ref=e1183]:
                  - img [ref=e1185]
                  - generic [ref=e1187]:
                    - generic [ref=e1188]:
                      - generic [ref=e1189]: cyntro-tb-prod-loadgen
                      - generic "Current graph data" [ref=e1190]
                    - generic [ref=e1192]: EC2 · eu-west-1a · app
                    - generic [ref=e1193]:
                      - generic [ref=e1194]: 0 in · 1 out
                      - generic [ref=e1195]:
                        - img [ref=e1196]
                        - text: Aug 18, 06:57 PM
            - listitem [ref=e1199]:
              - button "cyntro-testbed-webshop-writer Current graph data Neptune · eu-west-1a · web 0 in · 1 out Sep 11, 07:35 PM" [ref=e1200]:
                - generic [ref=e1201]:
                  - img [ref=e1203]
                  - generic [ref=e1205]:
                    - generic [ref=e1206]:
                      - generic [ref=e1207]: cyntro-testbed-webshop-writer
                      - generic "Current graph data" [ref=e1208]
                    - generic [ref=e1210]: Neptune · eu-west-1a · web
                    - generic [ref=e1211]:
                      - generic [ref=e1212]: 0 in · 1 out
                      - generic [ref=e1213]:
                        - img [ref=e1214]
                        - text: Sep 11, 07:35 PM
            - listitem [ref=e1217]:
              - button "cyntro-tb-prod-aurora Current graph data RDS · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1218]:
                - generic [ref=e1219]:
                  - img [ref=e1221]
                  - generic [ref=e1224]:
                    - generic [ref=e1225]:
                      - generic [ref=e1226]: cyntro-tb-prod-aurora
                      - generic "Current graph data" [ref=e1227]
                    - generic [ref=e1229]: RDS · eu-west-1 · regional
                    - generic [ref=e1230]:
                      - generic [ref=e1231]: 0 in · 0 out
                      - generic [ref=e1232]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1235]:
              - button "cyntro-tb-prod-logs-1c8276f5 Current graph data S3 · global · regional 0 in · 0 out No runtime timestamp" [ref=e1236]:
                - generic [ref=e1237]:
                  - img [ref=e1239]
                  - generic [ref=e1242]:
                    - generic [ref=e1243]:
                      - generic [ref=e1244]: cyntro-tb-prod-logs-1c8276f5
                      - generic "Current graph data" [ref=e1245]
                    - generic [ref=e1247]: S3 · global · regional
                    - generic [ref=e1248]:
                      - generic [ref=e1249]: 0 in · 0 out
                      - generic [ref=e1250]:
                        - img
                        - text: No runtime timestamp
            - listitem [ref=e1253]:
              - button "cyntro-testbed-webshop Current graph data Neptune · eu-west-1 · regional 0 in · 0 out No runtime timestamp" [ref=e1254]:
                - generic [ref=e1255]:
                  - img [ref=e1257]
                  - generic [ref=e1260]:
                    - generic [ref=e1261]:
                      - generic [ref=e1262]: cyntro-testbed-webshop
                      - generic "Current graph data" [ref=e1263]
                    - generic [ref=e1265]: Neptune · eu-west-1 · regional
                    - generic [ref=e1266]:
                      - generic [ref=e1267]: 0 in · 0 out
                      - generic [ref=e1268]:
                        - img
                        - text: No runtime timestamp
    - contentinfo [ref=e1271]:
      - text: Live read from
      - generic [ref=e1272]: /api/topology-risk/testbed-webshop
      - text: . Glance groups real Neptune nodes only — empty cells are honest, not fabricated.
    - dialog "Operations for igw-01b6c643a5c856abe" [ref=e1273]:
      - banner [ref=e1274]:
        - generic [ref=e1275]:
          - img "Internet gateway" [ref=e1276]:
            - img [ref=e1277]
          - generic [ref=e1280]:
            - generic [ref=e1281]: Estate operations · InternetGateway
            - generic [ref=e1282]: Cloud service · scoped operational context
            - heading "igw-01b6c643a5c856abe" [level=2] [ref=e1283]
            - generic [ref=e1284]:
              - generic [ref=e1285]: igw-01b6c643a5c856abe
              - generic [ref=e1286]: vpc-0c39cde96f29f8f4e
          - button "Enlarge service details" [ref=e1287]:
            - img [ref=e1288]
          - button "Close service details" [ref=e1293]:
            - img [ref=e1294]
        - tablist "Resource operations" [ref=e1297]:
          - tab "Resource" [selected] [ref=e1298]:
            - img [ref=e1299]
            - text: Resource
          - tab "Dependencies" [ref=e1311]:
            - img [ref=e1312]
            - text: Dependencies
          - tab "Change impact" [ref=e1316]:
            - img [ref=e1317]
            - text: Change impact
      - generic [ref=e1319]:
        - generic [ref=e1320]:
          - generic [ref=e1321]:
            - generic [ref=e1322]:
              - heading "Service inspector" [level=3] [ref=e1323]
              - paragraph [ref=e1324]: Neptune graph · incident dependency segments and deterministic service routing
            - generic [ref=e1325]: Unverified traffic context
          - generic [ref=e1326]:
            - generic [ref=e1327]:
              - generic [ref=e1328]: Legacy unverified
              - generic [ref=e1329]:
                - generic [ref=e1330]:
                  - generic [ref=e1331]:
                    - generic "cyntro-tb-prod-loadgen" [ref=e1332]
                    - generic [ref=e1333]: EC2
                  - generic [ref=e1334]:
                    - img "traffic" [ref=e1335]
                    - generic "traffic · ACTUAL_TRAFFIC" [ref=e1337]: traffic
                - generic [ref=e1339]:
                  - generic "igw-01b6c643a5c856abe" [ref=e1340]
                  - generic [ref=e1341]: InternetGateway
            - generic [ref=e1342]:
              - generic [ref=e1343]: Legacy unverified
              - generic [ref=e1344]:
                - generic [ref=e1345]:
                  - generic [ref=e1346]:
                    - generic "cyntro-tb-prod-tg-app" [ref=e1347]
                    - generic [ref=e1348]: TargetGroup
                  - generic [ref=e1349]:
                    - img "TARGETS" [ref=e1350]
                    - generic "TARGETS" [ref=e1352]
                - generic [ref=e1353]:
                  - generic [ref=e1354]:
                    - generic "cyntro-tb-prod-app" [ref=e1355]
                    - generic [ref=e1356]: EC2
                  - generic [ref=e1357]:
                    - img "traffic" [ref=e1358]
                    - generic "traffic · ACTUAL_TRAFFIC" [ref=e1360]: traffic
                - generic [ref=e1362]:
                  - generic "igw-01b6c643a5c856abe" [ref=e1363]
                  - generic [ref=e1364]: InternetGateway
            - generic [ref=e1365]:
              - generic [ref=e1366]: Legacy unverified
              - generic [ref=e1367]:
                - generic [ref=e1368]:
                  - generic [ref=e1369]:
                    - generic "cyntro-tb-prod-asg-app" [ref=e1370]
                    - generic [ref=e1371]: AutoScalingGroup
                  - generic [ref=e1372]:
                    - img "LAUNCHES" [ref=e1373]
                    - generic "LAUNCHES" [ref=e1375]
                - generic [ref=e1376]:
                  - generic [ref=e1377]:
                    - generic "cyntro-tb-prod-app" [ref=e1378]
                    - generic [ref=e1379]: EC2
                  - generic [ref=e1380]:
                    - img "traffic" [ref=e1381]
                    - generic "traffic · ACTUAL_TRAFFIC" [ref=e1383]: traffic
                - generic [ref=e1385]:
                  - generic "igw-01b6c643a5c856abe" [ref=e1386]
                  - generic [ref=e1387]: InternetGateway
            - generic [ref=e1388]:
              - generic [ref=e1389]: Legacy unverified
              - generic [ref=e1390]:
                - generic [ref=e1391]:
                  - generic [ref=e1392]:
                    - generic "cyntro-tb-prod-tg-app" [ref=e1393]
                    - generic [ref=e1394]: TargetGroup
                  - generic [ref=e1395]:
                    - img "TARGETS" [ref=e1396]
                    - generic "TARGETS" [ref=e1398]
                - generic [ref=e1399]:
                  - generic [ref=e1400]:
                    - generic "cyntro-tb-prod-app" [ref=e1401]
                    - generic [ref=e1402]: EC2
                  - generic [ref=e1403]:
                    - img "traffic" [ref=e1404]
                    - generic "traffic · ACTUAL_TRAFFIC" [ref=e1406]: traffic
                - generic [ref=e1408]:
                  - generic "igw-01b6c643a5c856abe" [ref=e1409]
                  - generic [ref=e1410]: InternetGateway
            - generic [ref=e1411]:
              - generic [ref=e1412]: Legacy unverified
              - generic [ref=e1413]:
                - generic [ref=e1414]:
                  - generic [ref=e1415]:
                    - generic "cyntro-tb-prod-asg-app" [ref=e1416]
                    - generic [ref=e1417]: AutoScalingGroup
                  - generic [ref=e1418]:
                    - img "LAUNCHES" [ref=e1419]
                    - generic "LAUNCHES" [ref=e1421]
                - generic [ref=e1422]:
                  - generic [ref=e1423]:
                    - generic "cyntro-tb-prod-app" [ref=e1424]
                    - generic [ref=e1425]: EC2
                  - generic [ref=e1426]:
                    - img "traffic" [ref=e1427]
                    - generic "traffic · ACTUAL_TRAFFIC" [ref=e1429]: traffic
                - generic [ref=e1431]:
                  - generic "igw-01b6c643a5c856abe" [ref=e1432]
                  - generic [ref=e1433]: InternetGateway
        - generic [ref=e1434]:
          - generic [ref=e1435]:
            - generic [ref=e1436]:
              - img [ref=e1437]
              - text: Live configuration from Inventory
            - paragraph [ref=e1440]: Same resource inspector and evidence used by All Services. The map adds dependency and change scope around it.
          - generic [ref=e1441]:
            - generic [ref=e1443]:
              - img [ref=e1445]
              - text: Operator summary
            - paragraph [ref=e1447]: Narrative summary is unavailable. Verified configuration and evidence remain available below.
          - generic [ref=e1448]:
            - generic [ref=e1449]:
              - generic [ref=e1450]:
                - paragraph [ref=e1451]: Data readiness
                - generic [ref=e1452]:
                  - text: "Configuration trust:"
                  - strong [ref=e1453]: investigate
              - generic [ref=e1454]:
                - generic [ref=e1455]:
                  - img [ref=e1456]
                  - generic [ref=e1459]: In inventory
                - generic [ref=e1460]:
                  - img [ref=e1461]
                  - generic [ref=e1464]: Config collected
                - generic [ref=e1465]:
                  - img [ref=e1466]
                  - generic [ref=e1469]: Evidence collected · not scored
                - generic [ref=e1470]:
                  - img [ref=e1471]
                  - generic [ref=e1474]: Remediation ready · not scored
            - generic [ref=e1475]:
              - generic [ref=e1476]:
                - heading "Internet Gateway" [level=3] [ref=e1477]
                - paragraph [ref=e1478]: "Source: Neo4j (collector:internet_gateway)"
                - generic [ref=e1479]:
                  - generic [ref=e1480]:
                    - term [ref=e1481]: igw id
                    - definition [ref=e1482]: igw-01b6c643a5c856abe
                  - generic [ref=e1483]:
                    - term [ref=e1484]: vpc id
                    - definition [ref=e1485]: vpc-0c39cde96f29f8f4e
                  - generic [ref=e1486]:
                    - term [ref=e1487]: state
                    - definition [ref=e1488]: available
                  - generic [ref=e1489]:
                    - term [ref=e1490]: region
                    - definition [ref=e1491]: eu-west-1
              - paragraph [ref=e1492]: IGW usage is inferred from subnet default routes and flow logs.
  - region "Notifications (F8)":
    - list
  - alert [ref=e1493]
```

# Test source

```ts
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
  796 |     // The enlarge control lives on the Network topology tab, not on the tab the
  797 |     // estate URL opens. Probe 2 switches tabs before enlarging; going straight
  798 |     // for the button spent the whole 300s test budget waiting for an element
  799 |     // that was never going to appear on the default tab (run 34747387060).
  800 |     async function enterFullscreen(): Promise<ReturnType<typeof page.getByTestId>> {
  801 |       const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  802 |       if (await fullscreen.isVisible().catch(() => false)) return fullscreen
  803 |       const enlarge = page.getByTestId("topology-estate-map-enlarge")
  804 |       if (!(await enlarge.isVisible().catch(() => false))) {
  805 |         await page.getByRole("tab", { name: "Network topology" }).click()
  806 |         await expect(enlarge).toBeVisible({ timeout: 60_000 })
  807 |         await page.waitForTimeout(1500)
  808 |       }
> 809 |       await enlarge.click()
      |                     ^ Error: locator.click: Test timeout of 300000ms exceeded.
  810 |       await expect(fullscreen).toBeVisible({ timeout: 60_000 })
  811 |       await page.waitForTimeout(1500)
  812 |       return fullscreen
  813 |     }
  814 | 
  815 |     /** Select the IGW chip and read the id the inspector actually asks about.
  816 |      *  `__igw__` is the CANVAS anchor every egress edge terminates at; it is
  817 |      *  not an AWS resource, and a dossier request carrying it answers
  818 |      *  "InternetGateway __igw__ not found in graph". */
  819 |     async function inspectIgw(label: string) {
  820 |       const fullscreen = await enterFullscreen()
  821 |       const chip = fullscreen.getByTestId("topology-igw-rail-chip").first()
  822 |       const payloadIgws = ((captured.payload?.vpc_topology?.edges?.igws ?? []) as Array<{ id?: string }>)
  823 |         .map(igw => igw?.id)
  824 |         .filter((id): id is string => typeof id === "string" && id.length > 0)
  825 |       const visible = await chip.isVisible().catch(() => false)
  826 |       if (!visible) {
  827 |         report(`${label}-igw-inspector`, { chip: false, payload_igws: payloadIgws })
  828 |         // A payload that carries an IGW must render one to select.
  829 |         expect(payloadIgws, `${label}: payload names IGWs but no chip is on the canvas`).toEqual([])
  830 |         return null
  831 |       }
  832 |       await chip.click()
  833 |       const panel = page.getByTestId("topology-service-detail-panel")
  834 |       await expect(panel).toBeVisible({ timeout: 30_000 })
  835 |       await page.waitForTimeout(1200)
  836 |       const shown = ((await panel
  837 |         .getByTestId("estate-operations-resource-id")
  838 |         .first()
  839 |         .textContent()
  840 |         .catch(() => null)) ?? "")
  841 |         .replace(/\s+/g, " ")
  842 |         .trim()
  843 |       const unresolved = await panel
  844 |         .getByTestId("estate-anchor-identity-unresolved")
  845 |         .first()
  846 |         .isVisible()
  847 |         .catch(() => false)
  848 |       const notFound = await panel
  849 |         .getByText(/not found in graph/i)
  850 |         .first()
  851 |         .isVisible()
  852 |         .catch(() => false)
  853 |       const reading = { chip: true, shown_resource_id: shown || null, unresolved, not_found: notFound, payload_igws: payloadIgws }
  854 |       report(`${label}-igw-inspector`, reading)
  855 |       await shot(page, `c1-${label}-igw-inspector`)
  856 | 
  857 |       // The canvas anchor must never reach the inspector as a resource id.
  858 |       expect(shown, `${label}: the inspector must not ask about the __igw__ canvas anchor`).not.toContain("__igw__")
  859 |       expect(notFound, `${label}: the IGW inspector must not report the gateway as missing from the graph`).toBe(false)
  860 |       if (payloadIgws.length > 0 && !unresolved) {
  861 |         // Whatever it shows must be a gateway the payload actually names.
  862 |         expect(
  863 |           payloadIgws.some(id => shown.includes(id)),
  864 |           `${label}: inspector shows ${shown || "<nothing>"}, payload names ${payloadIgws.join(", ")}`,
  865 |         ).toBe(true)
  866 |       }
  867 |       return reading
  868 |     }
  869 | 
  870 |     /** Close the drawer, select a different chip, and prove the panel follows
  871 |      *  the selection rather than keeping the previous resource. */
  872 |     async function reselect(label: string, previous: string | null) {
  873 |       const fullscreen = await enterFullscreen()
  874 |       await page.keyboard.press("Escape")
  875 |       await page.waitForTimeout(600)
  876 |       const panel = page.getByTestId("topology-service-detail-panel")
  877 |       const closed = !(await panel.isVisible().catch(() => false))
  878 |       const other = fullscreen.getByTestId("topology-service-node-icon").first()
  879 |       const haveOther = await other.isVisible().catch(() => false)
  880 |       let shown: string | null = null
  881 |       if (haveOther) {
  882 |         await other.click()
  883 |         await expect(panel).toBeVisible({ timeout: 30_000 })
  884 |         await page.waitForTimeout(1200)
  885 |         shown = ((await panel
  886 |           .getByTestId("estate-operations-resource-id")
  887 |           .first()
  888 |           .textContent()
  889 |           .catch(() => null)) ?? "")
  890 |           .replace(/\s+/g, " ")
  891 |           .trim() || null
  892 |       }
  893 |       const reading = { closed_on_escape: closed, reselected: haveOther, previous, shown_resource_id: shown }
  894 |       report(`${label}-drawer-reselect`, reading)
  895 |       expect(shown ?? "", `${label}: a reselected node must not show the __igw__ anchor`).not.toContain("__igw__")
  896 |       return reading
  897 |     }
  898 | 
  899 |     /** Logical groups carry their own band and are never counted as gaps. */
  900 |     async function readGroups(label: string) {
  901 |       const fullscreen = await enterFullscreen()
  902 |       const reading = await fullscreen.evaluate(root => {
  903 |         const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()
  904 |         const band = root.querySelector('[data-testid="topology-logical-group-band"]')
  905 |         const area = root.querySelector('[data-testid="topology-unplaced-area"]')
  906 |         const groups = band
  907 |           ? Array.from(band.querySelectorAll<HTMLElement>('[data-testid="topology-logical-group"]'))
  908 |           : []
  909 |         return {
```