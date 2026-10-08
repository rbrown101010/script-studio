import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { research, topicStatus } from "./topicFields";
import { v } from "convex/values";

/** Idea (not committed to yet), Upcoming (future videos), In production (being made now), Sent to editor (filmed, with the editor), Done (posted). */
export const videoStatus = v.union(v.literal("inProduction"), v.literal("upcoming"), v.literal("done"), v.literal("idea"), v.literal("sentToEditor"));
/** Statuses before 2026-09-24; migrations:statuses maps them to videoStatus */
export const legacyStatus = v.union(
  v.literal("scripting"),
  v.literal("filming"),
  v.literal("editing"),
  v.literal("scheduled"),
  v.literal("live"),
);

export const sponsorship = v.union(
  v.literal("none"),
  v.literal("noSponsor"),
  v.literal("dedicated"),
  v.literal("integration"),
  v.literal("adRead"),
);

/** One platform's post: caption, link in bio, any extra fields, and whether it's been posted. */
export const captionPlatform = v.object({
  id: v.string(),
  platform: v.string(),
  caption: v.string(),
  linkInBio: v.string(),
  posted: v.boolean(),
  fields: v.array(v.object({ id: v.string(), label: v.string(), value: v.string() })),
});
export const blockType = v.union(
  v.literal("p"),
  v.literal("h1"),
  v.literal("bullet"),
  v.literal("number"),
  v.literal("todo"),
  v.literal("images"),
  /** An Excalidraw board shown in the script; its content is the board's id */
  v.literal("board"),
);
export const blockColor = v.union(v.literal("yellow"), v.literal("blue"), v.literal("green"), v.literal("red"), v.literal("rose"), v.null());
/** Color of a line's text (separate from the block's background color) */
export const textColor = v.union(
  v.literal("gray"),
  v.literal("red"),
  v.literal("orange"),
  v.literal("green"),
  v.literal("blue"),
  v.literal("purple"),
  v.null(),
);
export const attachment = v.object({
  id: v.string(),
  kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio"), v.literal("file"), v.literal("link")),
  url: v.union(v.string(), v.null()),
  storageId: v.union(v.id("_storage"), v.null()),
  name: v.union(v.string(), v.null()),
  mime: v.union(v.string(), v.null()),
  size: v.union(v.number(), v.null()),
});
export const comment = v.object({
  id: v.string(),
  text: v.string(),
  author: v.union(v.string(), v.null()),
  createdAt: v.number(),
  attachments: v.array(attachment),
});
export const blockFields = {
  key: v.string(),
  position: v.number(),
  type: blockType,
  content: v.string(),
  checked: v.boolean(),
  color: blockColor,
  textColor: v.optional(textColor),
  sourceBlockId: v.union(v.string(), v.null()),
  /** An "images" block's pictures, shown side by side */
  images: v.optional(v.array(attachment)),
  // Legacy: files attached straight to a block (now they live inside comments)
  attachments: v.optional(v.array(attachment)),
  comments: v.optional(v.array(comment)),
};

