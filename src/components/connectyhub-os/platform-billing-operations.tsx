"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  Coins,
  CreditCard,
  ExternalLink,
  Link2,
  MessageCircle,
  PackagePlus,
  PlugZap,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Webhook,
  X,
} from "lucide-react";
import type { PlatformBillingOperationsCatalog, PlatformBillingPaymentItem } from "@/lib/billing/platform-billing-admin";
import {
  DEFAULT_PLATFORM_BILLING_MESSAGE_TEMPLATES,
  PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS,
  PLATFORM_BILLING_MESSAGE_TEMPLATE_MAX_LENGTH,
  PLATFORM_BILLING_MESSAGE_VARIABLES,
  type PlatformBillingMessageTemplateKey,
  type PlatformBillingMessageTemplates,
} from "@/lib/billing/platform-billing-messages";
import { NeonBadge, Panel, StatusBadge, DataTable } from "./panel-primitives";

type ActionState = {
  tone: "idle" | "success" | "warning" | "error";
  message: string;
};

type OperationalCheck = {
  key: string;
  label: string;
  status: "ok" | "warning" | "error";
  detail: string;
};

type OperationalTestState = {
  tone: "idle" | "success" | "warning" | "error";
  message: string;
  checks: OperationalCheck[];
};

type SettingsDraft = {
  billingWhatsappAgentId: string;
  notificationWhatsappEnabled: boolean;
  pixAutomaticRequired: boolean;
  checkoutMode: "subscription" | "manual_review";
  billingMessageTemplates: PlatformBillingMessageTemplates;
  billingOrderBumpProductIds: string[];
};

type RefundDialogState = {
  payment: PlatformBillingPaymentItem;
  reason: string;
  notice: ActionState | null;
  completed: boolean;
};

