"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Building2, Copy, Loader2, Pencil, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
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

const defaultPrompt = [
  "Voce e o agente comercial de WhatsApp desta empresa.",
  "Atenda com clareza, descubra contexto, qualifique intencao, responda objecoes e conduza o lead para o proximo passo comercial.",
  "Quando nao tiver certeza, faca uma pergunta objetiva antes de prometer algo.",
].join("\n\n");

export function ClientAgentsConsole() {
  const [companies, setCompanies] = useState<ClientCompany[]>([]);
  const [agents, setAgents] = useState<ClientAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [sectorName, setSectorName] = useState("Atendimento WhatsApp");
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("Agente de WhatsApp");
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editSectorName, setEditSectorName] = useState("");
  const [editName, setEditName] = useState("");
  const [editRoleTitle, setEditRoleTitle] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cloneSourceAgentId, setCloneSourceAgentId] = useState<string | null>(null);
  const [cloneCompanyId, setCloneCompanyId] = useState("");
  const [cloneSectorName, setCloneSectorName] = useState("");
  const [cloneName, setCloneName] = useState("");
  const [cloneRoleTitle, setCloneRoleTitle] = useState("");
  const [clonePrompt, setClonePrompt] = useState("");
  const [cloning, setCloning] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const response = await fetch("/api/dashboard/agents", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as {
        companies?: ClientCompany[];
        agents?: ClientAgent[];
        error?: string;
      } | null;

      if (!response.ok || !data) {
        throw new Error(data?.error ?? "Nao foi possivel carregar os agentes.");
      }

      if (!cancelled) {
        const nextCompanies = data.companies ?? [];
        setCompanies(nextCompanies);
        setAgents(data.agents ?? []);
        setCompanyId(nextCompanies[0]?.id ?? "");
        setShowForm(false);
      }
    }

    load()
      .catch((error: unknown) => {
        if (!cancelled) {
          setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao carregar agentes." });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCompany = useMemo(() => companies.find((company) => company.id === companyId) ?? null, [companies, companyId]);
  const selectedCompanySectors = useMemo(() => listSectorsForCompany(agents, companyId), [agents, companyId]);

  async function createAgent() {
    setCreating(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, sectorName, name, roleTitle, prompt }),
      });
      const data = (await response.json().catch(() => null)) as { agent?: ClientAgent; error?: string } | null;

      if (!response.ok || !data?.agent) {
        throw new Error(data?.error ?? "Nao foi possivel criar o agente.");
      }

      setAgents((current) => [data.agent!, ...current]);
      setSectorName("Atendimento WhatsApp");
      setName("");
      setRoleTitle("Agente de WhatsApp");
      setPrompt(defaultPrompt);
      setShowForm(false);
      setNotice({ tone: "success", message: "Agente criado." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao criar agente." });
    } finally {
      setCreating(false);
    }
  }

  async function updateAgent() {
    if (!editingAgentId) {
      return;
    }

    setUpdatingId(editingAgentId);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: editingAgentId,
          companyId: editCompanyId,
          sectorName: editSectorName,
          name: editName,
          roleTitle: editRoleTitle,
          prompt: editPrompt,
        }),
      });
      const data = (await response.json().catch(() => null)) as { agent?: ClientAgent; error?: string } | null;

      if (!response.ok || !data?.agent) {
        throw new Error(data?.error ?? "Nao foi possivel editar o agente.");
      }

      setAgents((current) => current.map((item) => (item.id === data.agent!.id ? data.agent! : item)));
      closeAgentEditor();
      setNotice({ tone: "success", message: "Agente atualizado." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao editar agente." });
    } finally {
      setUpdatingId(null);
    }
  }

  async function cloneAgent() {
    if (!cloneSourceAgentId) {
      return;
    }

    setCloning(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clone",
          sourceAgentId: cloneSourceAgentId,
          companyId: cloneCompanyId,
          sectorName: cloneSectorName,
          name: cloneName,
          roleTitle: cloneRoleTitle,
          prompt: clonePrompt,
        }),
      });
      const data = (await response.json().catch(() => null)) as { agent?: ClientAgent; error?: string } | null;

      if (!response.ok || !data?.agent) {
        throw new Error(data?.error ?? "Nao foi possivel clonar o agente.");
      }

      setAgents((current) => [data.agent!, ...current.filter((item) => item.id !== data.agent!.id)]);
      closeCloneForm();
      setNotice({ tone: "success", message: `Clone criado para ${data.agent.companyName} / ${data.agent.sectorName}.` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao clonar agente." });
    } finally {
      setCloning(false);
    }
  }

  async function deleteAgent(agent: ClientAgent) {
    if (confirmDeleteId !== agent.id) {
      setConfirmDeleteId(agent.id);
      return;
    }

    setDeletingId(agent.id);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id }),
      });
      const data = (await response.json().catch(() => null)) as { deletedAgentId?: string; error?: string } | null;

      if (!response.ok || data?.deletedAgentId !== agent.id) {
        throw new Error(data?.error ?? "Nao foi possivel excluir o agente.");
      }

      setAgents((current) => current.filter((item) => item.id !== agent.id));
      setConfirmDeleteId(null);
      setNotice({ tone: "success", message: "Agente excluido." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao excluir agente." });
    } finally {
      setDeletingId(null);
    }
  }

  function openAgentEditor(agent: ClientAgent) {
    setEditingAgentId(agent.id);
    setEditCompanyId(agent.companyId);
    setEditSectorName(agent.sectorName);
    setEditName(agent.name);
    setEditRoleTitle(agent.roleTitle);
    setEditPrompt(agent.prompt);
    setCloneSourceAgentId(null);
    setConfirmDeleteId(null);
    setNotice(null);
  }

  function closeAgentEditor() {
    setEditingAgentId(null);
    setEditCompanyId("");
    setEditSectorName("");
    setEditName("");
    setEditRoleTitle("");
    setEditPrompt("");
  }

  function openCloneForm(agent: ClientAgent) {
    setCloneSourceAgentId(agent.id);
    setCloneCompanyId(agent.companyId);
    setCloneSectorName(agent.sectorName);
    setCloneName(`Copia de ${agent.name}`);
    setCloneRoleTitle(agent.roleTitle);
    setClonePrompt(agent.prompt);
    setEditingAgentId(null);
    setConfirmDeleteId(null);
    setNotice(null);
  }

  function closeCloneForm() {
    setCloneSourceAgentId(null);
    setCloneCompanyId("");
    setCloneSectorName("");
    setCloneName("");
    setCloneRoleTitle("");
    setClonePrompt("");
  }

  return (
    <>
      <SectionHeader
        eyebrow="Workspace / Agentes"
        title="Agentes"
        description="Crie agentes de WhatsApp e vincule cada um a empresa que ele vai atender."
      />

      {notice && <NoticeBar notice={notice} />}

      {!loading && companies.length === 0 ? <NoCompanyState /> : null}

      {!loading && companies.length > 0 && agents.length === 0 && !showForm ? (
        <EmptyAgentsState onCreate={() => setShowForm(true)} />
      ) : null}

      {showForm && companies.length > 0 ? (
        <Panel
          title={agents.length === 0 ? "Criar primeiro agente" : "Criar agente"}
          eyebrow="whatsapp / atendimento"
          action={creating ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> : <NeonBadge tone="cyan">novo</NeonBadge>}
        >
          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Empresa</span>
                <select
                  value={companyId}
                  onChange={(event) => setCompanyId(event.target.value)}
                  className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome do agente</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex: Nina Atendimento"
                  className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Setor</span>
                <input
                  value={sectorName}
                  onChange={(event) => setSectorName(event.target.value)}
                  placeholder="Ex: Vendas, Suporte, Financeiro"
                  className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                />
                {selectedCompanySectors.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedCompanySectors.map((sector) => (
                      <button
                        key={sector}
                        className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-cyan-200"
                        type="button"
                        onClick={() => setSectorName(sector)}
                      >
                        {sector}
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>

              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Funcao</span>
                <input
                  value={roleTitle}
                  onChange={(event) => setRoleTitle(event.target.value)}
                  placeholder="Agente de WhatsApp"
                  className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                />
              </label>

              {selectedCompany ? (
                <div className="rounded-xl border p-3" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Atende</p>
                  <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{selectedCompany.name}</p>
                </div>
              ) : null}
            </div>

            <div>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Prompt do agente</span>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-[280px] w-full resize-y rounded-xl border px-4 py-3 font-mono text-[12px] leading-5 outline-none"
                />
                <span className="mt-2 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  {prompt.length.toLocaleString("pt-BR")} caracteres
                </span>
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                {agents.length > 0 ? (
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-4 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-200"
                    type="button"
                    onClick={() => setShowForm(false)}
                  >
                    Cancelar
                  </button>
                ) : null}
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={creating}
                  type="button"
                  onClick={createAgent}
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar agente
                </button>
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {agents.length > 0 ? (
        <div className={cn("grid gap-4", showForm ? "mt-5" : "")}>
          <Panel
            title="Agentes cadastrados"
            eyebrow="whatsapp"
            action={
              <button
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-200"
                type="button"
                onClick={() => setShowForm(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Novo agente
              </button>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {agents.map((agent) => (
                <div key={agent.id} className="grid gap-2">
                  <AgentCard
                    agent={agent}
                    confirmDelete={confirmDeleteId === agent.id}
                    deleting={deletingId === agent.id}
                    onClone={() => openCloneForm(agent)}
                    onDelete={() => deleteAgent(agent)}
                    onEdit={() => openAgentEditor(agent)}
                  />
                  {editingAgentId === agent.id ? (
                    <AgentMutationForm
                      actionLabel="Salvar edicao"
                      companies={companies}
                      companyId={editCompanyId}
                      disabled={updatingId === agent.id}
                      mode="edit"
                      name={editName}
                      prompt={editPrompt}
                      roleTitle={editRoleTitle}
                      sectorName={editSectorName}
                      sectors={listSectorsForCompany(agents, editCompanyId)}
                      onCancel={closeAgentEditor}
                      onCompanyChange={setEditCompanyId}
                      onNameChange={setEditName}
                      onPromptChange={setEditPrompt}
                      onRoleTitleChange={setEditRoleTitle}
                      onSave={updateAgent}
                      onSectorNameChange={setEditSectorName}
                    />
                  ) : null}
                  {cloneSourceAgentId === agent.id ? (
                    <AgentMutationForm
                      actionLabel="Criar clone"
                      companies={companies}
                      companyId={cloneCompanyId}
                      disabled={cloning}
                      mode="clone"
                      name={cloneName}
                      prompt={clonePrompt}
                      roleTitle={cloneRoleTitle}
                      sectorName={cloneSectorName}
                      sectors={listSectorsForCompany(agents, cloneCompanyId)}
                      onCancel={closeCloneForm}
                      onCompanyChange={setCloneCompanyId}
                      onNameChange={setCloneName}
                      onPromptChange={setClonePrompt}
                      onRoleTitleChange={setCloneRoleTitle}
                      onSave={cloneAgent}
                      onSectorNameChange={setCloneSectorName}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}

      {loading ? (
        <div className="grid min-h-64 place-items-center rounded-2xl border border-cyan-400/15 bg-cyan-400/5">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
        </div>
      ) : null}
    </>
  );
}

function NoCompanyState() {
  return (
    <div
      className="grid min-h-[360px] place-items-center rounded-2xl border p-6 text-center"
      style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}
    >
      <div className="max-w-md">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300">
          <Building2 className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-[18px] font-semibold" style={{ color: "var(--ch-text)" }}>Cadastre uma empresa primeiro</h2>
        <p className="mt-2 text-[13px] leading-6 text-slate-500">
          O agente precisa estar vinculado a uma empresa para atender os leads certos.
        </p>
        <Link
          className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200"
          href="/dashboard/empresa"
        >
          <Plus className="h-4 w-4" />
          Cadastrar empresa
        </Link>
      </div>
    </div>
  );
}

function EmptyAgentsState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="grid min-h-[360px] place-items-center rounded-2xl border p-6 text-center"
      style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}
    >
      <div className="max-w-md">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300">
          <Bot className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-[18px] font-semibold" style={{ color: "var(--ch-text)" }}>Nenhum agente cadastrado</h2>
        <p className="mt-2 text-[13px] leading-6 text-slate-500">
          Crie o primeiro agente e escolha qual empresa ele vai atender no WhatsApp.
        </p>
        <button
          className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200"
          type="button"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" />
          Criar primeiro agente
        </button>
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  confirmDelete,
  deleting,
  onClone,
  onDelete,
  onEdit,
}: {
  agent: ClientAgent;
  confirmDelete: boolean;
  deleting: boolean;
  onClone: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>{agent.name}</p>
          <p className="mt-1 text-[12px] text-slate-500">{agent.roleTitle}</p>
        </div>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
          <Sparkles className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <InfoTile label="Empresa" value={agent.companyName} />
        <InfoTile label="Setor" value={agent.sectorName} />
        <InfoTile label="Status" value={agent.status} />
      </div>
      <p className="mt-3 line-clamp-3 text-[12px] leading-5 text-slate-500">{agent.prompt}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-400/15"
          type="button"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </button>
        <button
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-400/15"
          type="button"
          onClick={onClone}
        >
          <Copy className="h-3.5 w-3.5" />
          Clonar
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
    </div>
  );
}

function AgentMutationForm({
  actionLabel,
  companies,
  companyId,
  disabled,
  mode,
  name,
  prompt,
  roleTitle,
  sectorName,
  sectors,
  onCancel,
  onCompanyChange,
  onNameChange,
  onPromptChange,
  onRoleTitleChange,
  onSave,
  onSectorNameChange,
}: {
  actionLabel: string;
  companies: ClientCompany[];
  companyId: string;
  disabled: boolean;
  mode: "edit" | "clone";
  name: string;
  prompt: string;
  roleTitle: string;
  sectorName: string;
  sectors: string[];
  onCancel: () => void;
  onCompanyChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onRoleTitleChange: (value: string) => void;
  onSave: () => void;
  onSectorNameChange: (value: string) => void;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "rgba(var(--ch-accent-rgb),0.06)", borderColor: "rgba(var(--ch-accent-rgb),0.24)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-cyan-300">
            {mode === "clone" ? "Clonar agente" : "Editar agente"}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-slate-500">
            {mode === "clone"
              ? "Copie prompt e configuracoes para outra empresa ou setor."
              : "Troque empresa, setor, nome, funcao e prompt deste agente."}
          </p>
        </div>
        <button
          aria-label="Fechar formulario do agente"
          className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
          type="button"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Empresa</span>
            <select
              value={companyId}
              onChange={(event) => onCompanyChange(event.target.value)}
              className="h-10 w-full rounded-lg border px-3 text-[13px] outline-none"
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Setor</span>
            <input
              value={sectorName}
              onChange={(event) => onSectorNameChange(event.target.value)}
              placeholder="Ex: Vendas, Suporte, Financeiro"
              className="h-10 w-full rounded-lg border px-3 text-[13px] outline-none"
            />
            {sectors.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sectors.map((sector) => (
                  <button
                    key={sector}
                    className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-cyan-200"
                    type="button"
                    onClick={() => onSectorNameChange(sector)}
                  >
                    {sector}
                  </button>
                ))}
              </div>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome do agente</span>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Ex: Gustavo Vendas"
              className="h-10 w-full rounded-lg border px-3 text-[13px] outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Funcao</span>
            <input
              value={roleTitle}
              onChange={(event) => onRoleTitleChange(event.target.value)}
              placeholder="Agente de WhatsApp"
              className="h-10 w-full rounded-lg border px-3 text-[13px] outline-none"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Prompt</span>
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            className="min-h-[245px] w-full resize-y rounded-xl border px-4 py-3 font-mono text-[12px] leading-5 outline-none"
          />
          <span className="mt-2 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
            {prompt.length.toLocaleString("pt-BR")} caracteres
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-4 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-200"
          type="button"
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          type="button"
          onClick={onSave}
        >
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "clone" ? <Copy className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border px-3 py-2" style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}>
      <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{value}</p>
    </div>
  );
}

function listSectorsForCompany(agents: ClientAgent[], companyId: string) {
  const sectors = new Set<string>();

  for (const agent of agents) {
    if (agent.companyId === companyId && agent.sectorName.trim()) {
      sectors.add(agent.sectorName);
    }
  }

  return Array.from(sectors).sort((a, b) => a.localeCompare(b, "pt-BR"));
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
