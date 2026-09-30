// MCP server for Native Note (Streamable HTTP, stateless, JSON responses). Same key and the same safe
// operations as the /agent routes. Lets tools like Composio hold the key as a connected account, so
// agents call Native Note tools without ever seeing the key.

import { ConvexError } from "convex/values";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { authorized } from "./agentAuth";
import { HELP } from "./agentHelp";
import { attachFiles, resolveAttachments } from "./agentFiles";

const PROTOCOL = "2025-06-18";

const RULES = `Native Note is Riley's team app for video scripts. You can change anything except deleting a script. Edit script text directly with edit_lines or edit_script: every edit saves the previous text as a version that can be restored. Read a script (get_script) before changing it, and tell the user what you changed.`;

const scriptArg = { type: "string", description: "The script's id or its share link" };
const statusArg = { type: "string", enum: ["inProduction", "upcoming", "done", "idea"], description: "inProduction = being made now, upcoming = a future video, done, idea = not committed to yet" };
const formatArg = { type: "string", enum: ["long", "short"] };
const sponsoredArg = { type: "string", enum: ["none", "noSponsor", "dedicated", "integration", "adRead"], description: "none = not decided yet, noSponsor = decided: no sponsor" };
const liveDateArg = { type: ["string", "null"], description: "YYYY-MM-DD, or null to clear" };
const updateProps = {
  title: { type: "string", description: "What happened, in a few words, e.g. \"Brand approved the script\"" },
  details: { type: "string", description: "The details: what was said or decided, dates, requirements" },
  link: { type: "string", description: "Where to find the conversation (email thread, Slack message, doc URL)" },
  source: { type: "string", description: "e.g. Email, Slack, Notion, Call" },
  date: { type: "string", description: "When it happened, YYYY-MM-DD or ISO time; defaults to now" },
  urgent: { type: "boolean", description: "True if it needs a response right away (e.g. a brand waiting on an answer). Pinned to the top of the Feed until someone marks it handled." },
};
const lineArg = {
  type: "object",
  properties: {
    key: { type: "string", description: "Existing line key (keep it when you keep or edit that line; omit for new lines)" },
    type: { type: "string", enum: ["p", "h1", "bullet", "number", "todo"] },
    text: { type: "string", description: "The line's text. Link words with [words](https://…), bold with **words**." },
    textColor: { type: ["string", "null"], enum: ["gray", "red", "orange", "green", "blue", "purple", null], description: "Color of the text (null = default)" },
    color: { type: ["string", "null"], enum: ["yellow", "blue", "green", "red", "rose", null], description: "Background color of the block (red shows as purple, rose shows as red)" },
  },
  required: ["text"],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  run: (ctx: ActionCtx, a: any) => Promise<unknown>;
};

const attachmentsArg = {
  type: "array",
  description:
    "Files to attach. Each item is ONE of: {url} a link (image/video URLs show as media); {base64, name} the file's bytes inline, stored in Native Note (under 20 MB); {storageId, name} a file you uploaded via get_upload_url (any size; use this for files on your computer). Optional mime.",
  items: {
    type: "object",
    properties: {
      url: { type: "string" },
      base64: { type: "string", description: "Raw base64 or a data: URL" },
      storageId: { type: "string", description: "From uploading to get_upload_url's uploadUrl" },
      name: { type: "string", description: "File name, e.g. key-art.png" },
      mime: { type: "string", description: "e.g. image/png (guessed from the name if left out)" },
    },
  },
};

