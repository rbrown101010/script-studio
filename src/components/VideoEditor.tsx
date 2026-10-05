"use client";

import { useMutation, useQuery } from "convex/react";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  groupComments,
  snippet,
  snapToLine,
  type CommentActions,
} from "@/lib/comments";
import { readText, setCaret } from "@/lib/caret";
import { useDocSync, useLoadBlocks, type SaveState } from "@/lib/sync";
import {
  FORMATS,
  SPONSORSHIPS,
  STATUSES,
  type Attachment,
  type Block,
  type Comment,
} from "@/lib/types";
import {
  emptyBlock,
  kindForFile,
  scriptToText,
  timeAgo,
  uid,
} from "@/lib/util";
import { uploadToUrl } from "@/lib/upload";
import { Lightbox } from "./Attachments";
import { CommentsPanel } from "./CommentsPanel";
import { DocEditor } from "./DocEditor";
import { DiffBlocks, computeDiff } from "./DiffView";
import { Brief } from "./Brief";
import { Captions } from "./Captions";
import { Instructions, instructionsProgress } from "./Instructions";
import { Updates } from "./Updates";
import { ScriptLayout, primaryButton } from "./ScriptLayout";
import { SharePopover } from "./SharePopover";
import { ScriptTabs } from "./ScriptTabs";
import { VideoDetails, VideoTitle, type Meta } from "./VideoMeta";
import {
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconHistory,
  IconPin,
} from "./icons";
import {
  ShowSidebarButton,
  useAppSidebar,
} from "./HomeSidebar";
import { useIsMobile } from "@/lib/useIsMobile";
import { Presentation } from "./Presentation";

type SetList = (fn: (prev: Block[]) => Block[]) => void;
type DocInfo = {
  _id: string;
  kind: string;
  editorName: string | null;
  updatedAt: number;
};

const SCRIPT = "__script__";

// A few uploads at once; the rest wait their turn.
const queue: (() => Promise<void>)[] = [];
let active = 0;
function enqueue(job: () => Promise<void>) {
  queue.push(job);
  const pump = () => {
    while (active < 3 && queue.length) {
      const next = queue.shift()!;
      active++;
      void next().finally(() => {
        active--;
        pump();
      });
    }
  };
  pump();
}

