"use client";

import Link from "next/link";
import { Printer } from "lucide-react";

export function AccountInvoiceActions() {
  return (
    <div className="flex flex-wrap gap-3 print:hidden">
      <button
        className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
        type="button"
        onClick={() => window.print()}
      >
        <Printer className="mr-2 h-4 w-4" />
        Imprimir
      </button>
      <Link
        className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-bold text-slate-100 transition hover:bg-white/[0.09]"
        href="/dashboard/minha-conta"
      >
        Voltar
      </Link>
    </div>
  );
}
