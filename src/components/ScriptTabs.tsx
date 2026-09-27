"use client";

import { useState, type ReactNode } from "react";

/** shortLabel is used on phones, where the tab row is narrow */
export type ScriptTab = { id: string; label: string; shortLabel?: string; badge?: string; content: ReactNode };

/** Editor instructions / Details / Captions, under the title. The first tab shows by default. */
export function ScriptTabs({ tabs }: { tabs: ScriptTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  if (!current) return null;
  return (
    <div className="mt-6 pb-5">
      {/* On phones the row scrolls sideways instead of squeezing, so more tabs can be added later */}
      <div
        role="tablist"
        aria-label="Script sections"
        className="-mx-5 flex gap-5 overflow-x-auto border-b border-(--c-l-ebebeb) px-5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => {
          const on = t.id === current.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              onClick={() => setActive(t.id)}
              className={`-mb-px inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-[14px] font-medium ${
                on ? "border-(--c-l-1b1b1b) text-(--c-t-1b1b1b)" : "border-transparent text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"
              }`}
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
      </div>
      <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`} className="pt-3">
        {current.content}
      </div>
    </div>
  );
}
