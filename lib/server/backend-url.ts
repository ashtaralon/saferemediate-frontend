export function getBackendBaseUrl() {
  // Local-dev override: when BACKEND_URL_OVERRIDE is set (matches the
  // convention already used by app/api/proxy/data-leak-paths,
  // attack-chain/canvas, attack-chain/graph-view, etc., and the
  // `frontend-local` entry in /Users/admin/Documents/Eltro/.claude/
  // launch.json), proxy routes hit it instead of Render. Used to
  // exercise unmerged backend changes via the local Next.js dev
  // server. Production deploys leave it unset.
  return (
    process.env.BACKEND_URL_OVERRIDE ||
    "https://saferemediate-backend-f.onrender.com"
  )
}
