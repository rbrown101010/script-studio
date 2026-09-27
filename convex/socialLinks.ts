// Which social links get a preview card (shared by the backend fetcher and the comment UI).
// X/Twitter links have their own richer card (convex/links.ts fetchTweet).

export type SocialPlatform = "youtube" | "tiktok" | "instagram" | "threads" | "linkedin" | "facebook";

const PATTERNS: [SocialPlatform, RegExp][] = [
  ["youtube", /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?|shorts\/|live\/)|youtu\.be\/)\S+/i],
  ["tiktok", /^https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/\S+/i],
  ["instagram", /^https?:\/\/(?:www\.)?instagram\.com\/\S+/i],
  ["threads", /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/\S+/i],
  ["linkedin", /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:posts|feed\/update|pulse|in|company)\/\S+/i],
  ["facebook", /^https?:\/\/(?:www\.|m\.)?(?:facebook\.com|fb\.watch)\/\S+/i],
];

export const PLATFORM_NAMES: Record<SocialPlatform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  facebook: "Facebook",
};

/** The platform a link belongs to, or null if it isn't a supported social link. */
export function socialPlatformOf(url: string | null | undefined): SocialPlatform | null {
  if (!url) return null;
  for (const [p, re] of PATTERNS) if (re.test(url)) return p;
  return null;
}

/** Drops tracking bits so the same post shares one cached preview. */
export function normalizeSocialUrl(url: string) {
  try {
    const u = new URL(url.replace(/[).,!?'"]+$/, ""));
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|si$|igsh|igshid|feature|_r|is_from_webapp|sender_device|t$)/i.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}
