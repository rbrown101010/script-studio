"use client";

import { useMutation, useQuery } from "convex/react";
import { Component, useMemo, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LinkCard } from "./LinkCard";
import { IconPlus, IconTrash } from "./icons";

export type AgentTool = "grokbot" | "muse" | "dot" | "chatgpt" | "claudeCode";

/** The tags, in the order they show */
export const AGENT_TOOLS: { id: AgentTool; name: string; color: string }[] = [
  { id: "grokbot", name: "GrokBot", color: "#6b6b6b" },
  { id: "muse", name: "Muse", color: "#2f6fed" },
  { id: "dot", name: "Dot", color: "#10a37f" },
  { id: "chatgpt", name: "ChatGPT desktop", color: "#7c5cff" },
  { id: "claudeCode", name: "Claude Code", color: "#d97757" },
];
const TOOL = Object.fromEntries(AGENT_TOOLS.map((t) => [t.id, t])) as Record<AgentTool, (typeof AGENT_TOOLS)[number]>;

type Update = {
  id: Id<"agentUpdates">;
  tool: AgentTool;
  date: string;
  title: string;
  summary: string;
  link: string | null;
  tweets: string[];
  authorName: string | null;
  agent: boolean;
};

const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** Agent updates: what GrokBot, Muse, Dot, ChatGPT desktop and Claude Code shipped, by day, with their tweets. */
export function AgentUpdates() {
  return (
    <Guard>
      <AgentUpdatesInner />
    </Guard>
  );
}

