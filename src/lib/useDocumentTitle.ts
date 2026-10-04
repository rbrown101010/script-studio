"use client";

import { useEffect, useRef } from "react";

/** The browser tab says what's open (a script's or board's name, or the page); null leaves the tab as it is */
export function useDocumentTitle(title: string | null | undefined) {
  const set = useRef(false);
  useEffect(() => {
    if (title === null || title === undefined) return;
    document.title = title.trim() || "Native Note";
    set.current = true;
  }, [title]);
  useEffect(
    () => () => {
      if (set.current) document.title = "Native Note";
    },
    [],
  );
}
