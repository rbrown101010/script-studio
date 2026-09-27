// Caret helpers for plain-text contentEditable blocks.
// Block text is stored as plain text; a trailing "\n" is rendered with a zero-width space so the
// empty last line is visible. ZWSP never reaches saved content.

export const ZWSP = "​";

export function readText(el: HTMLElement) {
  return (el.textContent ?? "").replaceAll(ZWSP, "");
}

export function writeText(el: HTMLElement, value: string) {
  el.textContent = value.endsWith("\n") ? value + ZWSP : value;
}

function offsetWithin(el: HTMLElement, node: Node, offset: number) {
  const r = document.createRange();
  r.selectNodeContents(el);
  try {
    r.setEnd(node, offset);
  } catch {
    return 0;
  }
  return r.toString().replaceAll(ZWSP, "").length;
}

export function getSelectionOffsets(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer) && range.startContainer !== el) return null;
  const start = offsetWithin(el, range.startContainer, range.startOffset);
  const end = el.contains(range.endContainer) || range.endContainer === el
    ? offsetWithin(el, range.endContainer, range.endOffset)
    : readText(el).length;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function setCaret(el: HTMLElement, offset: number) {
  el.focus({ preventScroll: true });
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode() as Text | null;
  let last: Text | null = null;
  while (node) {
    const text = node.data.replaceAll(ZWSP, "");
    if (remaining <= text.length) {
      const range = document.createRange();
      range.setStart(node, Math.min(remaining, node.data.length));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      scrollCaretIntoView(el);
      return;
    }
    remaining -= text.length;
    last = node;
    node = walker.nextNode() as Text | null;
  }
  const range = document.createRange();
  if (last) range.setStart(last, last.data.replaceAll(ZWSP, "").length);
  else range.setStart(el, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  scrollCaretIntoView(el);
}

function scrollCaretIntoView(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.bottom > window.innerHeight - 40 || r.top < 60) {
    el.scrollIntoView({ block: "nearest" });
  }
}

function caretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rects = range.getClientRects();
  if (rects.length) return rects[0];
  return null;
}

export function caretOnFirstLine(el: HTMLElement) {
  const rect = caretRect();
  if (!rect) return true;
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
  return rect.top - el.getBoundingClientRect().top < lh * 0.8;
}

export function caretOnLastLine(el: HTMLElement) {
  const rect = caretRect();
  if (!rect) return true;
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
  return el.getBoundingClientRect().bottom - rect.bottom < lh * 0.8;
}
