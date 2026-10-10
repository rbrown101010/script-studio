"use client";

import { useMutation, useQuery } from "convex/react";
import { BoardSourceProvider } from "@/lib/boardSource";
import { ConvexError } from "convex/values";
import { useConvex } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { groupComments, snippet, snapToLine, type CommentActions } from "@/lib/comments";
import { fromServer } from "@/lib/sync";
import type { Block, Comment } from "@/lib/types";
import { exportAttachments } from "@/lib/exportAttachments";
import { uid } from "@/lib/util";
import { Lightbox } from "./Attachments";
import { CommentsPanel } from "./CommentsPanel";
import { DocEditor } from "./DocEditor";
import { DiffBlocks } from "./DiffView";
import { Captions } from "./Captions";
import { Instructions, instructionsProgress } from "./Instructions";
import { cleanImages } from "@/lib/sync";
import { ScriptLayout, primaryButton, topButton } from "./ScriptLayout";
import { ScriptTabs, type ScriptTab } from "./ScriptTabs";
import { VideoDetails, VideoTitle } from "./VideoMeta";
import { IconComments, IconDownload, IconEye, IconPencil } from "./icons";

const SCRIPT = "__script__";

const noop = () => {};

function store(kind: "local" | "session") {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function guestToken(slug: string) {
  const s = store("local");
  const key = `guest-token:${slug}`;
  let t = s?.getItem(key);
  if (!t) {
    t = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    s?.setItem(key, t);
  }
  return t;
}

const copyOf = (blocks: Block[]): Block[] =>
  blocks.map((b) => ({
    ...b,
    id: uid(),
    source_block_id: b.id,
  }));

type Creds = { passcode: string; name: string };

/** Public page for a share link: this one script, read-only, plus passcode-protected suggested edits. */
export function SharedScript({ slug }: { slug: string }) {
  const convex = useConvex();
  const shared = useQuery(api.share.get, { slug });
  const [token, setToken] = useState<string | undefined>(undefined);
  useEffect(() => setToken(guestToken(slug)), [slug]);
  const comments = useQuery(api.comments.listShared, { slug, token });
  const saveGuestEdit = useMutation(api.share.saveGuestEdit);
  const addAsGuest = useMutation(api.comments.addAsGuest);
  const updateAsGuest = useMutation(api.comments.updateAsGuest);
  const removeAsGuest = useMutation(api.comments.removeAsGuest);
  const attachLinkAsGuest = useMutation(api.comments.attachLinkAsGuest);
  const detachAsGuest = useMutation(api.comments.detachAsGuest);
  const [mode, setMode] = useState<"view" | "editing" | "mine">("view");
  const [exporting, setExporting] = useState<string | null>(null);
  const [askPass, setAskPass] = useState(false);
  const [creds, setCreds] = useState<Creds | null>(null);
  const [mine, setMine] = useState<Block[] | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [openId, setOpenId] = useState<string | null>(null);
  const [focusComment, setFocusComment] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const dirty = useRef(false);
  const resumed = useRef(false);

  const fetchMine = useCallback(
    async (c: Creds) => {
      const r = await convex.query(api.share.guestEdit, { slug, passcode: c.passcode, token: guestToken(slug) });
      return r.exists ? r.blocks.map(fromServer) : null;
    },
    [convex, slug],
  );

  useEffect(() => {
    if (shared?.video) document.title = shared.video.title || "Untitled script";
  }, [shared?.video]);

  // Same browser session: pick up an earlier edit
  useEffect(() => {
    if (!shared?.video.canEdit || resumed.current) return;
    resumed.current = true;
    const saved = store("session")?.getItem(`guest:${slug}`);
    if (!saved) return;
    const c = JSON.parse(saved) as Creds;
    fetchMine(c)
      .then((blocks) => {
        setCreds(c);
        if (blocks) {
          setMine(blocks);
          setMode("mine");
        }
      })
      .catch(() => store("session")?.removeItem(`guest:${slug}`));
  }, [shared?.video.canEdit, slug, fetchMine]);

  const save = useCallback(
    async (blocks: Block[]) => {
      if (!creds) return;
      setSaveState("saving");
      try {
        await saveGuestEdit({
          slug,
          passcode: creds.passcode,
          token: guestToken(slug),
          name: creds.name,
          blocks: blocks.map((b) => ({
            key: b.id,
            type: b.type,
            content: b.content,
            checked: !!b.checked,
            color: b.color ?? null,
            textColor: b.textColor ?? null,
            ...(b.type === "images" ? { images: cleanImages(b.images) } : {}),
            sourceBlockId: b.source_block_id ?? null,
          })),
        });
        dirty.current = false;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [creds, saveGuestEdit, slug],
  );

  useEffect(() => {
    if (mode !== "editing" || !mine || !dirty.current) return;
    const t = setTimeout(() => void save(mine), 900);
    return () => clearTimeout(t);
  }, [mine, mode, save]);

  useEffect(() => {
    if (saveState !== "error" || !mine) return;
    const t = setTimeout(() => void save(mine), 4000);
    return () => clearTimeout(t);
  }, [saveState, mine, save]);

  const setMineBlocks = useCallback((fn: (prev: Block[]) => Block[]) => {
    dirty.current = true;
    setMine((prev) => (prev ? fn(prev) : prev));
  }, []);

  const startEditing = async (c: Creds): Promise<string | null> => {
    let existing: Block[] | null;
    try {
      existing = await fetchMine(c);
    } catch (e) {
      return e instanceof ConvexError ? String(e.data) : "That passcode isn't right.";
    }
    store("session")?.setItem(`guest:${slug}`, JSON.stringify(c));
    setCreds(c);
    if (!mine) {
      const base = shared?.blocks.map(fromServer) ?? [];
      setMine(existing ?? copyOf(base.length ? base : [{ id: uid(), type: "p", content: "" }]));
    }
    setMode("editing");
    setOpenId(null);
    setAskPass(false);
    return null;
  };

  const openComments = (key: string, opts?: { newComment?: boolean }) => {
    setOpenId(key);
    setFocusComment(null);
    if (key !== SCRIPT) snapToLine(key);
    if (opts?.newComment && actions) void actions.add(key === SCRIPT ? null : key);
  };
  const closeComments = () => {
    setOpenId(null);
    setFocusComment(null);
  };

  // Commenting needs the passcode (the same one used for suggesting edits)
  const g = creds ? { slug, passcode: creds.passcode, token: guestToken(slug) } : null;
  const actions: CommentActions | undefined = g
    ? {
        add: async (blockKey) => {
          const id = await addAsGuest({ ...g, name: creds?.name ?? "", blockKey, text: "" });
          setFocusComment(id);
          return id;
        },
        update: (id, text) => void updateAsGuest({ ...g, id: id as Id<"comments">, text }),
        remove: (id) => void removeAsGuest({ ...g, id: id as Id<"comments"> }),
        addLink: (id, url) => void attachLinkAsGuest({ ...g, id: id as Id<"comments">, url }),
        removeAttachment: (id, attachmentId) => void detachAsGuest({ ...g, id: id as Id<"comments">, attachmentId }),
      }
    : undefined;

  if (shared === undefined) return <div className="min-h-screen bg-(--c-b-ffffff)" />;
  if (shared === null)
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--c-b-ffffff) text-[14px] text-(--c-t-737373)">
        This link doesn&apos;t work anymore.
      </div>
    );

  const original = shared.blocks.map(fromServer);
  const instructions = shared.instructions.map(fromServer);
  const hasInstructions = instructions.some((b) => b.content.trim());
  const docBlocks = mode === "view" ? original : (mine ?? original);
  const keyOf = (b: Block) => (mode === "view" ? b.id : (b.source_block_id ?? b.id));
  const allComments = (comments ?? []) as Comment[];
  const hasExportable = allComments.some((c) => c.attachments.some((a) => a.url) || /https?:\/\//.test(c.text));
  const { counts: countsByKey, script: scriptComments } = groupComments(allComments, [...instructions, ...original]);
  const countsFor = (blocks: Block[]) => Object.fromEntries(blocks.map((b) => [b.id, countsByKey[keyOf(b)] ?? 0]));
  const openBlock = openId && openId !== SCRIPT ? [...instructions, ...docBlocks].find((b) => b.id === openId) : undefined;
  const openKey = openBlock ? keyOf(openBlock) : null;
  const canComment = mode === "view" && !!actions;
  const originalKeys = new Set([...instructions, ...original].map((b) => b.id));

  return (
    <BoardSourceProvider slug={slug}>
      <ScriptLayout
        left={
          <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-(--c-l-ebebeb) px-2.5 text-[13px] text-(--c-t-6b6b6b)">
            {mode === "editing" ? <IconPencil size={14} /> : <IconEye size={14} />}
            <span>{mode === "editing" ? "Suggesting edits" : mode === "mine" ? "Your edited version" : "View only"}</span>
          </div>
        }
        right={
          <>
            {hasExportable && (
              <button
                type="button"
                disabled={exporting !== null}
                onClick={async () => {
                  setExporting("Preparing…");
                  try {
                    await exportAttachments(shared.video.title || "Script", [...instructions, ...original], allComments, (d, t) =>
                      setExporting(t ? `Downloading ${d} of ${t}…` : "Preparing…"),
                    );
                  } finally {
                    setExporting(null);
                  }
                }}
                title="Download every attachment in the comments as a zip, with a list of all links"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[14px] text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b) disabled:opacity-60"
              >
                <IconDownload size={16} />
                <span className="hidden sm:inline">{exporting ?? "Export attachments"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => (openId === SCRIPT ? closeComments() : openComments(SCRIPT))}
              aria-label="Comments on this script"
              aria-pressed={openId === SCRIPT}
              title="Comments on this script"
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[14px] ${
                openId === SCRIPT ? "bg-(--c-b-e7eefb) text-(--c-t-2358d8)" : "text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)"
              }`}
            >
              <IconComments size={18} />
              {scriptComments.length > 0 && <span className="text-[13px]">{scriptComments.length}</span>}
            </button>
            {mode === "editing" && (
              <>
                <span className={`text-[13px] ${saveState === "error" ? "text-(--c-t-b42318)" : "text-(--c-t-9a9a9a)"}`}>
                  {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved, retrying…" : ""}
                </span>
                <button
                  type="button"
                  className={primaryButton}
                  onClick={async () => {
                    if (mine && dirty.current) await save(mine);
                    setMode("mine");
                    setOpenId(null);
                    window.scrollTo({ top: 0 });
                  }}
                >
                  Done
                </button>
              </>
            )}
            {mode === "mine" && (
              <>
                <button type="button" onClick={() => { setMode("view"); setOpenId(null); }} className="h-9 rounded-lg px-3 text-[14px] text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)">
                  View original
                </button>
                <button type="button" onClick={() => { setMode("editing"); setOpenId(null); }} className={primaryButton}>
                  Keep editing
                </button>
              </>
            )}
            {mode === "view" && shared.video.canEdit && (
              <button type="button" className={topButton} onClick={() => (creds ? void startEditing(creds) : setAskPass(true))}>
                {mine ? "Your edits" : "Suggest edits"}
              </button>
            )}
          </>
        }
        banner={
          mode !== "view" && (
            <div className="border-y border-(--c-l-f6d5d1) bg-(--c-b-fef6f5)">
              <div className="mx-auto max-w-[1440px] px-5 py-2.5 text-[14px] text-(--c-t-b42318) sm:px-10">
                {mode === "editing"
                  ? "You’re editing a copy. The owner gets it as an Edited version and chooses what to keep."
                  : "Your edited version is saved. Your changes are shown in red."}
              </div>
            </div>
          )
        }
        focusMode={!!openId && openId !== SCRIPT}
        panel={
          openId === SCRIPT ? (
            <CommentsPanel
              key={SCRIPT}
              blockKey={null}
              title="Comments on this script"
              comments={scriptComments}
              actions={actions}
              canWrite={!!actions}
              focusId={focusComment}
              onClose={closeComments}
              onOpenImage={setLightbox}
            />
          ) : openBlock && openKey ? (
            <CommentsPanel
              key={openKey}
              blockKey={openKey}
              title="Comments"
              quote={snippet(openBlock.content)}
              comments={allComments.filter((c) => c.blockKey === openKey)}
              actions={actions}
              canWrite={!!actions && originalKeys.has(openKey)}
              focusId={focusComment}
              onClose={closeComments}
              onOpenImage={setLightbox}
            />
          ) : undefined
        }
      >
        <VideoTitle meta={shared.video} readOnly />
        <ScriptTabs
          tabs={[
            ...(hasInstructions && mode !== "mine"
              ? [
                  {
                    id: "instructions",
                    label: "Editor instructions",
                    shortLabel: "Editor",
                    badge: instructionsProgress(instructions),
                    content: (
                      <Instructions
                        blocks={instructions}
                        setBlocks={noop}
                        readOnly
                        activeId={openId}
                        commentCounts={countsFor(instructions)}
                        onOpenComments={openComments}
                      />
                    ),
                  },
                ]
              : []),
            { id: "details", label: "Details", content: <VideoDetails meta={shared.video} readOnly /> },
            ...(shared.video.captions?.length ? [{ id: "captions", label: "Captions", content: <Captions captions={shared.video.captions} readOnly /> }] : []),
          ] satisfies ScriptTab[]}
        />
        <div className="mt-2">
          {mode === "editing" && mine ? (
            <DocEditor
              blocks={mine}
              setBlocks={setMineBlocks}
              canUpload={false}
              activeId={openId}
              commentCounts={countsFor(mine)}
              onOpenComments={openComments}
              placeholder="Write…"
            />
          ) : mode === "mine" && mine ? (
            <DiffBlocks
              original={original}
              edited={mine}
              activeId={openId}
              commentCounts={countsFor(mine)}
              onOpenComments={(b) => openComments(b)}
            />
          ) : (
            <DocEditor
              blocks={original}
              setBlocks={noop}
              readOnly
              canComment={canComment}
              activeId={openId}
              commentCounts={countsFor(original)}
              onOpenComments={openComments}
            />
          )}
        </div>
      </ScriptLayout>
      {askPass && <PasscodeDialog onCancel={() => setAskPass(false)} onSubmit={startEditing} />}
      <Lightbox url={lightbox} onClose={() => setLightbox(null)} />
    </BoardSourceProvider>
  );
}

function PasscodeDialog({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (c: Creds) => Promise<string | null> }) {
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input =
    "h-11 w-full rounded-lg border px-3 text-[15px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a) focus:border-(--c-l-8a8a8a)";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 px-4" onMouseDown={onCancel}>
      <form
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const err = await onSubmit({ passcode: passcode.trim(), name: name.trim() });
          setBusy(false);
          setError(err);
        }}
        className="flex w-full max-w-[380px] flex-col gap-4 rounded-xl border border-(--c-l-ebebeb) bg-(--c-popover) p-6 shadow-(--shadow-menu)"
      >
        <div className="flex flex-col gap-1.5">
          <h2 className="m-0 text-[18px] font-semibold text-(--c-t-1b1b1b)">Suggest edits</h2>
          <p className="m-0 text-[14px] leading-[1.5] text-(--c-t-6b6b6b)">Your changes are saved as a separate copy for the owner to review.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="guest-name" className="text-[13px] font-medium text-(--c-t-1b1b1b)">
            Your name
          </label>
          <input id="guest-name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} className={`${input} border-(--c-l-dcdcdc)`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="guest-pass" className="text-[13px] font-medium text-(--c-t-1b1b1b)">
            Passcode
          </label>
          <input
            id="guest-pass"
            required
            type="password"
            value={passcode}
            onChange={(e) => {
              setPasscode(e.target.value);
              setError(null);
            }}
            className={`${input} ${error ? "border-(--c-l-d92d20)" : "border-(--c-l-dcdcdc)"}`}
          />
          {error && <span className="text-[13px] text-(--c-t-b42318)">{error}</span>}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="h-10 rounded-lg px-3 text-[14px] text-(--c-t-6b6b6b) hover:bg-(--c-b-f4f4f4)">
            Cancel
          </button>
          <button disabled={busy} className={`${primaryButton} h-10`}>
            Start editing
          </button>
        </div>
      </form>
    </div>
  );
}