export default defineSchema({
  ...authTables,

  videos: defineTable({
    title: v.string(),
    liveDate: v.union(v.string(), v.null()),
    status: videoStatus,
    format: v.union(v.literal("long"), v.literal("short")),
    sponsored: v.optional(sponsorship),
    /** Captions per platform; absent until someone writes one */
    captions: v.optional(v.array(captionPlatform)),
    /** Free-text brief (e.g. from a sponsor); absent until someone writes one */
    brief: v.optional(v.string()),
    /** Links that go with the brief (docs, contracts, email threads). Internal like the brief. */
    briefLinks: v.optional(v.array(v.object({ id: v.string(), label: v.string(), url: v.string() }))),
    /** Pinned to the top of the Scripts views while it's being worked on (when it was pinned; absent = not pinned) */
    pinnedAt: v.optional(v.union(v.number(), v.null())),
    /** The brand partner this video is for ("Partner Sponsor"); picked from the partners table */
    partnerId: v.optional(v.union(v.id("partners"), v.null())),
    shareSlug: v.string(),
    editPasscode: v.union(v.string(), v.null()),
    createdBy: v.union(v.id("users"), v.null()),
    updatedAt: v.number(),
  })
    .index("by_slug", ["shareSlug"])
    .index("by_updated", ["updatedAt"])
    .index("by_partner", ["partnerId"]),

  // Brand deals: companies we partner with. Logos are either bundled (/partners/…), uploaded, or the site's icon.
  partners: defineTable({
    name: v.string(),
    website: v.union(v.string(), v.null()),
    logoUrl: v.union(v.string(), v.null()),
    logoStorageId: v.union(v.id("_storage"), v.null()),
    /** Free-form details: agency, contacts, deal terms, notes */
    details: v.string(),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  // main = the script, instructions = editor to-dos, edited = someone's suggested copy,
  // archived = a replaced main kept for history
  documents: defineTable({
    videoId: v.id("videos"),
    kind: v.union(v.literal("main"), v.literal("instructions"), v.literal("edited"), v.literal("archived")),
    editorName: v.union(v.string(), v.null()),
    guestToken: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  })
    .index("by_video", ["videoId", "kind"])
    .index("by_token", ["guestToken"]),

  // Comments on a script: blockKey null = about the whole script, else about one line/block.
  comments: defineTable({
    videoId: v.id("videos"),
    blockKey: v.union(v.string(), v.null()),
    /** The line's text when the comment was made (shown if the line is later removed) */
    quote: v.union(v.string(), v.null()),
    /** Lines this comment used to be on, oldest first (it moves when an edit replaces its line) */
    keyHistory: v.optional(v.array(v.string())),
    text: v.string(),
    authorName: v.union(v.string(), v.null()),
    authorId: v.union(v.id("users"), v.null()),
    /** Posted by an AI agent through the agent API */
    agent: v.boolean(),
    /** Share-link commenters get a token so they can edit their own comments */
    guestToken: v.union(v.string(), v.null()),
    attachments: v.array(attachment),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_video", ["videoId", "createdAt"]),

  // Cached tweet data for link cards (fetched from FxTwitter, refreshed after a few hours)
  tweets: defineTable({
    tweetId: v.string(),
    data: v.union(v.any(), v.null()),
    fetchedAt: v.number(),
  }).index("by_tweet", ["tweetId"]),

  // Updates tab: a running log per video of what happened (new emails, calls, approvals...). Internal only.
  updates: defineTable({
    videoId: v.id("videos"),
    title: v.string(),
    details: v.string(),
    /** Where to find the conversation (email thread, Slack message, doc) */
    link: v.union(v.string(), v.null()),
    /** e.g. Email, Slack, Notion, Call */
    source: v.union(v.string(), v.null()),
    happenedAt: v.number(),
    authorName: v.union(v.string(), v.null()),
    authorId: v.union(v.id("users"), v.null()),
    agent: v.boolean(),
    /** Needs a response right away; pinned to the top of the Feed until handled */
    urgent: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_video", ["videoId", "happenedAt"])
    .index("by_happened", ["happenedAt"]),

  // Mymind: saved ideas (tweets, images, videos, links, notes), each with a note. Separate from scripts.
  ideas: defineTable({
    kind: v.union(v.literal("tweet"), v.literal("video"), v.literal("image"), v.literal("link"), v.literal("note")),
    url: v.union(v.string(), v.null()),
    note: v.string(),
    /** Uploaded image or video */
    storageId: v.union(v.id("_storage"), v.null()),
    fileUrl: v.union(v.string(), v.null()),
    mime: v.union(v.string(), v.null()),
    authorName: v.union(v.string(), v.null()),
    agent: v.boolean(),
    /** What the link says (tweet text and author, video title…), so search finds it by topic */
    previewText: v.optional(v.string()),
    /** Lower-cased note + url + preview text, for search */
    searchText: v.string(),
    /** When it was bookmarked (absent = not bookmarked) */
    bookmarkedAt: v.optional(v.union(v.number(), v.null())),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_url", ["url"])
    .searchIndex("search", { searchField: "searchText" }),

  // Cached preview cards for social links in comments (YouTube, TikTok, Instagram, ...)
  linkPreviews: defineTable({
    url: v.string(),
    data: v.union(v.any(), v.null()),
    fetchedAt: v.number(),
  }).index("by_url", ["url"]),

  // Tweet page: posts written in the app for the X accounts connected in Composio; posted at `at` by the scheduler
  xPosts: defineTable({
    accountIds: v.array(v.string()),
    text: v.string(),
    at: v.number(),
    status: v.union(v.literal("scheduled"), v.literal("posting"), v.literal("posted"), v.literal("failed")),
    /** One per account once it's been tried: the new tweet (id and link) or why it failed */
    results: v.array(
      v.object({ accountId: v.string(), tweetId: v.union(v.string(), v.null()), url: v.union(v.string(), v.null()), error: v.union(v.string(), v.null()) }),
    ),
    createdBy: v.union(v.id("users"), v.null()),
    /** The scheduled job that will post it (cancelled on edit/delete) */
    job: v.union(v.id("_scheduled_functions"), v.null()),
  }).index("by_at", ["at"]),

  // Excalidraw boards: the scene as JSON plus an AI-readable summary of it (see boards.ts)
  /** Topic opportunities: researched video ideas (keywords, outliers, why now) that people can save */
  topics: defineTable({
    ...research,
    status: topicStatus,
    /** Team notes on the idea */
    notes: v.optional(v.string()),
    /** The script made from it ("Create script") */
    videoId: v.optional(v.union(v.id("videos"), v.null())),
    /** Who added it: a person, or an agent's name */
    addedBy: v.optional(v.string()),
    researchedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_score", ["score"])
    .index("by_title", ["title"]),

  /** One research pass over Topic opportunities (a scheduled refresh, or research by hand) */
  topicRuns: defineTable({
    agentName: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    /** What changed, in a few lines (written when the run finishes) */
    summary: v.optional(v.string()),
    added: v.number(),
    refreshed: v.number(),
  }).index("by_started", ["startedAt"]),

  /** A topic's research as it was in one run, so earlier research is never lost */
  topicSnapshots: defineTable({
    topicId: v.id("topics"),
    runId: v.id("topicRuns"),
    ...research,
    takenAt: v.number(),
  })
    .index("by_topic", ["topicId", "takenAt"])
    .index("by_run", ["runId"]),

  boards: defineTable({
    title: v.string(),
    /** Excalidraw elements, JSON */
    elements: v.string(),
    /** The few Excalidraw view settings worth keeping (background color, grid), JSON */
    appState: v.string(),
    /** Images on the board, stored in Native Note storage */
    files: v.array(v.object({ id: v.string(), url: v.string(), mimeType: v.string(), storageId: v.optional(v.id("_storage")) })),
    /** Plain-text description for AI: text, labelled shapes, connections */
    summary: v.string(),
    elementCount: v.number(),
    /** Pinned to the sidebar (when it was pinned; absent = not pinned) */
    pinnedAt: v.optional(v.union(v.number(), v.null())),
    createdBy: v.union(v.id("users"), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_updated", ["updatedAt"]),

  // Library: an index of files pasted into comments (rebuilt from comments; see library.ts)
  assets: defineTable({
    videoId: v.id("videos"),
    commentId: v.id("comments"),
    attachmentId: v.string(),
    kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio"), v.literal("file")),
    name: v.string(),
    url: v.union(v.string(), v.null()),
    mime: v.union(v.string(), v.null()),
    size: v.union(v.number(), v.null()),
    blockKey: v.union(v.string(), v.null()),
    /** The text of the line it was commented on (the line's last known text if it was removed) */
    linkedLine: v.string(),
    lineRemoved: v.boolean(),
    scriptTitle: v.string(),
    commentText: v.string(),
    /** Lower-cased name + linked line + script title + comment, for search */
    searchText: v.string(),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_video", ["videoId"])
    .searchIndex("search", { searchField: "searchText" }),

  blocks: defineTable({
    documentId: v.id("documents"),
    videoId: v.id("videos"),
    ...blockFields,
  })
    .index("by_document", ["documentId", "position"])
    .index("by_document_key", ["documentId", "key"])
    .index("by_video", ["videoId"]),
});
