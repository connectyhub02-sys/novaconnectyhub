"use client";

import { useState } from "react";
import { Bot, Megaphone, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientLeadCrmWorkspace } from "@/lib/client-os/leads-crm";
import { AdminWhatsappAgentsConsole } from "./admin-whatsapp-agents-console";
import { AdminWhatsappCampaignsConsole, type AdminWhatsappCampaignsWorkspace } from "./admin-whatsapp-campaigns-console";
import { LeadCrmConsole } from "./leads-crm-console";

type AdminWhatsappAtendimentoView = "attendance" | "agents" | "automations";

const adminWhatsappAtendimentoTabs: Array<{
  icon: typeof MessageCircle;
  label: string;
  value: AdminWhatsappAtendimentoView;
}> = [
  { icon: MessageCircle, label: "Atendimento manual", value: "attendance" },
  { icon: Bot, label: "Agentes internos", value: "agents" },
  { icon: Megaphone, label: "Grupos e campanhas", value: "automations" },
];

export function AdminWhatsappAtendimentoConsole({
  campaignWorkspace,
  leadWorkspace,
}: {
  campaignWorkspace: AdminWhatsappCampaignsWorkspace;
  leadWorkspace: ClientLeadCrmWorkspace;
}) {
  const [activeView, setActiveView] = useState<AdminWhatsappAtendimentoView>("attendance");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-2xl border border-blue-100 bg-white/90 p-2 shadow-[0_16px_40px_rgba(15,23,42,0.05)] sm:inline-flex sm:flex-row">
        {adminWhatsappAtendimentoTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeView === tab.value;

          return (
            <button
              key={tab.value}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-bold transition",
                active
                  ? "bg-blue-600 text-white shadow-[0_12px_24px_rgba(24,119,242,0.22)]"
                  : "text-slate-600 hover:bg-blue-50 hover:text-blue-700",
              )}
              onClick={() => setActiveView(tab.value)}
              type="button"
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeView === "attendance" ? (
        <LeadCrmConsole
          attendanceNotificationHref="/admin/whatsapp/atendimento"
          commerceEnabled={false}
          conversationPanelScope="platform_internal"
          mode="atendimento"
          workspace={leadWorkspace}
        />
      ) : activeView === "automations" ? (
        <AdminWhatsappCampaignsConsole workspace={campaignWorkspace} />
      ) : (
        <AdminWhatsappAgentsConsole />
      )}
    </div>
  );
}
