/** AGENT_API_KEY, plus any extra keys in AGENT_API_KEYS (comma-separated) so each agent tool can be revoked on its own. */
export function authorized(req: Request) {
  const keys = [process.env.AGENT_API_KEY, ...(process.env.AGENT_API_KEYS ?? "").split(",")]
    .map((k) => k?.trim())
    .filter((k): k is string => !!k && k.length >= 20);
  const header = req.headers.get("authorization") ?? "";
  return keys.some((k) => header === `Bearer ${k}`);
}
