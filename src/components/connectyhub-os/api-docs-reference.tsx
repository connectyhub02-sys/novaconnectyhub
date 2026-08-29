"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Code2,
  Copy,
  Database,
  Eye,
  EyeOff,
  FileJson,
  History,
  KeyRound,
  Loader2,
  type LucideIcon,
  Play,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Terminal,
  Webhook,
  XCircle,
} from "lucide-react";
import type {
  ApiDocEndpoint,
  ApiDocField,
  ApiDocGroup,
  ApiDocsCatalog,
  ApiDocSchema,
} from "@/lib/connectyhub-api/docs-catalog";

type SelectedDoc =
  | { type: "overview" }
  | { type: "tag"; name: string }
  | { type: "endpoint"; id: string }
  | { type: "schema"; name: string };

type SideTab = "try" | "code";

type TryResult = {
  at: string;
  body: string;
  durationMs: number;
  error?: string;
  headers: Record<string, string>;
  ok: boolean;
  status: number | null;
  statusText: string;
  url: string;
};

type TryHistoryItem = {
  at: string;
  durationMs: number;
  id: string;
  ok: boolean;
  path: string;
  status: string;
};

type RequestUrlResult =
  | { ok: true; url: string }
  | { error: string; ok: false; url: string };

type ParsedBodyResult =
  | { body: string | null; ok: true }
  | { error: string; ok: false };

