"use client"

// Client-only mount for the standalone /attack-paths-v2 route.
//
// AttackPathsV2 seeds its initial state from localStorage (useCachedFetch reads
// the SWR cache synchronously on first render for an instant cached paint). On
// the server there's no localStorage, so an SSR render produces the loading
// state while the client's first render produces the cached shell — a hydration
// mismatch ("SSR spinner vs client shell"). The dashboard already mounts this
// component via dynamic({ ssr: false }); the standalone page must do the same so
// the cache-seeded first paint only ever happens on the client. ssr:false is
// valid here because this wrapper is itself a Client Component.

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

const AttackPathsV2 = dynamic(
  () =>
    import("@/components/attack-paths-v2/attack-paths-v2").then((m) => ({
      default: m.AttackPathsV2,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
)

export function AttackPathsV2Client() {
  return <AttackPathsV2 />
}
