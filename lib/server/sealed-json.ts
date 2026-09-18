/**
 * AES-GCM sealed JSON for httpOnly cookies, with no identity semantics of its own.
 *
 * `purpose` is both the key-derivation label and the GCM additional data, so a value
 * sealed for one cookie never unseals as another. The derivation string is kept
 * byte-for-byte from the operator-session module it was extracted from, so a value
 * sealed by either unseals with the other; operator sign-in (a separate change) is
 * meant to import these functions rather than keep a second copy.
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function sealingKey(secret: string, purpose: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`cyntro-operator-session:${purpose}:${secret}`))
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

export async function sealJson(value: unknown, secret: string, purpose: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(purpose) },
      await sealingKey(secret, purpose),
      encoder.encode(JSON.stringify(value)),
    ),
  )
  const sealed = new Uint8Array(iv.length + ciphertext.length)
  sealed.set(iv)
  sealed.set(ciphertext, iv.length)
  return `v1.${base64UrlEncode(sealed)}`
}

export async function unsealJson<T>(token: string | undefined, secret: string, purpose: string): Promise<T | null> {
  if (!token || !token.startsWith("v1.")) return null
  try {
    const raw = base64UrlDecode(token.slice(3))
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.slice(0, 12), additionalData: encoder.encode(purpose) },
      await sealingKey(secret, purpose),
      raw.slice(12),
    )
    return JSON.parse(decoder.decode(plaintext)) as T
  } catch {
    return null
  }
}
