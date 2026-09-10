"use client";

import { useId, useState } from "react";
import { agentPromptTemplates, type AgentPromptTemplateId } from "@/lib/whatsapp/agent-prompt-templates";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function ActivitySelect({ value, onChange }: { value: AgentPromptTemplateId; onChange: (value: AgentPromptTemplateId) => void }) {
  const [search, setSearch] = useState("");
  const id = useId();
  const matches = agentPromptTemplates.filter((item) => normalize(`${item.label} ${item.sectorName}`).includes(normalize(search)));
  const selected = agentPromptTemplates.find((item) => item.id === value)!;
  return (
    <div className="grid gap-2">
      <input aria-label="Buscar profissão ou empresa" className="h-10 w-full rounded-lg border px-3 text-[13px]" placeholder="Buscar: corretor, advogado, pizzaria…" value={search} onChange={(event) => setSearch(event.target.value)} />
      <select id={id} aria-label="Atividade e forma de atuação" className="h-11 w-full rounded-lg border px-3 text-[13px]" value={value} onChange={(event) => onChange(event.target.value as AgentPromptTemplateId)}>
        {!matches.some((item) => item.id === value) ? <option value={value}>{selected.label} (seleção atual)</option> : null}
        {matches.length === 0 && value !== "generic_sales" ? <option value="generic_sales">Outra atividade / atendimento geral</option> : null}
        {([ ["professional", "Profissionais"], ["company", "Empresas"], ["general", "Outras atividades"] ] as const).map(([kind, label]) => (
          <optgroup key={kind} label={label}>{matches.filter((item) => item.kind === kind).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>
        ))}
      </select>
      {matches.length === 0 ? <p className="text-xs text-slate-500">Nenhum resultado. Tente outra palavra ou escolha “Outra atividade”.</p> : null}
    </div>
  );
}
