"use client";

import type { ReactNode } from "react";
import { TeamGate } from "@/components/TeamGate";
import { AppShell } from "@/components/HomeSidebar";

/** Signed-in pages share one sidebar, so it stays put while you move between them */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <TeamGate>
      <AppShell>{children}</AppShell>
    </TeamGate>
  );
}
