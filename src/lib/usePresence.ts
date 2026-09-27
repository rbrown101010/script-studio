"use client";

import { useEffect, useState } from "react";

/**
 * For things that animate in and out: `mounted` stays true until the closing animation has finished,
 * `visible` flips a frame after mounting so CSS transitions run on the way in too.
 */
export function usePresence(open: boolean, ms = 200) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      // A short timer (not requestAnimationFrame, which pauses in background tabs) so the closed state paints first
      const t = setTimeout(() => setVisible(true), 20);
      return () => clearTimeout(t);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return { mounted, visible };
}
