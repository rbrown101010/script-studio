"use client";

import { useAction, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";

const TWEET_RE = /https?:\/\/(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/[^/\s]+\/status(?:es)?\/(\d+)[^\s]*/gi;

export function tweetIdOf(url: string | null | undefined) {
  if (!url) return null;
  const m = new RegExp(TWEET_RE.source, "i").exec(url);
  return m ? m[1] : null;
}

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M17.8 3h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.8 3h6.4l4.4 5.9zM16.7 19.2h1.7L7.4 4.7H5.6z" />
    </svg>
  );
}

const compact = (n: number | null) =>
  n === null ? null : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(n);

/** A tweet shown as a card (author, text, media, counts), like Notion or Excalidraw do. */
export function TweetCard({ id, url, inert }: { id: string; url: string; /** Not a link itself; only the X logo opens the post */ inert?: boolean }) {
  const result = useQuery(api.links.tweet, { id });
  const fetchTweet = useAction(api.links.fetchTweet);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || result === undefined) return;
    if (result.status === "missing" || (result.status === "ok" && result.stale)) {
      asked.current = true;
      void fetchTweet({ id });
    }
  }, [result, id, fetchTweet]);

  if (!result || result.status === "missing")
    return (
      <div className="animate-pulse rounded-xl border border-(--c-l-ebebeb) p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-(--c-b-f0f0f0)" />
          <div className="h-3 w-32 rounded bg-(--c-b-f0f0f0)" />
        </div>
        <div className="mt-3 h-3 w-full rounded bg-(--c-b-f4f4f4)" />
        <div className="mt-2 h-3 w-2/3 rounded bg-(--c-b-f4f4f4)" />
      </div>
    );

  if (result.status === "unavailable")
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-(--c-l-ebebeb) px-3.5 py-3 text-[13px] text-(--c-t-6b6b6b) no-underline hover:bg-(--c-b-fafafa)">
        <XLogo />
        <span className="truncate">Post unavailable · {url.replace(/^https?:\/\/(www\.)?/, "")}</span>
      </a>
    );

  const t = result.card;
  const date = t.createdAt ? new Date(t.createdAt) : null;
  const photos = t.media.filter((m) => m.type === "photo");
  const video = t.media.find((m) => m.type !== "photo");
  const stats = [
    t.replies !== null && `${compact(t.replies)} replies`,
    t.reposts !== null && `${compact(t.reposts)} reposts`,
    t.likes !== null && `${compact(t.likes)} likes`,
  ].filter(Boolean);

  const Wrap = inert ? "div" : "a";
  return (
    <Wrap
      {...(inert ? {} : { href: t.url || url, target: "_blank", rel: "noopener noreferrer" })}
      className={`block rounded-xl border border-(--c-l-ebebeb) bg-(--c-card) p-3.5 text-inherit no-underline transition-colors ${inert ? "" : "hover:border-(--c-l-dcdcdc) hover:bg-(--c-b-fcfcfc)"}`}
    >
      <div className="flex items-center gap-2.5">
        {t.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full bg-(--c-b-f0f0f0) object-cover" />
        ) : (
          <div className="h-9 w-9 shrink-0 rounded-full bg-(--c-b-f0f0f0)" />
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14px] font-semibold text-(--c-t-1b1b1b)">{t.authorName}</div>
          <div className="truncate text-[13px] text-(--c-t-737373)">@{t.authorHandle}</div>
        </div>
        {inert ? (
          <a
            href={t.url || url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Open on X"
            title="Open on X"
            className="-mr-1.5 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-(--c-t-1b1b1b) hover:bg-(--c-b-f0f0f0)"
          >
            <XLogo />
          </a>
        ) : (
          <span className="text-(--c-t-1b1b1b)">
            <XLogo />
          </span>
        )}
      </div>
      {t.text && <p className="m-0 mt-2.5 whitespace-pre-wrap break-words text-[14px] leading-[1.5] text-(--c-t-1b1b1b)">{t.text}</p>}
      {t.quote && (
        <div className="mt-2.5 rounded-lg border border-(--c-l-ebebeb) px-3 py-2">
          <div className="truncate text-[12px] text-(--c-t-737373)">
            <span className="font-semibold text-(--c-t-1b1b1b)">{t.quote.authorName}</span> @{t.quote.authorHandle}
          </div>
          <p className="m-0 mt-1 line-clamp-4 whitespace-pre-wrap text-[13px] leading-[1.45] text-(--c-t-262626)">{t.quote.text}</p>
        </div>
      )}
      {photos.length > 0 && (
        <div className={`mt-2.5 grid gap-1 overflow-hidden rounded-lg ${photos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {photos.map((m) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m.url} src={m.url} alt="" loading="lazy" className={`w-full bg-(--c-b-f0f0f0) object-cover ${photos.length > 1 ? "aspect-square" : "max-h-[320px]"}`} />
          ))}
        </div>
      )}
      {!photos.length && video?.thumbnail && (
        <div className="relative mt-2.5 overflow-hidden rounded-lg bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={video.thumbnail} alt="" loading="lazy" className="max-h-[320px] w-full object-cover opacity-90" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-(--c-popover)/90 text-(--c-t-1b1b1b)">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
          </span>
        </div>
      )}
      {(date || stats.length > 0) && (
        <div className="mt-2.5 text-[12px] text-(--c-t-737373)">
          {[date?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }), ...stats].filter(Boolean).join(" · ")}
        </div>
      )}
    </Wrap>
  );
}
