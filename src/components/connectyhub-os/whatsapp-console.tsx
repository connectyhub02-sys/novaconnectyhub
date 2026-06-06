"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  Bot,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  MessageCircle,
  PlugZap,
  QrCode,
  Radio,
  RefreshCcw,
  Send,
  ServerCog,
  ShieldCheck,
  Smartphone,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import {
  NeonBadge,
  Panel,
  SectionHeader,
  StatusBadge,
  toneClass,
} from "./panel-primitives";
import type { UazapiOperation } from "@/lib/uazapi/operations";
import { cn } from "@/lib/utils";

type UazapiInfo = {
  config: {
    baseUrl: string;
    hasAdminToken: boolean;
    hasInstanceToken: boolean;
    hasWebhookSecret: boolean;
    webhookUrl: string | null;
  };
  categories: string[];
  operations: UazapiOperation[];
};

type OperationResult = {
  ok?: boolean;
  status?: number;
  data?: unknown;
  error?: string;
  operation?: UazapiOperation;
};

const defaultPayload = "{}";

export function WhatsAppConsole() {
  const [info, setInfo] = useState<UazapiInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [internalKey, setInternalKey] = useState("");
  const [instanceTokenOverride, setInstanceTokenOverride] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [quickResult, setQuickResult] = useState<OperationResult | null>(null);
  const [explorerResult, setExplorerResult] = useState<OperationResult | null>(null);

  const [createName, setCreateName] = useState("connectyhub-cliente-001");
  const [connectPhone, setConnectPhone] = useState("");
  const [sendNumber, setSendNumber] = useState("");
  const [sendText, setSendText] = useState("Ola! Aqui e o agente da ConnectyHub. Como posso te ajudar hoje?");
  const [webhookUrl, setWebhookUrl] = useState("");

  const [category, setCategory] = useState("Envio");
  const [operationId, setOperationId] = useState("sendText");
  const [payloadText, setPayloadText] = useState(JSON.stringify({
    number: "5511999999999",
    text: "Mensagem enviada pela ConnectyHub",
    track_source: "connectyhub",
    track_id: "lead_001",
  }, null, 2));
  const [queryText, setQueryText] = useState(defaultPayload);

  useEffect(() => {
    let cancelled = false;

    async function loadInfo() {
      setLoadingInfo(true);
      const response = await fetch("/api/whatsapp/uazapi", { cache: "no-store" });
      const data = (await response.json()) as UazapiInfo;

      if (!cancelled) {
        setInfo(data);
        setWebhookUrl(data.config.webhookUrl ?? "");
        setLoadingInfo(false);
      }
    }

    loadInfo().catch((error: unknown) => {
      if (!cancelled) {
        setQuickResult({ ok: false, error: error instanceof Error ? error.message : "Erro ao carregar Uazapi" });
        setLoadingInfo(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const operationsByCategory = useMemo(() => {
    const operations = info?.operations ?? [];
    return operations.filter((operation) => operation.category === category);
  }, [category, info?.operations]);

  const selectedOperation = useMemo(() => {
    return info?.operations.find((operation) => operation.operationId === operationId) ?? null;
  }, [info?.operations, operationId]);

  const qrCode = findStringByKey(quickResult?.data, "qrcode");
  const pairCode = findStringByKey(quickResult?.data, "paircode");

  function updateSelectedOperation(nextOperationId: string) {
    const operation = info?.operations.find((item) => item.operationId === nextOperationId);
    setOperationId(nextOperationId);
    setPayloadText(JSON.stringify(operation?.samplePayload ?? {}, null, 2));
    setQueryText(JSON.stringify(operation?.sampleQuery ?? {}, null, 2));
  }

  async function executeQuick(operationIdToRun: string, payload?: unknown, query?: Record<string, unknown>) {
    setRunning(operationIdToRun);
    setQuickResult(null);

    try {
      setQuickResult(await executeUazapi(operationIdToRun, payload, query));
    } finally {
      setRunning(null);
    }
  }

  async function executeExplorer() {
    let payload: unknown = undefined;
    let query: Record<string, unknown> | undefined;

    try {
      payload = parseJsonBox(payloadText);
      query = parseJsonBox(queryText) as Record<string, unknown>;
    } catch (error) {
      setExplorerResult({ ok: false, error: error instanceof Error ? error.message : "JSON invalido" });
      return;
    }

    setRunning(operationId);
    setExplorerResult(null);

    try {
      setExplorerResult(await executeUazapi(operationId, payload, query));
    } finally {
      setRunning(null);
    }
  }

  async function executeUazapi(operationIdToRun: string, payload?: unknown, query?: Record<string, unknown>) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (internalKey) {
      headers["x-connectyhub-internal-key"] = internalKey;
    }

    const response = await fetch("/api/whatsapp/uazapi", {
      method: "POST",
      headers,
      body: JSON.stringify({
        operationId: operationIdToRun,
        payload,
        query,
        instanceTokenOverride: instanceTokenOverride || undefined,
      }),
    });

    const data = (await response.json()) as OperationResult;

    return {
      ...data,
      status: response.status,
    };
  }

  return (
    <>
      <SectionHeader
        eyebrow="WhatsApp / Uazapi Integration"
        title="Console operacional para conectar instancias, enviar mensagens, configurar webhooks e explorar recursos."
        description="Esta e a primeira camada real da ConnectyHub como ponte entre clientes e Uazapi. Hoje usamos tokens via ambiente; depois eles vao para Supabase por workspace."
      />

      <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <Panel
          title="Configuracao ativa"
          eyebrow="server-side tokens / seguranca"
          action={loadingInfo ? <Loader2 className="animate-spin text-sky-700" size={16} /> : <NeonBadge tone="green">API pronta</NeonBadge>}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ConfigTile icon={ServerCog} label="Base URL" value={info?.config.baseUrl ?? "carregando"} tone="cyan" />
            <ConfigTile
              icon={ShieldCheck}
              label="Admin token"
              value={info?.config.hasAdminToken ? "configurado" : "pendente"}
              tone={info?.config.hasAdminToken ? "green" : "amber"}
            />
            <ConfigTile
              icon={KeyRound}
              label="Instance token"
              value={info?.config.hasInstanceToken ? "configurado" : "pendente"}
              tone={info?.config.hasInstanceToken ? "green" : "amber"}
            />
            <ConfigTile
              icon={Webhook}
              label="Webhook secret"
              value={info?.config.hasWebhookSecret ? "configurado" : "opcional"}
              tone={info?.config.hasWebhookSecret ? "green" : "zinc"}
            />
          </div>

          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
            <label className="font-mono text-[10px] uppercase text-muted-foreground" htmlFor="internal-key">
              Chave interna ConnectyHub
            </label>
            <input
              id="internal-key"
              value={internalKey}
              onChange={(event) => setInternalKey(event.target.value)}
              placeholder="Obrigatoria se CONNECTYHUB_INTERNAL_API_KEY estiver definido"
              className="mt-2 h-10 w-full rounded-md border border-border bg-muted/40 px-3 font-mono text-xs text-foreground outline-none focus:border-cyan-400/70"
              type="password"
            />
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Use esta chave para proteger os testes em producao. Quando nao configurada, a rota aceita chamadas em modo dev.
            </p>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
            <label className="font-mono text-[10px] uppercase text-muted-foreground" htmlFor="instance-token">
              Token temporario da instancia
            </label>
            <input
              id="instance-token"
              value={instanceTokenOverride}
              onChange={(event) => setInstanceTokenOverride(event.target.value)}
              placeholder="Opcional: use para testar uma instancia recem-criada"
              className="mt-2 h-10 w-full rounded-md border border-border bg-muted/40 px-3 font-mono text-xs text-foreground outline-none focus:border-cyan-400/70"
              type="password"
            />
          </div>
        </Panel>

        <Panel title="Acoes rapidas" eyebrow="fluxo principal do WhatsApp">
          <div className="grid gap-3 lg:grid-cols-2">
            <QuickAction
              title="Listar instancias"
              description="Usa admintoken para ver todas as instancias conectadas ao servidor."
              icon={Radio}
              running={running === "listAllInstances"}
              onClick={() => executeQuick("listAllInstances")}
              tone="green"
            />
            <QuickAction
              title="Status da instancia"
              description="Consulta conexao, login, QR code, jid e dados do WhatsApp atual."
              icon={Smartphone}
              running={running === "getInstanceStatus"}
              onClick={() => executeQuick("getInstanceStatus")}
              tone="cyan"
            />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <FormBox title="Criar instancia" icon={PlugZap}>
              <input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                className="control-input"
                placeholder="Nome da instancia"
              />
              <button
                className="control-button"
                type="button"
                onClick={() => executeQuick("createInstance", { name: createName, adminField01: "connectyhub" })}
              >
                {running === "createInstance" ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
                Criar
              </button>
            </FormBox>

            <FormBox title="Conectar WhatsApp" icon={QrCode}>
              <input
                value={connectPhone}
                onChange={(event) => setConnectPhone(event.target.value)}
                className="control-input"
                placeholder="Telefone opcional: 5511999999999"
              />
              <button
                className="control-button"
                type="button"
                onClick={() => executeQuick("connectInstance", connectPhone ? { phone: connectPhone, browser: "auto" } : { browser: "auto" })}
              >
                {running === "connectInstance" ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
                Conectar
              </button>
            </FormBox>

            <FormBox title="Enviar texto" icon={MessageCircle}>
              <input
                value={sendNumber}
                onChange={(event) => setSendNumber(event.target.value)}
                className="control-input"
                placeholder="Numero: 5511999999999"
              />
              <textarea
                value={sendText}
                onChange={(event) => setSendText(event.target.value)}
                className="control-textarea min-h-24"
                placeholder="Mensagem"
              />
              <button
                className="control-button"
                type="button"
                onClick={() =>
                  executeQuick("sendText", {
                    number: sendNumber,
                    text: sendText,
                    linkPreview: true,
                    track_source: "connectyhub",
                    track_id: `manual_${Date.now()}`,
                  })
                }
              >
                {running === "sendText" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Enviar
              </button>
            </FormBox>

            <FormBox title="Configurar webhook" icon={Webhook}>
              <input
                value={webhookUrl}
                onChange={(event) => setWebhookUrl(event.target.value)}
                className="control-input"
                placeholder="https://seu-dominio.com/api/webhooks/uazapi"
              />
              <button
                className="control-button"
                type="button"
                onClick={() =>
                  executeQuick("updateWebhook", {
                    url: webhookUrl,
                    events: ["messages", "messages_update", "connection", "history"],
                    excludeMessages: ["wasSentByApi"],
                    addUrlEvents: true,
                    addUrlTypesMessages: true,
                  })
                }
              >
                {running === "updateWebhook" ? <Loader2 size={14} className="animate-spin" /> : <Webhook size={14} />}
                Salvar webhook
              </button>
            </FormBox>
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Resultado rapido" eyebrow="resposta da Uazapi">
          {qrCode ? (
            <div className="mb-4 rounded-lg border border-emerald-400/25 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase text-emerald-700">
                <QrCode size={14} />
                QR code recebido
              </div>
              <Image
                src={qrCode}
                alt="QR code de conexão do WhatsApp"
                width={260}
                height={260}
                unoptimized
                className="mt-4 max-w-[260px] rounded-md border border-border bg-white p-2"
              />
            </div>
          ) : null}

          {pairCode ? (
            <div className="mb-4 rounded-lg border border-cyan-400/25 bg-sky-50 p-4">
              <p className="font-mono text-[10px] uppercase text-sky-700">Codigo de pareamento</p>
              <strong className="mt-2 block font-mono text-2xl text-foreground">{pairCode}</strong>
            </div>
          ) : null}

          <JsonViewer result={quickResult} emptyText="Execute uma acao rapida para ver a resposta." />
        </Panel>

        <Panel
          title="Explorador de operacoes"
          eyebrow={`${info?.operations.length ?? 0} recursos mapeados da Uazapi`}
          action={<StatusBadge status="online" label="whitelist" />}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="field-label">
              Categoria
              <select
                value={category}
                onChange={(event) => {
                  const nextCategory = event.target.value;
                  const nextOperation = info?.operations.find((operation) => operation.category === nextCategory);
                  setCategory(nextCategory);
                  if (nextOperation) {
                    updateSelectedOperation(nextOperation.operationId);
                  }
                }}
                className="control-input mt-2"
              >
                {(info?.categories ?? []).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="field-label">
              Operacao
              <select
                value={operationId}
                onChange={(event) => updateSelectedOperation(event.target.value)}
                className="control-input mt-2"
              >
                {operationsByCategory.map((operation) => (
                  <option key={operation.operationId} value={operation.operationId}>
                    {operation.operationId}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedOperation ? (
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <NeonBadge tone={selectedOperation.auth === "admin" ? "green" : "cyan"}>
                  {selectedOperation.auth}
                </NeonBadge>
                <NeonBadge tone={selectedOperation.risk === "danger" ? "rose" : selectedOperation.risk === "sensitive" ? "amber" : "zinc"}>
                  {selectedOperation.method}
                </NeonBadge>
                <span className="font-mono text-[10px] text-muted-foreground">{selectedOperation.path}</span>
              </div>
              <h3 className="mt-3 text-base font-semibold text-foreground">{selectedOperation.title}</h3>
              {selectedOperation.risk === "danger" ? (
                <p className="mt-2 text-xs leading-5 text-rose-700">
                  Operacao sensivel. Use somente com aprovacao humana.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="field-label">
              Payload JSON
              <textarea
                value={payloadText}
                onChange={(event) => setPayloadText(event.target.value)}
                className="control-textarea mt-2 min-h-56"
              />
            </label>

            <label className="field-label">
              Query JSON
              <textarea
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
                className="control-textarea mt-2 min-h-56"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="control-button" type="button" onClick={executeExplorer}>
              {running === operationId ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
              Executar operacao
            </button>
            <button
              className="control-button-secondary"
              type="button"
              onClick={() => selectedOperation && navigator.clipboard.writeText(JSON.stringify(selectedOperation.samplePayload ?? {}, null, 2))}
            >
              <Copy size={14} />
              Copiar exemplo
            </button>
          </div>

          <div className="mt-4">
            <JsonViewer result={explorerResult} emptyText="Execute uma operacao para ver a resposta." />
          </div>
        </Panel>
      </div>
    </>
  );
}

function ConfigTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "green" | "cyan" | "amber" | "zinc";
}) {
  const color = toneClass(tone);
  return (
    <div className={cn("rounded-lg border bg-muted/40 p-4", color.border)}>
      <Icon size={16} className={color.text} />
      <span className="mt-3 block font-mono text-[10px] uppercase text-muted-foreground">{label}</span>
      <strong className={cn("mt-1 block truncate text-sm", color.text)}>{value}</strong>
    </div>
  );
}

function QuickAction({
  title,
  description,
  icon: Icon,
  tone,
  running,
  onClick,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: "green" | "cyan";
  running: boolean;
  onClick: () => void;
}) {
  const color = toneClass(tone);
  return (
    <button
      className={cn("rounded-lg border bg-muted/40 p-4 text-left transition hover:bg-muted/50", color.border)}
      type="button"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("grid h-9 w-9 place-items-center rounded-md border", color.border, color.bg, color.text)}>
          {running ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
        </div>
        <span className={cn("inline-flex min-h-9 items-center gap-2 rounded-md border px-3 font-mono text-[11px] font-semibold uppercase", color.border, color.bg, color.text)}>
          Executar
        </span>
      </div>
      <strong className="mt-4 block text-sm text-foreground">{title}</strong>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
    </button>
  );
}

function FormBox({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={15} className="text-sky-700" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function JsonViewer({ result, emptyText }: { result: OperationResult | null; emptyText: string }) {
  if (!result) {
    return (
      <div className="grid min-h-56 place-items-center rounded-lg border border-dashed border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase text-muted-foreground">
          {result.ok ? <CheckCircle2 size={14} className="text-emerald-700" /> : <RefreshCcw size={14} className="text-rose-700" />}
          status {result.status ?? "-"}
        </span>
        <NeonBadge tone={result.ok ? "green" : "rose"}>{result.ok ? "ok" : "erro"}</NeonBadge>
      </div>
      <pre className="max-h-[520px] overflow-auto p-4 font-mono text-[11px] leading-5 text-muted-foreground">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

function parseJsonBox(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {};
  }

  return JSON.parse(trimmed) as unknown;
}

function findStringByKey(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKey(item, key);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;

  if (typeof record[key] === "string") {
    return record[key] as string;
  }

  for (const nested of Object.values(record)) {
    const found = findStringByKey(nested, key);
    if (found) return found;
  }

  return null;
}
