"use client";
import { useEffect, useState } from "react";

export function useAgendaActivation(companyId: string) {
  const [state, setState] = useState<{ companyId: string; enabled: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch(`/api/dashboard/agenda?companyId=${encodeURIComponent(companyId)}&statusOnly=true`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!controller.signal.aborted) setState({ companyId, enabled: response.ok && data.settings?.enabled === true });
      } catch { if (!controller.signal.aborted) setState({ companyId, enabled: false }); }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.removeEventListener("focus", refresh); };
  }, [companyId]);
  return { enabled: state?.companyId === companyId && state.enabled, loading: state?.companyId !== companyId };
}

export function AgendaActivationNotice({ companyId, loading = false }: { companyId: string; loading?: boolean }) {
  return <p className="mt-2 text-sm text-amber-700">{loading ? "Verificando a ativação da agenda…" : <>Agendamento indisponível. <a className="font-semibold underline" href={`/dashboard/agenda?companyId=${encodeURIComponent(companyId)}`}>Ative a agenda da empresa</a> para habilitar esta opção. Os vínculos existentes ficam preservados.</>}</p>;
}
