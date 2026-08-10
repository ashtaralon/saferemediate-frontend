export const DEFAULT_MAX_CACHE_BYTES = 1_500_000

type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

export type CacheWriteResult =
  | { stored: true; reason: "stored" }
  | { stored: false; reason: "oversized" | "quota" | "serialization" | "storage" }

export function readJsonCache<T>(storage: CacheStorage, key: string): T | null {
  try {
    const value = storage.getItem(key)
    return value ? JSON.parse(value) as T : null
  } catch {
    storage.removeItem(key)
    return null
  }
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const candidate = error as Error & { code?: number }
  return candidate.name === "QuotaExceededError" ||
    candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    candidate.code === 22 ||
    candidate.code === 1014 ||
    candidate.message.toLocaleLowerCase().includes("quota")
}

export function writeJsonCache(
  storage: CacheStorage,
  key: string,
  data: unknown,
  options: { timestampKey?: string; maxBytes?: number } = {},
): CacheWriteResult {
  let serialized: string
  try {
    serialized = JSON.stringify(data)
  } catch {
    return { stored: false, reason: "serialization" }
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_CACHE_BYTES
  if (new TextEncoder().encode(serialized).byteLength > maxBytes) {
    storage.removeItem(key)
    return { stored: false, reason: "oversized" }
  }

  const store = () => {
    storage.setItem(key, serialized)
    if (options.timestampKey) storage.setItem(options.timestampKey, Date.now().toString())
  }

  try {
    store()
    return { stored: true, reason: "stored" }
  } catch (error) {
    if (!isQuotaError(error)) return { stored: false, reason: "storage" }
    // Evict only this cache entry, never unrelated operator/browser data.
    storage.removeItem(key)
    try {
      store()
      return { stored: true, reason: "stored" }
    } catch (retryError) {
      storage.removeItem(key)
      return { stored: false, reason: isQuotaError(retryError) ? "quota" : "storage" }
    }
  }
}
