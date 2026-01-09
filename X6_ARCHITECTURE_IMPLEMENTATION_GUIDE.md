# 🏗️ AntV X6 Architecture View - Complete Implementation Guide

## Overview
This guide provides step-by-step instructions to enhance the Dependency Map with a professional AntV X6-based architecture visualization featuring true containment, functional lanes, and AWS-style design.

---

## Phase 1: Package Installation ✅ (Already Done)

The following packages are already installed:
- `@antv/x6@3.1.4`
- `@antv/x6-react-shape@3.0.1`
- `dagre@0.8.5`
- `react-aws-icons@1.2.1`

**Status:** ✅ All packages installed

---

## Phase 2: AWS Color Scheme & Icon Mapping

### Official AWS Service Colors

```typescript
// AWS Official Color Palette
const AWS_COLORS = {
  // Compute (Orange)
  EC2: '#F58536',
  Lambda: '#F58536',
  ECS: '#F58536',
  EKS: '#F58536',
  
  // Database (Blue)
  RDS: '#3F48CC',
  DynamoDB: '#3F48CC',
  ElastiCache: '#3F48CC',
  Redshift: '#3F48CC',
  
  // Storage (Green)
  S3: '#759C3E',
  S3Bucket: '#759C3E',
  EBS: '#759C3E',
  EFS: '#759C3E',
  
  // Security (Red)
  IAM: '#DD344C',
  IAMRole: '#DD344C',
  IAMPolicy: '#DD344C',
  SecurityGroup: '#DD344C',
  KMS: '#DD344C',
  
  // Networking (Purple)
  VPC: '#7B2FBE',
  Subnet: '#7B2FBE',
  ALB: '#7B2FBE',
  NLB: '#7B2FBE',
  NAT: '#7B2FBE',
  InternetGateway: '#7B2FBE',
  
  // Default
  Default: '#6B7280',
}
```

### Subnet Color Coding

```typescript
const SUBNET_COLORS = {
  public: {
    border: '#22c55e',    // Green
    background: '#f0fff4', // Light green
    label: 'Public'
  },
  private: {
    border: '#3b82f6',     // Blue
    background: '#ebf8ff',  // Light blue
    label: 'Private'
  },
  database: {
    border: '#0ea5e9',     // Cyan
    background: '#e0f2fe', // Light cyan
    label: 'Database'
  },
  default: {
    border: '#7B2FBE',     // Purple
    background: '#f3f4f6',  // Gray
    label: 'Subnet'
  }
}
```

---

## Phase 3: Functional Lanes (Dagre Layout)

### Lane Assignment Logic

```typescript
function assignFunctionalLane(nodeType: string, nodeData: any): number {
  // Lane 0: Internet/Gateways
  if (nodeType === 'Internet' || nodeType === 'InternetGateway' || 
      nodeType === 'NATGateway' || nodeType === 'External') {
    return 0
  }
  
  // Lane 1: Load Balancers/Entry Points
  if (nodeType === 'ALB' || nodeType === 'NLB' || 
      nodeType === 'SecurityGroup' || nodeType === 'WAF') {
    return 1
  }
  
  // Lane 2: Compute
  if (nodeType === 'EC2' || nodeType === 'Lambda' || 
      nodeType === 'ECS' || nodeType === 'EKS') {
    return 2
  }
  
  // Lane 3: Data
  if (nodeType === 'RDS' || nodeType === 'DynamoDB' || 
      nodeType === 'S3' || nodeType === 'S3Bucket' || 
      nodeType === 'ElastiCache') {
    return 3
  }
  
  // Default: Lane 2 (Compute)
  return 2
}
```

### Dagre Configuration

```typescript
const dagreConfig = {
  rankdir: 'LR',        // Left to Right
  nodesep: 150,         // Horizontal spacing between nodes
  ranksep: 200,         // Vertical spacing between ranks (lanes)
  align: 'UL',          // Align to upper-left
  edgesep: 50,         // Edge separation
  ranker: 'network-simplex' // Layout algorithm
}
```

---

## Phase 4: Container Node Styling

### VPC Container

```typescript
<VPCContainer>
  - Border: 3px solid #7B2FBE (Purple)
  - Background: rgba(123, 47, 190, 0.05) (Very light purple)
  - Border style: solid
  - Padding: 20px
  - Label: Top-left, white background, z-index: 1000
  - Min size: 600x400
</VPCContainer>
```

