import { internalMutation } from "./_generated/server";
import type { Infer } from "convex/values";
import type { legacyStatus, videoStatus } from "./schema";

type Status = Infer<typeof videoStatus>;

/** Old statuses to new: anything being made is In production, live is Done. (Idea is a status again.) */
export function toStatus(s: Status | Infer<typeof legacyStatus>): Status {
  switch (s) {
    case "live":
      return "done";
    case "scripting":
    case "filming":
    case "editing":
    case "scheduled":
      return "inProduction";
    default:
      return s;
  }
}

/** One-off (2026-09-24): move every video to the three new statuses. Only the status changes. */
export const statuses = internalMutation({
  args: {},
  handler: async (ctx) => {
    const changed: Record<string, number> = {};
    for (const video of await ctx.db.query("videos").collect()) {
      const next = toStatus(video.status);
      if (next === video.status) continue;
      await ctx.db.patch(video._id, { status: next }); // updatedAt left alone so "Edited" times don't jump
      changed[`${video.status} -> ${next}`] = (changed[`${video.status} -> ${next}`] ?? 0) + 1;
    }
    return changed;
  },
});
