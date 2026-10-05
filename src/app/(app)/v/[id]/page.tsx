"use client";

import { useParams } from "next/navigation";
import { VideoEditor } from "@/components/VideoEditor";

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  return <VideoEditor key={id} id={id} />;
}
