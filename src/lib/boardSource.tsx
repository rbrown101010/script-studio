"use client";

import { useQuery } from "convex/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";

/**
 * Where board blocks load their drawing from: the team's boards (signed in), or a share link (guests only
 * see boards that shared script shows).
 */
type Source = { kind: "team" } | { kind: "shared"; slug: string };
const BoardSource = createContext<Source>({ kind: "team" });

export function BoardSourceProvider({ slug, children }: { slug: string; children: ReactNode }) {
  return <BoardSource.Provider value={{ kind: "shared", slug }}>{children}</BoardSource.Provider>;
}

/** Signed-in team member (can pick, make and edit boards) */
export const useCanEditBoards = () => useContext(BoardSource).kind === "team";

/** A board block's id: stored as the id, but a pasted /b/<id> link works too */
export const boardIdFrom = (text: string) => text.trim().replace(/[?#].*$/, "").split("/").filter(Boolean).pop() ?? "";

/**
 * A frame inside the board, when the block shows just one frame: "<board>#frame=<id>" (what Copy frame gives),
 * or Excalidraw's own "Copy link to object" link (?element=<id>)
 */
export const frameIdFrom = (text: string) => text.match(/[#?&](?:frame|element)=([\w-]+)/)?.[1] ?? null;

/** What a board block stores: the board id, plus the frame when it shows one frame */
export const boardRef = (boardId: string, frameId?: string | null) => (frameId ? `${boardId}#frame=${frameId}` : boardId);

/** A board block that's waiting for a frame to be picked (made from the / menu's Excalidraw frame) */
export const PICK_FRAME = "frame:";

/** The board's scene (undefined while loading, null if it's gone or not visible here) */
export function useBoardData(id: string) {
  const source = useContext(BoardSource);
  const bid = boardIdFrom(id);
  const team = useQuery(api.boards.get, source.kind === "team" && bid ? { id: bid } : "skip");
  const shared = useQuery(api.share.board, source.kind === "shared" && bid ? { slug: source.slug, id: bid } : "skip");
  if (!bid) return null;
  return source.kind === "team" ? team : shared;
}

/** Follows the app's light/dark theme (the html.dark class) */
export function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}