### Subnet Container

```typescript
<SubnetContainer subnetType={public|private|database}>
  - Border: 3px dashed [color based on type]
  - Background: [light color based on type]
  - Border style: dashed
  - Padding: 15px
  - Label: Top-left, white background, z-index: 999
  - Min size: 400x300
  - Parent: VPC container
</SubnetContainer>
```

---

## Phase 5: Resource Node Enhancement

### Node Features

1. **AWS Icon** (from react-aws-icons)
2. **Resource Name** (bold, 12px)
3. **Resource Type** (small, gray)
4. **Gap Count Badge** (if lpScore < 80, amber circle with count)
5. **Active Traffic Indicator** (green pulsing dot if has ACTUAL_TRAFFIC)

### Node Styling

```typescript
const nodeStyle = {
  width: 140,
  height: 120,
  backgroundColor: '#ffffff',
  border: `3px solid ${AWS_COLORS[type]}`,
  borderRadius: '12px',
  padding: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative'
}
```

---

## Phase 6: Edge Styling

### Edge Types

```typescript
const EDGE_STYLES = {
  ACTUAL_TRAFFIC: {
    stroke: '#10b981',      // Green
    strokeWidth: 4,
    style: 'solid',
    animation: 'flowing 2s linear infinite',
    zIndex: 100
  },
  ALLOWED: {
    stroke: '#8b5cf6',      // Purple
    strokeWidth: 2,
    style: 'dashed',
    zIndex: 50
  },
  CONFIGURED: {
    stroke: '#94a3b8',      // Gray
    strokeWidth: 1,
    style: 'dotted',
    zIndex: 10
  },
  HIGHLIGHTED: {
    stroke: '#fbbf24',      // Amber
    strokeWidth: 6,
    style: 'solid',
    zIndex: 200
  }
}
```

### Edge Labels

- Show protocol/port: `TCP/5432`
- Show traffic count: `(1.2K hits)`
- Show last seen: `(2h ago)`

---

## Phase 7: Neo4j Query Requirements

### Required Node Properties

```cypher
// Nodes must have:
- id: string (unique identifier)
- name: string (display name)
- type: string (EC2, RDS, VPC, Subnet, etc.)
- vpcId: string (optional, for VPC containment)
- subnetId: string (optional, for Subnet containment)
- isPublic: boolean (for subnet color coding)
- lpScore: number (for gap badge)
- arn: string (optional, for details)
```

### Required Edge Properties

```cypher
// Edges must have:
- source: string (source node id)
- target: string (target node id)
- type: string (ACTUAL_TRAFFIC, ALLOWED, etc.)
- protocol: string (TCP, UDP, etc.)
- port: string (port number)
- hit_count: number (optional, for traffic display)
- last_seen: string (optional, ISO timestamp)
```

### Example Neo4j Query

```cypher
MATCH (n:Resource)
WHERE n.SystemName = $systemName
OPTIONAL MATCH (n)-[r]->(m:Resource)
WHERE m.SystemName = $systemName
RETURN 
  n.id as id,
  n.name as name,
  n.type as type,
  n.vpcId as vpcId,
  n.subnetId as subnetId,
  n.isPublic as isPublic,
  n.lpScore as lpScore,
  n.arn as arn,
  collect({
    target: m.id,
    type: type(r),
    protocol: r.protocol,
    port: r.port,
    hit_count: r.hit_count,
    last_seen: r.last_seen
  }) as edges
```

---

## Phase 8: Component Structure

### Main Component: `GraphViewX6`

```typescript
function GraphViewX6({
  systemName,
  graphData,
  isLoading,
  onNodeClick,
  onRefresh,
  highlightPath
}: Props) {
  // State
  const [isClient, setIsClient] = useState(false)
  const [viewMode, setViewMode] = useState<'grouped' | 'all'>('grouped')
  const [selectedNode, setSelectedNode] = useState<any>(null)
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  
  // Effects
  useEffect(() => {
    // Load libraries
    // Initialize graph
    // Register React shapes
  }, [])
  
  useEffect(() => {
    // Update graph data
    // Apply Dagre layout
    // Handle highlight path
  }, [graphData, viewMode, highlightPath])
  
  // Render
  return (
    <div>
      {/* Toolbar */}
      {/* Graph Canvas */}
      {/* Sidebar */}
    </div>
  )
}
```

