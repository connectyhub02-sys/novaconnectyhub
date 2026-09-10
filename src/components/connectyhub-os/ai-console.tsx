"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Code2, Copy, KeyRound, Plus, RefreshCw, ArrowRight, Check } from "lucide-react";
import { CreditExplainer, formatPreciseCredits } from "./credit-explainer";
import { AiPlayground } from "./ai-playground";
import { AiModelPicker } from "./ai-model-picker";
import type { PublicAiModel } from "@/lib/ai-api/model-catalog";
import { AiUsageCharts } from "./ai-usage-charts";
import type { AiUsage } from "@/lib/ai-api/usage";

type Project = { id: string; name: string; status: string; ai_api_keys: Array<{ id: string; name: string; key_prefix: string; status: string; model_id: string | null }> };
type Activity = { id: string; project_id: string; status: string; charged_credits: number; reserved_credits: number; created_at: string };
type Data = { models: PublicAiModel[]; projects: Project[]; wallet: { balance_credits: number; reserved_credits: number } | null; activity: Activity[]; usage: AiUsage };
const field = "mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-2 focus:outline-blue-500";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50";
const statusLabels: Record<string,string> = { completed: "Concluída", failed: "Não concluída", uncertain: "Em conferência", preparing: "Em andamento", reserved: "Em andamento", processing: "Em andamento" };

