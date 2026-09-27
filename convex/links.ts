import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeSocialUrl, socialPlatformOf, type SocialPlatform } from "./socialLinks";

const FRESH_MS = 6 * 60 * 60 * 1000;

export type TweetCard = {
  url: string;
  text: string;
  authorName: string;
  authorHandle: string;
  avatarUrl: string | null;
  createdAt: string | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  media: { type: "photo" | "video" | "gif"; url: string; thumbnail: string | null; width: number | null; height: number | null }[];
  quote: { authorName: string; authorHandle: string; text: string } | null;
};

/** Cached card data for a tweet; null until fetched (or if the tweet can't be loaded). */
export const tweet = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const row = await ctx.db
      .query("tweets")
      .withIndex("by_tweet", (q) => q.eq("tweetId", id))
      .unique();
    if (!row) return { status: "missing" as const };
    if (!row.data) return { status: "unavailable" as const, fetchedAt: row.fetchedAt };
    return { status: "ok" as const, card: row.data as TweetCard, stale: Date.now() - row.fetchedAt > FRESH_MS };
  },
});

export const save = internalMutation({
  args: { id: v.string(), data: v.union(v.any(), v.null()) },
  handler: async (ctx, { id, data }) => {
    const row = await ctx.db
      .query("tweets")
      .withIndex("by_tweet", (q) => q.eq("tweetId", id))
      .unique();
    if (row) await ctx.db.patch(row._id, { data, fetchedAt: Date.now() });
    else await ctx.db.insert("tweets", { tweetId: id, data, fetchedAt: Date.now() });
  },
});

type FxMedia = { type?: string; url?: string; thumbnail_url?: string; width?: number; height?: number };
type FxTweet = {
  url?: string;
  text?: string;
  created_at?: string;
  likes?: number;
  replies?: number;
  retweets?: number;
  author?: { name?: string; screen_name?: string; avatar_url?: string };
  media?: { all?: FxMedia[] };
  quote?: FxTweet;
};

/** Loads a tweet's public data (text, author, media) and caches it for the card. */
export const fetchTweet = action({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    if (!/^\d{5,25}$/.test(id)) return;
    let data: TweetCard | null = null;
    try {
      const res = await fetch(`https://api.fxtwitter.com/status/${id}`, { headers: { "user-agent": "NativeNote/1.0" } });
      if (res.ok) {
        const t = ((await res.json()) as { tweet?: FxTweet }).tweet;
        if (t) {
          data = {
            url: t.url ?? `https://x.com/i/status/${id}`,
            text: (t.text ?? "").slice(0, 4000),
            authorName: t.author?.name ?? "",
            authorHandle: t.author?.screen_name ?? "",
            avatarUrl: t.author?.avatar_url ?? null,
            createdAt: t.created_at ?? null,
            likes: t.likes ?? null,
            replies: t.replies ?? null,
            reposts: t.retweets ?? null,
            media: (t.media?.all ?? []).slice(0, 4).flatMap((m) =>
              m.url
                ? [
                    {
                      type: m.type === "video" ? ("video" as const) : m.type === "gif" ? ("gif" as const) : ("photo" as const),
                      url: m.url,
                      thumbnail: m.thumbnail_url ?? null,
                      width: m.width ?? null,
                      height: m.height ?? null,
                    },
                  ]
                : [],
            ),
            quote: t.quote
              ? { authorName: t.quote.author?.name ?? "", authorHandle: t.quote.author?.screen_name ?? "", text: (t.quote.text ?? "").slice(0, 1000) }
              : null,
          };
        }
      }
    } catch {
      data = null;
    }
    await ctx.runMutation(internal.links.save, { id, data });
  },
});

// ---------- Other social links (YouTube, TikTok, Instagram, Threads, LinkedIn, Facebook) ----------

export type SocialCard = {
  url: string;
  platform: SocialPlatform;
  title: string;
  description: string;
  author: string;
  image: string | null;
  video: boolean;
};

/** Cached card data for a social link; null until fetched (or if it can't be loaded). */
export const preview = query({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const row = await ctx.db
      .query("linkPreviews")
      .withIndex("by_url", (q) => q.eq("url", normalizeSocialUrl(url)))
      .unique();
    if (!row) return { status: "missing" as const };
    if (!row.data) return { status: "unavailable" as const, stale: Date.now() - row.fetchedAt > FRESH_MS };
    return { status: "ok" as const, card: row.data as SocialCard, stale: Date.now() - row.fetchedAt > FRESH_MS };
  },
});

export const savePreview = internalMutation({
  args: { url: v.string(), data: v.union(v.any(), v.null()) },
  handler: async (ctx, { url, data }) => {
    const row = await ctx.db
      .query("linkPreviews")
      .withIndex("by_url", (q) => q.eq("url", url))
      .unique();
    if (row) await ctx.db.patch(row._id, { data, fetchedAt: Date.now() });
    else await ctx.db.insert("linkPreviews", { url, data, fetchedAt: Date.now() });
  },
});

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function metaTags(html: string) {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    if (key && content && !(key in out)) out[key] = decode(content[1] ?? content[2] ?? "");
  }
  return out;
}

type OEmbed = { title?: string; author_name?: string; thumbnail_url?: string };

/** Loads a social link's public preview (title, author, image) and caches it for the card. */
export const fetchPreview = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const url = normalizeSocialUrl(args.url);
    const platform = socialPlatformOf(url);
    if (!platform) return; // only known social hosts are ever fetched
    let data: SocialCard | null = null;
    try {
      const oembed =
        platform === "youtube"
          ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
          : platform === "tiktok"
            ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
            : null;
      if (oembed) {
        const res = await fetch(oembed, { headers: { "user-agent": "NativeNote/1.0" } });
        if (res.ok) {
          const o = (await res.json()) as OEmbed;
          data = { url, platform, title: (o.title ?? "").slice(0, 500), description: "", author: o.author_name ?? "", image: o.thumbnail_url ?? null, video: true };
        }
      } else {
        const res = await fetch(url, {
          redirect: "follow",
          headers: { "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", accept: "text/html" },
        });
        if (res.ok) {
          const m = metaTags((await res.text()).slice(0, 400_000));
          const title = m["og:title"] ?? m["twitter:title"] ?? "";
          // Pages that only offer a login wall aren't worth a card
          if (title && !/\blog ?in\b|sign ?in/i.test(title)) {
            // Instagram titles read 'Name on Instagram: "caption"'; split out the name, and keep the like counts
            const ig = platform === "instagram" ? /^(.*?) on Instagram: "([\s\S]*)"$/.exec(title) : null;
            if (ig) {
              data = {
                url,
                platform,
                title: ig[2].slice(0, 500),
                description: (m["og:description"] ?? "").split(" - ")[0].slice(0, 200),
                author: ig[1],
                image: m["og:image"] ?? null,
                video: /\/(reel|reels|tv)\//i.test(url),
              };
            } else data = {
              url,
              platform,
              title: title.slice(0, 500),
              description: (m["og:description"] ?? m["description"] ?? "").slice(0, 1000),
              author: "",
              image: m["og:image"] ?? m["twitter:image"] ?? null,
              video: /video/i.test(m["og:type"] ?? "") || /\/(reel|reels|tv|videos?)\//i.test(url),
            };
          }
        }
      }
    } catch {
      data = null;
    }
    await ctx.runMutation(internal.links.savePreview, { url, data });
  },
});
