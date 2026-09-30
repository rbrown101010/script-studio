#!/usr/bin/env node
// Attach files from this computer to Native Note comments, no browser and no API key needed
// (it runs the backend functions directly with this repo's Convex access).
//
//   node scripts/attach.mjs --script <id or share link> [--line "part of a line"] [--text "comment"] file ...
//       posts a new agent comment (on that line, or the whole script) with the files attached
//   node scripts/attach.mjs --comment <comment id> file ...
//       adds the files to an existing comment
//
// Options: --agent <name> (default Claude), --dev (use the dev deployment instead of production).
// Any file type and size: each file is uploaded straight to Native Note's storage.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  heic: "image/heic", avif: "image/avif", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", pdf: "application/pdf", txt: "text/plain", md: "text/markdown",
  csv: "text/csv", json: "application/json", zip: "application/zip",
};

const args = process.argv.slice(2);
const opts = {};
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--dev") opts.dev = true;
  else if (a.startsWith("--")) opts[a.slice(2)] = args[++i];
  else files.push(a);
}
if (!files.length || (!opts.script && !opts.comment)) {
  console.error('Usage: node scripts/attach.mjs (--script <id|link> [--line "..."] [--text "..."] | --comment <id>) file ...');
  process.exit(1);
}

const run = (fn, fnArgs) => {
  const out = execFileSync("npx", ["convex", "run", ...(opts.dev ? [] : ["--prod"]), fn, JSON.stringify(fnArgs)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
  return out ? JSON.parse(out) : null;
};

const attachments = [];
for (const f of files) {
  const stat = fs.statSync(f);
  const name = path.basename(f);
  const mime = MIME[path.extname(f).slice(1).toLowerCase()] ?? "application/octet-stream";
  const uploadUrl = run("agentFiles:uploadUrl", {});
  process.stderr.write(`↑ ${name} (${(stat.size / 1e6).toFixed(1)} MB)… `);
  const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": mime }, body: fs.createReadStream(f), duplex: "half" });
  if (!res.ok) throw new Error(`Upload failed for ${f}: ${res.status} ${await res.text()}`);
  const { storageId } = await res.json();
  process.stderr.write("done\n");
  attachments.push({ storageId, name, mime, size: stat.size });
}

if (opts.comment) {
  console.log(JSON.stringify(run("agentFiles:attach", { comment: opts.comment, attachments }), null, 2));
} else {
  const id = run("comments:addAgent", {
    script: opts.script,
    text: opts.text ?? "",
    agentName: opts.agent,
    lineContains: opts.line,
    attachments,
  });
  console.log(JSON.stringify({ comment: id, attached: attachments.map((a) => a.name) }, null, 2));
}
