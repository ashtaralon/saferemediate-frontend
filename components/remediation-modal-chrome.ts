import type { CSSProperties } from "react"

/**
 * Shared remediation backdrop.
 *
 * Keep this as an explicit colour instead of combining `bg-black` with the
 * legacy `bg-opacity-*` utility.  In the production Tailwind build that
 * combination rendered as opaque black during IAM loading, while the S3 card
 * retained a translucent backdrop.
 */
export const REMEDIATION_MODAL_BACKDROP_STYLE: CSSProperties = {
  backgroundColor: "rgba(15, 23, 42, 0.28)",
}

