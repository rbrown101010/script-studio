"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";
import { useConvexAuth } from "convex/react";
import { useState, type ReactNode } from "react";
import { IconScript } from "./icons";

/** Only signed-in team members get past this. Signing up needs the team code. */
export function TeamGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) return <div className="min-h-screen bg-(--c-b-ffffff)" />;
  if (!isAuthenticated) return <AuthScreen />;
  return <>{children}</>;
}

const inputCls =
  "h-11 rounded-lg border border-(--c-l-dcdcdc) bg-(--c-b-ffffff) px-3 text-[15px] text-(--c-t-1b1b1b) outline-none placeholder:text-(--c-t-9a9a9a) focus:border-(--c-l-8a8a8a)";

function Field({ id, label, hint, ...props }: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-(--c-t-1b1b1b)">
        {label}
      </label>
      <input id={id} className={inputCls} {...props} />
      {hint && <span className="text-[12px] text-(--c-t-737373)">{hint}</span>}
    </div>
  );
}

function AuthScreen() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    form.set("flow", mode);
    try {
      await signIn("password", form);
    } catch (err) {
      const msg = err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : "";
      if (/team password/i.test(msg)) setError("That team code isn't right. Ask a teammate for it.");
      else if (mode === "signIn") setError("That email and password don't match.");
      else if (/already exists/i.test(msg)) setError("There's already an account with that email. Sign in instead.");
      else if (/password/i.test(msg)) setError("Use a password with at least 8 characters.");
      else setError("That didn't work. Check the team code and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen justify-center bg-(--c-b-ffffff) px-4 pt-[12vh]">
      <div className="flex w-[360px] flex-col gap-7">
        <div className="flex items-center gap-2 text-(--c-t-1b1b1b)">
          <IconScript size={20} />
          <span className="text-[16px] font-semibold">Native Note</span>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.01em] text-(--c-t-1b1b1b)">
            {mode === "signIn" ? "Welcome back" : "Join your team"}
          </h1>
          <p className="m-0 text-[15px] leading-[1.5] text-(--c-t-6b6b6b)">
            {mode === "signIn"
              ? "Sign in to see your team’s scripts."
              : "Everyone who signs up works in the same team and sees the same scripts."}
          </p>
        </div>
        <form key={mode} onSubmit={submit} className="flex flex-col gap-4">
          {mode === "signUp" && <Field id="name" name="name" label="Name" placeholder="Your name" autoComplete="name" required />}
          <Field id="email" name="email" type="email" label="Email" placeholder="you@example.com" autoComplete="email" required />
          <Field
            id="password"
            name="password"
            type="password"
            label="Password"
            placeholder={mode === "signUp" ? "At least 8 characters" : "Your password"}
            autoComplete={mode === "signUp" ? "new-password" : "current-password"}
            minLength={mode === "signUp" ? 8 : undefined}
            required
          />
          {mode === "signUp" && (
            <Field id="teamCode" name="teamCode" type="password" label="Team code" placeholder="Enter the code" hint="Ask a teammate for the code." required />
          )}
          {error && <div className="text-[13px] text-(--c-t-b42318)">{error}</div>}
          <button
            disabled={busy}
            className="mt-1 inline-flex h-11 items-center justify-center rounded-lg bg-(--c-b-1b1b1b) px-4 text-[14px] font-medium text-(--c-on-ink) hover:bg-(--c-b-333333) disabled:opacity-50"
          >
            {mode === "signIn" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="m-0 text-[14px] text-(--c-t-6b6b6b)">
          {mode === "signIn" ? "New here? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signIn" ? "signUp" : "signIn");
              setError(null);
            }}
            className="font-medium text-(--c-t-2358d8) hover:text-(--c-t-163b99)"
          >
            {mode === "signIn" ? "Create account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
