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

// 2026-05-30 — asymmetric padding. The previous symmetric 32px box
// extended 32px below the deepest node and that bottom edge cut
// straight through the "IDENTITY · IP 1 · ROLES 1 · POLICIES 2" and
// "RESOURCES (1)" lane-header text that sits just below the top
// network lanes. Bottom padding shrunk to 8px so the dashed line
// ends tight against the last VPC-scoped card without overlapping
// downstream labels. Side/top padding preserved at 32px.
const PADDING_X = 32;
const PADDING_TOP = 32;
const PADDING_BOTTOM = 8;
const VPC_LABEL_HEIGHT = 32;
const SUBNET_LABEL_HEIGHT = 20;

function findNodeElements(
  container: HTMLElement,
  nodeIds: string[]
): HTMLElement[] {
  const elements: HTMLElement[] = [];
  for (const nodeId of nodeIds) {
    // VPC-scoped selectors only. Identity selectors (data-role-id /
    // data-ip-id) are deliberately omitted — IAMRoles / InstanceProfiles
    // are IAM-service-global and lay out to the right of RESOURCES, so
    // including them would stretch the dashed box across the canvas
    // and visually engulf S3 (the 2026-05-24 "VPC box wraps S3" bug).
    // data-gateway-id is also out — IGWs ATTACH to a VPC but render in
    // the EGRESS row; anchoring them collapses the box vertically
    // through the resources row. The IGW sits AT the boundary visually
    // by design.
    const selectors = [
      `[data-node-id="${nodeId}"]`,
      `[data-compute-id="${nodeId}"]`,
      `[data-subnet-id="${nodeId}"]`,
      `[data-sg-id="${nodeId}"]`,
      `[data-nacl-id="${nodeId}"]`,
    ];
    for (const selector of selectors) {
      const el = container.querySelector<HTMLElement>(selector);
      if (el) {
        elements.push(el);
        break;
      }
    }
  }
  return elements;
}

function computeBoundingBox(
  elements: HTMLElement[],
  containerRect: DOMRect
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

    // Skip elements that are not visible or have zero dimensions
    if (rect.width === 0 || rect.height === 0) continue;

    minX = Math.min(minX, relX);
    minY = Math.min(minY, relY);
    maxX = Math.max(maxX, relX + rect.width);
    maxY = Math.max(maxY, relY + rect.height);
  }

  if (!isFinite(minX)) return null;

  return {
    x: minX - PADDING_X,
    y: minY - PADDING_TOP,
    width: maxX - minX + PADDING_X * 2,
    height: maxY - minY + PADDING_TOP + PADDING_BOTTOM,
  };
}

// Fallback: find network-scoped architecture nodes in container.
//
// 2026-05-24 user report: the VPC dashed boundary visually wrapped
// the S3 RESOURCES lane card. Resources (S3, DynamoDB, KMS) are
// GLOBAL AWS services — they don't live inside any VPC. Including
// `[data-resource-id]` here pulled them into the bounding box, which
// made the box overshoot to the right past the EGRESS GATEWAYS lane
// and look like the IGW + S3 were both VPC-internal. Excluded.
//
// API call chips ([data-api-id]) are also outside the VPC trust
// boundary — they represent the AWS service endpoint the workload
// invokes. Excluded for the same reason.
//
// 2026-05-25: also REMOVED data-role-id, data-ip-id, data-gateway-id
// from the fallback. Roles + InstanceProfiles are IAM-service-global
// (not VPC-scoped) and stretched the box to the right past S3.
// IGW/NAT attach to a VPC but lay out in the EGRESS row next to
// RESOURCES; anchoring them collapses the box vertically through
// resources. The IGW visually sits AT the boundary today, by design.
function findAllArchitectureNodes(container: HTMLElement): HTMLElement[] {
  const selectors = [
    '[data-compute-id]',
    '[data-subnet-id]',
    '[data-sg-id]',
    '[data-nacl-id]',
  ];
  const elements: HTMLElement[] = [];
  for (const sel of selectors) {
    container.querySelectorAll<HTMLElement>(sel).forEach(el => elements.push(el));
  }
  return elements;
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

    for (const vpc of vpcGroups) {
      const allNodeIds = vpc.subnets.flatMap((s) => s.nodeIds);
      let allElements = findNodeElements(container, allNodeIds);

      // Fallback: if we found very few elements but have many nodeIds,
      // the IDs might not match DOM attributes. Use all architecture nodes instead.
      if (allElements.length < 2 && allNodeIds.length >= 2) {
        allElements = findAllArchitectureNodes(container);
      }
      const vpcBox = computeBoundingBox(allElements, containerRect);

      if (!vpcBox) continue;

      // Add extra top padding for the VPC label
      vpcBox.y -= VPC_LABEL_HEIGHT;
      vpcBox.height += VPC_LABEL_HEIGHT;

      const subnetRects: SubnetRect[] = [];

      for (const subnet of vpc.subnets) {
        const subnetElements = findNodeElements(container, subnet.nodeIds);
        const subnetBox = computeBoundingBox(subnetElements, containerRect);

        if (!subnetBox) continue;

        // Add extra top padding for subnet label
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

  // Recalculate on vpcGroups change
  useEffect(() => {
    recalculate();
  }, [recalculate]);

  // Track container dimensions with ResizeObserver
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

  // Recalculate on window resize
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

  // Also recalculate after a short delay to catch layout shifts
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(recalculate, 100);
    return () => clearTimeout(timer);
  }, [visible, recalculate]);

  return (
    <svg
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

      {vpcRects.map((vpc) => (
        <g key={vpc.vpcId}>
          {/* VPC boundary rect - bright border */}
          <rect
            x={vpc.x}
            y={vpc.y}
            width={vpc.width}
            height={vpc.height}
            rx={16}
            ry={16}
            fill="rgba(59, 130, 246, 0.04)"
            stroke="#3b82f6"
            strokeWidth={2.5}
            strokeDasharray="12,6"
            opacity={0.8}
          />

          {/* VPC label with colored background pill */}
          <rect
            x={vpc.x + 12}
            y={vpc.y + 6}
            width={Math.min(vpc.vpcName.length * 7.5 + 40, vpc.width - 24)}
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
            🌐 {vpc.vpcName}
          </text>

          {/* Subnet boundaries */}
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

              {/* Subnet label */}
              <rect
                x={subnet.x + 8}
                y={subnet.y + 4}
                width={
                  Math.min(
                    subnet.subnetName.length * 6 + 12,
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
                {subnet.subnetName}
              </text>
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}
