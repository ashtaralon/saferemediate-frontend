"use client"

import { useEffect, useMemo, useRef } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Html, OrbitControls, QuadraticBezierLine, RoundedBox } from "@react-three/drei"
import type { Mesh } from "three"
import { DoubleSide } from "three"
import type { AttackMapScene3D, Node3D } from "@/lib/attack-map/slot-mapper-3d"
import { verdictEdgeColor } from "@/lib/attack-map/slot-mapper-3d"
import type { Verdict } from "@/lib/attack-map/slot-mapper"

const VERDICT_RING: Record<Verdict, string> = {
  ENTRY: "#38bdf8",
  SEEN: "#22d3ee",
  ALLOWED: "#fb923c",
  NOT_OBSERVED: "#64748b",
  BLOCKED: "#f87171",
}

function nodeDimensions(node: Node3D): [number, number, number] {
  switch (node.visualType) {
    case "threat":
      return [2.2, 0.35, 1.4]
    case "alb":
    case "nat":
      return [2, 0.4, 1.2]
    case "identity":
      return [2.4, 0.45, 1.1]
    case "s3":
    case "database":
      return [1.5, 1.2, 1.5]
    case "kms":
      return [1.1, 1.4, 1.1]
    case "compute":
      return [1.3, 1.1, 1.3]
    default:
      return [1.2, 1, 1.2]
  }
}

function NodeLabel({
  node,
  selected,
}: {
  node: Node3D
  selected: boolean
}) {
  const ring = VERDICT_RING[node.verdict]
  return (
    <Html
      center
      distanceFactor={10}
      position={[0, nodeDimensions(node)[1] / 2 + 0.55, 0]}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      <div
        className={`min-w-[108px] max-w-[140px] rounded-lg border px-2 py-1.5 text-center shadow-lg backdrop-blur-sm transition-all ${
          node.isCrownJewel
            ? "border-amber-500/70 bg-amber-950/90 text-amber-50"
            : selected
              ? "border-cyan-400/60 bg-slate-900/95 text-slate-100 scale-105"
              : "border-slate-700/80 bg-slate-950/90 text-slate-200"
        }`}
      >
        <div className="flex items-center justify-center gap-1.5">
          {node.hopIndex >= 0 && (
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-slate-950"
              style={{ backgroundColor: ring }}
            >
              {node.hopIndex + 1}
            </span>
          )}
          <span className="truncate text-[10px] font-semibold leading-tight">{node.label}</span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[8px] text-slate-500">{node.nodeType}</p>
        {node.isCrownJewel && (
          <span className="mt-1 inline-block rounded bg-amber-500/20 px-1 py-0.5 text-[7px] font-bold uppercase tracking-wide text-amber-300">
            Crown jewel
          </span>
        )}
      </div>
    </Html>
  )
}

function AttackNode({
  node,
  selected,
  dimmed,
  onSelect,
}: {
  node: Node3D
  selected: boolean
  dimmed: boolean
  onSelect: (id: string) => void
}) {
  const [w, h, d] = nodeDimensions(node)
  const opacity = dimmed ? 0.28 : 1
  const glow = selected || node.isCrownJewel

  return (
    <group position={[node.x, node.y, node.z]}>
      {/* Platform disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -h / 2 - 0.02, 0]}>
        <circleGeometry args={[Math.max(w, d) * 0.72, 32]} />
        <meshBasicMaterial
          color={node.accentColor}
          transparent
          opacity={dimmed ? 0.06 : selected ? 0.22 : 0.12}
        />
      </mesh>

      {glow && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -h / 2 - 0.01, 0]}>
          <ringGeometry args={[Math.max(w, d) * 0.55, Math.max(w, d) * 0.85, 32]} />
          <meshBasicMaterial
            color={node.isCrownJewel ? "#f59e0b" : "#22d3ee"}
            transparent
            opacity={0.45}
          />
        </mesh>
      )}

      <RoundedBox
        args={[w, h, d]}
        radius={0.12}
        smoothness={4}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(node.id)
        }}
      >
        <meshStandardMaterial
          color={node.isCrownJewel ? "#78350f" : "#0f172a"}
          emissive={node.accentColor}
          emissiveIntensity={glow ? 0.55 : 0.22}
          metalness={0.35}
          roughness={0.38}
          transparent
          opacity={opacity}
        />
      </RoundedBox>

      {/* Accent cap */}
      <mesh position={[0, h / 2 + 0.02, 0]}>
        <boxGeometry args={[w * 0.92, 0.06, d * 0.92]} />
        <meshStandardMaterial
          color={node.accentColor}
          emissive={node.accentColor}
          emissiveIntensity={0.6}
          metalness={0.2}
          roughness={0.3}
          transparent
          opacity={opacity}
        />
      </mesh>

      <NodeLabel node={node} selected={selected} />
    </group>
  )
}

