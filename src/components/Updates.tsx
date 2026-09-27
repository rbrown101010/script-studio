"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { linkify } from "./Brief";
import { IconChevron, IconLink, IconPlus, IconSparkle, IconTrash } from "./icons";

/** The Updates tab: what happened on this video, newest first. Agents add to it; team members can too. */
export function Updates({ videoId, readOnly }: { videoId: string; readOnly?: boolean }) {
  const updates = useQuery(api.updates.list, { videoId: videoId as Id<"videos"> });
  const add = useMutation(api.updates.add);
  const remove = useMutation(api.updates.remove);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  if (updates === undefined) return <div className="h-10" />;

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="pt-1">
      {!readOnly &&
        (adding ? (
          <AddForm
            onCancel={() => setAdding(false)}
            onSave={async (u) => {
              await add({ videoId: videoId as Id<"videos">, ...u });
              setAdding(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mb-2 inline-flex h-[30px] items-center gap-2 text-[14px] text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"
          >
            <IconPlus />
            Add update
          </button>
        ))}

      {updates.length === 0 ? (
        <p className="m-0 py-2 text-[14px] text-(--c-t-9a9a9a)">No updates yet. New emails, calls and approvals about this video get logged here.</p>
      ) : (
        <ol className="m-0 list-none p-0">
          {updates.map((u) => {
            const isOpen = open.has(u.id);
            const expandable = !!u.details.trim();
            return (
              <li key={u.id} className="group relative border-b border-(--c-l-f0f0f0) last:border-0">
                <div className="flex items-start gap-3 py-2.5">
                  <time className="w-[62px] shrink-0 pt-px font-mono text-[12px] text-(--c-t-9a9a9a)" dateTime={new Date(u.happenedAt).toISOString()}>
                    {shortDate(u.happenedAt)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      disabled={!expandable}
                      aria-expanded={expandable ? isOpen : undefined}
                      onClick={() => toggle(u.id)}
                      className="flex w-full items-start gap-1.5 text-left enabled:cursor-pointer"
                    >
                      <span className="min-w-0 flex-1 text-[14px] font-medium leading-[1.45] text-(--c-t-1b1b1b)">{u.title}</span>
                      {expandable && (
                        <span className="mt-0.5 shrink-0 text-(--c-t-9a9a9a)">
                          <IconChevron open={isOpen} />
                        </span>
                      )}
                    </button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-(--c-t-737373)">
                      {u.source && <span className="rounded bg-(--c-b-f4f4f4) px-1.5 py-px text-(--c-t-6b6b6b)">{u.source}</span>}
                      {u.link && (
                        <a href={u.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-(--c-t-2358d8) no-underline hover:underline">
                          <IconLink size={12} />
                          Open {u.source ? u.source.toLowerCase() : "link"}
                        </a>
                      )}
                      {u.authorName && (
                        <span className="inline-flex items-center gap-1">
                          {u.agent && <IconSparkle size={11} />}
                          {u.authorName}
                        </span>
                      )}
                    </div>
                    {isOpen && expandable && (
                      <p className="m-0 mt-2 whitespace-pre-wrap break-words rounded-lg bg-(--c-b-fafafa) px-3 py-2.5 text-[14px] leading-[1.55] text-(--c-t-262626)">
                        {linkify(u.details)}
                      </p>
                    )}
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={`Delete update: ${u.title}`}
                      onClick={() => {
                        if (confirm(`Delete this update? "${u.title}"`)) void remove({ id: u.id });
                      }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-(--c-t-9a9a9a) opacity-0 hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-b42318) focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <IconTrash />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function shortDate(t: number) {
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", year: "2-digit" });
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const inputCls =
  "w-full rounded-lg border border-(--c-l-e5e5e5) bg-(--c-b-ffffff) px-2.5 py-1.5 text-[14px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-b0b0b0) focus:border-(--c-l-c9c9c9)";

function AddForm({
  onSave,
  onCancel,
}: {
  onSave: (u: { title: string; details: string; link: string | null; source: string | null; happenedAt: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [source, setSource] = useState("");
  const [link, setLink] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return setError("Give the update a title.");
        if (link.trim() && !/^https?:\/\//i.test(link.trim())) return setError("The link must start with https://");
        setBusy(true);
        try {
          await onSave({
            title,
            details,
            link: link.trim() || null,
            source: source.trim() || null,
            happenedAt: new Date(`${date}T12:00:00`).getTime() || Date.now(),
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't save the update");
          setBusy(false);
        }
      }}
      className="mb-3 flex flex-col gap-2 rounded-xl border border-(--c-l-ebebeb) p-3"
    >
      <input id="update-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What happened?" className={`${inputCls} font-medium`} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_140px_minmax(0,1fr)]">
        <input id="update-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={inputCls} />
        <input id="update-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Email, Slack…" aria-label="Source" list="update-sources" className={inputCls} />
        <input id="update-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link to the conversation" aria-label="Link" inputMode="url" className={inputCls} />
      </div>
      <datalist id="update-sources">
        {["Email", "Slack", "Notion", "Call", "Meeting", "Contract"].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <textarea id="update-details" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Details (optional)" rows={3} className={`${inputCls} resize-y leading-[1.55]`} />
      {error && <p className="m-0 text-[13px] text-(--c-t-b42318)">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-8 rounded-lg px-3 text-[14px] text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="h-8 rounded-lg bg-(--c-b-1b1b1b) px-3.5 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-50">
          Add update
        </button>
      </div>
    </form>
  );
}
