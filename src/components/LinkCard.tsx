"use client";

import { useAction, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";
import { PLATFORM_NAMES, normalizeSocialUrl, socialPlatformOf, type SocialPlatform } from "../../convex/socialLinks";
import { TweetCard, tweetIdOf } from "./TweetCard";

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

/** Social links (X, YouTube, TikTok, Instagram, ...) inside a piece of text, in order, without repeats. */
export function linkCardsIn(text: string) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[).,!?]+$/, "");
    if (!hasLinkCard(url)) continue;
    const key = tweetIdOf(url) ?? normalizeSocialUrl(url);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(url);
    }
  }
  return out;
}

export const hasLinkCard = (url: string | null | undefined) => !!tweetIdOf(url) || !!socialPlatformOf(url);

/** The right card for a social link: tweets get the full tweet card, other platforms a preview card. */
export function LinkCard({
  url,
  compact,
  plain,
  inert,
}: {
  url: string;
  compact?: boolean;
  /** No link wrapper (e.g. inside a menu option) */
  plain?: boolean;
  /** The card isn't a link; a small icon in its corner opens the original */
  inert?: boolean;
}) {
  const tweetId = tweetIdOf(url);
  const platform = socialPlatformOf(url);
  if (compact) return <CompactCard url={url} plain={plain} />;
  if (tweetId) return <TweetCard id={tweetId} url={url} inert={inert} />;
  return platform ? <SocialCard url={url} platform={platform} inert={inert} /> : null;
}

/** Thumbnail, author and a line of text for a social link, fetching it once if it isn't cached yet. */
export function useLinkSummary(url: string | null) {
  const tweetId = tweetIdOf(url);
  const platform = socialPlatformOf(url);
  const tweet = useQuery(api.links.tweet, tweetId ? { id: tweetId } : "skip");
  const prev = useQuery(api.links.preview, url && !tweetId && platform ? { url } : "skip");
  const fetchTweet = useAction(api.links.fetchTweet);
  const fetchPreview = useAction(api.links.fetchPreview);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !url) return;
    if (tweetId && tweet && (tweet.status === "missing" || (tweet.status === "ok" && tweet.stale))) {
      asked.current = true;
      void fetchTweet({ id: tweetId });
    }
    if (!tweetId && prev && (prev.status === "missing" || prev.stale)) {
      asked.current = true;
      void fetchPreview({ url });
    }
  }, [tweet, prev, tweetId, url, fetchTweet, fetchPreview]);

  let thumb: string | null = null;
  let who = "";
  let text = url ? shortUrl(url) : "";
  let video = false;
  const label = tweetId ? "X" : platform ? PLATFORM_NAMES[platform] : "Link";
  if (tweet?.status === "ok") {
    const t = tweet.card;
    thumb = t.media.find((m) => m.type === "photo")?.url ?? t.media[0]?.thumbnail ?? t.avatarUrl;
    video = !t.media.some((m) => m.type === "photo") && t.media.length > 0;
    who = `${t.authorName} @${t.authorHandle}`;
    text = t.text || text;
  } else if (prev?.status === "ok") {
    thumb = prev.card.image;
    video = prev.card.video;
    who = prev.card.author;
    text = prev.card.title || prev.card.description || text;
  }
  const loading = (!!tweetId && (!tweet || tweet.status === "missing")) || (!tweetId && !!platform && (!prev || prev.status === "missing"));
  return { thumb, who, text, label, platform, video, loading };
}

/** A small one-row card (thumbnail, who, two lines of text) so comment threads stay short. */
function CompactCard({ url, plain }: { url: string; plain?: boolean }) {
  const { thumb, who, text, label } = useLinkSummary(url);
  const body = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-(--c-b-f1f1ef) text-[11px] font-semibold text-(--c-t-6b6b6b)">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumb ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[11px] text-(--c-t-737373)">
          <span className="font-semibold text-(--c-t-1b1b1b)">{label}</span>
          {who && <span className="truncate">{who}</span>}
        </span>
        <span className="line-clamp-2 break-words text-[13px] leading-[1.35] text-(--c-t-262626)">{text}</span>
      </span>
    </>
  );
  const cls = "flex items-center gap-2.5 rounded-lg border border-(--c-l-ebebeb) bg-(--c-b-ffffff) p-1.5 pr-2.5 text-left text-inherit no-underline";
  if (plain) return <span className={cls}>{body}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`${cls} hover:border-(--c-l-dcdcdc) hover:bg-(--c-b-fcfcfc)`}>
      {body}
    </a>
  );
}

