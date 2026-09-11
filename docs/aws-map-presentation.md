# How the estate map presents AWS

**Scope.** Topology → Cloud map → Network topology, rendered by
`components/topology-v0-2/aws-frame.tsx`. This document is the research behind
what icon each service wears, which frame it is drawn inside, and what the map
says when the graph does not know. The machine-readable form of everything
below is `components/topology-v0-2/aws-architecture-icons.ts`; the guards are
`__tests__/topology-aws-presentation-catalog.test.ts`.

**Sources.** AWS Reference Architecture Diagrams
(`aws.amazon.com/architecture/reference-architecture-diagrams/`), the AWS
Architecture Icons set, and the community best-practice write-up at
`diagrams.so/blog/aws-architecture-diagram-best-practices`.

---

## 1. What AWS's own diagrams actually do

Five conventions recur across the reference diagrams, and they are the ones
that make a diagram legible at a glance:

**Nesting is fixed and six deep.** Region → VPC → Availability Zone → subnet
tier → subnet → resources. Every level is a labelled frame, and a resource's
meaning comes from which frames enclose it. An EC2 instance drawn one level
out is a different claim about the network.

**Not everything goes in a subnet.** This is the single most common error in
hand-drawn AWS diagrams. S3, DynamoDB, SQS, EventBridge, Step Functions and
API Gateway are *regional* — they sit in the region frame, outside every VPC,
and are reached over an endpoint. Drawing a bucket inside a private subnet
implies a network position it does not have.

**Some things sit ON a boundary, not inside one.** An Internet Gateway, a NAT
Gateway and a VPC endpoint are drawn straddling the VPC edge, because that is
what they are: the crossing point. AWS's own S3-over-endpoint diagrams place
the endpoint icon on the VPC line.

**Global services sit above the region.** IAM, Organizations and Route 53 are
not in a region and are not drawn in one.

**A security group is a dashed boundary, never a node.** It is a property of
what it protects, so it is drawn as a dashed outline around those resources.

**Name services precisely.** Not "load balancer" — "Application Load
Balancer". Not "database" — "Amazon RDS". The precise name carries the
behaviour; the generic one loses it.

### The structural finding

Security Group, Subnet, Region, Availability Zone and Internet have **no node
icon in the official AWS icon set.** For a long time this looked like a gap in
our icon coverage. It is not. Those five are *frames* in AWS's visual grammar,
and the set omits them deliberately. Their absence is the convention.

So the catalog declares them icon-less on purpose (`slug: null`,
`precision: "none"`) rather than leaving them to fall through to an
unknown-type marker, and the test asserts that this is a declaration rather
than an oversight.

### Service icon vs resource icon

The icon set ships two kinds, and they are not interchangeable:

- **Service icons** — the filled, category-coloured square (Amazon EC2, AWS
  Lambda). This is what a *service* node wears, and what the map's coloured
  icon squares are built to hold.
- **Resource icons** (`aws-res-*`) — line art on white, for things that are
  not services in their own right: an Internet Gateway, a NAT Gateway, an ENI,
  an IAM role, an Application Load Balancer.

Prefer the service icon. Reach for `aws-res-*` only when no service icon names
the thing. Getting this backwards produces line art on a coloured square,
which reads as a rendering bug.

---

## 2. Placement, as data

### Who owns placement: two tables, one authority

`components/topology-v0-2/estate-placement.ts` is the placement authority. Its
`MapSlot` / `mapSlotForType` / `resolveNodePlacement` decide where a node is
**drawn**, they are what the renderer already consumes, and they are the only
answer to that question.

The catalog's `scope` is **not** a second answer. It records what AWS says a
service **is**, relative to the canonical nesting — which is a different
question, and the two legitimately diverge. API Gateway *is* regional (outside
every VPC, reached over an endpoint) and is *drawn* in the ingress band, because
that is where a reader looks for the front door. Nothing dishonest is asserted
by that pairing, because the ingress band renders above the AZ grid spanning its
full width and is not a subnet.

