"use client"

import type { ReactNode } from "react"
import { GlobalScopeBar } from "@/components/global-scope-bar"

export function ProductScopeShell({ children }: { children: ReactNode }) {
  return (
    <>
      <GlobalScopeBar />
      {children}
    </>
  )
}
