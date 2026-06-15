"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, GitBranch, Loader2, Pencil, Plus, Save, Trash2, UserPlus, X } from "lucide-react";
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

type ClientAgent = {
  id: string;
  companyId: string;
  companyName: string;
  sectorCode: string;
  sectorName: string;
  agentCode: string;
  name: string;
  personaName: string;
  roleTitle: string;
  description: string | null;
  prompt: string;
  status: string;
  autonomyLevel: number;
  updatedAt: string | null;
  createdAt: string | null;
};

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

export function CompanyConsole() {
  const [companies, setCompanies] = useState<ClientCompany[]>([]);
  const [agents, setAgents] = useState<ClientAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sectorCompanyId, setSectorCompanyId] = useState<string | null>(null);
  const [sectorName, setSectorName] = useState("");
  const [sectorAgentName, setSectorAgentName] = useState("");
  const [sectorRoleTitle, setSectorRoleTitle] = useState("Agente de WhatsApp");
  const [creatingSector, setCreatingSector] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      setLoading(true);

      try {
        const workspace = await fetchCompanyWorkspace();

        if (!cancelled) {
          setCompanies(workspace.companies);
          setAgents(workspace.agents);
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

    loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  const agentsByCompanyId = useMemo(() => {
    const groups = new Map<string, ClientAgent[]>();

    for (const agent of agents) {
      const group = groups.get(agent.companyId) ?? [];
      group.push(agent);
      groups.set(agent.companyId, group);
    }

    return groups;
  }, [agents]);

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

  async function updateCompany(company: ClientCompany) {
    setUpdatingId(company.id);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, name: editName }),
      });
      const data = (await response.json().catch(() => null)) as { company?: ClientCompany; error?: string } | null;

      if (!response.ok || !data?.company) {
        throw new Error(data?.error ?? "Nao foi possivel editar a empresa.");
      }

      setCompanies((current) => current.map((item) => (item.id === data.company!.id ? data.company! : item)));
      setAgents((current) => current.map((agent) => (agent.companyId === data.company!.id ? { ...agent, companyName: data.company!.name } : agent)));
      closeEditCompany();
      setNotice({ tone: "success", message: "Empresa atualizada." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao editar empresa." });
    } finally {
      setUpdatingId(null);
    }
  }

  async function createSector() {
    if (!sectorCompanyId) {
      setNotice({ tone: "warning", message: "Escolha uma empresa para criar o setor." });
      return;
    }

    setCreatingSector(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: sectorCompanyId,
          sectorName,
          name: sectorAgentName,
          roleTitle: sectorRoleTitle,
        }),
      });
      const data = (await response.json().catch(() => null)) as { agent?: ClientAgent; error?: string } | null;

      if (!response.ok || !data?.agent) {
        throw new Error(data?.error ?? "Nao foi possivel criar o setor.");
      }

      setAgents((current) => [data.agent!, ...current.filter((item) => item.id !== data.agent!.id)]);
      closeSectorForm();
      setNotice({ tone: "success", message: `Setor ${data.agent.sectorName} criado com o atendente ${data.agent.name}.` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao criar setor." });
    } finally {
      setCreatingSector(false);
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
      setAgents((current) => current.filter((agent) => agent.companyId !== company.id));
      setConfirmDeleteId(null);
      setNotice({ tone: "success", message: "Empresa excluida." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao excluir empresa." });
    } finally {
      setDeletingId(null);
    }
  }

  function openEditCompany(company: ClientCompany) {
    setEditCompanyId(company.id);
    setEditName(company.name);
    setConfirmDeleteId(null);
    setNotice(null);
  }

  function closeEditCompany() {
    setEditCompanyId(null);
    setEditName("");
  }

  function openSectorForm(company: ClientCompany) {
    setSectorCompanyId(company.id);
    setSectorName("");
    setSectorAgentName("");
    setSectorRoleTitle("Agente de WhatsApp");
    setConfirmDeleteId(null);
    setNotice(null);
  }

  function closeSectorForm() {
    setSectorCompanyId(null);
    setSectorName("");
    setSectorAgentName("");
    setSectorRoleTitle("Agente de WhatsApp");
  }

  return (
    <>
      <SectionHeader
        eyebrow="Workspace / Empresas"
        title="Minha Empresa"
        description="Edite empresas e crie setores com atendentes diferentes dentro da mesma operacao."
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
              className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200 sm:w-auto"
              type="button"
              onClick={() => setShowForm(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Nova empresa
            </button>
          }
        >
          <div className="grid gap-3">
            {companies.map((company) => (
              <CompanyBlock
                key={company.id}
                company={company}
                agents={agentsByCompanyId.get(company.id) ?? []}
                confirmDelete={confirmDeleteId === company.id}
                deleting={deletingId === company.id}
                editing={editCompanyId === company.id}
                editName={editName}
                updating={updatingId === company.id}
                sectorOpen={sectorCompanyId === company.id}
                sectorName={sectorName}
                sectorAgentName={sectorAgentName}
                sectorRoleTitle={sectorRoleTitle}
                creatingSector={creatingSector}
                onEditNameChange={setEditName}
                onSectorNameChange={setSectorName}
                onSectorAgentNameChange={setSectorAgentName}
                onSectorRoleTitleChange={setSectorRoleTitle}
                onOpenEdit={() => openEditCompany(company)}
                onCloseEdit={closeEditCompany}
                onSaveEdit={() => updateCompany(company)}
                onOpenSector={() => openSectorForm(company)}
                onCloseSector={closeSectorForm}
                onSaveSector={createSector}
                onDelete={() => deleteCompany(company)}
              />
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
            <div className="flex flex-col gap-2 sm:flex-row lg:items-end">
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

function CompanyBlock({
  company,
  agents,
  confirmDelete,
  deleting,
  editing,
  editName,
  updating,
  sectorOpen,
  sectorName,
  sectorAgentName,
  sectorRoleTitle,
  creatingSector,
  onEditNameChange,
  onSectorNameChange,
  onSectorAgentNameChange,
  onSectorRoleTitleChange,
  onOpenEdit,
  onCloseEdit,
  onSaveEdit,
  onOpenSector,
  onCloseSector,
  onSaveSector,
  onDelete,
}: {
  company: ClientCompany;
  agents: ClientAgent[];
  confirmDelete: boolean;
  deleting: boolean;
  editing: boolean;
  editName: string;
  updating: boolean;
  sectorOpen: boolean;
  sectorName: string;
  sectorAgentName: string;
  sectorRoleTitle: string;
  creatingSector: boolean;
  onEditNameChange: (value: string) => void;
  onSectorNameChange: (value: string) => void;
  onSectorAgentNameChange: (value: string) => void;
  onSectorRoleTitleChange: (value: string) => void;
  onOpenEdit: () => void;
  onCloseEdit: () => void;
  onSaveEdit: () => void;
  onOpenSector: () => void;
  onCloseSector: () => void;
  onSaveSector: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
          <Building2 className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome da empresa</span>
                <input
                  value={editName}
                  onChange={(event) => onEditNameChange(event.target.value)}
                  className="h-10 w-full rounded-lg border px-3 text-[13px] outline-none"
                />
              </label>
              <div className="flex gap-2 sm:items-end">
                <button
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-200 sm:flex-none"
                  type="button"
                  onClick={onCloseEdit}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancelar
                </button>
                <button
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                  disabled={updating}
                  type="button"
                  onClick={onSaveEdit}
                >
                  {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Salvar
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="truncate text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
                {company.name}
              </p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-slate-500">
                {agents.length === 1 ? "1 setor cadastrado" : `${agents.length} setores cadastrados`}
              </p>
            </>
          )}
        </div>

        {!editing ? (
          <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
            <button
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-400/15"
              type="button"
              onClick={onOpenEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </button>
            <button
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-400/15"
              type="button"
              onClick={onOpenSector}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Novo setor
            </button>
            <button
              className={cn(
                "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50",
                confirmDelete
                  ? "border-rose-400/40 bg-rose-400/15 text-rose-200"
                  : "border-rose-400/25 bg-rose-400/10 text-rose-200 hover:bg-rose-400/15",
              )}
              disabled={deleting}
              type="button"
              onClick={onDelete}
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {confirmDelete ? "Confirmar" : "Excluir"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--ch-border)" }}>
        <div className="mb-3 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-emerald-300" />
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Setores e atendentes</p>
        </div>

        {agents.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="min-w-0 rounded-lg border px-3 py-3"
                style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
                      {agent.sectorName}
                    </p>
                    <p className="mt-1 truncate text-[12px] text-slate-500">
                      {agent.name} - {agent.roleTitle}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <NeonBadge tone={agent.status === "active" ? "green" : "amber"}>{agent.status}</NeonBadge>
                    <Link
                      className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-400/15"
                      href="/dashboard/whatsapp"
                    >
                      Editar / clonar
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed px-3 py-4 text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
            Nenhum setor criado ainda. Use Novo setor para cadastrar outro atendente dentro desta empresa.
          </div>
        )}
      </div>

      {sectorOpen ? (
        <div className="mt-4 rounded-xl border p-4" style={{ background: "rgba(var(--ch-accent-rgb),0.06)", borderColor: "rgba(var(--ch-accent-rgb),0.24)" }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-cyan-300">Novo setor</p>
              <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
                {company.name}
              </p>
            </div>
            <button
              aria-label="Fechar cadastro de setor"
              className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
              type="button"
              onClick={onCloseSector}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome do setor</span>
              <input
                value={sectorName}
                onChange={(event) => onSectorNameChange(event.target.value)}
                placeholder="Ex: Vendas"
                className="h-10 w-full rounded-lg border px-3 text-[13px] outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome do atendente</span>
              <input
                value={sectorAgentName}
                onChange={(event) => onSectorAgentNameChange(event.target.value)}
                placeholder="Ex: Gustavo"
                className="h-10 w-full rounded-lg border px-3 text-[13px] outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Funcao</span>
              <input
                value={sectorRoleTitle}
                onChange={(event) => onSectorRoleTitleChange(event.target.value)}
                placeholder="Agente de WhatsApp"
                className="h-10 w-full rounded-lg border px-3 text-[13px] outline-none"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-4 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-200"
              type="button"
              onClick={onCloseSector}
            >
              Cancelar
            </button>
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={creatingSector}
              type="button"
              onClick={onSaveSector}
            >
              {creatingSector ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar setor
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function fetchCompanyWorkspace() {
  const response = await fetch("/api/dashboard/agents", { cache: "no-store" });
  const data = (await response.json().catch(() => null)) as {
    companies?: ClientCompany[];
    agents?: ClientAgent[];
    error?: string;
  } | null;

  if (!response.ok || !data) {
    throw new Error(data?.error ?? "Nao foi possivel carregar as empresas.");
  }

  return {
    companies: data.companies ?? [],
    agents: data.agents ?? [],
  };
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
