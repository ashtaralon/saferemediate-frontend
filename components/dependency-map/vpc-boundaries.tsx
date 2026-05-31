'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';

export interface SubnetGroup {
  subnetId: string;
  subnetName: string;
  isPublic: boolean;
  nodeIds: string[];
}

export interface VPCGroup {
  vpcId: string;
  vpcName: string;
  subnets: SubnetGroup[];
}

interface VPCBoundariesProps {
  vpcGroups: VPCGroup[];
  containerRef: React.RefObject<HTMLDivElement>;
  visible: boolean;
}

interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SubnetRect extends BoundingRect {
  subnetId: string;
  subnetName: string;
  isPublic: boolean;
}

interface VPCRect extends BoundingRect {
  vpcId: string;
  vpcName: string;
  subnetRects: SubnetRect[];
}

// 2026-05-31 — primitive replacement. See pattern_recurring_cosmetic_fix_
// signals_wrong_primitive (memory). Three patches in seven days
// (5/24 + 5/25 + 5/30) failed to stop the boundary from visually
// engulfing IAM Roles + S3 Bucket cards. Each cosmetic patch narrowed
// the failure surface — exclusion list extension, padding clip — but
// the underlying primitive (bounding-box-of-card-DOM-elements + padding)
// was wrong: card heights vary with content (number of SG rules, badge
// count, role permission summary), so the bounding box drifts every
// time the data shifts.
//
// New primitive: lane-based. The Flow Map's grid has a row of named
// columns: COMPUTE, SUBNETS, ROUTE TABLES, SECURITY GROUPS, NACLS,
// EGRESS GATEWAYS, VPC ENDPOINTS — all VPC-scoped — and IDENTITY,
// RESOURCES — global. Each VPC-scoped column carries
// `data-vpc-scoped-column="true"` on its wrapper div (set in
// traffic-flow-map.tsx). Column positions are determined by the grid
// definition, NOT by card content, so they don't drift when SG rules
// change or NACL badges expand. The VPC boundary is the bounding box
// of those column wrappers, plus a small margin.
//
// Multi-VPC: the producer (attacker-view-panel.tsx::vpcsById) can
// supply multiple VPCs but the renderer currently bundles all VPCs'
// cards into the same set of system-wide column lanes. Until cards
// gain per-VPC anchors, multi-VPC renders as a single combined
// boundary covering all VPC-scoped lanes. Visually correct for the
// single-VPC case (the reported bug); multi-VPC layout redesign is a
// separate Sprint.
const PADDING_X = 12;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 8;
const VPC_LABEL_HEIGHT = 32;
const SUBNET_LABEL_HEIGHT = 20;

// New primitive: find every VPC-scoped column wrapper. This replaces
// the old findNodeElements + findAllArchitectureNodes pair — both used
// the wrong primitive (DOM bounding box of individual cards). Lane
// positions are stable, structural, and independent of card content.
function findVpcScopedLaneElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-vpc-scoped-column="true"]')
  );
}

// Subnet-level: kept element-based because subnets ARE per-card visual
// groups (each subnet card has a data-subnet-id). The inner subnet
// boundary's failure mode wasn't the recurring one — it's the OUTER
// VPC box that was wrapping IAM/S3. Use the same selectors that the
// old code carefully restricted to VPC-scoped types.
function findSubnetCardElements(
  container: HTMLElement,
  subnetId: string
): HTMLElement[] {
  const el = container.querySelector<HTMLElement>(
    `[data-subnet-id="${subnetId}"]`
  );
  return el ? [el] : [];
}

function computeBoundingBox(
  elements: HTMLElement[],
  containerRect: DOMRect,
  paddingX = PADDING_X,
  paddingTop = PADDING_TOP,
  paddingBottom = PADDING_BOTTOM
): BoundingRect | null {
  if (elements.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    const relX = rect.left - containerRect.left;
    const relY = rect.top - containerRect.top;

    if (rect.width === 0 || rect.height === 0) continue;

    minX = Math.min(minX, relX);
    minY = Math.min(minY, relY);
    maxX = Math.max(maxX, relX + rect.width);
    maxY = Math.max(maxY, relY + rect.height);
  }

  if (!isFinite(minX)) return null;

  return {
    x: minX - paddingX,
    y: minY - paddingTop,
    width: maxX - minX + paddingX * 2,
    height: maxY - minY + paddingTop + paddingBottom,
  };
}

// Truncate a VPC ID for the boundary label. "vpc-086bcc2186fa42c96"
// becomes "vpc-086bcc21…" — first 12 chars + ellipsis. Full ID lives
// in the SVG <title> so hover shows it.
function truncateVpcId(vpcName: string): string {
  if (vpcName.length <= 13) return vpcName;
  return vpcName.slice(0, 12) + '…';
}

