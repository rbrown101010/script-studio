"use client";

import Link from "next/link";
import { statusOf, type VideoFormat } from "@/lib/types";
import { FormatIcon } from "./FormatIcon";
import { PartnerLogo, longDate } from "./VideoMeta";
import { IconPin } from "./icons";

type PinnedVideo = { _id: string; title: string; status: string; format: VideoFormat; liveDate: string | null; partnerId?: string | null; pinnedAt?: number | null };
type Partner = { name: string; logoUrl: string | null };

/** "Pinned": the videos you're working on, always at the top of List, Calendar and Feed (whatever the filters). */
export function PinnedVideos({ videos, partnerOf, onUnpin }: { videos: PinnedVideo[]; partnerOf: (id: string | null | undefined) => Partner | undefined; onUnpin: (id: string) => void }) {
  const pinned = videos.filter((v) => v.pinnedAt).sort((a, b) => (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0));
  if (!pinned.length) return null;
  return (
    <section aria-label="Pinned videos" className="mt-5">
      <h2 className="m-0 mb-2 flex items-center gap-1.5 text-[12px] font-medium text-(--c-t-9a9a9a)">
        <IconPin size={13} filled />
        Pinned
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {pinned.map((v) => {
          const st = statusOf(v.status);
          const partner = partnerOf(v.partnerId);
          return (
            <div key={v._id} className="group relative">
              <Link
                href={`/v/${v._id}`}
                className="flex h-full flex-col gap-2 rounded-xl bg-(--c-b-fafafa) px-3.5 py-3 no-underline ring-1 ring-(--c-l-ebebeb) transition-colors hover:bg-(--c-b-f4f4f4)"
              >
                <span className="line-clamp-2 pr-6 text-[14px] font-medium leading-[1.35] text-(--c-t-1b1b1b)">{v.title || "Untitled"}</span>
                <span className="mt-auto flex items-center gap-2 text-[12px] text-(--c-t-8a8a8a)">
                  <span className="h-[6px] w-[6px] rounded-full" style={{ background: st.dot }} aria-hidden="true" />
                  <span>{st.label}</span>
                  <FormatIcon format={v.format} size={12} />
                  {v.liveDate && <span className="truncate">{longDate(v.liveDate).replace(/^\w+, /, "")}</span>}
                  {partner && <PartnerLogo p={partner} size={16} className="ml-auto ring-1 ring-(--c-hairline)" />}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => onUnpin(v._id)}
                aria-label={`Unpin ${v.title || "Untitled"}`}
                title="Unpin"
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md text-(--c-t-2358d8) opacity-60 hover:bg-(--c-b-ececea) hover:opacity-100"
              >
                <IconPin size={14} filled />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
