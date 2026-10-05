"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { frameIdFrom } from "@/lib/boardSource";
import { BoardEditor } from "@/components/BoardEditor";

export default function BoardPage() {
  const { id } = useParams<{ id: string }>();
  // A frame link (/b/<id>#frame=<frame>) opens the board zoomed to that frame
  const [frame, setFrame] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setFrame(frameIdFrom(window.location.hash || window.location.search));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return <BoardEditor key={id} id={id} focus={frame} />;
}
