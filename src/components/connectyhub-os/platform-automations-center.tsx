"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bot,
  ChevronDown,
  ChevronRight,
  Filter,
  MessageCircle,
  MessageSquareText,
  PauseCircle,
  PlayCircle,
  Plus,
  Save,
  Send,
  Sparkles,
  Target,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  PlatformAutomationAgentOption,
  PlatformAutomationAudience,
  PlatformAutomationFlow,
  PlatformAutomationStatus,
  PlatformAutomationsCatalog,
} from "@/lib/automations/platform-automations";
import { cn } from "@/lib/utils";
import { ConnectyShell } from "./connecty-shell";
import { DataTable, NeonBadge, PageHeader, Panel } from "./panel-primitives";

type ActionState = {
  tone: "idle" | "success" | "warning" | "error";
  message: string;
};

type AutomationDraft = {
  id?: string;
  name: string;
  description: string;
  eventType: string;
  status: PlatformAutomationStatus;
  selectedAgentId: string;
  fallbackToBillingAgent: boolean;
  audienceType: PlatformAutomationAudience;
  messageTemplate: string;
  delayMinutes: string;
  cooldownMinutes: string;
  maxSendsPerContact: string;
  priority: string;
  labelsText: string;
  planCodesText: string;
  minBalanceCredits: string;
  maxBalanceCredits: string;
  minUsedCredits: string;
  maxUsedCredits: string;
  milestoneStepCredits: string;
};

type RenewalPolicyDraft = {
  pixReminderStartDays: string;
  cardChargeAttemptDays: string;
  gracePeriodDays: string;
  suspendAfterDays: string;
  dailyWhatsAppReminders: boolean;
  cardChargeAttemptEnabled: boolean;
  cardFailureUsesPixFallback: boolean;
  notifyResponsibleHumans: boolean;
};

