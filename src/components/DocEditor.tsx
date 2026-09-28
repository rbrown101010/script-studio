"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BLOCK_COLORS, TEXT_COLORS, colorBg, textHex, type Attachment, type Block, type BlockColor, type BlockType, type TextColor } from "@/lib/types";
import { uploadToUrl } from "@/lib/upload";
import { caretOnFirstLine, caretOnLastLine, getSelectionOffsets, readText, setCaret, writeText } from "@/lib/caret";
import { isUrl, linkSegments, renderLinks, toRawOffset, toggleBold, wrapLink } from "@/lib/scriptLinks";
import { listNumbers, uid } from "@/lib/util";
import { useIsMobile } from "@/lib/useIsMobile";
import { IconClip, IconComment, IconCopy, IconCheck, IconGrip, IconPlus, IconTrash, IconX } from "./icons";

type SetBlocks = (fn: (prev: Block[]) => Block[]) => void;
export type Variant = "script" | "instructions";

const isList = (t: BlockType) => t === "bullet" || t === "number" || t === "todo";

export function textClass(type: BlockType, variant: Variant = "script") {
  if (variant === "instructions") return "text-[15px] leading-[1.6]";
  if (type === "h1") return "text-[24px] font-semibold leading-[1.35] tracking-[-0.005em] text-(--c-t-1b1b1b)";
  return "text-[16px] leading-[1.65]";
}

/** Wrapper spacing: headings get air above them (except at the very top). */
export function rowOuterClass(type: BlockType, index: number, joined = false) {
  // A heading inside a run of colored blocks keeps its space as padding, so the color doesn't break
  if (joined) return "";
  return type === "h1" && index > 0 ? "mt-[22px]" : "";
}

/**
 * Colored blocks next to each other read as one block: no rounded corners or gap where they meet.
 * Returns the extra classes for a colored row given its neighbours.
 */
export function colorRunClass(list: { color?: string | null; type: string }[], index: number) {
  const b = list[index];
  if (!b?.color) return "";
  const prev = !!list[index - 1]?.color;
  const next = !!list[index + 1]?.color;
  return [prev ? "rounded-t-none" : "", next ? "rounded-b-none" : "", prev && b.type === "h1" ? "pt-[25px]!" : ""].join(" ");
}

export function BlockPrefix({
  type,
  n,
  checked,
  onToggle,
  variant = "script",
  className = "",
}: {
  type: BlockType;
  n?: number;
  checked?: boolean;
  onToggle?: () => void;
  variant?: Variant;
  className?: string;
}) {
  if (type === "todo")
    return (
      <span className={`flex shrink-0 ${variant === "instructions" ? "w-[25px] pt-[4px]" : "w-[26px] pt-[5px]"}`}>
        <input
          type="checkbox"
          checked={!!checked}
          disabled={!onToggle}
          onChange={() => onToggle?.()}
          aria-label={checked ? "Mark not done" : "Mark done"}
          className="m-0 h-[15px] w-[15px] cursor-pointer disabled:cursor-default"
          style={{ accentColor: variant === "instructions" ? "var(--c-t-737373)" : "var(--c-t-1b1b1b)" }}
        />
      </span>
    );
  if (type === "bullet")
    return (
      <span aria-hidden="true" className={`w-6 shrink-0 select-none pl-1 ${className}`}>
        •
      </span>
    );
  if (type === "number") return <span className={`w-6 shrink-0 select-none tabular-nums ${className}`}>{n}.</span>;
  return null;
}

const SHORTCUTS: [RegExp, BlockType][] = [
  [/^#\s/, "h1"],
  [/^[-*•]\s/, "bullet"],
  [/^1[.)]\s/, "number"],
  [/^\[\s?\]\s/, "todo"],
];

function parseLine(line: string): { type: BlockType; content: string } {
  for (const [re, type] of SHORTCUTS) if (re.test(line)) return { type, content: line.replace(re, "") };
  const numbered = line.match(/^\d+[.)]\s(.*)$/);
  if (numbered) return { type: "number", content: numbered[1] };
  return { type: "p", content: line };
}

type SlashItem = { key: string; label: string; words: string; group: string; tile: ReactNode; patch: Partial<Block> };

const TYPE_WORDS: Record<BlockType, string> = {
  p: "text plain paragraph normal",
  h1: "heading title h1 header",
  bullet: "bulleted list bullet unordered",
  number: "numbered list number ordered",
  todo: "to-do todo checkbox task check",
  images: "images image picture pictures photo photos gallery logos",
};

/** Everything the / menu can do to a line, filtered by what's typed after the slash. */
function slashItems(query: string, variant: Variant): SlashItem[] {
  const all: SlashItem[] = [
    ...(variant === "script"
      ? TURN_INTO.map((t) => ({ key: t.type, label: t.label, words: TYPE_WORDS[t.type], group: "Turn into", tile: t.tile, patch: { type: t.type } }))
      : []),
    { key: "text-default", label: "Default text", words: "text color colour", group: "Text color", tile: <span className="text-(--c-t-1b1b1b)">A</span>, patch: { textColor: null } },
    ...TEXT_COLORS.map((c) => ({
      key: `text-${c.value}`,
      label: `${c.label} text`,
      words: "text color colour",
      group: "Text color",
      tile: <span style={{ color: c.hex }}>A</span>,
      patch: { textColor: c.value },
    })),
    { key: "bg-default", label: "Default background", words: "background bg highlight color colour block none", group: "Background", tile: <span className="block h-3.5 w-3.5 rounded-[3px] border border-(--c-l-dcdcdc) bg-(--c-b-ffffff)" />, patch: { color: null } },
    ...BLOCK_COLORS.map((c) => ({
      key: `bg-${c.value}`,
      label: `${c.label} background`,
      words: "background bg highlight color colour block",
      group: "Background",
      tile: <span className="block h-3.5 w-3.5 rounded-[3px]" style={{ background: c.bg }} />,
      patch: { color: c.value },
    })),
  ];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return all;
  return all.filter((it) => {
    const words = `${it.label} ${it.words}`.toLowerCase().split(/[\s-]+/);
    // Each typed word has to match a different word of the option, so "blue b" means Blue background, not Blue text
    const left = [...words];
    return terms.every((t) => {
      const i = left.findIndex((w) => w.startsWith(t));
      if (i < 0) return false;
      left.splice(i, 1);
      return true;
    });
  });
}

const TURN_INTO: { type: BlockType; label: string; tile: ReactNode }[] = [
  { type: "p", label: "Text", tile: "T" },
  { type: "h1", label: "Heading 1", tile: "H1" },
  { type: "bullet", label: "Bulleted list", tile: "•" },
  { type: "number", label: "Numbered list", tile: "1." },
  { type: "todo", label: "To-do", tile: <span className="block h-3 w-3 rounded-[3px] border-[1.5px] border-current" /> },
  {
    type: "images",
    label: "Images",
    tile: (
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="12" height="10" rx="2" />
        <path d="M2.5 11l3-3 2.5 2.5 1.5-1.5 3.5 3.5" />
      </svg>
    ),
  },
];

/** The editor that last changed, so ⌘Z with no line focused (e.g. after deleting selected lines) goes to it */
let lastEditor: object | null = null;

