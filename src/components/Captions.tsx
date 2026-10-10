"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CAPTION_PLATFORMS, type CaptionPlatform } from "@/lib/types";
import { uid } from "@/lib/util";
import { IconCheck, IconPlus, IconX } from "./icons";

const blank = (platform: string): CaptionPlatform => ({ id: uid(), platform, caption: "", linkInBio: "", posted: false, fields: [] });

const isEmpty = (c: CaptionPlatform) => !c.caption.trim() && !c.linkInBio.trim() && c.fields.every((f) => !f.label.trim() && !f.value.trim());

/** Per-platform captions, each with a link in bio, custom fields and a Posted check. */
export function Captions({
  captions,
  onChange,
  readOnly,
}: {
  captions: CaptionPlatform[];
  onChange?: (next: CaptionPlatform[]) => void;
  readOnly?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);
  const set = (id: string, patch: Partial<CaptionPlatform>) => onChange?.(captions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const shown = readOnly ? captions.filter((c) => !isEmpty(c)) : captions;

  if (readOnly && !shown.length) return <p className="m-0 py-2 text-[14px] text-(--c-t-9a9a9a)">No captions yet.</p>;

  const add = (platform: string) => {
    const p = platform.trim();
    if (p) onChange?.([...captions, blank(p)]);
  };
  const addOther = () => {
    add(name);
    setName("");
    setAdding(false);
  };
  const used = new Set(captions.map((c) => c.platform.toLowerCase()));
  const choices = CAPTION_PLATFORMS.filter((p) => !used.has(p.toLowerCase()));

  return (
    <div className="flex flex-col gap-3 pt-1">
      {!readOnly && !captions.length && <p className="m-0 text-[14px] text-(--c-t-9a9a9a)">No captions yet. Add one for each platform you&apos;ll post on.</p>}
      {shown.map((c) => (
        <section key={c.id} aria-label={`${c.platform} caption`} className="rounded-xl border border-(--c-l-ebebeb) px-4 pb-3.5 pt-3">
          <div className="flex items-center justify-between gap-2">
            {readOnly ? (
              <h3 className="m-0 text-[14px] font-semibold text-(--c-t-1b1b1b)">{c.platform}</h3>
            ) : (
              <input
                value={c.platform}
                aria-label="Platform"
                onChange={(e) => set(c.id, { platform: e.target.value })}
                className="-ml-1.5 min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-0.5 text-[14px] font-semibold text-(--c-t-1b1b1b) outline-none hover:bg-(--c-b-f4f4f4) focus:bg-(--c-b-f4f4f4)"
              />
            )}
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={readOnly}
                aria-pressed={c.posted}
                onClick={() => set(c.id, { posted: !c.posted })}
                className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium ${
                  c.posted ? "bg-(--c-b-e6f4ea) text-(--c-t-15803d)" : "text-(--c-t-737373) enabled:hover:bg-(--c-b-f4f4f4)"
                } ${readOnly && !c.posted ? "hidden" : ""}`}
              >
                {c.posted ? <IconCheck size={13} /> : <span className="h-3 w-3 rounded-full border border-(--c-l-c9c9c9)" aria-hidden="true" />}
                {c.posted ? "Posted" : "Not posted"}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`Remove ${c.platform || "platform"}`}
                  title="Remove platform"
                  onClick={() => {
                    if (!isEmpty(c) && !confirm(`Remove ${c.platform || "this platform"} and its caption?`)) return;
                    onChange?.(captions.filter((x) => x.id !== c.id));
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-(--c-t-9a9a9a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b)"
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
          </div>

          <Field label="Caption">
            {readOnly ? (
              <p className="m-0 whitespace-pre-wrap text-[14px] leading-[1.55] text-(--c-t-1b1b1b)">{c.caption || <Muted />}</p>
            ) : (
              <AutoText value={c.caption} placeholder="Write the caption" onChange={(v) => set(c.id, { caption: v })} />
            )}
          </Field>
          <Field label="Link in bio">
            {readOnly ? (
              c.linkInBio ? (
                <a href={linkHref(c.linkInBio)} target="_blank" rel="noreferrer" className="break-all text-[14px] text-(--c-t-2358d8)">
                  {c.linkInBio}
                </a>
              ) : (
                <Muted />
              )
            ) : (
              <input
                value={c.linkInBio}
                placeholder="Paste a link"
                inputMode="url"
                onChange={(e) => set(c.id, { linkInBio: e.target.value })}
                className={inputCls}
              />
            )}
          </Field>
          {c.fields
            .filter((f) => !readOnly || f.label.trim() || f.value.trim())
            .map((f) => (
              <div key={f.id} className="mt-2.5">
                {readOnly ? (
                  <>
                    <div className={labelCls}>{f.label || "Field"}</div>
                    <p className="m-0 whitespace-pre-wrap text-[14px] leading-[1.55] text-(--c-t-1b1b1b)">{f.value || <Muted />}</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1">
                      <input
                        value={f.label}
                        placeholder="Field name"
                        aria-label="Field name"
                        onChange={(e) => set(c.id, { fields: c.fields.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)) })}
                        className={`${labelCls} -ml-1.5 min-w-0 flex-1 rounded-md bg-transparent px-1.5 outline-none hover:bg-(--c-b-f4f4f4) focus:bg-(--c-b-f4f4f4)`}
                      />
                      <button
                        type="button"
                        aria-label="Remove field"
                        onClick={() => set(c.id, { fields: c.fields.filter((x) => x.id !== f.id) })}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-(--c-t-9a9a9a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b)"
                      >
                        <IconX size={12} />
                      </button>
                    </div>
                    <AutoText
                      value={f.value}
                      placeholder="Value"
                      onChange={(v) => set(c.id, { fields: c.fields.map((x) => (x.id === f.id ? { ...x, value: v } : x)) })}
                    />
                  </>
                )}
              </div>
            ))}
          {!readOnly && (
            <button
              type="button"
              onClick={() => set(c.id, { fields: [...c.fields, { id: uid(), label: "", value: "" }] })}
              className="mt-2.5 inline-flex h-7 items-center gap-1.5 text-[13px] text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"
            >
              <IconPlus size={13} />
              Add custom field
            </button>
          )}
        </section>
      ))}

      {!readOnly &&
        (adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addOther();
            }}
          >
            <input
              autoFocus
              value={name}
              placeholder="Platform name"
              onChange={(e) => setName(e.target.value)}
              onBlur={addOther}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setName("");
                  setAdding(false);
                }
              }}
              className={`${inputCls} max-w-[280px]`}
            />
          </form>
        ) : (
          <div ref={menuRef} className="relative w-fit">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
              className="inline-flex h-[30px] items-center gap-2 text-[14px] text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"
            >
              <IconPlus />
              Add caption
            </button>
            {menu && (
              <div role="menu" className="absolute left-0 top-9 z-40 w-52 rounded-xl border border-(--c-l-ebebeb) bg-(--c-popover) p-1.5 shadow-(--shadow-menu)">
                {choices.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      add(p);
                      setMenu(false);
                    }}
                    className="block w-full rounded-md px-2 py-1.5 text-left text-[14px] text-(--c-t-1b1b1b) hover:bg-(--c-b-f4f4f4)"
                  >
                    {p}
                  </button>
                ))}
                {choices.length > 0 && <div className="mx-1 my-1 h-px bg-(--c-b-ebebeb)" />}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setAdding(true);
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-[14px] text-(--c-t-737373) hover:bg-(--c-b-f4f4f4)"
                >
                  Other…
                </button>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

const labelCls = "text-[12px] font-medium text-(--c-t-737373)";
const inputCls =
  "w-full rounded-lg border border-(--c-l-e5e5e5) bg-(--c-card) px-2.5 py-1.5 text-[14px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-b0b0b0) focus:border-(--c-l-c9c9c9)";

const linkHref = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);

function Muted() {
  return <span className="text-[14px] text-(--c-t-9a9a9a)">Not set</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-2.5 block">
      <div className={`${labelCls} mb-1`}>{label}</div>
      {children}
    </label>
  );
}

function AutoText({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ta}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} block resize-none overflow-hidden leading-[1.55]`}
    />
  );
}
