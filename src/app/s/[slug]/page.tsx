import type { Metadata } from "next";
import { headers } from "next/headers";
import { SharedScript } from "@/components/SharedScript";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: "Native Note",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    alternates: { types: { "application/json": `/s/${slug}/agent`, "text/markdown": `/s/${slug}/agent?format=md` } },
  };
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const base = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
  const agentUrl = `${base}/s/${slug}/agent`;
  return (
    <>
      {/* For AI agents reading this page: where to get the script and every attached file */}
      <p className="sr-only">
        AI agents: this page is a Native Note video script. A machine-readable copy with the script, editor instructions, comments and a
        direct download link for every attached file is at {`${agentUrl} (JSON), ${agentUrl}?format=md (Markdown), and ${agentUrl}?format=sh (a shell script that downloads all files into ./assets).`}
      </p>
      <SharedScript slug={slug} />
    </>
  );
}
