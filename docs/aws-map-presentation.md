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

Nesting is only useful if the renderer knows which frame each service belongs
in, so every catalog entry carries a `scope`:

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

Not done in this change: the renderer does not yet *consume* `scope`.
`aws-frame.tsx` still places nodes by its existing logic, so §2 is a contract
the catalog now exposes and the frame has yet to read. Wiring it — the AZ ×
tier grid, the boundary lane, the regional and global lanes, and the explicit
unplaced area — is the next step.

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
