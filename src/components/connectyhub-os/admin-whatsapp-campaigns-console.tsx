"use client";

import { useMemo, useState } from "react";
import { Bot, PackageCheck, Users } from "lucide-react";
import { ClientWhatsappAutomationStudio, type ClientAutomationAgent } from "./client-whatsapp-automation-studio";
import { NeonBadge } from "./panel-primitives";
import type { ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";

export type AdminWhatsappCampaignSector = {
  id: string;
  name: string;
  description: string | null;
  status: string;
};

export type AdminWhatsappCampaignsWorkspace = {
  sectors: AdminWhatsappCampaignSector[];
  agents: ClientAutomationAgent[];
  products: ClientSalesCatalogItem[];
};

export function AdminWhatsappCampaignsConsole({
  workspace,
}: {
  workspace: AdminWhatsappCampaignsWorkspace;
}) {
  const [selectedAgentId, setSelectedAgentId] = useState(workspace.agents[0]?.id ?? "");
  const selectedAgent = workspace.agents.find((agent) => agent.id === selectedAgentId) ?? workspace.agents[0] ?? null;
  const selectedSector = workspace.sectors.find((sector) => sector.id === selectedAgent?.companyId) ?? null;
  const scopedProducts = useMemo(
    () => workspace.products.map((product) => ({
      ...product,
      companyId: selectedSector?.id ?? product.companyId,
    })),
    [selectedSector?.id, workspace.products],
  );

  if (!workspace.agents.length || !workspace.sectors.length) {
    return (
      <div className="rounded-2xl border border-blue-100 bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
        <div className="grid min-h-[220px] place-items-center text-center">
          <div className="max-w-md">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700">
              <Bot className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-[16px] font-semibold" style={{ color: "var(--ch-text)" }}>Crie um agente interno</h2>
            <p className="mt-2 text-[13px] leading-6 text-slate-500">
              Grupos, canais, status e campanhas do WhatsApp interno usam os agentes e setores cadastrados em Agentes internos.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-white/90 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.05)] sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
          <label className="block">
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-500">Agente executor</span>
            <select
              value={selectedAgent?.id ?? ""}
              onChange={(event) => setSelectedAgentId(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              {workspace.agents.map((agent) => {
                const sector = workspace.sectors.find((item) => item.id === agent.companyId);

                return (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} / {agent.roleTitle}{sector ? ` - ${sector.name}` : ""}
                  </option>
                );
              })}
            </select>
          </label>

          <SummaryTile
            icon={Users}
            label="Setor"
            value={selectedSector?.name ?? "Nao vinculado"}
          />
          <SummaryTile
            icon={PackageCheck}
            label="Produtos CH"
            value={`${workspace.products.length} ativo(s)`}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
          <NeonBadge tone={selectedAgent?.status === "active" ? "green" : "amber"}>
            {selectedAgent?.status === "active" ? "agente ativo" : selectedAgent?.status ?? "pendente"}
          </NeonBadge>
          <span>
            A aba usa os mesmos recursos do painel do cliente, conectada ao endpoint interno da ConnectyHub.
          </span>
        </div>
      </div>

      {selectedAgent && selectedSector ? (
        <ClientWhatsappAutomationStudio
          agents={workspace.agents}
          channelEndpoint="/api/admin/whatsapp/internal/channels"
          companyId={selectedSector.id}
          companyName="ConnectyHub"
          entityIdKey="sectorId"
          products={scopedProducts}
          selectedAutomationAgentId={selectedAgent.id}
          selectedAutomationWhatsappLabel={`${selectedAgent.name} / ${selectedAgent.roleTitle}`}
        />
      ) : null}
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-emerald-600" />
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
      </div>
      <p className="mt-1 max-w-[220px] truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