function PathEdge({
  a,
  b,
  color,
  dashed,
  animated,
}: {
  a: Node3D
  b: Node3D
  color: string
  dashed?: boolean
  animated?: boolean
}) {
  const mid = useMemo(() => {
    const mx = (a.x + b.x) / 2
    const my = Math.max(a.y, b.y) + 1.8
    const mz = (a.z + b.z) / 2
    return [mx, my, mz] as [number, number, number]
  }, [a, b])

  const dotRef = useRef<Mesh>(null)
  useFrame((state) => {
    if (!dotRef.current || !animated) return
    const t = (state.clock.elapsedTime * 0.35) % 1
    const u = 1 - t
    const x = u * u * a.x + 2 * u * t * mid[0] + t * t * b.x
    const y = u * u * (a.y + 0.3) + 2 * u * t * mid[1] + t * t * (b.y + 0.3)
    const z = u * u * a.z + 2 * u * t * mid[2] + t * t * b.z
    dotRef.current.position.set(x, y, z)
  })

  return (
    <group>
      <QuadraticBezierLine
        start={[a.x, a.y + 0.25, a.z]}
        end={[b.x, b.y + 0.25, b.z]}
        mid={mid}
        color={color}
        lineWidth={2.5}
        dashed={dashed}
        dashScale={dashed ? 2 : undefined}
        transparent
        opacity={0.9}
      />
      {animated && (
        <mesh ref={dotRef}>
          <sphereGeometry args={[0.14, 12, 12]} />
          <meshBasicMaterial color="#fda4af" />
        </mesh>
      )}
    </group>
  )
}

function LayerBackdrops({ bounds, center }: { bounds: AttackMapScene3D["bounds"]; center: AttackMapScene3D["center"] }) {
  const w = bounds.maxX - bounds.minX
  const d = bounds.maxZ - bounds.minZ
  const h = bounds.maxY - bounds.minY

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, 0, center.z]}>
        <planeGeometry args={[w * 0.92, d * 0.92]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.035} />
      </mesh>
      <mesh position={[center.x, h * 0.55 + 0.5, center.z - d * 0.08]}>
        <planeGeometry args={[w * 0.88, h * 0.7]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.025} side={DoubleSide} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} position={[center.x + w * 0.08, center.y, center.z + d * 0.35]}>
        <planeGeometry args={[d * 0.85, h * 0.75]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0.025} side={DoubleSide} />
      </mesh>
    </group>
  )
}

export interface AwsAttackMap3DSceneProps {
  scene: AttackMapScene3D
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  cameraPreset: "iso" | "network" | "identity" | "data"
}

