"use client";
import { useState } from "react";
import type { TrendResult } from "@/lib/meta/trend-policy";
type Job = {id:string;status:string;brief:{niche:string;country:string;platform:string};result:TrendResult|null;created_at:string;charge_credits:number|null;error_message:string|null};
const field="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
export function MetaTrendResearch({companyId,onUse}:{companyId?:string;onUse:(text:string)=>void}) {
  const [niche,setNiche]=useState(""),[country,setCountry]=useState("Brasil"),[platform,setPlatform]=useState("Instagram");
  const [jobs,setJobs]=useState<Job[]>([]),[selected,setSelected]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const endpoint=`/api/dashboard/meta-trends${companyId?`?companyId=${encodeURIComponent(companyId)}`:""}`;
  const current=jobs.find(j=>j.id===selected)??jobs[0];
  async function load() {const r=await fetch(endpoint,{cache:"no-store"}),d=await r.json();if(!r.ok)throw Error(d.error);setJobs(d.jobs);}
  async function research() {
    setBusy(true);setError("");const id=crypto.randomUUID();setSelected(id);
    try {const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:id,niche,country,platform})}),d=await r.json();if(!r.ok)throw Error(d.error);setJobs(d.jobs);}
    catch(e){setError(e instanceof Error?e.message:"Pesquisa indisponível.");await load().catch(()=>undefined);}
    finally{setBusy(false);}
  }
  return <details className="rounded-xl border border-slate-200 p-3" onToggle={e=>{if(e.target===e.currentTarget && e.currentTarget.open)load().catch(e=>setError(e.message));}}>
    <summary className="cursor-pointer text-sm font-medium">Pesquisar tendências e ideias</summary>
    <div className="mt-3 space-y-3">
      <p className="text-xs text-slate-500">Pesquisa atual na internet com fontes. Usa créditos de IA, incluindo as consultas de busca. Sem publicação automática.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Seu nicho<input className={field} value={niche} maxLength={200} disabled={busy} onChange={e=>setNiche(e.target.value)} placeholder="Ex.: academia e musculação"/></label>
        <label className="text-sm">País<input className={field} value={country} maxLength={80} disabled={busy} onChange={e=>setCountry(e.target.value)}/></label>
        <label className="text-sm">Plataforma<select className={field} value={platform} disabled={busy} onChange={e=>setPlatform(e.target.value)}>{["Instagram","Facebook","YouTube","TikTok"].map(p=><option key={p}>{p}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-3"><button className="rounded-xl bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy||niche.trim().length<3||country.trim().length<2||jobs.some(j=>!["completed","failed"].includes(j.status))} onClick={research}>{busy?"Pesquisando…":"Pesquisar com IA"}</button><button className="text-sm text-blue-600" disabled={busy} onClick={()=>load().catch(e=>setError(e.message))}>Atualizar histórico</button></div>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      {jobs.length>0&&<select aria-label="Histórico de pesquisas" className={field} value={current?.id??""} onChange={e=>setSelected(e.target.value)}>{jobs.map(j=><option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleString("pt-BR")} · {j.brief.niche} · {j.brief.platform}</option>)}</select>}
      {current&&<p className="text-xs text-slate-500">Pesquisado em {new Date(current.created_at).toLocaleString("pt-BR")} · {current.charge_credits===null?"Consumo em processamento":`${current.charge_credits} créditos`}</p>}
      {current?.error_message&&<p className="text-sm text-amber-800">{current.error_message}</p>}
      {current&&!current.result&&!current.error_message&&<p className="text-sm">Pesquisa em processamento. Atualize o histórico; não é necessário repetir.</p>}
      {current?.result&&<>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{current.result.text}</p>
        <ol className="list-decimal space-y-1 pl-5 text-xs">{current.result.sources.map((s,i)=><li key={i}><a className="text-blue-600 underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}</ol>
        {current.result.attribution&&<iframe title="Sugestões de pesquisa do Google" className="h-40 w-full border-0" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={current.result.attribution}/>}
        <button className="rounded-xl border border-blue-200 px-3 py-2 text-sm text-blue-700" onClick={()=>onUse(`Crie um roteiro original a partir desta pesquisa. Escolha uma oportunidade e adapte ao meu negócio; não apresente hipóteses como fatos.\nPesquisa de ${current.created_at}:\n${current.result!.text}\nFontes:\n${current.result!.sources.map(s=>s.url).join("\n")}`.slice(0,6000))}>Usar no roteiro</button>
      </>}
    </div>
  </details>;
}