function AgentUpdatesInner() {
  const updates = useQuery(api.agentUpdates.list) as Update[] | undefined;
  const [tag, setTag] = useState<AgentTool | "all">("all");
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of updates ?? []) c[u.tool] = (c[u.tool] ?? 0) + 1;
    return c;
  }, [updates]);
  const days = useMemo(() => {
    const out: { date: string; items: Update[] }[] = [];
    for (const u of updates ?? []) {
      if (tag !== "all" && u.tool !== tag) continue;
      const last = out[out.length - 1];
      if (last?.date === u.date) last.items.push(u);
      else out.push({ date: u.date, items: [u] });
    }
    return out;
  }, [updates, tag]);

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="flex flex-wrap items-center gap-2">
        <TagButton active={tag === "all"} onClick={() => setTag("all")} label="All" count={updates?.length} />
        {AGENT_TOOLS.map((t) => (
          <TagButton key={t.id} active={tag === t.id} onClick={() => setTag(tag === t.id ? "all" : t.id)} label={t.name} color={t.color} count={counts[t.id] ?? 0} />
        ))}
        <button
          type="button"
          onClick={() => setAdding(!adding)}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-full bg-(--c-b-ffffff) px-3.5 text-[13px] text-(--c-t-6b6b6b) ring-1 ring-(--c-l-e3e3e0) hover:text-(--c-t-1b1b1b)"
        >
          <IconPlus size={14} />
          Add update
        </button>
      </div>

      {adding && <AddUpdate tool={tag === "all" ? "grokbot" : tag} onDone={() => setAdding(false)} />}

      <div className="mt-8">
        {updates === undefined ? (
          <p className="text-[14px] text-(--c-t-8a8a8a)">Loading…</p>
        ) : days.length === 0 ? (
          <p className="mt-10 text-center text-[14px] text-(--c-t-737373)">No updates yet.</p>
        ) : (
          days.map((d) => (
            <section key={d.date} className="mb-10">
              <h2 className="m-0 mb-3 text-[13px] font-medium text-(--c-t-8a8a8a)">{dayLabel(d.date)}</h2>
              <div className="flex flex-col gap-6">
                {d.items.map((u) => (
                  <UpdateItem key={u.id} u={u} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function TagButton({ active, onClick, label, color, count }: { active: boolean; onClick: () => void; label: string; color?: string; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] ring-1 ${
        active
          ? "bg-(--c-b-1b1b1b) font-medium text-(--c-on-ink) ring-(--c-l-1b1b1b)"
          : "bg-(--c-b-ffffff) text-(--c-t-6b6b6b) ring-(--c-l-e3e3e0) hover:text-(--c-t-1b1b1b)"
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {label}
      {count !== undefined && <span className={active ? "opacity-70" : "text-(--c-t-9a9a9a)"}>{count}</span>}
    </button>
  );
}

function UpdateItem({ u }: { u: Update }) {
  const remove = useMutation(api.agentUpdates.remove);
  const [confirming, setConfirming] = useState(false);
  const t = TOOL[u.tool];
  return (
    <article className="group/upd">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] text-(--c-t-737373)">
            <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
            {t.name}
          </div>
          <h3 className="m-0 mt-1 text-[16px] font-semibold leading-[1.35] text-(--c-t-1b1b1b)">{u.title}</h3>
          {u.summary && <p className="m-0 mt-1 whitespace-pre-wrap text-[14px] leading-[1.55] text-(--c-t-2e2e2e)">{u.summary}</p>}
          {u.link && (
            <a href={u.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[13px] text-(--c-t-2358d8) no-underline hover:underline">
              {hostOf(u.link)} ↗
            </a>
          )}
        </div>
        <button
          type="button"
          title={confirming ? "Press again to delete" : "Delete"}
          aria-label="Delete update"
          onClick={() => (confirming ? void remove({ id: u.id }) : setConfirming(true))}
          onBlur={() => setConfirming(false)}
          className={`flex h-8 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] ${
            confirming ? "bg-(--c-b-1b1b1b) text-(--c-on-ink)" : "text-(--c-t-9a9a9a) opacity-0 hover:text-(--c-t-1b1b1b) focus-visible:opacity-100 group-hover/upd:opacity-100"
          }`}
        >
          <IconTrash size={14} />
          {confirming && "Delete"}
        </button>
      </div>
      {u.tweets.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {u.tweets.map((url) => (
            <div key={url} className="min-w-0">
              <LinkCard url={url} />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function AddUpdate({ tool: initial, onDone }: { tool: AgentTool; onDone: () => void }) {
  const add = useMutation(api.agentUpdates.add);
  const [tool, setTool] = useState<AgentTool>(initial);
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [links, setLinks] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const urls = links.split(/\s+/).filter(Boolean);
    const tweets = urls.filter((u) => /(x|twitter)\.com\/[^/]+\/status/i.test(u));
    const link = urls.find((u) => !tweets.includes(u)) ?? null;
    setBusy(true);
    setError("");
    try {
      await add({ tool, date, title, summary, link, tweets });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*ConvexError: /, "").split("\n")[0] : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-xl border-none bg-(--c-b-f7f7f5) px-3 py-2 text-[14px] text-(--c-t-1b1b1b) outline-none ring-1 ring-(--c-l-e3e3e0) focus:ring-(--c-l-c9c9c6)";
  return (
    <div className="mt-4 rounded-2xl bg-(--c-b-ffffff) p-4 ring-1 ring-(--c-l-e8e8e5)">
      <div className="flex flex-wrap gap-2">
        <select value={tool} onChange={(e) => setTool(e.target.value as AgentTool)} className={`${field} w-auto`} aria-label="Tool">
          {AGENT_TOOLS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} w-auto`} aria-label="Date" />
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What shipped" className={`${field} mt-2`} aria-label="Title" />
      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary (optional)" rows={2} className={`${field} mt-2 resize-y`} aria-label="Summary" />
      <textarea
        value={links}
        onChange={(e) => setLinks(e.target.value)}
        placeholder="Tweet links and the announcement link, one per line"
        rows={2}
        className={`${field} mt-2 resize-y`}
        aria-label="Links"
      />
      {error && <p className="m-0 mt-2 text-[13px] text-[#c0392b]">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onDone} className="h-9 rounded-full px-4 text-[13px] text-(--c-t-6b6b6b) hover:text-(--c-t-1b1b1b)">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={() => void save()}
          className="h-9 rounded-full bg-(--c-b-1b1b1b) px-4 text-[13px] font-medium text-(--c-on-ink) disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

/** If the backend isn't there yet (new functions not deployed), say so instead of breaking the page. */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p className="mt-10 text-center text-[14px] text-(--c-t-737373)">Agent updates couldn&apos;t load. Try again in a minute.</p> : this.props.children;
  }
}
