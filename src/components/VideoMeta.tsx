"use client";

import { useLayoutEffect, useRef } from "react";
import { FormatIcon } from "./FormatIcon";
import { FORMATS, SPONSORSHIPS, STATUSES, statusOf, type CaptionPlatform, type Sponsorship, type VideoFormat, type VideoStatus } from "@/lib/types";

export type Meta = {
  title: string;
  liveDate: string | null;
  format: VideoFormat;
  status: VideoStatus;
  sponsored?: Sponsorship;
  captions?: CaptionPlatform[];
  brief?: string;
  briefLinks?: { id: string; label: string; url: string }[];
  /** Brand partner ("Partner Sponsor"), picked from Brand deals */
  partnerId?: string | null;
};

export type PartnerOption = { id: string; name: string; logoUrl: string | null };

export function longDate(d: string | null) {
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** The big script title. */
export function VideoTitle({
  meta,
  onChange,
  readOnly,
  onEnter,
}: {
  meta: Meta;
  onChange?: (patch: Partial<Meta>) => void;
  readOnly?: boolean;
  onEnter?: () => void;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [meta.title]);

  const titleCls = "m-0 text-[36px] font-semibold leading-[1.2] tracking-[-0.015em] text-(--c-t-1b1b1b)";
  return (
    <>
      {readOnly ? (
        <h1 className={`${titleCls} ${meta.title ? "" : "text-(--c-t-c9c9c9)"}`}>{meta.title || "Untitled"}</h1>
      ) : (
        <textarea
          ref={ta}
          rows={1}
          value={meta.title}
          placeholder="Untitled"
          aria-label="Title"
          onChange={(e) => onChange?.({ title: e.target.value.replace(/\n/g, " ") })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter?.();
            }
          }}
          className={`${titleCls} block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-(--c-t-c9c9c9)`}
        />
      )}
    </>
  );
}

/** Live date / Format / Status / Sponsored. */
export function VideoDetails({
  meta,
  onChange,
  readOnly,
  partners,
}: {
  meta: Meta;
  onChange?: (patch: Partial<Meta>) => void;
  readOnly?: boolean;
  /** Brand partners to pick from; the Partner Sponsor row shows only when given */
  partners?: PartnerOption[];
}) {
  const partner = partners?.find((p) => p.id === meta.partnerId) ?? null;
  const format = FORMATS.find((f) => f.value === meta.format)?.label;
  const fieldCls =
    "-ml-1.5 w-fit cursor-pointer appearance-none rounded-md bg-transparent px-1.5 py-0.5 text-[14px] text-(--c-t-1b1b1b) outline-none hover:bg-(--c-b-f4f4f4) focus:bg-(--c-b-f4f4f4)";

  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 pl-0.5 text-[14px] leading-[1.5]">
      <div className="text-(--c-t-737373)">Live date</div>
      {readOnly ? (
        <div className="text-(--c-t-1b1b1b)">{meta.liveDate ? longDate(meta.liveDate) : <span className="text-(--c-t-9a9a9a)">Not set</span>}</div>
      ) : (
        <label className="relative w-fit">
          <span className={`${fieldCls} block ${meta.liveDate ? "" : "text-(--c-t-9a9a9a)"}`}>
            {meta.liveDate ? longDate(meta.liveDate) : "Pick a date"}
          </span>
          <input
            type="date"
            aria-label="Live date"
            value={meta.liveDate ?? ""}
            onChange={(e) => onChange?.({ liveDate: e.target.value || null })}
            onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      )}
      <div className="text-(--c-t-737373)">Format</div>
      {readOnly ? (
        <div className="flex items-center" title={format}>
          <FormatIcon format={meta.format} />
        </div>
      ) : (
        <label className={`${fieldCls} relative flex items-center py-1`} title={format}>
          <FormatIcon format={meta.format} />
          <select
            aria-label="Format"
            value={meta.format}
            onChange={(e) => onChange?.({ format: e.target.value as VideoFormat })}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="text-(--c-t-737373)">Status</div>
      {readOnly ? (
        <div className="text-(--c-t-1b1b1b)">{statusOf(meta.status).label}</div>
      ) : (
        <select
          aria-label="Status"
          value={meta.status}
          onChange={(e) => onChange?.({ status: e.target.value as VideoStatus })}
          className={fieldCls}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      )}
      <div className="text-(--c-t-737373)">Sponsored</div>
      {readOnly ? (
        <div className="text-(--c-t-1b1b1b)">{SPONSORSHIPS.find((x) => x.value === (meta.sponsored ?? "none"))?.label}</div>
      ) : (
        <select
          aria-label="Sponsored"
          value={meta.sponsored ?? "none"}
          onChange={(e) => onChange?.({ sponsored: e.target.value as Sponsorship })}
          className={`${fieldCls} ${(meta.sponsored ?? "none") === "none" ? "text-(--c-t-9a9a9a)" : ""}`}
        >
          {SPONSORSHIPS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      )}
      {partners && (
        <>
          <div className="text-(--c-t-737373)">Partner Sponsor</div>
          {readOnly ? (
            <div className="flex items-center gap-2 text-(--c-t-1b1b1b)">
              {partner ? (
                <>
                  <PartnerLogo p={partner} size={18} />
                  {partner.name}
                </>
              ) : (
                <span className="text-(--c-t-9a9a9a)">None</span>
              )}
            </div>
          ) : (
            // Linked to Brand deals: only partners from that list can be picked
            <label className={`${fieldCls} relative flex items-center gap-2 ${partner ? "" : "text-(--c-t-9a9a9a)"}`}>
              {partner && <PartnerLogo p={partner} size={18} />}
              <span>{partner ? partner.name : "Pick a partner"}</span>
              <select
                aria-label="Partner Sponsor"
                value={meta.partnerId ?? ""}
                onChange={(e) => onChange?.({ partnerId: e.target.value || null })}
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                <option value="">None</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
    </div>
  );
}

/** A brand partner's logo (or its initial when there's none). */
export function PartnerLogo({ p, size, className = "" }: { p: { name: string; logoUrl: string | null }; size: number; className?: string }) {
  if (p.logoUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={p.logoUrl}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-[22%] bg-white object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[22%] bg-(--c-b-ececea) font-semibold text-(--c-t-6b6b6b) ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
    >
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
