"use client"

interface AnimatedFlowLineProps {
  source: { x: number; y: number; width: number; height: number }
  target: { x: number; y: number; width: number; height: number }
  flowType: "http" | "database" | "storage"
  isActive: boolean
  throughput: number
  label?: string
}

export function AnimatedFlowLine({ source, target, flowType, isActive, throughput, label }: AnimatedFlowLineProps) {
  const startX = source.x + source.width
  const startY = source.y + source.height / 2
  const endX = target.x
  const endY = target.y + target.height / 2

  const getFlowColor = () => {
    switch (flowType) {
      case "http":
        return "#3B82F6"
      case "database":
        return "#8B5CF6"
      case "storage":
        return "#10B981"
      default:
        return "#6B7280"
    }
  }

  return (
    <g>
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={getFlowColor()}
        strokeWidth="2"
        strokeOpacity="0.4"
        strokeDasharray={isActive ? "5,5" : "none"}
      >
        {isActive && <animate attributeName="stroke-dashoffset" from="0" to="10" dur="1s" repeatCount="indefinite" />}
      </line>
      {label && (
        <text
          x={(startX + endX) / 2}
          y={(startY + endY) / 2 - 10}
          textAnchor="middle"
          fontSize="10"
          fill={getFlowColor()}
          fontWeight="600"
        >
          {label}
        </text>
      )}
    </g>
  )
}
