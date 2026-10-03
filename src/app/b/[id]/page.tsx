"use client";

import { useParams } from "next/navigation";
import { TeamGate } from "@/components/TeamGate";
import { BoardEditor } from "@/components/BoardEditor";

export default function BoardPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <TeamGate>
      <BoardEditor key={id} id={id} />
    </TeamGate>
  );
}
