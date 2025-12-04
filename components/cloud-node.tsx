"use client"

interface CloudNodeProps {
  id: string
  type: "ec2" | "lambda" | "rds" | "s3" | "alb" | "vpc" | "subnet" | "sg"
  name: string
  x: number
  y: number
  health: "healthy" | "warning" | "critical"
  metrics?: {
    cpu?: string
    memory?: string
    network?: string
  }
  details?: {
    instanceType?: string
    ip?: string
    size?: string
    objects?: string
  }
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  isSelected?: boolean
  isHovered?: boolean
}

export function CloudNode({
  id,
  type,
  name,
  x,
  y,
  health,
  metrics,
  details,
  onClick,
  onMouseEnter,
  onMouseLeave,
  isSelected,
  isHovered,
}: CloudNodeProps) {
  const getHealthColor = () => {
    switch (health) {
      case "healthy":
        return "#10B981"
      case "warning":
        return "#F59E0B"
      case "critical":
        return "#EF4444"
      default:
        return "#6B7280"
    }
  }

  const getTypeConfig = () => {
    switch (type) {
      case "ec2":
        return {
          icon: "💻",
          badge: "EC2",
          bgColor: "#FFF7ED",
          badgeColor: "#F97316",
          width: 180,
          height: 140,
        }
      case "lambda":
        return {
          icon: "λ",
          badge: "Lambda",
          bgColor: "#FFF7ED",
          badgeColor: "#F97316",
          width: 140,
          height: 100,
        }
      case "rds":
        return {
          icon: "🗄️",
          badge: "RDS",
          bgColor: "#EFF6FF",
          badgeColor: "#3B82F6",
          width: 180,
          height: 150,
        }
      case "s3":
        return {
          icon: "🪣",
          badge: "S3",
          bgColor: "#ECFDF5",
          badgeColor: "#06B6D4",
          width: 160,
          height: 140,
        }
      case "alb":
        return {
          icon: "⚖️",
          badge: "ALB",
          bgColor: "#EFF6FF",
          badgeColor: "#3B82F6",
          width: 200,
          height: 120,
        }
      default:
        return {
          icon: "🔷",
          badge: type.toUpperCase(),
          bgColor: "#F3F4F6",
          badgeColor: "#6B7280",
          width: 160,
          height: 120,
        }
    }
  }

  const config = getTypeConfig()
  const healthColor = getHealthColor()
  const scale = isHovered || isSelected ? 1.05 : 1

  return (
    <foreignObject
      x={x}
      y={y}
      width={config.width}
      height={config.height}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: "pointer", overflow: "visible" }}
    >
      <div
        className="relative rounded-xl p-4 transition-all duration-200 shadow-lg"
        style={{
          width: `${config.width}px`,
          height: `${config.height}px`,
          background: "white",
          border: `2px solid ${healthColor}`,
          transform: `scale(${scale})`,
          transformOrigin: "center",
          boxShadow: isHovered ? `0 10px 25px -5px ${healthColor}40` : "0 4px 6px -1px rgba(0,0,0,0.1)",
        }}
      >
        {/* Status dot */}
        <div
          className="absolute top-2 right-2 w-3 h-3 rounded-full"
          style={{
            background: healthColor,
            animation: health === "critical" ? "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" : "none",
          }}
        />

        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">{config.icon}</span>
          <span
            className="px-2 py-0.5 rounded text-xs font-bold"
            style={{
              background: `${config.badgeColor}15`,
              color: config.badgeColor,
            }}
          >
            {config.badge}
          </span>
        </div>

        {/* Name */}
        <div className="font-semibold text-sm text-gray-900 mb-1 truncate">{name}</div>

        {/* Instance Type / Details */}
        {details?.instanceType && <div className="text-gray-600 text-xs mb-2">{details.instanceType}</div>}

        {/* Metrics */}
        {metrics && (
          <div className="flex justify-between text-xs mb-2">
            {metrics.cpu && <span className="text-blue-600">CPU: {metrics.cpu}</span>}
            {metrics.memory && <span className="text-purple-600">Mem: {metrics.memory}</span>}
          </div>
        )}

        {/* S3 specific details */}
        {type === "s3" && details && (
          <div className="space-y-1 text-xs">
            {details.size && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Size:</span>
                <span className="font-semibold text-gray-900">{details.size}</span>
              </div>
            )}
            {details.objects && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Objects:</span>
                <span className="font-semibold text-gray-900">{details.objects}</span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {details?.ip && (
          <div className="absolute bottom-4 left-4 right-4 flex gap-1">
            <span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">{details.ip}</span>
            <span
              className="px-2 py-1 rounded text-xs font-bold"
              style={{
                background: health === "healthy" ? "#D1FAE5" : health === "warning" ? "#FEF3C7" : "#FEE2E2",
                color: health === "healthy" ? "#065F46" : health === "warning" ? "#92400E" : "#991B1B",
              }}
            >
              {health === "healthy" ? "98%" : health === "warning" ? "75%" : "45%"}
            </span>
          </div>
        )}
      </div>
    </foreignObject>
  )
}
