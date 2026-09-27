import type { AttachmentKind, Block } from "./types";

export const uid = () => crypto.randomUUID();

export function kindForFile(file: { type: string; name: string }): AttachmentKind {
  const t = file.type || "";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "heic", "svg"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "m4v", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext)) return "audio";
  return "file";
}

export function formatBytes(n: number | null | undefined) {
  if (!n && n !== 0) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

export function safeFileName(name: string) {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120) || "file";
}

export function normalizeUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][\w+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function hostOf(url: string | null) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function formatDate(d: string | null) {
  if (!d) return "";
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(d);
}

/** Number shown before a numbered-list block (restarts after any other block type). */
export function listNumbers(blocks: Block[]): Map<string, number> {
  const m = new Map<string, number>();
  let n = 0;
  for (const b of blocks) {
    if (b.type === "number") m.set(b.id, ++n);
    else n = 0;
  }
  return m;
}

export function randomPasscode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function emptyBlock(): Block {
  return { id: uid(), type: "p", content: "" };
}

/** The script as plain text (Markdown-style list markers), for copying elsewhere. */
export function scriptToText(title: string, blocks: Block[]) {
  const numbers = listNumbers(blocks);
  const lines = blocks.map((b) => {
    if (b.type === "h1") return `\n# ${b.content}`;
    if (b.type === "bullet") return `- ${b.content}`;
    if (b.type === "number") return `${numbers.get(b.id)}. ${b.content}`;
    if (b.type === "todo") return `[${b.checked ? "x" : " "}] ${b.content}`;
    return b.content;
  });
  return [title ? `# ${title}\n` : "", ...lines].join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
