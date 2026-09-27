import { useId } from "react";
import type { VideoFormat } from "@/lib/types";

/** Long-form shows the YouTube logo, short-form the Instagram logo. */
export function FormatIcon({ format, size = 18 }: { format: VideoFormat; size?: number }) {
  const grad = `ig-${useId().replace(/:/g, "")}`;
  if (format === "long")
    return (
      <svg viewBox="0 0 28 20" width={size * 1.12} height={size * 0.8} role="img" aria-label="Long-form (YouTube)">
        <rect width="28" height="20" rx="5.5" fill="#FF0000" />
        <path d="M11.2 5.8v8.4L18.4 10z" fill="#FFFFFF" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="Short-form (Instagram)">
      <defs>
        <radialGradient id={grad} cx="0.3" cy="1.07" r="1.3">
          <stop offset="0" stopColor="#FDD56B" />
          <stop offset="0.3" stopColor="#F7743B" />
          <stop offset="0.6" stopColor="#D62976" />
          <stop offset="1" stopColor="#6A3BD1" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6.5" fill={`url(#${grad})`} />
      <rect x="5.2" y="5.2" width="13.6" height="13.6" rx="4.2" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.3" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
      <circle cx="16.4" cy="7.6" r="1.1" fill="#FFFFFF" />
    </svg>
  );
}
