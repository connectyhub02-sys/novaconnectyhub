"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCcw,
  Save,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  defaultGeminiModel,
  getGeminiModelReplacement,
} from "@/lib/gemini/models";
import type { CredentialKind, CredentialRequirement } from "@/lib/maintenance-vault";
import {
  hasOwnAccountsLink,
  integrationArea,
  maintenanceAreas,
  resolveFieldSource,
  summarizeIntegration,
  type FieldSource,
  type MaintenanceArea,
} from "@/lib/maintenance-layout";

// ─── Types ────────────────────────────────────────────────────────────────────

type VaultField = {
  label: string;
  env: string;
  aliases?: string[];
  kind: CredentialKind;
  requirement: CredentialRequirement;
  section?: string;
  multiline?: boolean;
  help?: string;
  environmentConfigured?: boolean;
  savedInVault?: boolean;
};

type VaultIntegration = {
  id: string;
  name: string;
  description?: string;
  fields: VaultField[];
};

type StoredCredential = {
  id: string;
  scope: "platform" | "organization";
  organization_id: string | null;
  integration_id: string;
  env_name: string;
  label: string;
  kind: CredentialKind;
  requirement: CredentialRequirement;
  value_preview: string;
  display_value?: string;
  configured_by: string | null;
  created_at: string;
  updated_at: string;
  catalog_status?: "active" | "obsolete";
};

type SaveMessage = { type: "success" | "error"; text: string };
type ConnectionTest = {
  status: "idle" | "testing" | "online" | "offline";
  message?: string;
  checkedAt?: string;
  httpStatus?: number;
  instanceCount?: number | null;
  model?: string;
  details?: string[];
};
type GeminiApiModel = {
  id: string;
  name: string;
  baseModelId: string | null;
  displayName: string;
  description: string;
  inputTokenLimit: number | null;
  outputTokenLimit: number | null;
  supportedGenerationMethods: string[];
  supportsGenerateContent: boolean;
};
type GeminiModelsState = {
  status: "idle" | "loading" | "loaded" | "error";
  models: GeminiApiModel[];
  message?: string;
  checkedAt?: string;
  generationModelCount?: number;
};
type GeminiModelSelectOption = {
  value: string;
  label: string;
  detail: string;
  enabled: boolean;
};

