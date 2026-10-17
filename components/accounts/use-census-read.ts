"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  CURSOR_RESTART_REQUIRED,
  parseCensusResponse,
  type CensusData,
  type CensusFetcher,
  type CensusOutcome,
  type CensusRow,
  type Depth,
} from "@/lib/account-census"

/** How often a read restarts from the first page because the publication moved under it, before it says so. */
export const MAX_RESTARTS = 2
/** A filtered listing may answer empty pages before its rows (it pages by chunk): at most this many are followed on. */
export const MAX_EMPTY_PAGES = 50
export const PUBLICATION_MOVED = "PUBLICATION_MOVED_REPEATEDLY"

export type CensusModel =
  | { kind: "loading" }
  | { kind: "data"; first: CensusData; rows: CensusRow[]; nextCursor: string | null; loadingMore: boolean }
  | { kind: "outcome"; outcome: CensusOutcome }

/**
 * The ONE reader of one account's census at one depth: the first page, then "more" pages of the SAME publication only.
 * A page of another publication, a repeated row, or the backend's CURSOR_RESTART_REQUIRED restarts the read from the
 * first page (at most MAX_RESTARTS times, then the moved publication is said, not hidden). Epoch-guarded: an answer
 * to a superseded read never touches state.
 */
export function useCensusRead(accountId: string, depth: Depth, fetchPage: CensusFetcher) {
  const [model, setModel] = useState<CensusModel>({ kind: "loading" })
  const modelRef = useRef<CensusModel>(model)
  const epoch = useRef(0)
  const restarts = useRef(0)
  const emptyPages = useRef(0)
  const continueRef = useRef<() => void>(() => {})
  const controllers = useRef<AbortController[]>([])

  const commit = useCallback((next: CensusModel) => {
    modelRef.current = next
    setModel(next)
  }, [])

  const abortAll = () => {
    for (const controller of controllers.current) controller.abort()
    controllers.current = []
  }

  const readFirst = useCallback(() => {
    abortAll()
    epoch.current += 1
    emptyPages.current = 0
    const mine = epoch.current
    const controller = new AbortController()
    controllers.current.push(controller)
    commit({ kind: "loading" })
    void fetchPage(accountId, { depth, cursor: null }, controller.signal).then(({ status, body }) => {
      if (mine !== epoch.current) return
      const parsed = parseCensusResponse(status, body, accountId, depth)
      if (parsed.kind === "data") {
        commit({ kind: "data", first: parsed, rows: parsed.rows, nextCursor: parsed.nextCursor, loadingMore: false })
        if (parsed.rows.length === 0 && parsed.nextCursor !== null) continueRef.current()
      } else {
        commit({ kind: "outcome", outcome: parsed })
      }
    })
  }, [accountId, depth, fetchPage, commit])

  const restart = useCallback(() => {
    restarts.current += 1
    if (restarts.current > MAX_RESTARTS) {
      commit({ kind: "outcome", outcome: { kind: "unavailable", status: 409, state: "unavailable",
        reasonCode: PUBLICATION_MOVED, detail: null } })
      return
    }
    readFirst()
  }, [readFirst, commit])

  const loadMore = useCallback(() => {
    const current = modelRef.current
    if (current.kind !== "data" || current.nextCursor === null || current.loadingMore) return
    const mine = epoch.current
    const controller = new AbortController()
    controllers.current.push(controller)
    commit({ ...current, loadingMore: true })
    void fetchPage(accountId, { depth, cursor: current.nextCursor }, controller.signal).then(({ status, body }) => {
      if (mine !== epoch.current) return
      const latest = modelRef.current
      if (latest.kind !== "data") return
      const parsed = parseCensusResponse(status, body, accountId, depth)
      if (parsed.kind !== "data") {
        if (parsed.reasonCode?.startsWith(CURSOR_RESTART_REQUIRED)) {
          restart()
          return
        }
        commit({ kind: "outcome", outcome: parsed })
        return
      }
      const seen = new Set(latest.rows.map((row) => row.row_key))
      if (parsed.publication.attempt !== latest.first.publication.attempt || parsed.rows.some((row) => seen.has(row.row_key))) {
        restart()
        return
      }
      commit({ ...latest, rows: [...latest.rows, ...parsed.rows], nextCursor: parsed.nextCursor, loadingMore: false })
      if (parsed.rows.length === 0 && parsed.nextCursor !== null) continueRef.current()
    })
  }, [accountId, depth, fetchPage, commit, restart])

  // Follow an empty filtered page on to the next one (bounded), so "nothing listed" is never said while pages remain.
  continueRef.current = () => {
    emptyPages.current += 1
    if (emptyPages.current <= MAX_EMPTY_PAGES) loadMore()
  }

  useEffect(() => {
    restarts.current = 0
    readFirst()
    return () => {
      epoch.current += 1
      abortAll()
    }
  }, [readFirst])

  return { model, loadMore, refresh: () => { restarts.current = 0; readFirst() } }
}
