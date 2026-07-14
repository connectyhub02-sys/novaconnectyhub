"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCcw,
  Save,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { CredentialKind, CredentialRequirement } from "@/lib/maintenance-vault";

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

const defaultGeminiModel = "gemini-2.5-flash";
const geminiModelOptions: GeminiModelSelectOption[] = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", detail: "Padrao recomendado para atendimento rapido.", enabled: true },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", detail: "Mais raciocinio para tarefas complexas.", enabled: true },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", detail: "Opcao rapida e economica.", enabled: true },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash", detail: "Compatibilidade com fluxos antigos.", enabled: true },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro", detail: "Compatibilidade com tarefas longas.", enabled: true },
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

  const configuredFields = integrations.reduce(
    (total, int) => total + int.fields.filter((f) => Boolean(findSavedCredential(savedCredentialByField, int.id, f))).length,
    0,
  );
  const fieldTotal = integrations.reduce((total, int) => total + int.fields.length, 0);

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
      await handleTestConnection(integration.id);
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

  async function handleTestConnection(integrationId: string) {
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

  return (
    <div className="space-y-4">

      {/* Header bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
        style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
      >
        <div>
          <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>Conexões da plataforma</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Cole URL, usuario, senha ou token e salve. Campos vazios nao alteram nada.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-lg px-2.5 py-1 font-mono text-[10px]"
            style={{ background: "var(--ch-hover)", border: "1px solid var(--ch-border)", color: "var(--ch-muted)" }}
          >
            {configuredFields}/{fieldTotal} salvas
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="flex h-8 items-center gap-1.5 rounded-lg px-3 font-mono text-[10px] uppercase tracking-wide transition"
            style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)", color: "var(--ch-muted)" }}
          >
            {listStatus === "loading"
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <RefreshCcw className="h-3 w-3" />}
            Atualizar
          </button>
        </div>
      </div>

      {/* List error */}
      {listMessage && (
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <p className="text-[12px] text-rose-600">{listMessage}</p>
        </div>
      )}

      {/* Integration forms */}
      <div className="space-y-3">
        {integrations.map((integration) => {
          const savedCount = integration.fields.filter((f) =>
            Boolean(findSavedCredential(savedCredentialByField, integration.id, f)),
          ).length;
          const isSaving = savingIntegrationId === integration.id;
          const message  = messages[integration.id];
          const connectionTest = connectionTests[integration.id] ?? { status: "idle" as const };
          const fieldGridClass = getFieldGridClass(integration.fields.length);

          return (
            <form key={integration.id} onSubmit={(e) => void handleSave(e, integration)}>
              <div
                className="overflow-hidden rounded-2xl"
                style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
              >
                {/* Integration header */}
                <div
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  style={{ borderBottom: "1px solid var(--ch-border)" }}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
                        {integration.name}
                      </span>
                      <ConnectionBadge savedCount={savedCount} total={integration.fields.length} />
                      <ConnectionTestBadge test={connectionTest} />
                    </div>
                    {integration.description && (
                      <p className="mt-0.5 text-[12px] text-slate-500">{integration.description}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleTestConnection(integration.id)}
                      disabled={connectionTest.status === "testing"}
                      className="flex h-8 items-center gap-1.5 rounded-xl px-3.5 font-mono text-[10px] uppercase tracking-wide transition disabled:opacity-60"
                      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-muted)" }}
                    >
                      {connectionTest.status === "testing"
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Wifi className="h-3 w-3" />}
                      Testar conexao
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="flex h-8 items-center gap-1.5 rounded-xl px-3.5 font-mono text-[10px] uppercase tracking-wide transition disabled:opacity-60"
                      style={{
                        background: "var(--ch-accent)",
                        color:      "#fff",
                      }}
                    >
                      {isSaving
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Save className="h-3 w-3" />}
                      Salvar
                    </button>
                  </div>
                </div>

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
                            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition disabled:opacity-55"
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

                {/* Fields grid */}
                <div className={fieldGridClass}>
                  {integration.fields.map((field) => {
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
                          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">
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
                            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400">
                              {field.env}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <RequirementBadge requirement={field.requirement} />
                            <SavedBadge saved={Boolean(saved)} />
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
                                  placeholder="Ex: gemini-2.5-flash"
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
                              placeholder={getPlaceholder(field)}
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
                                autoComplete="off"
                                value={value}
                                onFocus={() => beginEdit(fieldKey, saved)}
                                onBlur={() => resetEmptyEdit(fieldKey)}
                                onChange={(e) => updateField(fieldKey, e.target.value)}
                                placeholder={getPlaceholder(field)}
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
                  })}
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
            </form>
          );
        })}
      </div>
    </div>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function ConnectionBadge({ savedCount, total }: { savedCount: number; total: number }) {
  const saved = savedCount > 0;
  return (
    <span
      className="inline-flex items-center rounded-lg px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide"
      style={saved
        ? { background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#10b981" }
        : { background: "var(--ch-hover)", border: "1px solid var(--ch-border)", color: "var(--ch-muted)" }}
    >
      {saved ? `${savedCount}/${total} salvas` : "Aguardando"}
    </span>
  );
}

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
      className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide"
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

function SavedBadge({ saved }: { saved: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide"
      style={saved
        ? { background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#10b981" }
        : { background: "var(--ch-hover)", border: "1px solid var(--ch-border)", color: "var(--ch-muted)" }}
    >
      {saved ? <CheckCircle2 className="h-2.5 w-2.5" /> : <CircleDot className="h-2.5 w-2.5" />}
      {saved ? "Salva" : "Ausente"}
    </span>
  );
}

function RequirementBadge({ requirement }: { requirement: CredentialRequirement }) {
  const styles: Record<CredentialRequirement, { bg: string; border: string; color: string }> = {
    required:    { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)",   color: "#ef4444" },
    recommended: { bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)",  color: "#f59e0b" },
    optional:    { bg: "var(--ch-hover)",         border: "var(--ch-border)",       color: "var(--ch-muted)" },
  };
  const s = styles[requirement];
  return (
    <span
      className="inline-flex items-center rounded-lg px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide"
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
          <div className="mt-3 flex flex-wrap gap-2">
            {config.items.map((item) => (
              <span
                key={item}
                className="rounded-lg px-2.5 py-1 font-mono text-[9px] uppercase tracking-wide"
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

function GeminiModelAvailabilityPanel({ models }: { models: GeminiApiModel[] }) {
  const available = models.filter((model) => model.supportsGenerateContent).length;
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
        <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--ch-muted)" }}>
          Modelos retornados pela API
        </p>
        <div className="flex flex-wrap gap-1.5">
          <span
            className="rounded-lg px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-emerald-600"
            style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}
          >
            {available} disponiveis
          </span>
          <span
            className="rounded-lg px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-rose-600"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            {unavailable} indisponiveis
          </span>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto p-2">
        <div className="grid gap-2">
          {models.map((model) => (
            <div
              key={model.id}
              className="rounded-lg px-3 py-2"
              style={model.supportsGenerateContent
                ? { background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.18)" }
                : { background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.16)" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
                    {model.displayName || model.id}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">{model.id}</p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide ${model.supportsGenerateContent ? "text-emerald-600" : "text-rose-600"}`}
                  style={model.supportsGenerateContent
                    ? { background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }
                    : { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
                >
                  {model.supportsGenerateContent
                    ? <CheckCircle2 className="h-2.5 w-2.5" />
                    : <AlertTriangle className="h-2.5 w-2.5" />}
                  {model.supportsGenerateContent ? "Disponivel" : "Indisponivel"}
                </span>
              </div>
              <p className={`mt-1 text-[10px] leading-4 ${model.supportsGenerateContent ? "text-emerald-700" : "text-rose-600"}`}>
                {model.supportsGenerateContent
                  ? "Pode ser usado como modelo global dos agentes."
                  : "Nao entra no seletor porque nao suporta generateContent para atendimento."}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">
                {[
                  formatTokenLimit(model.inputTokenLimit, "entrada"),
                  formatTokenLimit(model.outputTokenLimit, "saida"),
                  model.supportedGenerationMethods.length > 0 ? `metodos: ${model.supportedGenerationMethods.join(", ")}` : "",
                ].filter(Boolean).join(" | ")}
              </p>
            </div>
          ))}
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

  return saved ? getSavedDisplay(saved) : defaultGeminiModel;
}

function getGeminiModelSelectValue(value: string, options: GeminiModelSelectOption[]) {
  return options.some((option) => option.value === value) ? value : "custom";
}

function getGeminiModelOptions(models: GeminiApiModel[]): GeminiModelSelectOption[] {
  if (models.length === 0) {
    return geminiModelOptions;
  }

  return models.filter((model) => model.supportsGenerateContent).map((model) => {
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

function getPlaceholder(field: VaultField) {
  if (field.multiline) return "Cole uma lista separada por virgulas ou uma permissao por linha.";
  if (field.env.includes("STATUS")) return "Ex: teste, em revisao, aprovado.";
  if (field.env.includes("VERSION")) return "Ex: v23.0 ou v24.";
  if (field.kind === "endpoint")    return "Cole a URL completa, com https://.";
  if (field.env.includes("EMAIL"))  return "Digite o email da conta.";
  if (field.kind === "secret")      return "Cole a chave, senha ou token.";
  return "Digite o usuario, ID ou identificador.";
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
