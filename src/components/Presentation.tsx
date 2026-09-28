"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { colorBg, textHex, type Attachment, type Block, type Comment } from "@/lib/types";
import { linkSegments } from "@/lib/scriptLinks";
import { listNumbers } from "@/lib/util";
import { LinkCard, linkCardsIn } from "./LinkCard";

/**
 * Presentation mode: the script full screen, big and calm, for showing an outline while filming.
 * Hover a line (or step with ↑/↓) and its comments float up beside it, with tweets, videos and images.
 * Read-only: nothing here changes the script.
 */
export function Presentation({ title, blocks, comments, onClose }: { title: string; blocks: Block[]; comments: Comment[]; onClose: () => void }) {
  const byKey = new Map<string, Comment[]>();
  for (const c of comments) if (c.blockKey) byKey.set(c.blockKey, [...(byKey.get(c.blockKey) ?? []), c]);
  const commented = blocks.filter((b) => byKey.has(b.id)).map((b) => b.id);
  const numbers = listNumbers(blocks);

  const root = useRef<HTMLDivElement>(null);
  const lineEls = useRef(new Map<string, HTMLElement>());
  const [active, setActive] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [closing, setClosing] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepAt = useRef(-1);

  const close = useCallback(() => {
    setClosing(true);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setTimeout(onClose, 180);
  }, [onClose]);

  // Real full screen when the browser allows it; leaving full screen (Esc) leaves presentation mode
  useEffect(() => {
    const el = root.current;
    if (el?.requestFullscreen) void el.requestFullscreen().catch(() => {});
    const onChange = () => {
      if (!document.fullscreenElement) close();
    };
    document.addEventListener("fullscreenchange", onChange);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.body.style.overflow = prev;
    };
  }, [close]);

  const show = (key: string) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const el = lineEls.current.get(key);
    if (!el) return;
    setActive(key);
    setAnchor(el.getBoundingClientRect());
  };
  const hideSoon = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(null), 220);
  };
  const keep = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  // ↑/↓ (or j/k) step through the lines that have comments; Esc exits
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      const down = e.key === "ArrowDown" || e.key === "j";
      const up = e.key === "ArrowUp" || e.key === "k";
      if (!down && !up) return;
      if (!commented.length) return;
      e.preventDefault();
      const i = active && commented.indexOf(active) !== stepAt.current ? commented.indexOf(active) : stepAt.current;
      const n = down ? Math.min(i + 1, commented.length - 1) : Math.max(i - 1, 0);
      stepAt.current = n;
      const next = commented[n];
      lineEls.current.get(next)?.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => show(next), 380);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Keep the bubble next to its line while scrolling
  const onScroll = () => {
    if (active) {
      const el = lineEls.current.get(active);
      if (el) setAnchor(el.getBoundingClientRect());
    }
  };

  return (
    // Always the dark stage, whatever the app's theme
    <div
      ref={root}
      className={`dark fixed inset-0 z-[90] flex flex-col bg-[#101011] text-[#ececec] ${closing ? "animate-[pres-out_180ms_ease-in_forwards]" : "animate-[pres-in_260ms_cubic-bezier(0.2,0,0,1)]"}`}
      role="dialog"
      aria-label={`Presenting ${title}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-4 opacity-60 transition-opacity hover:opacity-100 [&>*]:pointer-events-auto">
        <span className="text-[13px] text-[#8a8a8a]">
          {commented.length ? "Hover a line to see its notes · ↑ ↓ to step through · Esc to exit" : "Esc to exit"}
        </span>
        <button type="button" onClick={close} className="rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-white/20">
          Exit
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" onScroll={onScroll}>
        <div className="mx-auto w-full max-w-[880px] px-8 pb-[40vh] pt-[14vh] lg:ml-[max(4rem,calc((100%-880px)/2-200px))]">
          <h1 className="m-0 mb-12 animate-[pres-line_500ms_cubic-bezier(0.2,0,0,1)_both] text-[44px] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
            {title || "Untitled"}
          </h1>
          {blocks.map((b, i) => {
            const has = byKey.has(b.id);
            const on = active === b.id;
            const bg = colorBg(b.color);
            return (
              <div
                key={b.id}
                ref={(el) => {
                  if (el) lineEls.current.set(b.id, el);
                  else lineEls.current.delete(b.id);
                }}
                onMouseEnter={has ? () => show(b.id) : undefined}
                onMouseLeave={has ? hideSoon : undefined}
                className={`transition-[opacity,transform] duration-300 ${b.type === "h1" ? "mb-2 mt-10" : "my-1.5"} ${active && !on ? "opacity-35" : "opacity-100"} ${
                  on ? "translate-x-1" : ""
                }`}
              >
              <div
                style={{ animationDelay: `${Math.min(i, 24) * 28}ms`, ...(bg ? { background: bg } : {}) }}
                className={`relative flex animate-[pres-line_480ms_cubic-bezier(0.2,0,0,1)_both] gap-3 rounded-xl ${bg ? "px-4 py-1.5" : ""}`}
              >
                {has && (
                  <span
                    aria-hidden="true"
                    className={`absolute -left-6 top-[0.62em] h-2 w-2 rounded-full transition-all duration-300 ${on ? "scale-125 bg-[#f5c542]" : "bg-[#f5c542]/60"}`}
                  />
                )}
                {b.type === "bullet" && <span className="select-none text-[#6a6a6a]">•</span>}
                {b.type === "number" && <span className="select-none tabular-nums text-[#6a6a6a]">{numbers.get(b.id)}.</span>}
                {b.type === "todo" && <span className={`mt-[0.35em] h-[0.8em] w-[0.8em] shrink-0 rounded-[4px] border-2 ${b.checked ? "border-[#6a6a6a] bg-[#6a6a6a]" : "border-[#6a6a6a]"}`} />}
                <p
                  className={`m-0 min-w-0 flex-1 whitespace-pre-wrap break-words ${
                    b.type === "h1" ? "text-[34px] font-semibold leading-[1.25] tracking-[-0.01em] text-white" : "text-[26px] leading-[1.5] text-[#dedede]"
                  } ${b.checked ? "line-through opacity-50" : ""} ${has ? "decoration-[#f5c542]/40 decoration-2 underline-offset-[6px] [text-decoration-line:underline]" : ""}`}
                  style={b.textColor ? { color: textHex(b.textColor) } : undefined}
                >
                  {rich(b.content) || " "}
                </p>
              </div>
              </div>
            );
          })}
        </div>
      </div>

      {active && anchor && byKey.get(active) && (
        <Bubble key={active} anchor={anchor} comments={byKey.get(active)!} onEnter={keep} onLeave={hideSoon} />
      )}

      <style>{`
        @keyframes pres-in { from { opacity: 0; transform: scale(1.015) } to { opacity: 1; transform: none } }
        @keyframes pres-out { to { opacity: 0; transform: scale(1.01) } }
        @keyframes pres-line { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes pres-pop { from { opacity: 0; transform: translateY(8px) scale(0.97) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  );
}

/** Links and bold in a line, as the editor shows them */
function rich(text: string): ReactNode {
  const segs = linkSegments(text);
  if (!segs) return text;
  return segs.map((s, i) =>
    s.href ? (
      <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" className="text-[#8fb4ff] underline decoration-[#8fb4ff]/40 underline-offset-4">
        {s.text}
      </a>
    ) : s.bold ? (
      <strong key={i} className="font-semibold text-white">
        {s.text}
      </strong>
    ) : (
      <span key={i}>{s.text}</span>
    ),
  );
}

/** The floating card beside a line: its comments, with tweets, videos and images. */
function Bubble({ anchor, comments, onEnter, onLeave }: { anchor: DOMRect; comments: Comment[]; onEnter: () => void; onLeave: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = ref.current?.offsetHeight ?? 300;
    const beside = vw - anchor.right > 400;
    const width = beside ? Math.min(460, vw - anchor.right - 56) : Math.min(560, vw - 32);
    const left = beside ? anchor.right + 32 : Math.max(16, Math.min(anchor.left, vw - width - 16));
    let top = beside ? anchor.top - 8 : anchor.bottom + 12;
    top = Math.max(16, Math.min(top, vh - h - 16));
    setPos({ top, left, width });
  }, [anchor]);

  const media: Attachment[] = comments.flatMap((c) => c.attachments.filter((a) => a.url && a.kind !== "link"));
  return (
    <div
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="fixed z-20 max-h-[calc(100vh-32px)] animate-[pres-pop_260ms_cubic-bezier(0.2,0,0,1)] overflow-y-auto rounded-2xl bg-[#1c1c1e]/95 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)] ring-1 ring-white/10 backdrop-blur-xl"
      style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: "hidden", top: 0, left: 0 }}
    >
      <div className="flex flex-col gap-4">
        {comments.map((c) => {
          const cards = [...linkCardsIn(c.text), ...c.attachments.filter((a) => a.kind === "link" && a.url && linkCardsIn(a.url!).length).map((a) => a.url!)];
          const unique = [...new Set(cards)];
          return (
            <div key={c.id} className="flex flex-col gap-2.5">
              <div className="text-[12px] font-medium uppercase tracking-[0.06em] text-[#8a8a8a]">{c.agent ? `${c.authorName ?? "Agent"} · agent` : (c.authorName ?? "Note")}</div>
              {c.text.trim() && <p className="m-0 whitespace-pre-wrap break-words text-[17px] leading-[1.5] text-[#f0f0f0]">{c.text.replace(/https?:\/\/\S+/g, (u) => (unique.some((x) => u.startsWith(x)) ? "" : u)).trim() || c.text}</p>}
              {unique.map((u) => (
                <LinkCard key={u} url={u} />
              ))}
            </div>
          );
        })}
        {media.length > 0 && (
          <div className={`grid gap-2 ${media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {media.map((a) =>
              a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.id} src={a.url!} alt={a.name ?? ""} className="max-h-[320px] w-full rounded-xl bg-black object-contain" />
              ) : a.kind === "video" ? (
                <video key={a.id} src={a.url!} autoPlay muted loop playsInline controls className="max-h-[320px] w-full rounded-xl bg-black" />
              ) : (
                <a key={a.id} href={a.url!} target="_blank" rel="noopener noreferrer" className="truncate rounded-xl bg-white/5 px-3 py-2.5 text-[13px] text-[#c4c4c4] no-underline hover:bg-white/10">
                  {a.name ?? "File"}
                </a>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
