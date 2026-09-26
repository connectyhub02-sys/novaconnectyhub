"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

const sizes = {
  xs: ["h-5 w-5", "text-[9px]", "20px"],
  sm: ["h-8 w-8", "text-[11px]", "32px"],
  md: ["h-10 w-10", "text-[13px]", "40px"],
  lg: ["h-12 w-12", "text-[14px]", "48px"],
} as const;

/** The agent's photo from its WhatsApp (or the uploaded one), with initials when there is none or it fails to load. */
export function AgentPhoto({ src, name, size = "md", className }: { src?: string | null; name: string; size?: keyof typeof sizes; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [box, font, pixels] = sizes[size];
  if (src && failed !== src) {
    return (
      <span className={cn("relative block shrink-0 overflow-hidden rounded-full border border-[#25D366]/55 bg-[#effff4]", box, className)}>
        <Image alt={`Foto do agente ${name}`} className="object-cover" fill sizes={pixels} src={src} unoptimized referrerPolicy="no-referrer" onError={() => setFailed(src)} />
      </span>
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full border border-[#25D366] bg-[#25D366] font-mono font-bold text-[#075E54]", box, font, className)}>
      {initials(name)}
    </span>
  );
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map(part => part[0]!.toUpperCase()).join("") : "IA";
}
