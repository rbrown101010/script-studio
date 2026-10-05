"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePresence } from "@/lib/usePresence";
import { useIsMobile } from "@/lib/useIsMobile";
import { IconPanelRight } from "./icons";
import { SIDEBAR_WIDTH } from "./HomeSidebar";

/** Page frame from the design: quiet top row, script column, and the Attachments panel on the right. */
export function ScriptLayout({
  left,
  right,
  banner,
  children,
  panel,
  focusMode,
  tools,
  onOpenPanel,
  onClosePanel,
  navOpen,
}: {
  left?: ReactNode;
  right?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  /** Side panel; when absent the page reads as a plain, centered document */
  panel?: ReactNode;
  /** A line's comments are open: leave room below so that line can be brought up to the same spot */
  focusMode?: boolean;
  /** Icon buttons (copy, share, versions) at the top of the sidebar; in the top bar on phones */
  tools?: ReactNode;
  /** Shows the "open sidebar" button while the sidebar is closed */
  onOpenPanel?: () => void;
  /** Shows a close button at the top of the sidebar */
  onClosePanel?: () => void;
  /** Whether the app sidebar (from the app shell) is taking room on the left, so the script centres in what's left */
  navOpen?: boolean;
}) {
  const mobile = useIsMobile();
  const sheet = mobile && panel;
  const side = !!panel && !mobile;
  // Keep showing the last panel while the sidebar slides closed
  const [lastPanel, setLastPanel] = useState<ReactNode>(panel ?? null);
  useEffect(() => {
    if (panel) setLastPanel(panel);
  }, [panel]);
  const sidebar = usePresence(side, 200);
  const bottom = usePresence(!!sheet, 200);
  const iconButton = "flex h-9 w-9 items-center justify-center rounded-lg text-(--c-t-6b6b6b) hover:bg-(--c-b-ececea) hover:text-(--c-t-1b1b1b)";
  const openButton = onOpenPanel && !side && (
    <button type="button" onClick={onOpenPanel} aria-label="Open sidebar" title="Open sidebar" className={iconButton}>
      <IconPanelRight size={19} />
    </button>
  );
  const topBar = (
    <div className="flex h-[72px] items-center justify-between pl-4 pr-4 sm:pl-7 sm:pr-10">
      <div className="flex items-center gap-2">{left}</div>
      <div className="flex items-center gap-1.5">
        {right}
        {mobile && tools}
        {openButton}
      </div>
    </div>
  );

  // The page on the left; on computers a full-height utility sidebar slides in from the right.
  // The script column stays centered in whatever room is left, so it glides as the sidebar moves.
  return (
    <div className="flex min-h-screen bg-(--c-b-ffffff)" style={{ ["--nav" as string]: `${navOpen && !mobile ? SIDEBAR_WIDTH : 0}px` }}>
      <div className="min-w-0 flex-1">
        {topBar}
        {banner}
        {/* Extra room below while commenting, so any line can be brought up to the same spot */}
        <main className={`px-5 pt-7 [--pl:20px] sm:px-16 sm:[--pl:64px] lg:px-[88px] lg:[--pl:88px] ${focusMode && mobile ? "pb-[85vh]" : sheet ? "pb-[60vh]" : "pb-20"}`}>
          {/* The script sits where it would be centered on the whole screen, and only slides left when the
              sidebar needs the room, so opening comments doesn't move what you're writing */}
          <div className="w-full max-w-[680px]" style={{ marginLeft: "clamp(0px, calc((100vw - var(--nav, 0px) - 680px) / 2 - var(--pl)), calc(100% - 680px))" }}>
            {children}
          </div>
        </main>
      </div>
      {!mobile && sidebar.mounted && (
        <div
          aria-hidden={!side}
          className={`sticky top-0 h-screen shrink-0 overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
            sidebar.visible ? "w-[440px] xl:w-[480px]" : "w-0"
          }`}
        >
          <div className="flex h-full w-[440px] flex-col border-l border-(--c-l-e6e6e3) bg-(--c-b-f4f4f2) xl:w-[480px]">
            {(tools || onClosePanel) && (
              <div className="flex h-[72px] shrink-0 items-center gap-1 px-4">
                {tools}
                <div className="flex-1" />
                {onClosePanel && (
                  <button type="button" onClick={onClosePanel} aria-label="Close sidebar" title="Close sidebar" className={iconButton}>
                    <IconPanelRight size={19} />
                  </button>
                )}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">{panel ?? lastPanel}</div>
          </div>
        </div>
      )}
      {mobile && bottom.mounted && <BottomSheet visible={bottom.visible}>{panel ?? lastPanel}</BottomSheet>}
    </div>
  );
}

export const topButton =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-(--c-l-dcdcdc) bg-(--c-b-ffffff) px-3.5 text-[14px] font-medium text-(--c-t-1b1b1b) hover:bg-(--c-b-fafafa)";
export const primaryButton =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-(--c-b-1b1b1b) px-4 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-50";

/**
 * Phones: comments slide up from the bottom over the lower part of the page. The script above stays
 * scrollable and editable, so you can keep writing with comments open; close them from the panel.
 */
function BottomSheet({ children, visible }: { children: ReactNode; visible: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col justify-end">
      <div
        className={`pointer-events-auto max-h-[50dvh] transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${visible ? "translate-y-0" : "translate-y-full"} overflow-y-auto overscroll-contain rounded-t-2xl bg-(--c-b-f4f4f2) pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.12)]`}
      >
        <div className="sticky top-0 z-10 flex justify-center bg-(--c-b-f4f4f2) pb-1 pt-2">
          <span className="h-1 w-10 rounded-full bg-(--c-b-dcdcdc)" aria-hidden="true" />
        </div>
        <div className="[&>aside]:rounded-none [&>aside]:border-0 [&>aside]:shadow-none">{children}</div>
      </div>
    </div>
  );
}
