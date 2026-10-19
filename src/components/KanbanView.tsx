"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FormatIcon } from "./FormatIcon";
import { PartnerLogo } from "./VideoMeta";
import { IconPlus } from "./icons";
import {
  FORMATS,
  SPONSORSHIPS,
  STATUSES,
  isPaidSponsor,
  statusOf,
  type Sponsorship,
  type VideoFormat,
  type VideoStatus,
} from "@/lib/types";

export type KanbanVideo = {
  _id: string;
  title: string;
  status: string;
  format: VideoFormat;
  liveDate: string | null;
  sponsored?: string;
  partnerId?: string | null;
  updatedAt: number;
  /** Its place in its column, set by dragging */
  kanbanOrder?: number;
};

type Partner = { name: string; logoUrl: string | null };

/** Idea and Upcoming sit back a little so the eye goes to what's being made */
const QUIET: VideoStatus[] = ["idea", "upcoming"];

/**
 * Scripts as a board, left to right through the pipeline: Idea, Upcoming, In production, Sent to editor,
 * Posted. Drag a card to another column to change its status.
 */
export function KanbanView({
  videos,
  partnerOf,
  onReorder,
  onNew,
}: {
  videos: KanbanVideo[];
  partnerOf: (id: string | null | undefined) => Partner | undefined;
  /** A column's cards in their new order (top first), after `moved` was dropped into it */
  onReorder: (status: VideoStatus, ids: string[], moved: string) => void;
  /** Makes a script in a column from the quick New card; resolves with its id */
  onNew: (status: VideoStatus, details: NewDetails) => Promise<string>;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  // Where cards were just dropped, shown right away (the save takes a moment to come back)
  const [moves, setMoves] = useState<Record<string, VideoStatus>>({});
  /** The column with the quick New card open */
  const [composing, setComposing] = useState<VideoStatus | null>(null);
  // A column's new order, shown right away until the saved order comes back
  const [orders, setOrders] = useState<Partial<Record<VideoStatus, string[]>>>(
    {},
  );
  /** Where the dragged card would land: the column and the slot (0 = top) */
  const [slot, setSlot] = useState<{
    status: VideoStatus;
    index: number;
  } | null>(null);
  useEffect(() => {
    // Forget a drop once the saved status has arrived
    const done = Object.entries(moves).filter(([id, st]) => {
      const v = videos.find((x) => x._id === id);
      return !v || statusOf(v.status).value === st;
    });
    if (done.length)
      setMoves((m) => {
        const next = { ...m };
        for (const [id] of done) delete next[id];
        return next;
      });
  }, [videos, moves]);
  useEffect(() => {
    // Forget a column's shown order once the saved one matches it
    const done = (Object.keys(orders) as VideoStatus[]).filter((st) => {
      const want = orders[st]!;
      const saved = videos.filter((v) => want.includes(v._id));
      return saved.every((v) => v.kanbanOrder === want.indexOf(v._id));
    });
    if (done.length)
      setOrders((o) => {
        const next = { ...o };
        for (const st of done) delete next[st];
        return next;
      });
  }, [videos, orders]);
  const [over, setOver] = useState<VideoStatus | null>(null);
  const [allPosted, setAllPosted] = useState(false);
  // Opens with In production at the left edge; Idea and Upcoming are a scroll to the left
  const scroller = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  // While In production is still at the left edge, keep it there when the window changes size
  const atProd = useRef(true);
  const prodOffset = () => {
    const box = scroller.current;
    const prod = box?.querySelector<HTMLElement>(
      'section[data-status="inProduction"]',
    );
    if (!box || !prod) return 0;
    return (
      prod.getBoundingClientRect().left -
      box.getBoundingClientRect().left -
      parseFloat(getComputedStyle(box).paddingLeft)
    );
  };
  // Room after Posted so In production can sit at the left edge even on wide screens
  const [tail, setTail] = useState<number | null>(null);
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const measure = () => {
      const prod = box.querySelector<HTMLElement>(
        'section[data-status="inProduction"]',
      );
      const last = box.querySelector<HTMLElement>(
        'section[data-status="done"]',
      );
      if (!prod || !last) return;
      const cs = getComputedStyle(box);
      const room =
        box.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      setTail(
        Math.max(
          0,
          room - (last.offsetLeft + last.offsetWidth - prod.offsetLeft) - 16,
        ),
      );
      if (placed.current && atProd.current)
        requestAnimationFrame(() => box && (box.scrollLeft += prodOffset()));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const box = scroller.current;
    const prod = box?.querySelector<HTMLElement>(
      'section[data-status="inProduction"]',
    );
    if (!box || !prod || placed.current || tail === null) return;
    placed.current = true;
    box.scrollLeft += prodOffset();
  }, [tail]);

  const columns = STATUSES.map((s) => {
    const list = videos.filter(
      (v) => (moves[v._id] ?? statusOf(v.status).value) === s.value,
    );
    const shownOrder = orders[s.value];
    // Cards keep the order you dragged them into; ones never placed go after them: dated scripts first, soonest
    // first (Posted: most recent first), then the latest edits
    list.sort((a, b) => {
      if (shownOrder) {
        const ia = shownOrder.indexOf(a._id),
          ib = shownOrder.indexOf(b._id);
        if (ia !== -1 || ib !== -1)
          return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
      }
      const oa = a.kanbanOrder,
        ob = b.kanbanOrder;
      if (oa !== undefined || ob !== undefined)
        return (oa ?? Infinity) - (ob ?? Infinity);
      if (!!a.liveDate !== !!b.liveDate) return a.liveDate ? -1 : 1;
      if (a.liveDate && b.liveDate && a.liveDate !== b.liveDate)
        return (
          (a.liveDate < b.liveDate ? -1 : 1) * (s.value === "done" ? -1 : 1)
        );
      return b.updatedAt - a.updatedAt;
    });
    return { ...s, list };
  });

  return (
    <div
      ref={scroller}
      onScroll={() =>
        placed.current && (atProd.current = Math.abs(prodOffset()) < 4)
      }
      className="-mx-5 overflow-x-auto scroll-px-5 px-5 pb-4 [scrollbar-width:thin] max-lg:snap-x max-lg:snap-mandatory"
    >
      <div className="flex min-w-max items-start gap-4">
        {columns.map((col) => {
          const quiet = QUIET.includes(col.value);
          const posted = col.value === "done";
          // Posted starts folded up: just its header and a button to open the whole column
          // (it stays folded while dragging so nothing jumps; drop on it to mark a script posted)
          const folded = posted && !allPosted;
          const shown = folded ? [] : col.list;
          const isOver = over === col.value && dragging !== null;
          return (
            <section
              key={col.value}
              data-status={col.value}
              aria-label={col.label}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== col.value) setOver(col.value);
                // The slot: before the first card whose middle is below the pointer (the dragged card doesn't count)
                const cards = [
                  ...e.currentTarget.querySelectorAll<HTMLElement>(
                    "[data-card]",
                  ),
                ].filter((c) => c.dataset.card !== dragging);
                let index = cards.findIndex((c) => {
                  const r = c.getBoundingClientRect();
                  return e.clientY < r.top + r.height / 2;
                });
                if (index === -1) index = cards.length;
                if (folded) index = 0;
                if (slot?.status !== col.value || slot.index !== index)
                  setSlot({ status: col.value, index });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setOver((o) => (o === col.value ? null : o));
                  setSlot((s) => (s?.status === col.value ? null : s));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/x-script") || dragging;
                const v = id ? videos.find((x) => x._id === id) : undefined;
                if (v) {
                  // The column's cards in their new order, with the dropped card in its slot
                  const rest = col.list
                    .filter((x) => x._id !== v._id)
                    .map((x) => x._id);
                  const at = Math.max(
                    0,
                    Math.min(
                      rest.length,
                      slot?.status === col.value ? slot.index : rest.length,
                    ),
                  );
                  const ids = [...rest.slice(0, at), v._id, ...rest.slice(at)];
                  const same =
                    statusOf(v.status).value === col.value &&
                    ids.every((x, i) => x === col.list[i]?._id);
                  if (!same) {
                    if (statusOf(v.status).value !== col.value) {
                      setMoves((m) => ({ ...m, [v._id]: col.value }));
                      // If the save never lands, show where it really is again
                      setTimeout(
                        () =>
                          setMoves((m) =>
                            m[v._id] === col.value
                              ? (({ [v._id]: _gone, ...others }) => others)(m)
                              : m,
                          ),
                        10000,
                      );
                    }
                    setOrders((o) => ({ ...o, [col.value]: ids }));
                    setTimeout(
                      () =>
                        setOrders((o) =>
                          o[col.value] === ids
                            ? (({ [col.value]: _gone, ...others }) => others)(o)
                            : o,
                        ),
                      10000,
                    );
                    onReorder(col.value, ids, v._id);
                  }
                }
                setSlot(null);
                setDragging(null);
                setOver(null);
              }}
              style={{
                background: isOver
                  ? undefined
                  : posted
                    ? "var(--kb-posted-bg)"
                    : col.value === "inProduction"
                      ? "linear-gradient(var(--kb-prod-tint), var(--kb-prod-tint)), var(--kb-col)"
                      : col.value === "sentToEditor"
                        ? "linear-gradient(var(--kb-editor-tint), var(--kb-editor-tint)), var(--kb-col)"
                        : "var(--kb-col)",
              }}
              className={`group/col flex w-[300px] shrink-0 snap-start flex-col rounded-2xl px-3.5 pb-3.5 pt-2 transition-[opacity,box-shadow,background-color] duration-200 ${
                isOver
                  ? "bg-(--kb-drop) ring-2 ring-[#2358d8]/40"
                  : posted
                    ? "ring-1 ring-(--kb-posted-ring)"
                    : ""
              } ${quiet && !isOver ? "opacity-[0.58] hover:opacity-90 focus-within:opacity-100" : ""}`}
            >
              <header className="flex h-10 items-center gap-2 px-1">
                {posted ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-(--kb-posted-text) text-white">
                    <svg
                      viewBox="0 0 12 12"
                      width="9"
                      height="9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m2.5 6.2 2.3 2.3 4.7-4.9" />
                    </svg>
                  </span>
                ) : (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: col.dot }}
                  />
                )}
                <h2
                  className={`m-0 text-[13.5px] font-semibold ${posted ? "text-(--kb-posted-text)" : "text-(--c-t-1b1b1b)"}`}
                >
                  {col.label}
                </h2>
                <span
                  className={`text-[12.5px] tabular-nums ${posted ? "text-(--kb-posted-text) opacity-70" : "text-(--c-t-9a9a9a)"}`}
                >
                  {col.list.length}
                </span>
                <button
                  type="button"
                  onClick={() => setComposing(col.value)}
                  aria-label={`New script in ${col.label}`}
                  title={`New script in ${col.label}`}
                  className={`ml-auto flex h-6 items-center gap-1 rounded-md px-1.5 text-[12.5px] font-medium text-(--c-t-6b6b6b) transition-opacity hover:bg-(--kb-card-ring) hover:text-(--c-t-1b1b1b) group-hover/col:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 ${composing === col.value ? "opacity-100" : "opacity-0"}`}
                >
                  <IconPlus size={12} />
                  New
                </button>
              </header>
              <div
                className={`flex flex-col gap-2 ${posted && !allPosted ? "" : "min-h-[64px]"}`}
              >
                {composing === col.value && (
                  <NewCard
                    status={col.value}
                    onCancel={() => setComposing(null)}
                    onCreate={async (details, again) => {
                      if (!again) setComposing(null);
                      const id = await onNew(col.value, details);
                      // New scripts go to the top of the column
                      const ids = [id, ...col.list.map((x) => x._id).filter((x) => x !== id)];
                      setOrders((o) => ({ ...o, [col.value]: ids }));
                      onReorder(col.value, ids, id);
                    }}
                  />
                )}
                {shown.map((v) => {
                  // The drop line sits just above the card the dragged one would land before
                  const place = shown
                    .filter((x) => x._id !== dragging)
                    .findIndex((x) => x._id === v._id);
                  const lineHere =
                    !!dragging &&
                    slot?.status === col.value &&
                    place !== -1 &&
                    place === slot.index &&
                    !folded;
                  return (
                    <div key={v._id} data-card={v._id} className="relative">
                      {lineHere && <DropLine />}
                      <Card
                        video={v}
                        posted={posted}
                        partner={partnerOf(v.partnerId)}
                        dragging={dragging === v._id}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/x-script", v._id);
                          e.dataTransfer.effectAllowed = "move";
                          // Changing the page during dragstart can cancel the drag in Chrome, so mark it just after
                          const id = v._id;
                          setTimeout(() => setDragging(id), 0);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                          setSlot(null);
                        }}
                      />
                    </div>
                  );
                })}
                {!!dragging &&
                  !folded &&
                  slot?.status === col.value &&
                  slot.index >=
                    shown.filter((x) => x._id !== dragging).length &&
                  shown.some((x) => x._id !== dragging) && (
                    <div className="relative h-0">
                      <DropLine />
                    </div>
                  )}
                {folded && col.list.length > 0 && dragging && (
                  <div
                    className={`flex h-10 items-center justify-center rounded-xl border border-dashed text-[12.5px] font-medium text-(--kb-posted-text) ${isOver ? "border-(--kb-posted-text) bg-(--kb-posted-card)" : "border-(--kb-posted-ring)"}`}
                  >
                    Drop to mark posted
                  </div>
                )}
                {folded && col.list.length > 0 && !dragging && (
                  <button
                    type="button"
                    onClick={() => setAllPosted(true)}
                    className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-dashed border-(--kb-posted-ring) text-[12.5px] font-medium text-(--kb-posted-text) hover:bg-(--kb-posted-card)"
                  >
                    Show all {col.list.length} posted
                    <svg
                      viewBox="0 0 12 12"
                      width="10"
                      height="10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m3 4.5 3 3 3-3" />
                    </svg>
                  </button>
                )}
                {!col.list.length && (
                  <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-(--c-l-dcdcdc) text-[12.5px] text-(--c-t-9a9a9a)">
                    {dragging ? "Drop here" : "Nothing here"}
                  </div>
                )}
                {posted && allPosted && col.list.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAllPosted(false)}
                    className="h-8 rounded-lg text-[12.5px] font-medium text-(--kb-posted-text) hover:bg-(--kb-posted-card)"
                  >
                    Collapse
                  </button>
                )}
              </div>
            </section>
          );
        })}
        {!!tail && (
          <div
            aria-hidden="true"
            className="shrink-0"
            style={{ width: tail }}
          />
        )}
      </div>
    </div>
  );
}