export function PlatformBillingOperations({
  catalog,
}: {
  catalog: PlatformBillingOperationsCatalog;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"health" | "notification" | null>(null);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundDialog, setRefundDialog] = useState<RefundDialogState | null>(null);
  const [disconnectingBilling, setDisconnectingBilling] = useState(false);
  const [state, setState] = useState<ActionState>({ tone: "idle", message: "" });
  const [testState, setTestState] = useState<OperationalTestState>({ tone: "idle", message: "", checks: [] });
  const [draft, setDraft] = useState<SettingsDraft>(() => ({
    billingWhatsappAgentId: catalog.settings.billingWhatsappAgentId ?? "",
    notificationWhatsappEnabled: catalog.settings.notificationWhatsappEnabled,
    pixAutomaticRequired: catalog.settings.pixAutomaticRequired,
    checkoutMode: catalog.settings.checkoutMode,
    billingMessageTemplates: catalog.settings.billingMessageTemplates,
    billingOrderBumpProductIds: catalog.settings.billingOrderBumpProductIds,
  }));
  const selectedAgent = catalog.agents.find((agent) => agent.id === draft.billingWhatsappAgentId) ?? null;
  const connectedAgents = useMemo(() => catalog.agents.filter((agent) => agent.isConnected), [catalog.agents]);
  const testCustomers = useMemo(() => buildBillingTestCustomers(catalog), [catalog]);
  const [testOrganizationId, setTestOrganizationId] = useState(() => testCustomers[0]?.id ?? "");
  const selectedTestOrganizationId = testCustomers.some((customer) => customer.id === testOrganizationId)
    ? testOrganizationId
    : testCustomers[0]?.id ?? "";
  const activeProviderLabel = catalog.mercadoPagoConnection.providerLabel;
  const canSave =
    catalog.settings.schemaReady &&
    (!draft.notificationWhatsappEnabled || Boolean(selectedAgent?.isConnected));

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSave) {
      setState({
        tone: "error",
        message: "Escolha um agente com WhatsApp conectado para ativar notificacoes de cobranca.",
      });
      return;
    }

    setSaving(true);
    setState({ tone: "idle", message: "" });

    try {
      const response = await fetch("/api/admin/billing/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingWhatsappAgentId: draft.billingWhatsappAgentId || null,
          notificationWhatsappEnabled: draft.notificationWhatsappEnabled,
          pixAutomaticRequired: draft.pixAutomaticRequired,
          checkoutMode: draft.checkoutMode,
          billingMessageTemplates: draft.billingMessageTemplates,
          billingOrderBumpProductIds: draft.billingOrderBumpProductIds,
        }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a configuracao de cobranca.");
      }

      setState({ tone: "success", message: "Configuracao de cobranca salva." });
      router.refresh();
    } catch (error) {
      setState({
        tone: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar configuracao.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function runOperationalHealth() {
    setTesting("health");
    setTestState({ tone: "idle", message: "", checks: [] });

    try {
      const response = await fetch("/api/admin/billing/platform-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "health" }),
      });
      const data = await response.json().catch(() => null) as {
        ready?: boolean;
        checks?: OperationalCheck[];
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel checar a cobranca.");
      }

      const checks = data?.checks ?? [];
      const hasError = checks.some((check) => check.status === "error");
      const hasWarning = checks.some((check) => check.status === "warning");

      setTestState({
        tone: hasError ? "error" : hasWarning ? "warning" : "success",
        message: data?.ready
          ? "Fase 5 pronta para teste real de checkout."
          : hasError
            ? "A Fase 5 encontrou bloqueios antes do teste real."
            : "A Fase 5 esta quase pronta; revise os alertas abaixo.",
        checks,
      });
      router.refresh();
    } catch (error) {
      setTestState({
        tone: "error",
        message: error instanceof Error ? error.message : "Falha ao executar teste operacional.",
        checks: [],
      });
    } finally {
      setTesting(null);
    }
  }

  async function sendOperationalNotification() {
    if (!selectedTestOrganizationId) {
      setTestState({
        tone: "warning",
        message: "Ainda nao ha um cliente recente para receber a mensagem de teste.",
        checks: [],
      });
      return;
    }

    setTesting("notification");
    setTestState({ tone: "idle", message: "", checks: [] });

    try {
      const response = await fetch("/api/admin/billing/platform-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "notification",
          organizationId: selectedTestOrganizationId,
        }),
      });
      const data = await response.json().catch(() => null) as {
        ok?: boolean;
        result?: {
          status?: string;
          errorMessage?: string | null;
          messagePreview?: string | null;
        };
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel enviar o WhatsApp de teste.");
      }

      const status = data?.result?.status ?? "skipped";
      setTestState({
        tone: data?.ok ? "success" : status === "failed" ? "error" : "warning",
        message: data?.ok
          ? "Mensagem de teste enviada pelo agente de cobranca."
          : data?.result?.errorMessage ?? "Mensagem registrada, mas nao foi enviada. Revise agente, telefone e Uazapi.",
        checks: data?.result?.messagePreview
          ? [{
              key: "message_preview",
              label: "Previa enviada",
              status: data?.ok ? "ok" : "warning",
              detail: data.result.messagePreview,
            }]
          : [],
      });
      router.refresh();
    } catch (error) {
      setTestState({
        tone: "error",
        message: error instanceof Error ? error.message : "Falha ao enviar teste operacional.",
        checks: [],
      });
    } finally {
      setTesting(null);
    }
  }

  async function reconcileBillingRecord(input: { subscriptionId?: string | null; paymentId?: string | null }) {
    const targetId = input.subscriptionId ?? input.paymentId ?? null;

    if (!targetId) {
      setState({ tone: "error", message: `Registro sem assinatura para sincronizar com ${activeProviderLabel}.` });
      return;
    }

    setReconcilingId(targetId);
    setState({ tone: "idle", message: "" });

    try {
      const response = await fetch("/api/admin/billing/platform-reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json().catch(() => null) as {
        result?: {
          processingStatus?: string;
          reason?: string | null;
          providerStatus?: string | null;
          creditTransactionId?: string | null;
          metadata?: {
            activated?: boolean;
            alreadyGranted?: boolean;
            includedCredits?: number;
          };
        };
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? `Nao foi possivel sincronizar ${activeProviderLabel}.`);
      }

      const result = data?.result;
      const activated = result?.metadata?.activated === true;
      const alreadyGranted = result?.metadata?.alreadyGranted === true;
      const providerStatus = result?.providerStatus ?? "sem status";

      setState({
        tone: activated ? "success" : result?.processingStatus === "processed" ? "warning" : "error",
        message: activated
          ? alreadyGranted
            ? `${activeProviderLabel} retornou ${providerStatus}. Plano ja estava creditado; registros sincronizados.`
            : `${activeProviderLabel} retornou ${providerStatus}. Plano ativado e creditos liberados.`
          : result?.reason ?? `${activeProviderLabel} retornou ${providerStatus}. Ainda nao houve ativacao do plano.`,
      });
      router.refresh();
    } catch (error) {
      setState({
        tone: "error",
        message: error instanceof Error ? error.message : `Falha ao sincronizar ${activeProviderLabel}.`,
      });
    } finally {
      setReconcilingId(null);
    }
  }

  function refundBillingPayment(payment: PlatformBillingPaymentItem) {
    if (!canRefundPayment(payment)) {
      setState({ tone: "error", message: "Somente pagamentos aprovados com ID de provedor e suporte de estorno podem ser estornados por aqui." });
      return;
    }

    setState({ tone: "idle", message: "" });
    setRefundDialog({ payment, reason: "", notice: null, completed: false });
  }

  async function confirmRefundPayment() {
    if (!refundDialog) {
      return;
    }

    const payment = refundDialog.payment;
    const reason = refundDialog.reason.trim();

    if (!reason) {
      setRefundDialog((current) => current ? {
        ...current,
        notice: { tone: "warning", message: "Informe o motivo do estorno antes de confirmar." },
      } : current);
      return;
    }

    setRefundingId(payment.id);
    setState({ tone: "idle", message: "" });
    setRefundDialog((current) => current ? { ...current, notice: null } : current);

    try {
      const response = await fetch("/api/admin/billing/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: payment.id,
          reason,
        }),
      });
      const data = await response.json().catch(() => null) as {
        result?: {
          amountBrl?: number;
          reversedCredits?: number;
          uncoveredCredits?: number;
          providerSubscriptionCanceled?: boolean;
          providerSubscriptionCancelError?: string | null;
        };
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel realizar o estorno.");
      }

      const reversedCredits = data?.result?.reversedCredits ?? 0;
      const uncoveredCredits = data?.result?.uncoveredCredits ?? 0;
      const recurrenceWarning = data?.result?.providerSubscriptionCancelError
        ? ` Atencao: o estorno saiu, mas a recorrencia no Mercado Pago precisa ser revisada: ${data.result.providerSubscriptionCancelError}`
        : data?.result?.providerSubscriptionCanceled
          ? " Recorrencia Mercado Pago cancelada."
          : "";

      const tone = uncoveredCredits > 0 || data?.result?.providerSubscriptionCancelError ? "warning" : "success";
      const message = `Estorno de ${formatMoney(data?.result?.amountBrl ?? payment.amountBrl)} realizado. ${formatCredits(reversedCredits)} creditos removidos.${uncoveredCredits > 0 ? ` ${formatCredits(uncoveredCredits)} creditos ja tinham sido usados e ficaram descobertos.` : ""}${recurrenceWarning}`;

      setState({ tone, message });
      setRefundDialog((current) => current?.payment.id === payment.id ? {
        ...current,
        completed: true,
        notice: { tone, message },
      } : current);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao realizar estorno.";
      setState({
        tone: "error",
        message,
      });
      setRefundDialog((current) => current?.payment.id === payment.id ? {
        ...current,
        notice: { tone: "error", message },
      } : current);
    } finally {
      setRefundingId(null);
    }
  }

  async function disconnectMercadoPagoBilling() {
    setDisconnectingBilling(true);
    setState({ tone: "idle", message: "" });

    try {
      const response = await fetch("/api/admin/billing/mercado-pago/disconnect", {
        method: "POST",
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel desconectar Mercado Pago billing.");
      }

      setState({ tone: "success", message: "Mercado Pago da ConnectyHub desconectado da cobranca." });
      router.refresh();
    } catch (error) {
      setState({
        tone: "error",
        message: error instanceof Error ? error.message : "Falha ao desconectar Mercado Pago billing.",
      });
    } finally {
      setDisconnectingBilling(false);
    }
  }

  function updateMessageTemplate(eventType: PlatformBillingMessageTemplateKey, template: string) {
    setDraft((current) => ({
      ...current,
      billingMessageTemplates: {
        ...current.billingMessageTemplates,
        [eventType]: template,
      },
    }));
  }

  function resetMessageTemplate(eventType: PlatformBillingMessageTemplateKey) {
    setDraft((current) => ({
      ...current,
      billingMessageTemplates: {
        ...current.billingMessageTemplates,
        [eventType]: DEFAULT_PLATFORM_BILLING_MESSAGE_TEMPLATES[eventType],
      },
    }));
  }

  function toggleOrderBumpProduct(productId: string) {
    setDraft((current) => {
      const selected = current.billingOrderBumpProductIds.includes(productId);
      return {
        ...current,
        billingOrderBumpProductIds: selected
          ? current.billingOrderBumpProductIds.filter((id) => id !== productId)
          : [...current.billingOrderBumpProductIds, productId],
      };
    });
  }

  return (
    <>
      <div className="mb-4 space-y-3">
        <Panel
          title="Cobranca ConnectyHub"
          eyebrow={`${catalog.mercadoPagoConnection.providerLabel} / Assinaturas / WhatsApp`}
          tone="amber"
          compact
          collapsible
          action={
            <div className="flex flex-wrap gap-2">
              <NeonBadge tone={catalog.credentialReadiness === 100 ? "green" : "amber"}>
                {catalog.mercadoPagoConnection.providerLabel} {catalog.credentialReadiness}%
              </NeonBadge>
              <NeonBadge tone={connectedAgents.length > 0 ? "green" : "rose"}>
                {connectedAgents.length} agente{connectedAgents.length === 1 ? "" : "s"} online
              </NeonBadge>
              <NeonBadge tone={catalog.settings.pixAutomaticRequired ? "cyan" : "amber"}>
                Checkout recorrente
              </NeonBadge>
            </div>
          }
        >
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <BillingOpsMetric
            icon={PlugZap}
            label="Credenciais"
            value={`${catalog.stats.configuredCredentialFields}/${catalog.credentials.length}`}
            detail={`${catalog.mercadoPagoConnection.providerLabel} billing`}
            tone="cyan"
          />
          <BillingOpsMetric
            icon={Link2}
            label="Planos"
            value={`${catalog.stats.mappedPaidPlans}/3`}
            detail="checkout ativo"
            tone="amber"
          />
          <BillingOpsMetric
            icon={Clock3}
            label="Pendentes"
            value={String(catalog.stats.pendingPayments)}
            detail="checkouts em aberto"
            tone="violet"
          />
          <BillingOpsMetric
            icon={BellRing}
            label="Avisos"
            value={String(catalog.stats.pendingNotifications)}
            detail="fila WhatsApp"
            tone="green"
          />
        </div>

        {state.message ? (
          <div
            className="mt-3 rounded-xl px-3 py-2 text-[12px] font-medium"
            style={getActionMessageStyle(state.tone)}
          >
            {state.message}
          </div>
        ) : null}

        {catalog.warnings.length > 0 ? (
          <div
            className="mt-3 rounded-xl p-3 text-[12px] leading-5 text-amber-100"
            style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.24)" }}
          >
            {catalog.warnings.slice(0, 2).join(" ")}
          </div>
        ) : null}

        <div className="mt-3 grid gap-3 2xl:grid-cols-[380px_minmax(0,1fr)]">
          <form className="grid content-start gap-3" onSubmit={saveSettings}>
            <div
              className="rounded-xl p-3"
              style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
                    Operacao de cobranca
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                    Agente, recorrencia e notificacoes que os webhooks vao usar.
                  </p>
                </div>
                <StatusBadge
                  status={selectedAgent?.isConnected ? "online" : "warning"}
                  label={selectedAgent?.isConnected ? "agente pronto" : "sem agente"}
                />
              </div>

              {!catalog.settings.schemaReady ? (
                <WarningBox icon={<ShieldAlert className="h-4 w-4" />} title="Migration pendente">
                  Aplique a migration 0033 para salvar agente de cobranca e fila de notificacoes.
                </WarningBox>
              ) : null}

              <FieldLabel label="Agente que envia WhatsApp">
                <select
                  value={draft.billingWhatsappAgentId}
                  onChange={(event) => setDraft((current) => ({ ...current, billingWhatsappAgentId: event.target.value }))}
                  className="h-9 w-full rounded-lg px-3 text-[12px] outline-none"
                  style={inputStyle}
                >
                  <option value="">Escolha um agente conectado</option>
                  {catalog.agents.map((agent) => (
                    <option key={agent.id} value={agent.id} disabled={!agent.isConnected}>
                      {agent.name} / {agent.sectorName} / {agent.isConnected ? "conectado" : "desconectado"}
                    </option>
                  ))}
                </select>
              </FieldLabel>

              {selectedAgent ? (
                <div
                  className="grid gap-2 rounded-lg p-2 sm:grid-cols-2"
                  style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
                >
                  <MiniValue label="WhatsApp" value={selectedAgent.phoneNumber ?? "Sem numero"} />
                  <MiniValue label="Status" value={selectedAgent.whatsappStatus} />
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleRow
                  checked={draft.notificationWhatsappEnabled}
                  label="Avisar por WhatsApp"
                  text="Eventos reais de pagamento entram na fila do agente."
                  onChange={(checked) => setDraft((current) => ({ ...current, notificationWhatsappEnabled: checked }))}
                />
                <ToggleRow
                  checked={draft.pixAutomaticRequired}
                  label="Exigir recorrencia"
                  text="Checkout de assinatura, sem Pix avulso para plano."
                  onChange={(checked) => setDraft((current) => ({ ...current, pixAutomaticRequired: checked }))}
                />
              </div>

              <FieldLabel label="Modo do checkout">
                <select
                  value={draft.checkoutMode}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      checkoutMode: event.target.value === "manual_review" ? "manual_review" : "subscription",
                    }))
                  }
                  className="h-9 w-full rounded-lg px-3 text-[12px] outline-none"
                  style={inputStyle}
                >
                  <option value="subscription">Assinatura via provedor ativo</option>
                  <option value="manual_review">Revisao manual temporaria</option>
                </select>
              </FieldLabel>

              <div
                className="rounded-xl p-3"
                style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
                      Teste operacional
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">
                      Valida credenciais, agente e envio sem ativar plano ou conceder creditos.
                    </p>
                  </div>
                  <StatusBadge status={testState.tone === "success" ? "online" : testState.tone === "error" ? "critical" : "warning"} />
                </div>

                <FieldLabel label="Cliente para WhatsApp teste">
                  <select
                    value={selectedTestOrganizationId}
                    onChange={(event) => setTestOrganizationId(event.target.value)}
                    disabled={testCustomers.length === 0}
                    className="h-9 w-full rounded-lg px-3 text-[12px] outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    style={inputStyle}
                  >
                    {testCustomers.length === 0 ? (
                      <option value="">Sem cliente recente em billing</option>
                    ) : (
                      testCustomers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))
                    )}
                  </select>
                </FieldLabel>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={runOperationalHealth}
                    disabled={testing !== null}
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-lg px-2.5 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: "rgba(6,182,212,0.14)", border: "1px solid rgba(6,182,212,0.28)", color: "#67e8f9" }}
                  >
                    <Activity className="h-4 w-4" />
                    {testing === "health" ? "Checando" : "Checar Fase 5"}
                  </button>
                  <button
                    type="button"
                    onClick={sendOperationalNotification}
                    disabled={testing !== null || !selectedTestOrganizationId}
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-lg px-2.5 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.26)", color: "#86efac" }}
                  >
                    <Send className="h-4 w-4" />
                    {testing === "notification" ? "Enviando" : "Enviar WhatsApp teste"}
                  </button>
                </div>

                {testState.message ? (
                  <OperationalTestResult state={testState} />
                ) : null}
              </div>

              <MessageTemplatesEditor
                templates={draft.billingMessageTemplates}
                onChange={updateMessageTemplate}
                onReset={resetMessageTemplate}
              />

              <OrderBumpProductsEditor
                products={catalog.orderBumpProducts}
                selectedProductIds={draft.billingOrderBumpProductIds}
                onToggle={toggleOrderBumpProduct}
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={saving || !canSave}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "var(--ch-accent)", color: "#061015" }}
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Salvando" : "Salvar cobranca"}
                </button>
                <Link
                  href="/admin/whatsapp/atendimento"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-[11px] font-semibold transition hover:opacity-90"
                  style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
                >
                  <MessageCircle className="h-4 w-4" />
                  Agentes
                </Link>
              </div>
            </div>

            <div
              className="rounded-xl p-3"
              style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
                  Credenciais {catalog.mercadoPagoConnection.providerLabel}
                </p>
                <StatusBadge
                  status={catalog.mercadoPagoConnection.connected ? "online" : "warning"}
                  label={catalog.mercadoPagoConnection.connected ? "conectado" : `${catalog.credentialReadiness}%`}
                />
              </div>

              <MercadoPagoBillingConnectionCard
                connection={catalog.mercadoPagoConnection}
                disconnecting={disconnectingBilling}
                onDisconnect={disconnectMercadoPagoBilling}
              />

              <CredentialStatusGrid credentials={catalog.credentials} />

              <Link
                href="/admin/maintenance#credenciais-do-sistema"
                className="mt-2 inline-flex h-8 items-center justify-center gap-2 rounded-lg px-2.5 text-[10px] font-semibold transition hover:opacity-90"
                style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
              >
                <PlugZap className="h-4 w-4" />
                Cofre de credenciais
              </Link>
            </div>
          </form>

          <div className="grid content-start gap-3">
            <PlanMappingPanel catalog={catalog} />
            <HistoryPanels
              catalog={catalog}
              onReconcile={reconcileBillingRecord}
              onRefund={refundBillingPayment}
              reconcilingId={reconcilingId}
              refundingId={refundingId}
            />
          </div>
        </div>
        </Panel>
      </div>

      {refundDialog ? (
        <RefundConfirmationModal
          loading={refundingId === refundDialog.payment.id}
          payment={refundDialog.payment}
          reason={refundDialog.reason}
          notice={refundDialog.notice}
          completed={refundDialog.completed}
          onChangeReason={(reason) => setRefundDialog((current) => current ? { ...current, reason } : current)}
          onClose={() => {
            if (refundingId !== refundDialog.payment.id) {
              setRefundDialog(null);
            }
          }}
          onConfirm={confirmRefundPayment}
        />
      ) : null}
    </>
  );
}

