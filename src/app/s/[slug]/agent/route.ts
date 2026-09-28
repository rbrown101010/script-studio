// Machine-readable copy of a shared script for AI agents (e.g. Claude Code): the script, editor instructions,
// captions, every comment, and a direct download link for every attached file, so an agent can fetch the
// footage and assets and edit the video end to end. Public like the share link itself; nothing else is exposed.
//   GET /s/<slug>/agent            → JSON
//   GET /s/<slug>/agent?format=md  → Markdown
//   GET /s/<slug>/agent?format=sh  → a shell script that downloads every file into ./assets

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

export const dynamic = "force-dynamic";

type Att = { id: string; kind: string; url: string | null; name: string | null; mime: string | null; size: number | null };
type Cmt = { id: string; blockKey: string | null; quote: string | null; text: string; authorName: string | null; agent: boolean; attachments: Att[]; createdAt: number };
type Block = { id: string; type: string; content: string; checked?: boolean };

const EXT: Record<string, string> = { image: "png", video: "mp4", audio: "mp3", file: "bin" };
const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 100);
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const format = new URL(req.url).searchParams.get("format");
  const origin = new URL(req.url).origin;
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const [shared, comments] = await Promise.all([
    convex.query(api.share.get, { slug }),
    convex.query(api.comments.listShared, { slug }) as Promise<Cmt[]>,
  ]);
  if (!shared) return Response.json({ error: "No script at this link" }, { status: 404 });

  const blocks = shared.blocks as Block[];
  const instructions = shared.instructions as Block[];
  const lineNo = new Map(blocks.map((b, i) => [b.id, i + 1]));
  const insKeys = new Set(instructions.map((b) => b.id));
  const sorted = [...comments].sort((a, b) => (lineNo.get(a.blockKey ?? "") ?? 1e9) - (lineNo.get(b.blockKey ?? "") ?? 1e9) || a.createdAt - b.createdAt);

  // Every downloadable file, numbered in script order, with a file name that says where it came from
  const files: { n: number; filename: string; kind: string; url: string; mime: string | null; size: number | null; line: number | null; lineText: string | null; comment: string; commentId: string }[] = [];
  const links: { url: string; label: string | null; line: number | null; lineText: string | null; commentId: string }[] = [];
  const used = new Set<string>();
  for (const c of sorted) {
    const line = c.blockKey ? (lineNo.get(c.blockKey) ?? null) : null;
    const lineText = c.blockKey ? (blocks.find((b) => b.id === c.blockKey)?.content ?? instructions.find((b) => b.id === c.blockKey)?.content ?? c.quote) : null;
    for (const a of c.attachments) {
      if (!a.url) continue;
      if (a.kind === "link") {
        links.push({ url: a.url, label: a.name, line, lineText, commentId: c.id });
        continue;
      }
      const n = files.length + 1;
      let base = safe(a.name || `${a.kind}-${a.id.slice(0, 6)}`);
      if (!/\.[a-z0-9]{2,5}$/i.test(base)) base += `.${(a.mime?.split("/")[1] ?? EXT[a.kind] ?? "bin").replace("quicktime", "mov")}`;
      let filename = `${String(n).padStart(2, "0")} - ${line ? `line ${line}` : c.blockKey && insKeys.has(c.blockKey) ? "instructions" : c.blockKey ? "removed line" : "whole script"} - ${base}`;
      while (used.has(filename)) filename = filename.replace(/^(\d+)/, "$1b");
      used.add(filename);
      files.push({ n, filename, kind: a.kind, url: a.url, mime: a.mime, size: a.size, line, lineText, comment: c.text, commentId: c.id });
    }
    for (const m of c.text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) links.push({ url: m[0].replace(/[).,!?]+$/, ""), label: null, line, lineText, commentId: c.id });
  }

  // Pictures in images blocks
  type ImgBlock = Block & { images?: Att[] };
  for (const [i, b] of (blocks as ImgBlock[]).entries()) {
    if (b.type !== "images") continue;
    for (const a of b.images ?? []) {
      if (!a.url) continue;
      const n = files.length + 1;
      let base = safe(a.name || `image-${a.id.slice(0, 6)}`);
      if (!/\.[a-z0-9]{2,5}$/i.test(base)) base += `.${a.mime?.split("/")[1] ?? "png"}`;
      let filename = `${String(n).padStart(2, "0")} - line ${i + 1} - ${base}`;
      while (used.has(filename)) filename = filename.replace(/^(\d+)/, "$1b");
      used.add(filename);
      files.push({ n, filename, kind: "image", url: a.url, mime: a.mime, size: a.size, line: i + 1, lineText: "(images block)", comment: "", commentId: "" });
    }
  }

  const commentView = (c: Cmt) => ({
    id: c.id,
    author: c.authorName,
    byAgent: c.agent,
    text: c.text,
    files: files.filter((f) => f.commentId === c.id).map((f) => f.filename),
    links: links.filter((l) => l.commentId === c.id).map((l) => l.url),
  });
  const script = blocks.map((b, i) => ({
    line: i + 1,
    key: b.id,
    type: b.type,
    text: b.content,
    ...(b.type === "images" ? { images: files.filter((f) => f.line === i + 1 && !f.commentId).map((f) => f.filename) } : {}),
    comments: sorted.filter((c) => c.blockKey === b.id).map(commentView),
  }));
  const downloadScript = [
    "#!/bin/sh",
    `# All files attached to "${shared.video.title}" (${origin}/s/${slug})`,
    "set -e",
    "mkdir -p assets",
    ...files.map((f) => `curl -fL --retry 3 -o ${q(`assets/${f.filename}`)} ${q(f.url)}`),
    `echo "Downloaded ${files.length} file(s) into ./assets"`,
  ].join("\n");

  const data = {
    about:
      "Native Note script, shared by link. Use `script` (lines in order) and `editorInstructions` to know what to make; comments on each line say what goes there, and `files` are the attached footage and assets (direct download URLs). Run `downloadScript` (or GET this URL with ?format=sh) to download everything into ./assets. This link is read-only.",
    title: shared.video.title || "Untitled",
    shareUrl: `${origin}/s/${slug}`,
    status: shared.video.status,
    format: shared.video.format === "short" ? "short-form (vertical)" : "long-form",
    liveDate: shared.video.liveDate,
    editorInstructions: instructions.filter((b) => b.content.trim()).map((b) => ({ text: b.content, done: !!b.checked, comments: sorted.filter((c) => c.blockKey === b.id).map(commentView) })),
    script,
    wholeScriptComments: sorted.filter((c) => !c.blockKey).map(commentView),
    commentsOnRemovedLines: sorted.filter((c) => c.blockKey && !lineNo.has(c.blockKey) && !insKeys.has(c.blockKey)).map((c) => ({ ...commentView(c), removedLineText: c.quote })),
    captions: shared.video.captions.map((c) => ({ platform: c.platform, caption: c.caption, linkInBio: c.linkInBio, posted: c.posted, fields: c.fields.map((f) => ({ label: f.label, value: f.value })) })),
    files,
    links,
    downloadScript,
  };

  if (format === "sh") return new Response(downloadScript + "\n", { headers: { "Content-Type": "text/x-shellscript; charset=utf-8", "Cache-Control": "no-store" } });
  if (format === "md") {
    const md = [
      `# ${data.title}`,
      "",
      `${data.format} · status: ${data.status}${data.liveDate ? ` · live ${data.liveDate}` : ""} · ${data.shareUrl}`,
      "",
      `> ${data.about}`,
      "",
      `Download every file: \`curl -fsSL '${origin}/s/${slug}/agent?format=sh' | sh\``,
      "",
      ...(data.editorInstructions.length ? ["## Editor instructions", ...data.editorInstructions.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`), ""] : []),
      "## Script",
      ...script.flatMap((l) => [
        `${l.line}. ${l.type === "h1" ? `**${l.text}**` : l.text}`,
        ...l.comments.map((c) => `   - 💬 ${c.author ?? "Someone"}: ${c.text.replace(/\n/g, " ")}${c.files.length ? ` [files: ${c.files.join(", ")}]` : ""}${c.links.length ? ` [links: ${c.links.join(", ")}]` : ""}`),
      ]),
      "",
      ...(data.wholeScriptComments.length ? ["## Comments on the whole script", ...data.wholeScriptComments.map((c) => `- ${c.author ?? "Someone"}: ${c.text}${c.files.length ? ` [files: ${c.files.join(", ")}]` : ""}`), ""] : []),
      "## Files",
      ...(files.length ? files.map((f) => `- ${f.filename} (${f.kind}${f.size ? `, ${f.size < 1e6 ? `${Math.max(1, Math.round(f.size / 1e3))} KB` : `${Math.round((f.size / 1e6) * 10) / 10} MB`}` : ""}): ${f.url}`) : ["None."]),
      "",
      ...(links.length ? ["## Links", ...links.map((l) => `- ${l.url}${l.line ? ` (line ${l.line})` : ""}`), ""] : []),
      ...(data.captions.length ? ["## Captions", ...data.captions.map((c) => `- ${c.platform}: ${c.caption}`), ""] : []),
    ].join("\n");
    return new Response(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
