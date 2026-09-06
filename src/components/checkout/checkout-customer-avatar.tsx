"use client";

import Image from "next/image";
import { UserRound } from "lucide-react";
import { useState } from "react";

export function CheckoutCustomerAvatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials = name?.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const label = name ? `Foto de ${name}` : "Seu perfil";

  return <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600" role="img" aria-label={label} title={name ? `Pedido de ${name}` : "Seu pedido"}>
    {avatarUrl && failedUrl !== avatarUrl ? <Image src={avatarUrl} alt="" fill sizes="40px" className="object-cover" unoptimized onError={() => setFailedUrl(avatarUrl)} /> : initials ? <span aria-hidden="true">{initials}</span> : <UserRound className="h-5 w-5" aria-hidden="true" />}
  </span>;
}