type Snapshot = { blocks: Block[]; caret: { id: string; offset: number } | null };

export function DocEditor({
  blocks,
  setBlocks: setBlocksRaw,
  readOnly,
  canUpload,
  onFiles,
  variant = "script",
  activeId,
  onActivate,
  onDropTarget,
  onOpenComments,
  canComment,
  commentCounts,
  canToggleTodos,
  placeholder = "Write, or drop a file…",
  footer,
}: {
  blocks: Block[];
  setBlocks: SetBlocks;
  readOnly?: boolean;
  canUpload?: boolean;
  onFiles?: (blockId: string, files: File[]) => void;
  variant?: Variant;
  /** Block whose comments are open in the side panel */
  activeId?: string | null;
  onActivate?: (id: string | null) => void;
  onDropTarget?: (id: string | null) => void;
  /** Opens the side panel on this block's comments (optionally starting a new one) */
  onOpenComments?: (id: string, opts?: { newComment?: boolean }) => void;
  canComment?: boolean;
  /** Number of comments per block id */
  commentCounts?: Record<string, number>;
  canToggleTodos?: boolean;
  placeholder?: string;
  footer?: ReactNode;
}) {
  const els = useRef(new Map<string, HTMLDivElement>());
  const blocksRef = useRef(blocks);
  const focusReq = useRef<{ id: string; offset: number | "end" } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  /** ⌘K on selected text: where the "add link" box is and what it will wrap */
  const [linkBox, setLinkBox] = useState<{ id: string; start: number; end: number; top: number; left: number } | null>(null);
  const mobile = useIsMobile();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [fileDropId, setFileDropId] = useState<string | null>(null);
  const [moveDrop, setMoveDrop] = useState<{ id: string; after: boolean } | null>(null);
  /** Several whole lines selected at once (drag across lines, Shift+Up/Down, or Cmd+A twice) */
  const [lineSel, setLineSel] = useState<{ anchor: string; focus: string } | null>(null);
  const dragFrom = useRef<string | null>(null);
  /** The / menu: which line, where the slash is, what's typed after it, and where to draw it */
  const [slash, setSlashState] = useState<{ id: string; start: number; query: string; top: number; left: number; up: boolean; active: number } | null>(null);
  const slashRef = useRef(slash);
  const setSlash = useCallback((s: typeof slash) => {
    slashRef.current = s;
    setSlashState(s);
  }, []);

  // ---- Images blocks: upload pasted/dropped/picked pictures and add them to the block ----
  const uploadUrl = useMutation(api.docs.generateUploadUrl);
  const fileUrl = useMutation(api.docs.fileUrl);
  /** Pictures still uploading, per block (shown faded until they're stored; never saved as-is) */
  const [uploading, setUploading] = useState<Record<string, Attachment[]>>({});
  // Keeps pictures in the order they were pasted, even if a later one finishes uploading first
  const pasteOrder = useRef(new Map<string, number>());
  const pasteSeq = useRef(0);
  const addImages = useCallback(
    (blockId: string, files: File[]) => {
      const pics = files.filter((f) => f.type.startsWith("image/"));
      for (const f of pics) {
        const temp: Attachment = { id: uid(), kind: "image", url: URL.createObjectURL(f), storageId: null, name: f.name || "image", mime: f.type, size: f.size, progress: 0 };
        pasteOrder.current.set(temp.id, ++pasteSeq.current);
        setUploading((u) => ({ ...u, [blockId]: [...(u[blockId] ?? []), temp] }));
        void (async () => {
          try {
            const target = await uploadUrl();
            const storageId = await uploadToUrl(target, f, () => {});
            const url = await fileUrl({ storageId: storageId as Id<"_storage"> });
            // eslint-disable-next-line react-hooks/immutability
            setBlocks((prev) =>
              prev.map((b) =>
                b.id === blockId
                  ? {
                      ...b,
                      images: [...(b.images ?? []), { ...temp, url, storageId, progress: undefined }].sort(
                        (x, y) => (pasteOrder.current.get(x.id) ?? 0) - (pasteOrder.current.get(y.id) ?? 0),
                      ),
                    }
                  : b,
              ),
            );
          } catch {
            // Upload failed: just drop the preview
          } finally {
            setUploading((u) => ({ ...u, [blockId]: (u[blockId] ?? []).filter((x) => x.id !== temp.id) }));
            URL.revokeObjectURL(temp.url!);
          }
        })();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uploadUrl, fileUrl],
  );
  const makeImagesRef = useRef<(id: string, keepText: string) => string>(() => "");
  /** Turns a line into an images block (or adds one right after it when the line has text) */
  const makeImagesBlock = (id: string, keepText: string) => {
    if (keepText.trim()) {
      const nb: Block = { id: uid(), type: "images", content: "", images: [] };
      setBlocks((prev) => {
        const i = prev.findIndex((b) => b.id === id);
        return [...prev.slice(0, i), { ...prev[i], content: keepText }, nb, ...prev.slice(i + 1)];
      });
      return nb.id;
    }
    update(id, { type: "images", content: "", images: [] });
    return id;
  };
  makeImagesRef.current = makeImagesBlock;

  // ---- Undo / redo: every change to the lines is a step; typing in one line groups into a single step ----
  const me = useRef({}).current;
  const history = useRef({ past: [] as Snapshot[], future: [] as Snapshot[], lastKind: null as string | null, lastId: null as string | null, lastAt: 0, groupStart: 0 });
  const nextIsTyping = useRef<string | null>(null);
  const caretNow = (): Snapshot["caret"] => {
    for (const [id, el] of els.current) {
      if (el === document.activeElement) return { id, offset: getSelectionOffsets(el)?.start ?? readText(el).length };
    }
    return null;
  };
  const setBlocks = useCallback<SetBlocks>(
    (fn) => {
      if (!readOnly) {
        const h = history.current;
        const typingIn = nextIsTyping.current;
        nextIsTyping.current = null;
        const now = Date.now();
        // Typing groups into one step while you keep going (a pause, another line, or ~3s of typing starts a new one)
        const sameTyping = typingIn && h.lastKind === "type" && h.lastId === typingIn && now - h.lastAt < 1500 && now - h.groupStart < 3000;
        if (!sameTyping) h.groupStart = now;
        const last = h.past[h.past.length - 1];
        if (!sameTyping && last?.blocks !== blocksRef.current) {
          h.past.push({ blocks: blocksRef.current, caret: caretNow() });
          if (h.past.length > 300) h.past.shift();
        }
        h.future = [];
        h.lastKind = typingIn ? "type" : "edit";
        h.lastId = typingIn;
        h.lastAt = now;
        lastEditor = me;
      }
      setBlocksRaw(fn);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setBlocksRaw, readOnly],
  );
  /** Puts the lines back as they were, with the caret where it was (or on the first line that changed) */
  const restore = (snap: Snapshot, from: Block[]) => {
    const exists = snap.caret && snap.blocks.some((b) => b.id === snap.caret!.id);
    if (exists) focusBlock(snap.caret!.id, snap.caret!.offset);
    else {
      const before = new Map(from.map((b) => [b.id, b]));
      const changed = snap.blocks.find((b) => before.get(b.id)?.content !== b.content || !before.has(b.id)) ?? snap.blocks[0];
      if (changed) focusBlock(changed.id, "end");
    }
    setLineSel(null);
    setSlash(null);
    setBlocksRaw(() => snap.blocks);
  };
  const undo = () => {
    const h = history.current;
    const snap = h.past.pop();
    if (!snap) return;
    h.future.push({ blocks: blocksRef.current, caret: caretNow() });
    h.lastKind = null;
    restore(snap, blocksRef.current);
  };
  const redo = () => {
    const h = history.current;
    const snap = h.future.pop();
    if (!snap) return;
    h.past.push({ blocks: blocksRef.current, caret: caretNow() });
    h.lastKind = null;
    restore(snap, blocksRef.current);
  };
  const undoRef = useRef({ undo, redo });
  undoRef.current = { undo, redo };
  // ⌘Z / ⇧⌘Z / ⌘Y when no line has the caret (e.g. right after deleting several selected lines)
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || lastEditor !== me) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      if ((e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      if (k === "y" || e.shiftKey) undoRef.current.redo();
      else undoRef.current.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, me]);

  useLayoutEffect(() => {
    blocksRef.current = blocks;
    const req = focusReq.current;
    if (req) {
      const el = els.current.get(req.id);
      if (el) {
        focusReq.current = null;
        setCaret(el, req.offset === "end" ? readText(el).length : req.offset);
      }
    }
  });

  const focusBlock = (id: string, offset: number | "end") => {
    focusReq.current = { id, offset };
  };

  const setDrop = useCallback(
    (id: string | null) => {
      setFileDropId(id);
      onDropTarget?.(id);
    },
    [onDropTarget],
  );

  const update = useCallback(
    (id: string, patch: Partial<Block>) => setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b))),
    [setBlocks],
  );

  const pickFiles = (blockId: string) => {
    fileTarget.current = blockId;
    fileInput.current?.click();
  };

  const onInput = useCallback(
    (id: string, el: HTMLDivElement) => {
      const text = readText(el);
      const block = blocksRef.current.find((b) => b.id === id);
      if (!block) return;
      for (const [re, type] of SHORTCUTS) {
        if (type !== block.type && re.test(text)) {
          const sel = getSelectionOffsets(el);
          const stripped = text.replace(re, "");
          focusBlock(id, Math.max(0, (sel?.start ?? 2) - (text.length - stripped.length)));
          update(id, { type, content: stripped });
          return;
        }
      }
      nextIsTyping.current = id;
      update(id, { content: text });

      // Typing / at the start of a line or after a space opens the menu; what follows filters it
      if (readOnly) return;
      const caret = getSelectionOffsets(el)?.start ?? text.length;
      const open = slashRef.current;
      if (caret > 0 && text[caret - 1] === "/" && (caret === 1 || /\s/.test(text[caret - 2]))) {
        const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null;
        let r = range?.getBoundingClientRect();
        if (!r || (r.top === 0 && r.left === 0)) r = el.getBoundingClientRect();
        const up = r.bottom + 360 > window.innerHeight && r.top > 360;
        setSlash({ id, start: caret - 1, query: "", top: up ? r.top - 6 : r.bottom + 6, left: r.left, up, active: 0 });
      } else if (open && open.id === id) {
        const query = text.slice(open.start + 1, caret);
        if (caret <= open.start || text[open.start] !== "/" || query.length > 30 || !slashItems(query, variant).length) setSlash(null);
        else setSlash({ ...open, query, active: 0 });
      }
    },
    [update, readOnly, variant, setSlash],
  );

  /** Applies a / menu choice to its line and removes the "/words" that were typed */
  const applySlash = useCallback(
    (item: SlashItem) => {
      const s = slashRef.current;
      if (!s) return;
      setSlash(null);
      const b = blocksRef.current.find((x) => x.id === s.id);
      if (!b) return;
      const el = els.current.get(s.id);
      const text = el ? readText(el) : b.content;
      const end = Math.min(text.length, s.start + 1 + s.query.length);
      const rest = text.slice(0, s.start) + text.slice(end);
      if (item.patch.type === "images") {
        makeImagesRef.current(s.id, rest);
        return;
      }
      focusBlock(s.id, s.start);
      update(s.id, { ...item.patch, content: rest });
    },
    [update, setSlash],
  );

  const newBlockAfter = useCallback(
    (id: string, type: BlockType) => {
      const nb: Block = { id: uid(), type, content: "" };
      focusBlock(nb.id, 0);
      setBlocks((prev) => {
        const i = prev.findIndex((b) => b.id === id);
        return [...prev.slice(0, i + 1), nb, ...prev.slice(i + 1)];
      });
    },
    [setBlocks],
  );

  const onKeyDown = useCallback(
    (id: string, el: HTMLDivElement, e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.nativeEvent.isComposing) return;
      const list = blocksRef.current;
      const index = list.findIndex((b) => b.id === id);
      const block = list[index];
      if (!block) return;
      const text = readText(el);
      const sel = getSelectionOffsets(el) ?? { start: text.length, end: text.length };
      const collapsed = sel.start === sel.end;

      // Arrows, Enter and Escape drive the / menu while it's open
      const s = slashRef.current;
      if (s && s.id === id) {
        const items = slashItems(s.query, variant);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const d = e.key === "ArrowDown" ? 1 : -1;
          setSlash({ ...s, active: (s.active + d + items.length) % items.length });
          return;
        }
        if ((e.key === "Enter" || e.key === "Tab") && items[s.active]) {
          e.preventDefault();
          applySlash(items[s.active]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlash(null);
          return;
        }
      }

      // ⌘Z undo, ⇧⌘Z or ⌘Y redo: across lines (the browser's own undo only knows about one line)
      if (!readOnly && (e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
        e.preventDefault();
        if (e.key.toLowerCase() === "y" || e.shiftKey) undoRef.current.redo();
        else undoRef.current.undo();
        return;
      }

      // ⌘B makes the selected words bold (saved as **words**); ⌘I / ⌘U would only change the screen, so skip them
      if (!readOnly && (e.metaKey || e.ctrlKey) && ["b", "i", "u"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.key.toLowerCase() !== "b" || collapsed) return;
        const t = toggleBold(text, sel.start, sel.end);
        focusBlock(id, t.end);
        update(id, { content: t.text });
        return;
      }

      // ⌘→ adds a comment on this line, like clicking its comment button
      if (canComment && onOpenComments && (e.metaKey || e.ctrlKey) && e.key === "ArrowRight" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        onOpenComments(id, { newComment: true });
        return;
      }

      // ⌘K turns the selected words into a link
      if (!readOnly && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !collapsed) {
        e.preventDefault();
        const r = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
        setLinkBox({ id, start: sel.start, end: sel.end, top: (r?.bottom ?? 0) + 6, left: r?.left ?? 0 });
        return;
      }

      const startLineSel = (focus: string) => {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();
        el.blur();
        setLineSel({ anchor: id, focus });
      };
      if (!readOnly && e.shiftKey && e.key === "ArrowUp" && index > 0 && caretOnFirstLine(el) && sel.start === 0) {
        startLineSel(list[index - 1].id);
        return;
      }
      if (!readOnly && e.shiftKey && e.key === "ArrowDown" && index < list.length - 1 && caretOnLastLine(el) && sel.end === text.length) {
        startLineSel(list[index + 1].id);
        return;
      }
      if (!readOnly && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && list.length > 1 && sel.start === 0 && sel.end === text.length) {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();
        el.blur();
        setLineSel({ anchor: list[0].id, focus: list[list.length - 1].id });
        return;
      }

      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        focusBlock(id, sel.start + 1);
        update(id, { content: text.slice(0, sel.start) + "\n" + text.slice(sel.end) });
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (isList(block.type) && text === "" && variant === "script") {
          focusBlock(id, 0);
          update(id, { type: "p" });
          return;
        }
        // Enter on an empty colored line ends the colored block (like leaving a list)
        if (block.color && text === "" && !isList(block.type)) {
          focusBlock(id, 0);
          update(id, { color: null });
          return;
        }
        const nextType: BlockType = isList(block.type) ? block.type : "p";
        if (sel.start === 0 && collapsed && text !== "") {
          const above: Block = { id: uid(), type: nextType, content: "", color: block.color ?? null, textColor: block.textColor ?? null };
          focusBlock(id, 0);
          setBlocks((prev) => {
            const i = prev.findIndex((b) => b.id === id);
            return [...prev.slice(0, i), above, ...prev.slice(i)];
          });
          return;
        }
        // The new line keeps the color, so a colored block grows instead of starting a plain one
        const nb: Block = { id: uid(), type: nextType, content: text.slice(sel.end), color: block.color ?? null, textColor: block.textColor ?? null };
        focusBlock(nb.id, 0);
        setBlocks((prev) => {
          const i = prev.findIndex((b) => b.id === id);
          return [...prev.slice(0, i), { ...prev[i], content: text.slice(0, sel.start) }, nb, ...prev.slice(i + 1)];
        });
        return;
      }

      if (e.key === "Backspace" && collapsed && sel.start === 0) {
        if (block.type !== "p" && !(variant === "instructions" && block.type === "todo")) {
          e.preventDefault();
          focusBlock(id, 0);
          update(id, { type: "p" });
          return;
        }
        if (index > 0) {
          e.preventDefault();
          const prev = list[index - 1];
          focusBlock(prev.id, prev.content.length);
          setBlocks((all) =>
            all
              .map((b) =>
                b.id === prev.id
                  ? { ...b, content: b.content + text }
                  : b,
              )
              .filter((b) => b.id !== id),
          );
        }
        return;
      }

      if (e.key === "Delete" && collapsed && sel.start === text.length && index < list.length - 1) {
        e.preventDefault();
        const next = list[index + 1];
        focusBlock(id, text.length);
        setBlocks((all) =>
          all
            .map((b) =>
              b.id === id ? { ...b, content: text + next.content } : b,
            )
            .filter((b) => b.id !== next.id),
        );
        return;
      }

      const move = (target: Block | undefined, offset: number | "end") => {
        if (!target) return;
        e.preventDefault();
        const tel = els.current.get(target.id);
        if (tel) setCaret(tel, offset === "end" ? readText(tel).length : offset);
      };
      if (e.key === "ArrowUp" && !e.shiftKey && caretOnFirstLine(el)) move(list[index - 1], "end");
      else if (e.key === "ArrowDown" && !e.shiftKey && caretOnLastLine(el)) move(list[index + 1], 0);
      else if (e.key === "ArrowLeft" && !e.shiftKey && collapsed && sel.start === 0) move(list[index - 1], "end");
      else if (e.key === "ArrowRight" && !e.shiftKey && collapsed && sel.start === text.length) move(list[index + 1], 0);
    },
    [readOnly, setBlocks, update, variant, canComment, onOpenComments, setSlash, applySlash],
  );

  const onPaste = useCallback(
    (id: string, el: HTMLDivElement, e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const files = Array.from(e.clipboardData.files);
      if (files.length) {
        // Pictures pasted on an empty line become an images block; otherwise files go to a comment on the line
        if (canUpload && !readText(el).trim() && files.every((f) => f.type.startsWith("image/"))) {
          addImages(makeImagesRef.current(id, ""), files);
          return;
        }
        if (canUpload && onFiles) onFiles(id, files);
        return;
      }
      const pasted = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
      if (!pasted) return;
      const text = readText(el);
      const sel = getSelectionOffsets(el) ?? { start: text.length, end: text.length };
      const before = text.slice(0, sel.start);
      const after = text.slice(sel.end);
      const lines = pasted.split("\n");
      // Pasting a link over selected words links them (like Notion)
      if (lines.length === 1 && sel.end > sel.start && isUrl(pasted)) {
        const w = wrapLink(text, sel.start, sel.end, pasted);
        focusBlock(id, w.caret);
        update(id, { content: w.text });
        return;
      }
      if (lines.length === 1) {
        focusBlock(id, sel.start + pasted.length);
        update(id, { content: before + pasted + after });
        return;
      }
      const cur = blocksRef.current.find((b) => b.id === id);
      const rest = lines.slice(1).map((l) => {
        const parsed = parseLine(l);
        return {
          ...parsed,
          type: variant === "instructions" && parsed.type === "p" ? ("todo" as BlockType) : parsed.type,
          id: uid(),
          
        };
      });
      if (cur && isList(cur.type)) rest.forEach((r) => r.type === "p" && (r.type = cur.type));
      const last = rest[rest.length - 1];
      focusBlock(last.id, last.content.length);
      last.content += after;
      setBlocks((prev) => {
        const i = prev.findIndex((b) => b.id === id);
        return [...prev.slice(0, i), { ...prev[i], content: before + lines[0] }, ...rest, ...prev.slice(i + 1)];
      });
    },
    [canUpload, onFiles, setBlocks, update, variant, addImages],
  );

  const setColor = (id: string, color: BlockColor | null) => {
    update(id, { color });
    setMenuFor(null);
  };
  const setType = (id: string, type: BlockType) => {
    setMenuFor(null);
    if (type === "images") {
      makeImagesBlock(id, blocksRef.current.find((b) => b.id === id)?.content ?? "");
      return;
    }
    update(id, { type });
    focusBlock(id, "end");
  };
  const duplicate = (id: string) => {
    setMenuFor(null);
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const b = prev[i];
      const copy: Block = { ...b, id: uid(), source_block_id: null };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  };
  const deleteBlock = (id: string) => {
    setMenuFor(null);
    setBlocks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      return next.length ? next : [{ id: uid(), type: variant === "instructions" ? "todo" : "p", content: "" }];
    });
  };
  const moveBlock = (dragId: string, targetId: string, after: boolean) => {
    if (dragId === targetId) return;
    setBlocks((prev) => {
      const dragged = prev.find((b) => b.id === dragId);
      if (!dragged) return prev;
      const rest = prev.filter((b) => b.id !== dragId);
      const t = rest.findIndex((b) => b.id === targetId);
      const at = after ? t + 1 : t;
      return [...rest.slice(0, at), dragged, ...rest.slice(at)];
    });
  };

  useEffect(() => {
    if (!menuFor) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-popover]")) setMenuFor(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuFor]);

  // ---- Selecting several lines ----
  const selRange = (() => {
    if (!lineSel) return null;
    const a = blocks.findIndex((b) => b.id === lineSel.anchor);
    const f = blocks.findIndex((b) => b.id === lineSel.focus);
    if (a < 0 || f < 0) return null;
    return [Math.min(a, f), Math.max(a, f)] as const;
  })();
  const selectedIds = new Set(selRange ? blocks.slice(selRange[0], selRange[1] + 1).map((b) => b.id) : []);

  useEffect(() => {
    const up = () => {
      dragFrom.current = null;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  useEffect(() => {
    if (!lineSel) return;
    const list = blocksRef.current;
    const range = () => {
      const a = list.findIndex((b) => b.id === lineSel.anchor);
      const f = list.findIndex((b) => b.id === lineSel.focus);
      return [Math.min(a, f), Math.max(a, f), f] as const;
    };
    const selectedText = () => {
      const [lo, hi] = range();
      return list
        .slice(lo, hi + 1)
        .map((b) => (b.type === "bullet" ? `- ${b.content}` : b.type === "todo" ? `[${b.checked ? "x" : " "}] ${b.content}` : b.content))
        .join("\n");
    };
    const removeSelected = () => {
      const [lo, hi] = range();
      const ids = new Set(list.slice(lo, hi + 1).map((b) => b.id));
      const before = list[lo - 1];
      const after = list[hi + 1];
      const fresh: Block = { id: uid(), type: variant === "instructions" ? "todo" : "p", content: "" };
      if (before) focusBlock(before.id, "end");
      else if (after) focusBlock(after.id, 0);
      else focusBlock(fresh.id, 0);
      setBlocks((prev) => {
        const next = prev.filter((b) => !ids.has(b.id));
        return next.length ? next : [fresh];
      });
      setLineSel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") {
        setLineSel(null);
      } else if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const [, , f] = range();
        const next = list[Math.max(0, Math.min(list.length - 1, f + (e.key === "ArrowUp" ? -1 : 1)))];
        setLineSel({ anchor: lineSel.anchor, focus: next.id });
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const [lo, hi] = range();
        const target = e.key === "ArrowUp" ? list[lo] : list[hi];
        setLineSel(null);
        const el = els.current.get(target.id);
        if (el) setCaret(el, e.key === "ArrowUp" ? 0 : readText(el).length);
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setLineSel({ anchor: list[0].id, focus: list[list.length - 1].id });
      } else if (mod && (e.key.toLowerCase() === "c" || e.key.toLowerCase() === "x")) {
        e.preventDefault();
        void navigator.clipboard.writeText(selectedText());
        if (e.key.toLowerCase() === "x") removeSelected();
      } else if (!mod && e.key.length === 1) {
        setLineSel(null);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-line-selected]")) setLineSel(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [lineSel, setBlocks, variant]);

  const numbers = listNumbers(blocks);
  const muted = variant === "instructions";

  return (
    <div className="relative">
      {slash && <SlashMenu slash={slash} items={slashItems(slash.query, variant)} onPick={applySlash} onHover={(active) => setSlash({ ...slash, active })} />}
      {linkBox && (
        <LinkBox
          top={linkBox.top}
          left={linkBox.left}
          onCancel={() => {
            const box = linkBox;
            setLinkBox(null);
            const el = els.current.get(box.id);
            if (el) setCaret(el, box.end);
          }}
          onSave={(url) => {
            const box = linkBox;
            setLinkBox(null);
            const b = blocksRef.current.find((x) => x.id === box.id);
            if (!b) return;
            const w = wrapLink(b.content, box.start, box.end, url);
            focusBlock(box.id, w.caret);
            update(box.id, { content: w.text });
          }}
        />
      )}
      {blocks.map((b, index) => {
        const isLast = index === blocks.length - 1;
        const count = commentCounts?.[b.id] ?? 0;
        const open = activeId === b.id;
        const showPlaceholder = !readOnly && b.content === "" && (focusedId === b.id || (isLast && blocks.length === 1));
        const controlTop = b.type === "h1" && !muted ? "top-[6px]" : "top-[3px]";
        return (
          <div key={b.id} className={rowOuterClass(b.type, index, !!b.color && !!blocks[index - 1]?.color)}>
            <div
              data-row
              data-row-id={b.id}
              data-active-row={open ? "" : undefined}
              data-has-comments={count > 0 ? "" : undefined}
              data-line-selected={selectedIds.has(b.id) ? "" : undefined}
              onMouseDown={() => {
                if (!readOnly) dragFrom.current = b.id;
              }}
              onMouseEnter={(e) => {
                // Dragging from one line into another selects whole lines
                if (readOnly || !(e.buttons & 1) || !dragFrom.current) return;
                if (dragFrom.current === b.id && !lineSel) return;
                window.getSelection()?.removeAllRanges();
                (document.activeElement as HTMLElement | null)?.blur();
                setLineSel({ anchor: dragFrom.current, focus: b.id });
              }}
              className={`group/row relative ${b.color || selectedIds.has(b.id) || open ? "-mx-2 rounded-md px-2 py-[3px]" : "py-[3px]"} ${colorRunClass(blocks, index)} ${
                open ? "shadow-[0_0_0_1.5px_#efd88f]" : ""
              } ${
                mobile && (canComment || count > 0) ? (b.color ? "pr-10!" : "pr-9") : ""
              } ${
                fileDropId === b.id ? "outline-2 outline-offset-2 outline-dashed outline-(--c-l-2358d8)" : ""
              }`}
              style={{
                background:
                  fileDropId === b.id ? "var(--c-b-f5f8ff)" : selectedIds.has(b.id) ? "var(--c-b-dbe6fb)" : open ? (colorBg(b.color) ?? "var(--c-b-fdf3cf)") : colorBg(b.color),
              }}
              onDragOver={(e) => {
                if (readOnly) return;
                if (e.dataTransfer.types.includes("Files") && canUpload) {
                  e.preventDefault();
                  if (fileDropId !== b.id) setDrop(b.id);
                } else if (e.dataTransfer.types.includes("text/x-block")) {
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setMoveDrop({ id: b.id, after: e.clientY > r.top + r.height / 2 });
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  if (fileDropId === b.id) setDrop(null);
                }
              }}
              onDrop={(e) => {
                if (readOnly) return;
                if (e.dataTransfer.files.length && canUpload) {
                  e.preventDefault();
                  setDrop(null);
                  if (b.type === "images") addImages(b.id, Array.from(e.dataTransfer.files));
                  else onFiles?.(b.id, Array.from(e.dataTransfer.files));
                  return;
                }
                const dragId = e.dataTransfer.getData("text/x-block");
                if (dragId) {
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  moveBlock(dragId, b.id, e.clientY > r.top + r.height / 2);
                  setMoveDrop(null);
                }
              }}
            >
              {moveDrop?.id === b.id && (
                <div className={`pointer-events-none absolute left-0 right-0 h-0.5 bg-(--c-b-2358d8) ${moveDrop.after ? "-bottom-px" : "-top-px"}`} />
              )}
              {fileDropId === b.id && (
                <div className="pointer-events-none absolute -right-2 -top-[30px] z-10 inline-flex h-6 items-center gap-1.5 rounded-full bg-(--c-b-2358d8) px-2.5 text-[12px] font-medium text-white">
                  <IconClip size={12} />
                  {b.type === "images" ? "Drop to add images" : "Drop to attach to this block"}
                </div>
              )}

              {!readOnly && (
                <div
                  data-popover
                  className={`absolute -left-[58px] flex gap-0.5 ${controlTop} ${
                    menuFor === b.id ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover/row:opacity-100"
                  } ${b.color ? "-ml-2" : ""}`}
                >
                  <button
                    type="button"
                    aria-label="Add block below"
                    onClick={() => newBlockAfter(b.id, muted ? "todo" : "p")}
                    className="flex h-6 w-6 items-center justify-center rounded text-(--c-t-8a8a8a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b)"
                  >
                    <IconPlus />
                  </button>
                  <button
                    type="button"
                    draggable
                    aria-label="Drag or open block menu"
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/x-block", b.id);
                      e.dataTransfer.effectAllowed = "move";
                      const row = e.currentTarget.closest(".group\\/row");
                      if (row) e.dataTransfer.setDragImage(row, 0, 12);
                    }}
                    onDragEnd={() => setMoveDrop(null)}
                    onClick={() => setMenuFor(menuFor === b.id ? null : b.id)}
                    className="flex h-6 w-6 cursor-grab items-center justify-center rounded text-(--c-t-8a8a8a) hover:bg-(--c-b-f4f4f4)"
                  >
                    <IconGrip />
                  </button>
                  {menuFor === b.id && (
                    <BlockMenu
                      block={b}
                      variant={variant}
                      canUpload={!!canUpload}
                      onType={(t) => setType(b.id, t)}
                      onColor={(c) => setColor(b.id, c)}
                      onTextColor={(c) => {
                        update(b.id, { textColor: c });
                        setMenuFor(null);
                      }}
                      canComment={!!canComment && !!onOpenComments}
                      onAttach={() => {
                        setMenuFor(null);
                        pickFiles(b.id);
                      }}
                      onComment={() => {
                        setMenuFor(null);
                        onOpenComments?.(b.id, { newComment: true });
                      }}
                      onDuplicate={() => duplicate(b.id)}
                      onDelete={() => deleteBlock(b.id)}
                    />
                  )}
                </div>
              )}

              <div
                className={`flex ${textClass(b.type, variant)} ${muted ? "text-(--c-t-737373)" : ""}`}
                style={b.textColor ? { color: textHex(b.textColor) } : undefined}
              >
                <BlockPrefix
                  type={b.type}
                  n={numbers.get(b.id)}
                  checked={b.checked}
                  variant={variant}
                  onToggle={!readOnly || canToggleTodos ? () => update(b.id, { checked: !b.checked }) : undefined}
                />
                {b.type === "images" ? (
                  <ImageStrip
                    block={b}
                    uploading={uploading[b.id] ?? []}
                    readOnly={!!readOnly || !canUpload}
                    register={(el) => {
                      if (el) els.current.set(b.id, el);
                      else els.current.delete(b.id);
                    }}
                    onAdd={(files) => addImages(b.id, files)}
                    onRemove={(imgId) => update(b.id, { images: (b.images ?? []).filter((x) => x.id !== imgId) })}
                    onKey={(e) => {
                      const list = blocksRef.current;
                      const i = list.findIndex((x) => x.id === b.id);
                      if (e.key === "Enter") {
                        e.preventDefault();
                        newBlockAfter(b.id, "p");
                      } else if ((e.key === "Backspace" || e.key === "Delete") && !(b.images ?? []).length) {
                        e.preventDefault();
                        const prevB = list[i - 1];
                        if (prevB) focusBlock(prevB.id, "end");
                        setBlocks((all) => all.filter((x) => x.id !== b.id));
                      } else if (e.key === "ArrowUp" && list[i - 1]) {
                        e.preventDefault();
                        const t = els.current.get(list[i - 1].id);
                        if (t) setCaret(t, readText(t).length);
                      } else if (e.key === "ArrowDown" && list[i + 1]) {
                        e.preventDefault();
                        const t = els.current.get(list[i + 1].id);
                        if (t) setCaret(t, 0);
                      } else if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
                        e.preventDefault();
                        if (e.key.toLowerCase() === "y" || e.shiftKey) undoRef.current.redo();
                        else undoRef.current.undo();
                      }
                    }}
                    onFocus={() => {
                      setFocusedId(b.id);
                      onActivate?.(b.id);
                    }}
                  />
                ) : (
                <EditableText
                  id={b.id}
                  value={b.content}
                  readOnly={!!readOnly}
                  className={`min-w-0 flex-1 whitespace-pre-wrap break-words outline-none ${
                    b.type === "todo" && b.checked ? "line-through decoration-(--c-t-b5b5b5)" : ""
                  }`}
                  placeholder={showPlaceholder ? (b.type === "h1" ? "Heading" : placeholder) : ""}
                  register={(el) => {
                    if (el) els.current.set(b.id, el);
                    else els.current.delete(b.id);
                  }}
                  onInput={onInput}
                  onKeyDown={onKeyDown}
                  onPaste={onPaste}
                  onFocus={(id) => {
                    setFocusedId(id);
                    if (!id) setSlash(null);
                    if (id) onActivate?.(id);
                  }}
                />
                )}
              </div>

              {(count > 0 || (canComment && onOpenComments)) && (!mobile || count > 0 || open || focusedId === b.id) && (
                <div
                  className={`absolute ${mobile ? "right-0" : "-right-[64px]"} ${b.type === "h1" && !muted ? "top-[7px]" : "top-1"} ${
                    b.color && !mobile ? "-mr-2" : ""
                  }`}
                >
                  <button
                    type="button"
                    aria-label={count ? `${count} comments` : "Add a comment"}
                    aria-pressed={open}
                    // Phones: keep the keyboard/caret on the line while tapping
                    onPointerDown={mobile ? (e) => e.preventDefault() : undefined}
                    onMouseDown={mobile ? (e) => e.preventDefault() : undefined}
                    onClick={() => onOpenComments?.(b.id, count ? undefined : { newComment: true })}
                    className={`inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 text-[12px] hover:bg-(--c-b-f4f4f4) ${
                      open ? "bg-(--c-b-e7eefb) text-(--c-t-2358d8)" : count ? "bg-(--c-b-fdf3cf) text-(--c-t-7a5b00) hover:bg-(--c-b-f9e9b0)!" : "text-(--c-t-737373)"
                    } ${count || open || mobile ? "" : "opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"} ${
                      mobile ? "h-7 min-w-7 justify-center" : ""
                    }`}
                  >
                    {count ? <IconComment size={13} /> : <IconPlus size={13} />}
                    {count > 0 ? <span>{count}</span> : <IconComment size={13} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {footer}
      {!readOnly && (
        <div
          className={`${muted ? "h-1" : "min-h-[30vh]"} cursor-text`}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files") && canUpload) e.preventDefault();
          }}
          onDrop={(e) => {
            const last = blocksRef.current[blocksRef.current.length - 1];
            if (e.dataTransfer.files.length && canUpload && last) {
              e.preventDefault();
              onFiles?.(last.id, Array.from(e.dataTransfer.files));
            }
          }}
          onClick={() => {
            if (muted) return;
            const last = blocksRef.current[blocksRef.current.length - 1];
            if (last && last.content === "" && last.type === "p") {
              const el = els.current.get(last.id);
              if (el) setCaret(el, 0);
              return;
            }
            const nb: Block = { id: uid(), type: "p", content: "" };
            focusBlock(nb.id, 0);
            setBlocks((prev) => [...prev, nb]);
          }}
        />
      )}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length && fileTarget.current) onFiles?.(fileTarget.current, files);
        }}
      />
    </div>
  );
}

function BlockMenu({
  block,
  variant,
  canUpload,
  canComment,
  onType,
  onColor,
  onTextColor,
  onAttach,
  onComment,
  onDuplicate,
  onDelete,
}: {
  block: Block;
  variant: Variant;
  canUpload: boolean;
  canComment: boolean;
  onType: (t: BlockType) => void;
  onColor: (c: BlockColor | null) => void;
  onTextColor: (c: TextColor | null) => void;
  onAttach: () => void;
  onComment: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="menu"
      aria-label="Block options"
      className="absolute left-0 top-8 z-30 flex w-[248px] flex-col gap-0.5 rounded-xl border border-(--c-l-ebebeb) bg-(--c-b-ffffff) p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.10),0_2px_6px_rgba(0,0,0,0.05)]"
    >
      {variant === "script" && (
        <>
          <div className="px-2 pb-1 pt-2 text-[12px] text-(--c-t-737373)">Turn into</div>
          {TURN_INTO.map((t) => (
            <button
              key={t.type}
              type="button"
              role="menuitem"
              onClick={() => onType(t.type)}
              className={`flex h-[34px] w-full items-center gap-2.5 rounded-md px-2 text-left text-[14px] text-(--c-t-1b1b1b) hover:bg-(--c-b-f4f4f4) ${
                block.type === t.type ? "bg-(--c-b-f4f4f4)" : ""
              }`}
            >
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border border-(--c-l-e2e2e2) text-[12px] font-semibold text-(--c-t-6b6b6b)">
                {t.tile}
              </span>
              <span>{t.label}</span>
              {block.type === t.type && (
                <span className="ml-auto">
                  <IconCheck />
                </span>
              )}
            </button>
          ))}
          <div className="mx-1 my-1.5 h-px bg-(--c-b-ebebeb)" />
        </>
      )}
      <div className="px-2 py-1 text-[12px] text-(--c-t-737373)">Text color</div>
      <div className="flex gap-0.5 px-1.5 pb-2 pt-0.5">
        <button
          type="button"
          aria-label="Default text color"
          onClick={() => onTextColor(null)}
          className={`flex h-[26px] w-[24px] items-center justify-center rounded-md border text-[14px] font-semibold text-(--c-t-1b1b1b) ${!block.textColor ? "border-(--c-l-1b1b1b)" : "border-(--c-l-e0e0e0)"}`}
        >
          A
        </button>
        {TEXT_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-label={`${c.label} text`}
            title={c.label}
            onClick={() => onTextColor(c.value)}
            className={`flex h-[26px] w-[24px] items-center justify-center rounded-md border text-[14px] font-semibold ${block.textColor === c.value ? "border-(--c-l-1b1b1b)" : "border-(--c-l-e0e0e0)"}`}
            style={{ color: c.hex }}
          >
            A
          </button>
        ))}
      </div>
      <div className="px-2 py-1 text-[12px] text-(--c-t-737373)">Background</div>
      <div className="flex gap-2.5 px-2 pb-2.5 pt-1.5">
        <button
          type="button"
          aria-label="No color"
          onClick={() => onColor(null)}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-(--c-l-d6d6d6) bg-(--c-b-ffffff)"
          style={!block.color ? { boxShadow: "0 0 0 2px var(--c-b-ffffff), 0 0 0 4px var(--c-t-1b1b1b)" } : undefined}
        >
          <IconX size={14} color="var(--c-t-8a8a8a)" />
        </button>
        {BLOCK_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-label={c.label}
            onClick={() => onColor(c.value)}
            className="h-[30px] w-[30px] rounded-full border border-(--c-l-d6d6d6)"
            style={{
              background: c.bg,
              boxShadow: block.color === c.value ? "0 0 0 2px var(--c-b-ffffff), 0 0 0 4px var(--c-t-1b1b1b)" : undefined,
            }}
          />
        ))}
      </div>
      <div className="mx-1 mb-1.5 mt-0.5 h-px bg-(--c-b-ebebeb)" />
      {canUpload && (
        <MenuButton icon={<IconClip size={18} />} onClick={onAttach}>
          Attach file
        </MenuButton>
      )}
      {canComment && (
        <MenuButton icon={<IconComment size={18} />} onClick={onComment}>
          Add comment
        </MenuButton>
      )}
      <MenuButton icon={<IconCopy size={18} />} onClick={onDuplicate}>
        Duplicate
      </MenuButton>
      <MenuButton icon={<IconTrash size={18} color="var(--c-t-b42318)" />} onClick={onDelete} danger>
        Delete
      </MenuButton>
    </div>
  );
}

