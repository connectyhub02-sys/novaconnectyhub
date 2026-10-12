"use client";
import { useEffect,useState } from "react";
type Config={pixel_id:string;pixel_name:string;enabled:boolean;test_event_code:string|null;ad_account_id:string};
type Snapshot={config:Config|null;adAccountId:string;events:{id:string;event_name:string;status:string;error_message:string|null;test_event_code:string|null;created_at:string}[]};
const field="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900";
const button="rounded-lg border border-blue-200 px-3 py-2 text-sm text-blue-700 disabled:opacity-40";
export function MetaPixelPanel({companyId}:{companyId?:string}) {
  const endpoint=`/api/dashboard/meta-pixel${companyId?`?companyId=${encodeURIComponent(companyId)}`:""}`;
  const [data,setData]=useState<Snapshot|null>(null),[pixels,setPixels]=useState<{id:string;name:string}[]>([]);
  const [pixelId,setPixelId]=useState(""),[enabled,setEnabled]=useState(false),[test,setTest]=useState(true),[code,setCode]=useState("");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>{const controller=new AbortController();fetch(endpoint,{cache:"no-store",signal:controller.signal}).then(async r=>{
    const d=await r.json();if(controller.signal.aborted)return;if(!r.ok){setMessage(d.error);return;}
    setData(d);setPixelId(d.config?.pixel_id||"");setEnabled(d.config?.enabled||false);setCode(d.config?.test_event_code||"");setTest(!d.config||Boolean(d.config.test_event_code));
  }).catch(()=>{});return()=>controller.abort();},[endpoint]);
  async function run(action:string) {
    setBusy(true);setMessage("");
    try {
      if(action==="save"&&enabled&&test&&!code.trim())throw new Error("Informe o código exibido em Eventos de teste da Meta.");
      const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,pixelId,enabled,testEventCode:test?code.trim():""})});
      const d=await r.json();if(!r.ok)throw new Error(d.error);
      if(action==="list")setPixels(d.pixels);
      setMessage(action==="disable"?"Medição pausada.":action==="test"?`${d.sent} evento(s) recebido(s) pela Meta; ${d.failed} falha(s). Confira Eventos de teste.`:action==="save"?"Pixel salvo para esta empresa. A medição exige consentimento do visitante.":`${d.pixels.length} Pixel(s) acessível(is).`);
      if(action==="disable")setEnabled(false);
      const fresh=await fetch(endpoint,{cache:"no-store"});if(fresh.ok)setData(await fresh.json());
    }catch(e){setMessage(e instanceof Error?e.message:"Não foi possível concluir.");}finally{setBusy(false);}
  }
  return <details className="my-3 rounded-xl border border-blue-100 bg-white p-4 text-slate-900">
    <summary className="cursor-pointer text-sm font-semibold">Pixel e API de Conversões {data?.config?.enabled?"· ativado":"· configurar"}</summary>
    <p className="my-3 text-sm text-slate-500">Meça visitas, produtos, carrinho, início de checkout e compras confirmadas nas lojas e páginas desta empresa. O visitante escolhe se autoriza a medição.</p>
    <p className="mb-3 text-xs text-slate-500">Conta de anúncios: {data?.adAccountId||"salve a conexão Meta primeiro"}</p>
    {data?.config&&data.config.ad_account_id!==data.adAccountId&&<p className="my-2 text-sm text-amber-700">A conta mudou. A medição está suspensa até salvar um Pixel da nova conta.</p>}
    <button className={button} disabled={busy} onClick={()=>run("list")}>Buscar Pixels da conta</button>
    <label className="my-3 block text-sm">Pixel / Dataset<select className={field} value={pixelId} onChange={e=>setPixelId(e.target.value)}>
      <option value="">Selecione um Pixel</option>{data?.config&&!pixels.some(p=>p.id===data.config?.pixel_id)&&<option value={data.config.pixel_id}>{data.config.pixel_name} · {data.config.pixel_id}</option>}
      {pixels.map(p=><option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}
    </select></label>
    <label className="my-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Ativar medição nas lojas e páginas da empresa</label>
    <label className="my-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={test} onChange={e=>setTest(e.target.checked)}/>Modo de teste</label>
    {test&&<label className="mb-3 block text-sm">Código de Eventos de teste<input className={field} value={code} onChange={e=>setCode(e.target.value)} placeholder="TEST…"/><span className="text-xs text-slate-500">Gerenciador de Eventos → selecione o Pixel → Eventos de teste. Neste modo, os eventos são enviados somente pelo servidor e marcados como teste.</span></label>}
    <div className="flex flex-wrap gap-2"><button className={button} disabled={busy||!pixelId} onClick={()=>run("save")}>Salvar Pixel</button><button className={button} disabled={busy||!data?.config?.enabled||!data.config.test_event_code} onClick={()=>run("test")}>Enviar evento de teste</button><button className={button} disabled={busy} onClick={()=>run("disable")}>Pausar medição</button></div>
    {message&&<p role="status" className="my-3 text-sm">{message}</p>}
    <p className="my-3 text-xs text-slate-500">A conexão não cria anúncios nem altera orçamento. Eventos recebidos não comprovam atribuição de vendas. Para sites externos, a instalação será uma etapa separada.</p>
    {!!data?.events?.length&&<div className="mt-3 max-h-52 overflow-auto text-xs">{data.events.map(e=><div className="border-t py-2" key={e.id}>{e.event_name} · {e.test_event_code?"Teste":"Produção"} · {({sent:"Recebido pela Meta",pending:"Na fila",sending:"Enviando",failed:"Falha",cancelled:"Cancelado"} as Record<string,string>)[e.status]}{e.error_message&&<p className="text-red-700">{e.error_message}</p>}</div>)}</div>}
  </details>;
}