function CameraRig({
  center,
  preset,
  distance,
}: {
  center: AttackMapScene3D["center"]
  preset: AwsAttackMap3DSceneProps["cameraPreset"]
  distance: number
}) {
  const { camera } = useThree()
  const d = distance

  const positions: Record<AwsAttackMap3DSceneProps["cameraPreset"], [number, number, number]> = {
    iso: [center.x + d * 0.75, center.y + d * 0.55, center.z + d * 0.85],
    network: [center.x, center.y + d * 0.15, center.z + d * 1.15],
    identity: [center.x + d * 1.05, center.y + d * 0.45, center.z],
    data: [center.x, center.y + d * 0.25, center.z - d * 0.95],
  }

  useEffect(() => {
    const [x, y, z] = positions[preset]
    camera.position.set(x, y, z)
    camera.lookAt(center.x, center.y + 0.8, center.z)
    camera.updateProjectionMatrix()
  }, [camera, center.x, center.y, center.z, preset, distance])

  return (
    <OrbitControls
      target={[center.x, center.y + 0.8, center.z]}
      makeDefault
      enableDamping
      dampingFactor={0.06}
      minDistance={4}
      maxDistance={distance * 2.2}
    />
  )
}

export function AwsAttackMap3DScene({
  scene,
  selectedNodeId,
  onSelectNode,
  cameraPreset,
}: AwsAttackMap3DSceneProps) {
  const nodeById = useMemo(() => new Map(scene.nodes.map((n) => [n.id, n])), [scene.nodes])
  const pathSet = useMemo(() => new Set(scene.pathNodeIds), [scene.pathNodeIds])

  const cameraPos: Record<AwsAttackMap3DSceneProps["cameraPreset"], [number, number, number]> = {
    iso: [
      scene.center.x + scene.cameraDistance * 0.75,
      scene.center.y + scene.cameraDistance * 0.55,
      scene.center.z + scene.cameraDistance * 0.85,
    ],
    network: [
      scene.center.x,
      scene.center.y + scene.cameraDistance * 0.15,
      scene.center.z + scene.cameraDistance * 1.15,
    ],
    identity: [
      scene.center.x + scene.cameraDistance * 1.05,
      scene.center.y + scene.cameraDistance * 0.45,
      scene.center.z,
    ],
    data: [
      scene.center.x,
      scene.center.y + scene.cameraDistance * 0.25,
      scene.center.z - scene.cameraDistance * 0.95,
    ],
  }

  return (
    <Canvas
      camera={{ position: cameraPos[cameraPreset], fov: 42, near: 0.1, far: 300 }}
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={() => onSelectNode(null)}
      dpr={[1, 2]}
    >
      <color attach="background" args={["#060a10"]} />
      <fog attach="fog" args={["#060a10", scene.cameraDistance * 0.8, scene.cameraDistance * 2.8]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[12, 18, 10]} intensity={1.25} color="#f8fafc" />
      <directionalLight position={[-10, 6, -12]} intensity={0.4} color="#7dd3fc" />
      <pointLight position={[scene.center.x, scene.center.y + 4, scene.center.z]} intensity={0.35} color="#22d3ee" />

      <CameraRig
        center={scene.center}
        preset={cameraPreset}
        distance={scene.cameraDistance}
      />
      <LayerBackdrops bounds={scene.bounds} center={scene.center} />

      {scene.edges
        .filter((e) => e.kind === "movement")
        .map((edge) => {
          const a = nodeById.get(edge.source)
          const b = nodeById.get(edge.target)
          if (!a || !b) return null
          const onPath = pathSet.has(edge.source) && pathSet.has(edge.target)
          const color = verdictEdgeColor(edge.verdict)
          return (
            <PathEdge
              key={edge.id}
              a={a}
              b={b}
              color={onPath ? color : "#334155"}
              dashed={edge.verdict === "NOT_OBSERVED"}
              animated={onPath}
            />
          )
        })}

      {scene.nodes.map((node) => (
        <AttackNode
          key={node.id}
          node={node}
          selected={selectedNodeId === node.id}
          dimmed={Boolean(selectedNodeId) && selectedNodeId !== node.id && node.hopIndex >= 0}
          onSelect={onSelectNode}
        />
      ))}
    </Canvas>
  )
}