function MenuButton({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex h-[34px] w-full items-center gap-2.5 rounded-md px-2 text-left text-[14px] hover:bg-(--c-b-f4f4f4) ${
        danger ? "text-(--c-t-b42318)" : "text-(--c-t-1b1b1b)"
      }`}
    >
      <span className={`inline-flex ${danger ? "" : "text-(--c-t-6b6b6b)"}`}>{icon}</span>
      <span>{children}</span>
    </button>
  );
}

/** The small "paste a link" box that ⌘K opens under the selected words. */
function SlashMenu({
  slash,
  items,
  onPick,
  onHover,
}: {
  slash: { query: string; top: number; left: number; up: boolean; active: number };
  items: SlashItem[];
  onPick: (item: SlashItem) => void;
  onHover: (index: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${slash.active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [slash.active]);
  return (
    <div
      ref={list}
      role="listbox"
      aria-label="Change this line"
      // Keep the caret in the line while clicking
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-50 max-h-[340px] w-[260px] overflow-y-auto rounded-xl border border-(--c-l-e5e5e5) bg-(--c-b-ffffff) p-1 shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
      style={{
        top: slash.up ? undefined : slash.top,
        bottom: slash.up ? (typeof window === "undefined" ? 0 : window.innerHeight - slash.top) : undefined,
        left: Math.max(12, Math.min(slash.left, (typeof window === "undefined" ? 800 : window.innerWidth) - 272)),
      }}
    >
      {items.map((it, i) => (
        <div key={it.key}>
          {(i === 0 || items[i - 1].group !== it.group) && (
            <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.05em] text-(--c-t-9a9a9a)">{it.group}</div>
          )}
          <button
            type="button"
            role="option"
            aria-selected={i === slash.active}
            data-index={i}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(it)}
            className={`flex h-[36px] w-full items-center gap-2.5 rounded-md px-2 text-left text-[14px] text-(--c-t-1b1b1b) ${i === slash.active ? "bg-(--c-b-f1f1ef)" : ""}`}
          >
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border border-(--c-l-e2e2e2) bg-(--c-b-ffffff) text-[12px] font-semibold text-(--c-t-6b6b6b)">
              {it.tile}
            </span>
            <span>{it.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

function LinkBox({ top, left, onSave, onCancel }: { top: number; left: number; onSave: (url: string) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const ok = /^https?:\/\/\S+$/i.test(url.trim()) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(url.trim());
  const save = () => {
    const u = url.trim();
    if (!ok) return;
    onSave(/^https?:\/\//i.test(u) ? u : `https://${u}`);
  };
  return (
    <div
      className="fixed z-50 flex w-[320px] max-w-[calc(100vw-24px)] items-center gap-1.5 rounded-xl border border-(--c-l-e5e5e5) bg-(--c-b-ffffff) p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
      style={{ top, left: Math.max(12, Math.min(left, (typeof window === "undefined" ? 800 : window.innerWidth) - 332)) }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        id="script-link-url"
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") onCancel();
        }}
        onBlur={onCancel}
        placeholder="Paste a link"
        aria-label="Link"
        className="h-8 min-w-0 flex-1 rounded-lg px-2 text-[14px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a)"
      />
      <button
        type="button"
        disabled={!ok}
        onMouseDown={(e) => e.preventDefault()}
        onClick={save}
        className="h-8 rounded-lg bg-(--c-b-1b1b1b) px-3 text-[13px] font-medium text-(--c-on-ink) disabled:opacity-30"
      >
        Link
      </button>
    </div>
  );
}

