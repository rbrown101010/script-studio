"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { uploadToUrl } from "@/lib/upload";
import { FORMATS, SPONSORSHIPS, statusOf } from "@/lib/types";
import { FormatIcon } from "./FormatIcon";
import { PartnerLogo, longDate } from "./VideoMeta";
import { IconArrowLeft, IconPlus, IconTrash } from "./icons";

type Partner = { id: Id<"partners">; name: string; website: string | null; logoUrl: string | null; details: string; videoCount: number };

/** Brand deals: every partner as a logo card; open one for its details and its videos. */
export function BrandDeals() {
  const partners = useQuery(api.partners.list) as Partner[] | undefined;
  const [openId, setOpenId] = useState<Id<"partners"> | null>(null);
  const [adding, setAdding] = useState(false);

  if (openId) return <PartnerPage id={openId} onBack={() => setOpenId(null)} />;

  return (
    <div className="mx-auto max-w-[1080px]">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="m-0 flex-1 text-[28px] font-semibold tracking-[-0.015em] text-(--c-t-1b1b1b)">Brand deals</h1>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--c-b-1b1b1b) px-3.5 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333)"
        >
          <IconPlus color="var(--c-on-ink)" />
          Add partner
        </button>
      </div>
      {adding && <AddPartner onDone={(id) => (setAdding(false), id && setOpenId(id))} />}
      {!partners ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-[148px] animate-pulse rounded-2xl bg-(--c-b-ececea)" />
          ))}
        </div>
      ) : partners.length === 0 ? (
        <p className="mt-16 text-center text-[14px] text-(--c-t-8a8a8a)">No partners yet. Add the brands you work with.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {partners.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setOpenId(p.id)}
              className="flex flex-col items-center gap-3 rounded-2xl bg-(--c-card) px-4 pb-4 pt-6 text-center ring-1 ring-(--c-l-e3e3e0) transition-shadow hover:shadow-(--shadow-card-hover)"
            >
              <PartnerLogo p={p} size={56} className="ring-1 ring-(--c-hairline)" />
              <span className="w-full truncate text-[14px] font-medium text-(--c-t-1b1b1b)">{p.name}</span>
              <span className="-mt-2 text-[12px] text-(--c-t-9a9a9a)">
                {p.videoCount} {p.videoCount === 1 ? "video" : "videos"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AddPartner({ onDone }: { onDone: (id: Id<"partners"> | null) => void }) {
  const create = useMutation(api.partners.create);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      onDone(await create({ name, website: website || undefined }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl bg-(--c-card) p-4 ring-1 ring-(--c-l-e3e3e0)">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void save()}
        placeholder="Company name"
        aria-label="Company name"
        className="h-9 min-w-[180px] flex-1 rounded-lg border border-(--c-l-dcdcdc) bg-(--c-card) px-3 text-[14px] text-(--c-t-1b1b1b) outline-none focus:border-(--c-l-8a8a8a)"
      />
      <input
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void save()}
        placeholder="Website (for the logo), e.g. notion.com"
        aria-label="Website"
        className="h-9 min-w-[220px] flex-1 rounded-lg border border-(--c-l-dcdcdc) bg-(--c-card) px-3 text-[14px] text-(--c-t-1b1b1b) outline-none focus:border-(--c-l-8a8a8a)"
      />
      <button type="button" onClick={() => onDone(null)} className="h-9 rounded-lg px-3 text-[14px] text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)">
        Cancel
      </button>
      <button
        type="button"
        disabled={!name.trim() || busy}
        onClick={() => void save()}
        className="h-9 rounded-lg bg-(--c-b-1b1b1b) px-3.5 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}

/** One partner: logo, name, website, details, and its videos. Everything saves as you type. */
function PartnerPage({ id, onBack }: { id: Id<"partners">; onBack: () => void }) {
  const p = useQuery(api.partners.get, { id });
  const update = useMutation(api.partners.update);
  const remove = useMutation(api.partners.remove);
  const uploadUrl = useMutation(api.docs.generateUploadUrl);
  const setLogo = useMutation(api.partners.setLogo);
  const file = useRef<HTMLInputElement>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (p && details === null) setDetails(p.details);
  }, [p, details]);
  if (p === null) return <p className="text-[14px] text-(--c-t-8a8a8a)">This partner was deleted.</p>;
  if (!p) return null;

  const saveDetails = (text: string) => {
    setDetails(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void update({ id, details: text }), 600);
  };
  const upload = async (f: File) => {
    const url = await uploadUrl();
    const storageId = await uploadToUrl(url, f, () => {});
    await setLogo({ id, storageId: storageId as Id<"_storage"> });
  };
  const inputCls =
    "-ml-2 w-full rounded-md bg-transparent px-2 py-1 outline-none hover:bg-(--c-b-f4f4f4) focus:bg-(--c-b-f4f4f4)";

  return (
    <div className="mx-auto max-w-[860px]">
      <button type="button" onClick={onBack} className="-ml-2 mb-5 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[14px] text-(--c-t-6b6b6b) hover:bg-(--c-b-ececea)">
        <IconArrowLeft />
        Brand deals
      </button>

      <div className="flex items-start gap-5">
        <button type="button" onClick={() => file.current?.click()} title="Change logo" className="group relative shrink-0 rounded-[22%]">
          <PartnerLogo p={p} size={72} className="ring-1 ring-(--c-hairline)" />
          <span className="absolute inset-0 hidden items-center justify-center rounded-[22%] bg-black/50 text-[11px] font-medium text-white group-hover:flex">Change</span>
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        <div className="min-w-0 flex-1">
          <input
            key={`n-${p.name}`}
            defaultValue={p.name}
            onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && void update({ id, name: e.target.value })}
            aria-label="Partner name"
            className={`${inputCls} text-[28px] font-semibold tracking-[-0.015em] text-(--c-t-1b1b1b)`}
          />
          <input
            key={`w-${p.website}`}
            defaultValue={p.website ?? ""}
            onBlur={(e) => e.target.value !== (p.website ?? "") && void update({ id, website: e.target.value })}
            placeholder="Add website"
            aria-label="Website"
            className={`${inputCls} text-[14px] text-(--c-t-2358d8) placeholder:text-(--c-t-9a9a9a)`}
          />
        </div>
        <div className="relative shrink-0">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-8 rounded-lg px-2.5 text-[13px] text-(--c-t-6b6b6b) hover:bg-(--c-b-ececea)">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void remove({ id }).then(onBack)}
                className="h-8 rounded-lg bg-(--c-b-b42318) px-2.5 text-[13px] font-medium text-white hover:bg-(--c-b-c7301f)"
              >
                Delete partner
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} aria-label="Delete partner" title="Delete partner" className="flex h-8 w-8 items-center justify-center rounded-lg text-(--c-t-9a9a9a) hover:bg-(--c-b-ececea) hover:text-(--c-t-b42318)">
              <IconTrash size={16} />
            </button>
          )}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="m-0 mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-(--c-t-9a9a9a)">Details</h2>
        <textarea
          value={details ?? ""}
          onChange={(e) => saveDetails(e.target.value)}
          placeholder={"Agency, contacts, deal terms, rates, notes…"}
          aria-label="Details"
          rows={Math.max(5, (details ?? "").split("\n").length + 1)}
          className="w-full resize-none rounded-xl bg-(--c-card) p-4 text-[15px] leading-[1.6] text-(--c-t-1b1b1b) outline-none ring-1 ring-(--c-l-e3e3e0) placeholder:text-(--c-t-9a9a9a) focus:ring-(--c-l-c9c9c6)"
        />
      </section>

      <section className="mt-8">
        <h2 className="m-0 mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-(--c-t-9a9a9a)">
          Videos <span className="normal-case tracking-normal">· {p.videos.length}</span>
        </h2>
        {p.videos.length === 0 ? (
          <p className="text-[14px] text-(--c-t-8a8a8a)">No videos yet. Set Partner Sponsor in a script&apos;s Details to add one.</p>
        ) : (
          <div className="overflow-hidden rounded-xl bg-(--c-card) ring-1 ring-(--c-l-e3e3e0)">
            {p.videos.map((vid, i) => {
              const st = statusOf(vid.status);
              const sp = SPONSORSHIPS.find((s) => s.value === vid.sponsored);
              return (
                <Link
                  key={vid.id}
                  href={`/v/${vid.id}`}
                  className={`flex items-center gap-3 px-4 py-3 text-[14px] no-underline hover:bg-(--c-b-fafafa) ${i ? "border-t border-(--c-l-f0f0f0)" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-(--c-t-1b1b1b)">{vid.title || "Untitled"}</span>
                  {sp && sp.pill && <span className={`hidden rounded-md px-1.5 py-0.5 text-[12px] sm:inline ${sp.pill}`}>{sp.label}</span>}
                  <span className="flex items-center gap-1.5 text-[13px] text-(--c-t-6b6b6b)">
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: st.dot }} />
                    <span className="hidden sm:inline">{st.label}</span>
                  </span>
                  <span title={FORMATS.find((f) => f.value === vid.format)?.label}>
                    <FormatIcon format={vid.format} size={14} />
                  </span>
                  <span className="w-[92px] text-right text-[13px] text-(--c-t-9a9a9a)">{vid.liveDate ? longDate(vid.liveDate).replace(/^\w+, /, "") : "No date"}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
