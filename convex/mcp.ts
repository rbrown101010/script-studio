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
const statusArg = {
  type: "string",
  enum: ["idea", "upcoming", "inProduction", "sentToEditor", "done"],
  description: "idea = not committed to yet, upcoming = a future video, inProduction = being made now, sentToEditor = filmed and with the editor, done = posted",
};
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
    type: { type: "string", enum: ["p", "h1", "bullet", "number", "todo", "board"], description: "board = an Excalidraw board shown in the script; its text is the board id (from list_boards) or its /b/<id> link" },
    text: { type: "string", description: "The line's text. Link words with [words](https://…), bold with **words**." },
    textColor: { type: ["string", "null"], enum: ["gray", "red", "orange", "green", "blue", "purple", null], description: "Color of the text (null = default)" },
    color: { type: ["string", "null"], enum: ["yellow", "blue", "green", "red", "rose", null], description: "Background color of the block (red shows as purple, rose shows as red)" },
  },
  required: ["text"],
};

const toolArg = { type: "string", enum: ["grokbot", "muse", "dot", "chatgpt", "claudeCode"], description: "grokbot = SpaceXAI's Grok Bot, muse = Meta's Muse, dot = OpenAI's Dots in ChatGPT, chatgpt = the ChatGPT desktop app, claudeCode = Claude Code" };
const level = { type: "string", enum: ["high", "medium", "low"] };
const colorArg = { type: "string", description: "yellow, orange, red, pink, purple, blue, teal, green, gray, or #hex. Leave out to match the board." };
/** One thing to draw on a board (see add_to_board) */
const boardItemArg = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["text", "shape", "sticky", "arrow", "image"] },
    id: { type: "string", description: "Your own name for this item so arrows can point at it (e.g. \"idea\")" },
    text: { type: "string", description: "text and sticky: the words (\\n for new lines)" },
    label: { type: "string", description: "shape: the words inside it" },
    shape: { type: "string", enum: ["rectangle", "ellipse", "diamond"], description: "shape: defaults to the board's usual shape" },
    size: { type: "string", enum: ["s", "m", "l", "xl"], description: "text: xl = the board's heading size, l = subheading; defaults to the board's text size" },
    fontSize: { type: "number", description: "text: exact font size (overrides size)" },
    color: colorArg,
    from: { type: "string", description: "arrow: item id, element id, or the label of something on the board" },
    to: { type: "string", description: "arrow: item id, element id, or the label of something on the board" },
    dashed: { type: "boolean" },
    url: { type: "string", description: "image: https link to the picture" },
    link: { type: "string", description: "text or shape: makes it a clickable link" },
    width: { type: "number" },
    height: { type: "number" },
    x: { type: "number", description: "Optional: position relative to where the new group starts" },
    y: { type: "number" },
  },
  required: ["type"],
};
const drawOptionArgs = {
  layout: { type: "string", enum: ["auto", "flow", "row", "column", "grid"], description: "auto = flowchart when there are arrows, grid for stickies, else a row/column" },
  direction: { type: "string", enum: ["right", "down"], description: "Which way a flowchart runs; defaults to the board's direction" },
  placement: { type: "string", enum: ["right", "below"], description: "Where the group goes next to what's there; defaults to the board's direction" },
  styleFrom: { type: "string", description: "Draw in the style of another board (its id or link), e.g. for a new board that should look like an existing one" },
};
/** One researched topic (see Topic opportunities in the guide) */
const topicArg = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short topic name" },
    angle: { type: "string", description: "The specific video angle / pitch" },
    category: { type: "string", description: "News, Tutorial, Comparison, Build, Explainer or Short" },
    format: { type: "string", enum: ["long", "short", "both"] },
    score: { type: "number", description: "Opportunity 0-100: demand x low competition x fit for the channel x timeliness" },
    demand: level,
    demandNote: { type: "string", description: "Evidence for demand (what you saw)" },
    competition: level,
    competitionNote: { type: "string" },
    trend: { type: "string", enum: ["breakout", "rising", "steady", "falling"] },
    whyNow: { type: "string", description: "Why this is an opportunity now, including the gap" },
    keywords: {
      type: "array",
      items: { type: "object", properties: { term: { type: "string" }, demand: level, competition: level, note: { type: "string" } }, required: ["term"] },
    },
    outliers: {
      type: "array",
      description: "Videos that did far better than their channel usually does",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          channel: { type: "string" },
          views: { type: ["number", "null"] },
          channelAvgViews: { type: ["number", "null"] },
          published: { type: "string" },
          note: { type: "string" },
        },
        required: ["title", "url"],
      },
    },
    titleIdeas: { type: "array", items: { type: "string" } },
    hooks: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "object", properties: { label: { type: "string" }, url: { type: "string" } }, required: ["label", "url"] } },
  },
  required: ["title", "angle", "category", "format", "score", "demand", "competition", "trend", "whyNow", "keywords", "outliers", "titleIdeas", "hooks", "sources"],
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
              type: { type: "string", enum: ["p", "h1", "bullet", "number", "todo", "board"], description: "board = an Excalidraw board shown in the script; its text is the board id (from list_boards) or its /b/<id> link" },
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
    name: "add_agent_updates",
    description:
      "Add updates to Agent updates (a tab in Mymind): what an agent tool shipped and when, with the tweets that announced it. tool is one of grokbot, muse, dot (OpenAI's Dots in ChatGPT), chatgpt (the ChatGPT desktop app) or claudeCode; it's the update's tag. One update per feature. An update with the same tool, date and title, or with a tweet that's already saved, is merged (new tweets are added to it) instead of duplicated, so to attach a tweet to an existing update just send it again with that tweet. Up to 200 at once.",
    inputSchema: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tool: toolArg,
              date: { type: "string", description: "The day it shipped / was announced, YYYY-MM-DD" },
              title: { type: "string", description: "What shipped, in a few plain words, e.g. \"Slide decks\" (under 70 characters)" },
              summary: { type: "string", description: "One or two sentences on what it does (optional)" },
              link: { type: "string", description: "The official announcement or changelog entry (optional)" },
              tweets: { type: "array", items: { type: "string" }, description: "Tweet links (x.com/<user>/status/<id>) about it; they show as tweet cards" },
            },
            required: ["tool", "date", "title"],
          },
        },
        agentName: { type: "string" },
      },
      required: ["updates"],
    },
    run: (ctx, a) => ctx.runMutation(internal.agentUpdates.addForAgent, a),
  },
  {
    name: "list_agent_updates",
    description: "List Agent updates, newest first, with ids. Filter by tool (grokbot, muse, dot, chatgpt, claudeCode), since (YYYY-MM-DD) or a search query. Check here before adding so you don't repeat what's there.",
    inputSchema: {
      type: "object",
      properties: { tool: toolArg, since: { type: "string", description: "YYYY-MM-DD" }, query: { type: "string" }, limit: { type: "number" } },
    },
    annotations: { readOnlyHint: true },
    run: (ctx, a) => ctx.runQuery(internal.agentUpdates.listForAgent, a),
  },
  {
    name: "update_agent_update",
    description: "Change one Agent update by id (from list_agent_updates): fix its title, summary, date, tool or link, add tweets (addTweets) or remove tweets (removeTweets). Only the fields you send change.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        tool: toolArg,
        date: { type: "string", description: "YYYY-MM-DD" },
        title: { type: "string" },
        summary: { type: "string" },
        link: { type: ["string", "null"], description: "null removes it" },
        addTweets: { type: "array", items: { type: "string" } },
        removeTweets: { type: "array", items: { type: "string" } },
        agentName: { type: "string" },
      },
      required: ["id"],
    },
    run: (ctx, a) => ctx.runMutation(internal.agentUpdates.editForAgent, a),
  },
  {
    name: "delete_agent_update",
    description: "Delete one Agent update by id, e.g. a duplicate or a mistake.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: { destructiveHint: true },
    run: (ctx, a) => ctx.runMutation(internal.agentUpdates.removeForAgent, a),
  },
  {
    name: "list_boards",
    description: "List the team's Excalidraw boards (newest first), optionally searching their titles and contents. Returns ids and links.",
    inputSchema: { type: "object", properties: { query: { type: "string" } } },
    annotations: { readOnlyHint: true },
    run: (ctx, a) => ctx.runQuery(internal.boards.listForAgent, a),
  },
  {
    name: "pin_board",
    description: "Pin a board to the sidebar in Native Note (pinned: false unpins). Only when the user asked.",
    inputSchema: { type: "object", properties: { board: { type: "string", description: "Board id or its /b/<id> link" }, pinned: { type: "boolean", description: "Default true" } }, required: ["board"] },
    run: (ctx, a) => ctx.runMutation(internal.boards.setPinnedForAgent, a),
  },
  {
    name: "pin_script",
    description: "Pin a script to the sidebar and the top of the Scripts views (pinned: false unpins). Only when the user asked.",
    inputSchema: { type: "object", properties: { script: scriptArg, pinned: { type: "boolean", description: "Default true" } }, required: ["script"] },
    run: (ctx, a) => ctx.runMutation(internal.agent.setScriptPinned, a),
  },
  {
    name: "get_board",
    description:
      "Read one Excalidraw board: a plain-text summary (all text top to bottom, labelled shapes, arrows between shapes, links), its style (colors, stroke, roughness, corners, font, sizes, spacing, direction: new items copy it), and items (everything on it with ids, labels, positions) to point arrows and edits at. Set includeElements for the raw Excalidraw elements. Read a board before drawing on it.",
    inputSchema: { type: "object", properties: { board: { type: "string", description: "Board id or its /b/<id> link" }, includeElements: { type: "boolean" } }, required: ["board"] },
    annotations: { readOnlyHint: true },
    run: (ctx, a) => ctx.runQuery(internal.boards.getForAgent, a),
  },
  {
    name: "create_board",
    description:
      "Make a new Excalidraw board, optionally drawing items on it straight away (same items as add_to_board). Returns its id and link.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" }, items: { type: "array", items: boardItemArg }, ...drawOptionArgs, agentName: { type: "string" } },
      required: ["title"],
    },
    run: (ctx, a) => ctx.runMutation(internal.boards.createForAgent, a),
  },
  {
    name: "add_to_board",
    description:
      "Draw on an existing board without touching what's there. Describe simple items (text, shape with a label, sticky, arrow, image) and they become real Excalidraw elements, laid out together (a flowchart when there are arrows) and placed beside the existing content in the board's own style (its colors, stroke, roughness, corners, font, sizes, spacing and direction) unless you set a color. Arrows connect new items (by your item id) or things already on the board (by element id from get_board, or by their label). Returns the new elements' ids.",
    inputSchema: {
      type: "object",
      properties: {
        board: { type: "string", description: "Board id or its /b/<id> link" },
        items: { type: "array", items: boardItemArg },
        ...drawOptionArgs,
        agentName: { type: "string" },
      },
      required: ["board", "items"],
    },
    run: (ctx, a) => ctx.runMutation(internal.boards.addForAgent, a),
  },
  {
    name: "edit_board",
    description:
      "Change things already on a board by element id (ids from get_board items): setText (a text or a shape's label), setColor, move by dx/dy, or delete (a shape's label and arrows go with it). Can also rename the board with title.",
    inputSchema: {
      type: "object",
      properties: {
        board: { type: "string" },
        title: { type: "string" },
        ops: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["setText", "setColor", "move", "delete"] },
              id: { type: "string" },
              text: { type: "string" },
              color: { type: "string" },
              dx: { type: "number" },
              dy: { type: "number" },
            },
            required: ["op", "id"],
          },
        },
      },
      required: ["board"],
    },
    run: (ctx, a) => ctx.runMutation(internal.boards.editForAgent, a),
  },
  {
    name: "list_topics",
    description:
      "List Topic opportunities (researched YouTube video ideas), best score first. Filter by status (new, saved = Riley marked it Might do, used = made into a script, dismissed) or search. Set full to get keywords, outlier videos, hooks and sources too.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["new", "saved", "used", "dismissed"] }, query: { type: "string" }, full: { type: "boolean" } },
    },
    annotations: { readOnlyHint: true },
    run: (ctx, a) => ctx.runQuery(internal.topics.listForAgent, a),
  },
  {
    name: "add_topics",
    description:
      "Add researched YouTube topic opportunities (up to 60 at once). Never replaces anything: a topic whose title matches an existing one is refreshed (its status, notes and earlier research history are kept) and new titles are added. Each research pass is a run: the first call returns a run id; pass it as run on later calls in the same pass, then call finish_topic_run with a summary. Never invent numbers: outlier views must be what you actually saw at that URL, and leave views/channelAvgViews null when unknown.",
    inputSchema: {
      type: "object",
      properties: {
        topics: { type: "array", items: topicArg },
        agentName: { type: "string" },
        run: { type: "string", description: "Run id from the first add_topics call of this research pass (leave out to start a new run)" },
      },
      required: ["topics"],
    },
    run: (ctx, a) => ctx.runMutation(internal.topics.upsertForAgent, a),
  },
  {
    name: "finish_topic_run",
    description: "End a research run with a short summary of what changed (new topics, big score moves, news on the topics Riley marked Might do). Shown at the top of the app.",
    inputSchema: { type: "object", properties: { run: { type: "string" }, summary: { type: "string" } }, required: ["run", "summary"] },
    run: (ctx, a) => ctx.runMutation(internal.topics.finishRunForAgent, a),
  },
  {
    name: "list_topic_runs",
    description: "Past Topic opportunities research runs (newest first) with how many topics each added or refreshed and its summary.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: (ctx) => ctx.runQuery(internal.topics.runsForAgent, {}),
  },
  {
    name: "get_topic_history",
    description: "Every version of one topic's research (newest first): score, trend, demand, competition, why now and outliers per run.",
    inputSchema: { type: "object", properties: { topic: { type: "string", description: "Topic id or exact title" } }, required: ["topic"] },
    annotations: { readOnlyHint: true },
    run: (ctx, a) => ctx.runQuery(internal.topics.historyForAgent, a),
  },
  {
    name: "update_topic",
    description: "Change one topic (by id or exact title): its status, team notes, or any research fields (only the fields you send change).",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic id (from list_topics) or its title" },
        status: { type: "string", enum: ["new", "saved", "used", "dismissed"] },
        notes: { type: "string" },
        research: { ...topicArg, required: [] },
      },
      required: ["topic"],
    },
    run: (ctx, a) => ctx.runMutation(internal.topics.updateForAgent, a),
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