const geminiModelOptions: GeminiModelSelectOption[] = [
  { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash", detail: "Padrao recomendado para atendimento rapido.", enabled: true },
  { value: "gemini-3.7-flash", label: "Gemini 3.7 Flash", detail: "Mais capacidade para agentes e tarefas complexas.", enabled: true },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash", detail: "Opcao estavel para alto volume.", enabled: true },
  { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", detail: "Baixo custo e baixa latencia.", enabled: true },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", detail: "Raciocinio avancado em preview.", enabled: true },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function CredentialVaultForm({ integrations }: { integrations: VaultIntegration[] }) {
  const router = useRouter();
  const [values, setValues]                       = useState<Record<string, string>>({});
  const [credentials, setCredentials]             = useState<StoredCredential[]>([]);
  const [listStatus, setListStatus]               = useState<"idle" | "loading" | "error">("idle");
  const [listMessage, setListMessage]             = useState("");
  const [savingIntegrationId, setSavingIntegrationId] = useState<string | null>(null);
  const [deletingId, setDeletingId]               = useState<string | null>(null);
  const [messages, setMessages]                   = useState<Record<string, SaveMessage>>({});
  const [connectionTests, setConnectionTests]      = useState<Record<string, ConnectionTest>>({});
  const [editingFields, setEditingFields]          = useState<Record<string, boolean>>({});
  const [visibleSecrets, setVisibleSecrets]        = useState<Record<string, boolean>>({});
  const [geminiModelsState, setGeminiModelsState]  = useState<GeminiModelsState>({ status: "idle", models: [] });
  const [credentialsLoaded, setCredentialsLoaded]  = useState(false);
  const [activeArea, setActiveArea]                = useState<MaintenanceArea | "all">("all");
  const [onlyPending, setOnlyPending]              = useState(false);
  const [openIds, setOpenIds]                      = useState<Set<string>>(() => new Set());

  const savedCredentialByField = useMemo(() => {
    const map = new Map<string, StoredCredential>();
    credentials
      .filter((c) => c.catalog_status !== "obsolete")
      .forEach((c) => map.set(credKey(c.integration_id, c.env_name), c));
    return map;
  }, [credentials]);
  const geminiApiCredentialKey = useMemo(() => {
    const credential = credentials.find((item) =>
      item.integration_id === "gemini"
      && ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY"].includes(item.env_name)
      && item.catalog_status !== "obsolete",
    );

    return credential ? `${credential.id}:${credential.updated_at}` : "";
  }, [credentials]);
  const geminiSelectOptions = useMemo(
    () => geminiApiCredentialKey ? getGeminiModelOptions(geminiModelsState.models) : geminiModelOptions,
    [geminiApiCredentialKey, geminiModelsState.models],
  );


  const refreshGeminiModels = useCallback(async () => {
    setGeminiModelsState((cur) => ({ ...cur, status: "loading", message: "Carregando modelos Gemini..." }));
    const res = await fetch("/api/admin/integrations/gemini/models", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      models?: GeminiApiModel[];
      message?: string;
      error?: string;
      checkedAt?: string;
      generationModelCount?: number;
    };

    if (!res.ok) {
      setGeminiModelsState({
        status: "error",
        models: [],
        message: data.message ?? data.error ?? "Nao foi possivel carregar os modelos Gemini.",
        checkedAt: data.checkedAt,
      });
      return;
    }

    setGeminiModelsState({
      status: "loaded",
      models: data.models ?? [],
      message: data.message,
      checkedAt: data.checkedAt,
      generationModelCount: data.generationModelCount,
    });
  }, []);

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (geminiApiCredentialKey) {
      const timer = window.setTimeout(() => {
        void refreshGeminiModels();
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [geminiApiCredentialKey, refreshGeminiModels]);

  async function refresh() {
    setListStatus("loading");
    setListMessage("");
    const res  = await fetch("/api/admin/credentials", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { credentials?: StoredCredential[]; error?: string };
    if (!res.ok) {
      setListStatus("error");
      setListMessage(data.error ?? "Não foi possível carregar credenciais.");
      return;
    }
    setCredentials(data.credentials ?? []);
    setCredentialsLoaded(true);
    setListStatus("idle");
  }

  function updateField(fieldKey: string, val: string) {
    setEditingFields((cur) => ({ ...cur, [fieldKey]: true }));
    setValues((cur) => ({ ...cur, [fieldKey]: val }));
  }

  function beginEdit(fieldKey: string, saved: StoredCredential | undefined) {
    if (!saved || editingFields[fieldKey]) {
      return;
    }

    setEditingFields((cur) => ({ ...cur, [fieldKey]: true }));
    setValues((cur) => ({ ...cur, [fieldKey]: "" }));
  }

  function resetEmptyEdit(fieldKey: string) {
    if ((values[fieldKey] ?? "").trim()) {
      return;
    }

    setEditingFields((cur) => {
      const next = { ...cur };
      delete next[fieldKey];
      return next;
    });
    setValues((cur) => {
      const next = { ...cur };
      delete next[fieldKey];
      return next;
    });
  }

  function toggleSecretVisibility(fieldKey: string) {
    setVisibleSecrets((cur) => ({ ...cur, [fieldKey]: !cur[fieldKey] }));
  }

  async function handleSave(e: FormEvent<HTMLFormElement>, integration: VaultIntegration) {
    e.preventDefault();
    const fieldsToSave = integration.fields
      .map((f) => {
        const key = credKey(integration.id, f.env);
        const saved = findSavedCredential(savedCredentialByField, integration.id, f);
        const defaultValue =
          integration.id === "gemini" && f.env === "GEMINI_DEFAULT_MODEL" && !saved
            ? defaultGeminiModel
            : "";
        return {
          field: f,
          key,
          value: editingFields[key] ? values[key]?.trim() ?? "" : defaultValue,
        };
      })
      .filter((item) => item.value.length > 0);

    if (fieldsToSave.length === 0) {
      setMessages((cur) => ({ ...cur, [integration.id]: { type: "error", text: "Preencha pelo menos uma credencial antes de salvar." } }));
      return;
    }

    setSavingIntegrationId(integration.id);
    setMessages((cur) => ({ ...cur, [integration.id]: { type: "success", text: "Salvando..." } }));

    for (const { field, value } of fieldsToSave) {
      const res  = await fetch("/api/admin/credentials", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ scope: "platform", integrationId: integration.id, envName: field.env, label: field.label, value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSavingIntegrationId(null);
        setMessages((cur) => ({ ...cur, [integration.id]: { type: "error", text: data.error ?? `Não foi possível salvar ${field.label}.` } }));
        return;
      }
    }

    setValues((cur) => {
      const next = { ...cur };
      fieldsToSave.forEach(({ field }) => { delete next[credKey(integration.id, field.env)]; });
      return next;
    });
    setEditingFields((cur) => {
      const next = { ...cur };
      fieldsToSave.forEach(({ key }) => { delete next[key]; });
      return next;
    });
    setSavingIntegrationId(null);
    setMessages((cur) => ({
      ...cur,
      [integration.id]: {
        type: "success",
        text: `${fieldsToSave.length} credencial${fieldsToSave.length > 1 ? "is" : ""} salva${fieldsToSave.length > 1 ? "s" : ""}.`,
      },
    }));
    await refresh();
    router.refresh();

    if (isTestableIntegration(integration.id)) {
      await runConnectionTest(integration.id);
    }
  }

  async function handleDelete(credential: StoredCredential) {
    if (!window.confirm(`Remover "${credential.label}" do cofre? O valor criptografado será apagado.`)) return;
    setDeletingId(credential.id);
    setListMessage("");
    const res  = await fetch(`/api/admin/credentials?id=${encodeURIComponent(credential.id)}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setDeletingId(null);
    if (!res.ok) {
      setListStatus("error");
      setListMessage(data.error ?? "Não foi possível remover a credencial.");
      return;
    }
    await refresh();
    router.refresh();
  }

  async function handleTestConnection(integration: VaultIntegration) {
    const integrationId = integration.id;

    if (hasUnsavedIntegrationDraft(integration, editingFields, values)) {
      setConnectionTests((cur) => ({
        ...cur,
        [integrationId]: {
          status: "offline",
          message: "Salve as credenciais preenchidas antes de testar a conexao. O teste le apenas valores ja gravados no cofre.",
        },
      }));
      return;
    }

    await runConnectionTest(integrationId);
  }

  async function runConnectionTest(integrationId: string) {
    setConnectionTests((cur) => ({
      ...cur,
      [integrationId]: { status: "testing", message: "Testando conexao..." },
    }));

    const endpoint = getIntegrationTestEndpoint(integrationId);

    if (!endpoint) {
      setConnectionTests((cur) => ({
        ...cur,
        [integrationId]: { status: "offline", message: "Teste ainda nao implementado para esta integracao." },
      }));
      return;
    }

    const res = await fetch(endpoint, { method: "POST", cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      status?: "online" | "offline";
      message?: string;
      checkedAt?: string;
      httpStatus?: number;
      instanceCount?: number | null;
      model?: string;
      details?: string[];
      error?: string;
    };

    setConnectionTests((cur) => ({
      ...cur,
      [integrationId]: {
        status: res.ok && data.status === "online" ? "online" : "offline",
        message: data.message ?? data.error ?? (res.ok ? "Conexao validada." : "Falha no teste de conexao."),
        checkedAt: data.checkedAt,
        httpStatus: data.httpStatus,
        instanceCount: data.instanceCount,
        model: data.model,
        details: data.details,
      },
    }));
  }

  function renderField(integration: VaultIntegration, field: VaultField) {
    const saved    = findSavedCredential(savedCredentialByField, integration.id, field);
    const fieldKey = credKey(integration.id, field.env);
    const isEditing = Boolean(editingFields[fieldKey]);
    const isGeminiModelField = integration.id === "gemini" && field.env === "GEMINI_DEFAULT_MODEL";
    const isSecretVisible = Boolean(visibleSecrets[fieldKey]);
    const value = isGeminiModelField
      ? getGeminiModelValue(saved, isEditing, values[fieldKey])
      : isEditing ? values[fieldKey] ?? "" : saved ? getSavedDisplay(saved) : values[fieldKey] ?? "";
    const selectedGeminiModel = isGeminiModelField ? getGeminiModelSelectValue(value, geminiSelectOptions) : "";

    return (
      <div
        key={field.env}
        className="rounded-xl p-4"
        style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
      >
        {/* Field header */}
        {field.section && (
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {field.section}
          </p>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <label
              htmlFor={fieldKey}
              className="block text-[12.5px] font-semibold"
              style={{ color: "var(--ch-text)" }}
            >
              {field.label}
            </label>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-slate-400">
              {field.env}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <RequirementBadge requirement={field.requirement} />
            <SourceBadge source={resolveFieldSource(isSavedInVault(integration, field), Boolean(field.environmentConfigured))} requirement={field.requirement} />
          </div>
        </div>

        {isGeminiModelField ? (
          <div className="mt-3 grid gap-2">
            <select
              id={fieldKey}
              value={selectedGeminiModel}
              onChange={(e) => {
                const next = e.target.value === "custom" ? "" : e.target.value;
                updateField(fieldKey, next);
              }}
              className="h-9 w-full rounded-lg px-3 font-mono text-[11px] outline-none transition"
              style={{
                background: "var(--ch-surface)",
                border: "1px solid var(--ch-border)",
                color: "var(--ch-text)",
              }}
            >
              {geminiSelectOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={!option.enabled}>
                  {option.label} - {option.detail}
                </option>
              ))}
              <option value="custom">Modelo customizado</option>
            </select>

            {selectedGeminiModel === "custom" && (
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoComplete="off"
                  value={value}
                  onChange={(e) => updateField(fieldKey, e.target.value)}
                  placeholder="Ex: gemini-3.6-flash"
                  className="h-9 w-full rounded-lg pl-9 pr-3 font-mono text-[11px] outline-none transition"
                  style={{
                    background: "var(--ch-surface)",
                    border: "1px solid var(--ch-border)",
                    color: "var(--ch-text)",
                  }}
                />
              </div>
            )}
          </div>
        ) : field.multiline ? (
          <div className="mt-3 flex gap-2">
            <textarea
              id={fieldKey}
              autoComplete="off"
              value={value}
              onFocus={() => beginEdit(fieldKey, saved)}
              onBlur={() => resetEmptyEdit(fieldKey)}
              onChange={(e) => updateField(fieldKey, e.target.value)}
              placeholder={getPlaceholder(field, saved ? null : isSavedInVault(integration, field) ? "vault" : field.environmentConfigured ? "environment" : null)}
              rows={4}
              className="min-h-24 w-full resize-y rounded-lg px-3 py-2 font-mono text-[11px] leading-5 outline-none transition"
              style={{
                background: "var(--ch-surface)",
                border: "1px solid var(--ch-border)",
                color: "var(--ch-text)",
              }}
            />

            {saved && (
              <button
                type="button"
                aria-label={`Remover ${field.label}`}
                disabled={deletingId === saved.id}
                onClick={() => void handleDelete(saved)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition disabled:opacity-50"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}
              >
                {deletingId === saved.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                {field.kind === "secret"
                  ? <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                  : <KeyRound className="h-3.5 w-3.5 text-slate-400" />}
              </div>
              <input
                id={fieldKey}
                type={field.kind === "secret" && isSecretVisible ? "text" : getInputType(field)}
                autoComplete={getAutocomplete(field)}
                value={value}
                onFocus={() => beginEdit(fieldKey, saved)}
                onBlur={() => resetEmptyEdit(fieldKey)}
                onChange={(e) => updateField(fieldKey, e.target.value)}
                placeholder={getPlaceholder(field, saved ? null : isSavedInVault(integration, field) ? "vault" : field.environmentConfigured ? "environment" : null)}
                className={`h-9 w-full rounded-lg pl-9 font-mono text-[11px] outline-none transition ${field.kind === "secret" ? "pr-10" : "pr-3"}`}
                style={{
                  background:   "var(--ch-surface)",
                  border:       "1px solid var(--ch-border)",
                  color:        "var(--ch-text)",
                }}
              />
              {field.kind === "secret" && (
                <button
                  type="button"
                  aria-label={isSecretVisible ? `Ocultar ${field.label}` : `Mostrar ${field.label}`}
                  aria-pressed={isSecretVisible}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => toggleSecretVisibility(fieldKey)}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md transition"
                  style={{ color: "var(--ch-muted)" }}
                >
                  {isSecretVisible
                    ? <EyeOff className="h-3.5 w-3.5" />
                    : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>

            {saved && (
              <button
                type="button"
                aria-label={`Remover ${field.label}`}
                disabled={deletingId === saved.id}
                onClick={() => void handleDelete(saved)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition disabled:opacity-50"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}
              >
                {deletingId === saved.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        )}

        {/* Help */}
        <p className="mt-2 text-[11px] leading-4 text-slate-400">{field.help ?? getKindLabel(field.kind)}</p>

      </div>
    );
  }

  const isSavedInVault = (integration: VaultIntegration, field: VaultField) =>
    credentialsLoaded
      ? Boolean(findSavedCredential(savedCredentialByField, integration.id, field))
      : Boolean(field.savedInVault);
  const summaries = new Map(integrations.map((integration) => [
    integration.id,
    summarizeIntegration(integration.id, integration.fields.map((field) => ({
      requirement: field.requirement,
      source: resolveFieldSource(isSavedInVault(integration, field), Boolean(field.environmentConfigured)),
    }))),
  ]));
  const summaryOf = (integration: VaultIntegration) => summaries.get(integration.id)!;
  const counts = {
    ready: integrations.filter((integration) => summaryOf(integration).state === "ready").length,
    pending: integrations.filter((integration) => summaryOf(integration).state === "pending").length,
    standby: integrations.filter((integration) => summaryOf(integration).state === "standby").length,
  };
  const inArea = (integration: VaultIntegration) => activeArea === "all" || integrationArea(integration.id) === activeArea;
  const visible = integrations.filter((integration) => inArea(integration)
    && (!onlyPending || summaryOf(integration).state === "pending"));
  const activeVisible = visible.filter((integration) => summaryOf(integration).state !== "standby");
  const standbyVisible = visible.filter((integration) => summaryOf(integration).state === "standby");
  const pendingInArea = (area: MaintenanceArea | "all") => integrations.filter((integration) =>
    (area === "all" || integrationArea(integration.id) === area) && summaryOf(integration).state === "pending").length;

  function toggleOpen(integrationId: string) {
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(integrationId)) next.delete(integrationId); else next.add(integrationId);
      return next;
    });
  }

  function renderIntegration(integration: VaultIntegration) {
          const summary = summaryOf(integration);
          const isOpen = openIds.has(integration.id);
          const isSaving = savingIntegrationId === integration.id;
          const message  = messages[integration.id];
          const connectionTest = connectionTests[integration.id] ?? { status: "idle" as const };
          const mainFields = integration.fields.filter((field) => field.requirement !== "optional");
          const advancedFields = integration.fields.filter((field) => field.requirement === "optional");
          const fieldGridClass = getFieldGridClass(mainFields.length);
          const isMercadoPagoBilling = integration.id === "mercado-pago-billing";
          const hasMercadoPagoBillingConnection = isMercadoPagoBilling && integration.fields.some((field) =>
            field.env === "MERCADO_PAGO_BILLING_ACCESS_TOKEN"
            && Boolean(findSavedCredential(savedCredentialByField, integration.id, field)),
          );
          const panelId = `integracao-${integration.id}`;

          return (
            <form key={integration.id} id={panelId} onSubmit={(e) => void handleSave(e, integration)}>
              <div
                className="overflow-hidden rounded-xl"
                style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
              >
                {/* Integration row */}
                <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`${panelId}-corpo`}
                    onClick={() => toggleOpen(integration.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                  >
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                    />
                    <span className="truncate text-[13px] font-semibold sm:text-[14px]" style={{ color: "var(--ch-text)" }}>
                      {integration.name}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <IntegrationStateBadge summary={summary} />
                    {connectionTest.status !== "idle" && <span className="hidden sm:inline-flex"><ConnectionTestBadge test={connectionTest} /></span>}
                    <button
                      type="button"
                      onClick={() => void handleTestConnection(integration)}
                      disabled={connectionTest.status === "testing"}
                      aria-label={`Testar ${integration.name}`}
                      className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] transition disabled:opacity-60 sm:px-3"
                      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-muted)" }}
                    >
                      {connectionTest.status === "testing"
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Wifi className="h-3 w-3" />}
                      <span className="hidden sm:inline">Testar</span>
                    </button>
                  </div>
                </div>

                {connectionTest.status !== "idle" && !isOpen && connectionTest.status !== "testing" && (
                  <p className={`px-4 pb-3 text-[12px] ${connectionTest.status === "online" ? "text-emerald-600" : "text-rose-600"}`}>
                    {connectionTest.message}
                  </p>
                )}

                {isOpen && (
                <div id={`${panelId}-corpo`} style={{ borderTop: "1px solid var(--ch-border)" }}>
                {(integration.description || hasOwnAccountsLink(integration.id)) && (
                  <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
                    {integration.description && (
                      <p className="min-w-0 flex-1 basis-72 text-[12px] text-slate-500">{integration.description}</p>
                    )}
                    {hasOwnAccountsLink(integration.id) && (
                      <Link href="/admin/redes-sociais/contas" className="text-[12px] font-medium text-blue-700 hover:underline">
                        Contas da operação própria →
                      </Link>
                    )}
                  </div>
                )}

                {/* Uazapi notice */}
                {integration.id === "uazapi" && (
                  <div
                    className="mx-5 mt-4 flex items-start gap-3 rounded-xl px-4 py-3"
                    style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)" }}
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-[12px] font-semibold text-emerald-600">Uazapi simplificado</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                        Aqui ficam apenas Server URL e Admin Token. Instancia, QR Code, token do numero e webhook nascem quando o cliente conectar o WhatsApp.
                      </p>
                    </div>
                  </div>
                )}

                {integration.id === "gemini" && (
                  <div
                    className="mx-5 mt-4 rounded-xl px-4 py-3"
                    style={{ background: "rgba(6,182,212,0.07)", border: "1px solid rgba(6,182,212,0.2)" }}
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-cyan-600">LLM Global do Ecossistema</p>
                        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                          Todos os agentes usam este provider e modelo base. Os prompts continuam nos setores, agentes e fluxos de atendimento.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span
                            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-medium"
                            style={{ background: "var(--ch-surface)", border: "1px solid rgba(6,182,212,0.3)", color: "var(--ch-text)" }}
                          >
                            <CircleDot className="h-3 w-3 text-cyan-500" />
                            Google Gemini
                          </span>
                          <button
                            type="button"
                            onClick={() => void refreshGeminiModels()}
                            disabled={!geminiApiCredentialKey || geminiModelsState.status === "loading"}
                            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition disabled:opacity-55"
                            style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)", color: "var(--ch-muted)" }}
                          >
                            {geminiModelsState.status === "loading"
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <RefreshCcw className="h-3 w-3" />}
                            Atualizar modelos
                          </button>
                        </div>
                        <p className={`mt-2 text-[11px] leading-4 ${geminiModelsState.status === "error" ? "text-rose-500" : "text-slate-500"}`}>
                          {getGeminiModelsStatusText(geminiModelsState, Boolean(geminiApiCredentialKey))}
                        </p>
                        {geminiModelsState.status === "loaded" && geminiModelsState.models.length > 0 && (
                          <GeminiModelAvailabilityPanel models={geminiModelsState.models} />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {isOAuthAppIntegration(integration.id) && (
                  <OAuthAppNotice integrationId={integration.id} />
                )}

                {integration.id === "mercado-pago-billing" && (
                  <MercadoPagoBillingNotice />
                )}

                {/* Fields grid */}
                <div className={fieldGridClass}>
                  {mainFields.map((field) => renderField(integration, field))}
                </div>
                {advancedFields.length > 0 && (
                  <details className="mx-5 mb-5 rounded-xl" style={{ border: "1px solid var(--ch-border)" }}>
                    <summary className="cursor-pointer px-4 py-3 text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
                      Avançado · {advancedFields.length} campo{advancedFields.length === 1 ? "" : "s"} opciona{advancedFields.length === 1 ? "l" : "is"}
                    </summary>
                    <div className={getFieldGridClass(advancedFields.length).replace("p-5", "px-4 pb-4")}>
                      {advancedFields.map((field) => renderField(integration, field))}
                    </div>
                  </details>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2 px-5 pb-5">
                  {isMercadoPagoBilling && (
                    <a
                      href="/api/admin/billing/mercado-pago/connect"
                      className="flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[12px] font-medium transition hover:opacity-90"
                      style={{ background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.26)", color: "#059669" }}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {hasMercadoPagoBillingConnection ? "Reconectar" : "Conectar Mercado Pago"}
                    </a>
                  )}
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex h-9 items-center gap-1.5 rounded-lg px-4 text-[12px] font-semibold transition disabled:opacity-60"
                    style={{ background: "var(--ch-accent)", color: "#fff" }}
                  >
                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Salvar alterações
                  </button>
                </div>

                {connectionTest.status !== "idle" && (
                  <div
                    className="mx-5 mb-5 flex items-start gap-3 rounded-xl px-4 py-3"
                    style={connectionTest.status === "online"
                      ? { background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }
                      : { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                  >
                    {connectionTest.status === "testing"
                      ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-500" />
                      : connectionTest.status === "online"
                        ? <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        : <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />}
                    <div>
                      <p className={`text-[12px] font-semibold ${connectionTest.status === "online" ? "text-emerald-600" : "text-rose-600"}`}>
                        {getConnectionTestTitle(integration.id, connectionTest.status)}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                        {connectionTest.message}
                        {typeof connectionTest.instanceCount === "number" ? ` Instancias encontradas: ${connectionTest.instanceCount}.` : ""}
                        {connectionTest.model ? ` Modelo validado: ${connectionTest.model}.` : ""}
                      </p>
                      {connectionTest.details && connectionTest.details.length > 0 && (
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">
                          {connectionTest.details.join(" ")}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Save message */}
                {message && (
                  <div
                    className="mx-5 mb-5 flex items-start gap-3 rounded-xl px-4 py-3"
                    style={message.type === "error"
                      ? { background: "rgba(239,68,68,0.08)",  border: "1px solid rgba(239,68,68,0.2)" }
                      : { background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}
                  >
                    {message.type === "error"
                      ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                      : <CheckCircle2  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}
                    <p className={`text-[12px] ${message.type === "error" ? "text-rose-600" : "text-emerald-600"}`}>
                      {message.text}
                    </p>
                  </div>
                )}
                </div>
                )}
              </div>
            </form>
          );
  }

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryTile label="Prontas" value={counts.ready} tone="ok" />
        <SummaryTile
          label="Com pendência"
          value={counts.pending}
          tone={counts.pending > 0 ? "alert" : "ok"}
          pressed={onlyPending}
          onClick={() => setOnlyPending((cur) => !cur)}
        />
        <SummaryTile label="Em standby" value={counts.standby} tone="muted" />
      </div>

      {/* Áreas e filtros */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2"
        style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
      >
        <nav aria-label="Áreas da manutenção" className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1">
          {[{ key: "all" as const, label: "Todas" }, ...maintenanceAreas].map((area) => {
            const pending = pendingInArea(area.key);
            const active = activeArea === area.key;
            return (
              <button
                key={area.key}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveArea(area.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] transition ${active ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {area.label}
                {pending > 0 && (
                  <span className="rounded-full bg-rose-100 px-1.5 text-[11px] font-semibold text-rose-700" aria-label={`${pending} com pendência`}>
                    {pending}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[13px] text-slate-600">
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
            Só pendências
          </label>
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label="Atualizar lista de credenciais"
            className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] transition"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-muted)" }}
          >
            {listStatus === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
            Atualizar
          </button>
        </div>
      </div>

      {listMessage && (
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <p className="text-[12px] text-rose-600">{listMessage}</p>
        </div>
      )}

      <p className="text-[12px] text-slate-500">
        Clique numa integração para ver os campos. <strong>Salva aqui</strong>: guardada nesta tela, criptografada.{" "}
        <strong>No servidor</strong>: definida na configuração da VPS e já em uso. <strong>Faltando</strong>: obrigatória e não encontrada.
      </p>

      {activeVisible.length === 0 && standbyVisible.length === 0 && (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-[13px] text-slate-500">
          {onlyPending ? "Nenhuma pendência nesta área." : "Nenhuma integração nesta área."}
        </p>
      )}

      <div className="space-y-2">{activeVisible.map(renderIntegration)}</div>

      {standbyVisible.length > 0 && (
        <section aria-label="Integrações em standby" className="space-y-2 pt-2">
          <h3 className="text-[13px] font-semibold text-slate-500">Em standby · fora de operação, não contam como pendência</h3>
          {standbyVisible.map(renderIntegration)}
        </section>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  pressed,
  onClick,
}: {
  label: string;
  value: number;
  tone: "ok" | "alert" | "muted";
  pressed?: boolean;
  onClick?: () => void;
}) {
  const color = tone === "alert" ? "text-rose-600" : tone === "ok" ? "text-emerald-600" : "text-slate-500";
  const content = (
    <>
      <span className={`block text-xl font-semibold sm:text-2xl ${color}`}>{value}</span>
      <span className="block text-[12px] text-slate-500">{label}</span>
    </>
  );
  const className = "rounded-xl px-3 py-2.5 text-left sm:px-4 sm:py-3";
  const style = {
    background: "var(--ch-surface)",
    border: pressed ? "1px solid #3b82f6" : "1px solid var(--ch-border)",
  };

  return onClick
    ? <button type="button" aria-pressed={pressed} onClick={onClick} className={className} style={style}>{content}</button>
    : <div className={className} style={style}>{content}</div>;
}

function IntegrationStateBadge({ summary }: { summary: ReturnType<typeof summarizeIntegration> }) {
  const config = summary.state === "standby"
    ? { short: "Standby", label: "Standby", style: { background: "var(--ch-hover)", border: "1px solid var(--ch-border)", color: "var(--ch-muted)" } }
    : summary.state === "pending"
      ? {
          short: `Falta ${summary.missingRequired}`,
          label: `Falta${summary.missingRequired === 1 ? "" : "m"} ${summary.missingRequired} obrigatória${summary.missingRequired === 1 ? "" : "s"}`,
          style: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#dc2626" },
        }
      : {
          short: "Pronta",
          label: summary.requiredTotal > 0 ? `Pronta · ${summary.requiredConfigured}/${summary.requiredTotal}` : "Sem obrigatórias",
          style: { background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#059669" },
        };

  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-lg px-2 py-0.5 text-[12px] font-medium" style={config.style} title={config.label}>
      <span className="sm:hidden">{config.short}</span>
      <span className="hidden sm:inline">{config.label}</span>
    </span>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function ConnectionTestBadge({ test }: { test: ConnectionTest }) {
  const styles: Record<ConnectionTest["status"], { bg: string; border: string; color: string; label: string }> = {
    idle:    { bg: "var(--ch-hover)", border: "var(--ch-border)", color: "var(--ch-muted)", label: "Nao testada" },
    testing: { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.25)", color: "#3b82f6", label: "Testando" },
    online:  { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)", color: "#10b981", label: "Online" },
    offline: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", color: "#ef4444", label: "Offline" },
  };
  const style = styles[test.status];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide"
      style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.color }}
    >
      {test.status === "testing"
        ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
        : test.status === "online"
          ? <Wifi className="h-2.5 w-2.5" />
          : <WifiOff className="h-2.5 w-2.5" />}
      {style.label}
    </span>
  );
}

function SourceBadge({ source, requirement }: { source: FieldSource; requirement: CredentialRequirement }) {
  const styles: Record<FieldSource, { bg: string; border: string; color: string; label: string; title: string }> = {
    vault: {
      bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)", color: "#059669",
      label: "Salva aqui", title: "Valor salvo nesta tela, criptografado. Prevalece sobre o servidor.",
    },
    environment: {
      bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.25)", color: "#2563eb",
      label: "No servidor", title: "Definida nas variáveis de ambiente do servidor. O sistema já usa este valor; salvar aqui passa a prevalecer.",
    },
    missing: requirement === "required"
      ? { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", color: "#dc2626", label: "Faltando", title: "Obrigatória e não encontrada nesta tela nem no servidor." }
      : { bg: "var(--ch-hover)", border: "var(--ch-border)", color: "var(--ch-muted)", label: "Não preenchida", title: "Não encontrada nesta tela nem no servidor." },
  };
  const style = styles[source];

  return (
    <span
      title={style.title}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium"
      style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.color }}
    >
      {source === "missing" ? <CircleDot className="h-2.5 w-2.5" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
      {style.label}
    </span>
  );
}

function RequirementBadge({ requirement }: { requirement: CredentialRequirement }) {
  const styles: Record<CredentialRequirement, { bg: string; border: string; color: string }> = {
    required:    { bg: "var(--ch-hover)", border: "var(--ch-border)", color: "var(--ch-text)" },
    recommended: { bg: "var(--ch-hover)", border: "var(--ch-border)", color: "var(--ch-muted)" },
    optional:    { bg: "var(--ch-hover)",         border: "var(--ch-border)",       color: "var(--ch-muted)" },
  };
  const s = styles[requirement];
  return (
    <span
      className="inline-flex items-center rounded-lg px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      {getRequirementLabel(requirement)}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function OAuthAppNotice({ integrationId }: { integrationId: string }) {
  const config = integrationId === "meta"
    ? {
        title: "App oficial Meta para conexao guiada",
        text: "Aqui ficam as credenciais do app ConnectyHub. O cliente nao informa token manual: ele clica em Conectar Meta, autoriza o app e a empresa dele recebe os tokens proprios.",
        items: ["OAuth", "Marketing API", "App Review", "Webhooks"],
        tone: "amber" as const,
      }
    : {
        title: "Projeto Google para conexao guiada",
        text: "Aqui ficam Client ID, Client Secret e Developer Token da ConnectyHub. O cliente clica em Conectar Google e o refresh token nasce no callback da empresa dele.",
        items: ["OAuth", "Google Ads API", "GA4", "Search Console"],
        tone: "cyan" as const,
      };
  const styles = config.tone === "amber"
    ? { background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.22)", color: "#f59e0b" }
    : { background: "rgba(6,182,212,0.07)", border: "1px solid rgba(6,182,212,0.22)", color: "#06b6d4" };

  return (
    <div className="mx-5 mt-4 rounded-xl px-4 py-3" style={styles}>
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold" style={{ color: styles.color }}>{config.title}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{config.text}</p>
          {integrationId === "meta" && (
            <p className="mt-2 text-[11px] leading-4 text-slate-500">
              WhatsApp oficial tem configuração própria (Embedded Signup, modelos e chat). Para a revisão WhatsApp: conecte o
              número de teste, crie um modelo e registre um envio chegando ao destinatário; criação e envio exigem demonstrações
              distintas.{" "}
              <Link href="/admin/meta" className="font-medium text-blue-700 hover:underline">Abrir laboratório e chat oficial</Link>
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {config.items.map((item) => (
              <span
                key={item}
                className="rounded-lg px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide"
                style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)", color: "var(--ch-muted)" }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MercadoPagoBillingNotice() {
  return (
    <div
      className="mx-5 mt-4 rounded-xl px-4 py-3"
      style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.22)" }}
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-emerald-600">Conta recebedora por OAuth</p>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
            Use Conectar Mercado Pago para autorizar a conta da ConnectyHub. O sistema salva access token, refresh token,
            public key e modo automaticamente no cofre.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <CodeHint label="Callback OAuth" value="/api/dashboard/sales-catalog/payments/mercado-pago/callback" />
            <CodeHint label="Webhook" value="/api/webhooks/mercado-pago/platform-billing" />
          </div>
        </div>
      </div>
    </div>
  );
}

function CodeHint({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="min-w-0 rounded-lg px-3 py-2"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] text-slate-300">{value}</p>
    </div>
  );
}

function GeminiModelAvailabilityPanel({ models }: { models: GeminiApiModel[] }) {
  const available = models.filter((model) => model.supportsGenerateContent && !getGeminiModelReplacement(model.id)).length;
  const unavailable = models.length - available;

  return (
    <div
      className="mt-3 overflow-hidden rounded-xl"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid var(--ch-border)" }}
      >
        <p className="font-mono text-[11px] uppercase tracking-wide" style={{ color: "var(--ch-muted)" }}>
          Modelos retornados pela API
        </p>
        <div className="flex flex-wrap gap-1.5">
          <span
            className="rounded-lg px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-emerald-600"
            style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}
          >
            {available} disponiveis
          </span>
          <span
            className="rounded-lg px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-rose-600"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            {unavailable} indisponiveis
          </span>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto p-2">
        <div className="grid gap-2">
          {models.map((model) => {
            const replacement = getGeminiModelReplacement(model.id);
            const availableForAgents = model.supportsGenerateContent && !replacement;

            return (
            <div
              key={model.id}
              className="rounded-lg px-3 py-2"
              style={availableForAgents
                ? { background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.18)" }
                : { background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.16)" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
                    {model.displayName || model.id}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">{model.id}</p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${availableForAgents ? "text-emerald-600" : "text-rose-600"}`}
                  style={availableForAgents
                    ? { background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }
                    : { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
                >
                  {availableForAgents
                    ? <CheckCircle2 className="h-2.5 w-2.5" />
                    : <AlertTriangle className="h-2.5 w-2.5" />}
                  {availableForAgents ? "Disponivel" : replacement ? "Substituido" : "Indisponivel"}
                </span>
              </div>
              <p className={`mt-1 text-[11px] leading-4 ${availableForAgents ? "text-emerald-700" : "text-rose-600"}`}>
                {availableForAgents
                  ? "Pode ser usado como modelo global dos agentes."
                  : replacement
                    ? `Nao entra no seletor para novas chaves. Use ${replacement}.`
                    : "Nao entra no seletor porque nao suporta generateContent para atendimento."}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                {[
                  formatTokenLimit(model.inputTokenLimit, "entrada"),
                  formatTokenLimit(model.outputTokenLimit, "saida"),
                  model.supportedGenerationMethods.length > 0 ? `metodos: ${model.supportedGenerationMethods.join(", ")}` : "",
                ].filter(Boolean).join(" | ")}
              </p>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function credKey(integrationId: string, envName: string) {
  return `${integrationId}:${envName}`;
}

function findSavedCredential(
  savedCredentialByField: Map<string, StoredCredential>,
  integrationId: string,
  field: VaultField,
) {
  const envNames = [field.env, ...(field.aliases ?? [])];

  for (const envName of envNames) {
    const saved = savedCredentialByField.get(credKey(integrationId, envName));

    if (saved) {
      return saved;
    }
  }

  return undefined;
}

function isOAuthAppIntegration(integrationId: string) {
  return integrationId === "meta" || integrationId === "google-ads";
}

function getSavedDisplay(saved: StoredCredential) {
  return saved.display_value || saved.value_preview;
}

function isTestableIntegration(integrationId: string) {
  return Boolean(integrationId);
}

function getFieldGridClass(fieldCount: number) {
  if (fieldCount <= 1) {
    return "grid gap-3 p-5";
  }

  if (fieldCount === 2) {
    return "grid gap-3 p-5 lg:grid-cols-2";
  }

  return "grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3";
}

function getIntegrationTestEndpoint(integrationId: string) {
  return `/api/admin/integrations/${encodeURIComponent(integrationId)}/test`;
}

function getConnectionTestTitle(integrationId: string, status: ConnectionTest["status"]) {
  const names: Record<string, string> = {
    elevenlabs: "ElevenLabs",
    gemini: "Gemini",
    "google-ads": "Google Ads",
    inngest: "Inngest",
    meta: "Meta",
    payments: "Stripe",
    push: "VAPID",
    r2: "Cloudflare R2",
    supabase: "Supabase",
    uazapi: "Uazapi",
  };
  const name = names[integrationId] ?? "Integracao";

  if (status === "testing") {
    return `Testando conexao ${name}`;
  }

  if (status === "online") {
    return `${name} online`;
  }

  return `${name} offline`;
}

function getGeminiModelValue(saved: StoredCredential | undefined, isEditing: boolean, value: string | undefined) {
  if (isEditing) {
    return value ?? defaultGeminiModel;
  }

  const savedValue = saved ? getSavedDisplay(saved) : defaultGeminiModel;
  return getGeminiModelReplacement(savedValue) ?? savedValue;
}

function getGeminiModelSelectValue(value: string, options: GeminiModelSelectOption[]) {
  return options.some((option) => option.value === value) ? value : "custom";
}

function getGeminiModelOptions(models: GeminiApiModel[]): GeminiModelSelectOption[] {
  if (models.length === 0) {
    return geminiModelOptions;
  }

  const compatibleModels = models.filter((model) => model.supportsGenerateContent && !getGeminiModelReplacement(model.id));

  if (compatibleModels.length === 0) {
    return geminiModelOptions;
  }

  return compatibleModels.map((model) => {
    const tokenDetails = [
      "generateContent",
      formatTokenLimit(model.inputTokenLimit, "entrada"),
      formatTokenLimit(model.outputTokenLimit, "saida"),
    ].filter(Boolean);

    return {
      value: model.id,
      label: model.displayName || model.id,
      detail: tokenDetails.join(" | "),
      enabled: true,
    };
  });
}

function formatTokenLimit(limit: number | null, label: string) {
  if (!limit) {
    return "";
  }

  return `${new Intl.NumberFormat("pt-BR").format(limit)} tokens ${label}`;
}

function getGeminiModelsStatusText(state: GeminiModelsState, hasApiKey: boolean) {
  if (!hasApiKey) {
    return "Salve a API Key do Gemini para carregar automaticamente os modelos disponiveis nessa conta.";
  }

  if (state.status === "loading") {
    return "Consultando modelos disponiveis na API Gemini...";
  }

  if (state.status === "error") {
    return state.message ?? "Nao foi possivel carregar os modelos Gemini.";
  }

  if (state.status === "loaded") {
    const total = state.models.length;
    const generationTotal = state.generationModelCount ?? state.models.filter((model) => model.supportsGenerateContent).length;
    return `${total} modelo${total === 1 ? "" : "s"} encontrado${total === 1 ? "" : "s"} na API; ${generationTotal} compativel${generationTotal === 1 ? "" : "s"} com atendimento por generateContent.`;
  }

  return "Modelos padrao carregados enquanto aguardamos a consulta da API.";
}

function getInputType(field: VaultField) {
  if (field.kind === "secret") return "password";
  if (field.kind === "endpoint") return "url";
  if (field.env.includes("EMAIL")) return "email";
  return "text";
}

function getAutocomplete(field: VaultField) {
  if (field.kind === "secret") return "new-password";
  if (field.env.includes("EMAIL")) return "email";
  return "off";
}

function getPlaceholder(field: VaultField, existing: "vault" | "environment" | null = null) {
  if (existing === "vault") return "Valor salvo. Preencha só para substituir.";
  if (existing === "environment") return "Definida no servidor. Preencha só para substituir.";
  if (field.multiline) return "Cole uma lista separada por virgulas ou uma permissao por linha.";
  if (field.env.includes("STATUS")) return "Ex: teste, em revisao, aprovado.";
  if (field.env.includes("VERSION")) return "Ex: v25.0.";
  if (field.kind === "endpoint")    return "Cole a URL completa, com https://.";
  if (field.env.includes("EMAIL"))  return "Digite o email da conta.";
  if (field.kind === "secret")      return "Cole a chave, senha ou token.";
  return "Digite o usuario, ID ou identificador.";
}

function hasUnsavedIntegrationDraft(
  integration: VaultIntegration,
  editingFields: Record<string, boolean>,
  values: Record<string, string>,
) {
  return integration.fields.some((field) => {
    const fieldKey = credKey(integration.id, field.env);
    return editingFields[fieldKey] && Boolean(values[fieldKey]?.trim());
  });
}

function getKindLabel(kind: CredentialKind) {
  const labels: Record<CredentialKind, string> = {
    endpoint:   "URL",
    identifier: "Usuário ou ID",
    public:     "Chave pública",
    secret:     "Senha ou token",
  };
  return labels[kind];
}

function getRequirementLabel(requirement: CredentialRequirement) {
  const labels: Record<CredentialRequirement, string> = {
    optional:    "Opcional",
    recommended: "Recomendada",
    required:    "Obrigatória",
  };
  return labels[requirement];
}
