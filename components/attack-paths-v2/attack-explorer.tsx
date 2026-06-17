"use client"

// Attack Explorer — account-wide interactive view of EVERY path in the system:
// footholds on the left, crown jewels on the right, attack edges between them.
// Click a crown jewel (e.g. an S3 bucket) to light up ALL its connections; click
// a foothold to see everything it reaches; click an edge/row to open the path's
// kill-chain. Fed live by the same identity-attack-paths data the page already
// loads (no snapshot, no mock). This is the in-product port of the standalone
// Attack-Path Explorer.

import { useMemo, useState } from "react"
import type { IdentityAttackPath, CrownJewelSummary, PathNodeDetail } from "@/components/identity-attack-paths/types"

const BAND = { CRITICAL: "#ff4d61", HIGH: "#ff9b3d", MEDIUM: "#ffd24d", LOW: "#46c7c0", UNKNOWN: "#8195b1" } as const
type Band = keyof typeof BAND
const bandOf = (s?: string | null): Band => {
  const u = (s || "").toUpperCase()
  return (u === "CRITICAL" || u === "HIGH" || u === "MEDIUM" || u === "LOW") ? (u as Band) : "UNKNOWN"
}
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
const footKind = (t?: string) => (/lambda/i.test(t || "") ? "lambda" : /role|principal|user/i.test(t || "") ? "role" : "ec2")

const ICON: Record<string, { c: string; glyph: string }> = {
  ec2: { c: "#E8881C", glyph: "▦" }, lambda: { c: "#E8881C", glyph: "λ" }, role: { c: "#D9303F", glyph: "☷" },
  s3: { c: "#2E9E5B", glyph: "🪣" }, kms: { c: "#D9303F", glyph: "🔑" }, ddb: { c: "#4D72F3", glyph: "▤" }, rds: { c: "#3060C0", glyph: "🛢" }, ses: { c: "#3060C0", glyph: "✉" },
}

function footOf(p: IdentityAttackPath): { name: string; type: string } {
  const ns = (p.nodes ?? []) as PathNodeDetail[]
  const c = ns.find((n) => /ec2|instance|lambda|ecs|fargate|compute/i.test(n.type || "")) || ns.find((n) => n.tier === "entry") || ns[0]
  return { name: c?.name || "unknown", type: c?.type || "EC2Instance" }
}

interface ExplEdge { foot: string; footType: string; jewelId: string; score: number; band: Band; evidence: string; pathId: string; damage: string[]; hops: number; path: IdentityAttackPath }

