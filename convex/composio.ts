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

/** Calls one Composio meta tool (COMPOSIO_MULTI_EXECUTE_TOOL, COMPOSIO_REMOTE_WORKBENCH…) and returns its parsed JSON reply. */
async function callMeta(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = process.env.COMPOSIO_CONSUMER_KEY;
  if (!key) throw new Error("COMPOSIO_CONSUMER_KEY isn't set");
  const init = await rpc(key, null, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "native-note", version: "1" } }, 1);
  const sid = init.sid;
  await rpc(key, sid, "notifications/initialized", {});
  const { body } = await rpc(key, sid, "tools/call", { name, arguments: args }, 2);
  if (!body || body.error) throw new Error(body?.error?.message ?? "No reply from Composio");
  const text = body.result?.content?.find((c) => c.type === "text")?.text ?? "";
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(text.slice(0, 300) || "Composio sent an empty reply");
  }
}

/** Runs Composio tools (e.g. TWITTER_CREATION_OF_A_POST) on a connected account; one result per call, in order. */
export async function runTools(calls: { slug: string; account: string; args: Record<string, unknown> }[]): Promise<ToolResult[]> {
  const parsed = (await callMeta("COMPOSIO_MULTI_EXECUTE_TOOL", {
    tools: calls.map((c) => ({ tool_slug: c.slug, arguments: c.args, account: c.account })),
    thought: "Native Note acting on the connected X accounts",
    sync_response_to_workbench: false,
  })) as {
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

/**
 * Uploads files (by URL) to X as media for one connected account and returns their media ids, in order.
 * X's upload tool only takes files staged in Composio's storage, so this runs in Composio's workbench:
 * download each file, stage it, upload it to X. Videos then process on X's side; see waitForMedia.
 */
export async function uploadMedia(account: string, files: { url: string; name: string; mime: string; kind: "video" | "image" }[]): Promise<string[]> {
  const job = btoa(JSON.stringify({ account, files: files.map((f, i) => ({ ...f, name: `${i}-${f.name.replace(/[^\w.-]+/g, "_").slice(-80)}` })) }));
  const code = `import base64, json, requests
job = json.loads(base64.b64decode("${job}"))
ids = []
for f in job["files"]:
    p = "/home/user/" + f["name"]
    r = requests.get(f["url"], timeout=120)
    r.raise_for_status()
    open(p, "wb").write(r.content)
    staged, err = upload_local_file(p)
    if err:
        raise Exception("Staging failed: " + str(err))
    cat = "tweet_video" if f["kind"] == "video" else ("tweet_gif" if f["mime"] == "image/gif" else "tweet_image")
    out, err = run_composio_tool("TWITTER_UPLOAD_LARGE_MEDIA", {"media": {"name": f["name"], "mimetype": f["mime"], "s3key": staged["s3key"]}, "media_category": cat}, account=job["account"])
    if err:
        raise Exception("X upload failed: " + str(err))
    d = (out or {}).get("data") or {}
    mid = d.get("id") or d.get("media_id_string") or d.get("media_id")
    if not mid:
        raise Exception("X didn't return a media id")
    ids.append(str(mid))
print("MEDIA_IDS=" + json.dumps(ids))`;
  const reply = (await callMeta("COMPOSIO_REMOTE_WORKBENCH", { code_to_execute: code, thought: "Native Note uploading a tweet's media to X" })) as {
    data?: { stdout?: string; stderr?: string; error?: string };
    error?: string | null;
  };
  const m = /MEDIA_IDS=(\[[^\n]*\])/.exec(reply.data?.stdout ?? "");
  if (!m) throw new Error((reply.data?.error || reply.error || reply.data?.stderr || "Media upload failed").toString().slice(0, 300));
  return JSON.parse(m[1]) as string[];
}

/** Waits until X has processed uploaded videos (they can't be attached before), up to about 4 minutes. */
export async function waitForMedia(account: string, ids: string[]) {
  for (const id of ids) {
    for (let i = 0; i < 48; i++) {
      const [r] = await runTools([{ slug: "TWITTER_GET_MEDIA_UPLOAD_STATUS", account, args: { media_id: id } }]);
      const d = r.data as { processing_info?: { state?: string }; data?: { processing_info?: { state?: string } } } | null;
      const state = d?.processing_info?.state ?? d?.data?.processing_info?.state ?? null;
      if (state === "failed") throw new Error("X couldn't process the video");
      // No processing info means it's ready (images, or processing already finished)
      if (!state || state === "succeeded") break;
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}
