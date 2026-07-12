"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ExternalLink, Loader2, PlugZap, Search, ShieldCheck, WalletCards } from "lucide-react";
import { clearAdminImpersonationReturn, saveAdminImpersonationReturn } from "@/lib/admin-impersonation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type AdminIntegrationClientTarget = {
  companyId: string;
  companyName: string;
  planCode: string | null;
  status: string | null;
  ownerUserId: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  mercadoPagoStatus: string | null;
  mercadoPagoLabel: string | null;
  mercadoPagoError: string | null;
  webhookCount: number;
  eventCount: number;
};

type Notice = {
  tone: "success" | "error";
  message: string;
};

export function AdminIntegrationsClientActions({ targets }: { targets: AdminIntegrationClientTarget[] }) {
  const [search, setSearch] = useState("");
  const [accessingUserId, setAccessingUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const filteredTargets = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return targets;

    return targets.filter((target) => (
      target.companyName.toLowerCase().includes(query)
      || target.ownerEmail?.toLowerCase().includes(query)
      || target.ownerName?.toLowerCase().includes(query)
    ));
  }, [search, targets]);

  async function getAccessLink(userId: string): Promise<string> {
    const response = await fetch("/api/admin/users/access-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, next: "/dashboard/integracoes" }),
    });
    const data = (await response.json().catch(() => null)) as { actionLink?: string; error?: string } | null;

    if (!response.ok || !data?.actionLink) {
      throw new Error(data?.error ?? "Nao foi possivel gerar acesso ao painel do cliente.");
    }

    return data.actionLink;
  }

  async function accessClientIntegrations(target: AdminIntegrationClientTarget) {
    if (!target.ownerUserId) {
      setNotice({ tone: "error", message: "Este cliente ainda nao tem usuario dono para acesso assistido." });
      return;
    }

    setAccessingUserId(target.ownerUserId);
    setNotice(null);

    try {
      const link = await getAccessLink(target.ownerUserId);
      const supabase = createClient();
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session?.access_token || !session.refresh_token) {
        throw new Error("Nao foi possivel guardar sua sessao admin antes de acessar o cliente.");
      }

      saveAdminImpersonationReturn({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        returnPath: `${window.location.pathname}${window.location.search}`,
        adminEmail: session.user.email ?? null,
        adminName: readUserDisplayName(session.user.user_metadata),
        targetEmail: target.ownerEmail,
        targetName: target.ownerName ?? target.companyName,
        startedAt: new Date().toISOString(),
      });

      window.location.assign(link);
    } catch (error) {
      clearAdminImpersonationReturn();
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao abrir integracoes do cliente." });
    } finally {
      setAccessingUserId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            className="h-10 w-full rounded-xl pl-9 pr-3 text-[13px] outline-none"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente..."
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
            value={search}
          />
        </div>
        <span className="rounded-xl px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-cyan-100" style={{ background: "rgba(34,211,238,0.10)", border: "1px solid rgba(34,211,238,0.22)" }}>
          {filteredTargets.length} cliente(s)
        </span>
      </div>

      {notice ? (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-[12px]",
            notice.tone === "success" && "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
            notice.tone === "error" && "border-rose-400/25 bg-rose-400/10 text-rose-200",
          )}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="grid gap-2">
        {filteredTargets.length > 0 ? filteredTargets.map((target) => {
          const isAccessing = accessingUserId === target.ownerUserId;

          return (
            <div
              className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[minmax(0,1fr)_auto]"
              key={target.companyId}
              style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[13px] font-semibold text-slate-100">{target.companyName}</p>
                  {target.planCode ? <MiniBadge label={target.planCode} /> : null}
                  {target.status ? <MiniBadge label={target.status} /> : null}
                </div>
                <p className="mt-1 truncate font-mono text-[10px] text-slate-500">{target.ownerEmail ?? "usuario ainda nao vinculado"}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <StatusPill
                    icon={WalletCards}
                    label={target.mercadoPagoStatus === "connected" ? "Mercado Pago conectado" : "Mercado Pago pendente"}
                    tone={target.mercadoPagoStatus === "connected" ? "green" : target.mercadoPagoStatus === "error" ? "rose" : "amber"}
                  />
                  <StatusPill
                    icon={PlugZap}
                    label={`${target.webhookCount} webhook(s)`}
                    tone={target.webhookCount > 0 ? "cyan" : "zinc"}
                  />
                  <StatusPill
                    icon={ShieldCheck}
                    label={`${target.eventCount} evento(s)`}
                    tone={target.eventCount > 0 ? "green" : "zinc"}
                  />
                </div>
                {target.mercadoPagoError ? (
                  <p className="mt-2 text-[11px] leading-4 text-rose-200">{target.mercadoPagoError}</p>
                ) : null}
              </div>

              <button
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!target.ownerUserId || isAccessing}
                onClick={() => void accessClientIntegrations(target)}
                type="button"
              >
                {isAccessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                Acessar integracoes
              </button>
            </div>
          );
        }) : (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center text-[13px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
            Nenhum cliente encontrado.
          </div>
        )}
      </div>
    </div>
  );
}

function MiniBadge({ label }: { label: string }) {
  return (
    <span className="rounded-lg border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
      {label}
    </span>
  );
}

function StatusPill({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: "green" | "cyan" | "amber" | "rose" | "zinc";
}) {
  const styles = {
    amber: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    cyan: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
    green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    rose: "border-rose-400/25 bg-rose-400/10 text-rose-200",
    zinc: "border-slate-500/25 bg-slate-500/10 text-slate-400",
  }[tone];

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[9px] uppercase tracking-wide", styles)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function readUserDisplayName(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return null;

  const fullName = metadata.full_name;
  const companyName = metadata.company_name;
  const name = metadata.name;

  if (typeof fullName === "string" && fullName.trim()) return fullName;
  if (typeof companyName === "string" && companyName.trim()) return companyName;
  if (typeof name === "string" && name.trim()) return name;

  return null;
}
