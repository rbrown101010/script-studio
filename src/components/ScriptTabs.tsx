"use client";

import { useEffect, useState, type ReactNode } from "react";

/** shortLabel is used on phones, where the tab row is narrow */
export type ScriptTab = { id: string; label: string; shortLabel?: string; badge?: string; content: ReactNode };

/** Editor instructions / Details / Captions, under the title. The first tab shows by default. */
export function ScriptTabs({
  tabs,
  collapsible,
}: {
  tabs: ScriptTab[];
  /** Lets you fold the sections away while writing, leaving just the tab names (remembered on this device) */
  collapsible?: boolean;
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (!collapsible) return;
    try {
      setFolded(localStorage.getItem("script-details-folded") === "1");
    } catch {}
  }, [collapsible]);
  const fold = (next: boolean) => {
    setFolded(next);
    try {
      localStorage.setItem("script-details-folded", next ? "1" : "0");
    } catch {}
  };
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  if (!current) return null;
  const shut = collapsible && folded;
  return (
    <div className={shut ? "mt-5 pb-3" : "mt-6 pb-5"}>
      {/* On phones the row scrolls sideways instead of squeezing, so more tabs can be added later */}
      <div
        role="tablist"
        aria-label="Script sections"
        className={`-mx-5 flex items-center gap-5 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden ${
          shut ? "" : "border-b border-(--c-l-ebebeb)"
        }`}
      >
        {tabs.map((t) => {
          const on = t.id === current.id && !shut;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              onClick={() => {
                setActive(t.id);
                if (shut) fold(false);
              }}
              className={`-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 font-medium transition-colors ${
                shut ? "h-7 border-transparent text-[13px] text-(--c-t-9a9a9a) hover:text-(--c-t-1b1b1b)" : "h-9 text-[14px]"
              } ${shut ? "" : on ? "border-(--c-l-1b1b1b) text-(--c-t-1b1b1b)" : "border-transparent text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"}`}
            >
              {t.shortLabel ? (
                <>
                  <span className="sm:hidden">{t.shortLabel}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                </>
              ) : (
                t.label
              )}
              {t.badge && <span className="text-[12px] font-normal text-(--c-t-9a9a9a)">{t.badge}</span>}
            </button>
          );
        })}
        {collapsible && (
          <button
            type="button"
            onClick={() => fold(!shut)}
            aria-expanded={!shut}
            title={shut ? "Show the script details" : "Hide the details while you write"}
            className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 text-[12.5px] text-(--c-t-9a9a9a) hover:bg-(--c-b-f4f4f4) hover:text-(--c-t-1b1b1b) ${shut ? "h-7" : "-mb-px h-7"}`}
          >
            {shut ? "Show" : "Hide"}
            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform duration-200 ${shut ? "" : "rotate-180"}`}>
              <path d="m3 4.5 3 3 3-3" />
            </svg>
          </button>
        )}
      </div>
      {!shut && (
        <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`} className="pt-3">
          {current.content}
        </div>
      )}
    </div>
  );
}
