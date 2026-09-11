"use client";
import { useEffect, useState } from "react";

export function AgendaResourceSelect({ companyId, value, onChange }: { companyId: string; value: string | null | undefined; onChange: (value: string) => void }) {
  const [resources, setResources] = useState<Array<{ id: string; name: string }>>([]);
  const [message, setMessage] = useState("Carregando agendas…");
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard/agenda?companyId=${encodeURIComponent(companyId)}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => {
        if (controller.signal.aborted) return;
        setLoadedCompanyId(companyId);
        setResources((data.resources ?? []).filter((resource: { enabled: boolean; kind: string }) => resource.enabled && resource.kind === "service"));
        setMessage(data.settings?.enabled ? "" : "Ative e configure os horários em Agenda para permitir reservas online.");
      }).catch(() => { if (!controller.signal.aborted) { setLoadedCompanyId(companyId); setResources([]); setMessage("Não foi possível carregar as agendas. Tente novamente."); } });
    return () => controller.abort();
  }, [companyId]);
  return <label className="mt-3 block text-sm">
    <span className="mb-2 block font-medium">Agenda deste item</span>
    <select value={value ?? ""} onChange={event => onChange(event.target.value)} className="h-11 w-full rounded-lg border bg-transparent px-3">
      <option value="">Solicitar atendimento, sem reserva automática</option>
      {(loadedCompanyId === companyId ? resources : []).map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
    </select>
    <span className="mt-2 block text-xs opacity-75">{loadedCompanyId !== companyId ? "Carregando agendas…" : message || "O cliente escolhe um horário disponível nesta agenda. Sem agenda vinculada, poderá solicitar atendimento."}</span>
  </label>;
}
