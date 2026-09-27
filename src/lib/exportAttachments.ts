// "Export all attachments" on share links: one zip with every file from the comments, in script order,
// plus Links.html listing every link (attached or written in a comment) with the line it was on.

import type { Block, Comment } from "./types";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

type Row = { where: string; label: string; url: string; by: string; when: string };

export async function exportAttachments(title: string, blocks: Block[], comments: Comment[], onProgress?: (done: number, total: number) => void) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const order = new Map(blocks.map((b, i) => [b.id, i]));
  const lineText = new Map(blocks.map((b) => [b.id, b.content]));
  const sorted = [...comments].sort(
    (a, b) => (order.get(a.blockKey ?? "") ?? -1) - (order.get(b.blockKey ?? "") ?? -1) || a.createdAt - b.createdAt,
  );
  const whereOf = (c: Comment) => {
    const line = c.blockKey ? lineText.get(c.blockKey) : undefined;
    if (line !== undefined) return `Line ${(order.get(c.blockKey!) ?? 0) + 1}: ${line.slice(0, 80)}`;
    return c.blockKey ? `Removed line: ${(c.quote ?? "").slice(0, 80)}` : "Whole script";
  };

  const files: { url: string; name: string; c: Comment }[] = [];
  const links: Row[] = [];
  const failed: Row[] = [];
  for (const c of sorted) {
    const base = { where: whereOf(c), by: c.authorName ?? "", when: new Date(c.createdAt).toLocaleDateString() };
    for (const a of c.attachments) {
      if (!a.url) continue;
      if (a.kind === "link") links.push({ ...base, label: a.name || a.url, url: a.url });
      else files.push({ url: a.url, name: a.name || `${a.kind}-${a.id.slice(0, 6)}`, c });
    }
    for (const m of c.text.matchAll(URL_RE)) links.push({ ...base, label: m[0], url: m[0].replace(/[).,!?]+$/, "") });
  }

  const used = new Set<string>();
  let done = 0;
  onProgress?.(0, files.length);
  // A few downloads at a time
  const queue = files.map((f, i) => ({ ...f, i }));
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const num = String(f.i + 1).padStart(2, "0");
      let name = `${num} - ${safeName(f.name)}`;
      while (used.has(name)) name = `${num}b - ${safeName(f.name)}`;
      used.add(name);
      try {
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(String(res.status));
        zip.file(name, await res.blob());
      } catch {
        failed.push({ where: whereOf(f.c), label: f.name, url: f.url, by: f.c.authorName ?? "", when: new Date(f.c.createdAt).toLocaleDateString() });
      }
      onProgress?.(++done, files.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  const table = (rows: Row[]) =>
    rows.length
      ? `<table><thead><tr><th>Link</th><th>Where</th><th>By</th><th>Date</th></tr></thead><tbody>${rows
          .map((r) => `<tr><td><a href="${esc(r.url)}">${esc(r.label)}</a></td><td>${esc(r.where)}</td><td>${esc(r.by)}</td><td>${esc(r.when)}</td></tr>`)
          .join("")}</tbody></table>`
      : `<p class="none">None.</p>`;
  zip.file(
    "Links.html",
    `<!doctype html><meta charset="utf-8"><title>${esc(title)} · links</title>
<style>body{font:15px/1.5 -apple-system,system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#1b1b1b}
h1{font-size:24px;margin:0 0 4px}p.sub{color:#737373;margin:0 0 24px}h2{font-size:16px;margin:28px 0 8px}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #ebebeb;vertical-align:top;font-size:14px}
th{font-size:12px;color:#737373;font-weight:500}a{color:#2358d8;word-break:break-all}.none{color:#9a9a9a}</style>
<h1>${esc(title)}</h1><p class="sub">Exported from Native Note on ${esc(new Date().toLocaleString())} · ${files.length - failed.length} files in this zip</p>
<h2>Links (${links.length})</h2>${table(links)}
${failed.length ? `<h2>Files that couldn't be downloaded (${failed.length})</h2>${table(failed)}` : ""}`,
  );

  const blob = await zip.generateAsync({ type: "blob" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${safeName(title || "Script")} - attachments.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
  return { files: files.length - failed.length, links: links.length, failed: failed.length };
}
