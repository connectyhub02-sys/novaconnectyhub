"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type State={pageId:string;adAccountId:string;scopes:string[];forms:{form_id:string;name:string;enabled:boolean}[];deliveries:{id:string;leadgen_id:string;status:string;error_message:string|null;created_at:string}[]};
const button="rounded-lg border border-blue-200 px-3 py-2 text-sm text-blue-700 disabled:opacity-40";
export function MetaAdsLeadsPanel() {
  const [state,setState]=useState<State|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [forms,setForms]=useState<{id:string;name:string;status:string}[]>([]),[result,setResult]=useState<unknown>(null);
  async function refresh(){const r=await fetch("/api/dashboard/meta-ads-leads",{cache:"no-store"});const data=await r.json();if(r.ok)setState(data);else setError(data.error);}
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/dashboard/meta-ads-leads",{cache:"no-store",signal:controller.signal}).then(async r=>{
      const data=await r.json();if(!controller.signal.aborted){if(r.ok)setState(data);else setError(data.error);}
    }).catch(()=>{if(!controller.signal.aborted)setError("Não foi possível carregar a conexão Meta.");});
    return ()=>controller.abort();
  },[]);
  async function run(action:string,extra:Record<string,unknown>={}) {
    setBusy(true);setError("");setResult(null);
    try{const r=await fetch("/api/dashboard/meta-ads-leads",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...extra})});
      const data=await r.json();if(!r.ok)throw new Error(data.error);if(action==="forms")setForms(data.forms);else setResult(data);await refresh();
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível consultar a Meta.");}finally{setBusy(false);}
  }
  const missing=["ads_mcp_management","ads_management","pages_manage_ads","leads_retrieval"].filter(s=>!state?.scopes.includes(s));
  return <section className="mb-5 rounded-2xl border border-blue-100 bg-white p-5" aria-label="Ads MCP e Lead Ads">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Ads MCP e Lead Ads</h2><p className="mt-1 text-sm text-slate-500">Análise da conta e formulários conectados ao CRM.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">Consultas sem gasto com anúncios</span></div>
    <p className="my-3 text-xs text-slate-500">Conta: {state?.adAccountId||"não selecionada"} · Página: {state?.pageId||"não selecionada"}</p>
    {missing.length>0&&<p className="my-3 rounded-lg bg-amber-50 p-3 text-sm">Autorizações pendentes na conexão: {missing.join(", ")}. <Link className="text-blue-600 underline" href="/api/dashboard/integrations/meta/connect">Reconectar Meta</Link></p>}
    {error&&<p role="alert" className="my-3 text-sm text-red-700">{error}</p>}
    <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-semibold">Ads MCP · conexão e relatórios</summary><div className="mt-3 flex flex-wrap gap-2">
      <button className={button} disabled={busy} onClick={()=>run("mcp_connect")}>Testar MCP oficial</button>
      <button className={button} disabled={busy||!state?.adAccountId} onClick={()=>run("mcp_campaigns")}>Consultar campanhas</button>
      <button className={button} disabled={busy||!state?.adAccountId} onClick={()=>run("mcp_opportunities")}>Ver oportunidades</button>
    </div></details>
    <details className="mt-3 rounded-xl border p-3"><summary className="cursor-pointer text-sm font-semibold">Lead Ads · formulários e recebimento</summary>
      <p className="my-3 text-sm text-slate-500">Escolha quais formulários devem enviar leads ao CRM. A importação não inicia mensagens automáticas.</p>
      <button className={button} disabled={busy} onClick={()=>run("forms")}>Buscar formulários da Página</button>
      {forms.map(f=>{const enabled=state?.forms.find(s=>s.form_id===f.id)?.enabled===true;return <div key={f.id} className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border p-3"><div className="mr-auto"><strong className="text-sm">{f.name}</strong><p className="text-xs text-slate-500">{f.id} · {enabled?"Importação ativa":"Importação pausada"}</p></div><button className={button} disabled={busy} onClick={()=>run("form_enable",{formId:f.id,enabled:!enabled})}>{enabled?"Pausar":"Ativar importação"}</button><button className={button} disabled={busy||!enabled} onClick={()=>run("form_import",{formId:f.id})}>Importar últimos 25</button></div>;})}
      <h3 className="mb-2 mt-5 text-sm font-semibold">Últimos recebimentos</h3>
      {!state?.deliveries.length&&<p className="text-sm text-slate-500">Nenhum lead recebido ainda.</p>}
      {state?.deliveries.map(d=><div key={d.id} className="border-t py-2 text-sm">Lead {d.leadgen_id} · {d.status==="imported"?"Importado no CRM":d.status==="failed"?"Falha — nova tentativa automática":d.status==="pending"?"Aguardando importação":"Ignorado"}{d.error_message&&<p className="text-xs text-red-600">{d.error_message}</p>}</div>)}
    </details>
    {busy&&<p role="status" className="mt-3 text-sm">Consultando a Meta…</p>}
    {result!==null&&<details open className="mt-3 rounded-lg bg-slate-50 p-3"><summary className="text-sm font-semibold">Resultado da operação</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(result,null,2)}</pre></details>}
  </section>;
}
