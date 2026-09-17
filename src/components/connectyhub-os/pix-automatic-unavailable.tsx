"use client";

import { useId } from "react";
import { QrCode } from "lucide-react";
import { pixAutomaticAvailability, type PixAutomaticContext } from "@/lib/billing/pix-automatic-availability";

export function PixAutomaticUnavailable({ context }: { context: PixAutomaticContext }) {
  const id = useId();
  const availability = pixAutomaticAvailability(context);
  return <div className="rounded-lg border border-slate-300 bg-slate-50 p-3 text-slate-700">
    <button type="button" disabled aria-describedby={id} className="flex min-h-11 w-full items-center gap-2 text-left text-sm font-semibold disabled:cursor-not-allowed">
      <QrCode className="h-4 w-4 shrink-0" />Pix Automático<span className="ml-auto rounded bg-slate-200 px-2 py-1 text-xs">Indisponível</span>
    </button>
    <p className="mt-1 text-xs leading-5">Autorização no app do banco para pagamentos recorrentes. É diferente do Pix comum por QR Code.</p>
    <p id={id} className="mt-2 text-xs leading-5">{availability.reason}</p>
  </div>;
}
