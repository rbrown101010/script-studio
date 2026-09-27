"use client";

import { useEffect, useState } from "react";

/** True on phone/tablet-width screens (below the desktop layout's lg breakpoint). Desktop never changes. */
export function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}