export function PlatformAutomationsCenter({
  catalog,
  userLabel = "CEO_HUMAN_ADM",
}: {
  catalog: PlatformAutomationsCatalog;
  userLabel?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<ActionState>({ tone: "idle", message: "" });
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyState, setPolicyState] = useState<ActionState>({ tone: "idle", message: "" });
  const [creating, setCreating] = useState(false);
  const firstFlow = catalog.flows[0] ?? null;
  const [selectedFlowId, setSelectedFlowId] = useState(firstFlow?.id ?? "");
  const selectedFlow = catalog.flows.find((flow) => flow.id === selectedFlowId) ?? firstFlow;
  const [draft, setDraft] = useState<AutomationDraft>(() =>
    selectedFlow ? draftFromFlow(selectedFlow) : draftFromEvent(catalog),
  );
  const [policyDraft, setPolicyDraft] = useState<RenewalPolicyDraft>(() =>
    renewalPolicyDraftFromCatalog(catalog),
  );
  const connectedAgents = useMemo(
    () => catalog.agents.filter((agent) => agent.isConnected),
    [catalog.agents],
  );
  const selectedEvent = catalog.eventDefinitions.find((event) => event.eventType === draft.eventType);
  const selectedAgent = draft.selectedAgentId
    ? catalog.agents.find((agent) => agent.id === draft.selectedAgentId) ?? null
    : null;
  const canSave = catalog.schemaReady && (!draft.selectedAgentId || Boolean(selectedAgent?.isConnected));
  const policyChanged = !isRenewalPolicyDraftEqual(policyDraft, renewalPolicyDraftFromCatalog(catalog));

  function chooseFlow(flow: PlatformAutomationFlow) {
    setCreating(false);
    setSelectedFlowId(flow.id);
    setDraft(draftFromFlow(flow));
    setState({ tone: "idle", message: "" });
  }

  function startCreate() {
    setCreating(true);
    setSelectedFlowId("");
    setDraft(draftFromEvent(catalog));
    setState({ tone: "idle", message: "" });
  }

  async function saveAutomation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSave) {
      setState({
        tone: "error",
        message: catalog.schemaReady
          ? "Escolha um agente conectado ou use o fallback do financeiro."
          : "Aplique a migration 0036 antes de salvar automacoes.",
      });
      return;
    }

    setSaving(true);
    setState({ tone: "idle", message: "" });

    try {
      const response = await fetch("/api/admin/automations", {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(draft, creating)),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a automacao.");
      }

      setState({ tone: "success", message: creating ? "Automacao criada." : "Automacao salva." });
      setCreating(false);
      router.refresh();
    } catch (error) {
      setState({
        tone: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar automacao.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveRenewalPolicy() {
    setSavingPolicy(true);
    setPolicyState({ tone: "idle", message: "" });

    try {
      const response = await fetch("/api/admin/automations/renewal-policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: buildRenewalPolicyPayload(policyDraft) }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a regua financeira.");
      }

      setPolicyState({ tone: "success", message: "Regua financeira salva." });
      router.refresh();
    } catch (error) {
      setPolicyState({
        tone: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar regua financeira.",
      });
    } finally {
      setSavingPolicy(false);
    }
  }

  return (
    <ConnectyShell mode="admin" isPlatformAdmin userLabel={userLabel} activeHref="/admin/automacoes">
      <PageHeader
        eyebrow="Admin OS / Automacoes"
        title="Automacoes de receita"
        description="Controle mensagens automaticas, gatilhos de venda e agente WhatsApp para cada etapa do cliente."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 font-mono text-[10px] font-bold uppercase tracking-widest text-cyan-200 transition hover:bg-cyan-500/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova automacao
            </button>
            <NeonBadge tone={catalog.schemaReady ? "green" : "amber"}>
              {catalog.schemaReady ? "Schema pronto" : "Aguardando SQL"}
            </NeonBadge>
          </div>
        }
      />

      {!catalog.schemaReady && (
        <Panel className="mb-4" title="Migration pendente" eyebrow="supabase / sql" tone="amber">
          <div
            className="rounded-xl p-3 text-[12px] leading-5 text-amber-100"
            style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)" }}
          >
            Aplique a migration <strong>supabase/migrations/0036_platform_automations.sql</strong> no Supabase para liberar
            criacao, edicao e vinculo dos fluxos.
          </div>
        </Panel>
      )}

      <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <AutomationMetric icon={Zap} label="Fluxos" value={formatNumber(catalog.stats.totalFlows)} detail="templates comerciais" tone="cyan" />
        <AutomationMetric icon={PlayCircle} label="Ativas" value={formatNumber(catalog.stats.activeFlows)} detail="enviando agora" tone="green" />
        <AutomationMetric icon={PauseCircle} label="Pausadas" value={formatNumber(catalog.stats.pausedFlows)} detail="guardadas" tone="amber" />
        <AutomationMetric icon={Bot} label="Agentes" value={formatNumber(catalog.stats.connectedAgents)} detail="WhatsApp online" tone="violet" />
        <AutomationMetric icon={Send} label="24h" value={formatNumber(catalog.stats.sent24h)} detail="mensagens enviadas" tone="green" />
        <AutomationMetric icon={Activity} label="Fila" value={formatNumber(catalog.stats.pendingNotifications)} detail="pendentes" tone="amber" />
      </div>

      <Panel
        className="mb-4"
        title="Regua financeira"
        eyebrow="planos / pix / cartao"
        tone="amber"
        action={
          <button
            type="button"
            disabled={savingPolicy || !catalog.schemaReady || !policyChanged}
            onClick={saveRenewalPolicy}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-amber-300 px-3 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {savingPolicy ? "Salvando" : "Salvar regua"}
          </button>
        }
      >
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Pix avisa antes">
              <DaySelect
                value={policyDraft.pixReminderStartDays}
                min={1}
                max={15}
                suffix="dia(s)"
                onChange={(value) => setPolicyDraft((current) => ({ ...current, pixReminderStartDays: value }))}
              />
            </Field>
            <Field label="Cartao tenta antes">
              <DaySelect
                value={policyDraft.cardChargeAttemptDays}
                min={1}
                max={15}
                suffix="dia(s)"
                onChange={(value) => setPolicyDraft((current) => ({ ...current, cardChargeAttemptDays: value }))}
              />
            </Field>
            <Field label="Carencia">
              <DaySelect
                value={policyDraft.gracePeriodDays}
                min={0}
                max={15}
                suffix="dia(s)"
                onChange={(value) => setPolicyDraft((current) => ({ ...current, gracePeriodDays: value }))}
              />
            </Field>
            <Field label="Suspender apos">
              <DaySelect
                value={policyDraft.suspendAfterDays}
                min={0}
                max={30}
                suffix="dia(s)"
                onChange={(value) => setPolicyDraft((current) => ({ ...current, suspendAfterDays: value }))}
              />
            </Field>
          </div>

          <div className="grid gap-2">
            <RenewalToggle
              label="Lembrete diario no WhatsApp"
              checked={policyDraft.dailyWhatsAppReminders}
              onChange={(checked) => setPolicyDraft((current) => ({ ...current, dailyWhatsAppReminders: checked }))}
            />
            <RenewalToggle
              label="Tentativa antecipada no cartao"
              checked={policyDraft.cardChargeAttemptEnabled}
              onChange={(checked) => setPolicyDraft((current) => ({ ...current, cardChargeAttemptEnabled: checked }))}
            />
            <RenewalToggle
              label="Falha no cartao oferece Pix"
              checked={policyDraft.cardFailureUsesPixFallback}
              onChange={(checked) => setPolicyDraft((current) => ({ ...current, cardFailureUsesPixFallback: checked }))}
            />
            <RenewalToggle
              label="Avisar responsaveis humanos"
              checked={policyDraft.notifyResponsibleHumans}
              onChange={(checked) => setPolicyDraft((current) => ({ ...current, notifyResponsibleHumans: checked }))}
            />
          </div>
        </div>

        {policyState.message ? (
          <div
            className={cn(
              "mt-3 rounded-xl border px-3 py-2 text-[12px] leading-5",
              policyState.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
              policyState.tone === "error" && "border-rose-200 bg-rose-50 text-rose-700",
              policyState.tone === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
            )}
          >
            {policyState.message}
          </div>
        ) : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Panel
          title="Fluxos de follow-up"
          eyebrow="gatilhos / etapas"
          tone="violet"
          action={<NeonBadge tone="cyan">{catalog.flows.length} fluxos</NeonBadge>}
        >
          <div className="grid gap-2">
            {catalog.flows.map((flow) => (
              <button
                key={flow.id}
                type="button"
                onClick={() => chooseFlow(flow)}
                className={cn(
                  "rounded-xl border px-3 py-3 text-left transition",
                  selectedFlowId === flow.id && !creating
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/60",
                )}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-slate-950">{flow.name}</p>
                    <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-widest text-slate-500">
                      {flow.eventLabel} / {flow.audienceType}
                    </p>
                  </div>
                  <FlowStatusBadge status={flow.status} />
                </div>
                <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-400">{flow.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <MiniFlowChain flow={flow} />
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <form onSubmit={saveAutomation} className="grid gap-4">
          <Panel
            title={creating ? "Nova automacao" : "Editor da automacao"}
            eyebrow="mensagem / agente / regras"
            tone="cyan"
            action={
              <div className="flex flex-wrap gap-2">
                {selectedEvent && <NeonBadge tone="violet">{selectedEvent.category}</NeonBadge>}
                <button
                  type="submit"
                  disabled={saving || !canSave}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-400 px-3 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Salvando" : "Salvar"}
                </button>
              </div>
            }
          >
            <div className="grid gap-4">
              {state.message && (
                <div
                  className={cn(
                    "rounded-xl border px-3 py-2 text-[12px] leading-5",
                    state.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    state.tone === "error" && "border-rose-200 bg-rose-50 text-rose-700",
                    state.tone === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
                  )}
                >
                  {state.message}
                </div>
              )}

              <FlowJourneyCanvas
                draft={draft}
                selectedEvent={selectedEvent}
                selectedAgent={selectedAgent}
              />

              <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                <Field label="Nome">
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    className="ch-input"
                    placeholder="Ex: Bonus do teste gratis"
                  />
                </Field>
                <Field label="Evento">
                  <select
                    value={draft.eventType}
                    onChange={(event) => {
                      const eventType = event.target.value;
                      setDraft((current) => ({
                        ...current,
                        eventType,
                        messageTemplate: current.messageTemplate || eventDefaultTemplate(catalog, eventType),
                      }));
                    }}
                    disabled={!creating}
                    className="ch-input"
                  >
                    {catalog.eventDefinitions.map((event) => (
                      <option key={event.eventType} value={event.eventType}>{event.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Descricao">
                <input
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  className="ch-input"
                  placeholder="O que este fluxo faz para vender, recuperar ou informar"
                />
              </Field>

              <div className="grid gap-3 lg:grid-cols-4">
                <Field label="Status">
                  <select
                    value={draft.status}
                    onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as PlatformAutomationStatus }))}
                    className="ch-input"
                  >
                    <option value="active">Ativa</option>
                    <option value="paused">Pausada</option>
                    <option value="draft">Rascunho</option>
                  </select>
                </Field>
                <Field label="Publico">
                  <select
                    value={draft.audienceType}
                    onChange={(event) => setDraft((current) => ({ ...current, audienceType: event.target.value as PlatformAutomationAudience }))}
                    className="ch-input"
                  >
                    <option value="all_clients">Todos clientes</option>
                    <option value="trial_users">Teste gratis</option>
                    <option value="paid_users">Clientes pagos</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </Field>
                <Field label="Prioridade">
                  <input
                    value={draft.priority}
                    onChange={(event) => setDraft((current) => ({ ...current, priority: onlyDigits(event.target.value, 5) }))}
                    className="ch-input"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Max. envios">
                  <input
                    value={draft.maxSendsPerContact}
                    onChange={(event) => setDraft((current) => ({ ...current, maxSendsPerContact: onlyDigits(event.target.value, 3) }))}
                    className="ch-input"
                    inputMode="numeric"
                  />
                </Field>
              </div>

              <div className="grid gap-3 xl:grid-cols-[1fr_300px]">
                <Field label="Mensagem WhatsApp">
                  <textarea
                    value={draft.messageTemplate}
                    onChange={(event) => setDraft((current) => ({ ...current, messageTemplate: event.target.value.slice(0, 900) }))}
                    className="ch-input min-h-[190px] resize-y leading-5"
                    placeholder="Escreva a mensagem que o agente vai enviar"
                  />
                </Field>
                <div className="grid gap-3">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-950">
                      <Sparkles className="h-4 w-4 text-blue-600" />
                      Variaveis
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {catalog.variables.map((variable) => (
                        <button
                          key={variable}
                          type="button"
                          onClick={() => setDraft((current) => ({
                            ...current,
                            messageTemplate: `${current.messageTemplate}${current.messageTemplate.endsWith(" ") ? "" : " "}${variable}`,
                          }))}
                          className="rounded-full border border-blue-200 bg-white px-2 py-1 font-mono text-[9px] text-blue-700 transition hover:bg-blue-100"
                        >
                          {variable}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedEvent && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] leading-5 text-emerald-700">
                      <p className="font-semibold">{selectedEvent.label}</p>
                      <p className="mt-1 text-emerald-700/80">{selectedEvent.revenueGoal}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
                <Panel title="Agente que envia" eyebrow="whatsapp / remetente" tone="green" compact>
                  <div className="grid gap-3">
                    <Field label="Agente">
                      <select
                        value={draft.selectedAgentId}
                        onChange={(event) => setDraft((current) => ({ ...current, selectedAgentId: event.target.value }))}
                        className="ch-input"
                      >
                        <option value="">Usar agente global do financeiro</option>
                        {catalog.agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name} - {agent.isConnected ? "conectado" : "desconectado"}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[12px] leading-5 text-slate-600">
                      <input
                        type="checkbox"
                        checked={draft.fallbackToBillingAgent}
                        onChange={(event) => setDraft((current) => ({ ...current, fallbackToBillingAgent: event.target.checked }))}
                        className="mt-1"
                      />
                      <span>
                        Se este fluxo nao tiver agente proprio, usar o agente global configurado no financeiro.
                      </span>
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <SmallInfo label="Agentes conectados" value={formatNumber(connectedAgents.length)} tone="green" />
                      <SmallInfo
                        label="Selecionado"
                        value={selectedAgent?.isConnected ? "online" : draft.selectedAgentId ? "offline" : "global"}
                        tone={selectedAgent?.isConnected || !draft.selectedAgentId ? "cyan" : "rose"}
                      />
                    </div>
                  </div>
                </Panel>

                <Panel title="Regras do gatilho" eyebrow="condicoes / frequencia" tone="amber" compact>
                  <div className="grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Atraso min.">
                        <input
                          value={draft.delayMinutes}
                          onChange={(event) => setDraft((current) => ({ ...current, delayMinutes: onlyDigits(event.target.value, 5) }))}
                          className="ch-input"
                          inputMode="numeric"
                        />
                      </Field>
                      <Field label="Cooldown min.">
                        <input
                          value={draft.cooldownMinutes}
                          onChange={(event) => setDraft((current) => ({ ...current, cooldownMinutes: onlyDigits(event.target.value, 5) }))}
                          className="ch-input"
                          inputMode="numeric"
                        />
                      </Field>
                    </div>
                    <Field label="Planos especificos">
                      <input
                        value={draft.planCodesText}
                        onChange={(event) => setDraft((current) => ({ ...current, planCodesText: event.target.value }))}
                        className="ch-input"
                        placeholder="starter, pro, scale"
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Saldo min.">
                        <input
                          value={draft.minBalanceCredits}
                          onChange={(event) => setDraft((current) => ({ ...current, minBalanceCredits: onlyDigits(event.target.value, 9) }))}
                          className="ch-input"
                          inputMode="numeric"
                        />
                      </Field>
                      <Field label="Saldo max.">
                        <input
                          value={draft.maxBalanceCredits}
                          onChange={(event) => setDraft((current) => ({ ...current, maxBalanceCredits: onlyDigits(event.target.value, 9) }))}
                          className="ch-input"
                          inputMode="numeric"
                        />
                      </Field>
                      <Field label="Marco creditos">
                        <input
                          value={draft.milestoneStepCredits}
                          onChange={(event) => setDraft((current) => ({ ...current, milestoneStepCredits: onlyDigits(event.target.value, 9) }))}
                          className="ch-input"
                          inputMode="numeric"
                        />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Usados min.">
                        <input
                          value={draft.minUsedCredits}
                          onChange={(event) => setDraft((current) => ({ ...current, minUsedCredits: onlyDigits(event.target.value, 9) }))}
                          className="ch-input"
                          inputMode="numeric"
                        />
                      </Field>
                      <Field label="Usados max.">
                        <input
                          value={draft.maxUsedCredits}
                          onChange={(event) => setDraft((current) => ({ ...current, maxUsedCredits: onlyDigits(event.target.value, 9) }))}
                          className="ch-input"
                          inputMode="numeric"
                        />
                      </Field>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>
          </Panel>
        </form>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <Panel title="Historico de automacoes" eyebrow="whatsapp / fila" tone="cyan">
          {catalog.notifications.length > 0 ? (
            <DataTable
              columns={["Cliente", "Fluxo", "Evento", "Status", "Agente", "Criado"]}
              rows={catalog.notifications.map((item) => [
                <span key="customer" className="font-semibold text-slate-950">{item.organizationName}</span>,
                <span key="flow" className="text-slate-600">{item.automationFlowName ?? "Template legado"}</span>,
                <span key="event" className="font-mono text-[10px] text-blue-700">{item.eventLabel}</span>,
                <FlowStatusPill key="status" status={item.status} />,
                <span key="agent" className="text-slate-600">{item.agentName ?? "Global"}</span>,
                <span key="date" className="font-mono text-[10px] text-slate-400">{formatDateTime(item.createdAt)}</span>,
              ])}
            />
          ) : (
            <EmptyState
              icon={MessageCircle}
              title="Nenhum envio registrado"
              description="Assim que os fluxos dispararem mensagens, o historico aparece aqui."
            />
          )}
        </Panel>

        <Panel title="Mapa de eventos" eyebrow="fluentcrm inspired" tone="violet">
          <div className="grid gap-2">
            {catalog.eventDefinitions.map((event) => (
              <div
                key={event.eventType}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-slate-950">{event.label}</p>
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 font-mono text-[8px] uppercase tracking-widest text-indigo-700">
                    {event.category}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">{event.description}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {catalog.warnings.length > 0 && (
        <Panel className="mt-4" title="Avisos tecnicos" eyebrow="automacoes / banco" tone="amber">
          <ul className="list-disc space-y-1 pl-5 text-[12px] leading-5 text-amber-100">
            {catalog.warnings.slice(0, 4).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Panel>
      )}
    </ConnectyShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function DaySelect({
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  value: string;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: string) => void;
}) {
  const options = Array.from({ length: max - min + 1 }, (_, index) => min + index);

  return (
    <select
      className="ch-input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={String(option)}>
          {option} {suffix}
        </option>
      ))}
    </select>
  );
}

function RenewalToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700">
      <span className="font-semibold">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        className="h-4 w-4 rounded border-slate-300 accent-amber-500"
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function FlowJourneyCanvas({
  draft,
  selectedEvent,
  selectedAgent,
}: {
  draft: AutomationDraft;
  selectedEvent: PlatformAutomationsCatalog["eventDefinitions"][number] | undefined;
  selectedAgent: PlatformAutomationAgentOption | null;
}) {
  const conditionsSummary = buildConditionsSummary(draft);
  const waitSummary = buildWaitSummary(draft);
  const messagePreview = previewText(draft.messageTemplate, 92) || "Mensagem WhatsApp personalizada";
  const agentName = selectedAgent?.name ?? (draft.selectedAgentId ? "Agente desconectado" : "Agente global");
  const agentDetail = selectedAgent?.isConnected
    ? "WhatsApp conectado"
    : draft.selectedAgentId
      ? "Troque por um agente conectado"
      : "Usa fallback do financeiro";

  const steps: FlowStep[] = [
    {
      key: "trigger",
      eyebrow: "gatilho",
      title: selectedEvent?.label ?? "Evento do sistema",
      detail: selectedEvent?.description ?? "Quando este evento acontecer, o fluxo inicia.",
      icon: Zap,
      tone: "cyan",
    },
    {
      key: "audience",
      eyebrow: "publico",
      title: audienceLabels[draft.audienceType],
      detail: conditionsSummary,
      icon: Users,
      tone: "violet",
    },
    {
      key: "rules",
      eyebrow: "regras",
      title: waitSummary.title,
      detail: waitSummary.detail,
      icon: Filter,
      tone: "amber",
    },
    {
      key: "message",
      eyebrow: "acao",
      title: "Enviar WhatsApp",
      detail: messagePreview,
      icon: MessageSquareText,
      tone: "green",
    },
    {
      key: "agent",
      eyebrow: "remetente",
      title: agentName,
      detail: agentDetail,
      icon: Bot,
      tone: selectedAgent?.isConnected || !draft.selectedAgentId ? "cyan" : "rose",
    },
    {
      key: "goal",
      eyebrow: "objetivo",
      title: selectedEvent?.category ? categoryLabels[selectedEvent.category] : "Receita",
      detail: selectedEvent?.revenueGoal ?? "Converter, recuperar ou manter o cliente ativo.",
      icon: Target,
      tone: "green",
    },
  ];

  return (
    <div
      className="rounded-2xl border p-3"
      style={{
        borderColor: "rgba(34,211,238,0.24)",
        background: "linear-gradient(180deg, rgba(24,119,242,0.08), rgba(255,255,255,0.92))",
      }}
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue-700">jornada visual</p>
          <p className="mt-1 text-[13px] font-semibold text-slate-950">Como este fluxo se conecta</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NeonBadge tone={draft.status === "active" ? "green" : draft.status === "paused" ? "amber" : "zinc"}>
            {draft.status === "active" ? "Ativa" : draft.status === "paused" ? "Pausada" : "Rascunho"}
          </NeonBadge>
          <NeonBadge tone="violet">{draft.maxSendsPerContact || "1"} envios max.</NeonBadge>
        </div>
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_26px_minmax(0,1fr)_26px_minmax(0,1fr)_26px_minmax(0,1fr)_26px_minmax(0,1fr)_26px_minmax(0,1fr)]">
        {steps.map((step, index) => (
          <FragmentWithConnector key={step.key} showConnector={index < steps.length - 1}>
            <FlowStepCard step={step} index={index + 1} />
          </FragmentWithConnector>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">logica do fluxo</p>
            <p className="mt-1 text-[12px] leading-5 text-slate-600">
              Se o evento acontecer e as regras baterem, o agente envia a mensagem. Se as regras nao baterem, o envio para antes de gastar atendimento.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-2 text-center">
            <SmallInfo label="Atraso" value={`${parseInteger(draft.delayMinutes, 0)}m`} tone="cyan" />
            <SmallInfo label="Cooldown" value={`${parseInteger(draft.cooldownMinutes, 0)}m`} tone="green" />
            <SmallInfo label="Prioridade" value={draft.priority || "100" } tone="cyan" />
          </div>
        </div>
      </div>
    </div>
  );
}

type FlowStep = {
  key: string;
  eyebrow: string;
  title: string;
  detail: string;
  icon: LucideIcon;
  tone: "cyan" | "green" | "amber" | "violet" | "rose";
};

function FragmentWithConnector({
  children,
  showConnector,
}: {
  children: ReactNode;
  showConnector: boolean;
}) {
  return (
    <>
      {children}
      {showConnector && <FlowConnector />}
    </>
  );
}

function FlowStepCard({ step, index }: { step: FlowStep; index: number }) {
  const palette = metricPalette[step.tone];
  const Icon = step.icon;

  return (
    <div
      className="min-h-[138px] rounded-xl border p-3"
      style={{
        borderColor: `${palette.fill}55`,
        background: `linear-gradient(180deg, ${palette.fill}16, rgba(255,255,255,0.96))`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${palette.fill}18` }}>
          <Icon className="h-4 w-4" style={{ color: palette.fill }} />
        </div>
        <span
          className="rounded-full border px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-widest"
          style={{ borderColor: `${palette.fill}45`, color: palette.fill, background: `${palette.fill}10` }}
        >
          {String(index).padStart(2, "0")}
        </span>
      </div>
      <p className="mt-3 font-mono text-[8px] uppercase tracking-[0.18em] text-slate-500">{step.eyebrow}</p>
      <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-4 text-slate-950">{step.title}</p>
      <p className="mt-2 line-clamp-3 text-[11px] leading-4 text-slate-400">{step.detail}</p>
    </div>
  );
}

function FlowConnector() {
  return (
    <div className="relative flex h-7 items-center justify-center xl:h-auto">
      <div className="h-px w-full bg-cyan-400/35 xl:block" />
      <div className="absolute grid h-6 w-6 place-items-center rounded-full border border-blue-200 bg-white text-blue-700 shadow-[0_8px_18px_rgba(24,119,242,0.12)]">
        <ChevronDown className="h-3.5 w-3.5 xl:hidden" />
        <ChevronRight className="hidden h-3.5 w-3.5 xl:block" />
      </div>
    </div>
  );
}

function MiniFlowChain({ flow }: { flow: PlatformAutomationFlow }) {
  const labels = [
    shortEventLabel(flow.eventLabel),
    flow.delayMinutes > 0 ? `${flow.delayMinutes}m` : "agora",
    flow.selectedAgentId ? "agente" : "global",
    "whatsapp",
  ];

  return (
    <div className="flex w-full min-w-0 items-center gap-1 overflow-hidden">
      {labels.map((label, index) => (
        <FragmentWithMiniConnector key={`${label}-${index}`} showConnector={index < labels.length - 1}>
          <span className="max-w-[92px] truncate rounded-full border border-slate-200 bg-white px-2 py-1 font-mono text-[8px] uppercase tracking-widest text-slate-500">
            {label}
          </span>
        </FragmentWithMiniConnector>
      ))}
    </div>
  );
}

function FragmentWithMiniConnector({
  children,
  showConnector,
}: {
  children: ReactNode;
  showConnector: boolean;
}) {
  return (
    <>
      {children}
      {showConnector && <span className="h-px min-w-3 flex-1 bg-cyan-400/25" />}
    </>
  );
}

function AutomationMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  detail: string;
  tone: "cyan" | "green" | "amber" | "violet";
}) {
  const palette = metricPalette[tone];

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: `linear-gradient(90deg, ${palette.fill}18, rgba(255,255,255,0.018)), var(--ch-panel)`,
        border: `1px solid ${palette.fill}55`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[8px] uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-1 truncate font-mono text-[20px] font-bold leading-none" style={{ color: palette.fill }}>{value}</p>
        </div>
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: `${palette.fill}18` }}>
          <Icon className="h-4 w-4" style={{ color: palette.fill }} />
        </div>
      </div>
      <p className="mt-2 truncate text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

function FlowStatusBadge({ status }: { status: PlatformAutomationStatus }) {
  const tone = status === "active" ? "green" : status === "paused" ? "amber" : "zinc";
  const label = status === "active" ? "Ativa" : status === "paused" ? "Pausada" : "Rascunho";

  return <NeonBadge tone={tone}>{label}</NeonBadge>;
}

function FlowStatusPill({ status }: { status: string }) {
  const tone = status === "sent" ? "text-emerald-700 border-emerald-200 bg-emerald-50"
    : status === "failed" ? "text-rose-700 border-rose-200 bg-rose-50"
      : status === "pending" ? "text-amber-800 border-amber-200 bg-amber-50"
        : "text-slate-600 border-slate-200 bg-slate-50";

  return (
    <span className={cn("rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-widest", tone)}>
      {status}
    </span>
  );
}

function SmallInfo({ label, value, tone }: { label: string; value: string; tone: "green" | "cyan" | "rose" }) {
  const palette = tone === "green" ? metricPalette.green : tone === "rose" ? metricPalette.rose : metricPalette.cyan;

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: `${palette.fill}55`, background: `${palette.fill}12` }}>
      <p className="font-mono text-[8px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-[13px] font-bold uppercase" style={{ color: palette.fill }}>{value}</p>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof MessageCircle;
  title: string;
  description: string;
}) {
  return (
    <div className="grid place-items-center rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
      <Icon className="h-8 w-8 text-slate-400" />
      <p className="mt-3 text-[13px] font-semibold text-slate-950">{title}</p>
      <p className="mt-1 max-w-md text-[12px] leading-5 text-slate-500">{description}</p>
    </div>
  );
}

const metricPalette = {
  cyan: { fill: "#1877f2" },
  green: { fill: "#128c7e" },
  amber: { fill: "#b45309" },
  violet: { fill: "#4f46e5" },
  rose: { fill: "#dc2626" },
};

const audienceLabels: Record<PlatformAutomationAudience, string> = {
  all_clients: "Todos os clientes",
  trial_users: "Teste gratis",
  paid_users: "Clientes pagos",
  custom: "Publico personalizado",
};

const categoryLabels: Record<PlatformAutomationsCatalog["eventDefinitions"][number]["category"], string> = {
  trial: "Converter teste",
  billing: "Receber pagamento",
  retention: "Reter cliente",
  internal: "Operacao interna",
};

function buildConditionsSummary(draft: AutomationDraft) {
  const items = [
    draft.planCodesText ? `planos ${draft.planCodesText}` : "",
    draft.minBalanceCredits ? `saldo acima de ${draft.minBalanceCredits}` : "",
    draft.maxBalanceCredits ? `saldo ate ${draft.maxBalanceCredits}` : "",
    draft.minUsedCredits ? `usou ao menos ${draft.minUsedCredits}` : "",
    draft.maxUsedCredits ? `usou ate ${draft.maxUsedCredits}` : "",
    draft.milestoneStepCredits ? `a cada ${draft.milestoneStepCredits} creditos` : "",
  ].filter(Boolean);

  return items.length > 0
    ? items.join(" / ")
    : "Entra quando o evento acontecer para o publico escolhido.";
}

function buildWaitSummary(draft: AutomationDraft) {
  const delay = parseInteger(draft.delayMinutes, 0);
  const cooldown = parseInteger(draft.cooldownMinutes, 0);
  const hasDelay = delay > 0;
  const hasCooldown = cooldown > 0;

  if (hasDelay && hasCooldown) {
    return {
      title: `Esperar ${delay} min.`,
      detail: `Depois respeita ${cooldown} min. antes de repetir para o mesmo cliente.`,
    };
  }

  if (hasDelay) {
    return {
      title: `Esperar ${delay} min.`,
      detail: "Depois do atraso, valida as condicoes e segue para a mensagem.",
    };
  }

  if (hasCooldown) {
    return {
      title: "Enviar no momento",
      detail: `Nao repete para o mesmo cliente antes de ${cooldown} min.`,
    };
  }

  return {
    title: "Enviar no momento",
    detail: "Sem espera configurada. Valida as regras e dispara a mensagem.",
  };
}

function previewText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function shortEventLabel(value: string) {
  const words = value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  return words.slice(0, 2).join(" ") || "evento";
}

function draftFromFlow(flow: PlatformAutomationFlow): AutomationDraft {
  return {
    id: flow.id,
    name: flow.name,
    description: flow.description,
    eventType: flow.eventType,
    status: flow.status,
    selectedAgentId: flow.selectedAgentId ?? "",
    fallbackToBillingAgent: flow.fallbackToBillingAgent,
    audienceType: flow.audienceType,
    messageTemplate: flow.messageTemplate,
    delayMinutes: String(flow.delayMinutes),
    cooldownMinutes: String(flow.cooldownMinutes),
    maxSendsPerContact: String(flow.maxSendsPerContact),
    priority: String(flow.priority),
    labelsText: flow.labels.join(", "),
    planCodesText: readStringList(flow.conditions.plan_codes).join(", "),
    minBalanceCredits: readConditionNumber(flow.conditions.min_balance_credits),
    maxBalanceCredits: readConditionNumber(flow.conditions.max_balance_credits),
    minUsedCredits: readConditionNumber(flow.conditions.min_used_credits),
    maxUsedCredits: readConditionNumber(flow.conditions.max_used_credits),
    milestoneStepCredits: readConditionNumber(flow.conditions.milestone_step_credits),
  };
}

function draftFromEvent(catalog: PlatformAutomationsCatalog): AutomationDraft {
  const eventType = catalog.eventDefinitions[0]?.eventType ?? "trial_started";
  const definition = catalog.eventDefinitions.find((event) => event.eventType === eventType);

  return {
    name: definition ? `${definition.label} personalizado` : "Nova automacao",
    description: definition?.description ?? "",
    eventType,
    status: "draft",
    selectedAgentId: "",
    fallbackToBillingAgent: true,
    audienceType: definition?.category === "trial" ? "trial_users" : "all_clients",
    messageTemplate: eventDefaultTemplate(catalog, eventType),
    delayMinutes: "0",
    cooldownMinutes: "0",
    maxSendsPerContact: eventType === "trial_credit_milestone" ? "20" : "3",
    priority: "100",
    labelsText: definition?.category ?? "custom",
    planCodesText: "",
    minBalanceCredits: "",
    maxBalanceCredits: "",
    minUsedCredits: "",
    maxUsedCredits: "",
    milestoneStepCredits: eventType === "trial_credit_milestone" ? "100" : "",
  };
}

function buildPayload(draft: AutomationDraft, creating: boolean) {
  return {
    ...(!creating ? { id: draft.id } : {}),
    name: draft.name,
    description: draft.description,
    eventType: draft.eventType,
    channel: "whatsapp",
    status: draft.status,
    selectedAgentId: draft.selectedAgentId || null,
    fallbackToBillingAgent: draft.fallbackToBillingAgent,
    audienceType: draft.audienceType,
    conditions: buildConditions(draft),
    triggerConfig: { source: "admin_automation_center" },
    messageTemplate: draft.messageTemplate,
    delayMinutes: parseInteger(draft.delayMinutes, 0),
    cooldownMinutes: parseInteger(draft.cooldownMinutes, 0),
    maxSendsPerContact: parseInteger(draft.maxSendsPerContact, 1),
    priority: parseInteger(draft.priority, 100),
    labels: splitList(draft.labelsText),
  };
}

function renewalPolicyDraftFromCatalog(catalog: PlatformAutomationsCatalog): RenewalPolicyDraft {
  return {
    pixReminderStartDays: String(catalog.renewalPolicy.pixReminderStartDays),
    cardChargeAttemptDays: String(catalog.renewalPolicy.cardChargeAttemptDays),
    gracePeriodDays: String(catalog.renewalPolicy.gracePeriodDays),
    suspendAfterDays: String(catalog.renewalPolicy.suspendAfterDays),
    dailyWhatsAppReminders: catalog.renewalPolicy.dailyWhatsAppReminders,
    cardChargeAttemptEnabled: catalog.renewalPolicy.cardChargeAttemptEnabled,
    cardFailureUsesPixFallback: catalog.renewalPolicy.cardFailureUsesPixFallback,
    notifyResponsibleHumans: catalog.renewalPolicy.notifyResponsibleHumans,
  };
}

function buildRenewalPolicyPayload(draft: RenewalPolicyDraft) {
  return {
    pixReminderStartDays: parseInteger(draft.pixReminderStartDays, 3),
    cardChargeAttemptDays: parseInteger(draft.cardChargeAttemptDays, 3),
    gracePeriodDays: parseInteger(draft.gracePeriodDays, 3),
    suspendAfterDays: parseInteger(draft.suspendAfterDays, 3),
    dailyWhatsAppReminders: draft.dailyWhatsAppReminders,
    cardChargeAttemptEnabled: draft.cardChargeAttemptEnabled,
    cardFailureUsesPixFallback: draft.cardFailureUsesPixFallback,
    notifyResponsibleHumans: draft.notifyResponsibleHumans,
  };
}

function isRenewalPolicyDraftEqual(left: RenewalPolicyDraft, right: RenewalPolicyDraft) {
  return left.pixReminderStartDays === right.pixReminderStartDays
    && left.cardChargeAttemptDays === right.cardChargeAttemptDays
    && left.gracePeriodDays === right.gracePeriodDays
    && left.suspendAfterDays === right.suspendAfterDays
    && left.dailyWhatsAppReminders === right.dailyWhatsAppReminders
    && left.cardChargeAttemptEnabled === right.cardChargeAttemptEnabled
    && left.cardFailureUsesPixFallback === right.cardFailureUsesPixFallback
    && left.notifyResponsibleHumans === right.notifyResponsibleHumans;
}

function buildConditions(draft: AutomationDraft) {
  const conditions: Record<string, number | string[]> = {};
  const planCodes = splitList(draft.planCodesText);

  if (planCodes.length > 0) conditions.plan_codes = planCodes;
  setConditionNumber(conditions, "min_balance_credits", draft.minBalanceCredits);
  setConditionNumber(conditions, "max_balance_credits", draft.maxBalanceCredits);
  setConditionNumber(conditions, "min_used_credits", draft.minUsedCredits);
  setConditionNumber(conditions, "max_used_credits", draft.maxUsedCredits);
  setConditionNumber(conditions, "milestone_step_credits", draft.milestoneStepCredits);

  return conditions;
}

function setConditionNumber(target: Record<string, number | string[]>, key: string, value: string) {
  if (!value) return;
  target[key] = parseInteger(value, 0);
}

function readConditionNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.trunc(number)) : "";
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function onlyDigits(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function parseInteger(value: string, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function eventDefaultTemplate(catalog: PlatformAutomationsCatalog, eventType: string) {
  const flow = catalog.flows.find((item) => item.eventType === eventType);
  return flow?.messageTemplate ?? "";
}
