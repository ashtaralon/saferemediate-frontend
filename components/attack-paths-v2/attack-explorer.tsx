"use client"

// Attack Explorer — account-wide interactive view of EVERY path in the system.
// Lenses: bipartite Graph · VPC Surface (React Flow) · Scorecard table.
// Shared data: useSystemAttackGraph + shapeSystemAttackGraph.

import { useMemo, useState } from "react"
import type { IdentityAttackPath, CrownJewelSummary, PathNodeDetail } from "@/components/identity-attack-paths/types"
import { useSystemAttackGraph } from "@/lib/attack-surface/use-system-attack-graph"
import {
  bandOf,
  footholdOfPath,
  isAggregatedEdgeHot,
  isNodeHot,
  pathsForSelection,
  RISK_BAND_COLORS,
} from "@/lib/attack-surface/shape-system-attack-graph"
import type { RiskBand } from "@/lib/attack-surface/system-attack-graph-types"
import { SystemVpcFlowCanvas } from "@/components/attack-surface/system-vpc-flow-canvas"

const BAND = RISK_BAND_COLORS

const esc = (s: unknown) => String(s ?? "")
const short = (s: string, n = 26) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "")

const jewelKind = (t?: string, n?: string) => {
  const s = `${t || ""} ${n || ""}`.toLowerCase()
  if (/dynamo/.test(s)) return "ddb"
  if (/kms|key|cmk/.test(s)) return "kms"
  if (/ses|email/.test(s)) return "ses"
  if (/rds|aurora|database/.test(s)) return "rds"
  return "s3"
}

const footKind = (t?: string) =>
  /lambda/i.test(t || "") ? "lambda" : /role|principal|user/i.test(t || "") ? "role" : "ec2"

const ICON: Record<string, { c: string; glyph: string }> = {
  ec2: { c: "#E8881C", glyph: "▦" },
  lambda: { c: "#E8881C", glyph: "λ" },
  role: { c: "#D9303F", glyph: "☷" },
  s3: { c: "#2E9E5B", glyph: "🪣" },
  kms: { c: "#D9303F", glyph: "🔑" },
  ddb: { c: "#4D72F3", glyph: "▤" },
  rds: { c: "#3060C0", glyph: "🛢" },
  ses: { c: "#3060C0", glyph: "✉" },
}

type ExplorerTab = "graph" | "surface" | "scorecard"

function tabBtn(active: boolean) {
  return {
    background: active ? "rgba(47,212,176,.12)" : "none",
    color: active ? "#2fd4b0" : "#8195b1",
    border: "none",
    padding: "6px 13px",
    fontSize: 12,
    cursor: "pointer",
  } as const
}