const COLORS: Record<SocialPlatform, string> = {
  youtube: "#ff0000",
  tiktok: "#000000",
  instagram: "#d62976",
  threads: "#000000",
  linkedin: "#0a66c2",
  facebook: "#1877f2",
};

function PlatformTag({ platform }: { platform: SocialPlatform }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-(--c-t-1b1b1b)">
      <span className="h-2 w-2 rounded-full" style={{ background: COLORS[platform] }} aria-hidden="true" />
      {PLATFORM_NAMES[platform]}
    </span>
  );
}

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");

function SocialCard({ url, platform, inert }: { url: string; platform: SocialPlatform; inert?: boolean }) {
  const result = useQuery(api.links.preview, { url });
  const fetchPreview = useAction(api.links.fetchPreview);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || result === undefined) return;
    if (result.status === "missing" || result.stale) {
      asked.current = true;
      void fetchPreview({ url });
    }
  }, [result, url, fetchPreview]);

  if (!result || result.status === "missing")
    return (
      <div className="animate-pulse rounded-xl border border-(--c-l-ebebeb) p-3.5">
        <div className="h-3 w-24 rounded bg-(--c-b-f0f0f0)" />
        <div className="mt-3 h-3 w-full rounded bg-(--c-b-f4f4f4)" />
        <div className="mt-2 h-3 w-2/3 rounded bg-(--c-b-f4f4f4)" />
      </div>
    );

  if (result.status === "unavailable")
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-xl border border-(--c-l-ebebeb) px-3.5 py-3 text-[13px] text-(--c-t-6b6b6b) no-underline hover:bg-(--c-b-fafafa)"
      >
        <PlatformTag platform={platform} />
        <span className="truncate">{shortUrl(url)}</span>
      </a>
    );

  const c = result.card;
  const wide = c.video && (platform === "youtube" || platform === "facebook" || platform === "linkedin");
  const Wrap = inert ? "div" : "a";
  return (
    <Wrap
      {...(inert ? {} : { href: url, target: "_blank", rel: "noopener noreferrer" })}
      className={`relative block overflow-hidden rounded-xl border border-(--c-l-ebebeb) bg-(--c-b-ffffff) text-inherit no-underline transition-colors ${inert ? "" : "hover:border-(--c-l-dcdcdc) hover:bg-(--c-b-fcfcfc)"}`}
    >
      {inert && <OpenLink url={url} label={`Open on ${PLATFORM_NAMES[platform]}`} />}
      {c.image && (wide || platform === "youtube") && <Thumb src={c.image} video={c.video} className="aspect-video w-full" />}
      <div className="flex gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <PlatformTag platform={platform} />
            {c.author && <span className="truncate text-[12px] text-(--c-t-737373)">{c.author}</span>}
          </div>
          {c.title && <p className="m-0 mt-1.5 line-clamp-3 break-words text-[14px] font-medium leading-[1.45] text-(--c-t-1b1b1b)">{c.title}</p>}
          {c.description && <p className="m-0 mt-1 line-clamp-3 break-words text-[13px] leading-[1.45] text-(--c-t-6b6b6b)">{c.description}</p>}
          <div className="mt-1.5 truncate text-[12px] text-(--c-t-9a9a9a)">{shortUrl(url)}</div>
        </div>
        {c.image && !(wide || platform === "youtube") && (
          <Thumb src={c.image} video={c.video} className={`w-[84px] shrink-0 rounded-lg ${c.video ? "aspect-[9/16]" : "aspect-square"}`} />
        )}
      </div>
    </Wrap>
  );
}

function Thumb({ src, video, className }: { src: string; video: boolean; className: string }) {
  return (
    <div className={`relative overflow-hidden bg-(--c-b-f0f0f0) ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      {video && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--c-b-ffffff)/90 text-(--c-t-1b1b1b)">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
        </span>
      )}
    </div>
  );
}

/** A small round "open the original" button for a card's top-right corner. */
export function OpenLink({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      title={label}
      className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-(--c-b-ffffff)/90 text-(--c-t-1b1b1b) shadow-[0_1px_3px_rgba(0,0,0,0.15)] hover:bg-(--c-b-ffffff)"
    >
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3.5H3.5v9h9V10M9 2.5h4.5V7M13.5 2.5 7 9" />
      </svg>
    </a>
  );
}
