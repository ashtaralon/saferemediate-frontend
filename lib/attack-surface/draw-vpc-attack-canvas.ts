/**
 * HTML5 Canvas renderer for the VPC Attack Surface diagram (white architecture board).
 */

import type { VpcCanvasModel } from "./build-vpc-canvas-model"
import { VPC_CANVAS_SIZE } from "./build-vpc-canvas-model"

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    return
  }
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export function drawVpcAttackCanvas(
  ctx: CanvasRenderingContext2D,
  model: VpcCanvasModel,
  width: number,
  height: number,
): void {
  const sx = width / VPC_CANVAS_SIZE.width
  const sy = height / VPC_CANVAS_SIZE.height
  ctx.save()
  ctx.scale(sx, sy)

  ctx.fillStyle = "#FFFFFF"
  ctx.fillRect(0, 0, VPC_CANVAS_SIZE.width, VPC_CANVAS_SIZE.height)

  // VPC boundary
  ctx.strokeStyle = "#2E7D32"
  ctx.lineWidth = 2
  ctx.strokeRect(50, 120, 1100, 680)
  ctx.fillStyle = "#2E7D32"
  ctx.font = "bold 12px Arial, sans-serif"
  ctx.fillText(model.vpcLabel || "VPC", 60, 140)

  const subnetCidr = model.subnet?.cidr ?? "10.0.0.0/24"
  const subnetName = model.subnet?.name ?? "Application Subnet"

  // Application subnet
  ctx.fillStyle = "#E3F2FD"
  ctx.fillRect(100, 260, 420, 320)
  ctx.strokeStyle = "#1565C0"
  ctx.setLineDash([5, 5])
  ctx.strokeRect(100, 260, 420, 320)
  ctx.setLineDash([])
  ctx.fillStyle = "#1565C0"
  ctx.font = "bold 11px Arial, sans-serif"
  ctx.fillText(`Application Subnet (Private) - ${subnetCidr}`, 110, 280)
  ctx.font = "10px Arial, sans-serif"
  ctx.fillText(subnetName, 110, 296)

  // Data subnet
  ctx.fillStyle = "#E3F2FD"
  ctx.fillRect(100, 610, 420, 160)
  ctx.strokeStyle = "#1565C0"
  ctx.strokeRect(100, 610, 420, 160)
  ctx.fillStyle = "#1565C0"
  ctx.fillText(model.dataSubnetLabel, 110, 630)

  // Attacker
  if (model.attacker) {
    ctx.fillStyle = "#E8EAF6"
    ctx.fillRect(480, 20, 240, 70)
    ctx.strokeStyle = "#3F51B5"
    ctx.lineWidth = 1
    ctx.strokeRect(480, 20, 240, 70)
    ctx.fillStyle = "#000000"
    ctx.font = "bold 12px Arial, sans-serif"
    ctx.fillText(model.attacker.name, 500, 45)
    ctx.font = "11px Arial, sans-serif"
    ctx.fillText(model.attacker.detail, 490, 65)
  }

  // IGW
  if (model.igw) {
    ctx.beginPath()
    ctx.arc(600, 160, 25, 0, 2 * Math.PI)
    ctx.fillStyle = "#E8E8E8"
    ctx.fill()
    ctx.strokeStyle = "#560BAD"
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = "#000000"
    ctx.font = "bold 10px Arial, sans-serif"
    ctx.fillText("IGW", 588, 164)
    ctx.font = "10px Arial, sans-serif"
    ctx.fillText(model.igw.name, 500, 200)
  }

  // Compute + SG shield
  if (model.appServer) {
    if (model.securityGroup) {
      ctx.strokeStyle = "#FF9F1C"
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 2
      ctx.strokeRect(130, 320, 220, 100)
      ctx.setLineDash([])
      ctx.fillStyle = "#FF9F1C"
      ctx.font = "10px Arial, sans-serif"
      ctx.fillText(model.securityGroup.name, 135, 315)
    }

    ctx.fillStyle = "#FFFFFF"
    ctx.fillRect(140, 330, 200, 80)
    ctx.strokeStyle = "#00B4D8"
    ctx.lineWidth = 2
    ctx.strokeRect(140, 330, 200, 80)
    ctx.fillStyle = "#000000"
    ctx.font = "bold 11px Arial, sans-serif"
    ctx.fillText(model.appServer.name, 150, 355)
    ctx.fillStyle = "#555555"
    ctx.font = "10px Arial, sans-serif"
    ctx.fillText(model.appServer.id, 150, 375)
    if (model.appServer.alert) {
      ctx.fillStyle = "#D90429"
      ctx.fillText(`⚠️ ${model.appServer.alert}`, 150, 395)
    }
  }

  // Route table
  if (model.routeTable) {
    ctx.fillStyle = "#ECEFF1"
    ctx.fillRect(140, 480, 200, 50)
    ctx.strokeStyle = "#4CC9F0"
    ctx.lineWidth = 1
    ctx.strokeRect(140, 480, 200, 50)
    ctx.fillStyle = "#000000"
    ctx.font = "10px Arial, sans-serif"
    ctx.fillText(model.routeTable.name, 150, 500)
    ctx.fillText(model.routeTable.detail, 150, 520)
  }

  // NACL
  if (model.nacl) {
    ctx.fillStyle = "#CFD8DC"
    ctx.fillRect(380, 480, 110, 50)
    ctx.strokeStyle = "#D90429"
    ctx.strokeRect(380, 480, 110, 50)
    ctx.fillStyle = "#000000"
    ctx.fillText("NACL", 390, 500)
    ctx.fillText(model.nacl.id.substring(0, 14), 390, 520)
  }

  // IAM role capsule
  if (model.iamRole) {
    ctx.fillStyle = "#F3E5F5"
    ctx.strokeStyle = "#48CAE4"
    ctx.lineWidth = 2
    roundRect(ctx, 800, 280, 260, 70, 20)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = "#000000"
    ctx.font = "bold 11px Arial, sans-serif"
    ctx.fillText(`${model.iamRole.label}: ${model.iamRole.name}`, 820, 305)
    ctx.fillStyle = "#6A1B9A"
    ctx.font = "10px Arial, sans-serif"
    ctx.fillText(model.iamRole.name, 820, 325)
    if (model.iamRole.alert) {
      ctx.fillStyle = "#FF9F1C"
      ctx.fillText(`⚠️ ${model.iamRole.alert}`, 820, 345)
    }
  }

  // Crown jewels
  if (model.crownJewel) {
    ctx.fillStyle = "#000000"
    ctx.font = "bold 14px Arial, sans-serif"
    ctx.fillText("CROWN JEWELS (CJ)", 935, 475)

    ctx.beginPath()
    ctx.arc(1000, 600, 110, 0, 2 * Math.PI)
    ctx.strokeStyle = "#FF9F1C"
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(1000, 600, 102, 0, 2 * Math.PI)
    ctx.strokeStyle = "#D4AF37"
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.fillStyle = "#FFF8E1"
    ctx.beginPath()
    ctx.arc(1000, 600, 45, 0, 2 * Math.PI)
    ctx.fill()
    ctx.strokeStyle = "#FF9F1C"
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = "#000000"
    ctx.font = "bold 11px Arial, sans-serif"
    ctx.fillText("Prod S3 Bucket", 955, 595)
    ctx.font = "9px Arial, sans-serif"
    ctx.fillText(model.crownJewel.name, 940, 615)
    ctx.fillText(model.crownJewel.arn.length > 36 ? `${model.crownJewel.arn.slice(0, 34)}…` : model.crownJewel.arn, 900, 632)
  }

  // Attack path arrows
  if (model.attacker && model.igw) {
    ctx.strokeStyle = "#D90429"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(600, 90)
    ctx.lineTo(600, 130)
    ctx.stroke()
  }

  if (model.igw && model.appServer) {
    ctx.beginPath()
    ctx.moveTo(575, 160)
    ctx.bezierCurveTo(350, 160, 240, 220, 240, 315)
    ctx.stroke()
  }

  if (model.iamRole && model.crownJewel) {
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(930, 350)
    ctx.lineTo(950, 490)
    ctx.stroke()
    ctx.setLineDash([])
  }

  ctx.fillStyle = "#D90429"
  ctx.font = "bold 11px Arial, sans-serif"
  ctx.fillText(model.attackLabels.ingress, 320, 150)
  if (model.iamRole && model.crownJewel) {
    ctx.fillText(model.attackLabels.exfil, 810, 440)
  }

  ctx.restore()
}
