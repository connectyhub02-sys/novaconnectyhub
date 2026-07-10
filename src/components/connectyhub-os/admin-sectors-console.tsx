"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { KpiStat, NeonBadge, PageHeader, Panel, StatusBadge } from "./panel-primitives";
import { cn } from "@/lib/utils";

type PlatformWhatsappSector = {
  id: string;
  sectorCode: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string | null;
};

type PlatformWhatsappAgent = {
  id: string;
  sectorId: string | null;
  sectorCode: string;
  sectorName: string;
  status: string;
};

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

export function AdminSectorsConsole() {
  const [sectors, setSectors] = useState<PlatformWhatsappSector[]>([]);
  const [agents, setAgents] = useState<PlatformWhatsappAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      setLoading(true);

      try {
        const response = await fetch("/api/admin/whatsapp/agents", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as {
          sectors?: PlatformWhatsappSector[];
          agents?: PlatformWhatsappAgent[];
          error?: string;
        } | null;

        if (!response.ok || !data) {
          throw new Error(data?.error ?? "Nao foi possivel carregar os setores.");
        }

        if (!cancelled) {
          const nextSectors = data.sectors ?? [];
          setSectors(nextSectors);
          setAgents(data.agents ?? []);
          setShowForm(nextSectors.length === 0);
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel carregar os setores." });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  const agentCountBySector = useMemo(() => {
    const counts = new Map<string, number>();

    for (const agent of agents) {
      if (agent.sectorId) {
        counts.set(agent.sectorId, (counts.get(agent.sectorId) ?? 0) + 1);
      }

      if (agent.sectorCode) {
        counts.set(agent.sectorCode, (counts.get(agent.sectorCode) ?? 0) + 1);
      }
    }

    return counts;
  }, [agents]);

  async function createSector() {
    setCreating(true);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/whatsapp/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_sector", sectorName: name, description }),
      });
      const data = (await response.json().catch(() => null)) as { sector?: PlatformWhatsappSector; error?: string } | null;

      if (!response.ok || !data?.sector) {
        throw new Error(data?.error ?? "Nao foi possivel cadastrar o setor.");
      }

      setSectors((current) => [data.sector!, ...current.filter((sector) => sector.id !== data.sector!.id)]);
      setName("");
      setDescription("");
      setShowForm(false);
      setConfirmDeleteId(null);
      setNotice({ tone: "success", message: "Setor cadastrado. Agora voce pode criar o agente WhatsApp para esse setor." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao cadastrar setor." });
    } finally {
      setCreating(false);
    }
  }

  async function deleteSector(sector: PlatformWhatsappSector, agentCount: number) {
    setNotice(null);

    if (agentCount > 0) {
      setNotice({ tone: "warning", message: "Exclua os agentes vinculados antes de remover este setor." });
      return;
    }

    if (confirmDeleteId !== sector.id) {
      setConfirmDeleteId(sector.id);
      return;
    }

    setDeletingId(sector.id);

    try {
      const response = await fetch("/api/admin/whatsapp/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorId: sector.id }),
      });
      const data = (await response.json().catch(() => null)) as { deletedSectorId?: string; error?: string } | null;

      if (!response.ok || !data?.deletedSectorId) {
        throw new Error(data?.error ?? "Nao foi possivel excluir o setor.");
      }

      setSectors((current) => current.filter((item) => item.id !== data.deletedSectorId));
      setAgents((current) => current.filter((agent) => agent.sectorId !== data.deletedSectorId && agent.sectorCode !== sector.sectorCode));
      setConfirmDeleteId(null);
      setNotice({ tone: "success", message: "Setor excluido. O proximo setor deve ser criado pelo admin quando for necessario." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao excluir setor." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin OS / Setores"
        title="Setores da ConnectyHub"
        description="Cadastre os setores internos que vao receber agentes WhatsApp da nossa propria operacao."
        actions={
          <div className="flex flex-wrap gap-2">
            <NeonBadge tone="cyan">{sectors.length} setores</NeonBadge>
            <NeonBadge tone="green">{agents.length} agentes vinculados</NeonBadge>
          </div>
        }
      />

      {notice && <NoticeBar notice={notice} />}

      <div className="mb-5 grid grid-cols-3 gap-1.5 sm:gap-2 md:gap-4">
        <KpiStat label="setores internos" value={String(sectors.length)} tone="cyan" />
        <KpiStat label="com agente" value={String(sectors.filter((sector) => sectorAgentCount(sector, agentCountBySector) > 0).length)} tone="green" />
        <KpiStat label="sem agente" value={String(sectors.filter((sector) => sectorAgentCount(sector, agentCountBySector) === 0).length)} tone="amber" />
      </div>

      {loading ? (
        <Panel title="Setores" eyebrow="carregando">
          <div className="grid min-h-[220px] place-items-center text-cyan-300">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        </Panel>
      ) : null}

      {!loading && !showForm && sectors.length === 0 ? (
        <div className="grid min-h-[320px] place-items-center">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-5 font-mono text-[11px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200"
          >
            <Plus className="h-4 w-4" />
            Novo setor
          </button>
        </div>
      ) : null}

      {!loading && !showForm && sectors.length > 0 ? (
        <Panel
          title="Setores cadastrados"
          eyebrow="primeiro passo"
          action={
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo setor
            </button>
          }
        >
          <div className="grid gap-3 xl:grid-cols-2">
            {sectors.map((sector) => {
              const agentCount = sectorAgentCount(sector, agentCountBySector);

              return (
                <article
                  key={sector.id}
                  className="flex min-h-28 items-start gap-3 rounded-xl border p-4"
                  style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-semibold" style={{ color: "var(--ch-text)" }}>
                        {sector.name}
                      </h2>
                      <StatusBadge status={sector.status === "active" ? "online" : "idle"} label={sector.status} />
                    </div>
                    <p className="mt-2 text-[12px] leading-5 text-slate-500">
                      {sector.description ?? "Sem contexto cadastrado para este setor."}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <NeonBadge tone={agentCount > 0 ? "green" : "amber"}>
                        {agentCount} {agentCount === 1 ? "agente" : "agentes"}
                      </NeonBadge>
                      <Link
                        href="/admin/whatsapp/atendimento"
                        className="inline-flex min-h-8 items-center justify-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-200"
                      >
                        Criar agente
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        disabled={deletingId === sector.id}
                        onClick={() => deleteSector(sector, agentCount)}
                        title={agentCount > 0 ? "Exclua os agentes vinculados antes de remover este setor." : "Excluir setor"}
                        className={cn(
                          "inline-flex min-h-8 items-center justify-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-60",
                          confirmDeleteId === sector.id
                            ? "border-rose-400/45 bg-rose-400/15 text-rose-100"
                            : "border-rose-400/25 bg-rose-400/10 text-rose-200 hover:bg-rose-400/15",
                        )}
                      >
                        {deletingId === sector.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        {confirmDeleteId === sector.id ? "Confirmar" : "Excluir"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Panel>
      ) : null}

      {showForm ? (
        <Panel
          title="Novo setor"
          eyebrow="cadastro"
          action={creating ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> : <NeonBadge tone="cyan">novo</NeonBadge>}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome do setor</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex: Vendas"
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Contexto do setor</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="O que este setor atende dentro da ConnectyHub."
                className="min-h-28 w-full resize-y rounded-lg border px-3 py-2 text-[13px] outline-none"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-4 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={createSector}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar setor
            </button>
          </div>
        </Panel>
      ) : null}
    </>
  );
}

function sectorAgentCount(sector: PlatformWhatsappSector, counts: Map<string, number>) {
  return counts.get(sector.id) ?? counts.get(sector.sectorCode) ?? 0;
}

function NoticeBar({ notice }: { notice: Notice }) {
  const colors = {
    success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    warning: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    error: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  } satisfies Record<Notice["tone"], string>;

  return (
    <div className={cn("mb-5 rounded-xl border px-4 py-3 text-[13px] leading-5", colors[notice.tone])}>
      {notice.message}
    </div>
  );
}
