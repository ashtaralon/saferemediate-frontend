"use client"

import { useState, useEffect } from "react"

// ======= SNAPSHOT CATEGORIES =======
const snapshotCategories = [
  { id: "iam", label: "IAM Roles & Policies" },
  { id: "acls", label: "Access Control Lists" },
  { id: "sg", label: "Security Groups & Firewalls" },
  { id: "waf", label: "WAF Rules" },
  { id: "network", label: "VPC / Routing / Subnets" },
  { id: "storage", label: "Storage Config (S3 / Block)" },
  { id: "compute", label: "Compute / VM Config" },
  { id: "secrets", label: "Secrets & Keys Metadata" },
]

// ======= MAIN COMPONENT =======
export default function SystemSnapshotManager({ system }: { system: { id: string; name: string } }) {
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // ---- Load existing snapshots ----
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("snapshots") || "[]")
    setSnapshots(saved.filter((s: any) => s.systemId === system.id))
  }, [system.id])

  // ---- Toggle category selection ----
  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // ---- Mock API fetch for each type (replace later with real SDK calls) ----
  const fetchConfig = async (type: string) => {
    switch (type) {
      case "iam":
        return { users: 12, roles: 5, lastChange: "2025-11-10" }
      case "acls":
        return { inboundRules: 42, outboundRules: 33 }
      case "sg":
        return { groups: 14, rules: 221 }
      case "waf":
        return { rules: 18, blockedIPs: 220 }
      case "network":
        return { vpcs: 2, subnets: 14 }
      case "storage":
        return { buckets: 5, blockVolumes: 8 }
      case "compute":
        return { instances: 12, scalingGroups: 3 }
      case "secrets":
        return { secretsCount: 41 }
      default:
        return {}
    }
  }

  // ---- Create Snapshot ----
  const createSnapshot = async () => {
    if (selectedCategories.length === 0) {
      alert("Please select at least one component to snapshot.")
      return
    }

    setLoading(true)
    const data: any = {}

    for (const cat of selectedCategories) {
      data[cat] = await fetchConfig(cat)
    }

    const snapshot = {
      id: crypto.randomUUID(),
      systemId: system.id,
      timestamp: new Date().toISOString(),
      included: selectedCategories,
      data,
      createdBy: "admin",
    }

    const all = JSON.parse(localStorage.getItem("snapshots") || "[]")
    all.push(snapshot)
    localStorage.setItem("snapshots", JSON.stringify(all))
    setSnapshots(all.filter((s: any) => s.systemId === system.id))

    setLoading(false)
    alert(`Snapshot created for: ${selectedCategories.join(", ")}`)
  }

  // ---- Restore Snapshot ----
  const restoreSnapshot = (snapshotId: string) => {
    const all = JSON.parse(localStorage.getItem("snapshots") || "[]")
    const snapshot = all.find((s: any) => s.id === snapshotId)
    if (!snapshot) return alert("Snapshot not found.")

    console.log("Restored snapshot state:", snapshot.data)
    alert(`System restored to snapshot from ${snapshot.timestamp}`)
  }

  // ====== UI RENDER ======
  return (
    <div
      className="p-6 rounded-xl border space-y-4"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-subtle)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    >
      <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        Snapshot Manager – {system.name}
      </h2>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Select which configuration components to include when creating a snapshot of this system.
      </p>

      {/* CATEGORY SELECTOR */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {snapshotCategories.map((cat) => (
          <label
            key={cat.id}
            className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-all ${
              selectedCategories.includes(cat.id) ? "border-opacity-100" : "border-opacity-40 hover:border-opacity-60"
            }`}
            style={{
              borderColor: selectedCategories.includes(cat.id) ? "var(--action-primary)" : "var(--border)",
              background: selectedCategories.includes(cat.id) ? "rgba(139, 92, 246, 0.1)" : "transparent",
            }}
          >
            <input
              type="checkbox"
              checked={selectedCategories.includes(cat.id)}
              onChange={() => toggleCategory(cat.id)}
              className="w-4 h-4 rounded"
              style={{ accentColor: "var(--action-primary)" }}
            />
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              {cat.label}
            </span>
          </label>
        ))}
      </div>

      {/* ACTION BUTTONS */}
      <div className="flex items-center gap-3">
        <button
          onClick={createSnapshot}
          disabled={loading}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--action-primary)" }}
        >
          {loading ? "Creating..." : "Create Snapshot"}
        </button>

        <select
          onChange={(e) => restoreSnapshot(e.target.value)}
          className="px-3 py-2.5 rounded-lg text-sm border"
          style={{
            background: "var(--bg-primary)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          <option value="">Restore Snapshot...</option>
          {snapshots.map((s) => (
            <option key={s.id} value={s.id}>
              {new Date(s.timestamp).toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      {/* SNAPSHOT HISTORY */}
      <div className="border-t pt-4" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-base font-medium mb-3" style={{ color: "var(--text-primary)" }}>
          Snapshot History
        </h3>
        {snapshots.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No snapshots yet.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {snapshots.map((s) => (
              <li
                key={s.id}
                className="flex justify-between items-center px-4 py-3 rounded-lg"
                style={{ background: "var(--bg-primary)" }}
              >
                <span style={{ color: "var(--text-primary)" }}>
                  🕒 {new Date(s.timestamp).toLocaleString()} — {s.included.join(", ")}
                </span>
                <button
                  onClick={() => restoreSnapshot(s.id)}
                  className="text-sm font-medium transition-colors hover:opacity-80"
                  style={{ color: "var(--action-primary)" }}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