export function VideoEditor({ id }: { id: string }) {
  const data = useQuery(api.videos.get, { id });
  const comments = useQuery(
    api.comments.list,
    data?.video ? { videoId: data.video._id } : "skip",
  );
  const addCommentM = useMutation(api.comments.add);
  const updateCommentM = useMutation(api.comments.update);
  const removeCommentM = useMutation(api.comments.remove);
  const moveCommentM = useMutation(api.comments.moveToLine);
  /** A comment being put onto a line: the next line clicked gets it */
  const [placing, setPlacing] = useState<string | null>(null);
  const attachM = useMutation(api.comments.attach);
  const detachM = useMutation(api.comments.detach);
  const loadBlocks = useLoadBlocks();
  const updateVideo = useMutation(api.videos.update);
  const generateUploadUrl = useMutation(api.docs.generateUploadUrl);
  const fileUrl = useMutation(api.docs.fileUrl);
  const promote = useMutation(api.docs.promote);
  const removeDoc = useMutation(api.docs.remove);

  const [meta, setMeta] = useState<Meta | null>(null);
  useDocumentTitle(meta ? meta.title || "Untitled script" : null);
  const [mainId, setMainId] = useState<string | null>(null);
  const [insId, setInsId] = useState<string | null>(null);
  const [mainBlocks, setMainBlocks] = useState<Block[] | null>(null);
  const [insBlocks, setInsBlocks] = useState<Block[] | null>(null);
  const [review, setReview] = useState<{
    doc: DocInfo;
    blocks: Block[];
  } | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  // Presentation mode lives in the address (?present), so it stays on through reloads and when you come back to the tab
  const [presenting, setPresentingState] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("present"))
      setPresentingState(true);
  }, []);
  const setPresenting = (on: boolean) => {
    setPresentingState(on);
    const params = new URLSearchParams(window.location.search);
    if (on) params.set("present", "1");
    else params.delete("present");
    const qs = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
    );
  };

  const setPinnedM = useMutation(api.videos.setPinned);
  const router = useRouter();
  const cameFromHome = useRef(false);
  useEffect(() => {
    try {
      cameFromHome.current = sessionStorage.getItem("nn-last-page") === "/";
      sessionStorage.setItem("nn-last-page", window.location.pathname);
    } catch {}
  }, []);
  const mobile = useIsMobile();
  const side = useAppSidebar();
  const partnerOptions = useQuery(api.partners.list)?.map((p) => ({
    id: p.id as string,
    name: p.name,
    logoUrl: p.logoUrl,
  }));
  /** Comments open in the side panel: a line's key, SCRIPT for the whole script, or none */
  const [openId, setOpenId] = useState<string | null>(null);
  const [focusComment, setFocusComment] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Record<string, Attachment[]>>({});
  const createdHere = useRef(new Set<string>());
  const [lightbox, setLightbox] = useState<string | null>(null);
  const mainSync = useDocSync(mainId, mainBlocks);
  const insSync = useDocSync(insId, insBlocks);
  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMeta = useRef<Partial<Meta>>({});
  const [metaState, setMetaState] = useState<SaveState>("idle");

  const setMain: SetList = useCallback(
    (fn) => setMainBlocks((p) => (p ? fn(p) : p)),
    [],
  );
  const setIns: SetList = useCallback(
    (fn) => setInsBlocks((p) => (p ? fn(p) : p)),
    [],
  );

  const docs = (data?.documents ?? []) as DocInfo[];
  const serverMain = docs.find((d) => d.kind === "main")?._id ?? null;
  const serverIns = docs.find((d) => d.kind === "instructions")?._id ?? null;

  useEffect(() => {
    if (data?.video && !meta)
      setMeta({
        title: data.video.title,
        liveDate: data.video.liveDate,
        format: data.video.format,
        status: data.video.status,
        sponsored: data.video.sponsored ?? "none",
        captions: data.video.captions,
        brief: data.video.brief,
        briefLinks: data.video.briefLinks,
        partnerId: data.video.partnerId ?? null,
      });
  }, [data?.video, meta]);

  // Load blocks when we first see the documents, and again if the main script is replaced
  useEffect(() => {
    if (!serverMain || serverMain === mainId) return;
    void loadBlocks(serverMain).then((b) => {
      mainSync.seed(serverMain, b);
      setMainBlocks(b.length ? b : [emptyBlock()]);
      setMainId(serverMain);
      setReview(null);
      setOpenId(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMain]);
  useEffect(() => {
    if (!serverIns || serverIns === insId) return;
    void loadBlocks(serverIns).then((b) => {
      insSync.seed(serverIns, b);
      setInsBlocks(b.length ? b : [{ ...emptyBlock(), type: "todo" }]);
      setInsId(serverIns);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverIns]);

  useEffect(() => {
    const busy = Object.values(uploading).some((list) =>
      list.some((a) => !a.error),
    );
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const changeMeta = (patch: Partial<Meta>) => {
    setMeta((m) => (m ? { ...m, ...patch } : m));
    pendingMeta.current = { ...pendingMeta.current, ...patch };
    if (metaTimer.current) clearTimeout(metaTimer.current);
    metaTimer.current = setTimeout(async () => {
      const p = pendingMeta.current;
      pendingMeta.current = {};
      setMetaState("saving");
      try {
        await updateVideo({
          id: id as Id<"videos">,
          ...p,
          partnerId: p.partnerId as Id<"partners"> | null | undefined,
        });
        setMetaState("saved");
      } catch {
        setMetaState("error");
      }
    }, 500);
  };

  const patchUpload = (
    commentId: string,
    attId: string,
    patch: Partial<Attachment> | null,
  ) =>
    setUploading((u) => {
      const list = (u[commentId] ?? [])
        .map((a) => (a.id === attId ? (patch ? { ...a, ...patch } : null) : a))
        .filter((a): a is Attachment => !!a);
      const next = { ...u, [commentId]: list };
      if (!list.length) delete next[commentId];
      return next;
    });

  const actions: CommentActions = {
    add: async (blockKey) => {
      const cid = await addCommentM({
        videoId: id as Id<"videos">,
        blockKey,
        text: "",
      });
      createdHere.current.add(cid);
      setFocusComment(cid);
      return cid;
    },
    update: (cid, text) =>
      void updateCommentM({ id: cid as Id<"comments">, text }),
    remove: (cid) => void removeCommentM({ id: cid as Id<"comments"> }),
    addLink: (cid, url) =>
      void attachM({
        id: cid as Id<"comments">,
        attachment: {
          id: uid(),
          kind: "link",
          url,
          storageId: null,
          name: null,
          mime: null,
          size: null,
        },
      }),
    removeAttachment: (cid, attId) => {
      if (uploading[cid]?.some((a) => a.id === attId))
        patchUpload(cid, attId, null);
      else void detachM({ id: cid as Id<"comments">, attachmentId: attId });
    },
    attach: (cid, attachment) =>
      void attachM({
        id: cid as Id<"comments">,
        attachment: {
          id: attachment.id,
          kind: attachment.kind,
          url: attachment.url,
          storageId: null,
          name: attachment.name,
          mime: attachment.mime,
          size: attachment.size,
        },
      }),
    addFiles: (cid, files) => {
      for (const file of files) {
        const att: Attachment = {
          id: uid(),
          kind: kindForFile(file),
          url: null,
          storageId: null,
          name: file.name,
          mime: file.type || null,
          size: file.size,
          progress: 0,
        };
        setUploading((u) => ({ ...u, [cid]: [...(u[cid] ?? []), att] }));
        enqueue(async () => {
          let last = 0;
          try {
            const uploadUrl = await generateUploadUrl();
            const storageId = await uploadToUrl(uploadUrl, file, (f) => {
              if (f - last >= 0.01 || f === 1) {
                last = f;
                patchUpload(cid, att.id, { progress: f });
              }
            });
            const url = await fileUrl({
              storageId: storageId as Id<"_storage">,
            });
            await attachM({
              id: cid as Id<"comments">,
              attachment: {
                id: att.id,
                kind: att.kind,
                url,
                storageId: storageId as Id<"_storage">,
                name: att.name,
                mime: att.mime,
                size: att.size,
              },
            });
            patchUpload(cid, att.id, null);
          } catch (e) {
            patchUpload(cid, att.id, {
              error: e instanceof Error ? e.message : "Upload failed",
            });
          }
        });
      }
    },
  };

  /** Dropping files on a line starts a new comment there holding the files, ready for instructions. */
  const dropFiles = async (blockKey: string, files: File[]) => {
    setOpenId(blockKey);
    snapToLine(blockKey);
    const cid = await actions.add(blockKey);
    actions.addFiles?.(cid, files);
  };

  // Comments you started but left empty get cleaned up after the panel closes
  const commentsRef = useRef<Comment[]>([]);
  commentsRef.current = (comments ?? []) as Comment[];
  const uploadingRef = useRef(uploading);
  uploadingRef.current = uploading;
  const sweepEmpty = () =>
    setTimeout(() => {
      for (const c of commentsRef.current) {
        if (
          !createdHere.current.has(c.id) ||
          c.text.trim() ||
          c.attachments.length ||
          uploadingRef.current[c.id]
        )
          continue;
        createdHere.current.delete(c.id);
        void removeCommentM({ id: c.id as Id<"comments"> });
      }
    }, 1500);

  const openComments = (key: string, opts?: { newComment?: boolean }) => {
    if (openId && openId !== key) sweepEmpty();
    setOpenId(key);
    setFocusComment(null);
    if (key !== SCRIPT) snapToLine(key);
    if (opts?.newComment) void actions.add(key === SCRIPT ? null : key);
  };

  const closeComments = () => {
    setOpenId(null);
    setFocusComment(null);
    sweepEmpty();
  };

  useEffect(() => {
    if (!placing) return;
    const pick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-placing-bar]")) return;
      const row = target.closest("[data-row-id]") as HTMLElement | null;
      e.preventDefault();
      e.stopPropagation();
      if (!row?.dataset.rowId) return;
      const key = row.dataset.rowId;
      const cid = placing;
      setPlacing(null);
      void (async () => {
        await Promise.all([mainSync.flush(), insSync.flush()]);
        await moveCommentM({ id: cid as Id<"comments">, blockKey: key });
        setOpenId(key);
        snapToLine(key);
      })();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPlacing(null);
    // Capture, so the click picks the line instead of starting to type in it
    window.addEventListener("mousedown", pick, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", pick, true);
      window.removeEventListener("keydown", esc);
    };
  }, [placing, mainSync, insSync, moveCommentM]);

  /** Puts the caret at the end of a line in the script or instructions */
  const focusLineEnd = (key: string) => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-row-id="${CSS.escape(key)}"] .editable`,
      );
      if (el) setCaret(el, readText(el).length);
    });
  };

  /** ⌘Enter from a comment: a new line under the commented one, as if Enter was pressed at its end */
  const continueBelow = (key: string) => {
    const add = (list: Block[]) => {
      const i = list.findIndex((b) => b.id === key);
      if (i < 0) return null;
      const cur = list[i];
      const listy =
        cur.type === "bullet" || cur.type === "number" || cur.type === "todo";
      const nb: Block = {
        id: uid(),
        type: listy ? cur.type : "p",
        content: "",
        color: cur.color ?? null,
      } as Block;
      return {
        next: [...list.slice(0, i + 1), nb, ...list.slice(i + 1)],
        id: nb.id,
      };
    };
    const inMain = mainBlocks?.some((b) => b.id === key);
    const target = inMain ? mainBlocks : insBlocks;
    const res = target ? add(target) : null;
    if (!res) return;
    if (inMain) setMain(() => res.next);
    else setIns(() => res.next);
    closeComments();
    // Wait for the new line to render, then type in it
    setTimeout(() => focusLineEnd(res.id), 30);
  };

  const openReview = async (doc: DocInfo) => {
    setVersionsOpen(false);
    setOpenId(null);
    await mainSync.flush();
    const blocks = await loadBlocks(doc._id);
    setReview({ doc, blocks });
    window.scrollTo({ top: 0 });
  };

  if (data === null)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-[14px] text-(--c-t-737373)">
        This script doesn&apos;t exist anymore.
        <Link href="/" className="font-medium text-(--c-t-2358d8)">
          Back to scripts
        </Link>
      </div>
    );
  if (!data || !meta || !mainBlocks || !insBlocks)
    return <div className="min-h-screen bg-(--c-b-ffffff)" />;

  const edited = docs
    .filter((d) => d.kind === "edited")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const archived = docs
    .filter((d) => d.kind === "archived")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const states = [mainSync.state, insSync.state, metaState];
  const saveLabel = states.includes("error")
    ? "Offline, retrying…"
    : states.includes("saving")
      ? "Saving…"
      : "";

  // Comments live on lines by key; an edited version's lines point back to the originals
  const keyOf = (b: Block) => (review ? (b.source_block_id ?? b.id) : b.id);
  const allComments: Comment[] = ((comments ?? []) as Comment[]).map((c) =>
    uploading[c.id]
      ? { ...c, attachments: [...c.attachments, ...uploading[c.id]] }
      : c,
  );
  const { counts: countsByKey, script: scriptComments } = groupComments(
    allComments,
    [...insBlocks, ...mainBlocks],
  );
  // An earlier version shows each comment where it was then: its current line if that line is in the version,
  // otherwise the most recent line it used to be on
  const archivedKeys =
    review?.doc.kind === "archived"
      ? new Set(review.blocks.map((b) => b.id))
      : null;
  const placeOf = (c: Comment) => {
    if (!archivedKeys || !c.blockKey || archivedKeys.has(c.blockKey))
      return c.blockKey;
    return (
      [...(c.keyHistory ?? [])].reverse().find((k) => archivedKeys.has(k)) ??
      c.blockKey
    );
  };
  const archivedCounts: Record<string, number> = {};
  if (archivedKeys)
    for (const c of allComments) {
      const k = placeOf(c);
      if (k) archivedCounts[k] = (archivedCounts[k] ?? 0) + 1;
    }
  const countsFor = (blocks: Block[]) =>
    Object.fromEntries(
      blocks.map((b) => [
        b.id,
        (archivedKeys ? archivedCounts : countsByKey)[keyOf(b)] ?? 0,
      ]),
    );
  const shownBlocks = review ? review.blocks : [...insBlocks, ...mainBlocks];
  const openBlock =
    openId && openId !== SCRIPT
      ? shownBlocks.find((b) => b.id === openId)
      : undefined;
  const openKey = openBlock ? keyOf(openBlock) : null;

  // The side panel only shows while comments are open
  const panel =
    openId === SCRIPT ? (
      <CommentsPanel
        key={SCRIPT}
        blockKey={null}
        title="Comments on this script"
        comments={scriptComments}
        onPlace={review ? undefined : (cid) => setPlacing(cid)}
        actions={actions}
        canWrite
        canDeleteOthers
        focusId={focusComment}
        onClose={closeComments}
        hideClose
        onOpenImage={setLightbox}
      />
    ) : openBlock && openKey ? (
      <CommentsPanel
        key={openKey}
        blockKey={openKey}
        title="Comments"
        quote={snippet(openBlock.content)}
        onNextLine={review ? undefined : () => continueBelow(openBlock.id)}
        onBackToLine={review ? undefined : () => focusLineEnd(openBlock.id)}
        comments={allComments.filter((c) => placeOf(c) === openKey)}
        actions={actions}
        canWrite
        canDeleteOthers
        focusId={focusComment}
        onClose={() => openComments(SCRIPT)}
        onOpenImage={setLightbox}
      />
    ) : undefined;

  return (
    <>
      <ScriptLayout
        navOpen={side.shown}
        left={
          <>
            {(!side.shown || side.mobile) && (
              <ShowSidebarButton
                onClick={() => side.toggle(true)}
                className="mr-0.5"
              />
            )}
            <Link
              href="/"
              onClick={(e) => {
                // Came here from the Scripts page: go back to it, so its view, filters and scroll are just as you left them
                if (cameFromHome.current && window.history.length > 1) {
                  e.preventDefault();
                  router.back();
                }
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[14px] text-(--c-t-6b6b6b) no-underline hover:bg-(--c-b-f4f4f4)"
            >
              <IconArrowLeft />
              {/* Phones: just the arrow, so the top bar fits next to the sidebar button */}
              <span className="max-sm:hidden">Scripts</span>
            </Link>
          </>
        }
        right={
          saveLabel && (
            <span
              className={`mr-1 text-[13px] ${states.includes("error") ? "text-(--c-t-b42318)" : "text-(--c-t-9a9a9a)"}`}
            >
              {saveLabel}
            </span>
          )
        }
        onOpenPanel={() => openComments(SCRIPT)}
        onClosePanel={closeComments}
        tools={
          <>
            <button
              type="button"
              onClick={() =>
                void setPinnedM({
                  id: id as Id<"videos">,
                  pinned: !data.video.pinnedAt,
                })
              }
              aria-pressed={!!data.video.pinnedAt}
              aria-label={data.video.pinnedAt ? "Unpin" : "Pin"}
              title={
                data.video.pinnedAt
                  ? "Unpin from the sidebar and the top of Scripts"
                  : "Pin to the sidebar and the top of Scripts"
              }
              className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-(--c-b-ececea) ${data.video.pinnedAt ? "text-(--c-t-2358d8)" : "text-(--c-t-6b6b6b) hover:text-(--c-t-1b1b1b)"}`}
            >
              <IconPin size={17} filled={!!data.video.pinnedAt} />
            </button>
            <button
              type="button"
              onClick={() => setPresenting(true)}
              aria-label="Present"
              title="Present: full screen, hover lines to show their notes"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-(--c-t-6b6b6b) hover:bg-(--c-b-ececea) hover:text-(--c-t-1b1b1b)"
            >
              <PresentIcon />
            </button>
            <CopyForAgent
              text={() => {
                const origin = window.location.origin;
                const details = [
                  `Status: ${STATUSES.find((s) => s.value === meta.status)?.label ?? meta.status}`,
                  `Format: ${FORMATS.find((f) => f.value === meta.format)?.label ?? meta.format}`,
                  meta.liveDate ? `Live date: ${meta.liveDate}` : null,
                  meta.sponsored && meta.sponsored !== "none"
                    ? `Sponsorship: ${SPONSORSHIPS.find((s) => s.value === meta.sponsored)?.label}`
                    : null,
                ].filter(Boolean);
                return [
                  `Native Note script: ${meta.title || "Untitled"}`,
                  `Script id: ${id}`,
                  `Open in Native Note: ${origin}/v/${id}`,
                  `Share link: ${origin}/s/${data.video.shareSlug}`,
                  `Script, comments and every attached file (no sign-in): ${origin}/s/${data.video.shareSlug}/agent (JSON, or ?format=md)`,
                  `Download all attached files: curl -fsSL '${origin}/s/${data.video.shareSlug}/agent?format=sh' | sh`,
                  details.join(" · "),
                  "",
                  `To read or change this script, use the "Native Note" skill in Composio (its tools are CUSTOM_NATIVE_NOTE_*). Start with read_guide, then get_script with the script id above. You can edit the text directly (edit_lines / edit_script), comment on any line, and update captions, the brief and the Updates log. Every script edit saves the previous version, so nothing is lost.`,
                ].join("\n");
              }}
            />
            <SharePopover
              icon
              align={mobile ? "right" : "left"}
              videoId={id}
              shareSlug={data.video.shareSlug}
              passcode={data.video.editPasscode}
              getText={() => scriptToText(meta.title, mainBlocks)}
            />
            {(edited.length > 0 || archived.length > 0) && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setVersionsOpen(!versionsOpen)}
                  aria-expanded={versionsOpen}
                  aria-label={
                    edited.length === 0
                      ? "Versions"
                      : edited.length === 1
                        ? "Versions: 1 edited version"
                        : `Versions: ${edited.length} edited versions`
                  }
                  title={
                    edited.length === 0
                      ? "Versions"
                      : edited.length === 1
                        ? "1 edited version to review"
                        : `${edited.length} edited versions to review`
                  }
                  className={`relative flex h-9 w-9 items-center justify-center rounded-lg ${
                    versionsOpen
                      ? "bg-(--c-b-e6e6e3) text-(--c-t-1b1b1b)"
                      : edited.length
                        ? "text-(--c-t-b42318) hover:bg-(--c-b-fbdcd8)"
                        : "text-(--c-t-6b6b6b) hover:bg-(--c-b-ececea) hover:text-(--c-t-1b1b1b)"
                  }`}
                >
                  <IconHistory size={18} />
                  {edited.length > 0 && (
                    <span className="absolute right-1 top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-(--c-b-d92d20) px-1 text-[10px] font-semibold leading-none text-white">
                      {edited.length}
                    </span>
                  )}
                </button>
                {versionsOpen && (
                  <div
                    className={`absolute ${mobile ? "right-0" : "left-0"} top-11 z-40 w-72 rounded-xl border border-(--c-l-ebebeb) bg-(--c-b-ffffff) p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.10)]`}
                  >
                    {edited.map((d) => (
                      <button
                        key={d._id}
                        type="button"
                        onClick={() => openReview(d)}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-(--c-b-f4f4f4)"
                      >
                        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-(--c-b-d92d20)" />
                        <span className="min-w-0">
                          <span className="block text-[14px] text-(--c-t-1b1b1b)">
                            Edited version by {d.editorName || "someone"}
                          </span>
                          <span className="block text-[12px] text-(--c-t-737373)">
                            {timeAgo(new Date(d.updatedAt).toISOString())}
                          </span>
                        </span>
                      </button>
                    ))}
                    {archived.length > 0 && (
                      <>
                        {edited.length > 0 && (
                          <div className="mx-1 my-1.5 h-px bg-(--c-b-ebebeb)" />
                        )}
                        <div className="px-2 pb-1 pt-1.5 text-[12px] text-(--c-t-737373)">
                          Earlier versions
                        </div>
                        {archived.map((d) => (
                          <button
                            key={d._id}
                            type="button"
                            onClick={() => openReview(d)}
                            className="block w-full rounded-md px-2 py-1.5 text-left text-[14px] text-(--c-t-1b1b1b) hover:bg-(--c-b-f4f4f4)"
                          >
                            Replaced{" "}
                            {new Date(d.updatedAt).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}
                            ,{" "}
                            {new Date(d.updatedAt).toLocaleTimeString(
                              undefined,
                              { hour: "numeric", minute: "2-digit" },
                            )}
                            {d.editorName && (
                              <span className="text-(--c-t-737373)">
                                {" "}
                                · by {d.editorName}
                              </span>
                            )}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        }
        banner={
          review && (
            <ReviewBar
              review={review}
              original={mainBlocks}
              onBack={() => {
                setReview(null);
                setOpenId(null);
              }}
              onUse={async () => {
                await mainSync.flush();
                await promote({
                  documentId: review.doc._id as Id<"documents">,
                });
              }}
              onDiscard={async () => {
                const label =
                  review.doc.kind === "edited"
                    ? "this edited version"
                    : "this earlier version";
                if (!confirm(`Delete ${label}? This can't be undone.`)) return;
                await removeDoc({
                  documentId: review.doc._id as Id<"documents">,
                });
                setReview(null);
                setOpenId(null);
              }}
            />
          )
        }
        panel={panel}
        focusMode={!!openId && openId !== SCRIPT}
      >
        <VideoTitle
          meta={meta}
          onChange={changeMeta}
          readOnly={!!review}
          onEnter={() =>
            document
              .querySelector<HTMLElement>("[data-script] .editable")
              ?.focus()
          }
        />
        <ScriptTabs
          tabs={[
            {
              id: "instructions",
              label: "Editor instructions",
              shortLabel: "Editor",
              badge: instructionsProgress(insBlocks),
              content: (
                <Instructions
                  blocks={insBlocks}
                  setBlocks={setIns}
                  readOnly={!!review}
                  canUpload
                  onFiles={(b, files) => void dropFiles(b, files)}
                  activeId={openId}
                  commentCounts={countsFor(insBlocks)}
                  onOpenComments={openComments}
                />
              ),
            },
            {
              id: "details",
              label: "Details",
              content: (
                <VideoDetails
                  meta={meta}
                  onChange={changeMeta}
                  readOnly={!!review}
                  partners={partnerOptions}
                />
              ),
            },
            {
              id: "captions",
              label: "Captions",
              badge: captionsBadge(meta.captions),
              content: (
                <Captions
                  captions={meta.captions ?? []}
                  onChange={(captions) => changeMeta({ captions })}
                  readOnly={!!review}
                />
              ),
            },
            {
              id: "brief",
              label: "Brief",
              content: (
                <Brief
                  value={meta.brief ?? ""}
                  onChange={(brief) => changeMeta({ brief })}
                  links={meta.briefLinks ?? []}
                  onLinksChange={(briefLinks) => changeMeta({ briefLinks })}
                  readOnly={!!review}
                />
              ),
            },
            {
              id: "updates",
              label: "Updates",
              content: <Updates videoId={id} readOnly={!!review} />,
            },
          ]}
        />
        {review ? (
          <div className="mt-2">
            {review.doc.kind === "edited" ? (
              <DiffBlocks
                original={mainBlocks}
                edited={review.blocks}
                activeId={openId}
                commentCounts={countsFor(review.blocks)}
                onOpenComments={(b) => openComments(b)}
              />
            ) : (
              <DocEditor
                blocks={review.blocks}
                setBlocks={() => {}}
                readOnly
                activeId={openId}
                commentCounts={countsFor(review.blocks)}
                onOpenComments={(b) => openComments(b)}
              />
            )}
          </div>
        ) : (
          <>
            <div data-script className="mt-2">
              <DocEditor
                blocks={mainBlocks}
                setBlocks={setMain}
                boardName={meta?.title}
                canUpload
                canComment
                onFiles={(b, files) => void dropFiles(b, files)}
                activeId={openId}
                commentCounts={countsFor(mainBlocks)}
                onOpenComments={openComments}
              />
            </div>
          </>
        )}
      </ScriptLayout>
      {presenting && (
        <Presentation
          title={meta.title}
          blocks={mainBlocks}
          comments={allComments}
          onClose={() => setPresenting(false)}
        />
      )}
      {placing && (
        <div
          data-placing-bar
          className="fixed inset-x-0 top-3 z-[70] flex justify-center px-4"
        >
          <div className="flex items-center gap-3 rounded-full bg-(--c-b-1b1b1b) py-2 pl-4 pr-2 text-[14px] text-(--c-on-ink) shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
            Click the line to put this comment on
            <button
              type="button"
              onClick={() => setPlacing(null)}
              className="h-7 rounded-full bg-white/15 px-3 text-[13px] hover:bg-white/25"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <Lightbox url={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}

/** "1/4 posted" once any caption is written */
function captionsBadge(list: Meta["captions"]) {
  const written = (list ?? []).filter(
    (c) => c.caption.trim() || c.linkInBio.trim(),
  );
  return written.length
    ? `${written.filter((c) => c.posted).length}/${written.length} posted`
    : "";
}

/** Copies a short note to hand an AI agent: which script this is and how to reach it through the Native Note skill. */
function CopyForAgent({ text }: { text: () => string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text());
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          window.prompt("Copy this for your agent:", text());
        }
      }}
      aria-label="Copy details for an AI agent"
      title="Copy details for an AI agent"
      className={`inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] ${copied ? "text-(--c-t-15803d)" : "text-(--c-t-6b6b6b) hover:bg-(--c-b-ececea) hover:text-(--c-t-1b1b1b)"}`}
    >
      {copied ? <IconCheck size={17} /> : <IconCopy size={17} />}
      {copied && <span>Copied</span>}
    </button>
  );
}

function ReviewBar({
  review,
  original,
  onBack,
  onUse,
  onDiscard,
}: {
  review: { doc: DocInfo; blocks: Block[] };
  original: Block[];
  onBack: () => void;
  onUse: () => Promise<void>;
  onDiscard: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isEdit = review.doc.kind === "edited";
  const s = isEdit ? computeDiff(original, review.blocks).summary : null;
  const parts = s
    ? [
        s.changed && `${s.changed} changed`,
        s.added && `${s.added} added`,
        s.removed && `${s.removed} removed`,
      ].filter(Boolean)
    : [];
  return (
    <div
      className={`border-y ${isEdit ? "border-(--c-l-f6d5d1) bg-(--c-b-fef6f5)" : "border-(--c-l-ebebeb) bg-(--c-b-fafafa)"}`}
    >
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-[14px] sm:px-10">
        <div className={isEdit ? "text-(--c-t-b42318)" : "text-(--c-t-6b6b6b)"}>
          {isEdit ? (
            <>
              <span className="font-medium">Edited version</span> by{" "}
              {review.doc.editorName || "someone"},{" "}
              {timeAgo(new Date(review.doc.updatedAt).toISOString())}
              {parts.length > 0 ? (
                <span className="text-(--c-t-d92d20)">
                  {" "}
                  · {parts.join(", ")} · changes in red
                </span>
              ) : (
                <span> · no changes yet</span>
              )}
            </>
          ) : (
            <>
              <span className="font-medium">Earlier version</span>, replaced{" "}
              {new Date(review.doc.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
              {review.doc.editorName && ` by ${review.doc.editorName}`}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="h-9 rounded-lg px-3 text-[14px] text-(--c-t-6b6b6b) hover:bg-(--c-b-ffffff)"
          >
            Back to current
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="h-9 rounded-lg px-3 text-[14px] text-(--c-t-6b6b6b) hover:bg-(--c-b-ffffff) hover:text-(--c-t-b42318)"
          >
            {isEdit ? "Discard edits" : "Delete"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const msg = isEdit
                ? "Use this edited version? Your current version is kept under Earlier versions."
                : "Restore this version? Your current version is kept under Earlier versions.";
              if (!confirm(msg)) return;
              setBusy(true);
              try {
                await onUse();
              } finally {
                setBusy(false);
              }
            }}
            className={primaryButton}
          >
            {isEdit ? "Use this version" : "Restore this version"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PresentIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="3.5" width="15" height="10" rx="2" />
      <path d="M8.5 6.6v4.3l3.6-2.15-3.6-2.15ZM7 16.5h6M10 13.5v3" />
    </svg>
  );
}
