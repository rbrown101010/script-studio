// Minimal client for Composio Connect (MCP over HTTP), used to act on the X accounts connected in Composio.
// The consumer key lives in the COMPOSIO_CONSUMER_KEY environment variable, never in code.

const URL = "https://connect.composio.dev/mcp";

type Rpc = { result?: { content?: { type: string; text: string }[]; isError?: boolean }; error?: { message: string } };

async function rpc(key: string, session: string | null, method: string, params: unknown, id?: number) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "x-consumer-api-key": key,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(session ? { "Mcp-Session-Id": session } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, ...(id !== undefined ? { id } : {}) }),
  });
  if (!res.ok) throw new Error(`Composio returned ${res.status}`);
  const sid = res.headers.get("Mcp-Session-Id") ?? session;
  const text = await res.text();
  if (id === undefined) return { sid, body: null as Rpc | null };
  // Streamable HTTP may answer as server-sent events; the last data line holds the JSON-RPC reply
  const lines = text.split("\n").filter((l) => l.startsWith("data:"));
  const json = lines.length ? lines[lines.length - 1].slice(5) : text;
  return { sid, body: JSON.parse(json) as Rpc };
}

export type ToolResult = { successful: boolean; data: unknown; error: string | null };

/** Runs Composio tools (e.g. TWITTER_CREATION_OF_A_POST) on a connected account; one result per call, in order. */
export async function runTools(calls: { slug: string; account: string; args: Record<string, unknown> }[]): Promise<ToolResult[]> {
  const key = process.env.COMPOSIO_CONSUMER_KEY;
  if (!key) throw new Error("COMPOSIO_CONSUMER_KEY isn't set");
  const init = await rpc(key, null, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "native-note", version: "1" } }, 1);
  const sid = init.sid;
  await rpc(key, sid, "notifications/initialized", {});
  const { body } = await rpc(
    key,
    sid,
    "tools/call",
    {
      name: "COMPOSIO_MULTI_EXECUTE_TOOL",
      arguments: {
        tools: calls.map((c) => ({ tool_slug: c.slug, arguments: c.args, account: c.account })),
        thought: "Native Note acting on the connected X accounts",
        sync_response_to_workbench: false,
      },
    },
    2,
  );
  if (!body || body.error) throw new Error(body?.error?.message ?? "No reply from Composio");
  const text = body.result?.content?.find((c) => c.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as {
    data?: { results?: { index: number; response?: { successful?: boolean; data?: unknown; error?: string | null } }[] };
    error?: string | null;
  };
  const results = parsed.data?.results ?? [];
  return calls.map((_, i) => {
    const r = results.find((x) => x.index === i)?.response;
    if (!r) return { successful: false, data: null, error: parsed.error || "No result from Composio" };
    return { successful: !!r.successful, data: r.data ?? null, error: r.successful ? null : (r.error ?? "Failed") };
  });
}
