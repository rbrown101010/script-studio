"use node";
// Transcribes Edit Feed versions with word timings. Uses whichever speech-to-text key is set on the Convex
// deployment: DEEPGRAM_API_KEY, ELEVENLABS_API_KEY or OPENAI_API_KEY (checked in that order).

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

type Word = { w: string; s: number; e: number };
const round = (n: number) => Math.round(n * 100) / 100;

async function deepgram(key: string, url: string): Promise<Word[]> {
  const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true", {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Deepgram ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const words = data?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
  return words.map((x: { word: string; punctuated_word?: string; start: number; end: number }) => ({ w: x.punctuated_word ?? x.word, s: round(x.start), e: round(x.end) }));
}

async function elevenlabs(key: string, url: string): Promise<Word[]> {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("cloud_storage_url", url);
  form.append("timestamps_granularity", "word");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: form });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data?.words ?? [])
    .filter((x: { type?: string }) => x.type === "word" || x.type === undefined)
    .map((x: { text: string; start: number; end: number }) => ({ w: x.text.trim(), s: round(x.start), e: round(x.end) }))
    .filter((x: Word) => x.w);
}

async function openai(key: string, url: string, mime: string | undefined): Promise<Word[]> {
  const file = await fetch(url);
  if (!file.ok) throw new Error(`Couldn't download the video (${file.status})`);
  const blob = await file.blob();
  if (blob.size > 25 * 1024 * 1024) throw new Error("OpenAI only transcribes files up to 25 MB");
  const form = new FormData();
  form.append("file", new Blob([await blob.arrayBuffer()], { type: mime ?? blob.type ?? "video/mp4" }), mime?.includes("quicktime") ? "video.mov" : "video.mp4");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data?.words ?? []).map((x: { word: string; start: number; end: number }) => ({ w: x.word.trim(), s: round(x.start), e: round(x.end) }));
}

export const version = internalAction({
  args: { versionId: v.id("editVersions") },
  handler: async (ctx, { versionId }): Promise<null> => {
    const info = await ctx.runQuery(internal.editFeedInternal.versionFile, { versionId });
    if (!info?.url) {
      await ctx.runMutation(internal.editFeedInternal.saveTranscript, { versionId, status: "failed", words: [], error: "No video file" });
      return null;
    }
    const keys = { deepgram: process.env.DEEPGRAM_API_KEY, elevenlabs: process.env.ELEVENLABS_API_KEY, openai: process.env.OPENAI_API_KEY };
    const provider = keys.deepgram ? "deepgram" : keys.elevenlabs ? "elevenlabs" : keys.openai ? "openai" : null;
    if (!provider) {
      await ctx.runMutation(internal.editFeedInternal.saveTranscript, {
        versionId,
        status: "unavailable",
        words: [],
        error: "No transcription key is set up yet (DEEPGRAM_API_KEY, ELEVENLABS_API_KEY or OPENAI_API_KEY)",
      });
      return null;
    }
    try {
      const words =
        provider === "deepgram"
          ? await deepgram(keys.deepgram!, info.url)
          : provider === "elevenlabs"
            ? await elevenlabs(keys.elevenlabs!, info.url)
            : await openai(keys.openai!, info.url, info.mime ?? undefined);
      await ctx.runMutation(internal.editFeedInternal.saveTranscript, { versionId, status: "done", words, provider });
    } catch (e) {
      await ctx.runMutation(internal.editFeedInternal.saveTranscript, { versionId, status: "failed", words: [], provider, error: e instanceof Error ? e.message.slice(0, 300) : "Transcription failed" });
    }
    return null;
  },
});
