"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { uploadToUrl } from "@/lib/upload";
import { IconPlus, IconTrash } from "./icons";

const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

/** The PDFs app: papers and documents to read and mark up. Upload, drop files here, or add one from a link. */
export function PdfList() {
  const pdfs = useQuery(api.pdfs.list);
  const create = useMutation(api.pdfs.create);
  const remove = useMutation(api.pdfs.remove);
  const uploadUrl = useMutation(api.docs.generateUploadUrl);
  const addFromLink = useAction(api.pdfs.addFromLink);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const [link, setLink] = useState("");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dropping, setDropping] = useState(false);

  const upload = async (files: File[]) => {
    const list = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (!list.length) return setError("Only PDF files can go here.");
    setError(null);
    setUploading(list.map((f) => ({ name: f.name, progress: 0 })));
    let last: string | null = null;
    for (const [i, f] of list.entries()) {
      try {
        const storageId = await uploadToUrl(await uploadUrl(), f, (p) => setUploading((u) => u.map((x, j) => (j === i ? { ...x, progress: p } : x))));
        last = await create({ storageId: storageId as Id<"_storage">, title: f.name.replace(/\.pdf$/i, "") });
      } catch {
        setError(`Couldn't upload ${f.name}. Try again.`);
      }
    }
    setUploading([]);
    // One PDF: open it straight away
    if (list.length === 1 && last) router.push(`/pdf/${last}`);
  };

  const addLink = async () => {
    const u = link.trim();
    if (!u || linking) return;
    setLinking(true);
    setError(null);
    try {
      const r = await addFromLink({ url: /^https?:\/\//i.test(u) ? u : `https://${u}` });
      setLink("");
      router.push(`/pdf/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^[\s\S]*ConvexError:\s*/, "").replace(/\s+at [\s\S]*$/, "") : "Couldn't add that link.");
    } finally {
      setLinking(false);
    }
  };

  const term = q.trim().toLowerCase();
  const shown = (pdfs ?? []).filter((p) => !term || `${p.title} ${p.authors ?? ""} ${p.about ?? ""}`.toLowerCase().includes(term));

  return (
    <div
      className="mx-auto max-w-[920px]"
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.015em] text-(--c-t-1b1b1b)">PDFs</h1>
          <p className="m-0 mt-1 text-[14px] text-(--c-t-737373)">Papers and documents to read, highlight and talk to yourself about.</p>
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--c-b-1b1b1b) px-3.5 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333)"
        >
          <IconPlus color="var(--c-on-ink)" />
          Upload PDF
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void upload(files);
          }}
        />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void addLink();
        }}
        className="mb-3 flex items-center gap-2 rounded-xl border border-(--c-l-e5e5e5) bg-(--c-b-ffffff) p-1.5 pl-3"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0 text-(--c-t-9a9a9a)" aria-hidden="true">
          <path d="M6.75 9.25a3 3 0 0 0 4.24 0l2.12-2.12a3 3 0 0 0-4.24-4.24l-.7.7M9.25 6.75a3 3 0 0 0-4.24 0L2.89 8.87a3 3 0 0 0 4.24 4.24l.7-.7" />
        </svg>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Add from a link: an arXiv page, or any .pdf address"
          aria-label="Add a PDF from a link"
          className="h-8 min-w-0 flex-1 bg-transparent text-[14px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a)"
        />
        <button type="submit" disabled={!link.trim() || linking} className="h-8 rounded-lg px-3 text-[13.5px] font-medium text-(--c-t-1b1b1b) hover:bg-(--c-b-f4f4f4) disabled:opacity-40">
          {linking ? "Adding…" : "Add"}
        </button>
      </form>
      {error && <p className="mb-3 text-[13px] text-(--c-t-b42318)">{error}</p>}
      {uploading.map((u) => (
        <div key={u.name} className="mb-2 flex items-center gap-3 rounded-lg bg-(--c-b-f4f4f4) px-3 py-2 text-[13px] text-(--c-t-4a4a4a)">
          <span className="min-w-0 flex-1 truncate">Uploading {u.name}</span>
          <span className="h-1 w-24 overflow-hidden rounded-full bg-(--c-b-dcdcdc)">
            <span className="block h-full bg-(--c-b-1b1b1b)" style={{ width: `${Math.round(u.progress * 100)}%` }} />
          </span>
        </div>
      ))}

      {(pdfs?.length ?? 0) > 6 && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search PDFs"
          aria-label="Search PDFs"
          className="mb-3 h-9 w-full rounded-lg border border-(--c-l-e5e5e5) bg-(--c-b-ffffff) px-3 text-[14px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a) focus:border-(--c-l-8a8a8a)"
        />
      )}

      <div className={`rounded-2xl transition-colors ${dropping ? "bg-(--c-b-f5f8ff) outline-2 outline-offset-4 outline-dashed outline-(--c-l-2358d8)" : ""}`}>
        {!pdfs ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-xl bg-(--c-b-ececea)" />
            ))}
          </div>
        ) : pdfs.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-(--c-l-dcdcdc) px-6 py-14 text-center text-[14px] text-(--c-t-8a8a8a)">
            Drop PDFs here, upload one, or paste a link above.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {shown.map((p) => (
              <div key={p.id} className="group relative">
                <button
                  type="button"
                  onClick={() => router.push(`/pdf/${p.id}`)}
                  className="flex w-full items-start gap-3.5 rounded-xl px-3 py-3 text-left hover:bg-(--c-b-f4f4f2)"
                >
                  <span className="flex h-[52px] w-[42px] shrink-0 flex-col justify-end rounded-[5px] bg-(--c-b-ffffff) p-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.12)] ring-1 ring-black/5">
                    <span className="rounded-[2px] bg-[#E24B3F] px-0.5 text-center text-[8.5px] font-bold tracking-[0.04em] text-white">PDF</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[15px] font-medium leading-[1.35] text-(--c-t-1b1b1b)">{p.title}</span>
                    {(p.authors || p.about) && <span className="mt-0.5 line-clamp-1 text-[13px] text-(--c-t-737373)">{p.authors || p.about}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[12px] text-(--c-t-9a9a9a)">
                      {p.pages && <span>{p.pages} pages</span>}
                      {p.notes > 0 && (
                        <span>
                          {p.notes} note{p.notes === 1 ? "" : "s"}
                        </span>
                      )}
                      {p.sourceUrl && <span className="max-w-[220px] truncate">{(() => { try { return new URL(p.sourceUrl).host.replace(/^www\./, ""); } catch { return p.sourceUrl; } })()}</span>}
                      <span>
                        Added {ago(p.createdAt)}
                        {p.addedBy ? ` by ${p.addedBy}` : ""}
                      </span>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => confirm(`Delete "${p.title}" and its notes? This can't be undone.`) && void remove({ id: p.id as Id<"pdfs"> })}
                  aria-label={`Delete ${p.title}`}
                  title="Delete"
                  className="absolute right-2 top-3 hidden h-7 w-7 items-center justify-center rounded-md text-(--c-t-9a9a9a) hover:bg-(--c-b-ececea) hover:text-(--c-t-b42318) group-hover:flex pointer-coarse:flex"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            ))}
            {!shown.length && <p className="py-8 text-center text-[14px] text-(--c-t-8a8a8a)">No PDF matches “{q}”.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
