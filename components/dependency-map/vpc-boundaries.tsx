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

const PADDING = 24;
const VPC_LABEL_HEIGHT = 24;
const SUBNET_LABEL_HEIGHT = 20;

function findNodeElements(
  container: HTMLElement,
  nodeIds: string[]
): HTMLElement[] {
  const elements: HTMLElement[] = [];
  for (const nodeId of nodeIds) {
    const selectors = [
      `[data-node-id="${nodeId}"]`,
      `[data-compute-id="${nodeId}"]`,
      `[data-sg-id="${nodeId}"]`,
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

    minX = Math.min(minX, relX);
    minY = Math.min(minY, relY);
    maxX = Math.max(maxX, relX + rect.width);
    maxY = Math.max(maxY, relY + rect.height);
  }

  if (!isFinite(minX)) return null;

  return {
    x: minX - PADDING,
    y: minY - PADDING,
    width: maxX - minX + PADDING * 2,
    height: maxY - minY + PADDING * 2,
  };
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
      const allElements = findNodeElements(container, allNodeIds);
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
          {/* VPC boundary rect */}
          <rect
            x={vpc.x}
            y={vpc.y}
            width={vpc.width}
            height={vpc.height}
            rx={16}
            ry={16}
            fill="transparent"
            stroke="#475569"
            strokeWidth={2}
          />

          {/* VPC label with dark background pill */}
          <rect
            x={vpc.x + 12}
            y={vpc.y + 6}
            width={Math.min(vpc.vpcName.length * 7.5 + 16, vpc.width - 24)}
            height={20}
            rx={10}
            ry={10}
            fill="#1e293b"
            stroke="#475569"
            strokeWidth={1}
          />
          <text
            x={vpc.x + 20}
            y={vpc.y + 20}
            fill="#ffffff"
            fontSize={12}
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight={500}
          >
            {vpc.vpcName}
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
