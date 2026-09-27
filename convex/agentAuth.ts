/** AGENT_API_KEY, plus any extra keys in AGENT_API_KEYS (comma-separated) so each agent tool can be revoked on its own. */
export function authorized(req: Request) {
  const keys = [process.env.AGENT_API_KEY, ...(process.env.AGENT_API_KEYS ?? "").split(",")]
    .map((k) => k?.trim())
    .filter((k): k is string => !!k && k.length >= 20);
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  // Compare every key in full, in constant time, so response timing reveals nothing about a key
  let ok = false;
  for (const k of keys) if (safeEqual(token, k)) ok = true;
  return ok;
}

function safeEqual(a: string, b: string) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
