/**
 * Request identity for imperative loaders.
 *
 * `useCachedFetch` guards against stale responses with an epoch counter: each
 * fetch captures the counter, and any response whose captured value no longer
 * matches is discarded. Loaders that cannot use the hook — anything issuing
 * requests inside a `Promise.all`, which is every imperative dashboard loader —
 * inherited none of that.
 *
 * The failure it prevents is the quiet kind. Switch systems while a slow
 * response is in flight, or let a manual Retry overlap the poll, and the
 * last-resolving response wins rather than the newest. The result is plausible,
 * correctly-formatted numbers attached to the wrong system: nothing looks
 * broken.
 *
 * ABORT, AND WHY IT IS SAFE HERE
 *
 * `useCachedFetch` deliberately does NOT abort. 15+ cards call it in parallel,
 * and aborting on every effect re-run filled DevTools with red "(canceled)"
 * rows that operators read as broken proxies. That reasoning is specific to
 * many cards re-running on incidental re-renders. A single loader keyed to a
 * deliberate navigation cancels at most one request per switch — and with
 * retries a request can stay alive ~110s, so not cancelling leaves work running
 * long after its answer stopped being usable.
 *
 * Both mechanisms are kept because they cover different failures: abort stops
 * the work, the epoch stops the WRITE. A response that resolves in the gap
 * before an abort takes effect is still refused by the epoch check.
 */

export interface RequestHandle {
  /** Pass to `fetch` so the request can be cancelled. */
  readonly signal: AbortSignal
  /** False once a newer request has begun — this response must not be applied. */
  isCurrent(): boolean
  /** True when this request was cancelled rather than having failed. */
  wasAborted(): boolean
}

export class RequestEpoch {
  private epoch = 0
  private controller: AbortController | null = null

  /**
   * Start a request, superseding any in flight.
   *
   * Bumps the epoch FIRST so that even if the abort does not land before an
   * older response resolves, that response already fails `isCurrent()`.
   */
  begin(): RequestHandle {
    this.controller?.abort()
    this.epoch += 1
    const myEpoch = this.epoch
    const controller = new AbortController()
    this.controller = controller

    return {
      signal: controller.signal,
      isCurrent: () => myEpoch === this.epoch,
      wasAborted: () => controller.signal.aborted,
    }
  }

  /**
   * Cancel in flight work and invalidate any response still to come.
   *
   * For unmount and for leaving a system. The epoch bump matters as much as the
   * abort: a response already past the network but not yet applied would
   * otherwise write into the next system's view.
   */
  cancel(): void {
    this.controller?.abort()
    this.controller = null
    this.epoch += 1
  }

  /** Test/diagnostic only. */
  get current(): number {
    return this.epoch
  }
}
