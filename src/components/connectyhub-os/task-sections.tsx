"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CalendarDays, CircleDollarSign, Clock3, Gift, MessageCircle, MessagesSquare, ShoppingBag, Zap } from "lucide-react";
import { panelAreaStyle, type PanelArea } from "@/lib/ui/panel-theme";

const objectives: Record<string, { area: PanelArea; icon: typeof Zap }> = {
  relacionamento: { area: "service", icon: MessageCircle },
  "redes-sociais": { area: "service", icon: MessagesSquare },
  whatsapp: { area: "service", icon: MessagesSquare },
  pedidos: { area: "business", icon: ShoppingBag },
  agenda: { area: "overview", icon: CalendarDays },
  ofertas: { area: "business", icon: Gift },
  fluxos: { area: "automation", icon: Zap },
  financeiro: { area: "business", icon: CircleDollarSign },
  historico: { area: "system", icon: Clock3 },
};

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => { window.removeEventListener("hashchange", listener); window.removeEventListener("popstate", listener); };
}
export function selectTaskSection(id: string) {
  const url = new URL(window.location.href);
  url.hash = id;
  window.history.pushState(null, "", url);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/** All editors stay mounted: switching objectives never discards an unsaved draft. */
export function TaskSections({ label, sections }: {
  label: string;
  sections: { id: string; title: string; description: string; content: ReactNode }[];
}) {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash.slice(1), () => "");
  const active = sections.some(section => section.id === hash) ? hash : sections[0]?.id;
  return <div className="space-y-4">
    <nav aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {sections.map(section => { const objective = objectives[section.id] ?? { area: "automation" as const, icon: Zap }; const Icon = objective.icon; return <button key={section.id} type="button" aria-current={active === section.id ? "true" : undefined}
        aria-controls={`task-${section.id}`} onClick={() => selectTaskSection(section.id)}
        style={panelAreaStyle(objective.area)}
        className={cn("ch-task-choice min-h-14 rounded-xl border p-2.5 text-left transition sm:min-h-20 sm:p-3", active === section.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50")}>
        <span className="flex items-center gap-2"><span className="ch-area-icon"><Icon size={16} aria-hidden="true" /></span><span className="text-sm font-semibold text-slate-800">{section.title}</span></span>
        <span className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">{section.description}</span>
      </button>; })}
    </nav>
    {sections.map(section => <section key={section.id} id={`task-${section.id}`} aria-label={section.title} hidden={active !== section.id} className="space-y-4">{section.content}</section>)}
  </div>;
}