---

## Phase 9: Key Features to Implement

### 1. True Containment
- VPCs as large boxes containing subnets
- Subnets as medium boxes containing resources
- Resources nested inside their containers
- Containers expand/contract based on content

### 2. Functional Lanes
- Automatic lane assignment based on resource type
- Left-to-right flow: Internet → Load Balancers → Compute → Data
- Even spacing within lanes
- Clear visual separation between lanes

### 3. Active Traffic Visualization
- Green animated dots on nodes with ACTUAL_TRAFFIC
- Pulsing animation (2s cycle)
- Traffic count badge
- Edge animation (flowing effect)

### 4. Gap Count Badges
- Amber circle badge on nodes with lpScore < 80
- Shows unused permission count
- Click to view details

### 5. Export Functionality
- Export to PNG (high resolution)
- Export to SVG (vector)
- Export to JSON (data only)

---

## Phase 10: Implementation Checklist

- [x] Install packages
- [x] Basic X6 graph initialization
- [x] React shape registration
- [ ] Enhanced container styling (VPC/Subnet)
- [ ] Functional lane assignment
- [ ] Dagre layout with lanes
- [ ] AWS icon integration
- [ ] Active traffic indicators
- [ ] Gap count badges
- [ ] Edge animations
- [ ] Export functionality
- [ ] Error handling
- [ ] Loading states
- [ ] Empty states

---

## Phase 11: Testing

### Test Cases

1. **Empty Data**
   - Should show "No graph data available" message
   - Should not crash

2. **Single VPC**
   - Should render VPC container
   - Should show subnets inside
   - Should show resources inside subnets

3. **Multiple VPCs**
   - Should render multiple VPC containers
   - Should not overlap
   - Should be properly spaced

4. **ACTUAL_TRAFFIC Edges**
   - Should be green and animated
   - Should show traffic count
   - Should be thicker than other edges

5. **Highlight Path**
   - Should highlight source and target nodes
   - Should highlight connecting edge
   - Should center view on path

---

## Phase 12: Performance Optimization

1. **Virtual Rendering**
   - Only render visible nodes
   - Lazy load off-screen containers

2. **Debouncing**
   - Debounce search input
   - Debounce zoom/pan operations

3. **Memoization**
   - Memoize node/edge calculations
   - Memoize layout calculations

4. **Caching**
   - Cache graph layout
   - Cache rendered nodes

---

## Next Steps

1. Review current `graph-view-x6.tsx` implementation
2. Enhance container styling per Phase 4
3. Implement functional lanes per Phase 3
4. Add active traffic visualization per Phase 9
5. Add gap count badges per Phase 9
6. Test with real data
7. Optimize performance per Phase 12

---

## Visual Mockup Description

```
┌─────────────────────────────────────────────────────────────┐
│ [Refresh] [Grouped/All] [Search...] [Zoom] [Fit] [Export] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────┐    │
│  │ VPC: vpc-12345                                    │    │
│  │                                                   │    │
│  │  ┌──────────────────────────────┐                │    │
│  │  │ Subnet: public-subnet (🟢)   │                │    │
│  │  │                              │                │    │
│  │  │  ┌──────┐  ┌──────┐        │                │    │
│  │  │  │ ALB  │──│ EC2  │        │                │    │
│  │  │  └──────┘  └──────┘        │                │    │
│  │  │     │          │            │                │    │
│  │  └─────┼──────────┼────────────┘                │    │
│  │        │          │                             │    │
│  │  ┌──────────────────────────────┐                │    │
│  │  │ Subnet: private-subnet (🔵)  │                │    │
│  │  │                              │                │    │
│  │  │  ┌──────┐                   │                │    │
│  │  │  │ RDS  │                   │                │    │
│  │  │  └──────┘                   │                │    │
│  │  └──────────────────────────────┘                │    │
│  └───────────────────────────────────────────────────┘    │
│                                                             │
│  Legend: 🟢 Public | 🔵 Private | 🔵 Database              │
│          ━━━ ACTUAL_TRAFFIC | ━ ━ ALLOWED                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Support

For issues or questions, check:
- AntV X6 Docs: https://x6.antv.antgroup.com/
- Dagre Docs: https://github.com/dagrejs/dagre
- React AWS Icons: https://www.npmjs.com/package/react-aws-icons

