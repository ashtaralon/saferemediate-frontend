/**
 * Native Map constructor — use instead of `new Map()` in topology code.
 * Lucide exports a React `Map` icon; importing it in the same module
 * shadows global Map and throws "Map is not a constructor".
 */
export function createMap<K, V>(entries?: Iterable<readonly [K, V]>): Map<K, V> {
  const MapCtor = globalThis.Map as MapConstructor
  return entries ? new MapCtor<K, V>(entries) : new MapCtor<K, V>()
}
