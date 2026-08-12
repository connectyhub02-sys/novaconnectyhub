import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BarChart3, Bot, Clock3, MessageCircle, PlugZap } from "lucide-react";
import {
  metaFeatureComingSoonDetail,
  metaFeatureComingSoonMessage,
  metaFeatureComingSoonTitle,
} from "@/lib/meta/launch-status";
import { NeonBadge, Panel } from "./panel-primitives";

export function MetaComingSoonPanel({
  featureName = "Meta",
}: {
  featureName?: string;
}) {
  return (
    <Panel
      eyebrow="Meta / em breve"
      title={featureName}
      tone="cyan"
      action={<NeonBadge tone="amber">em breve</NeonBadge>}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
              <Clock3 className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[18px] font-semibold leading-6 text-white">
                {metaFeatureComingSoonTitle}
              </p>
              <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-400">
                {metaFeatureComingSoonMessage}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 md:grid-cols-2">
            <ComingSoonItem icon={MessageCircle} label="Atendimento" value="Instagram Direct, Messenger e comentarios" />
            <ComingSoonItem icon={BarChart3} label="Dashboards" value="Meta Ads, Facebook e Instagram" />
            <ComingSoonItem icon={PlugZap} label="Integracao" value="Login oficial Meta e selecao de ativos" />
            <ComingSoonItem icon={Bot} label="Agentes" value="Mesmo agente atendendo novos canais" />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">lancamento atual</p>
          <p className="mt-2 text-[14px] font-semibold text-white">WhatsApp liberado</p>
          <p className="mt-2 text-[12px] leading-5 text-slate-400">
            {metaFeatureComingSoonDetail}
          </p>
          <Link
            href="/dashboard/whatsapp"
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-300/15"
          >
            <MessageCircle className="h-4 w-4" />
            Abrir WhatsApp
          </Link>
        </div>
      </div>
    </Panel>
  );
}

function ComingSoonItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-300/10 text-cyan-200">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-1 text-[12px] font-semibold leading-5 text-slate-200">{value}</p>
        </div>
      </div>
    </div>
  );
}
