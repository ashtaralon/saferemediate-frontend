/**
 * Native Map constructor captured at module load — use instead of `new Map()`.
 * Lucide exports a React `Map` icon; importing it in the same module
 * shadows global Map and throws "Map is not a constructor".
 */
const NativeMap = globalThis.Map as MapConstructor

export function createMap<K, V>(entries?: Iterable<readonly [K, V]>): Map<K, V> {
  return entries ? new NativeMap<K, V>(entries) : new NativeMap<K, V>()
}
