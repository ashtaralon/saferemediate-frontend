/// <reference types="vitest/globals" />
/**
 * Every proxy abort must be able to actually fire.
 *
 * A proxy route's `catch` block is where the graceful degradation lives —
 * stale cache, the honest error envelope, the "backend warming up" signal. All
 * of it is reached only if OUR AbortController fires before the PLATFORM kills
 * the function. If the abort is set at or beyond `maxDuration`, Vercel
 * terminates first, the catch never runs, and the user gets a raw 504 instead
 * of the designed fallback. The timeout looks configured and does nothing.
 *
 * Found across 41 routes on 2026-08-01, after the same bug cost the Resource
 * Risk tab every cold start (PR #492). One of the 41 had TWO abort calls and a
 * scripted fix caught only the first — which is exactly why this asserts over
 * every occurrence in every file rather than trusting a one-off sweep.
 *
 * Effective cap = `export const maxDuration` when the route declares one, else
 * the project default from vercel.json. Per Vercel's docs the route-segment
 * export is the per-function config for the Next.js App Router, and the
 * vercel.json `functions` glob sets the project DEFAULT — so the export wins.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const PROXY_DIR = join(ROOT, 'app/api/proxy')

/** Headroom between the abort and the platform kill. */
const MIN_HEADROOM_MS = 5_000

function projectDefaultSeconds(): number {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
  const fns = cfg.functions ?? {}
  const entry = fns['app/api/**/*.ts']
  if (!entry?.maxDuration) {
    throw new Error(
      'vercel.json no longer sets a default maxDuration for app/api/**/*.ts. ' +
      'This test derives the cap from it; update it deliberately.',
    )
  }
  return entry.maxDuration
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('route.ts') ? [p] : []
  })
}

type Finding = { file: string; abortMs: number; capMs: number }

function scan(): { routes: number; withAbort: number; violations: Finding[] } {
  const defaultCapMs = projectDefaultSeconds() * 1000
  const files = walk(PROXY_DIR)
  const violations: Finding[] = []
  let withAbort = 0

  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    // Every occurrence — a route with both GET and POST has two.
    const aborts = [...src.matchAll(/controller\.abort\(\),\s*([0-9_]+)/g)]
      .map((m) => Number(m[1].replace(/_/g, '')))
    if (aborts.length === 0) continue
    withAbort++

    const declared = src.match(/export const maxDuration\s*=\s*(\d+)/)
    const capMs = (declared ? Number(declared[1]) : defaultCapMs / 1000) * 1000

    for (const abortMs of aborts) {
      if (abortMs > capMs - MIN_HEADROOM_MS) {
        violations.push({ file: file.replace(ROOT + '/', ''), abortMs, capMs })
      }
    }
  }
  return { routes: files.length, withAbort, violations }
}

describe('proxy abort timeouts can fire before the platform kills the function', () => {
  const result = scan()

  it('scans a meaningful number of routes', () => {
    // Guards the guard: a broken glob would make the assertion below
    // vacuously true, which is the failure mode this whole class of bug is.
    expect(result.routes).toBeGreaterThan(100)
    expect(result.withAbort).toBeGreaterThan(100)
  })

  it('leaves at least 5s of headroom on every abort in every route', () => {
    const detail = result.violations
      .map((v) => `  ${v.abortMs / 1000}s abort vs ${v.capMs / 1000}s cap — ${v.file}`)
      .join('\n')
    expect(
      result.violations,
      result.violations.length
        ? `\n${result.violations.length} proxy route(s) abort at or after their own ` +
          `maxDuration, so the catch block is unreachable:\n${detail}\n\n` +
          `Either lower the abort, or raise maxDuration (the route-segment export ` +
          `overrides the vercel.json project default).\n`
        : undefined,
    ).toEqual([])
  })
})

describe('routes that deliberately budget beyond the project default declare it', () => {
  it('any abort above the project default has an explicit maxDuration', () => {
    const defaultCapMs = projectDefaultSeconds() * 1000
    const offenders: string[] = []
    for (const file of walk(PROXY_DIR)) {
      const src = readFileSync(file, 'utf8')
      const aborts = [...src.matchAll(/controller\.abort\(\),\s*([0-9_]+)/g)]
        .map((m) => Number(m[1].replace(/_/g, '')))
      if (!aborts.length) continue
      const declared = /export const maxDuration\s*=\s*\d+/.test(src)
      if (!declared && Math.max(...aborts) > defaultCapMs - MIN_HEADROOM_MS) {
        offenders.push(file.replace(ROOT + '/', ''))
      }
    }
    // Silence here means "the budget fits the default", not "nobody checked".
    expect(offenders).toEqual([])
  })
})
