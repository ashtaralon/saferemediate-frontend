"use client"

import { useEffect, useMemo, useRef } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Html, Line, OrbitControls, Text } from "@react-three/drei"
import type { Group } from "three"
import type { AttackMapScene3D, Node3D } from "@/lib/attack-map/slot-mapper-3d"
import { riskColor } from "@/lib/attack-map/slot-mapper-3d"

const NODE_SIZE: Record<string, [number, number, number]> = {
  threat: [1.4, 0.5, 1.4],
  alb: [1.6, 0.45, 1],
  compute: [1.1, 0.9, 1.1],
  database: [1.2, 1, 1.2],
  s3: [1.3, 0.7, 1.3],
  kms: [0.9, 1.1, 0.9],
  identity: [1.5, 0.35, 1],
  generic: [1, 0.8, 1],
}

function nodeSize(node: Node3D): [number, number, number] {
  const base = NODE_SIZE[node.visualType] ?? NODE_SIZE.generic
  const scale = 0.85 + (node.riskScore / 100) * 0.35
  return [base[0] * scale, base[1] * scale, base[2] * scale]
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
  const [w, h, d] = nodeSize(node)
  const color = riskColor(node.riskScore)
  const opacity = dimmed ? 0.22 : selected ? 1 : 0.92
  const emissive = node.isCrownJewel ? "#fbbf24" : color

  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          onSelect(node.id)
        }}
      >
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={node.isCrownJewel ? 0.55 : selected ? 0.35 : 0.12}
          transparent
          opacity={opacity}
          metalness={0.25}
          roughness={0.45}
        />
      </mesh>
      {(selected || node.hopIndex >= 0) && (
        <Text
          position={[0, h / 2 + 0.35, 0]}
          fontSize={0.28}
          color="#e2e8f0"
          anchorX="center"
          anchorY="bottom"
          maxWidth={3.2}
        >
          {node.hopIndex >= 0 ? `${node.hopIndex + 1}. ` : ""}
          {node.label}
        </Text>
      )}
      {node.isCrownJewel && (
        <Html distanceFactor={14} position={[0, h / 2 + 0.55, 0]}>
          <span className="rounded bg-amber-500/90 px-1 py-0.5 font-mono text-[8px] font-bold text-black">
            CJ
          </span>
        </Html>
      )}
    </group>
  )
}

function PathEdges({
  scene,
  nodeById,
  selectedId,
}: {
  scene: AttackMapScene3D
  nodeById: Map<string, Node3D>
  selectedId: string | null
}) {
  return (
    <>
      {scene.edges
        .filter((e) => e.kind === "movement")
        .map((edge) => {
          const a = nodeById.get(edge.source)
          const b = nodeById.get(edge.target)
          if (!a || !b) return null
          const highlight =
            !selectedId ||
            edge.source === selectedId ||
            edge.target === selectedId ||
            scene.pathNodeIds.includes(edge.source)
          return (
            <Line
              key={edge.id}
              points={[
                [a.x, a.y + 0.2, a.z],
                [b.x, b.y + 0.2, b.z],
              ]}
              color={highlight ? "#22d3ee" : "#334155"}
              lineWidth={highlight ? 2.5 : 1}
              transparent
              opacity={highlight ? 0.95 : 0.25}
            />
          )
        })}
    </>
  )
}

function FlowParticles({
  scene,
  nodeById,
}: {
  scene: AttackMapScene3D
  nodeById: Map<string, Node3D>
}) {
  const ref = useRef<Group>(null)
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.15) * 0.02
  })

  const segments = scene.edges.filter((e) => e.kind === "movement" && e.onPath)
  return (
    <group ref={ref}>
      {segments.map((edge, i) => {
        const a = nodeById.get(edge.source)
        const b = nodeById.get(edge.target)
        if (!a || !b) return null
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2 + 0.35
        const mz = (a.z + b.z) / 2
        return (
          <mesh key={`p-${edge.id}`} position={[mx, my, mz]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshBasicMaterial color="#fb7185" />
          </mesh>
        )
      })}
    </group>
  )
}

function AxisGuides({ bounds }: { bounds: AttackMapScene3D["bounds"] }) {
  const len = Math.max(bounds.maxX - bounds.minX, 6)
  return (
    <group position={[bounds.minX, bounds.minY, bounds.minZ]}>
      <Line points={[[0, 0, 0], [len, 0, 0]]} color="#64748b" lineWidth={1} />
      <Line points={[[0, 0, 0], [0, 3.5, 0]]} color="#a78bfa" lineWidth={1} />
      <Line points={[[0, 0, 0], [0, 0, len]]} color="#34d399" lineWidth={1} />
      <Text position={[len + 0.3, 0, 0]} fontSize={0.35} color="#94a3b8">
        Network (X)
      </Text>
      <Text position={[0, 3.8, 0]} fontSize={0.35} color="#c4b5fd">
        Identity (Y)
      </Text>
      <Text position={[0, 0, len + 0.3]} fontSize={0.35} color="#6ee7b7">
        Data (Z)
      </Text>
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
}: {
  center: AttackMapScene3D["center"]
  preset: AwsAttackMap3DSceneProps["cameraPreset"]
}) {
  const { camera } = useThree()
  const positions: Record<AwsAttackMap3DSceneProps["cameraPreset"], [number, number, number]> = {
    iso: [center.x + 10, center.y + 8, center.z + 12],
    network: [center.x, center.y + 2, center.z + 18],
    identity: [center.x + 14, center.y + 6, center.z],
    data: [center.x, center.y + 3, center.z - 14],
  }

  useEffect(() => {
    const [x, y, z] = positions[preset]
    camera.position.set(x, y, z)
    camera.lookAt(center.x, center.y + 1, center.z)
    camera.updateProjectionMatrix()
  }, [camera, center.x, center.y, center.z, preset])

  return (
    <OrbitControls
      target={[center.x, center.y + 1, center.z]}
      makeDefault
      enableDamping
      dampingFactor={0.08}
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
    iso: [scene.center.x + 10, scene.center.y + 8, scene.center.z + 12],
    network: [scene.center.x, scene.center.y + 2, scene.center.z + 18],
    identity: [scene.center.x + 14, scene.center.y + 6, scene.center.z],
    data: [scene.center.x, scene.center.y + 3, scene.center.z - 14],
  }

  return (
    <Canvas
      camera={{ position: cameraPos[cameraPreset], fov: 48, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => onSelectNode(null)}
    >
      <color attach="background" args={["#070b12"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 14, 6]} intensity={1.1} />
      <directionalLight position={[-6, 4, -8]} intensity={0.35} color="#7dd3fc" />
      <CameraRig center={scene.center} preset={cameraPreset} />
      <AxisGuides bounds={scene.bounds} />
      <gridHelper args={[24, 24, "#1e293b", "#0f172a"]} position={[scene.center.x, -0.05, scene.center.z]} />
      <PathEdges scene={scene} nodeById={nodeById} selectedId={selectedNodeId} />
      <FlowParticles scene={scene} nodeById={nodeById} />
      {scene.nodes.map((node) => (
        <AttackNode
          key={node.id}
          node={node}
          selected={selectedNodeId === node.id}
          dimmed={Boolean(selectedNodeId) && !pathSet.has(node.id) && selectedNodeId !== node.id}
          onSelect={onSelectNode}
        />
      ))}
    </Canvas>
  )
}
