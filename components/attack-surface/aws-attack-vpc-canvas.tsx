"use client"

import { useEffect, useMemo, useRef } from "react"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import {
  buildVpcCanvasModel,
  VPC_CANVAS_SIZE,
} from "@/lib/attack-surface/build-vpc-canvas-model"
import { drawVpcAttackCanvas } from "@/lib/attack-surface/draw-vpc-attack-canvas"

export function AwsAttackVpcCanvas({
  architecture,
  path,
  height = 560,
}: {
  architecture: SystemArchitecture
  path: IdentityAttackPath
  height?: number | string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const model = useMemo(
    () => buildVpcCanvasModel(architecture, path),
    [architecture, path],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !model) return

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    const displayWidth = container.clientWidth
    const displayHeight =
      typeof height === "number"
        ? height
        : Math.min(container.clientWidth * (VPC_CANVAS_SIZE.height / VPC_CANVAS_SIZE.width), 720)

    canvas.width = Math.floor(displayWidth * dpr)
    canvas.height = Math.floor(displayHeight * dpr)
    canvas.style.width = `${displayWidth}px`
    canvas.style.height = `${displayHeight}px`

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawVpcAttackCanvas(ctx, model, displayWidth, displayHeight)
  }, [model, height])

  if (!model) {
    return (
      <div className="flex items-center justify-center py-16 text-[12px] text-muted-foreground">
        VPC attack map unavailable for this path.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full overflow-auto flex justify-center"
      style={{ background: "#F5F5F5", minHeight: typeof height === "number" ? height : 560 }}
      data-testid="aws-attack-vpc-canvas"
    >
      <canvas
        ref={canvasRef}
        style={{
          border: "1px solid #DCDCDC",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          borderRadius: 4,
          maxWidth: "100%",
        }}
        aria-label="AWS VPC attack surface diagram"
      />
    </div>
  )
}
