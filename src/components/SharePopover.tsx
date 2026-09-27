"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { randomPasscode } from "@/lib/util";
import { IconCopy, IconGlobe, IconLock, IconRefresh, IconShare, IconX } from "./icons";
import { primaryButton, topButton } from "./ScriptLayout";

export function SharePopover({
  videoId,
  shareSlug,
  passcode,
  getText,
  icon,
  align = "right",
}: {
  videoId: string;
  shareSlug: string;
  passcode: string | null;
  /** The script as plain text, for "Copy all text" */
  getText?: () => string;
  /** Show as an icon button (in the sidebar) instead of the "Share" button */
  icon?: boolean;
  /** Which edge the popover lines up with */
  align?: "left" | "right";
}) {
  const update = useMutation(api.videos.update);
  const resetLink = useMutation(api.videos.resetShareLink);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [origin, setOrigin] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const id = videoId as Id<"videos">;

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const link = `${origin}/s/${shareSlug}`;
  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div ref={ref} className="relative">
      {icon ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label="Share"
          title="Share"
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${open ? "bg-(--c-b-e6e6e3) text-(--c-t-1b1b1b)" : "text-(--c-t-6b6b6b) hover:bg-(--c-b-ececea) hover:text-(--c-t-1b1b1b)"}`}
        >
          <IconShare size={18} />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(!open)} className={topButton} aria-expanded={open}>
          Share
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Share this script"
          className={`absolute ${align === "left" ? "-left-10" : "right-0"} top-11 z-40 flex w-[400px] max-w-[calc(100vw-32px)] flex-col gap-4 rounded-xl border border-(--c-l-ebebeb) bg-(--c-b-ffffff) p-5 shadow-[0_12px_32px_rgba(0,0,0,0.10),0_2px_6px_rgba(0,0,0,0.05)]`}
        >
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-[16px] font-semibold text-(--c-t-1b1b1b)">Share this script</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-md text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)"
            >
              <IconX />
            </button>
          </div>
          <div className="flex items-center gap-2.5 text-[14px] text-(--c-t-1b1b1b)">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--c-b-f4f4f4) text-(--c-t-6b6b6b)">
              <IconGlobe />
            </div>
            <div>
              <div className="font-medium">Anyone with the link can view</div>
              <div className="text-[13px] text-(--c-t-737373)">No sign-in needed</div>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              readOnly
              value={link.replace(/^https?:\/\//, "")}
              aria-label="Share link"
              onFocus={(e) => e.target.select()}
              className="h-10 min-w-0 flex-1 rounded-lg border border-(--c-l-dcdcdc) bg-(--c-b-fafafa) px-3 text-[13px] text-(--c-t-1b1b1b) outline-none"
            />
            <button type="button" onClick={() => copy(link, "link")} className={`${primaryButton} h-10`}>
              <IconCopy color="var(--c-on-ink)" />
              <span>{copied === "link" ? "Copied" : "Copy link"}</span>
            </button>
          </div>
          {getText && (
            <button
              type="button"
              onClick={() => copy(getText(), "text")}
              className={`${topButton} h-10 w-full justify-center`}
            >
              <IconCopy />
              <span>{copied === "text" ? "Copied the whole script" : "Copy all text"}</span>
            </button>
          )}
          <p className="m-0 text-[13px] leading-[1.5] text-(--c-t-737373)">
            This link opens only this script. People who have it can&apos;t see your other scripts or your home page.
          </p>

          <div className="flex flex-col gap-2.5 border-t border-(--c-l-ebebeb) pt-4">
            <div className="flex items-center gap-2.5 text-[14px] text-(--c-t-1b1b1b)">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--c-b-f4f4f4) text-(--c-t-6b6b6b)">
                <IconLock />
              </div>
              <div>
                <div className="font-medium">Editing</div>
                <div className="text-[13px] text-(--c-t-737373)">
                  {passcode ? "People with the passcode can suggest edits" : "Off. Viewers can only read."}
                </div>
              </div>
            </div>
            {editing ? (
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (code.trim().length < 4) return;
                  await update({ id, editPasscode: code.trim() });
                  setEditing(false);
                }}
              >
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-label="Passcode"
                  placeholder="At least 4 characters"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-(--c-l-dcdcdc) px-3 font-mono text-[14px] text-(--c-t-1b1b1b) outline-none focus:border-(--c-l-8a8a8a)"
                />
                <button className={`${primaryButton} h-10`} disabled={code.trim().length < 4}>
                  Save
                </button>
              </form>
            ) : passcode ? (
              <>
                <div className="flex gap-2">
                  <code className="flex h-10 flex-1 items-center rounded-lg bg-(--c-b-f4f4f4) px-3 font-mono text-[14px] tracking-wider text-(--c-t-1b1b1b)">
                    {passcode}
                  </code>
                  <button type="button" onClick={() => copy(passcode, "code")} className={`${topButton} h-10`}>
                    {copied === "code" ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="m-0 text-[13px] leading-[1.5] text-(--c-t-737373)">
                  Their changes never replace yours. You get them as an Edited version, with changes in red, and choose
                  what to keep.
                </p>
                <div className="flex gap-4 text-[13px]">
                  <button
                    type="button"
                    onClick={() => {
                      setCode(passcode);
                      setEditing(true);
                    }}
                    className="text-(--c-t-6b6b6b) hover:text-(--c-t-1b1b1b)"
                  >
                    Change passcode
                  </button>
                  <button type="button" onClick={() => update({ id, editPasscode: null })} className="text-(--c-t-6b6b6b) hover:text-(--c-t-b42318)">
                    Turn off editing
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCode(randomPasscode());
                  setEditing(true);
                }}
                className={`${topButton} w-fit`}
              >
                Create passcode
              </button>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-(--c-l-ebebeb) pt-3">
            <button
              type="button"
              onClick={async () => {
                if (!confirm("Reset the link? The current link will stop working for everyone who has it.")) return;
                await resetLink({ id });
              }}
              className="inline-flex h-9 items-center gap-1.5 text-[14px] text-(--c-t-6b6b6b) hover:text-(--c-t-1b1b1b)"
            >
              <IconRefresh />
              <span>Reset link</span>
            </button>
            <a href={link} target="_blank" rel="noopener noreferrer" className="text-[13px] text-(--c-t-2358d8) no-underline hover:text-(--c-t-163b99)">
              Preview as viewer
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
