"use client";

import { useConvex, useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Block } from "./types";

export type SaveState = "idle" | "saving" | "saved" | "error";

type ServerBlock = {
  id: string;
  type: Block["type"];
  content: string;
  checked: boolean;
  color: Block["color"];
  textColor?: Block["textColor"];
  source_block_id: string | null;
};

export const fromServer = (b: ServerBlock): Block => ({ ...b });

export function toServer(b: Block, position: number) {
  return {
    key: b.id,
    position,
    type: b.type,
    content: b.content,
    checked: !!b.checked,
    color: b.color ?? null,
    textColor: b.textColor ?? null,
    sourceBlockId: b.source_block_id ?? null,
  };
}

export function useLoadBlocks() {
  const convex = useConvex();
  return useCallback(
    async (documentId: string): Promise<Block[]> =>
      ((await convex.query(api.docs.blocks, { documentId: documentId as Id<"documents"> })) as ServerBlock[]).map(
        fromServer,
      ),
    [convex],
  );
}

/**
 * Autosaves a document: compares local blocks with what was last saved and sends only the
 * changed blocks and removed keys.
 */
export function useDocSync(docId: string | null, blocks: Block[] | null) {
  const syncMutation = useMutation(api.docs.sync);
  const [state, setState] = useState<SaveState>("idle");
  const saved = useRef(new Map<string, string>());
  const current = useRef<Block[] | null>(blocks);
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    current.current = blocks;
  }, [blocks]);

  /** Call right after loading so the loaded state counts as saved. */
  const seed = useCallback((id: string, loaded: Block[]) => {
    saved.current = new Map(loaded.map((b, i) => [b.id, JSON.stringify(toServer(b, i))]));
    seededFor.current = id;
  }, []);

  const flushOnce = useCallback(async () => {
    const list = current.current;
    if (!docId || !list || seededFor.current !== docId) return;
    const upserts: ReturnType<typeof toServer>[] = [];
    const sigs = new Map<string, string>();
    list.forEach((b, i) => {
      const row = toServer(b, i);
      const sig = JSON.stringify(row);
      if (saved.current.get(b.id) !== sig) {
        upserts.push(row);
        sigs.set(b.id, sig);
      }
    });
    const keys = new Set(list.map((b) => b.id));
    const deletes = [...saved.current.keys()].filter((k) => !keys.has(k));
    if (!upserts.length && !deletes.length) return;
    setState("saving");
    await syncMutation({ documentId: docId as Id<"documents">, upserts, deletes });
    sigs.forEach((sig, id) => saved.current.set(id, sig));
    deletes.forEach((k) => saved.current.delete(k));
    setState("saved");
  }, [docId, syncMutation]);

  const flush = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return running.current;
    }
    const run = async () => {
      do {
        again.current = false;
        try {
          await flushOnce();
        } catch (e) {
          console.error("save failed", e);
          setState("error");
          return;
        }
      } while (again.current);
    };
    running.current = run().finally(() => {
      running.current = null;
    });
    return running.current;
  }, [flushOnce]);

  useEffect(() => {
    if (!blocks || !docId) return;
    const t = setTimeout(() => void flush(), 500);
    return () => clearTimeout(t);
  }, [blocks, docId, flush]);

  useEffect(() => {
    if (state !== "error") return;
    const t = setTimeout(() => void flush(), 4000);
    return () => clearTimeout(t);
  }, [state, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  return { state, flush, seed };
}
