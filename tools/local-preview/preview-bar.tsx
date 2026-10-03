export function PreviewBar({capturedAt,sourceOrigin}: {capturedAt?:string;sourceOrigin?:string}) {
  return <aside style={{position:"sticky",top:0,zIndex:9999,background:"#172554",color:"white",padding:"12px 20px",font:"13px system-ui",display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
    <strong>LOCAL PREVIEW · Recorded real responses</strong>
    <span>No live backend · Writes blocked</span>
    <span>{capturedAt ? `Captured ${capturedAt} from ${sourceOrigin}` : "Capture unavailable"}</span>
    <nav style={{display:"flex",gap:12}}>{[["/","Home"],["/settings/accounts","Accounts"],["/settings/coverage","Coverage"]].map(([href,label])=><a key={href} href={href} style={{color:"white",textDecoration:"underline"}}>{label}</a>)}</nav>
  </aside>;
}
