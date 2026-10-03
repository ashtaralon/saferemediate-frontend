"use client"
import { useEffect, useState } from "react";
const scenarios = { empty: "No workload accounts", connected: "Connected + published coverage", unavailable: "Service unavailable (503)", forbidden: "Access denied (403)", malformed: "Malformed response (regression)" };
export function PreviewBar() {
  const [scenario, setScenario] = useState("empty");
  useEffect(() => { setScenario(document.cookie.match(/(?:^|; )preview_scenario=([^;]*)/)?.[1] || "empty"); }, []);
  return <aside style={{position:"sticky",top:0,zIndex:9999,background:"#172554",color:"white",padding:"12px 20px",font:"13px system-ui",display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
    <strong>LOCAL PREVIEW · Synthetic test data</strong>
    <span>No live backend · Writes blocked</span>
    <label>Scenario <select aria-label="Preview scenario" value={scenario} style={{color:"#172554",background:"white",padding:5,borderRadius:4}} onChange={e=>{
      document.cookie=`preview_scenario=${e.target.value}; Path=/; SameSite=Strict`;
      localStorage.clear(); sessionStorage.clear(); window.location.reload();
    }}>{Object.entries(scenarios).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    <nav style={{display:"flex",gap:12}}>{[["/","Home"],["/settings/accounts","Accounts"],["/settings/coverage","Coverage"]].map(([href,label])=><a key={href} href={href} style={{color:"white",textDecoration:"underline"}}>{label}</a>)}</nav>
  </aside>;
}
