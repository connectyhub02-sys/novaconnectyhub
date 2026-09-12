"use client";

import { useState } from "react";
import type { ClientCompany } from "@/lib/client-os/companies";
import type { ClientSalesCatalogSettings, ClientSalesCatalogWhatsappInstance } from "@/lib/sales-catalog/shared";
import type { ClientAutomationAgent } from "./client-whatsapp-automation-studio";
import { CustomerAgendaPanel } from "./customer-agenda-panel";
import { PageHeader } from "./panel-primitives";

export function ClientAgendaCenter({ companies, agents, initialSettings, whatsappInstances, initialCompanyId }: {
  companies: ClientCompany[];
  agents: ClientAutomationAgent[];
  initialSettings: ClientSalesCatalogSettings[];
  whatsappInstances: ClientSalesCatalogWhatsappInstance[];
  initialCompanyId: string | null;
}) {
  const [companyId, setCompanyId] = useState(initialCompanyId ?? companies[0]?.id ?? "");
  const company = companies.find((item) => item.id === companyId);
  const settings = initialSettings.find((item) => item.companyId === companyId);
  const instance = whatsappInstances.find((item) => item.companyId === companyId && item.id === settings?.automationSettings.defaultWhatsappInstanceId);
  const agent = agents.find((item) => item.id === instance?.agentId);

  return <div className="space-y-4 p-4 sm:p-6">
    <PageHeader eyebrow="Workspace / agenda" title="Agenda inteligente"
      description={companies.length ? "Seus compromissos, horários e atendimentos em um só calendário." : "Cadastre sua empresa antes de configurar a agenda."}
      actions={company ? companies.length > 1 ? <select aria-label="Empresa da agenda" value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="h-10 max-w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
        {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select> : <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">{company.name}</span> : undefined}
    />
    {company && <CustomerAgendaPanel key={companyId} companyId={companyId} agentId={agent?.id} />}
  </div>;
}
