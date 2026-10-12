"use client";

import { useParams } from "next/navigation";
import { ScratchboardEditor } from "@/components/Scratchboard";

export default function ScratchboardPage() {
  const { id } = useParams<{ id: string }>();
  return <ScratchboardEditor key={id} id={id} />;
}