Recorded because this was got wrong on the first pass. `scope` was added without
grepping for prior art, so for a while the repo had two tables that both looked
like placement, nothing consumed the new one, and they disagreed about four
types. The reconciliation: rename to `AwsServiceScope` / `awsServiceScope`, state
in the file header that it is not a placement instruction, and put a guard on the
seam — `__tests__/topology-aws-presentation-catalog.test.ts` now asserts that no
type is drawn in a subnet cell unless its scope is `in-subnet`, that every type
the authority places is nameable by the catalog, and that the only slot-vs-scope
divergence on record is API Gateway's. A *new* divergence fails CI, where before
it would have quietly become a contradiction between two tables.

That guard derives its type list from the two tables' own keys. The hand-typed
census it replaced missed `EKS`, `EKSCluster`, `Fargate`, `Redshift`,
`RedshiftCluster`, `ECSTask` and `GatewayLoadBalancer` — and so reported 2
contradictions where there were 4, and no coverage hole where there were 5 types
the authority placed in a tier while the catalog could not name them at all.

Two real defects came out of it, both in the catalog rather than the authority:

- **The ECS/EKS family read `regional`.** A cluster's *control plane* is
  regional; its *compute* is not — in `awsvpc` mode (the only mode Fargate
  supports) every task gets an ENI in a subnet you chose, and the task is what a
  security reader is looking for. They are now `in-subnet`, agreeing with the
  authority, which draws them in the app tier. `TaskDefinition` stays `regional`:
  a versioned registry document has no ENI.
- **Five placed types had no catalog entry at all** — placed in a tier and
  rendering as "type unresolved". `Redshift`/`RedshiftCluster`, `Fargate`,
  `ECSTask` and `GatewayLoadBalancer` now carry their own official icons (all
  four slugs CDN-verified with controls before use).

### The scope vocabulary — and the slot each scope is drawn in (Map v3)

Since Map v3 every type the catalog can name resolves to a **declared** rule
in `estate-placement.ts` — `hidden` is still the default for an unknown type,
but for a known type it is a written-down decision, and
`placementRuleForType` / `isDeclaredOffCanvas` tell the two apart. The seam
test asserts it: no catalog key or alias may fall through to the default. The
slot vocabulary is the taxonomy on the Platform Map v3 spec:

| slot | mirrors | drawn | holds |
|---|---|---|---|
| `external` | outside the AWS Cloud frame | payload sentinels | Internet, customer gateway |
| `global` | inside AWS Cloud, above the Region | a band, only with content (renderer: task T5) | Route 53 |
| `ingress` | regional, spans the AZs at VPC level | the band above the AZ grid | ALB / NLB / GWLB, target groups, API Gateway (accepted divergence) |
| `web` / `app` / `data` | public / private / DB subnet | the AZ × tier cell the graph resolves | EC2, ECS/EKS/K8s pods, a Lambda **with** a subnet, RDS/Neptune/DocumentDB/Redshift, ElastiCache, EFS |
| `boundary` | straddles the VPC edge | the frame's boundary strip, from `vpc_topology.edges` | IGW, NAT, VPC endpoints, EIP, VPN GW, peering, EIC endpoint |
| `serverless` | column 1 body | the runtime lane | a Lambda **without** a subnet |
| `triggers` | column 1 band | the triggers band | EventBridge, SQS, SNS, Step Functions |
| `regional` | column 2 | the regional lane | S3, DynamoDB, KMS, Secrets Manager, CloudTrail, CloudWatch Logs, Athena |
| `container` | frames, never nodes | a boundary with a label | VPC, Subnet, Security Group, NACL, route table, account |
| `hidden` | Inventory and panels only | nothing | IAM family, STS sessions, launch templates, task definitions, config rules, ENIs |

