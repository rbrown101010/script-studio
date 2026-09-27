"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { IconTrash, IconX } from "./icons";

// Posts to the X accounts connected in Composio: right away, or at a scheduled time (the server posts it then).

type Account = { id: string; name: string; handle: string; avatar: string };
// The two X accounts connected in Composio, with their profile pictures
const ACCOUNTS: Account[] = [
  { id: "rileybrown", name: "Riley Brown", handle: "@rileybrown", avatar: "/avatars/rileybrown.jpg" },
  { id: "agentnative", name: "Agent Native", handle: "@agentnative_", avatar: "/avatars/agentnative_.jpg" },
];
const LIMIT = 280;

type Post = {
  id: Id<"xPosts">;
  accountIds: string[];
  text: string;
  at: number;
  status: "scheduled" | "posting" | "posted" | "failed";
  results: { accountId: string; tweetId: string | null; url: string | null; error: string | null }[];
  createdAt: number;
};
const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^[\s\S]*ConvexError:\s*/, "").replace(/\s+at [\s\S]*$/, "").split("\n")[0];
};

/** Default schedule: the next round hour at least an hour away */
const defaultWhen = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
};
const toInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayLabel = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
};
const timeLabel = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function Tweet() {
  const [accountIds, setAccountIds] = useState<string[]>(["rileybrown"]);
  const [text, setText] = useState("");
  const [when, setWhen] = useState(() => toInput(defaultWhen()));
  const posts = useQuery(api.tweets.list) as Post[] | undefined;
  const scheduleM = useMutation(api.tweets.schedule);
  const postNowM = useMutation(api.tweets.postNow);
  const updateM = useMutation(api.tweets.update);
  const removeM = useMutation(api.tweets.remove);
  const [editing, setEditing] = useState<Id<"xPosts"> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // The clock, ticking every 30s, so "past due" and the schedule check stay right without reading Date.now() in render
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const count = [...text].length;
  const over = count > LIMIT;
  const whenMs = new Date(when).getTime();
  const canSend = text.trim().length > 0 && !over && accountIds.length > 0;
  const canSchedule = canSend && whenMs > now;

  const queue = useMemo(() => (posts ?? []).filter((p) => p.status === "scheduled" || p.status === "posting").sort((a, b) => a.at - b.at), [posts]);
  const done = useMemo(() => (posts ?? []).filter((p) => p.status === "posted" || p.status === "failed").sort((a, b) => b.at - a.at).slice(0, 30), [posts]);
  const reset = () => {
    setText("");
    setEditing(null);
    setConfirming(false);
    setWhen(toInput(defaultWhen()));
  };
  const schedule = async () => {
    if (!canSchedule || busy) return;
    setBusy(true);
    try {
      if (editing) await updateM({ id: editing, accountIds, text, at: whenMs });
      else await scheduleM({ accountIds, text, at: whenMs });
      setToast(editing ? "Scheduled tweet updated" : `Scheduled for ${dayLabel(whenMs)} at ${timeLabel(whenMs)}`);
      reset();
    } catch (e) {
      setToast(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const postNow = async () => {
    if (!canSend || busy) return;
    setBusy(true);
    try {
      await postNowM({ accountIds, text });
      setToast("Posting…");
      reset();
    } catch (e) {
      setToast(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: string) =>
    setAccountIds((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id]));
  const edit = (q: Post) => {
    setEditing(q.id);
    setText(q.text);
    setAccountIds(q.accountIds);
    setWhen(toInput(new Date(q.at)));
    box.current?.focus();
  };

  const groups = useMemo(() => {
    const out: { label: string; items: Post[] }[] = [];
    for (const q of queue) {
      const label = q.status === "posting" || q.at < now ? "Posting now" : dayLabel(q.at);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(q);
      else out.push({ label, items: [q] });
    }
    return out;
  }, [queue, now]);

  const first = ACCOUNTS.find((a) => accountIds.includes(a.id)) ?? ACCOUNTS[0];

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-8 lg:flex-row lg:items-start">
      {/* Composer */}
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-2">
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.015em] text-(--c-t-1b1b1b)">Tweet</h1>
        </div>

        <div className="rounded-2xl bg-(--c-b-ffffff) p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-(--c-l-e3e3e0)">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[13px] text-(--c-t-8a8a8a)">Post from</span>
            {ACCOUNTS.map((a) => {
              const on = accountIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(a.id)}
                  className={`inline-flex h-9 items-center gap-2 rounded-full pl-1 pr-3 text-[13px] ring-1 ${
                    on ? "bg-(--c-b-1b1b1b) text-(--c-on-ink) ring-(--c-l-1b1b1b)" : "bg-(--c-b-ffffff) text-(--c-t-4a4a4a) ring-(--c-l-dcdcdc) hover:bg-(--c-b-fafafa)"
                  }`}
                >
                  <Avatar a={a} size={28} />
                  <span className="font-medium">{a.name}</span>
                  <span className={on ? "text-(--c-on-ink)/60" : "text-(--c-t-9a9a9a)"}>{a.handle}</span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-3">
            <Avatar a={first} size={40} />
            <textarea
              ref={box}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void schedule();
              }}
              placeholder="What's happening?"
              aria-label="Tweet text"
              rows={5}
              className="min-h-[132px] w-full resize-none border-none bg-transparent pt-2 text-[18px] leading-[1.45] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a)"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-(--c-l-f0f0f0) pt-4">
            <label className="flex items-center gap-2 text-[13px] text-(--c-t-6b6b6b)">
              <CalendarIcon />
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                aria-label="Schedule for"
                className="h-9 rounded-lg border border-(--c-l-dcdcdc) bg-(--c-b-ffffff) px-2.5 text-[13px] text-(--c-t-1b1b1b) outline-none focus:border-(--c-l-8a8a8a)"
              />
            </label>
            <div className="flex-1" />
            <Counter count={count} />
            {editing && (
              <button type="button" onClick={reset} className="h-9 rounded-full px-3 text-[14px] text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)">
                Cancel
              </button>
            )}
            {!editing && (
              <button
                type="button"
                disabled={!canSend || busy}
                onClick={() => setConfirming(true)}
                className="h-9 rounded-full px-4 text-[14px] font-medium text-(--c-t-1b1b1b) ring-1 ring-(--c-l-dcdcdc) hover:bg-(--c-b-fafafa) disabled:opacity-40"
              >
                Post now
              </button>
            )}
            <button
              type="button"
              disabled={!canSchedule || busy}
              onClick={() => void schedule()}
              title={whenMs <= now ? "Pick a time in the future" : undefined}
              className="h-9 rounded-full bg-(--c-b-1b1b1b) px-4 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-40"
            >
              {editing ? "Update" : "Schedule"}
            </button>
          </div>
        </div>

        {confirming && canSend && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-(--c-b-fdf3cf) px-4 py-3 text-[14px] text-(--c-t-1b1b1b)">
            <span className="min-w-0 flex-1">
              Post this now from {ACCOUNTS.filter((a) => accountIds.includes(a.id)).map((a) => a.handle).join(" and ")}? It goes live on X right away.
            </span>
            <button type="button" onClick={() => setConfirming(false)} className="h-8 rounded-full px-3 text-[13px] text-(--c-t-6b6b6b) hover:bg-(--c-b-f9e9b0)">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void postNow()}
              className="h-8 rounded-full bg-(--c-b-1b1b1b) px-4 text-[13px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-40"
            >
              Post to X
            </button>
          </div>
        )}

        {/* Preview */}
        {text.trim() && (
          <div className="mt-6">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-(--c-t-9a9a9a)">Preview</div>
            <div className="flex flex-col gap-3">
              {ACCOUNTS.filter((a) => accountIds.includes(a.id)).map((a) => (
                <div key={a.id} className="flex gap-3 rounded-2xl bg-(--c-b-ffffff) p-4 ring-1 ring-(--c-l-e3e3e0)">
                  <Avatar a={a} size={40} />
                  <div className="min-w-0">
                    <div className="text-[15px]">
                      <span className="font-semibold text-(--c-t-1b1b1b)">{a.name}</span> <span className="text-(--c-t-8a8a8a)">{a.handle} · {timeLabel(whenMs || now)}</span>
                    </div>
                    <p className="m-0 mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-[1.45] text-(--c-t-1b1b1b)">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Queue */}
      <div className="w-full shrink-0 lg:w-[360px]">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="m-0 text-[16px] font-semibold text-(--c-t-1b1b1b)">Scheduled</h2>
          <span className="text-[13px] text-(--c-t-9a9a9a)">{queue.length}</span>
        </div>
        {queue.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-(--c-l-dcdcdc) px-5 py-10 text-center text-[14px] text-(--c-t-8a8a8a)">
            Nothing scheduled yet. Write a tweet, pick a time, and press Schedule.
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-(--c-t-9a9a9a)">{g.label}</div>
                <div className="flex flex-col gap-2">
                  {g.items.map((q) => (
                    <div
                      key={q.id}
                      className={`group relative rounded-xl bg-(--c-b-ffffff) p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ${editing === q.id ? "ring-(--c-l-2358d8)" : "ring-(--c-l-e3e3e0)"}`}
                    >
                      <button
                        type="button"
                        onClick={() => q.status === "scheduled" && edit(q)}
                        disabled={q.status !== "scheduled"}
                        className="block w-full text-left"
                        aria-label="Edit scheduled tweet"
                      >
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <span className="flex -space-x-1.5">
                            {ACCOUNTS.filter((a) => q.accountIds.includes(a.id)).map((a) => (
                              <Avatar key={a.id} a={a} size={20} ring />
                            ))}
                          </span>
                          <span className="text-[12px] font-medium text-(--c-t-4a4a4a)">{timeLabel(q.at)}</span>
                          <span className="truncate text-[12px] text-(--c-t-9a9a9a)">
                            {ACCOUNTS.filter((a) => q.accountIds.includes(a.id)).map((a) => a.handle).join(", ")}
                          </span>
                        </div>
                        <p className="m-0 line-clamp-4 whitespace-pre-wrap break-words pr-6 text-[14px] leading-[1.45] text-(--c-t-1b1b1b)">{q.text}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (editing === q.id) reset();
                          void removeM({ id: q.id }).then(
                            () => setToast("Scheduled tweet deleted, it won't post"),
                            (e) => setToast(errText(e)),
                          );
                        }}
                        aria-label="Delete scheduled tweet"
                        className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-md text-(--c-t-9a9a9a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-b42318) group-hover:flex pointer-coarse:flex"
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {done.length > 0 && (
          <div className="mt-8">
            <h2 className="m-0 mb-3 text-[16px] font-semibold text-(--c-t-1b1b1b)">Posted</h2>
            <div className="flex flex-col gap-2">
              {done.map((p) => (
                <div key={p.id} className="group relative rounded-xl bg-(--c-b-ffffff) p-3.5 ring-1 ring-(--c-l-e3e3e0)">
                  <div className="mb-1.5 flex items-center gap-1.5 pr-6">
                    <span className="flex -space-x-1.5">
                      {ACCOUNTS.filter((a) => p.accountIds.includes(a.id)).map((a) => (
                        <Avatar key={a.id} a={a} size={20} ring />
                      ))}
                    </span>
                    <span className="text-[12px] text-(--c-t-9a9a9a)">
                      {dayLabel(p.at)}, {timeLabel(p.at)}
                    </span>
                    {p.status === "failed" && <span className="rounded-full bg-(--c-b-fdecea) px-1.5 text-[11px] font-medium text-(--c-t-b42318)">Failed</span>}
                  </div>
                  <p className="m-0 line-clamp-3 whitespace-pre-wrap break-words text-[14px] leading-[1.45] text-(--c-t-1b1b1b)">{p.text}</p>
                  <div className="mt-2 flex flex-col gap-1">
                    {p.results.map((r) => {
                      const a = ACCOUNTS.find((x) => x.id === r.accountId);
                      return r.url ? (
                        <a key={r.accountId} href={r.url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-(--c-t-2358d8) no-underline hover:underline">
                          View on X · {a?.handle}
                        </a>
                      ) : (
                        <span key={r.accountId} className="text-[12px] text-(--c-t-b42318)">
                          {a?.handle}: {r.error}
                        </span>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeM({ id: p.id })}
                    aria-label="Remove from this list (doesn't delete it from X)"
                    title="Remove from this list (doesn't delete it from X)"
                    className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-md text-(--c-t-9a9a9a) hover:bg-(--c-b-f4f4f4) group-hover:flex pointer-coarse:flex"
                  >
                    <IconX size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-(--c-b-1b1b1b) py-2.5 pl-4 pr-2 text-[14px] text-(--c-on-ink) shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
          {toast}
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15">
            <IconX size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function Avatar({ a, size, ring }: { a: Account; size: number; ring?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={a.avatar}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full bg-(--c-b-ececea) object-cover ${ring ? "ring-2 ring-(--c-b-ffffff)" : ""}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Character ring like X's: fills up, turns amber near the limit and red over it */
function Counter({ count }: { count: number }) {
  const left = LIMIT - count;
  const r = 10;
  const c = 2 * Math.PI * r;
  const pct = Math.min(count / LIMIT, 1);
  const color = left < 0 ? "var(--c-t-d92d20)" : left <= 20 ? "var(--c-t-d97706)" : "var(--c-t-2358d8)";
  return (
    <span className="flex items-center gap-1.5" aria-label={`${left} characters left`}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="13" cy="13" r={r} fill="none" stroke="var(--c-t-ececea)" strokeWidth="2.5" />
        <circle cx="13" cy="13" r={r} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" transform="rotate(-90 13 13)" />
      </svg>
      {left <= 20 && <span className="text-[13px] tabular-nums" style={{ color }}>{left}</span>}
    </span>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2" />
      <path d="M2.25 6.75h11.5M5.5 1.75v3M10.5 1.75v3" />
    </svg>
  );
}
