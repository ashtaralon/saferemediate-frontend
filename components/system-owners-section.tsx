"use client"

export function SystemOwnersSection() {
  const owners = [
    {
      name: "Alex Kim",
      role: "Tech Lead",
      email: "alex.kim@company.com",
      slack: "@alex.kim",
      status: "on-call",
      avatar: "👨‍💼",
      actionLabel: "Request Remediation",
      actionColor: "#8B5CF6",
    },
    {
      name: "Sarah Chen",
      role: "Product Manager",
      email: "sarah.chen@company.com",
      slack: "@sarah.chen",
      status: "available",
      avatar: "👩‍💼",
      actionLabel: "Request Approval",
      actionColor: "#6B7280",
    },
    {
      name: "Mike Johnson",
      role: "VP Engineering",
      email: "mike.johnson@company.com",
      slack: "@mike.johnson",
      status: "available",
      avatar: "👨‍💻",
      actionLabel: "Escalate Issue",
      actionColor: "#6B7280",
    },
  ]

  return (
    <div
      className="rounded-xl p-6 border"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-subtle)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    >
      <h2 className="text-lg font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
        System Ownership & Contacts
      </h2>

      {/* Three column grid */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {owners.map((owner, idx) => (
          <div key={idx} className="flex flex-col items-center text-center">
            {/* Avatar */}
            <div
              className="w-[60px] h-[60px] rounded-full flex items-center justify-center text-3xl mb-3"
              style={{ background: idx === 0 ? "#8B5CF6" : idx === 1 ? "#3B82F6" : "#10B981" }}
            >
              {owner.avatar}
            </div>

            {/* Name and Role */}
            <div className="font-bold text-lg mb-1" style={{ color: "var(--text-primary)" }}>
              {owner.name}
            </div>
            <div className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              {owner.role}
            </div>

            {/* Contact Info */}
            <div className="space-y-1 mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
              <div className="flex items-center gap-1 justify-center">
                <span>📧</span>
                <span>{owner.email}</span>
              </div>
              <div className="flex items-center gap-1 justify-center">
                <span>💬</span>
                <span>{owner.slack}</span>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: owner.status === "on-call" ? "#10B981" : "#6B7280" }}
              />
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                {owner.status === "on-call" ? "On-call now" : "Available"}
              </span>
            </div>

            {/* Action Button */}
            <button
              className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
              style={{ background: owner.actionColor }}
            >
              {owner.actionLabel}
            </button>
          </div>
        ))}
      </div>

      {/* Quick Actions Row */}
      <div className="flex gap-3 pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <button
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-primary)",
            background: "transparent",
          }}
        >
          📎 Attach Simulation Results
        </button>
        <button
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-primary)",
            background: "transparent",
          }}
        >
          📧 Email All Owners
        </button>
        <button
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ background: "#DC2626" }}
        >
          📞 Start War Room
        </button>
      </div>
    </div>
  )
}
