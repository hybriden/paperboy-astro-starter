/**
 * Verification for Paperboy's short-lived preview tokens.
 *
 * The admin does not send its PREVIEW_SECRET to the browser. It asks its own API
 * for a signed, minutes-long token (`GET /manage/preview-token`) and passes it
 * to this app as `?pbt=`. The secret stays server-side on both ends: the API
 * signs, we verify.
 *
 * Token format is `<expiryEpochMs>.<hmac-sha256-hex>`.
 *
 * This is WebCrypto rather than `node:crypto` so the same file runs unchanged on
 * Node, Cloudflare Workers, Deno and Bun — which is also why every function here
 * is async (Workers has no synchronous HMAC).
 */

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Length-guarded constant-time compare, so a secret or MAC cannot be recovered
 * byte-by-byte through response timing.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Is `token` a valid, unexpired preview token for `secret`? Fails closed on
 * anything malformed. The expiry is checked only AFTER the MAC verifies, so an
 * unsigned guess cannot be used to probe clock or expiry behaviour.
 */
export async function verifyPreviewToken(
  secret: string,
  token: string | null | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  if (!secret || !token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || !/^[0-9a-f]+$/.test(sig)) return false;

  if (!constantTimeEqual(await hmacHex(secret, exp), sig)) return false;
  return Number(exp) > now;
}