function PlanMappingPanel({ catalog }: { catalog: PlatformBillingOperationsCatalog }) {
  const billingProvider = catalog.mercadoPagoConnection.provider;
  const isDirectBilling = billingProvider === "pagbank" || billingProvider === "asaas";
  const mappedLabel = isDirectBilling
    ? `${catalog.stats.mappedPaidPlans}/3 ativos`
    : `${catalog.stats.mappedPaidPlans}/3 MP`;

  return (
    <Panel
      title="Planos recorrentes"
      eyebrow="Start / Pro / Scale"
      compact
      action={<StatusBadge status={catalog.stats.mappedPaidPlans === 3 ? "online" : "warning"} label={mappedLabel} />}
    >
      <div className="grid gap-2 md:grid-cols-3">
        {catalog.plans.map((plan) => {
          const mapped = isDirectBilling
            ? plan.status === "active" && plan.monthlyPriceBrl > 0
            : Boolean(plan.mercadoPagoPreapprovalPlanId);
          const providerDetail = isDirectBilling
            ? `${catalog.mercadoPagoConnection.providerLabel} billing ativo`
            : plan.mercadoPagoPreapprovalPlanId ?? "Sem preapproval_plan_id";

          return (
            <div
              key={plan.id}
              className="rounded-xl p-3"
              style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{plan.name}</p>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{plan.planCode}</p>
                </div>
                <StatusBadge status={mapped ? "online" : "warning"} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MiniValue label="Mensal" value={formatMoney(plan.monthlyPriceBrl)} />
                <MiniValue label="Creditos" value={formatCredits(plan.includedCredits)} />
              </div>
              <p className="mt-2 truncate font-mono text-[9px] text-slate-500">
                {providerDetail}
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function MercadoPagoBillingConnectionCard({
  connection,
  disconnecting,
  onDisconnect,
}: {
  connection: PlatformBillingOperationsCatalog["mercadoPagoConnection"];
  disconnecting: boolean;
  onDisconnect: () => void;
}) {
  return (
    <div
      className="mb-2 rounded-xl p-3"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
            Conta recebedora ConnectyHub
          </p>
          <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-wider text-slate-500">
            {connection.connected
              ? `${connection.mode ?? "production"} / ${connection.accountId ?? "conta conectada"}`
              : `Configure ${connection.providerLabel} no cofre`}
          </p>
        </div>
        <StatusBadge status={connection.connected ? "online" : "warning"} label={connection.connected ? "ativa" : "pendente"} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <MiniValue label={connection.provider === "mercado_pago" ? "Callback" : "Cofre"} value={connection.redirectUrl} />
        <MiniValue label="Webhook" value={connection.webhookUrl} />
      </div>

      {connection.lastError ? (
        <div
          className="mt-3 rounded-lg px-3 py-2 text-[11px] leading-4 text-rose-200"
          style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.18)" }}
        >
          {connection.lastError}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a
          href={connection.provider === "mercado_pago" ? "/api/admin/billing/mercado-pago/connect" : "/admin/maintenance#credenciais-do-sistema"}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[10px] font-bold transition hover:opacity-90"
          style={{ background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.26)", color: "#86efac" }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {connection.provider === "mercado_pago"
            ? connection.connected ? "Reconectar" : "Conectar Mercado Pago"
            : `Abrir cofre ${connection.providerLabel}`}
        </a>

        {connection.provider === "mercado_pago" && connection.connected ? (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={disconnecting}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.22)", color: "#fda4af" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${disconnecting ? "animate-spin" : ""}`} />
            {disconnecting ? "Desconectando" : "Desconectar"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CredentialStatusGrid({
  credentials,
}: {
  credentials: PlatformBillingOperationsCatalog["credentials"];
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {credentials.map((field) => (
        <div
          key={field.env}
          className="min-w-0 rounded-lg px-2 py-2"
          style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] font-semibold" style={{ color: "var(--ch-text)" }}>
              {shortCredentialLabel(field.label)}
            </p>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: field.configured ? "#10b981" : field.requirement === "required" ? "#fb7185" : "#f59e0b" }}
            />
          </div>
          <p className="mt-1 truncate font-mono text-[8px] uppercase tracking-wide text-slate-500">
            {field.configured ? field.displayValue : field.requirement === "required" ? "obrigatorio" : "opcional"}
          </p>
        </div>
      ))}
    </div>
  );
}

function HistoryPanels({
  catalog,
  onReconcile,
  onRefund,
  reconcilingId,
  refundingId,
}: {
  catalog: PlatformBillingOperationsCatalog;
  onReconcile: (input: { subscriptionId?: string | null; paymentId?: string | null }) => void;
  onRefund: (payment: PlatformBillingPaymentItem) => void;
  reconcilingId: string | null;
  refundingId: string | null;
}) {
  return (
    <div className="grid gap-3">
      <Panel
        title="Checkout e pagamentos"
        eyebrow="intencoes / webhooks"
        compact
        action={<StatusBadge status={catalog.stats.pendingPayments > 0 ? "warning" : "online"} label={`${catalog.stats.pendingPayments} pendentes`} />}
      >
        {catalog.payments.length > 0 ? (
          <DataTable
            columns={["Cliente", "Plano", "Status", "Valor", "Criado", "Acao"]}
            rows={catalog.payments.map((payment) => [
              <strong key="org" style={{ color: "var(--ch-text)" }}>{payment.organizationName}</strong>,
              <span key="plan" className="font-mono text-slate-300">{payment.planCode ?? "-"}</span>,
              <PaymentStatus key="status" status={payment.status} />,
              <span key="amount" className="font-mono text-slate-300">{formatMoney(payment.amountBrl)}</span>,
              <span key="created" className="font-mono text-slate-500">{formatDate(payment.createdAt)}</span>,
              <BillingSyncActions
                key="actions"
                checkoutUrl={payment.checkoutUrl}
                disabled={!payment.subscriptionId || !canReconcileStatus(payment.status)}
                loading={Boolean(payment.subscriptionId && reconcilingId === payment.subscriptionId)}
                onReconcile={() => onReconcile({ subscriptionId: payment.subscriptionId, paymentId: payment.id })}
                refundDisabled={!canRefundPayment(payment)}
                refundLoading={refundingId === payment.id}
                onRefund={() => onRefund(payment)}
              />,
            ])}
          />
        ) : (
          <EmptyState icon={<ReceiptText className="h-4 w-4" />} text="Nenhuma intencao de pagamento registrada ainda." />
        )}
      </Panel>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          title="Assinaturas ativas"
          eyebrow="recorrencia confirmada"
          compact
          action={<StatusBadge status={catalog.stats.activeSubscriptions > 0 ? "online" : "idle"} label={`${catalog.stats.activeSubscriptions} ativas`} />}
        >
          {catalog.subscriptions.length > 0 ? (
            <DataTable
              columns={["Cliente", "Plano", "Status", "Prox. cobranca", "Acao"]}
              rows={catalog.subscriptions.map((subscription) => [
                <strong key="org" style={{ color: "var(--ch-text)" }}>{subscription.organizationName}</strong>,
                <span key="plan" className="font-mono text-slate-300">{subscription.planCode}</span>,
                <PaymentStatus key="status" status={subscription.status} />,
                <span key="next" className="font-mono text-slate-500">{formatDate(subscription.nextBillingAt ?? subscription.currentPeriodEnd)}</span>,
                <BillingSyncActions
                  key="actions"
                checkoutUrl={subscription.checkoutUrl}
                disabled={!subscription.providerSubscriptionId || !canReconcileStatus(subscription.status)}
                loading={reconcilingId === subscription.id}
                onReconcile={() => onReconcile({ subscriptionId: subscription.id })}
                refundDisabled
                refundLoading={false}
              />,
            ])}
          />
          ) : (
            <EmptyState icon={<CreditCard className="h-4 w-4" />} text="Sem assinaturas ativas ou recorrencias confirmadas." />
          )}
        </Panel>

        <Panel
          title="Notificacoes WhatsApp"
          eyebrow="fila do agente"
          compact
          action={<StatusBadge status={catalog.notificationsSchemaReady ? "online" : "warning"} label={catalog.notificationsSchemaReady ? "fila pronta" : "SQL pendente"} />}
        >
          {catalog.notifications.length > 0 ? (
            <DataTable
              columns={["Evento", "Cliente", "Status", "Agente"]}
              rows={catalog.notifications.map((notification) => [
                <span key="event" className="font-mono text-slate-300">{notification.eventType}</span>,
                <strong key="org" style={{ color: "var(--ch-text)" }}>{notification.organizationName}</strong>,
                <PaymentStatus key="status" status={notification.status} />,
                <span key="agent" className="text-slate-500">{notification.agentName ?? "-"}</span>,
              ])}
            />
          ) : (
            <EmptyState icon={<MessageCircle className="h-4 w-4" />} text="Sem mensagens de cobranca na fila." />
          )}
        </Panel>
      </div>

      <Panel
        title={`Eventos ${catalog.mercadoPagoConnection.providerLabel}`}
        eyebrow="endpoint / webhook"
        compact
        action={<StatusBadge status={catalog.stats.receivedWebhooks > 0 ? "online" : "idle"} label={`${catalog.stats.receivedWebhooks} recebidos`} />}
      >
        {catalog.webhookEvents.length > 0 ? (
          <DataTable
            columns={["Evento", "Acao", "Status", "Recebido"]}
            rows={catalog.webhookEvents.map((event) => [
              <span key="event" className="font-mono text-slate-300">{event.eventType ?? "-"}</span>,
              <span key="action" className="font-mono text-slate-500">{event.action ?? "-"}</span>,
              <PaymentStatus key="status" status={event.processingStatus ?? "received"} />,
              <span key="created" className="font-mono text-slate-500">{formatDate(event.createdAt)}</span>,
            ])}
          />
        ) : (
          <EmptyState icon={<Webhook className="h-4 w-4" />} text="Nenhum webhook de billing recebido." />
        )}
      </Panel>
    </div>
  );
}

function RefundConfirmationModal({
  payment,
  reason,
  loading,
  notice,
  completed,
  onChangeReason,
  onClose,
  onConfirm,
}: {
  payment: PlatformBillingPaymentItem;
  reason: string;
  loading: boolean;
  notice: ActionState | null;
  completed: boolean;
  onChangeReason: (reason: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const canConfirm = reason.trim().length > 0 && !loading && !completed;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (canConfirm) {
      onConfirm();
    }
  }

  return (
    <div
      aria-labelledby="billing-refund-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/72 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
      role="dialog"
      tabIndex={0}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-xl overflow-hidden rounded-2xl border shadow-2xl shadow-black/50"
        style={{ background: "var(--ch-panel)", borderColor: "var(--ch-border-strong)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-start justify-between gap-4 border-b px-5 py-4"
          style={{ borderColor: "var(--ch-border)" }}
        >
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-rose-300">estorno mercado pago</p>
            <h2 id="billing-refund-title" className="mt-1 text-[20px] font-black text-white">Confirmar estorno</h2>
            <p className="mt-1 text-[12px] leading-5 text-slate-400">
              Esta acao estorna o pagamento, cancela a recorrencia e remove os creditos do plano quando houver saldo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ borderColor: "var(--ch-border)" }}
            aria-label="Fechar estorno"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <RefundSummaryStat label="Cliente" value={payment.organizationName} />
            <RefundSummaryStat label="Plano" value={payment.planCode ?? "sem plano"} />
            <RefundSummaryStat label="Valor" value={formatMoney(payment.amountBrl)} accent />
          </div>

          <div
            className="rounded-xl border p-3 text-[12px] leading-5 text-amber-100"
            style={{ background: "rgba(245,158,11,0.10)", borderColor: "rgba(245,158,11,0.28)" }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
              <p>
                Confira antes de confirmar. O pagamento {payment.providerPaymentId ? `MP ${payment.providerPaymentId}` : "sem ID MP"} sera estornado e o plano do cliente ficara cancelado ate uma nova compra.
              </p>
            </div>
          </div>

          <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2" style={{ borderColor: "var(--ch-border)" }}>
            <MiniValue label="Status" value={formatStatus(payment.status)} />
            <MiniValue label="Pago em" value={formatDate(payment.paidAt)} />
          </div>

          <FieldLabel label="Motivo do estorno">
            <textarea
              autoFocus
              disabled={loading || completed}
              value={reason}
              onChange={(event) => onChangeReason(event.target.value)}
              placeholder="Ex: teste interno, solicitacao do cliente, cobranca indevida..."
              className="min-h-24 w-full resize-y rounded-xl px-3 py-3 text-[12px] leading-5 outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
              style={inputStyle}
            />
          </FieldLabel>

          {notice?.message ? (
            <div
              className="rounded-xl px-3 py-3 text-[12px] font-medium leading-5"
              style={getActionMessageStyle(notice.tone)}
            >
              <div className="flex items-start gap-2">
                {completed ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{notice.message}</span>
              </div>
            </div>
          ) : null}
        </div>

        <div
          className={`grid gap-2 border-t px-5 py-4 ${completed ? "" : "sm:grid-cols-[1fr_auto]"}`}
          style={{ borderColor: "var(--ch-border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="min-h-11 rounded-xl border px-4 text-[12px] font-bold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: "var(--ch-border)" }}
          >
            {completed ? "Fechar" : "Cancelar"}
          </button>
          {!completed ? (
            <button
              type="submit"
              disabled={!canConfirm}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-black transition disabled:cursor-not-allowed disabled:opacity-45"
              style={{ background: "rgba(244,63,94,0.92)", color: "#fff" }}
            >
              <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Estornando" : `Estornar ${formatMoney(payment.amountBrl)}`}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function RefundSummaryStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="min-w-0 rounded-xl border p-3"
      style={{ background: accent ? "rgba(244,63,94,0.10)" : "var(--ch-surface-2)", borderColor: accent ? "rgba(244,63,94,0.24)" : "var(--ch-border)" }}
    >
      <p className="font-mono text-[8px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 truncate font-mono text-[12px] font-black ${accent ? "text-rose-100" : "text-slate-100"}`}>{value}</p>
    </div>
  );
}

function BillingOpsMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  detail: string;
  tone: "green" | "cyan" | "amber" | "violet";
}) {
  const color = tone === "green" ? "#10b981" : tone === "cyan" ? "#06b6d4" : tone === "amber" ? "#f59e0b" : "#8b5cf6";

  return (
    <div
      className="min-w-0 rounded-xl p-3"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <div className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:flex" style={{ background: `${color}18`, color }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 truncate font-mono text-[20px] font-bold leading-none" style={{ color: "var(--ch-text)" }}>
        {value}
      </p>
      <p className="mt-1 truncate text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({
  checked,
  label,
  text,
  onChange,
}: {
  checked: boolean;
  label: string;
  text: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-start gap-2 rounded-lg p-2.5"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="block text-[11px] font-semibold" style={{ color: "var(--ch-text)" }}>{label}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{text}</span>
      </span>
    </label>
  );
}

function WarningBox({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className="mb-3 rounded-xl p-3 text-[12px] leading-5 text-amber-100"
      style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.24)" }}
    >
      <div className="mb-1 flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function OperationalTestResult({ state }: { state: OperationalTestState }) {
  const style = getOperationalResultStyle(state.tone);

  return (
    <div className="mt-3 rounded-lg p-2.5 text-[12px] leading-5" style={style}>
      <p className="font-semibold">{state.message}</p>
      {state.checks.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {state.checks.map((check) => (
            <div key={check.key} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold" style={{ color: "var(--ch-text)" }}>{check.label}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{check.detail}</p>
              </div>
              <StatusBadge
                status={check.status === "ok" ? "online" : check.status === "error" ? "critical" : "warning"}
                label={check.status === "ok" ? "ok" : check.status === "error" ? "erro" : "atencao"}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MessageTemplatesEditor({
  templates,
  onChange,
  onReset,
}: {
  templates: PlatformBillingMessageTemplates;
  onChange: (eventType: PlatformBillingMessageTemplateKey, template: string) => void;
  onReset: (eventType: PlatformBillingMessageTemplateKey) => void;
}) {
  return (
    <details
      className="rounded-xl"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
            Mensagens automaticas
          </span>
          <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
            Textos enviados pelo agente em cada evento de assinatura.
          </span>
        </span>
        <StatusBadge status="online" label={`${PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS.length} eventos`} />
      </summary>

      <div className="grid gap-2 border-t border-white/10 p-3">
        <div
          className="rounded-lg px-2.5 py-2 text-[10px] leading-4 text-slate-500"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          Variaveis: {PLATFORM_BILLING_MESSAGE_VARIABLES.join(" ")}
        </div>

        {PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS.map((definition) => (
          <details
            key={definition.eventType}
            className="rounded-lg"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
          >
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-3 py-2.5 marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold" style={{ color: "var(--ch-text)" }}>
                  {definition.label}
                </span>
                <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">
                  {definition.description}
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-white/10 px-2 py-1 font-mono text-[9px] uppercase text-slate-500">
                {templates[definition.eventType].length}/{PLATFORM_BILLING_MESSAGE_TEMPLATE_MAX_LENGTH}
              </span>
            </summary>

            <div className="grid gap-2 border-t border-white/10 p-3">
              <textarea
                value={templates[definition.eventType]}
                onChange={(event) => onChange(definition.eventType, event.target.value)}
                maxLength={PLATFORM_BILLING_MESSAGE_TEMPLATE_MAX_LENGTH}
                rows={4}
                className="min-h-24 w-full resize-y rounded-lg px-3 py-2 text-[12px] leading-5 outline-none"
                style={inputStyle}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] leading-4 text-slate-500">
                  Evento: <span className="font-mono text-slate-400">{definition.eventType}</span>
                </p>
                <button
                  type="button"
                  onClick={() => onReset(definition.eventType)}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[10px] font-bold transition hover:opacity-90"
                  style={{ background: "rgba(148,163,184,0.10)", border: "1px solid rgba(148,163,184,0.22)", color: "#cbd5e1" }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Padrao
                </button>
              </div>
            </div>
          </details>
        ))}
      </div>
    </details>
  );
}

function OrderBumpProductsEditor({
  products,
  selectedProductIds,
  onToggle,
}: {
  products: PlatformBillingOperationsCatalog["orderBumpProducts"];
  selectedProductIds: string[];
  onToggle: (productId: string) => void;
}) {
  const selectedCount = products.filter((product) => selectedProductIds.includes(product.id) && product.available).length;

  return (
    <details
      className="rounded-xl"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
            <PackagePlus className="h-4 w-4 text-emerald-300" />
            Aumentos de carrinho do checkout
          </span>
          <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
            Produtos internos do Produtos CH que aparecem como aumento de carrinho.
          </span>
        </span>
        <StatusBadge status={selectedCount > 0 ? "online" : "warning"} label={`${selectedCount} ativos`} />
      </summary>

      <div className="grid gap-2 border-t border-white/10 p-3">
        {products.length > 0 ? (
          products.map((product) => {
            const checked = selectedProductIds.includes(product.id);
            const availabilityLabel = getOrderBumpAvailabilityLabel(product);

            return (
              <label
                key={product.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg p-3"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!product.available && !checked}
                  onChange={() => onToggle(product.id)}
                  className="mt-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold" style={{ color: "var(--ch-text)" }}>
                      {product.name}
                    </span>
                    <StatusBadge
                      status={product.available ? "online" : "warning"}
                      label={availabilityLabel}
                    />
                  </span>
                  <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                    {product.description}
                  </span>
                  <span className="mt-1 block font-mono text-[9px] uppercase tracking-wide text-slate-500">
                    {product.productCode}
                    {product.creditAmount ? ` / ${formatCredits(product.creditAmount)} creditos` : ""}
                    {product.billingCycle === "recurring" ? " / recorrente" : " / unico"}
                  </span>
                </span>
              </label>
            );
          })
        ) : (
          <EmptyState
            icon={<PackagePlus className="h-4 w-4" />}
            text="Nenhum produto interno encontrado. Cadastre em Produtos CH com origem ConnectyHub e canal venda direta."
          />
        )}
      </div>
    </details>
  );
}

function getOrderBumpAvailabilityLabel(product: PlatformBillingOperationsCatalog["orderBumpProducts"][number]) {
  if (product.available) return product.priceLabel;
  if (product.billingCycle === "recurring") return "recorrente";
  if (product.status === "active") return "sem preco";
  return product.status;
}

function MiniValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[8px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] font-semibold" style={{ color: "var(--ch-text)" }}>{value}</p>
    </div>
  );
}

function PaymentStatus({ status }: { status: string }) {
  const tone = getStatusTone(status);

  return <StatusBadge status={tone} label={formatStatus(status)} />;
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div
      className="flex min-h-16 items-center gap-3 rounded-xl p-3 text-[12px] leading-5 text-slate-500"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: "var(--ch-surface)", color: "var(--ch-accent)" }}>
        {icon}
      </div>
      {text}
    </div>
  );
}

function BillingSyncActions({
  checkoutUrl,
  disabled,
  loading,
  onReconcile,
  refundDisabled = true,
  refundLoading = false,
  onRefund,
}: {
  checkoutUrl: string | null;
  disabled: boolean;
  loading: boolean;
  onReconcile: () => void;
  refundDisabled?: boolean;
  refundLoading?: boolean;
  onRefund?: () => void;
}) {
  return (
    <div className={`flex ${onRefund ? "min-w-[190px]" : "min-w-[150px]"} flex-wrap items-center gap-1.5`}>
      {checkoutUrl ? (
        <a
          href={checkoutUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[10px] font-bold transition hover:opacity-90"
          style={{ background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.25)", color: "#67e8f9" }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Checkout
        </a>
      ) : null}
      <button
        type="button"
        onClick={onReconcile}
        disabled={disabled || loading}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-45"
        style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.24)", color: "#86efac" }}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Sync" : "Sincronizar"}
      </button>
      {onRefund ? (
        <button
          type="button"
          onClick={onRefund}
          disabled={refundDisabled || refundLoading}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-45"
          style={{ background: "rgba(244,63,94,0.10)", border: "1px solid rgba(244,63,94,0.26)", color: "#fda4af" }}
        >
          <RotateCcw className={`h-3.5 w-3.5 ${refundLoading ? "animate-spin" : ""}`} />
          {refundLoading ? "Estornando" : "Estornar"}
        </button>
      ) : null}
    </div>
  );
}

function buildBillingTestCustomers(catalog: PlatformBillingOperationsCatalog) {
  const map = new Map<string, string>();
  const add = (id: string | null | undefined, name: string | null | undefined, context: string) => {
    if (!id || map.has(id)) {
      return;
    }

    map.set(id, `${name?.trim() || "Cliente"} / ${context}`);
  };

  for (const payment of catalog.payments) {
    add(payment.organizationId, payment.organizationName, `pagamento ${payment.status}`);
  }

  for (const subscription of catalog.subscriptions) {
    add(subscription.organizationId, subscription.organizationName, `assinatura ${subscription.status}`);
  }

  for (const notification of catalog.notifications) {
    add(notification.organizationId, notification.organizationName, `notificacao ${notification.status}`);
  }

  for (const customer of catalog.testCustomers) {
    add(customer.id, customer.name, "cliente recente");
  }

  return Array.from(map, ([id, name]) => ({ id, name }));
}

const inputStyle = {
  background: "var(--ch-surface)",
  border: "1px solid var(--ch-border)",
  color: "var(--ch-text)",
};

function canReconcileStatus(status: string) {
  return ["pending", "in_process", "incomplete", "past_due"].includes(status);
}

function canRefundPayment(payment: PlatformBillingPaymentItem) {
  return payment.status === "approved"
    && Boolean(payment.providerPaymentId)
    && payment.amountBrl > 0;
}

function getActionMessageStyle(tone: ActionState["tone"]) {
  if (tone === "success") {
    return {
      background: "rgba(16,185,129,0.10)",
      border: "1px solid rgba(16,185,129,0.24)",
      color: "#86efac",
    };
  }

  if (tone === "warning") {
    return {
      background: "rgba(245,158,11,0.10)",
      border: "1px solid rgba(245,158,11,0.24)",
      color: "#fde68a",
    };
  }

  return {
    background: "rgba(244,63,94,0.08)",
    border: "1px solid rgba(244,63,94,0.22)",
    color: "#fda4af",
  };
}

function getOperationalResultStyle(tone: OperationalTestState["tone"]) {
  if (tone === "success") {
    return {
      background: "rgba(16,185,129,0.10)",
      border: "1px solid rgba(16,185,129,0.24)",
      color: "#86efac",
    };
  }

  if (tone === "warning") {
    return {
      background: "rgba(245,158,11,0.10)",
      border: "1px solid rgba(245,158,11,0.24)",
      color: "#fde68a",
    };
  }

  return {
    background: "rgba(244,63,94,0.08)",
    border: "1px solid rgba(244,63,94,0.22)",
    color: "#fda4af",
  };
}

function getStatusTone(status: string) {
  if (["approved", "active", "paid", "sent", "received"].includes(status)) {
    return "online";
  }

  if (["pending", "in_process", "past_due", "incomplete"].includes(status)) {
    return "warning";
  }

  if (["rejected", "failed", "canceled", "cancelled", "refunded"].includes(status)) {
    return "critical";
  }

  return "idle";
}

function formatStatus(value: string) {
  const labels: Record<string, string> = {
    approved: "aprovado",
    active: "ativa",
    paid: "pago",
    sent: "enviado",
    received: "recebido",
    pending: "pendente",
    in_process: "processando",
    past_due: "em atraso",
    incomplete: "incompleta",
    rejected: "recusado",
    failed: "falhou",
    canceled: "cancelado",
    cancelled: "cancelado",
    refunded: "estornado",
    skipped: "ignorado",
  };

  return labels[value] ?? value;
}

function shortCredentialLabel(label: string) {
  return label
    .replace("ConnectyHub", "CH")
    .replace("Expiracao do token billing", "Expiracao token")
    .replace("Webhook secret billing", "Webhook secret")
    .replace("Webhook billing", "Webhook")
    .replace("Modo cobranca", "Modo");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