export type NewDetails = { title: string; format: VideoFormat; liveDate: string | null; sponsored: Sponsorship };

/** A quick new script, made right in the column: its name and the main details, without opening it */
function NewCard({ status, onCreate, onCancel }: { status: VideoStatus; onCreate: (d: NewDetails, again: boolean) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<VideoFormat>("long");
  const [liveDate, setLiveDate] = useState("");
  const [sponsored, setSponsored] = useState<Sponsorship>("none");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const submit = async (again: boolean) => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate({ title: title.trim(), format, liveDate: liveDate || null, sponsored }, again);
      if (again) {
        setTitle("");
        ref.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  };
  const field = "h-7 rounded-md border border-(--kb-card-ring) bg-transparent px-1.5 text-[12.5px] text-(--c-t-1b1b1b) outline-none focus:border-(--c-t-9a9a9a)";
  return (
    <form
      data-status-new={status}
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      style={{ background: "var(--kb-card)" }}
      className="flex flex-col gap-2 rounded-xl px-3 py-2.5 shadow-[0_6px_18px_rgba(0,0,0,0.08)] ring-1 ring-(--c-t-9a9a9a)/40"
    >
      <input
        ref={ref}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          // ⌘Enter adds this one and starts another
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit(true);
          }
        }}
        placeholder="Script name"
        aria-label="Script name"
        className="w-full bg-transparent text-[13.5px] font-medium text-(--c-t-1b1b1b) outline-none placeholder:font-normal placeholder:text-(--c-t-9a9a9a)"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex h-7 overflow-hidden rounded-md border border-(--kb-card-ring)" role="group" aria-label="Format">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFormat(f.value)}
              aria-pressed={format === f.value}
              title={f.label}
              className={`flex items-center gap-1 px-1.5 text-[12px] ${format === f.value ? "bg-(--kb-card-ring) text-(--c-t-1b1b1b)" : "text-(--c-t-8a8a8a) hover:text-(--c-t-1b1b1b)"}`}
            >
              <FormatIcon format={f.value} size={12} />
              {f.value === "long" ? "Long" : "Short"}
            </button>
          ))}
        </div>
        <input type="date" value={liveDate} onChange={(e) => setLiveDate(e.target.value)} aria-label="Live date" title="Live date" className={`${field} w-[124px]`} />
        <select value={sponsored} onChange={(e) => setSponsored(e.target.value as Sponsorship)} aria-label="Sponsorship" title="Sponsorship" className={`${field} max-w-[118px]`}>
          {SPONSORSHIPS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.value === "none" ? "Sponsor?" : s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="submit" disabled={!title.trim() || busy} className="h-7 rounded-md bg-(--c-b-1b1b1b) px-2.5 text-[12.5px] font-medium text-(--c-on-ink) disabled:opacity-40">
          Add
        </button>
        <button type="button" onClick={onCancel} className="h-7 rounded-md px-2 text-[12.5px] text-(--c-t-6b6b6b) hover:bg-(--kb-card-ring)">
          Cancel
        </button>
        <span className="ml-auto text-[11px] text-(--c-t-9a9a9a) max-sm:hidden">⌘↵ add another</span>
      </div>
    </form>
  );
}