type EditableProps = {
  id: string;
  value: string;
  readOnly: boolean;
  className: string;
  placeholder: string;
  register: (el: HTMLDivElement | null) => void;
  onInput: (id: string, el: HTMLDivElement) => void;
  onKeyDown: (id: string, el: HTMLDivElement, e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (id: string, el: HTMLDivElement, e: React.ClipboardEvent<HTMLDivElement>) => void;
  onFocus: (id: string | null) => void;
};

const EditableText = memo(function EditableText({
  id,
  value,
  readOnly,
  className,
  placeholder,
  register,
  onInput,
  onKeyDown,
  onPaste,
  onFocus,
}: EditableProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);
  // Lines with links are drawn with real links unless you're typing in them
  const segs = !editing ? linkSegments(value) : null;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (segs) {
      if (el.dataset.rich !== value) {
        renderLinks(el, segs);
        el.dataset.rich = value;
      }
    } else if (el.dataset.rich !== undefined) {
      delete el.dataset.rich;
      writeText(el, value);
    } else if (readText(el) !== value) writeText(el, value);
  });

  /** Switch a drawn line back to plain text for editing, keeping the caret where it was */
  const toPlain = (el: HTMLDivElement, shownOffset: number | null) => {
    if (el.dataset.rich === undefined) return;
    const s = linkSegments(value);
    delete el.dataset.rich;
    writeText(el, value);
    if (s && shownOffset !== null) setCaret(el, toRawOffset(s, shownOffset));
  };

  return (
    <div
      ref={(el) => {
        ref.current = el;
        register(el);
      }}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck
      role={readOnly ? undefined : "textbox"}
      aria-multiline={readOnly ? undefined : true}
      data-placeholder={placeholder}
      data-empty={value === "" ? "true" : "false"}
      className={`${className} editable`}
      onMouseDown={(e) => {
        const el = e.currentTarget;
        const link = (e.target as HTMLElement).closest("a[data-script-link]") as HTMLAnchorElement | null;
        // Clicking a link opens it; clicking elsewhere on the line edits it
        if (link) {
          e.preventDefault();
          window.open(link.href, "_blank", "noopener,noreferrer");
          return;
        }
        if (readOnly || el.dataset.rich === undefined) return;
        e.preventDefault();
        const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
        const pos = doc.caretPositionFromPoint?.(e.clientX, e.clientY);
        const r = pos ? null : document.caretRangeFromPoint?.(e.clientX, e.clientY);
        const node = pos?.offsetNode ?? r?.startContainer;
        const off = pos?.offset ?? r?.startOffset ?? 0;
        let shown = readText(el).length;
        if (node && el.contains(node)) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.setEnd(node, off);
          shown = range.toString().length;
        }
        setEditing(true);
        toPlain(el, shown);
      }}
      onInput={(e) => onInput(id, e.currentTarget)}
      onKeyDown={(e) => onKeyDown(id, e.currentTarget, e)}
      onPaste={(e) => onPaste(id, e.currentTarget, e)}
      onFocus={(e) => {
        if (!readOnly) {
          setEditing(true);
          // Focus from the keyboard (arrows, Enter): show plain text before the caret is placed
          toPlain(e.currentTarget, null);
        }
        onFocus(id);
      }}
      onBlur={() => {
        setEditing(false);
        onFocus(null);
      }}
    />
  );
});

