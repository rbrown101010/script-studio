"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { bounds, build, onImageLoad, type Item } from "@/lib/scratchDraw";
import { IconPlus, IconTrash } from "./icons";

const FONTS_CSS = "https://fonts.googleapis.com/css2?family=Archivo:wght@500..900&family=Architects+Daughter&family=Inter:wght@400..700&family=JetBrains+Mono:wght@400..700&display=block";

/** Scratchboard app: every scratchboard as a sheet of paper, newest first */
export function ScratchboardList() {
  const boards = useQuery(api.scratchboards.list);
  const create = useMutation(api.scratchboards.create);
  const remove = useMutation(api.scratchboards.remove);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [S, setS] = useState<any>(null);
  useEffect(() => {
    void import("@/lib/sketchKit").then((m) => setS(() => m.Sketch));
    if (!document.querySelector(`link[href="${FONTS_CSS}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = FONTS_CSS;
      document.head.appendChild(l);
    }
  }, []);

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="mb-6 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.015em] text-(--c-t-1b1b1b)">Scratchboard</h1>
          <p className="m-0 mt-1 text-[14px] text-(--c-t-737373)">Drawings in your short-form style: pencil on paper, with Play to watch them drawn.</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              router.push(`/sb/${await create({})}`);
            } finally {
              setBusy(false);
            }
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--c-b-1b1b1b) px-3.5 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-50"
        >
          <IconPlus color="var(--c-on-ink)" />
          New scratchboard
        </button>
      </div>
      {!boards ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-(--c-b-ececea)" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <p className="mt-16 text-center text-[14px] text-(--c-t-8a8a8a)">No scratchboards yet. Start one with New scratchboard.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <div key={b.id} className="group relative">
              <button type="button" onClick={() => router.push(`/sb/${b.id}`)} className="block w-full overflow-hidden rounded-xl text-left shadow-[0_10px_30px_rgba(0,0,0,0.18)] ring-1 ring-black/5 transition-transform hover:-translate-y-0.5" style={{ background: "#2A2928" }}>
                <Thumb S={S} json={b.elements} />
                <div className="px-3.5 py-2.5 text-[13px] font-extrabold uppercase tracking-[0.04em] text-[#EDEAE3]" style={{ fontFamily: "Archivo, system-ui, sans-serif" }}>
                  {b.title}
                </div>
              </button>
              <button
                type="button"
                onClick={() => confirm(`Delete "${b.title}"? This can't be undone.`) && void remove({ id: b.id as Id<"scratchboards"> })}
                aria-label={`Delete ${b.title}`}
                className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-md bg-white/90 text-[#8E8B84] shadow-sm hover:text-[#E24B3F] group-hover:flex pointer-coarse:flex"
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A small picture of the sheet, drawn with the real kit */
function Thumb({ S, json }: { S: any; json: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Pictures load after the first paint; draw again once they arrive
  const hasImages = json.includes('"kind":"image"');
  const [loads, setLoads] = useState(0);
  useEffect(() => (hasImages ? onImageLoad(() => setLoads((n) => n + 1)) : undefined), [hasImages]);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !S) return;
    let alive = true;
    void document.fonts.ready.then(() => {
      if (!alive) return;
      const W = 480,
        H = 340;
      cv.width = W;
      cv.height = H;
      const c = cv.getContext("2d")!;
      S.drawPaper(c, W, H);
      const items = JSON.parse(json || "[]") as Item[];
      if (items.length) {
        const bs = items.map(bounds);
        const x0 = Math.min(...bs.map((b) => b.x)),
          y0 = Math.min(...bs.map((b) => b.y)),
          x1 = Math.max(...bs.map((b) => b.x + b.w)),
          y1 = Math.max(...bs.map((b) => b.y + b.h));
        const z = Math.min(1.2, (W - 40) / Math.max(1, x1 - x0), (H - 40) / Math.max(1, y1 - y0));
        c.save();
        c.translate(W / 2 - ((x0 + x1) / 2) * z, H / 2 - ((y0 + y1) / 2) * z);
        c.scale(z, z);
        const all = items.flatMap((it) => {
          try {
            return build(S, it);
          } catch {
            return [];
          }
        });
        for (const layer of [0, 1, 2]) for (const d of all) if (d.layer === layer) d.el.draw(c, 1, 0);
        c.restore();
      }
      S.drawGrain(c, W, H);
    });
    return () => {
      alive = false;
    };
  }, [S, json, loads]);
  return <canvas ref={ref} className="block aspect-[24/17] w-full" />;
}
