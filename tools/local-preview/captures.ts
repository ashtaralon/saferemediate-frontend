import { readFile } from "node:fs/promises";
import path from "node:path";
export type CaptureSet = {
  capturedAt: string;
  sourceOrigin: string;
  frontendCommit: string;
  backendCommit: string;
  responses: Record<string, {status: number; body: unknown}>;
};
export function requestKey(url: URL): string {
  const query = new URLSearchParams(url.search);
  query.sort();
  return url.pathname + (query.size ? `?${query}` : "");
}
export function validateCapture(value: unknown): CaptureSet | null {
  if (!value || typeof value !== "object") return null;
  const c = value as CaptureSet;
  if (!Number.isFinite(Date.parse(c.capturedAt)) || !/^https:\/\//.test(c.sourceOrigin) ||
      !/^[a-f0-9]{40}$/.test(c.frontendCommit) || !/^[a-f0-9]{40}$/.test(c.backendCommit) ||
      !c.responses || typeof c.responses !== "object" || Array.isArray(c.responses)) return null;
  for (const [key, reply] of Object.entries(c.responses)) {
    if (!key.startsWith("/api/") || !reply || !Number.isInteger(reply.status) || reply.status < 200 || reply.status > 599 || !("body" in reply)) return null;
  }
  if (!Object.keys(c.responses).length) return null;
  return c;
}
export async function readCaptures(): Promise<CaptureSet | null> {
  // The runner pins this to a local gitignored file. No credentials or network calls.
  const file = process.env.CYNTRO_PREVIEW_CAPTURE_FILE || path.resolve(process.cwd(), "tools/local-preview/.local/responses.json");
  try { return validateCapture(JSON.parse(await readFile(file, "utf8"))); } catch { return null; }
}
export function replay(captures: CaptureSet | null, url: URL) {
  const key = requestKey(url);
  if (captures && Object.hasOwn(captures.responses, key)) return captures.responses[key];
  return {status:503,body:{detail:{code:"PREVIEW_CAPTURE_UNAVAILABLE",message:"No real response has been captured for this exact request. No live request was made."}}};
}