/**
 * An images block: small pictures side by side (about three lines tall), no frame or background, so
 * transparent logos sit right on the page. Paste (⌘V), drop, or click + to add; hover a picture for ×.
 */
function ImageStrip({
  block,
  uploading,
  readOnly,
  register,
  onAdd,
  onRemove,
  onKey,
  onFocus,
}: {
  block: Block;
  uploading: Attachment[];
  readOnly: boolean;
  register: (el: HTMLDivElement | null) => void;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onKey: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus: () => void;
}) {
  const pick = useRef<HTMLInputElement>(null);
  const images = [...(block.images ?? []), ...uploading];
  return (
    <div
      ref={register}
      tabIndex={readOnly ? undefined : 0}
      onKeyDown={readOnly ? undefined : onKey}
      onFocus={readOnly ? undefined : onFocus}
      onPaste={
        readOnly
          ? undefined
          : (e) => {
              const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (files.length) {
                e.preventDefault();
                onAdd(files);
              }
            }
      }
      aria-label="Images"
      className="group/images flex min-h-[26px] min-w-0 flex-1 flex-wrap items-end gap-3 rounded-md py-1 outline-none focus-visible:ring-2 focus-visible:ring-(--c-l-2358d8)"
    >
      {images.map((a) => (
        <span key={a.id} className="group/img relative inline-flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.url ?? ""}
            alt={a.name ?? ""}
            draggable={false}
            className={`block h-[80px] w-auto max-w-[240px] object-contain ${a.progress !== undefined ? "opacity-40" : ""}`}
          />
          {!readOnly && a.progress === undefined && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onRemove(a.id)}
              aria-label={`Remove ${a.name ?? "image"}`}
              className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-(--c-b-1b1b1b) text-(--c-on-ink) shadow group-hover/img:flex"
            >
              <IconX size={11} />
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        <>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick.current?.click()}
            aria-label="Add images"
            title="Add images (or paste / drop them here)"
            className={`flex items-center justify-center gap-1.5 rounded-lg text-[13px] text-(--c-t-9a9a9a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b) ${
              images.length ? "h-[80px] w-10 opacity-0 group-hover/images:opacity-100 group-focus-within/images:opacity-100" : "h-[80px] border border-dashed border-(--c-l-dcdcdc) px-4"
            }`}
          >
            <IconPlus size={14} />
            {!images.length && "Add images · paste or drop them here"}
          </button>
          <input
            ref={pick}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) onAdd(files);
            }}
          />
        </>
      )}
    </div>
  );
}
