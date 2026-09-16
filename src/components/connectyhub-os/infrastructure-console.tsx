"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Activity, ArrowLeft, ArrowUpRight, Database, GitBranch, LockKeyhole, Server } from "lucide-react";
import { DialogFrame } from "@/components/ui/dialog-frame";
import { actionLabels, blockedReason, eventLabels, healthLabels, originLabels, projectHealth, stageLabels, stages, stale, type Detail, type Health, type InfraAction, type Migration, type Overview, type Telemetry } from "@/lib/infrastructure/model";

const panel = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const button = "min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const date = (v: string | null | undefined) => v ? new Date(v).toLocaleString("pt-BR") : "Não informado";
const value = (v: number | null | undefined) => v ?? "Não informado";
function Badge({ health }: { health: Health }) {
  const color = { healthy: "bg-emerald-50 text-emerald-800", warning: "bg-amber-50 text-amber-900", error: "bg-rose-50 text-rose-800", unknown: "bg-slate-100 text-slate-600" }[health];
  return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${color}`}><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />{healthLabels[health]}</span>;
}
function Section({ title, children }: { title: string; children: ReactNode }) { return <section className={`${panel} min-w-0 space-y-4`}><h2 className="text-lg font-bold">{title}</h2>{children}</section>; }
function Fact({ name, children }: { name: string; children: ReactNode }) { return <div className="min-w-0"><dt className="text-xs text-slate-500">{name}</dt><dd className="mt-1 break-all text-sm font-medium">{children}</dd></div>; }
function Freshness({ telemetry }: { telemetry: Telemetry | null | undefined }) {
  return <p className={`text-xs ${stale(telemetry) ? "text-amber-800" : "text-slate-500"}`}>{!telemetry ? "Coletor ainda não conectado. Saúde desconhecida." : `${stale(telemetry) ? "Telemetria desatualizada · " : "Observação · "}${date(telemetry.observed_at)} · ${telemetry.executor}`}</p>;
}

function usePolling<T>(url: string) {
  const [state, setState] = useState<{ url: string; data: T | null; error: string; updated: string | null }>({ url, data: null, error: "", updated: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const result = await fetch(url, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        const data = await result.json();
        if (!result.ok) throw new Error(data.error ?? "Não foi possível atualizar.");
        if (!controller.signal.aborted) setState({ url, data, error: "", updated: new Date().toISOString() });
      } catch (e) {
        if (!controller.signal.aborted) setState(previous => ({ url, data: previous.url === url ? previous.data : null, updated: previous.url === url ? previous.updated : null, error: e instanceof Error ? e.message : "Falha ao atualizar." }));
      } finally { if (!controller.signal.aborted) timer = setTimeout(read, 5000); }
    };
    void read();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [url, revision]);
  return { ...(state.url === url ? state : { data: null, error: "", updated: null }), refresh: () => setRevision(n => n + 1) };
}

export function InfrastructureInventory() {
  const { data, error, updated, refresh } = usePolling<Overview>("/api/admin/infrastructure");
  return <main className="mx-auto max-w-7xl space-y-6 text-slate-900">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Administração / Operações</p><h1 className="mt-2 text-3xl font-bold">Infraestrutura</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Aplicações, dados e deploys em um cockpit por empresa. Acompanhe a publicação real na VPS e a saúde dos serviços.</p></div><button className={button} onClick={refresh}>Atualizar</button></header>
    <div className="flex flex-wrap gap-3 text-xs text-slate-500"><span className="flex items-center gap-2"><Activity size={14} />Polling a cada 5 segundos</span><span>Última consulta: {date(updated)}</span><span>Horários no fuso do navegador</span></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error} {data && "Exibindo a última leitura; conexão interrompida."}</p>}
    <div className="grid gap-4 md:grid-cols-3">{[[Server, "Inventário", "Empresa, projeto e ambiente"], [GitBranch, "Deploy VPS", "Etapas, container e healthcheck"], [LockKeyhole, "Controle protegido", "Confirmação e auditoria"]].map(([Icon, title, text]) => { const I = Icon as typeof Server; return <div key={String(title)} className={`${panel} flex items-center gap-4`}><I className="shrink-0 text-blue-700" size={24} /><div><p className="font-semibold">{String(title)}</p><p className="mt-1 text-xs text-slate-500">{String(text)}</p></div></div>; })}</div>
    {!data && !error && <p role="status">Carregando inventário…</p>}
    {data && <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">{data.projects.map(project => {
      const telemetry = data.telemetry.find(t => t.project_id === project.id);
      return <article key={project.id} className={`${panel} space-y-5`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-500">{project.company} · {project.environment}</p><h2 className="mt-1 text-xl font-bold">{project.name}</h2></div><Badge health={error ? "unknown" : projectHealth(telemetry)} /></div>
        <p className="w-fit rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{project.topology === "unknown" ? "Origem a confirmar" : originLabels[project.topology]}</p>
        <dl className="grid gap-3 sm:grid-cols-2"><Fact name="App / API">{project.app}</Fact><Fact name="Supabase">{project.supabase}</Fact><Fact name="Inngest">{project.inngest}</Fact><Fact name="Worker">{project.worker}</Fact><Fact name="Storage">{project.storage}</Fact><Fact name="Acesso">Somente leitura</Fact></dl>
        <Freshness telemetry={telemetry} /><Link className="flex min-h-11 items-center justify-between rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white" href={`/admin/infrastructure/${project.id}`}>Abrir operação <ArrowUpRight size={17} /></Link>
      </article>;
    })}</div>}
    <p className="text-xs leading-6 text-slate-500">Inventário é configuração declarada. “Saudável” exige telemetria recente; “operacional” depende de adaptador autorizado. Neste MVP, comandos remotos estão bloqueados.</p>
  </main>;
}

export function InfrastructureProject({ projectId }: { projectId: string }) {
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState("deploys");
  const [catalog, setCatalog] = useState<Migration[] | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [migrationFilter, setMigrationFilter] = useState("");
  const [pending, setPending] = useState<{ action: InfraAction; target: string; checksum?: string } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState("");
  const [sending, setSending] = useState(false);
  const base = `/api/admin/infrastructure/${encodeURIComponent(projectId)}`;
  const { data, error, updated, refresh } = usePolling<Detail>(`${base}${selected ? `?deploy=${encodeURIComponent(selected)}` : ""}`);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${base}/migrations`, { signal: controller.signal, cache: "no-store" }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setCatalog(d.migrations); }).catch(e => { if (!controller.signal.aborted) setCatalogError(e.message); });
    return () => controller.abort();
  }, [base]);
  function prepare(action: InfraAction, target: string, checksum?: string) { setPending({ action, target, checksum }); setConfirmation(""); setResult(""); }
  async function submit() {
    if (!pending) return;
    setSending(true);
    try {
      const response = await fetch(`${base}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...pending, confirmation }) });
      const body = await response.json();
      setResult(body.error ?? "Solicitação registrada.");
      refresh();
    } catch { setResult("Falha de conexão. Consulte a auditoria antes de repetir."); } finally { setSending(false); }
  }
  const telemetry = data?.telemetry;
  const snapshot = telemetry?.payload;
  const observedHealth = (h?: Health): Health => error || stale(telemetry) ? "unknown" : h ?? "unknown";
  const deployment = data?.deployments.find(d => d.id === data.selectedDeployId);
  const actionButton = (action: InfraAction, target: string, checksum?: string) => <button className={button} disabled={!data?.canOperate} title={!data?.canOperate ? "Somente admin infra pode preparar solicitações." : blockedReason} onClick={() => prepare(action, target, checksum)}>{actionLabels[action]} · bloqueado</button>;
  return <main className="mx-auto max-w-7xl space-y-6 text-slate-900">
    <Link href="/admin/infrastructure" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-blue-700"><ArrowLeft size={16} />Todos os projetos</Link>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">{data?.project.company ?? projectId} / {data?.project.environment ?? "Operações"}</p><h1 className="mt-2 text-3xl font-bold">{data?.project.name ?? "Operação do projeto"}</h1><p className="mt-2 text-sm text-slate-600">{data?.project.topology && data.project.topology !== "unknown" ? originLabels[data.project.topology] : "Origem a confirmar"} · Somente leitura</p></div><div className="flex flex-wrap items-center gap-3"><Badge health={observedHealth(projectHealth(telemetry))} /><button className={button} onClick={refresh}>Atualizar</button></div></header>
    <div className="space-y-2"><p className="text-xs text-slate-500">Atualização a cada 5 s · Última consulta: {date(updated)} · Fuso do navegador</p><Freshness telemetry={telemetry} /></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error} {data && "Última leitura preservada; conexão interrompida."}</p>}
    {!data && !error && <p role="status">Carregando operação…</p>}
    {data && <>
      {projectId === "betel" && <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">Betel: o app é publicado na VPS em <strong>app-production</strong>. A Vercel atua como proxy. Push GitHub e deploy do proxy não comprovam atualização do app.</p>}
      <nav aria-label="Operação do projeto" className="flex flex-wrap gap-2 border-b border-slate-200">{[["deploys", "Deploy VPS / App"], ["supabase", "Supabase / Storage"], ["inngest", "Inngest / Worker"], ["migrations", "Migrations"], ["audit", "Auditoria"]].map(([id, label]) => <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} className={`min-h-12 border-b-2 px-3 text-sm font-semibold ${tab === id ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500"}`}>{label}</button>)}</nav>
      {tab === "deploys" && <div className="grid items-start gap-5 xl:grid-cols-[1fr_2fr]">
        <Section title="App em execução"><dl className="grid gap-4"><Fact name="Versão observada">{snapshot?.version ?? "Não informada"}</Fact><Fact name="Imagem observada">{snapshot?.image ?? "Não informada"}</Fact><Fact name="Container">{snapshot?.container ?? "Não informado"}</Fact><Fact name="Healthcheck"><Badge health={observedHealth(snapshot?.services.app)} /></Fact><Fact name="Rollback disponível">{snapshot?.rollbackAvailable == null ? "Não informado" : snapshot.rollbackAvailable ? "Informado pelo coletor; execução bloqueada" : "Não"}</Fact></dl><h3 className="text-sm font-bold">Logs recentes do app</h3>{!snapshot?.appLogs?.length ? <p className="text-xs text-slate-500">Nenhum log estruturado informado.</p> : <ol className="max-h-60 space-y-2 overflow-auto rounded-xl bg-slate-50 p-3 text-xs">{snapshot.appLogs.map((log, i) => <li key={i}>{date(log.at)} · {eventLabels[log.code] ?? ({ process_started: "Processo iniciado", process_stopped: "Processo parado", request_failed: "Falha de requisição" } as Record<string, string>)[log.code]}</li>)}</ol>}{actionButton("app_rollback", data.project.app.replace(/[^a-zA-Z0-9_.-]/g, "-"))}</Section>
        <div className="order-first min-w-0 space-y-5 xl:order-none"><Section title="Deploy VPS"><p className="text-sm leading-6 text-slate-600">Progresso informado pelo script de publicação. Esta tela acompanha eventos; não inicia deploys.</p>
          <label className="block text-xs font-semibold text-slate-600">Histórico de publicações<select value={selected} onChange={e => setSelected(e.target.value)} className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-sm"><option value="">Acompanhar publicação mais recente</option>{data.deployments.map(d => <option key={d.id} value={d.id}>{date(d.started_at)} · {originLabels[d.origin]} · {stageLabels[d.stage]}</option>)}</select></label>
          {data.truncated && <p className="text-xs text-amber-800">50 publicações recentes. Histórico completo preservado no banco.</p>}
          {!deployment ? <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Nenhum deploy registrado. Conecte o script VPS ao receptor de eventos.</p> : <>
            <div className="flex flex-wrap gap-2"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">{originLabels[deployment.origin]}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{stageLabels[deployment.stage]}</span></div>
            {!deployment.finished_at && Date.parse(updated ?? "") - Date.parse(deployment.updated_at) > 120_000 && <p role="status" className="text-sm text-amber-800">Sem progresso há mais de dois minutos. O resultado do deploy é desconhecido; confira o executor.</p>}
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">{stages.map(s => <li key={s} className={`rounded-lg border p-3 text-xs ${deployment.stage === s ? "border-blue-500 bg-blue-50 font-bold text-blue-900" : "border-slate-200 text-slate-500"}`} aria-current={deployment.stage === s ? "step" : undefined}>{stageLabels[s]}</li>)}</ol>
            <dl className="grid gap-4 sm:grid-cols-2"><Fact name="App afetado">{deployment.app}</Fact><Fact name="Executor autenticado">{deployment.executor}</Fact><Fact name="Imagem anterior">{deployment.current_image}</Fact><Fact name="Nova imagem">{deployment.new_image}</Fact><Fact name="Início / fim">{date(deployment.started_at)} / {date(deployment.finished_at)}</Fact><Fact name="Container / healthcheck informado">{deployment.container} · {healthLabels[deployment.health]}</Fact></dl>
            <h3 className="text-sm font-bold">Logs resumidos · últimos 100 eventos</h3><ol className="max-h-80 space-y-2 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-200">{data.events.map(e => <li className="break-words leading-6" key={e.sequence}><span className="text-slate-400">#{e.sequence} · {date(e.created_at)}</span><br />{stageLabels[e.stage]} — {eventLabels[e.code] ?? "Evento registrado"}</li>)}</ol>
          </>}
        </Section></div>
      </div>}
      {tab === "supabase" && <div className="grid gap-5 lg:grid-cols-2"><Section title="Supabase · saúde e conexão"><dl className="grid grid-cols-2 gap-5">{[["api", "API"], ["auth", "Auth"], ["rest", "REST"], ["database", "Conexão ao banco"], ["storage", "Storage"], ["app", "App"]].map(([key, label]) => <Fact key={key} name={label}><Badge health={observedHealth(snapshot?.services[key as keyof typeof snapshot.services])} /></Fact>)}</dl><p className="text-xs text-slate-500">Destino declarado: {data.project.supabase} · Storage: {data.project.storage}</p></Section><Section title="Tabelas críticas e permissões">{!snapshot?.tables.length ? <p className="text-sm text-slate-500">Coletor ainda não informou tabelas, RLS e permissões.</p> : snapshot.tables.map(t => <div className="space-y-2 rounded-xl bg-slate-50 p-3" key={t.name}><p className="break-all text-sm font-semibold">{t.name}</p><Badge health={observedHealth(t.health)} /><p className="text-xs text-slate-600">RLS: {t.rls === "enabled" ? "Habilitado" : t.rls === "disabled" ? "Desabilitado" : "Não informado"} · Permissões: {t.permissions === "verified" ? "Verificadas" : t.permissions === "warning" ? "Atenção" : "Não informadas"}</p></div>)}</Section></div>}
      {tab === "inngest" && <div className="space-y-5"><Section title="Inngest e workers"><div className="flex flex-wrap gap-3"><Badge health={observedHealth(snapshot?.services.inngest)} /><Badge health={observedHealth(snapshot?.services.worker)} /></div><dl className="grid grid-cols-2 gap-5 sm:grid-cols-5"><Fact name="Falhas">{value(snapshot?.inngest.failures)}</Fact><Fact name="Retries">{value(snapshot?.inngest.retries)}</Fact><Fact name="Fila">{value(snapshot?.inngest.queued)}</Fact><Fact name="Atraso (s)">{value(snapshot?.inngest.delaySeconds)}</Fact><Fact name="Workers conectados">{value(snapshot?.inngest.workers)}</Fact></dl><p className="text-xs text-slate-500">Métricas do último snapshot do coletor; ausência não equivale a zero.</p></Section><div className="grid gap-5 lg:grid-cols-2"><Section title="Funções / jobs">{!snapshot?.inngest.functions.length && <p className="text-sm text-slate-500">Sem funções informadas.</p>}{snapshot?.inngest.functions.map(f => <div key={f.id} className="space-y-3 rounded-xl bg-slate-50 p-4"><p className="break-all text-sm font-semibold">{f.id} · {f.status === "active" ? "Ativa" : f.status === "paused" ? "Pausada" : "Não informado"}</p><div className="flex flex-wrap gap-2">{actionButton("inngest_pause", f.id)}{actionButton("inngest_resume", f.id)}</div></div>)}</Section><Section title="Últimos eventos e falhas">{!snapshot?.inngest.events.length && <p className="text-sm text-slate-500">Sem eventos informados.</p>}{snapshot?.inngest.events.map(e => <div key={e.id} className="space-y-3 rounded-xl bg-slate-50 p-4"><p className="break-all text-sm font-semibold">{e.id}</p><p className="text-xs text-slate-500">{e.status} · {e.retries} retries</p><div className="flex flex-wrap gap-2">{actionButton("inngest_retry", e.id)}{actionButton("inngest_resend", e.id)}</div></div>)}</Section></div><p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{blockedReason}</p></div>}
      {tab === "migrations" && <Section title="Migrations versionadas"><p className="text-sm leading-6 text-slate-600">Compare o catálogo com as versões informadas pelo coletor. Aplicação remota bloqueada. O preview é somente leitura.</p>{catalogError && <p role="alert" className="text-sm text-rose-800">{catalogError}</p>}{!catalog && !catalogError && <p>Carregando catálogo…</p>}{catalog?.length === 0 && <p className="text-sm text-slate-500">Catálogo deste projeto ainda não conectado. Nenhuma migration é presumida aplicada.</p>}
        <input aria-label="Filtrar migrations" placeholder="Filtrar por versão ou nome" value={migrationFilter} onChange={e => setMigrationFilter(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" />
        {catalog?.filter(m => m.name.toLowerCase().includes(migrationFilter.toLowerCase())).map(m => <details key={m.version} className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer break-all text-sm font-semibold"><Database className="mr-2 inline" size={14} />{m.name}<span className="ml-3 text-xs font-normal text-slate-500">{stale(telemetry) || !snapshot?.appliedMigrations ? "Aplicação não verificada" : snapshot.appliedMigrations.includes(m.version) ? "Aplicada (informada pelo coletor)" : "Pendente (ausente no snapshot)"}</span></summary><p className="my-3 break-all text-xs text-slate-500">SHA-256: {m.checksum}</p><pre className="my-3 max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-200">{m.sql}</pre>{actionButton("migration_apply", m.version, m.checksum)}</details>)}
      </Section>}
      {tab === "audit" && <Section title="Auditoria operacional"><p className="text-xs text-slate-500">100 registros recentes; snapshots periódicos ficam no banco. Tentativas sem projeto válido têm auditoria global, consultável pelo serviço.</p>{!data.audit.length && <p className="text-sm text-slate-500">Nenhuma ação registrada.</p>}{data.audit.map(a => <details key={a.id} className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer break-words text-sm"><strong>{a.action}</strong> · {a.result} · {date(a.created_at)}</summary><p className="mt-3 break-all text-xs text-slate-600">Usuário/executor: {a.actor} · Alvo: {a.target ?? "Não se aplica"} · Motivo: {a.reason}</p><pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify({ antes: a.before_state, depois: a.after_state }, null, 2)}</pre></details>)}</Section>}
    </>}
    {pending && <DialogFrame onClose={() => !sending && setPending(null)} aria-labelledby="infra-confirm-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 text-slate-900"><h2 id="infra-confirm-title" className="text-xl font-bold">{actionLabels[pending.action]}</h2><p className="break-all text-sm">Projeto: <strong>{projectId}</strong> · Alvo: <strong>{pending.target}</strong></p><p className="text-sm leading-6 text-amber-900">{blockedReason} A tentativa será auditada.</p><label className="block text-sm">Para registrar a solicitação, digite <code className="break-all font-semibold">{`${projectId}:${pending.action}:${pending.target}`}</code><input className="mt-3 min-h-11 w-full rounded-xl border border-slate-300 px-3" value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label>{result && <p role="status" className="text-sm leading-6 text-blue-800">{result}</p>}<div className="flex flex-wrap justify-end gap-3"><button className={button} disabled={sending} onClick={() => setPending(null)}>Fechar</button><button className={button} disabled={sending || !!result || confirmation !== `${projectId}:${pending.action}:${pending.target}`} onClick={submit}>{sending ? "Registrando…" : "Confirmar solicitação"}</button></div></div></DialogFrame>}
  </main>;
}