export function ApiDocsReference({ catalog }: { catalog: ApiDocsCatalog }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedDoc>({ type: "overview" });
  const [sideTab, setSideTab] = useState<SideTab>("try");
  const [baseUrl, setBaseUrl] = useState(() => catalog.baseUrl);
  const [apiToken, setApiToken] = useState("");
  const [openGroups, setOpenGroups] = useState<string[]>(() => catalog.groups.slice(0, 5).map((group) => group.name));

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return catalog.groups;

    return catalog.groups
      .map((group) => ({
        ...group,
        endpoints: group.endpoints.filter((endpoint) => endpointMatches(endpoint, normalizedQuery)),
      }))
      .filter((group) => group.endpoints.length > 0 || group.name.toLowerCase().includes(normalizedQuery));
  }, [catalog.groups, normalizedQuery]);

  const selectedEndpoint = useMemo(() => {
    if (selected.type !== "endpoint") return null;
    return catalog.groups.flatMap((group) => group.endpoints).find((endpoint) => endpoint.id === selected.id) ?? null;
  }, [catalog.groups, selected]);

  const selectedGroup = useMemo(() => {
    if (selected.type !== "tag") return null;
    return catalog.groups.find((group) => group.name === selected.name) ?? null;
  }, [catalog.groups, selected]);

  const selectedSchema = useMemo(() => {
    if (selected.type !== "schema") return null;
    return catalog.schemas.find((schema) => schema.name === selected.name) ?? null;
  }, [catalog.schemas, selected]);

  function toggleGroup(name: string) {
    setOpenGroups((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  }

  return (
    <section id="referencia" className="border-t border-white/10 bg-[#05070a] pt-20">
      <div className="mx-auto grid max-w-[1760px] gap-0 px-4 py-6 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-8 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:border-r lg:border-white/10 lg:pr-5">
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              placeholder="Buscar docs, endpoints, schemas"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <button
            className={`mb-3 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-bold transition ${selected.type === "overview" ? "bg-cyan-400/15 text-cyan-100" : "text-slate-300 hover:bg-white/[0.04] hover:text-white"}`}
            type="button"
            onClick={() => setSelected({ type: "overview" })}
          >
            <BookOpen className="h-4 w-4" />
            Overview
          </button>

          <div className="mb-3 rounded-lg border border-emerald-400/15 bg-emerald-400/5 p-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Endpoints" value={catalog.stats.endpoints} />
              <MiniStat label="Grupos" value={catalog.stats.groups} />
              <MiniStat label="Schemas" value={catalog.stats.schemas} />
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between px-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Endpoints</p>
            <span className="font-mono text-[10px] text-slate-500">{catalog.stats.endpoints}</span>
          </div>

          <nav className="space-y-1">
            {filteredGroups.map((group) => {
              const isOpen = normalizedQuery ? true : openGroups.includes(group.name);
              return (
                <div key={group.name}>
                  <button
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${selected.type === "tag" && selected.name === group.name ? "bg-cyan-400/15 text-cyan-100" : "text-slate-300 hover:bg-white/[0.04] hover:text-white"}`}
                    type="button"
                    onClick={() => {
                      setSelected({ type: "tag", name: group.name });
                      if (!normalizedQuery) toggleGroup(group.name);
                    }}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-0" : "-rotate-90"}`} />
                    <span className="min-w-0 flex-1 truncate">{group.name}</span>
                    <span className="font-mono text-[10px] text-slate-500">{group.endpoints.length}</span>
                  </button>
                  {isOpen ? (
                    <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-2">
                      {group.endpoints.map((endpoint) => (
                        <button
                          key={endpoint.id}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${selected.type === "endpoint" && selected.id === endpoint.id ? "bg-cyan-400/15 text-cyan-100" : "text-slate-400 hover:bg-white/[0.04] hover:text-white"}`}
                          type="button"
                          onClick={() => {
                            setSelected({ type: "endpoint", id: endpoint.id });
                            setSideTab("try");
                          }}
                        >
                          <MethodBadge method={endpoint.method} compact />
                          <span className="min-w-0 flex-1 truncate text-xs">{endpoint.summary}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Schemas</p>
              <span className="font-mono text-[10px] text-slate-500">{catalog.schemas.length}</span>
            </div>
            <div className="space-y-1">
              {catalog.schemas.map((schema) => (
                <button
                  key={schema.name}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${selected.type === "schema" && selected.name === schema.name ? "bg-violet-400/15 text-violet-100" : "text-slate-400 hover:bg-white/[0.04] hover:text-white"}`}
                  type="button"
                  onClick={() => setSelected({ type: "schema", name: schema.name })}
                >
                  <Database className="h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1 truncate">{schema.name}</span>
                  <span className="font-mono text-[10px] text-slate-500">{schema.fields.length}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="min-w-0 pt-8 lg:pt-0 lg:pl-8 xl:pr-8">
          {selected.type === "overview" ? <Overview catalog={catalog} /> : null}
          {selectedGroup ? <TagView group={selectedGroup} onSelectEndpoint={(id) => setSelected({ type: "endpoint", id })} /> : null}
          {selectedEndpoint ? <EndpointView endpoint={selectedEndpoint} /> : null}
          {selectedSchema ? <SchemaView schema={selectedSchema} /> : null}

        </div>

        <aside className="mt-8 lg:col-start-2 xl:sticky xl:top-20 xl:col-start-auto xl:mt-0 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:border-l xl:border-white/10 xl:pl-5">
          <SidePanel
            apiToken={apiToken}
            baseUrl={baseUrl}
            catalog={catalog}
            endpoint={selectedEndpoint}
            setApiToken={setApiToken}
            setBaseUrl={setBaseUrl}
            setSideTab={setSideTab}
            sideTab={sideTab}
          />
        </aside>
      </div>
    </section>
  );
}

function Overview({ catalog }: { catalog: ApiDocsCatalog }) {
  return (
    <div className="space-y-10">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-emerald-300">Referencia completa</p>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Tudo organizado por recurso</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">
          A documentacao agora combina as rotas nativas da ConnectyHub com o catalogo avancado permitido. O cliente usa
          a nossa chave, o nosso endpoint e o instanceId publico; a ConnectyHub faz a ponte e registra a auditoria.
        </p>
      </header>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2 md:gap-3">
        <MetricCard label="Endpoints" value={catalog.stats.endpoints} tone="cyan" />
        <MetricCard label="Rotas nativas" value={catalog.stats.nativeEndpoints} tone="emerald" />
        <MetricCard label="Avancados" value={catalog.stats.advancedEndpoints} tone="violet" />
        <MetricCard label="Schemas" value={catalog.stats.schemas} tone="amber" />
        <MetricCard label="Eventos" value={catalog.webhookEvents.length} tone="rose" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Feature title="Chave ConnectyHub" text="O cliente nunca usa credencial interna de instancia. Toda chamada entra por Authorization ou x-connectyhub-api-key." icon={KeyRound} />
        <Feature title="Instancia controlada" text="O instanceId publico define qual WhatsApp sera usado, respeitando empresa, scopes e status no painel admin." icon={ShieldCheck} />
        <Feature title="Eventos assinados" text="Webhooks entregues ao cliente recebem headers ConnectyHub e assinatura HMAC quando houver secret." icon={Webhook} />
      </div>

      <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-200" />
          <h3 className="text-lg font-black text-white">QR lido, mas WhatsApp pediu chave de acesso</h3>
        </div>
        <p className="mt-3 text-sm leading-7 text-amber-50/85">
          Algumas contas exigem uma verificacao extra por passkey depois da leitura do QR inicial. Isso nao e erro de
          token, webhook ou renderizacao do QR. O integrador deve detectar esse estado e mostrar uma mensagem amigavel
          no proprio painel.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <CodeBlock code={`const attempt = response.connectionDiagnostics?.latestAttempt;\n\nconst passkeyBlocked =\n  attempt?.finalStatus === "passkey_blocked" ||\n  response.lastDisconnectReason\n    ?.toLowerCase()\n    .includes("passkey pairing not supported");`} />
          <CodeBlock code={`{\n  "lastDisconnectReason": "Passkey pairing not supported",\n  "connectionDiagnostics": {\n    "latestAttempt": {\n      "finalStatus": "passkey_blocked",\n      "scanDetected": true\n    }\n  }\n}`} />
        </div>
        <p className="mt-4 text-sm leading-7 text-slate-300">
          Mensagem recomendada: <InlineCode>Esta conta pediu uma verificacao extra por chave de acesso. Esse tipo de verificacao ainda nao pode ser concluido diretamente pelo QR Code do painel.</InlineCode>
        </p>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <Play className="h-4 w-4 text-emerald-300" />
          <h3 className="text-xl font-black text-white">Primeiros passos</h3>
        </div>
        <div className="grid gap-4">
          {catalog.gettingStarted.map((step) => (
            <div key={step.title} className="rounded-lg border border-white/10 bg-slate-950/70 p-5">
              <h4 className="text-base font-bold text-white">{step.title}</h4>
              <p className="mt-1 text-sm leading-6 text-slate-400">{step.description}</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <CodeBlock code={step.curl} />
                <CodeBlock code={step.response} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-cyan-300" />
          <h3 className="text-lg font-black text-white">Eventos de webhook</h3>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {catalog.webhookEvents.map((event) => (
            <span key={event} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 font-mono text-[10px] text-cyan-100">
              {event}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function TagView({ group, onSelectEndpoint }: { group: ApiDocGroup; onSelectEndpoint: (id: string) => void }) {
  return (
    <div>
      <header className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-200">
          TAG
        </div>
        <h2 className="mt-4 text-3xl font-black tracking-tight text-white">{group.name}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">{group.description}</p>
      </header>

      <div className="grid gap-3">
        {group.endpoints.map((endpoint) => (
          <button
            key={endpoint.id}
            className="rounded-lg border border-white/10 bg-slate-950/70 p-4 text-left transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.04]"
            type="button"
            onClick={() => onSelectEndpoint(endpoint.id)}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <MethodBadge method={endpoint.method} />
              <div className="min-w-0 flex-1">
                <div className="break-all font-mono text-sm text-cyan-100">{endpoint.path}</div>
                <h3 className="mt-2 text-base font-bold text-white">{endpoint.summary}</h3>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">{cleanDescription(endpoint.description)}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function EndpointView({ endpoint }: { endpoint: ApiDocEndpoint }) {
  return (
    <article>
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <MethodBadge method={endpoint.method} />
          <code className="break-all font-mono text-lg font-bold text-white sm:text-xl">{endpoint.path}</code>
        </div>
        <h2 className="mt-5 text-3xl font-black tracking-tight text-white">{endpoint.summary}</h2>
        {endpoint.path.startsWith("/provider/") ? (
          <div className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm leading-6 text-cyan-50">
            Esta e uma rota avancada da ConnectyHub. Use sua chave ConnectyHub e informe o instanceId publico; em metodos
            com body, os campos da operacao ficam dentro de <InlineCode>payload</InlineCode>.
          </div>
        ) : null}
        <MarkdownText text={endpoint.description} />
      </header>

      <div className="space-y-8">
        <FieldSection title="Parametros" fields={endpoint.parameters} empty="Este endpoint nao exige parametros adicionais." />
        <FieldSection title="Body" fields={endpoint.bodyFields} empty="Este endpoint nao exige corpo JSON." />
        {endpoint.payloadFields.length ? (
          <FieldSection title="Payload" fields={endpoint.payloadFields} empty="Sem campos de payload documentados." />
        ) : null}

        {endpoint.requestExample ? (
          <section>
            <h3 className="mb-3 text-xl font-black text-white">Exemplo de requisicao</h3>
            <CodeBlock code={endpoint.requestExample} />
          </section>
        ) : null}

        <section>
          <h3 className="mb-3 text-xl font-black text-white">Responses</h3>
          <div className="space-y-3">
            {endpoint.responses.map((response) => (
              <div key={`${endpoint.id}-${response.status}`} className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/70 p-4">
                <StatusBadge status={response.status} />
                <span className="text-sm font-semibold text-slate-200">{response.description}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </article>
  );
}

function SchemaView({ schema }: { schema: ApiDocSchema }) {
  return (
    <article>
      <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-violet-100">
        Schema
      </div>
      <h2 className="mt-4 text-3xl font-black tracking-tight text-white">{schema.name}</h2>
      {schema.description ? <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">{schema.description}</p> : null}
      <div className="mt-8">
        <FieldSection title="Campos" fields={schema.fields} empty="Schema sem campos documentados." />
      </div>
    </article>
  );
}

function SidePanel({
  apiToken,
  baseUrl,
  catalog,
  endpoint,
  setApiToken,
  setBaseUrl,
  setSideTab,
  sideTab,
}: {
  apiToken: string;
  baseUrl: string;
  catalog?: ApiDocsCatalog;
  endpoint: ApiDocEndpoint | null;
  setApiToken: (value: string) => void;
  setBaseUrl: (value: string) => void;
  sideTab: SideTab;
  setSideTab: (tab: SideTab) => void;
}) {
  if (!endpoint) {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-950/70 p-5">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-cyan-200" />
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Console API</p>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Selecione um endpoint para testar chamadas reais usando sua chave ConnectyHub.
        </p>
        <CodeBlock code={`const baseUrl = "${catalog?.baseUrl ?? "https://www.connectyhub.com.br/api/v1"}";\nconst apiKey = process.env.CONNECTYHUB_API_KEY;`} />
        <a
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15"
          download="connectyhub-openapi.json"
          href="/docs/api/openapi.json"
          title="Baixar especificacao tecnica em JSON para Postman, Insomnia e SDKs"
        >
          <FileJson className="h-4 w-4" />
          Baixar OpenAPI JSON
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#121416]">
      <div className="flex border-b border-white/10">
        <button
          className={`flex h-12 flex-1 items-center justify-center gap-2 text-sm font-bold transition ${sideTab === "try" ? "border-b-2 border-cyan-300 text-cyan-100" : "text-slate-500 hover:text-white"}`}
          type="button"
          onClick={() => setSideTab("try")}
        >
          <Play className="h-4 w-4" />
          Try It
        </button>
        <button
          className={`flex h-12 flex-1 items-center justify-center gap-2 text-sm font-bold transition ${sideTab === "code" ? "border-b-2 border-cyan-300 text-cyan-100" : "text-slate-500 hover:text-white"}`}
          type="button"
          onClick={() => setSideTab("code")}
        >
          <Code2 className="h-4 w-4" />
          Code
        </button>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <MethodBadge method={endpoint.method} />
          <code className="min-w-0 flex-1 truncate text-right font-mono text-xs text-slate-400">{endpoint.path}</code>
        </div>

        {sideTab === "try" ? (
          <TryItConsole
            apiToken={apiToken}
            baseUrl={baseUrl}
            endpoint={endpoint}
            key={endpoint.id}
            setApiToken={setApiToken}
            setBaseUrl={setBaseUrl}
          />
        ) : (
          <>
            <CodeBlock code={endpoint.curlExample} />
            <CopyButton value={endpoint.curlExample} label="Copiar codigo" />
            <CodeBlock code={buildFetchExample(endpoint, catalog?.baseUrl ?? "https://www.connectyhub.com.br/api/v1")} />
            <CopyButton value={buildFetchExample(endpoint, catalog?.baseUrl ?? "https://www.connectyhub.com.br/api/v1")} label="Copiar fetch" />
          </>
        )}
      </div>
    </div>
  );
}

function TryItConsole({
  apiToken,
  baseUrl,
  endpoint,
  setApiToken,
  setBaseUrl,
}: {
  apiToken: string;
  baseUrl: string;
  endpoint: ApiDocEndpoint;
  setApiToken: (value: string) => void;
  setBaseUrl: (value: string) => void;
}) {
  const [bodyText, setBodyText] = useState(() => endpoint.requestExample ?? "");
  const [confirmAction, setConfirmAction] = useState(false);
  const [history, setHistory] = useState<TryHistoryItem[]>([]);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>(() => createDefaultParameterValues(endpoint));
  const [result, setResult] = useState<TryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const pathParameters = endpoint.parameters.filter((field) => parameterKind(field) === "path");
  const queryParameters = endpoint.parameters.filter((field) => parameterKind(field) === "query");
  const headerParameters = endpoint.parameters.filter((field) => parameterKind(field) === "header" && !isBuiltInHeader(field));
  const requestUrl = useMemo(
    () => buildRequestUrl(endpoint, baseUrl, parameterValues),
    [baseUrl, endpoint, parameterValues],
  );
  const requiresConfirmation = endpointRequiresConfirmation(endpoint);
  const canSend = !running && (!requiresConfirmation || confirmAction);

  function updateParameterValue(name: string, value: string) {
    setParameterValues((current) => ({ ...current, [name]: value }));
  }

  async function sendRequest() {
    const token = apiToken.trim();
    if (!token) {
      setResult(createClientError("Informe uma chave ConnectyHub antes de enviar.", requestUrl.url));
      return;
    }

    if (!requestUrl.ok) {
      setResult(createClientError(requestUrl.error, requestUrl.url));
      return;
    }

    const parsedBody = parseRequestBody(endpoint, bodyText);
    if (!parsedBody.ok) {
      setResult(createClientError(parsedBody.error, requestUrl.url));
      return;
    }

    const headers = new Headers();
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${token}`);

    for (const parameter of headerParameters) {
      const value = parameterValues[parameter.name]?.trim();
      if (value) headers.set(parameterLabel(parameter), value);
    }

    const fetchOptions: RequestInit = {
      method: endpoint.method,
      headers,
    };

    if (parsedBody.body) {
      headers.set("Content-Type", "application/json");
      fetchOptions.body = parsedBody.body;
    }

    setRunning(true);
    const startedAt = performance.now();

    try {
      const response = await fetch(requestUrl.url, fetchOptions);
      const durationMs = Math.round(performance.now() - startedAt);
      const rawBody = await response.text();
      const nextResult: TryResult = {
        at: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        body: formatResponseBody(rawBody),
        durationMs,
        headers: headersToRecord(response.headers),
        ok: response.ok,
        status: response.status,
        statusText: response.statusText || (response.ok ? "OK" : "Erro"),
        url: requestUrl.url,
      };
      setResult(nextResult);
      setHistory((current) => [historyItemFromResult(endpoint, nextResult), ...current].slice(0, 5));
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      const nextResult: TryResult = {
        at: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        body: "",
        durationMs,
        error: error instanceof Error ? error.message : "Falha inesperada ao chamar a API.",
        headers: {},
        ok: false,
        status: null,
        statusText: "Falha local",
        url: requestUrl.url,
      };
      setResult(nextResult);
      setHistory((current) => [historyItemFromResult(endpoint, nextResult), ...current].slice(0, 5));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-50">
        Este console executa chamadas reais na API ConnectyHub. Use uma chave do painel do cliente e confira o ambiente antes de enviar.
      </div>

      <EditableInput label="Base URL" value={baseUrl} onChange={setBaseUrl} />

      <label className="block">
        <span className="mb-2 block text-xs font-bold text-slate-300">Token ConnectyHub</span>
        <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
          <input
            className="h-10 min-w-0 flex-1 bg-transparent px-3 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-600"
            placeholder="ch_live_SEU_TOKEN"
            type={showToken ? "text" : "password"}
            value={apiToken}
            onChange={(event) => setApiToken(event.target.value)}
          />
          <button
            className="flex h-10 w-11 items-center justify-center border-l border-white/10 text-slate-400 transition hover:text-white"
            title={showToken ? "Ocultar token" : "Mostrar token"}
            type="button"
            onClick={() => setShowToken((current) => !current)}
          >
            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </label>

      <ReadOnlyUrl value={requestUrl.url} />

      {pathParameters.length ? (
        <ParameterSection fields={pathParameters} title="Path" values={parameterValues} onChange={updateParameterValue} />
      ) : null}
      {queryParameters.length ? (
        <ParameterSection fields={queryParameters} title="Query" values={parameterValues} onChange={updateParameterValue} />
      ) : null}
      {headerParameters.length ? (
        <ParameterSection fields={headerParameters} title="Headers" values={parameterValues} onChange={updateParameterValue} />
      ) : null}

      {endpoint.requestExample ? (
        <label className="block">
          <span className="mb-2 block text-xs font-bold text-slate-300">Body JSON</span>
          <textarea
            className="min-h-48 w-full resize-y rounded-lg border border-white/10 bg-black p-3 font-mono text-xs leading-5 text-slate-100 outline-none transition placeholder:text-slate-700 focus:border-cyan-300/40"
            spellCheck={false}
            value={bodyText}
            onChange={(event) => setBodyText(event.target.value)}
          />
        </label>
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">
          Este endpoint nao exige corpo JSON.
        </div>
      )}

      {requiresConfirmation ? (
        <label className="flex items-start gap-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-xs leading-5 text-amber-50">
          <input
            className="mt-1 h-4 w-4 accent-amber-300"
            checked={confirmAction}
            type="checkbox"
            onChange={(event) => setConfirmAction(event.target.checked)}
          />
          <span>Entendo que esta chamada pode criar, alterar, enviar, resetar ou excluir dados reais.</span>
        </label>
      ) : null}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-black text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          disabled={!canSend}
          type="button"
          onClick={sendRequest}
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {running ? "Enviando" : "Enviar requisicao"}
        </button>
        <button
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:border-cyan-300/35 hover:text-white"
          title="Restaurar exemplo"
          type="button"
          onClick={() => {
            setBodyText(endpoint.requestExample ?? "");
            setParameterValues(createDefaultParameterValues(endpoint));
            setConfirmAction(false);
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <ResponsePanel result={result} />

      {history.length ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-300">
            <History className="h-3.5 w-3.5" />
            Ultimas chamadas
          </div>
          <div className="space-y-2">
            {history.map((item) => (
              <div key={item.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[11px] text-slate-400">
                <span className={item.ok ? "text-emerald-200" : "text-rose-200"}>{item.status}</span>
                <span className="truncate">{item.path}</span>
                <span className="font-mono">{item.durationMs}ms</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ParameterSection({
  fields,
  onChange,
  title,
  values,
}: {
  fields: ApiDocField[];
  onChange: (name: string, value: string) => void;
  title: string;
  values: Record<string, string>;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-slate-300">{title}</p>
      <div className="space-y-2">
        {fields.map((field) => (
          <label key={`${title}-${field.name}`} className="block rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <span className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-bold text-slate-200">{parameterLabel(field)}</span>
              {field.required ? <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-100">required</span> : null}
            </span>
            <input
              className="h-9 w-full rounded-md border border-white/10 bg-black px-2 font-mono text-xs text-slate-100 outline-none transition placeholder:text-slate-700 focus:border-cyan-300/40"
              placeholder={field.example ?? defaultValueForField(field)}
              value={values[field.name] ?? ""}
              onChange={(event) => onChange(field.name, event.target.value)}
            />
            {field.description ? <span className="mt-2 block text-[11px] leading-4 text-slate-500">{field.description}</span> : null}
          </label>
        ))}
      </div>
    </div>
  );
}

function ResponsePanel({ result }: { result: TryResult | null }) {
  if (!result) {
    return (
      <div className="rounded-lg border border-white/10 bg-black p-5 text-center">
        <Play className="mx-auto h-5 w-5 text-slate-600" />
        <p className="mt-3 text-sm font-bold text-slate-300">No response yet</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">Envie uma requisicao para ver status, tempo e retorno da API.</p>
      </div>
    );
  }

  const status = result.status ? String(result.status) : "local";

  return (
    <div className="rounded-lg border border-white/10 bg-black">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
        {result.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <XCircle className="h-4 w-4 text-rose-300" />}
        <StatusBadge status={status} />
        <span className="text-xs font-semibold text-slate-300">{result.statusText}</span>
        <span className="ml-auto font-mono text-[11px] text-slate-500">{result.durationMs}ms</span>
      </div>
      {result.error ? (
        <div className="border-b border-rose-300/15 bg-rose-300/10 p-3 text-xs leading-5 text-rose-100">{result.error}</div>
      ) : null}
      <div className="space-y-3 p-3">
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">URL</p>
          <code className="block break-all rounded-md bg-white/[0.04] p-2 font-mono text-[11px] text-slate-300">{result.url}</code>
        </div>
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Response</p>
          <CodeBlock code={result.body || "{}"} />
        </div>
        {Object.keys(result.headers).length ? (
          <details className="rounded-md border border-white/10 bg-white/[0.03] p-3">
            <summary className="cursor-pointer text-xs font-bold text-slate-300">Headers</summary>
            <CodeBlock code={JSON.stringify(result.headers, null, 2)} />
          </details>
        ) : null}
      </div>
    </div>
  );
}

function EditableInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-slate-300">{label}</span>
      <input
        className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 font-mono text-xs text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ReadOnlyUrl({ value }: { value: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-slate-300">Request URL</span>
      <input
        className="h-10 w-full rounded-lg border border-white/10 bg-black px-3 font-mono text-xs text-slate-400 outline-none"
        readOnly
        value={value}
      />
    </label>
  );
}

function FieldSection({ empty, fields, title }: { empty: string; fields: ApiDocField[]; title: string }) {
  return (
    <section>
      <h3 className="mb-3 text-xl font-black text-white">{title}</h3>
      {fields.length ? (
        <div className="overflow-hidden rounded-lg border border-white/10">
          {fields.map((field) => (
            <div key={`${title}-${field.name}`} className="grid gap-2 border-b border-white/10 bg-slate-950/70 p-4 last:border-b-0 md:grid-cols-[220px_minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="break-all font-mono text-sm font-bold text-white">{field.name}</code>
                  <span className="font-mono text-[10px] text-slate-500">{field.type}</span>
                  {field.required ? <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-100">required</span> : null}
                </div>
              </div>
              <div className="min-w-0 text-sm leading-6 text-slate-400">
                {field.description ? <p>{field.description}</p> : <p className="text-slate-600">Sem descricao.</p>}
                {field.enumValues?.length ? (
                  <p className="mt-1 font-mono text-[11px] text-cyan-100">Valores: {field.enumValues.join(", ")}</p>
                ) : null}
                {field.example ? <p className="mt-1 font-mono text-[11px] text-slate-500">Example: {field.example}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-500">{empty}</p>
      )}
    </section>
  );
}

function MarkdownText({ text }: { text: string }) {
  const blocks = cleanDescription(text).split(/\n{2,}/).filter(Boolean);
  if (!blocks.length) return null;

  return (
    <div className="mt-5 space-y-4 text-sm leading-7 text-slate-400">
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (trimmed.startsWith("## ")) {
          return <h3 key={index} className="pt-2 text-lg font-black text-white">{trimmed.replace(/^##\s+/, "")}</h3>;
        }
        const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
        if (lines.every((line) => line.startsWith("- "))) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {lines.map((line) => <li key={line}><InlineMarkdown text={line.replace(/^- /, "")} /></li>)}
            </ul>
          );
        }
        if (lines.every((line) => /^\d+\.\s+/.test(line))) {
          return (
            <ol key={index} className="list-decimal space-y-1 pl-5">
              {lines.map((line) => <li key={line}><InlineMarkdown text={line.replace(/^\d+\.\s+/, "")} /></li>)}
            </ol>
          );
        }
        return <p key={index}><InlineMarkdown text={trimmed} /></p>;
      })}
    </div>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return <InlineCode key={`${part}-${index}`}>{part.slice(1, -1)}</InlineCode>;
        }
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-cyan-300/10 px-1.5 py-0.5 font-mono text-[0.9em] text-cyan-100">{children}</code>;
}

function MethodBadge({ compact, method }: { compact?: boolean; method: ApiDocEndpoint["method"] }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-md border font-mono font-black ${compact ? "min-w-10 px-1.5 py-0.5 text-[9px]" : "px-3 py-1.5 text-xs"} ${methodTone(method)}`}>
      {method}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusNumber = Number(status);
  const tone = statusNumber < 300
    ? "bg-emerald-400 text-black"
    : statusNumber < 500
      ? "bg-orange-400 text-black"
      : "bg-rose-500 text-white";

  return <span className={`rounded-md px-3 py-1 font-mono text-xs font-black ${tone}`}>{status}</span>;
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="max-h-[520px] overflow-auto rounded-lg border border-white/10 bg-black p-4 text-[12px] leading-6 text-slate-200">
      <code>{code}</code>
    </pre>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-black text-black transition hover:bg-emerald-300"
      type="button"
      onClick={handleCopy}
    >
      {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copiado" : label}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-mono text-lg font-black text-emerald-200">{value}</div>
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
    </div>
  );
}

function MetricCard({ label, tone, value }: { label: string; tone: "cyan" | "emerald" | "violet" | "amber" | "rose"; value: number }) {
  const tones = {
    cyan: "text-cyan-200 border-cyan-300/15 bg-cyan-300/5",
    emerald: "text-emerald-200 border-emerald-300/15 bg-emerald-300/5",
    violet: "text-violet-200 border-violet-300/15 bg-violet-300/5",
    amber: "text-amber-200 border-amber-300/15 bg-amber-300/5",
    rose: "text-rose-200 border-rose-300/15 bg-rose-300/5",
  };

  return (
    <div className={`min-w-0 rounded-lg border px-2 py-2 sm:p-4 ${tones[tone]}`}>
      <div className="truncate font-mono text-[16px] font-black sm:text-3xl">{value}</div>
      <div className="mt-1 truncate font-mono text-[8px] uppercase tracking-[0.11em] text-slate-400 sm:mt-2 sm:text-[10px] sm:tracking-[0.16em]">{label}</div>
    </div>
  );
}

function Feature({ icon: Icon, text, title }: { icon: LucideIcon; text: string; title: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/70 p-5">
      <Icon className="h-5 w-5 text-cyan-200" />
      <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function buildFetchExample(endpoint: ApiDocEndpoint, baseUrl: string) {
  const url = `${baseUrl}${replaceExamplePathParams(endpoint.path)}`;
  const body = endpoint.requestExample
    ? `,\n  body: JSON.stringify(${endpoint.requestExample.replace(/\n/g, "\n  ")})`
    : "";

  return `const response = await fetch("${url}", {\n  method: "${endpoint.method}",\n  headers: {\n    "Authorization": "Bearer ch_live_SEU_TOKEN",\n    "Accept": "application/json"${endpoint.requestExample ? ',\n    "Content-Type": "application/json"' : ""}\n  }${body}\n});\n\nconst data = await response.json();`;
}

function buildRequestUrl(endpoint: ApiDocEndpoint, baseUrl: string, parameterValues: Record<string, string>): RequestUrlResult {
  const missing: string[] = [];
  const resolvedPath = endpoint.path.replace(/\{([^}]+)\}/g, (_, rawName: string) => {
    const key = `path:${rawName}`;
    const value = parameterValues[key]?.trim();
    if (!value) {
      missing.push(rawName);
      return `{${rawName}}`;
    }
    return rawName === "path" ? value.replace(/^\/+/, "") : encodeURIComponent(value);
  });

  let requestUrl: URL;
  try {
    const origin = typeof window === "undefined" ? "https://www.connectyhub.com.br" : window.location.origin;
    const normalizedBase = new URL(normalizeBaseUrl(baseUrl), origin).toString().replace(/\/+$/, "");
    requestUrl = new URL(`${normalizedBase}${resolvedPath.startsWith("/") ? "" : "/"}${resolvedPath}`);
  } catch {
    return { error: "Base URL invalida.", ok: false, url: `${baseUrl}${resolvedPath}` };
  }

  for (const field of endpoint.parameters.filter((parameter) => parameterKind(parameter) === "query")) {
    const name = parameterLabel(field);
    const value = parameterValues[field.name]?.trim();
    if (field.required && !value) missing.push(name);
    if (value) requestUrl.searchParams.set(name, value);
  }

  if (missing.length) {
    return {
      error: `Preencha os parametros obrigatorios: ${Array.from(new Set(missing)).join(", ")}.`,
      ok: false,
      url: requestUrl.toString(),
    };
  }

  return { ok: true, url: requestUrl.toString() };
}

function createClientError(error: string, url: string): TryResult {
  return {
    at: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    body: "",
    durationMs: 0,
    error,
    headers: {},
    ok: false,
    status: null,
    statusText: "Validacao",
    url,
  };
}

function createDefaultParameterValues(endpoint: ApiDocEndpoint) {
  const values: Record<string, string> = {};

  for (const field of endpoint.parameters) {
    const kind = parameterKind(field);
    if (kind === "path" || field.required || field.name === "header:Idempotency-Key") {
      values[field.name] = field.example ?? defaultValueForField(field);
    }
  }

  return values;
}

function defaultValueForField(field: ApiDocField) {
  const name = parameterLabel(field).toLowerCase();
  const fieldName = field.name.toLowerCase();

  if (field.example) return field.example;
  if (field.enumValues?.length) return field.enumValues[0];
  if (fieldName === "path:path" || name === "path") return "chat/details";
  if (name.includes("instanceid")) return "ea36f5db-c8dd-48ca-9e28-73ca3f015d78";
  if (name.includes("webhookid")) return "whk_7d6a2cb2";
  if (name.includes("deliveryid")) return "del_2ff7b1";
  if (name.includes("idempotency")) return "pedido-123";
  if (name.includes("limit")) return "50";
  if (name.includes("offset")) return "0";
  if (name.includes("number")) return "5511999999999";
  if (field.type.includes("boolean")) return "true";
  if (field.type.includes("integer") || field.type.includes("number")) return "1";
  return "";
}

function endpointRequiresConfirmation(endpoint: ApiDocEndpoint) {
  if (endpoint.method === "GET") return false;
  if (endpoint.method === "DELETE" || endpoint.method === "PATCH" || endpoint.method === "PUT") return true;

  const summary = endpoint.summary.toLowerCase();
  const readPrefixes = ["buscar", "listar", "obter", "consultar", "detalhar", "detalhes", "verificar"];
  if (readPrefixes.some((prefix) => summary.startsWith(prefix))) return false;

  return true;
}

function formatResponseBody(rawBody: string) {
  if (!rawBody.trim()) return "{}";

  try {
    return JSON.stringify(JSON.parse(rawBody), null, 2);
  } catch {
    return rawBody;
  }
}

function headersToRecord(headers: Headers) {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function historyItemFromResult(endpoint: ApiDocEndpoint, result: TryResult): TryHistoryItem {
  return {
    at: result.at,
    durationMs: result.durationMs,
    id: `${endpoint.id}-${result.at}-${result.durationMs}`,
    ok: result.ok,
    path: endpoint.path,
    status: result.status ? String(result.status) : result.statusText,
  };
}

function isBuiltInHeader(field: ApiDocField) {
  const label = parameterLabel(field).toLowerCase();
  return label === "authorization" || label === "content-type" || label === "accept";
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim() || "https://www.connectyhub.com.br/api/v1";
  if (trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function parameterKind(field: ApiDocField) {
  const separatorIndex = field.name.indexOf(":");
  return separatorIndex === -1 ? "body" : field.name.slice(0, separatorIndex);
}

function parameterLabel(field: ApiDocField) {
  const separatorIndex = field.name.indexOf(":");
  return separatorIndex === -1 ? field.name : field.name.slice(separatorIndex + 1);
}

function parseRequestBody(endpoint: ApiDocEndpoint, bodyText: string): ParsedBodyResult {
  if (endpoint.method === "GET" || !bodyText.trim()) return { body: null, ok: true };

  try {
    JSON.parse(bodyText);
    return { body: bodyText.trim(), ok: true };
  } catch {
    return { error: "O body precisa ser um JSON valido antes de enviar.", ok: false };
  }
}

function replaceExamplePathParams(path: string) {
  return path
    .replace("{instanceId}", "ea36f5db-c8dd-48ca-9e28-73ca3f015d78")
    .replace("{webhookId}", "whk_7d6a2cb2")
    .replace("{deliveryId}", "del_2ff7b1")
    .replace("{path}", "chat/details");
}

function endpointMatches(endpoint: ApiDocEndpoint, query: string) {
  return [
    endpoint.tag,
    endpoint.method,
    endpoint.path,
    endpoint.summary,
    endpoint.description,
    ...endpoint.parameters.map((field) => field.name),
    ...endpoint.bodyFields.map((field) => field.name),
    ...endpoint.payloadFields.map((field) => field.name),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function cleanDescription(text: string) {
  return text.replace(/\*\*/g, "").replace(/\s{3,}/g, " ").trim();
}

function methodTone(method: ApiDocEndpoint["method"]) {
  if (method === "GET") return "border-emerald-300/25 bg-emerald-300/15 text-emerald-100";
  if (method === "POST") return "border-cyan-300/25 bg-cyan-300/15 text-cyan-100";
  if (method === "DELETE") return "border-rose-300/25 bg-rose-300/15 text-rose-100";
  if (method === "PATCH") return "border-violet-300/25 bg-violet-300/15 text-violet-100";
  return "border-amber-300/25 bg-amber-300/15 text-amber-100";
}
