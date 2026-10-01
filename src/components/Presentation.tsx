"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { colorBg, textHex, type Attachment, type Block, type Comment } from "@/lib/types";
import { linkSegments } from "@/lib/scriptLinks";
import { listNumbers } from "@/lib/util";
import { LinkCard, linkCardsIn } from "./LinkCard";
import { MediaViewer } from "./Attachments";

/**
 * Presentation mode: the script full screen, big and calm, for showing an outline while filming.
 * Click a line (or step with ↑/↓): it lights up yellow and its comments slide open right underneath,
 * with tweets, videos and images. Read-only: nothing here changes the script.
 */
export function Presentation({ title, blocks, comments, onClose }: { title: string; blocks: Block[]; comments: Comment[]; onClose: () => void }) {
  const byKey = new Map<string, Comment[]>();
  for (const c of comments) if (c.blockKey) byKey.set(c.blockKey, [...(byKey.get(c.blockKey) ?? []), c]);
  const commented = blocks.filter((b) => byKey.has(b.id)).map((b) => b.id);
  const numbers = listNumbers(blocks);

  const root = useRef<HTMLDivElement>(null);
  const lineEls = useRef(new Map<string, HTMLElement>());
  const [active, setActive] = useState<string | null>(null);
  // The line whose notes are closing, so they stay rendered while they slide shut
  const [leaving, setLeaving] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const stepAt = useRef(-1);
  const [viewing, setViewing] = useState<{ images: Attachment[]; index: number } | null>(null);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 180);
  }, [onClose]);

  // Fills the browser window (not the computer's screen), so tabs and the browser stay usable.
  // The page underneath doesn't scroll while presenting.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setOpen = (key: string | null) => {
    setActive((cur) => {
      if (cur && cur !== key) {
        setLeaving(cur);
        if (leaveTimer.current) clearTimeout(leaveTimer.current);
        leaveTimer.current = setTimeout(() => setLeaving(null), 380);
      }
      return key;
    });
  };
  // Click a line to open its notes; click the line again to close them
  const toggle = (key: string) => setOpen(active === key ? null : key);

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
      setOpen(next);
      setTimeout(() => lineEls.current.get(next)?.scrollIntoView({ block: "center", behavior: "smooth" }), 40);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
          {commented.length ? "Click a highlighted line to see its notes · ↑ ↓ to step through · Esc to exit" : "Esc to exit"}
        </span>
        <button type="button" onClick={close} className="rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-white/20">
          Exit
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[900px] px-8 pb-[40vh] pt-[14vh]">
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
                onClick={
                  has
                    ? (e) => {
                        // Clicks inside the open notes (links, videos, text) don't close them
                        if (!(e.target as HTMLElement).closest("[data-notes]")) toggle(b.id);
                      }
                    : undefined
                }
                className={`transition-opacity duration-300 ${has ? "cursor-pointer" : ""} ${b.type === "h1" ? "mb-2 mt-10" : b.type === "bullet" || b.type === "number" || b.type === "todo" ? "my-0.5" : "my-1.5"} ${active && !on ? "opacity-40" : "opacity-100"}`}
              >
              <div
                style={{ animationDelay: `${Math.min(i, 24) * 28}ms`, ...(bg && !on ? { background: bg } : {}) }}
                className={`relative flex animate-[pres-line_480ms_cubic-bezier(0.2,0,0,1)_both] gap-3 rounded-xl transition-[background-color,box-shadow,padding] duration-300 ${
                  on ? "bg-[#f5c542]/[0.16] px-4 py-1.5 shadow-[inset_0_0_0_1px_rgba(245,197,66,0.35)]" : bg ? "px-4 py-1.5" : ""
                }`}
              >
                {b.type === "images" && (
                  <div className="flex min-w-0 flex-1 flex-wrap items-end gap-5 py-1">
                    {(b.images ?? []).map((a, n) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={a.id}
                        src={a.url ?? ""}
                        alt={a.name ?? ""}
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewing({ images: b.images ?? [], index: n });
                        }}
                        className="block h-[117px] w-auto max-w-[360px] cursor-zoom-in object-contain"
                      />
                    ))}
                  </div>
                )}
                {/* List markers at the same size and line height as the text, so they sit on its first line */}
                {b.type === "bullet" && (
                  <span aria-hidden="true" className="flex h-[39px] w-8 shrink-0 items-center justify-center">
                    <span className="h-[7px] w-[7px] rounded-full bg-[#e6e6e6]" />
                  </span>
                )}
                {b.type === "number" && (
                  <span aria-hidden="true" className="w-8 shrink-0 select-none text-right text-[26px] leading-[1.5] tabular-nums text-[#e6e6e6]">
                    {numbers.get(b.id)}.
                  </span>
                )}
                {b.type === "todo" && (
                  <span className="flex h-[39px] w-8 shrink-0 items-center justify-center">
                    <span className={`h-[20px] w-[20px] rounded-[5px] border-2 ${b.checked ? "border-[#8a8a8a] bg-[#8a8a8a]" : "border-[#8a8a8a]"}`} />
                  </span>
                )}
                {b.type !== "images" && <p
                  className={`m-0 min-w-0 flex-1 whitespace-pre-wrap break-words ${
                    b.type === "h1" ? "text-[34px] font-semibold leading-[1.25] tracking-[-0.01em] text-white" : "text-[26px] leading-[1.5] text-[#dedede]"
                  } ${b.checked ? "line-through opacity-50" : ""} ${has ? "decoration-[#f5c542]/40 decoration-2 underline-offset-[6px] [text-decoration-line:underline]" : ""}`}
                  style={b.textColor ? { color: textHex(b.textColor) } : undefined}
                >
                  {rich(b.content) || " "}
                </p>}
              </div>
              {has && (
                // Slides open underneath the line (height animates from 0), pushing the next lines down
                <div className={`grid transition-[grid-template-rows,opacity] duration-[360ms] ease-[cubic-bezier(0.2,0,0,1)] ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="min-h-0 overflow-hidden">
                    {(on || leaving === b.id) && <Notes comments={byKey.get(b.id)!} open={on} />}
                  </div>
                </div>
              )}
              </div>
            );
          })}
        </div>
      </div>

      {viewing && (
        <MediaViewer items={viewing.images} index={viewing.index} onIndex={(index) => setViewing({ ...viewing, index })} onClose={() => setViewing(null)} />
      )}

      <style>{`
        @keyframes pres-in { from { opacity: 0; transform: scale(1.015) } to { opacity: 1; transform: none } }
        @keyframes pres-out { to { opacity: 0; transform: scale(1.01) } }
        @keyframes pres-line { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes pres-notes { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: none } }
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

/** A line's comments, shown right under it: notes, then tweets, videos and images. */
function Notes({ comments, open }: { comments: Comment[]; open: boolean }) {
  const media: Attachment[] = comments.flatMap((c) => c.attachments.filter((a) => a.url && a.kind !== "link"));
  return (
    <div
      data-notes
      className={`mb-3 mt-2 cursor-auto rounded-2xl bg-[#1c1c1e] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.06] ${
        open ? "animate-[pres-notes_380ms_cubic-bezier(0.2,0,0,1)_both]" : ""
      }`}
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
