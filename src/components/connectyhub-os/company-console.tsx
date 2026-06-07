"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { NeonBadge, Panel, SectionHeader } from "./panel-primitives";
import { cn } from "@/lib/utils";

type ClientCompany = {
  id: string;
  name: string;
  slug: string | null;
  planCode: string;
  status: string;
  role: string;
  createdAt: string | null;
};

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

export function CompanyConsole() {
  const [companies, setCompanies] = useState<ClientCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCompanies() {
      setLoading(true);

      try {
        const nextCompanies = await fetchCompanies();

        if (!cancelled) {
          setCompanies(nextCompanies);
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel carregar as empresas." });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCompanies();

    return () => {
      cancelled = true;
    };
  }, []);

  async function createCompany() {
    setCreating(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json().catch(() => null)) as { company?: ClientCompany; error?: string } | null;

      if (!response.ok || !data?.company) {
        throw new Error(data?.error ?? "Nao foi possivel cadastrar a empresa.");
      }

      const company = data.company;

      setName("");
      setShowForm(false);
      setCompanies((current) => [company, ...current.filter((item) => item.id !== company.id)]);
      setNotice({ tone: "success", message: "Empresa cadastrada." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao cadastrar empresa." });
    } finally {
      setCreating(false);
    }
  }

  async function deleteCompany(company: ClientCompany) {
    if (confirmDeleteId !== company.id) {
      setConfirmDeleteId(company.id);
      return;
    }

    setDeletingId(company.id);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/companies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
      });
      const data = (await response.json().catch(() => null)) as { deletedCompanyId?: string; error?: string } | null;

      if (!response.ok || data?.deletedCompanyId !== company.id) {
        throw new Error(data?.error ?? "Nao foi possivel excluir a empresa.");
      }

      setCompanies((current) => current.filter((item) => item.id !== company.id));
      setConfirmDeleteId(null);
      setNotice({ tone: "success", message: "Empresa excluida." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao excluir empresa." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <SectionHeader
        eyebrow="Workspace / Empresas"
        title="Minha Empresa"
        description="Cadastre uma empresa para liberar WhatsApp e agentes."
      />

      {notice && <NoticeBar notice={notice} />}

      {loading ? (
        <Panel title="Empresas" eyebrow="carregando">
          <div className="grid min-h-[220px] place-items-center text-cyan-300">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        </Panel>
      ) : null}

      {!loading && !showForm && companies.length === 0 ? (
        <div className="grid min-h-[320px] place-items-center">
          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-5 font-mono text-[11px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200"
            type="button"
            onClick={() => setShowForm(true)}
          >
            <Plus className="h-4 w-4" />
            Nova empresa
          </button>
        </div>
      ) : null}

      {!loading && !showForm && companies.length > 0 ? (
        <Panel
          title="Empresas cadastradas"
          eyebrow="workspace"
          action={
            <button
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200"
              type="button"
              onClick={() => setShowForm(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Nova empresa
            </button>
          }
        >
          <div className="grid gap-2">
            {companies.map((company) => (
              <div
                key={company.id}
                className="flex min-h-16 items-center gap-3 rounded-xl border px-4"
                style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
                    {company.name}
                  </p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-slate-500">
                    Empresa cadastrada
                  </p>
                </div>
                <button
                  className={cn(
                    "inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50",
                    confirmDeleteId === company.id
                      ? "border-rose-400/40 bg-rose-400/15 text-rose-200"
                      : "border-rose-400/25 bg-rose-400/10 text-rose-200 hover:bg-rose-400/15",
                  )}
                  disabled={deletingId === company.id}
                  type="button"
                  onClick={() => deleteCompany(company)}
                >
                  {deletingId === company.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {confirmDeleteId === company.id ? "Confirmar" : "Excluir"}
                </button>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {showForm ? (
        <Panel
          title="Nova empresa"
          eyebrow="cadastro"
          action={creating ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> : <NeonBadge tone="cyan">novo</NeonBadge>}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome da empresa</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex: ConnectyHub Comercial"
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-4 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-200"
                type="button"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </button>
              <button
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={creating}
                type="button"
                onClick={createCompany}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar empresa
              </button>
            </div>
          </div>
        </Panel>
      ) : null}
    </>
  );
}

async function fetchCompanies() {
  const response = await fetch("/api/dashboard/companies", { cache: "no-store" });
  const data = (await response.json().catch(() => null)) as { companies?: ClientCompany[]; error?: string } | null;

  if (!response.ok || !data) {
    throw new Error(data?.error ?? "Nao foi possivel carregar as empresas.");
  }

  return data.companies ?? [];
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