/** Where a dragged card will land */
function DropLine() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-1 -top-[5.5px] z-10 h-[3px] rounded-full bg-[#2358d8]"
    >
      <span className="absolute -left-1 -top-[3px] h-[9px] w-[9px] rounded-full border-2 border-[#2358d8] bg-(--kb-card)" />
    </span>
  );
}

const shortDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  const date = new Date(y, m - 1, day);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(y === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
};

function Card({
  video: v,
  posted,
  partner,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  video: KanbanVideo;
  posted: boolean;
  partner?: Partner;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const sponsored = isPaidSponsor(v.sponsored);
  const today = new Date().toISOString().slice(0, 10);
  const late = !posted && v.liveDate && v.liveDate < today;
  const meta: ReactNode[] = [];
  if (v.liveDate)
    meta.push(
      <span
        key="d"
        className={`inline-flex items-center gap-1 whitespace-nowrap ${late ? "text-(--c-t-b42318)" : ""}`}
        title={late ? "Live date has passed" : "Live date"}
      >
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2" />
          <path d="M2.25 6.75h11.5M5.5 1.75v3M10.5 1.75v3" />
        </svg>
        {shortDate(v.liveDate)}
      </span>,
    );
  return (
    <Link
      href={`/v/${v._id}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: posted ? "var(--kb-posted-card)" : "var(--kb-card)",
      }}
      className={`group/card block rounded-xl px-3 py-2.5 no-underline shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 transition-[box-shadow,transform,opacity] duration-150 hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(0,0,0,0.08)] ${
        posted ? "ring-(--kb-posted-ring)" : "ring-(--kb-card-ring)"
      } ${dragging ? "opacity-40" : ""}`}
    >
      <div
        className={`line-clamp-3 text-[13.5px] font-medium leading-[1.4] ${v.title.trim() ? "text-(--c-t-1b1b1b)" : "text-(--c-t-9a9a9a)"}`}
      >
        {v.title.trim() || "Untitled"}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[12px] text-(--c-t-8a8a8a)">
        <FormatIcon format={v.format} size={13} />
        {meta}
        <span className="flex-1" />
        {sponsored && !partner && (
          <span className="truncate rounded-full bg-(--c-b-fdf3cf) px-1.5 py-px text-[11px] font-medium text-(--c-t-7a5b00)">
            Sponsored
          </span>
        )}
        {partner && (
          <span title={`Partner: ${partner.name}`} className="inline-flex">
            <PartnerLogo
              p={partner}
              size={16}
              className="ring-1 ring-(--c-hairline)"
            />
          </span>
        )}
      </div>
    </Link>
  );
}