`vpc-conditional` is resolved in the authority now: `resolveNodePlacement`
takes `subnetResolved` and answers the subnet's tier for a function the graph
places, and `serverless` for one it does not. `extractServerlessOutsideVpc`
asks it rather than inspecting the subnet itself, so one question has one
answer.

Every catalog entry carries a `scope`:

| `scope` | Drawn | Examples |
|---|---|---|
| `in-subnet` | inside an AZ × tier cell | EC2, RDS, Neptune, ALB, ENI, ECS service |
| `vpc-boundary` | on the VPC edge | IGW, NAT GW, VPC endpoint, EIP, VPN GW |
| `vpc-conditional` | in-VPC **only if the graph says so** | Lambda |
| `regional` | in the region, outside every VPC | S3, DynamoDB, SQS, SNS, EventBridge, Step Functions, API Gateway, CloudTrail |
| `global` | above the region frame | IAM role/policy/user, Organizations, SCP, Route 53 |
| `container` | a frame, not a node | VPC, Subnet, Security Group, NACL, Route table, Account |
| `external` | off-estate | Internet, customer gateway |

`vpc-conditional` is the one that matters most. **Most Lambdas have no VPC
config.** Placing them in a subnet by default would assert a network position
with no evidence, so the scope forces the renderer to read `vpc_config` from
the graph and, absent one, draw the function in a runtime lane outside the VPC
boundary. A Lambda's placement is a graph fact or it is not drawn as placed.

The same rule governs everything else here: `scope` says *where this kind of
service can go*, and the graph says *where this instance actually is*. When the
graph has no subnet for an in-subnet service, the answer is the explicit
unplaced area — not a guessed cell.

---

## 3. The type vocabulary is wider than it looks

The backend normalizes graph labels in `api/topology_risk._label_to_type`:
~39 label spellings onto 17 canonical short names. Critically, it ends with

```python
}.get(label, label)
```

so every label it does *not* map arrives at the frontend as the **raw graph
label**. Any presentation table keyed only on the 17 canonical names silently
misses the rest.

And the graph genuinely carries twins. Verified against the live graph:

| Same thing, spelled | Folded to |
|---|---|
| `ApiGateway`, `APIGateway`, `APIGATEWAY` (three) | `APIGateway` |
| `RDS`, `RDSInstance`, `RDSCluster` | `RDS` |
| `NACL`, `NetworkACL` | `NACL` |
| `CloudTrail`, `CloudTrailTrail` | `CloudTrail` |
| `Account`, `AWSAccount` | `Account` |
| `EC2`, `EC2Instance` | `EC2` |
| `StepFunction`, `StateMachine` | `StepFunction` |

The catalog therefore has two layers: `CATALOG` keyed by canonical type, and
`ALIASES` mapping every observed spelling onto a canonical key. The test
asserts that no alias dangles and no alias shadows a real key, so a typo fails
CI instead of quietly dropping an icon.

### The Neptune retype, which is why this work started

`api/topology_risk` retypes an `RDS` row to `Neptune` or `DocumentDB` from the
`engine` property, and `_retype_nodes_from_observed_listeners` does the same
from observed listener ports (8182 → Neptune). This graph has a live instance:
`arn:aws:rds:eu-west-1:745783559495:db:cyntro-pilot-instance` carries
`engine: "neptune"`.

The old icon map had no `Neptune` key and no `DocumentDB` key. So an RDS
instance whose engine was correctly identified **lost its icon** — Neptune
fell through to a hand-drawn generic glyph, and DocumentDB fell all the way to
the unknown-type `?`. Making the engine family more accurate made the chip less
legible. A C1 production QA pass on 2026-09-02 caught exactly this: both
`cyntro-testbed-webshop-writer` chips in the Data tier rendered `?`.

Both now carry their own official icon, and
`__tests__/topology-neptune-glyph.test.tsx` guards the regression.

---

## 4. Honesty rules

