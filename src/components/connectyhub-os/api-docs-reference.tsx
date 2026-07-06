"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Code2,
  Copy,
  Database,
  FileJson,
  KeyRound,
  type LucideIcon,
  Play,
  Search,
  ShieldCheck,
  Webhook,
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

export function ApiDocsReference({ catalog }: { catalog: ApiDocsCatalog }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedDoc>({ type: "overview" });
  const [sideTab, setSideTab] = useState<SideTab>("try");
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
    <section id="referencia" className="border-t border-white/10 bg-[#05070a]">
      <div className="mx-auto grid max-w-[1680px] gap-0 px-4 py-8 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-8 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
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

          {selectedEndpoint ? (
            <div className="mt-8 xl:hidden">
              <SidePanel endpoint={selectedEndpoint} sideTab={sideTab} setSideTab={setSideTab} />
            </div>
          ) : null}
        </div>

        <aside className="hidden xl:block xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:border-l xl:border-white/10 xl:pl-5">
          <SidePanel endpoint={selectedEndpoint} sideTab={sideTab} setSideTab={setSideTab} catalog={catalog} />
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

      <div className="grid gap-3 md:grid-cols-5">
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
  catalog,
  endpoint,
  setSideTab,
  sideTab,
}: {
  catalog?: ApiDocsCatalog;
  endpoint: ApiDocEndpoint | null;
  sideTab: SideTab;
  setSideTab: (tab: SideTab) => void;
}) {
  if (!endpoint) {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-950/70 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Base URL</p>
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
          <>
            <ReadOnlyInput label="URL" value={`${catalog?.baseUrl ?? "https://www.connectyhub.com.br/api/v1"}${endpoint.path}`} />
            <ReadOnlyInput label="Authorization" value="Bearer ch_live_SEU_TOKEN" masked />
            {endpoint.requestExample ? (
              <div>
                <p className="mb-2 text-xs font-bold text-slate-300">Body</p>
                <CodeBlock code={endpoint.requestExample} />
              </div>
            ) : null}
            <CopyButton value={endpoint.curlExample} label="Copiar cURL" />
          </>
        ) : (
          <>
            <CodeBlock code={endpoint.curlExample} />
            <CopyButton value={endpoint.curlExample} label="Copiar codigo" />
          </>
        )}
      </div>
    </div>
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

function ReadOnlyInput({ label, masked, value }: { label: string; masked?: boolean; value: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-slate-300">{label}</span>
      <input
        className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 font-mono text-xs text-slate-300 outline-none"
        readOnly
        type={masked ? "password" : "text"}
        value={value}
      />
    </label>
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
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="font-mono text-3xl font-black">{value}</div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">{label}</div>
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