export function VPCBoundaries({
  vpcGroups,
  containerRef,
  visible,
}: VPCBoundariesProps) {
  const [vpcRects, setVpcRects] = useState<VPCRect[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const rafRef = useRef<number | null>(null);

  const recalculate = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    setContainerSize({
      width: container.scrollWidth,
      height: container.scrollHeight,
    });

    const rects: VPCRect[] = [];

    // Lane-based VPC bounding rect — computed ONCE from the column
    // structure, then shared across all VPCs in vpcGroups (see
    // multi-VPC caveat in the file header).
    const laneElements = findVpcScopedLaneElements(container);
    const laneBox = computeBoundingBox(laneElements, containerRect);

    for (const vpc of vpcGroups) {
      if (!laneBox) continue;

      // Each VPC gets its own rect; in single-VPC mode they're
      // identical. Clone to keep the per-VPC label intact.
      const vpcBox: BoundingRect = {
        x: laneBox.x,
        y: laneBox.y - VPC_LABEL_HEIGHT,
        width: laneBox.width,
        height: laneBox.height + VPC_LABEL_HEIGHT,
      };

      const subnetRects: SubnetRect[] = [];

      for (const subnet of vpc.subnets) {
        const subnetElements = findSubnetCardElements(container, subnet.subnetId);
        const subnetBox = computeBoundingBox(subnetElements, containerRect);
        if (!subnetBox) continue;

        subnetBox.y -= SUBNET_LABEL_HEIGHT;
        subnetBox.height += SUBNET_LABEL_HEIGHT;

        subnetRects.push({
          ...subnetBox,
          subnetId: subnet.subnetId,
          subnetName: subnet.subnetName,
          isPublic: subnet.isPublic,
        });
      }

      rects.push({
        ...vpcBox,
        vpcId: vpc.vpcId,
        vpcName: vpc.vpcName,
        subnetRects,
      });
    }

    setVpcRects(rects);
  }, [vpcGroups, containerRef]);

  useEffect(() => {
    recalculate();
  }, [recalculate]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        recalculate();
        rafRef.current = null;
      });
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [containerRef, recalculate]);

  useEffect(() => {
    const handleResize = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        recalculate();
        rafRef.current = null;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [recalculate]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(recalculate, 100);
    return () => clearTimeout(timer);
  }, [visible, recalculate]);

  return (
    <svg
      data-vpc-boundary-svg="true"
      className="absolute top-0 left-0 pointer-events-none"
      style={{
        width: containerSize.width || '100%',
        height: containerSize.height || '100%',
        zIndex: 1,
        opacity: visible ? 1 : 0,
        transition: 'opacity 300ms ease-in-out',
      }}
    >
      <defs>
        <filter id="vpc-label-bg" x="-4" y="-2" width="108%" height="120%">
          <feFlood floodColor="#1e293b" floodOpacity="0.9" result="bg" />
          <feMerge>
            <feMergeNode in="bg" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {vpcRects.map((vpc) => {
        const labelText = truncateVpcId(vpc.vpcName);
        // Width of the label pill — proportional to truncated text.
        // Using a monospace-ish 7.5 px-per-char heuristic; tighter than
        // before because the truncated label is short.
        const labelPillWidth = Math.min(
          labelText.length * 7.5 + 56,
          vpc.width - 24
        );
        return (
          <g
            key={vpc.vpcId}
            data-vpc-boundary-id={vpc.vpcId}
          >
            {/* VPC boundary rect.
                rx 12 (down from 16) for a tighter corner that reads as
                "lane group" rather than "container card". */}
            <rect
              x={vpc.x}
              y={vpc.y}
              width={vpc.width}
              height={vpc.height}
              rx={12}
              ry={12}
              fill="rgba(59, 130, 246, 0.04)"
              stroke="#3b82f6"
              strokeWidth={2.5}
              strokeDasharray="12,6"
              opacity={0.8}
            />

            {/* VPC label pill — top-left of the boundary. Truncated id;
                full id in <title> for hover. */}
            <g>
              <rect
                x={vpc.x + 12}
                y={vpc.y + 6}
                width={labelPillWidth}
                height={22}
                rx={11}
                ry={11}
                fill="#1e40af"
                opacity={0.9}
              />
              <text
                x={vpc.x + 24}
                y={vpc.y + 21}
                fill="#ffffff"
                fontSize={11}
                fontFamily="system-ui, -apple-system, sans-serif"
                fontWeight={600}
              >
                <title>VPC &middot; {vpc.vpcName}</title>
                VPC &middot; {labelText}
              </text>
            </g>

            {vpc.subnetRects.map((subnet) => (
              <g key={subnet.subnetId}>
                <rect
                  x={subnet.x}
                  y={subnet.y}
                  width={subnet.width}
                  height={subnet.height}
                  rx={8}
                  ry={8}
                  fill={subnet.isPublic ? '#f59e0b08' : '#22c55e08'}
                  stroke={subnet.isPublic ? '#f59e0b' : '#22c55e'}
                  strokeWidth={1.5}
                  strokeDasharray={subnet.isPublic ? '8,4' : 'none'}
                />

                {/* Subnet label. V2-6 (2026-06-01): prefix "Public · " on
                    public subnets so the orange-dashed boundary's semantic
                    is unambiguous. Without the prefix the label is just the
                    subnet ID, which doesn't tell the operator WHY the boundary
                    is colored orange + dashed.
                    Private subnets keep the bare id — green solid carries the
                    "private" meaning unambiguously in AWS visual convention. */}
                {(() => {
                  const labelText = subnet.isPublic
                    ? `Public · ${subnet.subnetName}`
                    : subnet.subnetName
                  return (
                    <>
                      <rect
                        x={subnet.x + 8}
                        y={subnet.y + 4}
                        width={
                          Math.min(
                            labelText.length * 6 + 12,
                            subnet.width - 16
                          )
                        }
                        height={16}
                        rx={8}
                        ry={8}
                        fill={subnet.isPublic ? '#78350f' : '#14532d'}
                        opacity={0.8}
                      />
                      <text
                        x={subnet.x + 14}
                        y={subnet.y + 16}
                        fill={subnet.isPublic ? '#fbbf24' : '#86efac'}
                        fontSize={10}
                        fontFamily="system-ui, -apple-system, sans-serif"
                        fontWeight={500}
                      >
                        {labelText}
                      </text>
                    </>
                  )
                })()}
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
