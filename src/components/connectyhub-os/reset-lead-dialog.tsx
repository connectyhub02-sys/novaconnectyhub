"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { DialogFrame } from "@/components/ui/dialog-frame";
import type { ConversationPanelScope } from "@/lib/whatsapp/conversation-panel-scope";

export function ResetLeadDialog({ leadId, name, panelScope, onClose, onDeleted }: {
  leadId: string; name: string; panelScope?: ConversationPanelScope;
  onClose: () => void; onDeleted: (leadIds: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  async function reset() {
    if (busy) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/dashboard/leads/reset", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, panelScope, confirmation: "RESETAR" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível resetar o lead.");
      if (!result.complete) { setNotice(result.message); return; }
      onDeleted(Array.isArray(result.leadIds) ? result.leadIds : [leadId]);
      onClose();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível resetar o lead."); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4">
    <DialogFrame onClose={() => { if (!busy) onClose(); }} aria-labelledby="reset-lead-title"
      aria-describedby="reset-lead-description" className="w-full max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
      <h2 id="reset-lead-title" className="text-xl font-bold">Resetar lead: {name}</h2>
      <p id="reset-lead-description" className="mt-4 text-sm leading-6">
        Ao continuar, todos os dados deste lead nesta empresa serão excluídos definitivamente: cadastro,
        conversas ativas e arquivadas, memória, arquivos, carrinhos, pedidos, registros de pagamento e solicitações.
      </p>
      <p className="mt-3 text-sm font-semibold leading-6">Esta ação não pode ser desfeita. O histórico não poderá ser recuperado.
        O lead só voltará a aparecer quando entrar em contato novamente com a empresa, como um novo cadastro, do zero.</p>
      {notice && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" disabled={busy} onClick={onClose} className="rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancelar</button>
        <button type="button" disabled={busy} onClick={() => void reset()} className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {busy ? "Excluindo…" : "Excluir tudo e resetar"}
        </button>
      </div>
    </DialogFrame>
  </div>;
}