export function AiConsole({ admin = false }: { admin?: boolean }) {
  const [tab,setTab] = useState<"usage"|"projects">("usage");
  const [days,setDays] = useState("30"), [project,setProject] = useState("");
  const [revision,setRevision] = useState(0);
  const [state,setState] = useState<{ key: string; data: Data } | null>(null);
  const [failure,setFailure] = useState<{ key: string; message: string } | null>(null);
  const [notice,setNotice] = useState(""), [secret,setSecret] = useState(""), [busy,setBusy] = useState(false);
  const key = `${days}:${project}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard/ai?days=${days}&project=${encodeURIComponent(project)}`,{signal:controller.signal})
      .then(async response => { const data = await response.json(); if(!response.ok) throw new Error(data.error); if(!controller.signal.aborted) setState({key,data}); })
      .catch(error => { if(!controller.signal.aborted) setFailure({key,message:error.message}); });
    return () => controller.abort();
  },[days,project,revision,key]);
  const data = state?.key === key ? state.data : null;
  const error = failure?.key === key ? failure.message : null;
  async function action(body: Record<string,unknown>) {
    setBusy(true);setNotice("");
    try {
      const response = await fetch("/api/dashboard/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const result = await response.json(); if(!response.ok) throw new Error(result.error);
      if(result.secret) {setSecret(result.secret);setTab("projects");} else setNotice("Projeto atualizado.");
      setRevision(value => value+1);
    } catch(error) {setNotice(error instanceof Error ? error.message : "Não foi possível salvar.");}
    finally {setBusy(false);}
  }
  return <div className="mx-auto max-w-6xl space-y-6 text-slate-900">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">Seus projetos conectados</p><h1 className="mt-2 text-3xl font-bold">API de IA</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">Crie um projeto, copie sua chave e comece a usar. Acompanhe tudo em créditos ConnectyHub.</p></div><Link className={primary} href="/docs/api#ia"><Code2 size={17}/>Documentação</Link></header>
    {notice&&<p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">{notice}</p>}
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5"><div><p className="text-sm text-slate-600">Saldo disponível da conta</p><p className="mt-1 text-3xl font-bold tracking-tight text-blue-900">{data ? formatPreciseCredits(Math.max(0,Number(data.wallet?.balance_credits??0)-Number(data.wallet?.reserved_credits??0))) : "…"}<span className="ml-2 text-sm font-medium">créditos</span></p><p className="mt-2 text-xs leading-6 text-slate-600">O mesmo saldo para seus projetos e atendimentos.{data&&Number(data.wallet?.reserved_credits)>0 ? ` ${formatPreciseCredits(Number(data.wallet?.reserved_credits))} créditos em processamento.` : ""}</p></div><Link href="/dashboard/creditos" className={primary}>Adicionar créditos<ArrowRight size={16}/></Link></div>
    <nav aria-label="Painel da API" className="flex gap-2 border-b border-slate-200">{[["usage","Painel de uso"],["projects","Projetos e chaves"]].map(([value,label])=><button key={value} aria-current={tab===value?"page":undefined} className={`min-h-12 border-b-2 px-4 py-3 text-sm font-semibold ${tab===value?"border-blue-700 text-blue-800":"border-transparent text-slate-500 hover:text-slate-900"}`} onClick={()=>setTab(value as typeof tab)}>{label}</button>)}</nav>
    {tab==="usage"&&<>
      <div className="flex flex-wrap items-end gap-3"><label className="min-w-40 flex-1 text-sm font-medium">Projeto<select className={field} value={project} onChange={event=>setProject(event.target.value)}><option value="">Todos os projetos</option>{state?.data.projects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="min-w-40 text-sm font-medium">Período<select className={field} value={days} onChange={event=>setDays(event.target.value)}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select></label><button className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50" aria-label="Atualizar uso" onClick={()=>setRevision(value=>value+1)}><RefreshCw size={17}/></button></div>
      {error?<p role="alert" className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">{error}</p>:!data?<p role="status" className="py-12 text-center text-sm text-slate-500">Carregando seu uso…</p>:<>
        {!data.projects.length&&<div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-blue-300 bg-white p-6"><div><h2 className="font-bold">Conecte seu primeiro projeto</h2><p className="mt-2 text-sm text-slate-600">Dê um nome ao projeto e escolha o perfil de IA da primeira chave.</p></div><button className={primary} onClick={()=>setTab("projects")}><Plus size={16}/>Criar meu projeto</button></div>}
        <div className="grid gap-3 sm:grid-cols-3">{[["Créditos utilizados",formatPreciseCredits(Number(data.usage.totals.credits))],["Solicitações",Number(data.usage.totals.requests).toLocaleString("pt-BR")],["Concluídas",Number(data.usage.totals.completed).toLocaleString("pt-BR")]].map(([label,value])=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>)}</div>
        <AiUsageCharts usage={data.usage}/>
        <p className="text-xs leading-6 text-slate-500">Os gráficos incluem todo o uso registrado no período, com dias no horário de Brasília. Atualize para acompanhar novas solicitações.</p>
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Atividades recentes</h2><p className="mt-1 text-sm text-slate-500">Até 50 solicitações mais recentes do período selecionado.</p>{!data.activity.length&&<p className="mt-5 text-sm text-slate-500">Nenhuma solicitação neste período.</p>}{data.activity.map(item=><details key={item.id} className="mt-3 rounded-xl border border-slate-200 p-4 text-sm"><summary className="cursor-pointer leading-7"><strong>{data.projects.find(value=>value.id===item.project_id)?.name??"Projeto"}</strong><span className="ml-3">{formatPreciseCredits(Number(item.charged_credits))} créditos</span><span className="ml-3 text-slate-500">{statusLabels[item.status]??"Em conferência"}</span></summary><div className="mt-3 space-y-2 text-xs leading-6 text-slate-500"><p>{new Date(item.created_at).toLocaleString("pt-BR")}</p><p className="break-all">Solicitação: {item.id}</p>{Number(item.reserved_credits)>0&&<p>{formatPreciseCredits(Number(item.reserved_credits))} créditos em processamento. O saldo é atualizado ao concluir a conferência.</p>}</div></details>)}</section>
      </>}
    </>}
    {tab==="projects"&&<>
      {secret&&<section className="space-y-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-5"><h2 className="flex items-center gap-2 text-lg font-bold"><Check size={19}/>Sua chave está pronta</h2><p className="text-sm leading-7">Copie agora e configure no servidor do seu projeto. Esta chave aparece completa somente nesta criação.</p><code className="block break-all rounded-xl bg-white p-4 text-xs">{secret}</code><div className="flex flex-wrap gap-3"><button className={primary} onClick={()=>navigator.clipboard.writeText(secret).then(()=>setNotice("Chave copiada.")).catch(()=>setNotice("Não foi possível copiar. Selecione a chave e copie manualmente."))}><Copy size={16}/>Copiar chave</button><button className="min-h-11 px-4 text-sm underline" onClick={()=>setSecret("")}>Já guardei minha chave</button></div><p className="break-all text-xs leading-6">Endereço da API: https://www.connectyhub.com.br/api/v1/ai</p></section>}
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Novo projeto</h2><p className="mt-2 text-sm leading-7 text-slate-500">Dê um nome para identificar o sistema que vai usar sua chave.</p><form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event=>{event.preventDefault();void action({action:"create_project",name:new FormData(event.currentTarget).get("name"),modelId:new FormData(event.currentTarget).get("modelId")});}}><AiModelPicker models={state?.data.models ?? []}/><label className="min-w-0 flex-1 text-sm font-medium">Nome do projeto<input required name="name" maxLength={100} placeholder="Meu aplicativo" className={field}/></label><button disabled={busy || !state?.data.models?.some(model=>model.available)} className={primary}><Plus size={16}/>{busy?"Criando…":"Criar projeto e chave"}</button></form></section>
      {error&&<p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm">{error}</p>}
      <section className="space-y-3"><h2 className="text-lg font-bold">Meus projetos</h2>{state?.data.projects.map(item=><article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="break-words font-bold">{item.name}</h3><p className="mt-1 text-sm text-slate-500">{item.status==="active"?"Pronto para usar":"Pausado"}</p></div><div className="flex flex-wrap gap-2"><details className="min-w-0"><summary className={`${primary} cursor-pointer`}><KeyRound size={16}/>Nova chave</summary><form className="mt-3 w-full max-w-md space-y-3" onSubmit={event=>{event.preventDefault();void action({action:"create_key",projectId:item.id,modelId:new FormData(event.currentTarget).get("modelId")});}}><AiModelPicker models={state?.data.models ?? []}/><button disabled={busy || !state?.data.models?.some(model=>model.available)} className={primary}>Gerar chave com este modelo</button></form></details><button disabled={busy} className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm" onClick={()=>action({action:"toggle_project",projectId:item.id,status:item.status==="active"?"paused":"active"})}>{item.status==="active"?"Pausar":"Ativar"}</button></div></div><details className="mt-3"><summary className="cursor-pointer py-3 text-sm font-semibold text-blue-800">Renomear projeto</summary><form className="flex flex-wrap gap-3" onSubmit={event=>{event.preventDefault();void action({action:"update_project",projectId:item.id,name:new FormData(event.currentTarget).get("name")});}}><input aria-label={`Nome de ${item.name}`} name="name" required maxLength={100} defaultValue={item.name} className={`${field} min-w-0 flex-1`}/><button disabled={busy} className={primary}>Salvar nome</button></form></details>{item.ai_api_keys.map(value=><div key={value.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-xs"><code className="break-all">{value.key_prefix}•••• · {state?.data.models?.find(model=>model.id===value.model_id)?.name ?? "Seleção automática"} · {value.status==="active"?"Ativa":"Revogada"}</code>{value.status==="active"&&<button disabled={busy} className="min-h-11 px-2 font-semibold text-red-700" onClick={()=>action({action:"revoke_key",projectId:item.id,keyId:value.id})}>Revogar chave</button>}</div>)}</article>)}</section>
      <AiPlayground onComplete={()=>setRevision(value=>value+1)}/>
    </>}
    <CreditExplainer/>
    {admin&&<div className="flex flex-wrap gap-4 text-sm"><Link className="text-blue-800 underline" href="/admin/financeiro">Operação financeira</Link><Link className="text-blue-800 underline" href="/admin/api-ia/operacao">Conferência de solicitações</Link></div>}
  </div>;
}