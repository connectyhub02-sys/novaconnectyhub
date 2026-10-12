"use client";
import {useEffect,useState} from "react";
import type {CreativeBrief} from "@/lib/meta/creative-policy";
import type {CampaignSnapshot} from "@/lib/meta/campaign-policy";
import {CreativeMediaPreview} from "./creative-media-preview";
type Row={id:string;proposal_id:string;status:string;snapshot:CampaignSnapshot;snapshot_hash:string;remote_ids:Record<string,string>;error_message:string|null;start_at:string|null;end_at:string|null};
const field="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const button="rounded-xl border border-blue-200 px-3 py-2 text-sm disabled:opacity-50";
const labels:Record<string,string>={draft:"Pronta para criar pausada",blocked:"Aguardando ajuste na conta Meta",creating:"Criando na Meta",awaiting_media:"Vídeo processando na Meta",paused:"Pausada na Meta",activating:"Ativação em conferência",active:"Ativa na Meta · sujeita à revisão e entrega",pausing:"Pausando",uncertain:"Precisa de conferência"};
export function MetaCampaignLaunch({companyId,proposalId,brief}:{companyId?:string;proposalId:string;brief:CreativeBrief}){
 const [rows,setRows]=useState<Row[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[accepted,setAccepted]=useState(false),[spend,setSpend]=useState(false);
 const [country,setCountry]=useState("BR"),[days,setDays]=useState(7),[budget,setBudget]=useState(brief.dailyBudget||20),[currency,setCurrency]=useState(brief.currency||"BRL"),[destination,setDestination]=useState(brief.destination),[placement,setPlacement]=useState("facebook_feed");
 const endpoint=`/api/dashboard/meta-campaigns${companyId?`?companyId=${encodeURIComponent(companyId)}`:""}`;
 const row=rows.find(r=>r.proposal_id===proposalId);
 async function load(){const r=await fetch(endpoint,{cache:"no-store"}),d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.campaigns);}
 useEffect(()=>{let alive=true;fetch(endpoint,{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(alive)setRows(d.campaigns);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[endpoint]);
 async function act(action:string){setBusy(true);setError("");try{
   const body=action==="prepare"?{action,id:proposalId,settings:{country,ageMin:18,ageMax:65,days,dailyBudget:budget,currency,destination,placement,category:"NONE"}}:{action,id:row?.id,hash:row?.snapshot_hash,approveSpend:spend,totalMinor:row?.snapshot.totalMinor,currency:row?.snapshot.settings.currency};
   const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.campaigns);setSpend(false);
 }catch(e){setError(e instanceof Error?e.message:"Confira a campanha.");await load().catch(()=>undefined);}finally{setBusy(false);}}
 const money=(n:number,c=currency)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:c}).format(n);
 return <section className="space-y-3 rounded-xl border border-blue-200 bg-white p-3 text-sm">
 <h4 className="font-semibold">Criar campanha na Meta</h4>
 <p className="text-xs text-slate-500">Tráfego para seu site · botão Saiba mais · imagens ou vídeos. A preparação por IA usa seus créditos. Criar, consultar, pausar e ativar não chama IA. A verba publicitária é cobrada separadamente pela Meta.</p>
 {!row?<>
 <label className="block">Site de destino<input type="url" className={field} value={destination} disabled={busy} onChange={e=>setDestination(e.target.value)}/></label>
 <div className="grid grid-cols-3 gap-2"><label>Verba média/dia<input type="number" min=".01" step=".01" className={field} value={budget} disabled={busy} onChange={e=>setBudget(Number(e.target.value))}/></label><label>Moeda<select className={field} value={currency} disabled={busy} onChange={e=>setCurrency(e.target.value)}>{["BRL","USD","EUR"].map(c=><option key={c}>{c}</option>)}</select></label><label>Duração (dias)<input type="number" min={1} max={90} className={field} value={days} disabled={busy} onChange={e=>setDays(Number(e.target.value))}/></label></div>
 <div className="grid grid-cols-2 gap-2"><label>País<select className={field} value={country} disabled={busy} onChange={e=>setCountry(e.target.value)}><option value="BR">Brasil</option><option value="PT">Portugal</option><option value="US">Estados Unidos</option></select></label><label>Onde aparecer<select className={field} value={placement} disabled={busy} onChange={e=>setPlacement(e.target.value)}><option value="facebook_feed">Feed Facebook</option><option value="feeds">Feeds Facebook + Instagram</option></select></label></div>
 <p>Público amplo de 18 a 65+ no país escolhido. Os anúncios usam a mesma mídia, com os textos da proposta, distribuídos entre os conjuntos.</p>
 <p className="font-semibold">Limite total da campanha: {money(budget*days)}</p>
 <label className="flex gap-2"><input type="checkbox" checked={accepted} disabled={busy} onChange={e=>setAccepted(e.target.checked)}/>Revisei estas escolhas. Minha campanha não é de crédito, emprego, moradia ou política.</label>
 <button className={`${button} bg-blue-600 text-white`} disabled={busy||!accepted||!destination||!budget} onClick={()=>act("prepare")}>Revisar campanha final</button>
 </>:<>
 <p role="status" className="font-semibold text-blue-700">{labels[row.status]||row.status}</p>
 <p>{row.snapshot.accountName} · {row.snapshot.settings.currency} · {row.snapshot.budgetMode}</p>
 <p>{row.snapshot.ads.length} anúncios · {row.snapshot.adSets.length} conjuntos · {row.snapshot.settings.country} · 18 a 65+ · {row.snapshot.settings.placement==="feeds"?"Feeds Facebook e Instagram":"Feed Facebook"}</p>
 <p>Objetivo: visitas ao site · <a href={row.snapshot.settings.destination} target="_blank" rel="noreferrer" className="text-blue-600 underline">Conferir destino</a></p>
 <p className="font-semibold">Média diária: {money(row.snapshot.dailyMinor/100,row.snapshot.settings.currency)} · Limite total: {money(row.snapshot.totalMinor/100,row.snapshot.settings.currency)}</p>
 <p className="text-xs text-slate-500">A Meta pode variar o gasto entre dias. O limite total é enviado à campanha. Período de {row.snapshot.settings.days} dias contado a partir da criação pausada.{row.end_at?` Fim: ${new Date(row.end_at).toLocaleString("pt-BR")}.`:""}</p>
 <details className="rounded-lg border p-2"><summary className="cursor-pointer">Prévia e textos que serão enviados</summary><div className="mt-3 space-y-3"><CreativeMediaPreview url={row.snapshot.media.url} contentType={row.snapshot.media.contentType} name={row.snapshot.name}/>{row.snapshot.ads.map((a,i)=><div key={i}><strong>{a.headline}</strong><p className="whitespace-pre-wrap">{a.primaryText}</p><p className="text-xs text-blue-600">Saiba mais</p></div>)}</div></details>
 {(["draft","awaiting_media","blocked"].includes(row.status))&&<button className={`${button} bg-blue-600 text-white`} disabled={busy} onClick={()=>act("create_paused")}>{row.status==="awaiting_media"?"Conferir vídeo e concluir pausada":row.status==="blocked"?"Retomar criação pausada":"Criar pausada na Meta"}</button>}
 {row.status==="paused"&&<div className="space-y-3 rounded-lg bg-amber-50 p-3"><label className="flex gap-2"><input type="checkbox" checked={spend} disabled={busy} onChange={e=>setSpend(e.target.checked)}/>Aprovo o criativo, o público e a verba acima. Autorizo ativar esta campanha e gastar até {money(row.snapshot.totalMinor/100,row.snapshot.settings.currency)} na Meta.</label><button className={`${button} bg-blue-600 text-white`} disabled={busy||!spend} onClick={()=>act("activate")}>Aprovar verba e ativar</button></div>}
 {row.remote_ids.campaign&&<div className="flex flex-wrap gap-2"><a className={button} target="_blank" rel="noreferrer" href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${row.snapshot.accountId.replace("act_","")}&selected_campaign_ids=${row.remote_ids.campaign}`}>Ver no Gerenciador Meta</a>{["active","paused","blocked","uncertain"].includes(row.status)&&<button className={button} disabled={busy} onClick={()=>act("pause")}>Pausar campanha</button>}</div>}
 {row.error_message&&<p role="alert" className="text-amber-800">{row.error_message}</p>}
 <button className={button} disabled={busy} onClick={()=>load().catch(e=>setError(e.message))}>Atualizar estado</button>
 </>}
 {busy&&<p role="status">Conferindo a Meta… não é necessário repetir.</p>}{error&&<p role="alert" className="text-amber-800">{error}</p>}
 </section>;
}
