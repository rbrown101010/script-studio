"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { uid } from "@/lib/util";
import { IconLink, IconPlus, IconX } from "./icons";

export type BriefLink = { id: string; label: string; url: string };

/** The brief for the video (sponsor notes, delivery requirements) plus its links. Internal only. */
export function Brief({
  value,
  onChange,
  links = [],
  onLinksChange,
  readOnly,
}: {
  value: string;
  onChange?: (v: string) => void;
  links?: BriefLink[];
  onLinksChange?: (links: BriefLink[]) => void;
  readOnly?: boolean;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, 320)}px`;
  }, [value]);

  return (
    <div className="flex flex-col gap-4 pt-1">
      {readOnly ? (
        value.trim() ? (
          <p className="m-0 whitespace-pre-wrap break-words text-[15px] leading-[1.6] text-(--c-t-1b1b1b)">{linkify(value)}</p>
        ) : (
          <p className="m-0 py-2 text-[14px] text-(--c-t-9a9a9a)">No brief yet.</p>
        )
      ) : (
        <textarea
          ref={ta}
          value={value}
          aria-label="Brief"
          placeholder="Paste or write the marketing brief for this video"
          onChange={(e) => onChange?.(e.target.value)}
          className="block w-full resize-none overflow-hidden rounded-lg border border-(--c-l-e5e5e5) bg-(--c-b-ffffff) px-3 py-2.5 text-[15px] leading-[1.6] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-b0b0b0) focus:border-(--c-l-c9c9c9)"
        />
      )}
      <BriefLinks links={links} onChange={readOnly ? undefined : onLinksChange} />
    </div>
  );
}

/** Where a link points, in words people recognize. */
function kindOf(url: string) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
  if (host === "docs.google.com") return /\/spreadsheets\//.test(url) ? "Google Sheets" : /\/presentation\//.test(url) ? "Google Slides" : "Google Docs";
  if (host === "drive.google.com") return "Google Drive";
  if (host === "mail.google.com") return "Gmail";
  if (host.endsWith("slack.com")) return "Slack";
  if (host.endsWith("notion.so") || host.endsWith("notion.com")) return "Notion";
  if (host.endsWith("docusign.net") || host.endsWith("docusign.com")) return "DocuSign";
  if (host.endsWith("figma.com")) return "Figma";
  return host;
}

function BriefLinks({ links, onChange }: { links: BriefLink[]; onChange?: (links: BriefLink[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  if (!onChange && !links.length) return null;

  const save = () => {
    const u = url.trim();
    if (!u) return setAdding(false);
    if (!/^https?:\/\//i.test(u)) return setError("Links start with https://");
    onChange?.([...links, { id: uid(), url: u, label: label.trim() || kindOf(u) }]);
    setUrl("");
    setLabel("");
    setError("");
    setAdding(false);
  };

  return (
    <section aria-label="Brief links">
      <div className="mb-1.5 text-[12px] font-medium text-(--c-t-737373)">Links</div>
      {links.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {links.map((l) => (
            <li key={l.id} className="group flex items-center gap-2.5 rounded-lg border border-(--c-l-ebebeb) px-3 py-2 hover:border-(--c-l-dcdcdc)">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-(--c-b-f4f4f4) text-(--c-t-6b6b6b)">
                <IconLink size={14} />
              </span>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 no-underline">
                <span className="block truncate text-[14px] font-medium text-(--c-t-2358d8) underline decoration-(--c-t-2358d8)/30 underline-offset-2 hover:decoration-(--c-t-2358d8)">
                  {l.label}
                </span>
                <span className="block truncate text-[12px] text-(--c-t-9a9a9a)">{kindOf(l.url)}</span>
              </a>
              {onChange && (
                <button
                  type="button"
                  aria-label={`Remove link ${l.label}`}
                  onClick={() => onChange(links.filter((x) => x.id !== l.id))}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-(--c-t-9a9a9a) opacity-0 hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b) focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <IconX size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {onChange &&
        (adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="mt-1.5 flex flex-col gap-2 sm:flex-row"
          >
            <input
              id="brief-link-url"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a link (doc, contract, email thread…)"
              inputMode="url"
              className={inputCls}
            />
            <input id="brief-link-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name (optional)" className={`${inputCls} sm:max-w-[200px]`} />
            <div className="flex gap-2">
              <button type="submit" className="h-[34px] rounded-lg bg-(--c-b-1b1b1b) px-3 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333)">
                Add
              </button>
              <button type="button" onClick={() => setAdding(false)} className="h-[34px] rounded-lg px-3 text-[14px] text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)">
                Cancel
              </button>
            </div>
            {error && <p className="m-0 self-center text-[13px] text-(--c-t-b42318)">{error}</p>}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-1 inline-flex h-[30px] items-center gap-2 text-[14px] text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"
          >
            <IconPlus />
            Add link
          </button>
        ))}
    </section>
  );
}

const inputCls =
  "min-w-0 flex-1 rounded-lg border border-(--c-l-e5e5e5) bg-(--c-b-ffffff) px-2.5 py-1.5 text-[14px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-b0b0b0) focus:border-(--c-l-c9c9c9)";

/** Text with its URLs turned into clearly styled links. */
export function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s<>"']+)/g).map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part;
    const url = part.replace(/[).,!?]+$/, "");
    const tail = part.slice(url.length);
    return (
      <span key={i}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-(--c-t-2358d8) underline decoration-(--c-t-2358d8)/35 underline-offset-2 hover:decoration-(--c-t-2358d8)"
        >
          {url.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
        {tail}
      </span>
    );
  });
}
