"use client"

// Light/dark toggle (next-themes). Light = today's look; dark = the navy/teal
// attacker-view aesthetic. Renders nothing until mounted to avoid hydration
// mismatch on the theme class.
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={mounted ? (isDark ? "Light mode" : "Dark mode") : "Toggle theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`inline-flex items-center justify-center rounded-md border border-border bg-card/60 p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ${className}`}
    >
      {/* Avoid hydration flash: render a neutral icon until mounted. */}
      {mounted && isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
