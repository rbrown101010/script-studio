// Keeps comments on the right line when a script's text is replaced (an AI edit, accepting an edited
// version, restoring an earlier one). Comments are never deleted by edits:
//  - a comment whose line is kept stays put (lines keep their key);
//  - if its line comes back (a restore), it returns to it, using the lines it has been on before;
//  - if its line was rewritten, it moves to the new line that reads most like the old one;
//  - otherwise it stays on the script as "on a removed line", and reappears if that version is restored.

import type { MutationCtx } from "./_generated/server";
import { queueAssetSync } from "./library";
import type { Id } from "./_generated/dataModel";

type Line = { key: string; content: string };

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);

/** How much two lines read alike: 1 = same words, 0 = nothing shared. */
function similarity(a: string, b: string) {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  // Shared words over the shorter line's words, so a line that grew or shrank still matches
  return shared / Math.min(A.size, B.size);
}

export async function reattachComments(ctx: MutationCtx, videoId: Id<"videos">, oldLines: Line[], newLines: Line[], protectedKeys: Set<string>) {
  const newKeys = new Set(newLines.map((l) => l.key));
  const oldByKey = new Map(oldLines.map((l) => [l.key, l]));
  const oldKeys = new Set(oldLines.map((l) => l.key));
  // Lines that didn't exist before are the candidates for rewritten text
  const fresh = newLines.filter((l) => !oldKeys.has(l.key));
  const comments = await ctx.db
    .query("comments")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .collect();
  let moved = 0;
  let detached = 0;
  for (const c of comments) {
    if (!c.blockKey || newKeys.has(c.blockKey) || protectedKeys.has(c.blockKey)) continue;
    const history = c.keyHistory ?? [];
    // 1. Back to a line it used to be on (e.g. after a restore)
    const back = [...history].reverse().find((k) => newKeys.has(k));
    let target: string | undefined = back;
    // 2. The new line that reads most like its old line
    if (!target && oldKeys.has(c.blockKey)) {
      const was = oldByKey.get(c.blockKey)?.content || c.quote || "";
      let best = 0;
      for (const l of fresh) {
        const s = similarity(was, l.content);
        if (s > best) {
          best = s;
          target = l.key;
        }
      }
      if (best < 0.6) target = undefined;
    }
    if (target) {
      await ctx.db.patch(c._id, { blockKey: target, keyHistory: [...history.filter((k) => k !== c.blockKey), c.blockKey].slice(-20) });
      moved++;
    } else if (oldKeys.has(c.blockKey)) detached++;
  }
  await queueAssetSync(ctx, videoId);
  return { commentsMoved: moved, commentsOnRemovedLines: detached };
}
