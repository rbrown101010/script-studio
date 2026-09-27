"use client";

import { useParams } from "next/navigation";
import { TeamGate } from "@/components/TeamGate";
import { VideoEditor } from "@/components/VideoEditor";

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <TeamGate>
      <VideoEditor key={id} id={id} />
    </TeamGate>
  );
}