export function AttackExplorer({
  jewels,
  paths,
  systemName,
  onOpenFull,
}: {
  jewels: CrownJewelSummary[]
  paths: IdentityAttackPath[]
  systemName?: string | null
  onOpenFull?: (jewelId: string, pathId: string) => void
}) {
  const [tab, setTab] = useState<ExplorerTab>("graph")

  const {
    graph,
    topology,
    loading,
    error,
    retry,
    selection,
    setSelection,
    focusPathId,
    setFocusPathId,
  } = useSystemAttackGraph(systemName, { jewels, paths })

  const footList = graph?.footholds ?? []
  const jewelList = graph?.jewels ?? []
  const pathEdges = graph?.pathEdges ?? []
  const aggEdges = graph?.aggregatedEdges ?? []

  const inspectorPaths = useMemo(
    () => (graph ? pathsForSelection(graph, selection) : []),
    [graph, selection],
  )

  const jewelName = (id: string) => graph?.byId.jewels.get(id)?.name || id
  const drawerPath = focusPathId ? graph?.byId.paths.get(focusPathId) ?? null : null

  const ROW = 46
  const PADY = 24
  const FX = 230
  const JX = 720
  const NODE_W = 188
  const H = Math.max(footList.length, jewelList.length) * ROW + PADY * 2
  const W = JX + NODE_W + 30
  const footY = (i: number) =>
    PADY + i * ROW + ROW / 2 + (H - PADY * 2 - footList.length * ROW) / 2
  const jewY = (i: number) =>
    PADY + i * ROW + ROW / 2 + (H - PADY * 2 - jewelList.length * ROW) / 2
  const footPos = new Map(footList.map((f, i) => [f.key, footY(i)]))
  const jewPos = new Map(jewelList.map((j, i) => [j.id, jewY(i)]))

  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = (x2 - x1) * 0.45
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
  }

  const inspector = (
    <div
      style={{
        width: 320,
        flex: "0 0 320px",
        borderLeft: "1px solid #1b2942",
        display: "flex",
        flexDirection: "column",
        background: "#0a1120",
      }}
    >
      <div style={{ padding: "13px 15px", borderBottom: "1px solid #1b2942" }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 15 }}>
          {selection
            ? selection.kind === "jewel"
              ? short(jewelName(selection.key), 28)
              : selection.kind === "foot"
                ? short(selection.key, 28)
                : "Route"
            : "Inspector"}
        </div>
        <div style={{ fontSize: 11.5, color: "#8195b1", marginTop: 3 }}>
          {selection
            ? `${inspectorPaths.length} attack path${inspectorPaths.length !== 1 ? "s" : ""}`
            : "Click a crown jewel to see every path that reaches it, or a foothold to see what it can reach."}
        </div>
      </div>
      <div style={{ overflow: "auto", padding: "8px 10px" }}>
        {inspectorPaths.map((e) => (
          <div
            key={e.pathId}
            className="ax-row"
            onClick={() => setFocusPathId(e.pathId)}
            style={{
              padding: "9px 10px",
              border: "1px solid #1b2942",
              borderRadius: 9,
              margin: "6px 2px",
              cursor: "pointer",
              background: "#0e1726",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 600 }}>
                {short(e.footKey, 16)} <span style={{ color: "#5d6e8c" }}>→</span>{" "}
                {short(jewelName(e.jewelId), 14)}
              </span>
              <span
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontWeight: 600,
                  fontSize: 12,
                  color: BAND[e.band],
                }}
              >
                {e.score}
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#8195b1",
                marginTop: 3,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {e.band} · {e.evidence} · {e.damage.slice(0, 3).join("/") || "—"} · {e.hops} hops
            </div>
          </div>
        ))}
        {!selection && (
          <div style={{ color: "#5d6e8c", textAlign: "center", padding: "40px 10px", fontSize: 12.5 }}>
            Nothing selected.
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#070b14",
        color: "#e9eff8",
        fontFamily: "var(--font-inter, sans-serif)",
      }}
      data-testid="attack-explorer"
    >
      <style>{`@keyframes axdash{to{stroke-dashoffset:-22}} .ax-row:hover{background:#142440}`}</style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "12px 18px",
          borderBottom: "1px solid #1b2942",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontFamily: "Georgia, serif", fontSize: 16 }}>Attack Explorer</div>
        <div style={{ fontSize: 11.5, color: "#8195b1" }}>
          {footList.length} footholds · {jewelList.length} crown jewels · {pathEdges.length} paths
          {systemName ? ` · ${systemName}` : ""}
          {loading ? " · loading topology…" : null}
        </div>
        <div
          style={{
            display: "flex",
            gap: 4,
            marginLeft: 12,
            background: "#0e1726",
            border: "1px solid #26395a",
            borderRadius: 9,
            overflow: "hidden",
          }}
        >
          {(
            [
              ["graph", "Graph"],
              ["surface", "Surface"],
              ["scorecard", "Scorecard"],
            ] as const
          ).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)}>
              {label}
            </button>
          ))}
        </div>
        {selection && (
          <button
            onClick={() => setSelection(null)}
            style={{
              marginLeft: "auto",
              background: "rgba(255,155,61,.12)",
              border: "1px solid rgba(255,155,61,.4)",
              color: "#ff9b3d",
              fontSize: 11.5,
              padding: "5px 11px",
              borderRadius: 9,
              cursor: "pointer",
            }}
          >
            clear selection ✕
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: "10px 18px",
            background: "rgba(255,77,97,.08)",
            borderBottom: "1px solid rgba(255,77,97,.25)",
            fontSize: 12,
            color: "#ff9b9b",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {error}
          <button
            type="button"
            onClick={retry}
            style={{
              background: "#142440",
              border: "1px solid #26395a",
              color: "#c2cee0",
              padding: "4px 10px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {tab === "graph" ? (
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div
            style={{ flex: 1, overflow: "auto", position: "relative" }}
            onClick={() => setSelection(null)}
          >
            <svg width={W} height={H} style={{ display: "block", minWidth: W }}>
              <defs>
                {(Object.keys(BAND) as RiskBand[]).map((b) => (
                  <marker
                    key={b}
                    id={`ax-ah-${b}`}
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M0 1 L9 5 L0 9 Z" fill={BAND[b]} />
                  </marker>
                ))}
              </defs>
              <text
                x={FX + NODE_W / 2}
                y={16}
                fontSize="10.5"
                fontWeight={700}
                fill="#8195b1"
                textAnchor="middle"
                style={{ letterSpacing: ".1em" }}
              >
                FOOTHOLDS
              </text>
              <text
                x={JX + NODE_W / 2}
                y={16}
                fontSize="10.5"
                fontWeight={700}
                fill="#8195b1"
                textAnchor="middle"
                style={{ letterSpacing: ".1em" }}
              >
                CROWN JEWELS
              </text>
              {aggEdges.map((e, i) => {
                const fy = footPos.get(e.footKey)
                const jy = jewPos.get(e.jewelId)
                if (fy == null || jy == null) return null
                const hot = isAggregatedEdgeHot(e, selection)
                const dim = selection && !hot
                const d = curve(FX + NODE_W, fy, JX, jy)
                return (
                  <path
                    key={i}
                    d={d}
                    fill="none"
                    stroke={BAND[e.band]}
                    strokeWidth={hot ? 2.4 : 1.4}
                    strokeLinecap="round"
                    strokeDasharray={e.observed ? undefined : "6 5"}
                    opacity={dim ? 0.07 : hot ? 0.95 : 0.5}
                    markerEnd={`url(#ax-ah-${e.band})`}
                    style={{
                      animation: hot && e.observed ? "axdash 1.1s linear infinite" : undefined,
                      cursor: "pointer",
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setSelection({ kind: "edge", key: e.key })
                    }}
                  />
                )
              })}
              {footList.map((f) => {
                const y = footPos.get(f.key)!
                const on = isNodeHot("foot", f.key, selection, aggEdges)
                const dim = selection && !on
                const ic = ICON[footKind(f.type)]
                return (
                  <g
                    key={f.key}
                    transform={`translate(${FX}, ${y - 16})`}
                    style={{ cursor: "pointer", opacity: dim ? 0.25 : 1 }}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setSelection({ kind: "foot", key: f.key })
                    }}
                  >
                    <rect
                      width={NODE_W}
                      height={32}
                      rx={8}
                      fill="#0e1726"
                      stroke={
                        on && selection?.kind === "foot" && selection.key === f.key
                          ? "#2fd4b0"
                          : "#26395a"
                      }
                      strokeWidth={1.5}
                    />
                    <rect x={6} y={6} width={20} height={20} rx={4} fill={ic.c} />
                    <text x={16} y={20} fontSize="11" fill="#fff" textAnchor="middle">
                      {ic.glyph}
                    </text>
                    <text
                      x={32}
                      y={15}
                      fontSize="10.5"
                      fill="#e9eff8"
                      fontFamily="ui-monospace, monospace"
                    >
                      {short(f.name, 20)}
                    </text>
                    <text x={32} y={26} fontSize="8.5" fill="#5d6e8c">
                      {f.pathCount} path{f.pathCount > 1 ? "s" : ""}
                    </text>
                    <circle cx={NODE_W - 12} cy={16} r={5} fill={BAND[f.band]} />
                  </g>
                )
              })}
              {jewelList.map((j) => {
                const y = jewPos.get(j.id)!
                const on = isNodeHot("jewel", j.id, selection, aggEdges)
                const dim = selection && !on
                const ic = ICON[jewelKind(j.type, j.name)]
                return (
                  <g
                    key={j.id}
                    transform={`translate(${JX}, ${y - 16})`}
                    style={{ cursor: "pointer", opacity: dim ? 0.25 : 1 }}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setSelection({ kind: "jewel", key: j.id })
                    }}
                  >
                    <rect
                      width={NODE_W}
                      height={32}
                      rx={8}
                      fill="#0e1726"
                      stroke={
                        selection?.kind === "jewel" && selection.key === j.id
                          ? BAND[j.band]
                          : "#26395a"
                      }
                      strokeWidth={1.5}
                    />
                    <rect x={6} y={6} width={20} height={20} rx={4} fill={ic.c} />
                    <text x={16} y={20} fontSize="10" fill="#fff" textAnchor="middle">
                      {ic.glyph}
                    </text>
                    <text
                      x={32}
                      y={14}
                      fontSize="10.5"
                      fill="#e9eff8"
                      fontFamily="ui-monospace, monospace"
                    >
                      {short(j.name, 19)}
                    </text>
                    <text x={32} y={26} fontSize="8.5" fill="#5d6e8c">
                      {j.type.replace("Bucket", "").replace("Table", "")} · {j.pathCount} path
                      {j.pathCount > 1 ? "s" : ""}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
          {inspector}
        </div>
      ) : tab === "surface" ? (
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, background: "#0a1120" }}>
            {loading && !topology ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#8195b1",
                  fontSize: 13,
                }}
              >
                Loading VPC topology…
              </div>
            ) : graph && topology ? (
              <SystemVpcFlowCanvas
                topology={topology}
                graph={graph}
                selection={selection}
                onSelectionChange={setSelection}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#8195b1",
                  fontSize: 13,
                }}
              >
                No paths or topology for Surface view.
              </div>
            )}
          </div>
          {inspector}
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  color: "#8195b1",
                  fontSize: 10.5,
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                }}
              >
                {["Score", "Foothold → Crown jewel", "Band", "Evidence", "Damage", "Hops"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        borderBottom: "1px solid #26395a",
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {[...pathEdges].sort((a, b) => b.score - a.score).map((e) => (
                <tr
                  key={e.pathId}
                  className="ax-row"
                  onClick={() => setFocusPathId(e.pathId)}
                  style={{ cursor: "pointer", borderBottom: "1px solid #1b2942" }}
                >
                  <td
                    style={{
                      padding: "10px 14px",
                      fontFamily: "ui-monospace, monospace",
                      fontWeight: 600,
                      color: BAND[e.band],
                    }}
                  >
                    {e.score}
                  </td>
                  <td style={{ padding: "10px 14px", fontFamily: "ui-monospace, monospace" }}>
                    {short(e.footKey, 22)} <span style={{ color: "#5d6e8c" }}>→</span>{" "}
                    {short(jewelName(e.jewelId), 24)}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: BAND[e.band],
                        background: BAND[e.band] + "22",
                        padding: "2px 8px",
                        borderRadius: 6,
                      }}
                    >
                      {e.band}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      color: e.evidence === "observed" ? "#2fd4b0" : "#8195b1",
                      fontSize: 12,
                    }}
                  >
                    {e.evidence}
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 11,
                      color: "#c2cee0",
                    }}
                  >
                    {e.damage.slice(0, 4).join(" / ") || "—"}
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      fontFamily: "ui-monospace, monospace",
                      color: "#8195b1",
                    }}
                  >
                    {e.hops}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawerPath &&
        (() => {
          const p = drawerPath
          const sev = p.severity as { overall_score?: number; severity?: string } | undefined
          const f = footholdOfPath(p)
          const jw = graph?.byId.jewels.get(p.crown_jewel_id)
          const band = bandOf(sev?.severity)
          const ns = (p.nodes ?? []) as PathNodeDetail[]
          return (
            <>
              <div
                onClick={() => setFocusPathId(null)}
                style={{ position: "fixed", inset: 0, background: "rgba(3,7,13,.62)", zIndex: 60 }}
              />
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  right: 0,
                  height: "100%",
                  width: "min(620px,94vw)",
                  background: "#0b1322",
                  borderLeft: "1px solid #26395a",
                  zIndex: 70,
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "-30px 0 60px -20px #000",
                }}
                data-testid="attack-explorer-drawer"
              >
                <div style={{ padding: "18px 22px", borderBottom: "1px solid #1b2942" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: BAND[band],
                          background: BAND[band] + "22",
                          padding: "2px 8px",
                          borderRadius: 6,
                        }}
                      >
                        {band} · score {sev?.overall_score ?? "—"}
                      </span>
                      <div style={{ fontFamily: "Georgia, serif", fontSize: 18, marginTop: 8 }}>
                        {short(f.name, 22)}{" "}
                        <span
                          style={{
                            color: "#5d6e8c",
                            fontFamily: "ui-monospace,monospace",
                            fontSize: 15,
                          }}
                        >
                          →
                        </span>{" "}
                        {short(jw?.name || p.crown_jewel_id, 22)}
                      </div>
                      <div
                        style={{
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 12.5,
                          color: "#c2cee0",
                          marginTop: 3,
                        }}
                      >
                        {f.type} → {jw?.type || "Crown jewel"} · {p.evidence_type} ·{" "}
                        {p.hop_count ?? ns.length} hops
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flex: "none", alignItems: "flex-start" }}>
                      {onOpenFull && (
                        <button
                          onClick={() => onOpenFull(p.crown_jewel_id, p.id)}
                          style={{
                            background: "linear-gradient(180deg,#2fd4b0,#1d9d82)",
                            color: "#04121a",
                            border: "none",
                            fontWeight: 600,
                            fontSize: 12,
                            padding: "7px 12px",
                            borderRadius: 8,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Open full analysis →
                        </button>
                      )}
                      <button
                        onClick={() => setFocusPathId(null)}
                        style={{
                          background: "#142440",
                          border: "1px solid #26395a",
                          color: "#c2cee0",
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
                <div style={{ overflow: "auto", padding: "18px 22px" }}>
                  {p.damage_narrative && (
                    <div
                      style={{
                        background: "rgba(47,212,176,.08)",
                        border: "1px solid rgba(47,212,176,.22)",
                        borderLeft: "3px solid #2fd4b0",
                        borderRadius: 9,
                        padding: "12px 14px",
                        fontSize: 13.5,
                        color: "#c2cee0",
                        lineHeight: 1.5,
                      }}
                    >
                      {p.damage_narrative}
                    </div>
                  )}
                  <div style={{ fontFamily: "Georgia, serif", fontSize: 15, margin: "22px 0 12px" }}>
                    Kill chain · {ns.length} nodes
                  </div>
                  <div
                    style={{
                      position: "relative",
                      marginLeft: 8,
                      paddingLeft: 22,
                      borderLeft: "2px solid #1d9d82",
                    }}
                  >
                    {ns.map((n, i) => (
                      <div key={i} style={{ position: "relative", marginBottom: 13 }}>
                        <span
                          style={{
                            position: "absolute",
                            left: -29,
                            top: 2,
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: n.tier === "crown_jewel" ? BAND[band] : "#1d9d82",
                          }}
                        />
                        <div
                          style={{
                            fontFamily: "ui-monospace, monospace",
                            fontSize: 12.5,
                            color: "#e9eff8",
                          }}
                        >
                          {esc(n.name)}
                        </div>
                        <div style={{ fontSize: 10.5, color: "#8195b1" }}>
                          {esc(n.type)}
                          {n.tier ? ` · ${n.tier}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )
        })()}
    </div>
  )
}