export function AttackExplorer({ jewels, paths, systemName, onOpenFull }: { jewels: CrownJewelSummary[]; paths: IdentityAttackPath[]; systemName?: string | null; onOpenFull?: (jewelId: string, pathId: string) => void }) {
  const [tab, setTab] = useState<"graph" | "scorecard">("graph")
  const [sel, setSel] = useState<{ kind: "foot" | "jewel" | "edge"; key: string } | null>(null)
  const [drawerId, setDrawerId] = useState<string | null>(null)

  const model = useMemo(() => {
    const jewelById = new Map(jewels.map((j) => [j.id, j]))
    const edges: ExplEdge[] = []
    for (const p of paths) {
      const f = footOf(p)
      const sev = p.severity as { overall_score?: number; severity?: string } | undefined
      edges.push({
        foot: f.name, footType: f.type, jewelId: p.crown_jewel_id,
        score: sev?.overall_score ?? 0, band: bandOf(sev?.severity), evidence: p.evidence_type || "configured",
        pathId: p.id, damage: (p.damage_types as string[]) ?? [], hops: p.hop_count ?? (p.nodes?.length ?? 0), path: p,
      })
    }
    const foots = new Map<string, { name: string; type: string; maxScore: number; band: Band; n: number }>()
    const jset = new Map<string, { id: string; name: string; type: string; maxScore: number; band: Band; n: number }>()
    for (const e of edges) {
      const f = foots.get(e.foot) || { name: e.foot, type: e.footType, maxScore: 0, band: "LOW" as Band, n: 0 }
      if (e.score >= f.maxScore) { f.maxScore = e.score; f.band = e.band }
      f.n++; foots.set(e.foot, f)
      const jw = jewelById.get(e.jewelId)
      const j = jset.get(e.jewelId) || { id: e.jewelId, name: jw?.name || e.jewelId, type: jw?.type || "S3Bucket", maxScore: 0, band: "LOW" as Band, n: 0 }
      if (e.score >= j.maxScore) { j.maxScore = e.score; j.band = e.band }
      j.n++; jset.set(e.jewelId, j)
    }
    const footList = [...foots.values()].sort((a, b) => b.maxScore - a.maxScore)
    const jewelList = [...jset.values()].sort((a, b) => b.maxScore - a.maxScore)
    return { edges, footList, jewelList }
  }, [jewels, paths])

  // layout
  const ROW = 46, PADY = 24, FX = 230, JX = 720, NODE_W = 188
  const H = Math.max(model.footList.length, model.jewelList.length) * ROW + PADY * 2
  const W = JX + NODE_W + 30
  const footY = (i: number) => PADY + i * ROW + ROW / 2 + ((H - PADY * 2 - model.footList.length * ROW) / 2)
  const jewY = (i: number) => PADY + i * ROW + ROW / 2 + ((H - PADY * 2 - model.jewelList.length * ROW) / 2)
  const footPos = new Map(model.footList.map((f, i) => [f.name, footY(i)]))
  const jewPos = new Map(model.jewelList.map((j, i) => [j.id, jewY(i)]))

  const aggEdges = useMemo(() => {
    const m = new Map<string, { foot: string; jewelId: string; band: Band; maxScore: number; observed: boolean; pathIds: string[] }>()
    for (const e of model.edges) {
      const k = e.foot + "||" + e.jewelId
      const g = m.get(k) || { foot: e.foot, jewelId: e.jewelId, band: "LOW" as Band, maxScore: 0, observed: false, pathIds: [] }
      if (e.score >= g.maxScore) { g.maxScore = e.score; g.band = e.band }
      g.observed = g.observed || e.evidence === "observed"
      g.pathIds.push(e.pathId); m.set(k, g)
    }
    return [...m.values()]
  }, [model])

  const isHot = (e: { foot: string; jewelId: string }) => {
    if (!sel) return true
    if (sel.kind === "foot") return e.foot === sel.key
    if (sel.kind === "jewel") return e.jewelId === sel.key
    if (sel.kind === "edge") return sel.key === e.foot + "||" + e.jewelId
    return true
  }
  const nodeHot = (kind: "foot" | "jewel", key: string) => {
    if (!sel) return true
    if (sel.kind === kind && sel.key === key) return true
    return aggEdges.some((e) => (e.foot === (kind === "foot" ? key : e.foot)) && (e.jewelId === (kind === "jewel" ? key : e.jewelId)) && isHot(e) && (kind === "foot" ? e.foot === key : e.jewelId === key))
  }

  // inspector content
  const inspectorPaths = useMemo(() => {
    if (!sel) return []
    let es = model.edges
    if (sel.kind === "foot") es = es.filter((e) => e.foot === sel.key)
    else if (sel.kind === "jewel") es = es.filter((e) => e.jewelId === sel.key)
    else if (sel.kind === "edge") { const [f, j] = sel.key.split("||"); es = es.filter((e) => e.foot === f && e.jewelId === j) }
    return es.sort((a, b) => b.score - a.score)
  }, [sel, model])

  const jewelName = (id: string) => model.jewelList.find((j) => j.id === id)?.name || id
  const drawerPath = drawerId ? model.edges.find((e) => e.pathId === drawerId)?.path : null

  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = (x2 - x1) * 0.45
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#070b14", color: "#e9eff8", fontFamily: "var(--font-inter, sans-serif)" }}>
      <style>{`@keyframes axdash{to{stroke-dashoffset:-22}} .ax-row:hover{background:#142440}`}</style>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderBottom: "1px solid #1b2942", flexWrap: "wrap" }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 16 }}>Attack Explorer</div>
        <div style={{ fontSize: 11.5, color: "#8195b1" }}>{model.footList.length} footholds · {model.jewelList.length} crown jewels · {model.edges.length} paths{systemName ? ` · ${systemName}` : ""}</div>
        <div style={{ display: "flex", gap: 4, marginLeft: 12, background: "#0e1726", border: "1px solid #26395a", borderRadius: 9, overflow: "hidden" }}>
          {(["graph", "scorecard"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? "rgba(47,212,176,.12)" : "none", color: tab === t ? "#2fd4b0" : "#8195b1", border: "none", padding: "6px 13px", fontSize: 12, cursor: "pointer", textTransform: "capitalize" }}>{t === "graph" ? "Graph" : "Scorecard"}</button>
          ))}
        </div>
        {sel && <button onClick={() => setSel(null)} style={{ marginLeft: "auto", background: "rgba(255,155,61,.12)", border: "1px solid rgba(255,155,61,.4)", color: "#ff9b3d", fontSize: 11.5, padding: "5px 11px", borderRadius: 9, cursor: "pointer" }}>clear selection ✕</button>}
      </div>

      {tab === "graph" ? (
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* graph */}
          <div style={{ flex: 1, overflow: "auto", position: "relative" }} onClick={() => setSel(null)}>
            <svg width={W} height={H} style={{ display: "block", minWidth: W }}>
              <defs>
                {(Object.keys(BAND) as Band[]).map((b) => (
                  <marker key={b} id={`ax-ah-${b}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 Z" fill={BAND[b]} /></marker>
                ))}
              </defs>
              {/* column labels */}
              <text x={FX + NODE_W / 2} y={16} fontSize="10.5" fontWeight={700} fill="#8195b1" textAnchor="middle" style={{ letterSpacing: ".1em" }}>FOOTHOLDS</text>
              <text x={JX + NODE_W / 2} y={16} fontSize="10.5" fontWeight={700} fill="#8195b1" textAnchor="middle" style={{ letterSpacing: ".1em" }}>CROWN JEWELS</text>
              {/* edges */}
              {aggEdges.map((e, i) => {
                const fy = footPos.get(e.foot), jy = jewPos.get(e.jewelId)
                if (fy == null || jy == null) return null
                const hot = isHot(e), dim = sel && !hot
                const d = curve(FX + NODE_W, fy, JX, jy)
                return (
                  <path key={i} d={d} fill="none" stroke={BAND[e.band]} strokeWidth={hot ? 2.4 : 1.4} strokeLinecap="round"
                    strokeDasharray={e.observed ? undefined : "6 5"} opacity={dim ? 0.07 : hot ? 0.95 : 0.5}
                    markerEnd={`url(#ax-ah-${e.band})`} style={{ animation: hot && e.observed ? "axdash 1.1s linear infinite" : undefined, cursor: "pointer" }}
                    onClick={(ev) => { ev.stopPropagation(); setSel({ kind: "edge", key: e.foot + "||" + e.jewelId }) }} />
                )
              })}
              {/* foothold nodes */}
              {model.footList.map((f) => {
                const y = footPos.get(f.name)!, on = nodeHot("foot", f.name), dim = sel && !on
                const ic = ICON[footKind(f.type)]
                return (
                  <g key={f.name} transform={`translate(${FX}, ${y - 16})`} style={{ cursor: "pointer", opacity: dim ? 0.25 : 1 }}
                    onClick={(ev) => { ev.stopPropagation(); setSel({ kind: "foot", key: f.name }) }}>
                    <rect width={NODE_W} height={32} rx={8} fill="#0e1726" stroke={on && sel?.kind === "foot" && sel.key === f.name ? "#2fd4b0" : "#26395a"} strokeWidth={1.5} />
                    <rect x={6} y={6} width={20} height={20} rx={4} fill={ic.c} />
                    <text x={16} y={20} fontSize="11" fill="#fff" textAnchor="middle">{ic.glyph}</text>
                    <text x={32} y={15} fontSize="10.5" fill="#e9eff8" fontFamily="ui-monospace, monospace">{short(f.name, 20)}</text>
                    <text x={32} y={26} fontSize="8.5" fill="#5d6e8c">{f.n} path{f.n > 1 ? "s" : ""}</text>
                    <circle cx={NODE_W - 12} cy={16} r={5} fill={BAND[f.band]} />
                  </g>
                )
              })}
              {/* jewel nodes */}
              {model.jewelList.map((j) => {
                const y = jewPos.get(j.id)!, on = nodeHot("jewel", j.id), dim = sel && !on
                const ic = ICON[jewelKind(j.type, j.name)]
                return (
                  <g key={j.id} transform={`translate(${JX}, ${y - 16})`} style={{ cursor: "pointer", opacity: dim ? 0.25 : 1 }}
                    onClick={(ev) => { ev.stopPropagation(); setSel({ kind: "jewel", key: j.id }) }}>
                    <rect width={NODE_W} height={32} rx={8} fill="#0e1726" stroke={sel?.kind === "jewel" && sel.key === j.id ? BAND[j.band] : "#26395a"} strokeWidth={1.5} />
                    <rect x={6} y={6} width={20} height={20} rx={4} fill={ic.c} />
                    <text x={16} y={20} fontSize="10" fill="#fff" textAnchor="middle">{ic.glyph}</text>
                    <text x={32} y={14} fontSize="10.5" fill="#e9eff8" fontFamily="ui-monospace, monospace">{short(j.name, 19)}</text>
                    <text x={32} y={26} fontSize="8.5" fill="#5d6e8c">{j.type.replace("Bucket", "").replace("Table", "")} · {j.n} path{j.n > 1 ? "s" : ""}</text>
                  </g>
                )
              })}
            </svg>
          </div>
          {/* inspector */}
          <div style={{ width: 320, flex: "0 0 320px", borderLeft: "1px solid #1b2942", display: "flex", flexDirection: "column", background: "#0a1120" }}>
            <div style={{ padding: "13px 15px", borderBottom: "1px solid #1b2942" }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 15 }}>{sel ? (sel.kind === "jewel" ? short(jewelName(sel.key), 28) : sel.kind === "foot" ? short(sel.key, 28) : "Route") : "Inspector"}</div>
              <div style={{ fontSize: 11.5, color: "#8195b1", marginTop: 3 }}>{sel ? `${inspectorPaths.length} attack path${inspectorPaths.length !== 1 ? "s" : ""}` : "Click a crown jewel to see every path that reaches it, or a foothold to see what it can reach."}</div>
            </div>
            <div style={{ overflow: "auto", padding: "8px 10px" }}>
              {inspectorPaths.map((e) => (
                <div key={e.pathId} className="ax-row" onClick={() => setDrawerId(e.pathId)} style={{ padding: "9px 10px", border: "1px solid #1b2942", borderRadius: 9, margin: "6px 2px", cursor: "pointer", background: "#0e1726" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 600 }}>{short(e.foot, 16)} <span style={{ color: "#5d6e8c" }}>→</span> {short(jewelName(e.jewelId), 14)}</span>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, fontSize: 12, color: BAND[e.band] }}>{e.score}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#8195b1", marginTop: 3, fontFamily: "ui-monospace, monospace" }}>{e.band} · {e.evidence} · {e.damage.slice(0, 3).join("/") || "—"} · {e.hops} hops</div>
                </div>
              ))}
              {!sel && <div style={{ color: "#5d6e8c", textAlign: "center", padding: "40px 10px", fontSize: 12.5 }}>Nothing selected.</div>}
            </div>
          </div>
        </div>
      ) : (
        // scorecard
        <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ color: "#8195b1", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em" }}>
              {["Score", "Foothold → Crown jewel", "Band", "Evidence", "Damage", "Hops"].map((h) => <th key={h} style={{ textAlign: "left", padding: "10px 14px", borderBottom: "1px solid #26395a" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {[...model.edges].sort((a, b) => b.score - a.score).map((e) => (
                <tr key={e.pathId} className="ax-row" onClick={() => setDrawerId(e.pathId)} style={{ cursor: "pointer", borderBottom: "1px solid #1b2942" }}>
                  <td style={{ padding: "10px 14px", fontFamily: "ui-monospace, monospace", fontWeight: 600, color: BAND[e.band] }}>{e.score}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "ui-monospace, monospace" }}>{short(e.foot, 22)} <span style={{ color: "#5d6e8c" }}>→</span> {short(jewelName(e.jewelId), 24)}</td>
                  <td style={{ padding: "10px 14px" }}><span style={{ fontSize: 10, fontWeight: 700, color: BAND[e.band], background: BAND[e.band] + "22", padding: "2px 8px", borderRadius: 6 }}>{e.band}</span></td>
                  <td style={{ padding: "10px 14px", color: e.evidence === "observed" ? "#2fd4b0" : "#8195b1", fontSize: 12 }}>{e.evidence}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#c2cee0" }}>{e.damage.slice(0, 4).join(" / ") || "—"}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "ui-monospace, monospace", color: "#8195b1" }}>{e.hops}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* drawer */}
      {drawerPath && (() => {
        const p = drawerPath, sev = p.severity as { overall_score?: number; severity?: string } | undefined
        const f = footOf(p), jw = model.jewelList.find((j) => j.id === p.crown_jewel_id)
        const band = bandOf(sev?.severity), ns = (p.nodes ?? []) as PathNodeDetail[]
        return (
          <>
            <div onClick={() => setDrawerId(null)} style={{ position: "fixed", inset: 0, background: "rgba(3,7,13,.62)", zIndex: 60 }} />
            <div style={{ position: "fixed", top: 0, right: 0, height: "100%", width: "min(620px,94vw)", background: "#0b1322", borderLeft: "1px solid #26395a", zIndex: 70, display: "flex", flexDirection: "column", boxShadow: "-30px 0 60px -20px #000" }}>
              <div style={{ padding: "18px 22px", borderBottom: "1px solid #1b2942" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: BAND[band], background: BAND[band] + "22", padding: "2px 8px", borderRadius: 6 }}>{band} · score {sev?.overall_score ?? "—"}</span>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 18, marginTop: 8 }}>{short(f.name, 22)} <span style={{ color: "#5d6e8c", fontFamily: "ui-monospace,monospace", fontSize: 15 }}>→</span> {short(jw?.name || p.crown_jewel_id, 22)}</div>
                    <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: "#c2cee0", marginTop: 3 }}>{f.type} → {jw?.type || "Crown jewel"} · {p.evidence_type} · {p.hop_count ?? ns.length} hops</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flex: "none", alignItems: "flex-start" }}>
                    {onOpenFull && (
                      <button onClick={() => onOpenFull(p.crown_jewel_id, p.id)} style={{ background: "linear-gradient(180deg,#2fd4b0,#1d9d82)", color: "#04121a", border: "none", fontWeight: 600, fontSize: 12, padding: "7px 12px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" }}>Open full analysis →</button>
                    )}
                    <button onClick={() => setDrawerId(null)} style={{ background: "#142440", border: "1px solid #26395a", color: "#c2cee0", width: 30, height: 30, borderRadius: 8, cursor: "pointer" }}>✕</button>
                  </div>
                </div>
              </div>
              <div style={{ overflow: "auto", padding: "18px 22px" }}>
                {p.damage_narrative && <div style={{ background: "rgba(47,212,176,.08)", border: "1px solid rgba(47,212,176,.22)", borderLeft: "3px solid #2fd4b0", borderRadius: 9, padding: "12px 14px", fontSize: 13.5, color: "#c2cee0", lineHeight: 1.5 }}>{p.damage_narrative}</div>}
                <div style={{ fontFamily: "Georgia, serif", fontSize: 15, margin: "22px 0 12px" }}>Kill chain · {ns.length} nodes</div>
                <div style={{ position: "relative", marginLeft: 8, paddingLeft: 22, borderLeft: "2px solid #1d9d82" }}>
                  {ns.map((n, i) => (
                    <div key={i} style={{ position: "relative", marginBottom: 13 }}>
                      <span style={{ position: "absolute", left: -29, top: 2, width: 10, height: 10, borderRadius: "50%", background: n.tier === "crown_jewel" ? BAND[band] : "#1d9d82" }} />
                      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: "#e9eff8" }}>{esc(n.name)}</div>
                      <div style={{ fontSize: 10.5, color: "#8195b1" }}>{esc(n.type)}{n.tier ? ` · ${n.tier}` : ""}</div>
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
