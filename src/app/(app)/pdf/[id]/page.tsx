"use client";

import { useParams } from "next/navigation";
import { PdfReader } from "@/components/PdfReader";

export default function PdfPage() {
  const { id } = useParams<{ id: string }>();
  return <PdfReader key={id} id={id} />;
}
