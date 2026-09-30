"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { IconTrash, IconX } from "./icons";
import { TweetCard, tweetIdOf } from "./TweetCard";

// Posts to the X accounts connected in Composio: right away, or at a scheduled time (the server posts it then).
// Tabs: Suggestions (agents' ideas for @agentnative_), Scheduled, Posted, Drafts (saved for later, any account).
// A tweet can quote another tweet and carry a video or images; both render like they do on X.

type Account = { id: string; name: string; handle: string; avatar: string };
// The two X accounts connected in Composio, with their profile pictures
const ACCOUNTS: Account[] = [
  { id: "rileybrown", name: "Riley Brown", handle: "@rileybrown", avatar: "/avatars/rileybrown.jpg" },
  { id: "agentnative", name: "Agent Native", handle: "@agentnative_", avatar: "/avatars/agentnative_.jpg" },
];
const LIMIT = 280;

type Media = { storageId: Id<"_storage">; kind: "video" | "image"; name: string; mime: string; url: string | null };
type Status = "scheduled" | "posting" | "posted" | "failed" | "draft" | "suggestion";
type Post = {
  id: Id<"xPosts">;
  accountIds: string[];
  text: string;
  at: number;
  status: Status;
  results: { accountId: string; tweetId: string | null; url: string | null; error: string | null }[];
  quoteUrl: string | null;
  media: Media[];
  note: string | null;
  agentName: string | null;
  createdAt: number;
};
type Tab = "suggestions" | "scheduled" | "posted" | "drafts";
const TABS: { id: Tab; label: string }[] = [
  { id: "suggestions", label: "Suggestions" },
  { id: "scheduled", label: "Scheduled" },
  { id: "posted", label: "Posted" },
  { id: "drafts", label: "Drafts" },
];