Three states, and no fourth:

**`precision: "exact"`** — the official AWS icon for that resource.

**`precision: "family"`** — an icon borrowed from the parent service because
AWS ships none for the resource itself. A Target Group wears the ALB icon; an
Instance Profile wears the IAM Role icon. `awsIconIsFamilyFallback()` exposes
this so the map can avoid presenting a borrowed icon as resource-exact
evidence.

**`precision: "none"`** — no defensible icon exists, so the card renders with
no glyph. This is the frames case (§1).

An unrecognized type returns `null` from every accessor. Null is a real answer:
the caller must render an honest "type unresolved" card and send the node to
the unplaced area. We do not substitute a lookalike icon to fill a hole, and we
never invent a slug — every slug in the catalog returned HTTP 200 from the CDN,
and `scripts/verify-aws-icon-slugs.sh` re-checks them on demand with mandatory
positive and negative controls.

That verification is a **script, not a CI test**, on purpose: a CI test that
reaches a third-party CDN fails the build on a network blip for a reason
unrelated to the change. So the unit test asserts each slug is in a frozen
verified set (catching typos offline) and the script is what refreshes that set
against reality.

### Engineer placement override

An engineer may move a node the graph could not place. That override is
recorded as **operator provenance** — never written back as a graph fact. The
map's position is then "an engineer put it here", which is a different and
weaker claim than "the graph says it is here", and it must stay
distinguishable.

---

## 5. Measured effect

Executed over the 62 `type` strings the backend can emit for this estate
(two censuses against the live graph: `labels(n)` and `:Resource.type`), by
running the real three-branch decision chain in `nodeIcon()` — official icon,
then the hand-drawn glyph switch, then the unknown-type marker:

| | official icon | hand-drawn glyph | declared frame | renders `?` |
|---|---|---|---|---|
| before | 23 | 1 | — | **38** |
| after | 59 | 0 | 3 | **0** |

38 of 62 types reached production rendering a `?`. The remaining three draw no
glyph because they are frames, which is the AWS convention rather than a gap.

---

## 6. Status

Done: the catalog, the alias folding, the placement scopes, CDN verification of
all 47 distinct slugs, and the guard suite.

**The light theme was already there.** Worth recording, because it was assumed
missing and a restyle was nearly written on top of it. Read from
`aws-frame.tsx` rather than inferred:

| Element | Already implemented |
|---|---|
| Palette | `PAL.bg #F6F8FA`, `PAL.cardBg #FFFFFF` — light, not dark |
| VPC frame | `2px solid #00C2A8`, header `#0E8B7A` |
| Tier bands | `TIER_SIDEBAR_LABEL` = WEB TIER / APPLICATION TIER / DATABASE TIER |
| Subnet cards | `SUBNET_BG` green/blue/purple, matching `SUBNET_BORDER` and `SUBNET_LABEL_FG` (`#1E8E3E` / `#1565C0` / `#4527A0`) |
| Lane headers | `Lambda runtime · outside subnet grid ({n})`, `Regional · {families} ({n})` — payload-derived |

The one frame that had drifted was the **region**: `1.5px dashed #5A6B7A`,
slate, reading as page chrome rather than as a boundary. It is now teal dashed
against the VPC's teal solid — AWS separates those two levels by stroke style,
not by colour. `__tests__/topology-frame-nesting-grammar.test.tsx` now asserts
the ancestry and both strokes, and was checked to fail on the slate value it
replaced.

Also done: the two-table reconciliation in §2 — `AwsServiceScope` renamed away
from the placement name it was squatting on, the seam guard that fails CI on a
new divergence, the ECS/EKS scope correction, and the four missing services.
Both new guards were checked by reintroducing the defect and watching them fail
(`ECS`/`ECSCluster` and `Redshift`/`RedshiftCluster` respectively), not just by
being green.

