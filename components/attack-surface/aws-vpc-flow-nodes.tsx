"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "reactflow"

export interface AwsGroupData {
  label: string
  variant?: "vpc" | "subnet"
}

export const AwsGroupNode = memo(function AwsGroupNode({ data }: NodeProps<AwsGroupData>) {
  const isSubnet = data.variant === "subnet"
  return (
    <div className="h-full w-full pointer-events-none relative">
      <div
        className="absolute left-2 font-bold"
        style={{
          top: isSubnet ? 6 : 8,
          fontSize: isSubnet ? 11 : 12,
          color: isSubnet ? "#1565C0" : "#2E7D32",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {data.label}
      </div>
    </div>
  )
})

export interface AwsComputeData {
  name: string
  id: string
  alert?: string
}

export const AwsComputeNode = memo(function AwsComputeNode({ data }: NodeProps<AwsComputeData>) {
  return (
    <div
      className="h-full w-full box-border"
      style={{
        background: "#FFFFFF",
        border: "2px solid #00B4D8",
        borderRadius: 4,
        padding: "10px 12px",
        fontFamily: "Arial, sans-serif",
      }}
      data-testid="aws-compute-node"
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0 }} />
      <div style={{ fontWeight: "bold", fontSize: 11, color: "#000" }}>{data.name}</div>
      <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>{data.id}</div>
      {data.alert ? (
        <div style={{ fontSize: 9, color: "#D90429", marginTop: 4, fontWeight: "bold" }}>
          ⚠️ {data.alert}
        </div>
      ) : null}
    </div>
  )
})

export interface AwsSecurityGroupOverlayData {
  name: string
  id: string
}

/** Dashed amber shield frame — sits behind compute, larger by 5px offset. */
export const AwsSecurityGroupOverlay = memo(function AwsSecurityGroupOverlay({
  data,
}: NodeProps<AwsSecurityGroupOverlayData>) {
  return (
    <div
      className="h-full w-full pointer-events-none relative"
      data-testid="aws-sg-overlay"
    >
      <div
        className="absolute inset-0"
        style={{
          border: "2px dashed #FF9F1C",
          borderRadius: 2,
          boxShadow: "0 0 10px rgba(255, 159, 28, 0.2)",
        }}
      />
      <div
        className="absolute -top-4 left-0"
        style={{ fontSize: 10, color: "#FF9F1C", fontFamily: "Arial, sans-serif" }}
      >
        {data.name}
      </div>
    </div>
  )
})

export const AwsAttackerNode = memo(function AwsAttackerNode({
  data,
}: NodeProps<{ name: string; detail: string }>) {
  return (
    <div
      style={{
        background: "#E8EAF6",
        border: "1px solid #3F51B5",
        padding: "12px 16px",
        width: 240,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div style={{ fontWeight: "bold", fontSize: 12 }}>{data.name}</div>
      <div style={{ fontSize: 11, marginTop: 4 }}>{data.detail}</div>
    </div>
  )
})

export const AwsIgwNode = memo(function AwsIgwNode({ data }: NodeProps<{ name: string; id: string }>) {
  return (
    <div className="flex flex-col items-center" style={{ fontFamily: "Arial, sans-serif" }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: "50%",
          background: "#E8E8E8",
          border: "2px solid #560BAD",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: "bold",
          fontSize: 10,
        }}
      >
        IGW
      </div>
      <div style={{ fontSize: 10, marginTop: 6, maxWidth: 140, textAlign: "center" }}>{data.name}</div>
    </div>
  )
})

export const AwsRouteTableNode = memo(function AwsRouteTableNode({
  data,
}: NodeProps<{ name: string; detail: string }>) {
  return (
    <div
      className="h-full w-full box-border"
      style={{
        background: "#ECEFF1",
        border: "1px solid #4CC9F0",
        padding: "8px 10px",
        fontFamily: "Arial, sans-serif",
        fontSize: 10,
      }}
    >
      <div>{data.name}</div>
      <div style={{ color: "#555", marginTop: 2 }}>{data.detail}</div>
    </div>
  )
})

export const AwsNaclNode = memo(function AwsNaclNode({ data }: NodeProps<{ id: string }>) {
  return (
    <div
      className="h-full w-full box-border"
      style={{
        background: "#CFD8DC",
        border: "1px solid #D90429",
        padding: "8px 10px",
        fontFamily: "Arial, sans-serif",
        fontSize: 10,
      }}
    >
      <div style={{ fontWeight: "bold" }}>NACL</div>
      <div style={{ marginTop: 2 }}>{data.id.substring(0, 14)}</div>
    </div>
  )
})

export const AwsIamRoleNode = memo(function AwsIamRoleNode({
  data,
}: NodeProps<{ name: string; label: string; alert?: string }>) {
  return (
    <div
      className="h-full w-full box-border"
      style={{
        background: "#F3E5F5",
        border: "2px solid #48CAE4",
        borderRadius: 20,
        padding: "12px 16px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <div style={{ fontWeight: "bold", fontSize: 11 }}>
        {data.label}: {data.name}
      </div>
      <div style={{ color: "#6A1B9A", fontSize: 10, marginTop: 4 }}>{data.name}</div>
      {data.alert ? (
        <div style={{ color: "#FF9F1C", fontSize: 9, marginTop: 4, fontWeight: "bold" }}>
          ⚠️ {data.alert}
        </div>
      ) : null}
    </div>
  )
})

export const AwsCrownJewelNode = memo(function AwsCrownJewelNode({
  data,
}: NodeProps<{ name: string; arn: string }>) {
  return (
    <div className="relative flex items-center justify-center h-full w-full">
      <div
        className="absolute inset-0 rounded-full"
        style={{ border: "5px solid #FF9F1C", boxShadow: "0 0 12px rgba(255,159,28,0.4)" }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: "92%",
          height: "92%",
          border: "2px solid #D4AF37",
        }}
      />
      <div
        className="relative z-10 flex flex-col items-center justify-center rounded-full text-center"
        style={{
          width: "45%",
          height: "45%",
          background: "#FFF8E1",
          border: "2px solid #FF9F1C",
          padding: 8,
          fontFamily: "Arial, sans-serif",
        }}
      >
        <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
        <div style={{ fontWeight: "bold", fontSize: 10 }}>👑 CJ</div>
        <div style={{ fontSize: 9, marginTop: 4 }}>{data.name}</div>
      </div>
      <div
        className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap font-bold text-sm"
        style={{ fontFamily: "Arial, sans-serif" }}
      >
        CROWN JEWELS
      </div>
    </div>
  )
})

export const awsVpcFlowNodeTypes = {
  awsGroup: AwsGroupNode,
  awsComputeNode: AwsComputeNode,
  awsSecurityGroupOverlay: AwsSecurityGroupOverlay,
  awsAttacker: AwsAttackerNode,
  awsIgw: AwsIgwNode,
  awsRouteTable: AwsRouteTableNode,
  awsNacl: AwsNaclNode,
  awsIamRole: AwsIamRoleNode,
  awsCrownJewel: AwsCrownJewelNode,
}