const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^[\s\S]*ConvexError:\s*/, "").replace(/\s+at [\s\S]*$/, "").split("\n")[0];
};
/** X counts every link as 23 characters */
const weighted = (t: string) => [...t.replace(/https?:\/\/\S+/g, "x".repeat(23))].length;

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
  const [quoteUrl, setQuoteUrl] = useState("");
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [media, setMedia] = useState<Media[]>([]);
  const [uploading, setUploading] = useState(false);
  const [when, setWhen] = useState(() => toInput(defaultWhen()));
  const [tab, setTab] = useState<Tab>("suggestions");
  const posts = useQuery(api.tweets.list) as Post[] | undefined;
  const scheduleM = useMutation(api.tweets.schedule);
  const postNowM = useMutation(api.tweets.postNow);
  const saveDraftM = useMutation(api.tweets.saveDraft);
  const removeM = useMutation(api.tweets.remove);
  const uploadUrl = useMutation(api.docs.generateUploadUrl);
  /** The draft, suggestion or scheduled tweet loaded into the composer */
  const [editing, setEditing] = useState<{ id: Id<"xPosts">; status: Status } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const filePick = useRef<HTMLInputElement>(null);
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

  const count = weighted(text);
  const over = count > LIMIT;
  const whenMs = new Date(when).getTime();
  const quoteOk = !quoteUrl.trim() || !!tweetIdOf(quoteUrl);
  const hasContent = text.trim().length > 0 || !!quoteUrl.trim() || media.length > 0;
  const canSend = hasContent && !over && quoteOk && accountIds.length > 0 && !uploading;
  const canSchedule = canSend && whenMs > now;

  const lists = useMemo(() => {
    const all = posts ?? [];
    return {
      suggestions: all.filter((p) => p.status === "suggestion").sort((a, b) => b.at - a.at),
      scheduled: all.filter((p) => p.status === "scheduled" || p.status === "posting").sort((a, b) => a.at - b.at),
      posted: all.filter((p) => p.status === "posted" || p.status === "failed").sort((a, b) => b.at - a.at),
      drafts: all.filter((p) => p.status === "draft").sort((a, b) => b.at - a.at),
    };
  }, [posts]);

  const reset = () => {
    setText("");
    setQuoteUrl("");
    setQuoteOpen(false);
    setMedia([]);
    setEditing(null);
    setConfirming(false);
    setWhen(toInput(defaultWhen()));
  };
  const payload = () => ({
    ...(editing ? { id: editing.id } : {}),
    accountIds,
    text,
    quoteUrl: quoteUrl.trim() || null,
    media: media.map(({ storageId, kind, name, mime }) => ({ storageId, kind, name, mime })),
  });
  const run = async (fn: () => Promise<unknown>, done: string, nextTab?: Tab) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      setToast(done);
      reset();
      if (nextTab) setTab(nextTab);
    } catch (e) {
      setToast(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const schedule = () =>
    canSchedule &&
    run(() => scheduleM({ ...payload(), at: whenMs }), editing?.status === "scheduled" ? "Scheduled tweet updated" : `Scheduled for ${dayLabel(whenMs)} at ${timeLabel(whenMs)}`, "scheduled");
  const postNow = () => canSend && run(() => postNowM(payload()), "Posting…", "posted");
  const saveDraft = () => hasContent && !uploading && run(() => saveDraftM(payload()), "Saved to Drafts", "drafts");

  const toggle = (id: string) =>
    setAccountIds((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id]));
  const load = (q: Post) => {
    setEditing({ id: q.id, status: q.status });
    setText(q.text);
    setAccountIds(q.accountIds.length ? q.accountIds : ["rileybrown"]);
    setQuoteUrl(q.quoteUrl ?? "");
    setQuoteOpen(!!q.quoteUrl);
    setMedia(q.media);
    setConfirming(false);
    setWhen(toInput(q.status === "scheduled" && q.at > now ? new Date(q.at) : defaultWhen()));
    box.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const remove = (q: Post, done: string) => {
    if (editing?.id === q.id) reset();
    void removeM({ id: q.id }).then(
      () => setToast(done),
      (e) => setToast(errText(e)),
    );
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("video/") || f.type.startsWith("image/"));
    if (!list.length) return;
    const video = list.find((f) => f.type.startsWith("video/"));
    const picked = video ? [video] : list.slice(0, 4 - media.filter((m) => m.kind === "image").length);
    if (video && media.length) setToast("A tweet can have one video, or up to 4 images");
    setUploading(true);
    try {
      const added: Media[] = [];
      for (const f of picked) {
        const res = await fetch(await uploadUrl(), { method: "POST", headers: { "Content-Type": f.type }, body: f });
        if (!res.ok) throw new Error("Upload failed");
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        added.push({ storageId, kind: f.type.startsWith("video/") ? "video" : "image", name: f.name, mime: f.type, url: URL.createObjectURL(f) });
      }
      setMedia((cur) => (video ? added : [...cur.filter((m) => m.kind === "image"), ...added].slice(0, 4)));
    } catch (e) {
      setToast(errText(e));
    } finally {
      setUploading(false);
    }
  };

  const groups = useMemo(() => {
    const out: { label: string; items: Post[] }[] = [];
    for (const q of lists.scheduled) {
      const label = q.status === "posting" || q.at < now ? "Posting now" : dayLabel(q.at);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(q);
      else out.push({ label, items: [q] });
    }
    return out;
  }, [lists.scheduled, now]);

  const chosen = ACCOUNTS.filter((a) => accountIds.includes(a.id));
  const first = chosen[0] ?? ACCOUNTS[0];
  const primary = editing?.status === "scheduled" ? "Update" : "Schedule";

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-8 lg:flex-row lg:items-start">
      {/* Composer */}
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-2">
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.015em] text-(--c-t-1b1b1b)">Tweet</h1>
          {editing && (
            <span className="rounded-full bg-(--c-b-f4f4f4) px-2 py-0.5 text-[12px] text-(--c-t-6b6b6b)">
              {editing.status === "suggestion" ? "Editing a suggestion" : editing.status === "draft" ? "Editing a draft" : "Editing a scheduled tweet"}
            </span>
          )}
        </div>

        <div
          className="rounded-2xl bg-(--c-b-ffffff) p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-(--c-l-e3e3e0)"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            void addFiles(e.dataTransfer.files);
          }}
        >
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
            <div className="min-w-0 flex-1">
              <textarea
                ref={box}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void schedule();
                }}
                onPaste={(e) => {
                  if (e.clipboardData.files.length) {
                    e.preventDefault();
                    void addFiles(e.clipboardData.files);
                    return;
                  }
                  // Pasting just a tweet link into an empty quote makes it a quote tweet
                  const pasted = e.clipboardData.getData("text").trim();
                  if (!quoteUrl && tweetIdOf(pasted) && pasted.split(/\s+/).length === 1) {
                    e.preventDefault();
                    setQuoteUrl(pasted);
                    setQuoteOpen(true);
                  }
                }}
                placeholder={quoteUrl ? "Add a comment" : "What's happening?"}
                aria-label="Tweet text"
                rows={4}
                className="min-h-[108px] w-full resize-none border-none bg-transparent pt-2 text-[18px] leading-[1.45] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a)"
              />
              {media.length > 0 && (
                <MediaView media={media} onRemove={(i) => setMedia((cur) => cur.filter((_, j) => j !== i))} />
              )}
              {uploading && <div className="mt-2 text-[13px] text-(--c-t-8a8a8a)">Uploading…</div>}
              {quoteOpen && (
                <div className="mt-3">
                  {tweetIdOf(quoteUrl) ? (
                    <div className="relative">
                      <TweetCard id={tweetIdOf(quoteUrl)!} url={quoteUrl} inert />
                      <button
                        type="button"
                        onClick={() => {
                          setQuoteUrl("");
                          setQuoteOpen(false);
                        }}
                        aria-label="Remove quote"
                        className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-(--c-b-1b1b1b) text-(--c-on-ink)"
                      >
                        <IconX size={13} />
                      </button>
                    </div>
                  ) : (
                    <input
                      autoFocus
                      value={quoteUrl}
                      onChange={(e) => setQuoteUrl(e.target.value)}
                      placeholder="Paste the link of the tweet to quote"
                      aria-label="Tweet to quote"
                      className={`h-10 w-full rounded-xl border bg-(--c-b-ffffff) px-3 text-[14px] text-(--c-t-1b1b1b) outline-none ${
                        quoteOk ? "border-(--c-l-dcdcdc) focus:border-(--c-l-8a8a8a)" : "border-(--c-l-d92d20)"
                      }`}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-(--c-l-f0f0f0) pt-4">
            <ToolButton label="Add a video or images" onClick={() => filePick.current?.click()}>
              <MediaIcon />
            </ToolButton>
            <input
              ref={filePick}
              type="file"
              accept="video/*,image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <ToolButton label="Quote a tweet" on={quoteOpen} onClick={() => setQuoteOpen((o) => !o)}>
              <QuoteIcon />
            </ToolButton>
            <label className="ml-1 flex items-center gap-2 text-[13px] text-(--c-t-6b6b6b)">
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
            <button
              type="button"
              disabled={!hasContent || busy || uploading}
              onClick={() => void saveDraft()}
              className="h-9 rounded-full px-3 text-[14px] text-(--c-t-4a4a4a) hover:bg-(--c-b-f4f4f4) disabled:opacity-40"
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={!canSend || busy}
              onClick={() => setConfirming(true)}
              className="h-9 rounded-full px-4 text-[14px] font-medium text-(--c-t-1b1b1b) ring-1 ring-(--c-l-dcdcdc) hover:bg-(--c-b-fafafa) disabled:opacity-40"
            >
              Post now
            </button>
            <button
              type="button"
              disabled={!canSchedule || busy}
              onClick={() => void schedule()}
              title={whenMs <= now ? "Pick a time in the future" : undefined}
              className="h-9 rounded-full bg-(--c-b-1b1b1b) px-4 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-40"
            >
              {primary}
            </button>
          </div>
        </div>

        {confirming && canSend && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-(--c-b-fdf3cf) px-4 py-3 text-[14px] text-(--c-t-1b1b1b)">
            <span className="min-w-0 flex-1">Post this now from {chosen.map((a) => a.handle).join(" and ")}? It goes live on X right away.</span>
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

        {/* Preview: how it will look on X */}
        {hasContent && (
          <div className="mt-6">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-(--c-t-9a9a9a)">Preview</div>
            <div className="flex flex-col gap-3">
              {chosen.map((a) => (
                <div key={a.id} className="rounded-2xl bg-(--c-b-ffffff) p-4 ring-1 ring-(--c-l-e3e3e0)">
                  <TweetView accounts={[a]} text={text} quoteUrl={tweetIdOf(quoteUrl) ? quoteUrl : null} media={media} time={timeLabel(whenMs || now)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="w-full shrink-0 lg:w-[420px]">
        <div role="tablist" className="mb-4 flex gap-1 border-b border-(--c-l-ebebeb)">
          {TABS.map((t) => {
            const n = lists[t.id].length;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => setTab(t.id)}
                className={`-mb-px flex h-10 items-center gap-1.5 border-b-2 px-2.5 text-[14px] ${
                  on ? "border-(--c-l-1b1b1b) font-medium text-(--c-t-1b1b1b)" : "border-transparent text-(--c-t-8a8a8a) hover:text-(--c-t-4a4a4a)"
                }`}
              >
                {t.label}
                {n > 0 && t.id !== "posted" && <span className="text-[12px] text-(--c-t-9a9a9a)">{n}</span>}
              </button>
            );
          })}
        </div>

        {tab === "suggestions" &&
          (lists.suggestions.length === 0 ? (
            <Empty>No suggestions yet. Agents add tweet ideas for @agentnative_ here.</Empty>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lists.suggestions.map((q) => (
                <Card key={q.id} on={editing?.id === q.id}>
                  <TweetView accounts={accountsOf(q)} text={q.text} quoteUrl={q.quoteUrl} media={q.media} />
                  {q.note && <p className="m-0 mt-3 whitespace-pre-wrap break-words text-[13px] leading-[1.45] text-(--c-t-737373)">{q.note}</p>}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => load(q)}
                      className="h-8 rounded-full bg-(--c-b-1b1b1b) px-3.5 text-[13px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333)"
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(q, "Suggestion dismissed")}
                      className="h-8 rounded-full px-3 text-[13px] text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)"
                    >
                      Dismiss
                    </button>
                    {q.agentName && <span className="ml-auto text-[12px] text-(--c-t-9a9a9a)">{q.agentName}</span>}
                  </div>
                </Card>
              ))}
            </div>
          ))}

        {tab === "scheduled" &&
          (lists.scheduled.length === 0 ? (
            <Empty>Nothing scheduled yet. Write a tweet, pick a time, and press Schedule.</Empty>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((g) => (
                <div key={g.label}>
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-(--c-t-9a9a9a)">{g.label}</div>
                  <div className="flex flex-col gap-2.5">
                    {g.items.map((q) => (
                      <Card key={q.id} on={editing?.id === q.id} onDelete={q.status === "scheduled" ? () => remove(q, "Scheduled tweet deleted, it won't post") : undefined} deleteLabel="Delete scheduled tweet">
                        <button
                          type="button"
                          onClick={() => q.status === "scheduled" && load(q)}
                          disabled={q.status !== "scheduled"}
                          className="block w-full text-left"
                          aria-label="Edit scheduled tweet"
                        >
                          <TweetView accounts={accountsOf(q)} text={q.text} quoteUrl={q.quoteUrl} media={q.media} time={q.status === "posting" ? "Posting…" : timeLabel(q.at)} />
                        </button>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}

        {tab === "posted" &&
          (lists.posted.length === 0 ? (
            <Empty>Tweets posted from here show up here, with links to them on X.</Empty>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lists.posted.map((p) => (
                <Card key={p.id} onDelete={() => remove(p, "Removed from this list (still on X)")} deleteLabel="Remove from this list (doesn't delete it from X)">
                  <TweetView accounts={accountsOf(p)} text={p.text} quoteUrl={p.quoteUrl} media={p.media} time={`${dayLabel(p.at)}, ${timeLabel(p.at)}`} />
                  <div className="mt-2.5 flex flex-col gap-1">
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
                </Card>
              ))}
            </div>
          ))}

        {tab === "drafts" &&
          (lists.drafts.length === 0 ? (
            <Empty>No drafts. Write a tweet and press Save draft to keep it for later.</Empty>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lists.drafts.map((q) => (
                <Card key={q.id} on={editing?.id === q.id} onDelete={() => remove(q, "Draft deleted")} deleteLabel="Delete draft">
                  <button type="button" onClick={() => load(q)} className="block w-full text-left" aria-label="Edit draft">
                    <TweetView accounts={accountsOf(q)} text={q.text} quoteUrl={q.quoteUrl} media={q.media} time={`Saved ${dayLabel(q.at).toLowerCase()}`} />
                  </button>
                </Card>
              ))}
            </div>
          ))}
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

const accountsOf = (p: Post) => ACCOUNTS.filter((a) => p.accountIds.includes(a.id));

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-(--c-l-dcdcdc) px-5 py-10 text-center text-[14px] text-(--c-t-8a8a8a)">{children}</div>;
}

function Card({ children, on, onDelete, deleteLabel }: { children: React.ReactNode; on?: boolean; onDelete?: () => void; deleteLabel?: string }) {
  return (
    <div className={`group relative rounded-2xl bg-(--c-b-ffffff) p-4 ring-1 ${on ? "ring-(--c-l-2358d8)" : "ring-(--c-l-e3e3e0)"}`}>
      {children}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={deleteLabel}
          title={deleteLabel}
          className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-md bg-(--c-b-ffffff) text-(--c-t-9a9a9a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-b42318) group-hover:flex pointer-coarse:flex"
        >
          <IconTrash size={14} />
        </button>
      )}
    </div>
  );
}

/** A tweet laid out the way X shows it: who, text, video or images, and the quoted tweet underneath */
function TweetView({ accounts, text, quoteUrl, media, time }: { accounts: Account[]; text: string; quoteUrl: string | null; media: Media[]; time?: string }) {
  const a = accounts[0] ?? ACCOUNTS[0];
  const qid = tweetIdOf(quoteUrl);
  return (
    <div className="flex gap-3">
      <span className="flex shrink-0 flex-col -space-y-2">
        {(accounts.length ? accounts : [a]).map((x) => (
          <Avatar key={x.id} a={x} size={accounts.length > 1 ? 30 : 40} ring={accounts.length > 1} />
        ))}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate pr-6 text-[15px] leading-[1.3]">
          <span className="font-semibold text-(--c-t-1b1b1b)">{accounts.length > 1 ? accounts.map((x) => x.name).join(" + ") : a.name}</span>{" "}
          <span className="text-(--c-t-8a8a8a)">
            {accounts.map((x) => x.handle).join(" ")}
            {time ? ` · ${time}` : ""}
          </span>
        </div>
        {text.trim() && <p className="m-0 mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-[1.45] text-(--c-t-1b1b1b)">{text}</p>}
        {media.length > 0 && <MediaView media={media} />}
        {qid && quoteUrl && (
          <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
            <TweetCard id={qid} url={quoteUrl} inert />
          </div>
        )}
      </div>
    </div>
  );
}

/** A video (with controls) or up to 4 images in X's grid */
function MediaView({ media, onRemove }: { media: Media[]; onRemove?: (i: number) => void }) {
  const video = media.find((m) => m.kind === "video");
  const images = media.filter((m) => m.kind === "image");
  const remove = (i: number) =>
    onRemove && (
      <button
        type="button"
        onClick={() => onRemove(i)}
        aria-label="Remove"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/85"
      >
        <IconX size={13} />
      </button>
    );
  if (video)
    return (
      <div className="relative mt-2.5 overflow-hidden rounded-2xl bg-black ring-1 ring-(--c-l-ebebeb)" onClick={(e) => e.stopPropagation()}>
        {video.url ? (
          <video src={video.url} controls playsInline preload="metadata" className="block max-h-[420px] w-full bg-black" />
        ) : (
          <div className="flex h-40 items-center justify-center text-[13px] text-white/70">{video.name}</div>
        )}
        {remove(media.indexOf(video))}
      </div>
    );
  return (
    <div className={`mt-2.5 grid gap-0.5 overflow-hidden rounded-2xl ring-1 ring-(--c-l-ebebeb) ${images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
      {images.map((m, i) => (
        <div key={m.storageId} className={`relative ${images.length === 3 && i === 0 ? "row-span-2" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={m.url ?? undefined}
            alt=""
            className={`block h-full w-full bg-(--c-b-f0f0f0) object-cover ${images.length > 1 ? "aspect-[4/3]" : "max-h-[420px]"}`}
          />
          {remove(media.indexOf(m))}
        </div>
      ))}
    </div>
  );
}

function ToolButton({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={on}
      className={`flex h-9 w-9 items-center justify-center rounded-full ${on ? "bg-(--c-b-f0f0f0) text-(--c-t-1b1b1b)" : "text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)"}`}
    >
      {children}
    </button>
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

function MediaIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2.5" />
      <path d="M8.5 7.6v4.8l4-2.4z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function QuoteIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 14.5 3 17V5.25A1.75 1.75 0 0 1 4.75 3.5h10.5A1.75 1.75 0 0 1 17 5.25v7.5a1.75 1.75 0 0 1-1.75 1.75z" />
      <path d="M7 8h6M7 11h4" />
    </svg>
  );
}