Also done, and the first place the renderer *consumes* `scope`: the explicit
unplaced area and the engineer placement override in §7. `aws-frame.tsx` reads
`awsServiceScope` through `isOffCanvasByDesign()` to tell "no rule knows this
type" from "an identity or config artifact we deliberately keep off the map" —
a distinction `mapSlotForType` cannot make, because `"hidden"` is its default
return and no rule in `PLACEMENT_RULES` declares it.

The boundary lane's *position* is now what the table says. IGWs and VPC
endpoints render on the owning VPC frame's top border — `boundaryStrip` in
`VpcCanvasFrame`, which in presentation mode is the frame's row-1 subgrid track,
i.e. the VPC's own top edge. Before this, both were drawn in a 136px column to
the RIGHT of the VPC card (#349), outside its border: the devices read as loose
chips *beside* a VPC rather than attachments *to* it, and the internet path left
the canvas sideways to reach the IGW instead of running down from the top edge
to the load balancers under it. NAT gateways were already in-frame (the ALB
band's fallback row).

Placing them on a frame made "which VPC?" a question the region-level column
never had to answer, so `buildVpcFrames` now groups endpoints by `vpc_id` the
way it already grouped IGWs — with one deliberate difference, asserted in
`__tests__/topology-per-vpc-frames.test.ts`: a missing `vpc_id` falls back to
the primary frame (BE deploy lag on the stamp), but a `vpc_id` naming a VPC this
view draws no frame for is **dropped**, never re-homed. Re-homing it would print
a sibling VPC's SSM endpoint on this VPC's edge — the mislabel
`narrowSystemEstateToVpc` guards against upstream.

That column survives for exactly one thing and is titled for it — "Not in this
VPC", an ingress device the system really has in a VPC this canvas does not
draw. It is text, not a chip, and it renders only when there is such a device.

Still not consuming `scope` as a *column*: even on the boundary, IGWs, NAT
gateways and VPC endpoints reach their position through their own typed code
paths (`igws` / `vpces` / `nat_gws` off `VpcTopology.edges`) rather than by the
renderer reading `awsServiceScope(type) === "vpc-boundary"`. Seven catalog
entries carry that scope; the other four — `EIP`, `VPNGateway`, `EICEndpoint`,
`VPCPeering` — appear nowhere under `components/topology-v0-2/` outside the
catalog itself, so the Estate Map does not draw them at all. The global lane is
likewise unconsumed: global services are filtered off the canvas rather than
drawn above the region frame. Both remain presentation gaps, not honesty gaps —
nothing is drawn in a position the graph does not support.

### The delivery chain is healthy — so "I still see the old map" is a code gap

Recorded because the obvious explanation was wrong, and acting on it would have
sent someone to fix a deployment that is working. Probed 2026-09-09T21:24Z:

| Target | Result |
|---|---|
| `cyntro-c1.vercel.app` | `307 → /login`, live. `GET /api/build-version` → `9de4f14d` |
| `saferemediate-frontend.vercel.app` (this repo's linked Vercel project) | `503 x-vercel-error: DEPLOYMENT_PAUSED` |
| `cyntro.io` | `503 x-vercel-error: DEPLOYMENT_PAUSED` |
| `cyntro-frontend.vercel.app` (referenced in older docs) | `404 DEPLOYMENT_NOT_FOUND` |

The two 503s look alarming and are not. `lib/server/backend-url.ts` opens with
"The old shared backend is suspended. C1 is the tenant-scoped serving surface
that owns the durable Attack Path snapshots used by this UI", and goes on to
warn that C1 "must never silently fall back to the legacy SaaS service: that
service can be paused independently". The pause is the documented steady state
of a retired surface, not an outage.

What matters is the last column: `9de4f14d` is the `origin/main` HEAD this work
branched from. **C1 serves current main, exactly.** So no map change is stuck in
transit, and any difference between the deployed map and the intended design is
a gap in main's code — which is how the slate region frame above was found.

Use `GET /api/build-version` before diagnosing a "stale UI"; it is cheaper than
reasoning about Vercel and it answers the actual question.

---

## 7. The placement defect the scope column exists to fix

Measured, not read. A probe rendered `AwsFrame` with nodes the graph cannot
place and asserted on what reached the DOM, with a control node that *can* be
placed so an all-absent result could not be mistaken for a broken probe.

| Probe node | Why it can't be placed | Rendered? |
|---|---|---|
| `EC2` with a `subnet_id` absent from `subnets` | dangling subnet reference | **present** — in an arbitrary AZ |
| `EC2` with `subnet_id: null` | no subnet in the graph | **present** — in an arbitrary AZ |
| `Neptune`, `EKS`, `DocumentDB`, no subnet | no subnet in the graph | **present** — in an arbitrary AZ |
| `QuantumLedger` (type in no table) | type unresolved | **absent** — silently dropped |
| `PROBE-control-placed` (real subnet) | — | present (control) |

Two distinct failures, and the first is the worse one:

**A guessed AZ is drawn as a fact.** `pickSyntheticAz` (aws-frame.tsx:4118)
falls back through "any subnet in this tier" → "any subnet at all" →
`[...byAzAndTier.keys()][0]`, the first AZ in map-iteration order. A node with no
subnet in the graph is therefore drawn inside a specific AZ × tier cell, which is
the map's strongest structural claim, on no evidence. Nothing marks it as
inferred. This is the "never fabricate" rule breaking in the one place that is
hardest to notice, because a chip in a plausible cell looks like data.

**A node the map can't place vanishes.** `computeCanvasGrid` declares
`unplacedNodes` (4114), pushes to it (4196), sorts it (4205) — and then omits it
from the returned object (4226), along with `serverlessNodes` (4113). The code's
own comment already says such a node "falls through to the unplaced bucket and
disappears from the map". The bucket is real, it is filled, and no caller can
read it.

Both are the same mistake in opposite directions: the map answers "I don't know
where this is" with either a confident guess or with silence, and never with "I
don't know". The chosen fix is an **explicit unplaced area outside the AZ grid** —
the honest empty state, with the node visible and its reason stated
(`no subnet in graph`, `subnet not found`, `type unresolved`) — plus an
**engineer placement override** for the cases a human can resolve, recorded as
operator provenance and never written back as a graph fact (§4).

### What shipped

`pickSyntheticAz` is deleted. Both of its call sites now return a specific
reason, and `computeCanvasGrid` returns `unplacedNodes` and `operatorPlacedIds`.

**A third lost population turned up while fixing the first two, and it was the
largest.** `buildVpcFrames` collected every node that resolved to no VPC into a
local `outside` array and dropped it — so a node with neither a VPC nor a subnet
was invisible no matter what the grid did, and an override on it would have been
recorded and then silently ignored. Overridden no-VPC nodes are now routed into
the frame the engineer named; the rest are reported.

Four reasons, because the remedy differs and "unplaced" teaches an operator
nothing:

| Reason | Means | Remedy |
|---|---|---|
| `no-subnet-in-graph` | the node names no subnet | run the subnet/ENI collector |
| `subnet-not-in-graph` | names a subnet absent from the payload | dangling reference; re-sync |
| `az-unknown-for-subnet` | subnet resolved, carries no AZ | the subnet row is incomplete |
| `type-unrecognized` | no placement rule knows the type | add it to `estate-placement.ts` |

`az-unknown-for-subnet` was unreachable when first written, and reachability was
the bug. `subnetInCanvasScope` drops an AZ-less subnet — correctly, since it has
no column — so the scoped lookup could only ever report a dangling reference,
sending an operator to re-run a collector that had already returned the subnet.
Placement is scoped; diagnosis is not. The classifier now falls back to the
AZ-less subnets specifically.

Three things the override deliberately is not:

- **Not stronger than evidence.** Consulted only after every subnet read fails.
  A node the graph can place ignores its override entirely.
- **Not able to conjure geometry.** It must name an AZ some subnet in that VPC
  reports, and it must name the frame it targets — same-region VPCs share AZ
  names, so matching on AZ alone would draw one node in every frame at once.
- **Not indistinguishable from data.** Dashed amber border, a `SET` badge, a
  `data-operator-placed` attribute, and a permanent "Placed by an engineer —
  operator provenance, not evidence" list. All of it funnels through
  `ServiceIconShell`, which is the one component both density renderers reach,
  so there is no path to an unbadged operator-placed chip.

There is no `pruneOverrides…`: a collector run that temporarily loses a subnet
must not permanently destroy an engineer's assertion. A stale override is inert
(the grid refuses it) and filtered out of the provenance list, so it costs one
localStorage entry and comes back correct if the cell returns.

**Guards** — `__tests__/topology-unplaced-placement.test.tsx` (38) and
`__tests__/topology-placement-overrides-storage.test.ts` (28). The first
assertion is an invariant over every occupied cell, not an example: a node sits
in `(az, tier)` only if one of its own subnets resolves to that az and tier, or
`operatorPlacedIds` names it. Written that way because `pickSyntheticAz` had
three fallbacks and an example only pins whichever one fires. Each guard was
checked by reintroducing the defect it exists for and watching it fail — the
fabrication (26 fail), the dropped bucket (19), `"hidden"` treated as unknown
(1), an override matched on AZ alone (1), and an override consulted before
evidence (1) — then restoring the file and confirming the checksum.

The host's scope fence has its own history: the load and persist effects run in
the same commit, so persisting on the new scope key while state still held the
previous scope's overrides stamped one VPC's placements into another's key. The
value now carries the scope it was loaded for, and `placement-overrides.ts` owns
the rule rather than the view.

### What will land in the unplaced area — read from source, not sized on C1

**How the endpoint decides placement** (`api/topology_aws.py`, read directly):

- Line 305 restricts the per-subnet workload read to
  `EC2Instance | LambdaFunction | RDSInstance` and excludes `NetworkInterface`
  explicitly. ENIs are plumbing this endpoint deliberately never serves, so
  however many of them lack a subnet, none of them can reach the unplaced area.
- All five subnet reads in that file traverse `IN_SUBNET`
  (96, 304, 335, 342, 398). None consults a node's `subnet_id` property. A
  workload whose subnet the graph records **only** as a property therefore
  arrives with no placement, and `no-subnet-in-graph` is accurate about the
  payload it was handed.
- RDS is the case the override exists for. A DB instance can reach subnets by
  `ELIGIBLE_SUBNET` — the DB subnet group, which lists *candidate* subnets — and
  a candidate list cannot name one cell. That is a genuine unknown, not a
  collector gap.

**The size of that population is not measured here, and the count I first wrote
was wrong.** It came from `mcp__cyntro-neo4j__*`, which answers
`CALL dbms.components()` with `Neo4j Kernel 5.27-aura` — Neptune implements no
`dbms.*` procedures, so a successful answer to that call is itself proof of
engine. That Aura is frozen (newest `CollectorRun.started_at`
`2026-08-20T22:40:37Z`) and holds materially different data from C1. Numbers off
it are not production evidence, so they are not recorded as such.

C1 is reachable only from a process holding `NEPTUNE_ENDPOINT`. Sizing the
unplaced area for real means running the per-kind
`IN_SUBNET`-vs-`subnet_id`-vs-neither count from the projector worker, i.e. a
workflow dispatch — worth doing, and stated as unmeasured until it is.

The reason strings are what make that measurement unnecessary for shipping: the
area names its own population at render time, per node, with the remedy
attached. Whether it holds six nodes or sixty, none of them is a chip drawn in a
cell nobody chose.