const TOOLS: Tool[] = [
  {
    name: "read_guide",
    description: "The full Native Note guide for agents: what a script has, the safety rules, every tool, and worked examples. Read it once before your first change.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: async () => HELP,
  },
  {
    name: "list_scripts",
    description: `List Native Note scripts, newest first, with status, format, live date and how many Edited versions wait for review. ${RULES}`,
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Optional title search" } } },
    annotations: { readOnlyHint: true },
    run: (ctx, a) => ctx.runQuery(internal.agent.listScripts, { query: a.query }),
  },
  {
    name: "get_script",
    description: "Read one script: details, lines (each with a stable key and type), editor instructions (with keys and checked), captions per platform, brief, updates (newest first), and comments. Always read before changing a script.",
    inputSchema: { type: "object", properties: { script: scriptArg }, required: ["script"] },
    annotations: { readOnlyHint: true },
    run: (ctx, a) => ctx.runQuery(internal.agent.script, { script: a.script }),
  },
  {
    name: "edit_lines",
    description:
      "Edit a script's text directly, line by line, using line keys from get_script. Comments are kept: a replaced line keeps its comments, and comments on deleted lines are re-attached to the new line that reads most like the old one when possible. ops run in order as one change: {op:\"replace\", key, text?, type?} changes a line; {op:\"insert\", afterKey (null = top), lines:[{text, type?}]} adds lines; {op:\"delete\", key} removes a line; {op:\"move\", key, afterKey} moves one. The previous text is saved as a version first, so it can be restored. Returns the new lines with their keys.",
    inputSchema: {
      type: "object",
      properties: {
        script: scriptArg,
        agentName: { type: "string" },
        ops: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["replace", "insert", "delete", "move"] },
              key: { type: "string" },
              afterKey: { type: ["string", "null"] },
              text: { type: "string" },
              type: { type: "string", enum: ["p", "h1", "bullet", "number", "todo"] },
              textColor: { type: ["string", "null"], enum: ["gray", "red", "orange", "green", "blue", "purple", null] },
              color: { type: ["string", "null"], enum: ["yellow", "blue", "green", "red", "rose", null] },
              lines: { type: "array", items: lineArg },
            },
            required: ["op"],
          },
        },
      },
      required: ["script", "ops"],
    },
    run: (ctx, a) => ctx.runMutation(internal.agent.editLines, a),
  },
  {
    name: "edit_script",
    description:
      "Rewrite a script's whole text directly. `lines` is the full script in order: keep a line's key to keep that line (and its comments), omit key for new lines, leave lines out to delete them. The previous text is saved as a version first. Use for big rewrites; for small changes use edit_lines.",
    inputSchema: {
      type: "object",
      properties: { script: scriptArg, agentName: { type: "string" }, lines: { type: "array", items: lineArg } },
      required: ["script", "lines"],
    },
    run: (ctx, a) => ctx.runMutation(internal.agent.editScript, a),
  },
  {
    name: "list_versions",
    description: "Earlier versions of a script's text (newest first), with when and by whom each was replaced.",
    inputSchema: { type: "object", properties: { script: scriptArg }, required: ["script"] },
    annotations: { readOnlyHint: true },
    run: (ctx, a) => ctx.runQuery(internal.agent.listVersions, a),
  },
  {
    name: "restore_version",
    description: "Bring back an earlier version of a script's text (from list_versions). The current text is saved as a version first.",
    inputSchema: { type: "object", properties: { script: scriptArg, versionId: { type: "string" }, agentName: { type: "string" } }, required: ["script", "versionId"] },
    run: (ctx, a) => ctx.runMutation(internal.agent.restoreVersion, a),
  },
  {
    name: "delete_editor_instruction",
    description: "Remove one editor instruction by its key (from get_script).",
    inputSchema: { type: "object", properties: { script: scriptArg, key: { type: "string" } }, required: ["script", "key"] },
    run: (ctx, a) => ctx.runMutation(internal.agent.deleteInstruction, a),
  },
  {
    name: "remove_caption",
    description: "Remove one platform's caption from the Captions tab.",
    inputSchema: { type: "object", properties: { script: scriptArg, platform: { type: "string" } }, required: ["script", "platform"] },
    run: (ctx, a) => ctx.runMutation(internal.agent.removeCaption, a),
  },
  {
    name: "remove_brief_links",
    description: "Remove links from the Brief tab by URL.",
    inputSchema: { type: "object", properties: { script: scriptArg, urls: { type: "array", items: { type: "string" } } }, required: ["script", "urls"] },
    run: (ctx, a) => ctx.runMutation(internal.agent.removeBriefLinks, a),
  },
  {
    name: "suggest_script_edit",
    description:
      "Propose new text for a person to review instead of editing directly (only when the user wants to approve changes first; normally use edit_lines / edit_script). `lines` is the WHOLE script as you want it, in order. Keep a line's key when you keep or edit it; omit key for new lines; existing lines you leave out show as removed. It is saved as an \"Edited version\" (changes in red) and nothing changes until a person clicks \"Use this version\". Sending again with the same agentName replaces your pending suggestion. Afterwards tell the user to review the Edited version button at the top right of the script.",
    inputSchema: {
      type: "object",
      properties: { script: scriptArg, agentName: { type: "string", description: "Your name, e.g. Claude" }, lines: { type: "array", items: lineArg } },
      required: ["script", "lines"],
    },
    run: (ctx, a) => ctx.runMutation(internal.agent.suggestEdit, a),
  },
  {
    name: "comment_on_script",
    description: "Comment on a whole script, or on one line (by blockKey from get_script, or by part of the line's text with lineContains). Can attach images, videos, PDFs or any file: by link, inline base64, or an uploaded file (see get_upload_url). Shows with an Agent badge. Returns the comment id.",
    inputSchema: {
      type: "object",
      properties: {
        script: scriptArg,
        text: { type: "string" },
        agentName: { type: "string" },
        blockKey: { type: "string" },
        lineContains: { type: "string" },
        attachments: attachmentsArg,
      },
      required: ["script", "text"],
    },
    run: async (ctx, a) => ({
      id: await ctx.runMutation(internal.comments.addAgent, { ...a, attachments: await resolveAttachments(ctx, a.attachments) }),
    }),
  },
  {
    name: "attach_files",
    description:
      "Add images, videos, PDFs or any files to an existing comment (comment id from comment_on_script or get_script). Same attachment shapes as comment_on_script. Only adds; never removes.",
    inputSchema: { type: "object", properties: { comment: { type: "string" }, attachments: attachmentsArg }, required: ["comment", "attachments"] },
    run: (ctx, a) => attachFiles(ctx, a.comment, a.attachments ?? []),
  },
  {
    name: "get_upload_url",
    description:
      "For a file on your own computer (any size): returns a one-time uploadUrl. POST the raw bytes there, e.g. curl -s -X POST -H 'Content-Type: image/png' --data-binary @shot.png '<uploadUrl>', which answers {\"storageId\":\"...\"}. Then attach it with comment_on_script or attach_files: attachments [{storageId, name}].",
    inputSchema: { type: "object", properties: {} },
    run: async (ctx) => ({ uploadUrl: await ctx.runMutation(internal.agentFiles.uploadUrl, {}) }),
  },
  {
    name: "move_comment",
    description:
      "Move any comment to another line (toKey from get_script, or lineContains = part of the line's text), or onto the whole script (give neither). Use after an edit to put comments back on the right line; get_script marks comments that are onRemovedLine.",
    inputSchema: {
      type: "object",
      properties: { script: scriptArg, commentId: { type: "string" }, toKey: { type: "string" }, lineContains: { type: "string" } },
      required: ["script", "commentId"],
    },
    run: (ctx, a) => ctx.runMutation(internal.agent.moveComment, a),
  },
  {
    name: "update_comment",
    description: "Rewrite the text of a comment an agent wrote (people's comments can be moved, not rewritten).",
    inputSchema: { type: "object", properties: { script: scriptArg, commentId: { type: "string" }, text: { type: "string" } }, required: ["script", "commentId", "text"] },
    run: (ctx, a) => ctx.runMutation(internal.agent.updateComment, a),
  },
  {
    name: "delete_comment",
    description: "Delete a comment an agent wrote.",
    inputSchema: { type: "object", properties: { script: scriptArg, commentId: { type: "string" } }, required: ["script", "commentId"] },
    run: (ctx, a) => ctx.runMutation(internal.agent.deleteComment, a),
  },
  {
    name: "add_editor_instructions",
    description: "Add to-do items to a script's instructions for the video editor.",
    inputSchema: { type: "object", properties: { script: scriptArg, items: { type: "array", items: { type: "string" } } }, required: ["script", "items"] },
    run: (ctx, a) => ctx.runMutation(internal.agent.addInstructions, a),
  },
  {
    name: "update_editor_instruction",
    description: "Edit one existing editor instruction: change its text and/or check it off (checked true) or uncheck it. Use the instruction's key from get_script. Instructions can't be removed.",
    inputSchema: {
      type: "object",
      properties: { script: scriptArg, key: { type: "string", description: "The instruction's key from get_script" }, text: { type: "string" }, checked: { type: "boolean" } },
      required: ["script", "key"],
    },
    run: (ctx, a) => ctx.runMutation(internal.agent.updateInstruction, a),
  },
  {
    name: "set_caption",
    description:
      "Add or update one platform's caption on the Captions tab (e.g. Instagram, TikTok, YouTube, YouTube Shorts, X, LinkedIn, Facebook, Threads, or any name). The platform is matched by name, case-insensitive, and added if missing. Only the parts you pass change. Custom fields are matched by label: new labels are added, existing labels get the new value. Set posted true once it's been posted. Applies immediately. Platforms and fields can't be removed.",
    inputSchema: {
      type: "object",
      properties: {
        script: scriptArg,
        platform: { type: "string", description: "e.g. Instagram" },
        caption: { type: "string" },
        linkInBio: { type: "string" },
        posted: { type: "boolean" },
        fields: {
          type: "array",
          description: "Custom fields, e.g. [{\"label\":\"Hashtags\",\"value\":\"#ai #claude\"}]",
          items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"] },
        },
      },
      required: ["script", "platform"],
    },
    run: (ctx, a) => ctx.runMutation(internal.agent.setCaption, a),
  },
  {
    name: "set_brief",
    description:
      "Write the Brief tab (e.g. a marketing or sponsor brief). mode \"append\" (default) adds your text to the end; \"replace\" swaps the whole brief, so only replace when the user asked. Applies immediately.",
    inputSchema: {
      type: "object",
      properties: { script: scriptArg, text: { type: "string" }, mode: { type: "string", enum: ["append", "replace"] } },
      required: ["script", "text"],
    },
    run: (ctx, a) => ctx.runMutation(internal.agent.setBrief, a),
  },
  {
    name: "add_ideas",
    description:
      "Save ideas to Mymind, Riley's idea board: tweets/X posts, images, videos (YouTube, TikTok, Instagram reels, video files), any link, or a plain note. Each idea is a link and/or a note (what it is and why it's interesting). Send up to 200 at once, e.g. when importing bookmarks; links already saved aren't duplicated. date (YYYY-MM-DD) is when it was saved/bookmarked, if known.",
    inputSchema: {
      type: "object",
      properties: {
        ideas: {
          type: "array",
          items: {
            type: "object",
            properties: { url: { type: "string" }, note: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD, optional" } },
          },
        },
        agentName: { type: "string" },
      },
      required: ["ideas"],
    },
    run: (ctx, a) => ctx.runMutation(internal.agent.addIdeas, a),
  },
  {
    name: "list_ideas",
    description: "Search or list Mymind ideas (newest first). Use to check what's already saved or find an idea.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } } },
    annotations: { readOnlyHint: true },
    run: (ctx, a) => ctx.runQuery(internal.agent.listIdeas, a),
  },
  {
    name: "add_brief_links",
    description:
      "Attach links to a video's Brief tab: the sponsor brief doc, contract/SOW, script doc, email thread, Slack thread, tracking link. Give each a short label. A URL that's already there just gets the new label. Internal only.",
    inputSchema: {
      type: "object",
      properties: {
        script: scriptArg,
        links: { type: "array", items: { type: "object", properties: { label: { type: "string" }, url: { type: "string" } }, required: ["label", "url"] } },
      },
      required: ["script", "links"],
    },
    run: (ctx, a) => ctx.runMutation(internal.agent.addBriefLinks, a),
  },
  {
    name: "add_update",
    description:
      "Log something that happened on a video to its Updates tab (newest first): a new email or Slack thread, a call, an approval, a date moving, a brief changing. Give a short title, the details, a link to the conversation and its source. Internal only: never shown on share links. Updates can't be removed by agents.",
    inputSchema: { type: "object", properties: { script: scriptArg, agentName: { type: "string" }, ...updateProps }, required: ["script", "title"] },
    run: (ctx, a) => ctx.runMutation(internal.agent.addUpdate, a),
  },
  {
    name: "update_script_details",
    description: "Change a script's title, live date, format, status or sponsorship. Applies immediately, so only do it when the user asked.",
    inputSchema: {
      type: "object",
      properties: { script: scriptArg, title: { type: "string" }, liveDate: liveDateArg, format: formatArg, status: statusArg, sponsored: sponsoredArg },
      required: ["script"],
    },
    run: (ctx, a) => ctx.runMutation(internal.agent.updateDetails, a),
  },
  {
    name: "create_script",
    description: "Create a new script. Don't create scripts in bulk unless asked.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        format: formatArg,
        status: statusArg,
        liveDate: liveDateArg,
        sponsored: sponsoredArg,
        lines: { type: "array", items: lineArg },
        instructions: { type: "array", items: { type: "string" } },
        brief: { type: "string", description: "Internal brief, e.g. the sponsor's delivery requirements" },
        updates: { type: "array", description: "Starting entries for the Updates tab", items: { type: "object", properties: updateProps, required: ["title"] } },
        agentName: { type: "string" },
      },
      required: ["title"],
    },
    run: (ctx, a) => ctx.runMutation(internal.agent.createScript, a),
  },
];

type RpcMessage = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

const reply = (body: unknown, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? {} : { "content-type": "application/json" },
  });

export async function handle(ctx: ActionCtx, msg: RpcMessage) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null; // notification: nothing to answer
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: params?.protocolVersion ?? PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "native-note", title: "Native Note", version: "2.0.0" },
        instructions: RULES,
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS.map(({ run: _run, ...t }) => t) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return fail(-32602, `Unknown tool: ${params?.name}`);
      try {
        const result = await tool.run(ctx, params?.arguments ?? {});
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        return ok({ content: [{ type: "text", text }], structuredContent: { result } });
      } catch (e) {
        const text = e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : "Failed";
        return ok({ content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const mcpPost = httpAction(async (ctx, req) => {
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized. Send Authorization: Bearer <key>." }), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
    });
  }
  const body = await req.json().catch(() => undefined);
  if (body === undefined) return reply({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(ctx, m)))).filter((r) => r !== null);
    return out.length ? reply(out) : reply(null, 202);
  }
  const out = await handle(ctx, body);
  return out ? reply(out) : reply(null, 202);
});

/** No server-to-client stream; this server only answers POSTs. */
export const mcpGet = httpAction(async () => new Response(null, { status: 405, headers: { allow: "POST" } }));
