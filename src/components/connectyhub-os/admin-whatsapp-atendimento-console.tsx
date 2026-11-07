"use client";

import { useState } from "react";
import { Bot, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientLeadCrmWorkspace } from "@/lib/client-os/leads-crm";
import { AdminWhatsappAgentsConsole } from "./admin-whatsapp-agents-console";
import { LeadCrmConsole } from "./leads-crm-console";

type AdminWhatsappAtendimentoView = "attendance" | "agents";

const adminWhatsappAtendimentoTabs: Array<{
  icon: typeof MessageCircle;
  label: string;
  value: AdminWhatsappAtendimentoView;
}> = [
  { icon: MessageCircle, label: "Conversas", value: "attendance" },
  { icon: Bot, label: "Agentes internos", value: "agents" },
];

export function AdminWhatsappAtendimentoConsole({
  leadWorkspace,
}: {
  leadWorkspace: ClientLeadCrmWorkspace;
}) {
  const [activeView, setActiveView] = useState<AdminWhatsappAtendimentoView>("attendance");

  return (
    <div className="ch-admin-attendance space-y-2">
      <div className="ch-admin-attendance-tabs flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
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
          liveEndpoint="/api/admin/whatsapp/attendance/live?scope=platform_internal"
          mode="atendimento"
          workspace={leadWorkspace}
        />
      ) : (
        <AdminWhatsappAgentsConsole />
      )}
    </div>
  );
}
