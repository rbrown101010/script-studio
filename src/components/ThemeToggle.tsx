"use client";

import { useTheme, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun /> },
  { value: "dark", label: "Dark", icon: <Moon /> },
  { value: "system", label: "System", icon: <Monitor /> },
];

/** Light / Dark / System switch. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [choice, setChoice] = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={`flex rounded-lg bg-(--c-b-f0f0f0) p-0.5 ${className}`}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={choice === o.value}
          title={o.label}
          onClick={() => setChoice(o.value)}
          className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] ${
            choice === o.value ? "bg-(--c-b-ffffff) font-medium text-(--c-t-1b1b1b) shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-(--c-t-737373) hover:text-(--c-t-1b1b1b)"
          }`}
        >
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Sun() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" />
    </svg>
  );
}
function Moon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.5 9.6A5.5 5.5 0 0 1 6.4 2.5a5.5 5.5 0 1 0 7.1 7.1Z" />
    </svg>
  );
}
function Monitor() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.5" />
      <path d="M5.5 14h5M8 11.25V14" />
    </svg>
  );
}
