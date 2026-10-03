import { v } from "convex/values";

/** Shared shapes for the Topic opportunities app (also used by the agent tools) */
export const level = v.union(v.literal("high"), v.literal("medium"), v.literal("low"));
export const trend = v.union(v.literal("breakout"), v.literal("rising"), v.literal("steady"), v.literal("falling"));
export const topicFormat = v.union(v.literal("long"), v.literal("short"), v.literal("both"));
/** new = not looked at yet, saved = starred idea, used = turned into a script, dismissed = not for us */
export const topicStatus = v.union(v.literal("new"), v.literal("saved"), v.literal("used"), v.literal("dismissed"));
export const keyword = v.object({ term: v.string(), demand: v.optional(level), competition: v.optional(level), note: v.optional(v.string()) });
export const outlier = v.object({
  title: v.string(),
  url: v.string(),
  channel: v.optional(v.string()),
  views: v.optional(v.union(v.number(), v.null())),
  channelAvgViews: v.optional(v.union(v.number(), v.null())),
  published: v.optional(v.string()),
  note: v.optional(v.string()),
});
export const source = v.object({ label: v.string(), url: v.string() });

/** What research writes about a topic (people's status and notes are kept separately) */
export const research = {
  title: v.string(),
  angle: v.string(),
  category: v.string(),
  format: topicFormat,
  score: v.number(),
  demand: level,
  demandNote: v.optional(v.string()),
  competition: level,
  competitionNote: v.optional(v.string()),
  trend,
  whyNow: v.string(),
  keywords: v.array(keyword),
  outliers: v.array(outlier),
  titleIdeas: v.array(v.string()),
  hooks: v.array(v.string()),
  sources: v.array(source),
};
