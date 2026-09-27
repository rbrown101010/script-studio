"use client";

import { useEffect, useState } from "react";

// Light, dark, or follow the computer. Saved per browser; applied before the page paints (see themeInit).
export type ThemeChoice = "system" | "light" | "dark";
export const KEY = "theme";


function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as ThemeChoice | null;
      if (saved === "light" || saved === "dark" || saved === "system") setChoice(saved);
    } catch {}
  }, []);
  // Follow the computer's setting live while on "system"
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);
  const set = (c: ThemeChoice) => {
    setChoice(c);
    apply(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {}
  };
  return [choice, set] as const;
}
