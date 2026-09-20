"use client"

import { useEffect, useState } from "react"

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

/**
 * Whether the viewer asked the operating system for reduced motion.
 *
 * The Estate map draws its traffic motion with SMIL (<animate>,
 * <animateMotion>), which CSS media queries cannot switch off, so the renderer
 * has to read the preference itself. Starts false for the server render and
 * follows live changes of the setting.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const media = window.matchMedia(REDUCED_MOTION_QUERY)
    setReduce(media.matches)
    const onChange = (event: MediaQueryListEvent) => setReduce(event.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])
  return reduce
}
