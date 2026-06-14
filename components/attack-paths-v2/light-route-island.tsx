"use client"

import { useEffect, type ReactNode } from "react"

// Light-route island for the Attack Paths v2 surface.
//
// The app uses next-themes (attribute="class") with defaultTheme="light".
// Dark mode = a `.dark` class on <html>, which both (a) swaps the CSS color
// variables to dark values and (b) activates every `dark:` Tailwind variant
// (custom-variant `&:is(.dark *)`). There is no way to "un-dark" a subtree
// from a descendant, so to render this surface light REGARDLESS of the user's
// persisted toggle we remove `.dark` at the route root for the route's
// lifetime, then restore it on unmount (we never touch localStorage / the
// user's saved preference). A MutationObserver keeps the island light if
// next-themes (or anything) tries to re-add the class while we're mounted.
//
// This is the single highest-leverage piece of the light repaint: every
// CSS-var-based shell component (jewel list, path list, mode bar) and every
// `dark:` accent variant flips to light from one place. Components with
// HARD-CODED dark colors (e.g. the legacy flow-map canvas) are not covered —
// those are handled by their own light styling / replacement.
export function LightRouteIsland({ children }: { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement
    const hadDark = html.classList.contains("dark")
    const prevColorScheme = html.style.colorScheme

    const forceLight = () => {
      if (html.classList.contains("dark")) html.classList.remove("dark")
    }
    forceLight()
    html.style.colorScheme = "light"

    const obs = new MutationObserver(forceLight)
    obs.observe(html, { attributes: true, attributeFilter: ["class"] })

    return () => {
      obs.disconnect()
      if (hadDark) html.classList.add("dark")
      html.style.colorScheme = prevColorScheme
    }
  }, [])

  return <>{children}</>
}
