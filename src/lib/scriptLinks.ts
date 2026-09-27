// Links and bold inside script lines. Text stays plain: a link is written [text](https://…) or as a bare
// URL, and bold is **text**.
// When a line isn't being edited it's drawn with real links (the [text](url) shows as just "text");
// while you type in it you see the plain text, so editing works exactly like any other line.

import { ZWSP } from "./caret";

export type Seg = { text: string; href?: string; bold?: boolean; rawStart: number; rawLen: number; label: number };

const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+?)\*\*|https?:\/\/[^\s<>"'\])]*[^\s<>"'\]).,!?;:]/g;

/** The line split into text and links, or null when it has no links (drawn as plain text). */
export function linkSegments(value: string): Seg[] | null {
  const segs: Seg[] = [];
  let last = 0;
  let found = false;
  for (const m of value.matchAll(LINK_RE)) {
    const start = m.index ?? 0;
    if (start > last) segs.push({ text: value.slice(last, start), rawStart: last, rawLen: start - last, label: 0 });
    if (m[1] !== undefined) segs.push({ text: m[1], href: m[2], rawStart: start, rawLen: m[0].length, label: 1 });
    else if (m[3] !== undefined) segs.push({ text: m[3], bold: true, rawStart: start, rawLen: m[0].length, label: 2 });
    else segs.push({ text: m[0], href: m[0], rawStart: start, rawLen: m[0].length, label: 0 });
    last = start + m[0].length;
    found = true;
  }
  if (!found) return null;
  if (last < value.length) segs.push({ text: value.slice(last), rawStart: last, rawLen: value.length - last, label: 0 });
  return segs;
}

/** Draws the line with real links. */
export function renderLinks(el: HTMLElement, segs: Seg[]) {
  el.textContent = "";
  for (const s of segs) {
    if (s.href) {
      const a = document.createElement("a");
      a.href = s.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.dataset.scriptLink = "";
      a.className = "script-link";
      a.textContent = s.text;
      a.title = s.href;
      el.appendChild(a);
    } else if (s.bold) {
      const b = document.createElement("strong");
      b.className = "script-bold";
      b.textContent = s.text;
      el.appendChild(b);
    } else el.appendChild(document.createTextNode(s.text));
  }
  if (segs[segs.length - 1]?.text.endsWith("\n")) el.appendChild(document.createTextNode(ZWSP));
}

/** Maps a caret position in the drawn line (what you see) to the plain text (what's stored). */
export function toRawOffset(segs: Seg[], shown: number) {
  let pos = 0;
  for (const s of segs) {
    if (shown <= pos + s.text.length) return s.rawStart + s.label + (shown - pos);
    pos += s.text.length;
  }
  const lastSeg = segs[segs.length - 1];
  return lastSeg ? lastSeg.rawStart + lastSeg.rawLen : 0;
}

export const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

/** Wraps text[start..end] as a link; returns the new text and where the caret should go. */
export function wrapLink(text: string, start: number, end: number, url: string) {
  const label = text.slice(start, end).replace(/[[\]]/g, "");
  const link = `[${label}](${url.trim()})`;
  return { text: text.slice(0, start) + link + text.slice(end), caret: start + link.length };
}

/** ⌘B: makes text[start..end] bold, or un-bolds it if it's already **wrapped**. */
export function toggleBold(text: string, start: number, end: number) {
  const inner = text.slice(start, end);
  if (text.slice(start - 2, start) === "**" && text.slice(end, end + 2) === "**")
    return { text: text.slice(0, start - 2) + inner + text.slice(end + 2), start: start - 2, end: end - 2 };
  if (/^\*\*[\s\S]*\*\*$/.test(inner) && inner.length >= 4)
    return { text: text.slice(0, start) + inner.slice(2, -2) + text.slice(end), start, end: end - 4 };
  const clean = inner.replace(/\*\*/g, "");
  return { text: text.slice(0, start) + `**${clean}**` + text.slice(end), start: start + 2, end: start + 2 + clean.length };
}
