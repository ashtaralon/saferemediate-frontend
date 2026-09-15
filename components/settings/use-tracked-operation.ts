"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  OnboardingApiError,
  cancelOperation,
  readOperation,
  retryOperation,
  trackOperation,
  type Operation,
  type OperationEvent,
} from "@/lib/account-onboarding"

export function errorText(reason: unknown): string {
  if (reason instanceof OnboardingApiError) return reason.message
  if (reason instanceof Error) return reason.message
  return String(reason)
}

/** Submit, follow and act on one operation. Polling stops when the component unmounts. */
export function useTrackedOperation(options: { intervalMs?: number } = {}) {
  const [operation, setOperation] = useState<Operation | null>(null)
  const [events, setEvents] = useState<OperationEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const follow = useCallback(async (initial: Operation) => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setOperation(initial)
    try {
      const first = await readOperation(initial.customer_id, initial.account_id, initial.operation_id, controller.signal)
      setOperation(first.operation)
      setEvents(first.events)
      return await trackOperation(first.operation, (update) => {
        setOperation(update.operation)
        setEvents(update.events)
      }, { signal: controller.signal, intervalMs: options.intervalMs })
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return null
      setError(errorText(reason))
      return null
    }
  }, [options.intervalMs])

  const start = useCallback(async (submit: () => Promise<{ operation: Operation }>) => {
    setBusy(true)
    setError(null)
    try {
      const { operation: created } = await submit()
      setBusy(false)
      return await follow(created)
    } catch (reason) {
      if (reason instanceof OnboardingApiError && reason.operation) {
        setOperation(reason.operation)
        void follow(reason.operation)
      }
      setError(errorText(reason))
      return null
    } finally {
      setBusy(false)
    }
  }, [follow])

  const cancel = useCallback(async (target: Operation) => {
    setBusy(true)
    setError(null)
    try {
      await follow(await cancelOperation(target))
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }, [follow])

  const retry = useCallback(async (target: Operation) => {
    setBusy(true)
    setError(null)
    try {
      await follow(await retryOperation(target))
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }, [follow])

  return { operation, events, busy, error, setError, start, follow, cancel, retry, reset: () => { abort.current?.abort(); setOperation(null); setEvents([]); setError(null) } }
}
