"use client";
import {useState,type FormEvent} from 'react';
import {publicAiModelDefinitions} from '@/lib/ai-api/public-models';
import {Panel} from './panel-primitives';
type Rate={id:string;model_id:string;meter:string;provider_cost:number;credit_price:number;plan_code:string|null;effective_from:string};
const meters=['input','output','audio_input','audio_output','image_input','image_output','video_input','video_output','document_input','search','maps','indexing_input','cached_input','cache_hour','song','audio_second','video_720p','video_1080p','video_4k','batch_input','batch_output','batch_audio_input','batch_audio_output','batch_image_input','batch_image_output','batch_document_input','batch_video_input'];
const field='rounded-lg border p-2 text-sm bg-transparent';
export function AiOperationRates() {
  const [rates,setRates]=useState<Rate[]>([]),[model,setModel]=useState('flash-3.5'),[meter,setMeter]=useState('input');
  const [cost,setCost]=useState(''),[price,setPrice]=useState(''),[plan,setPlan]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [flags,setFlags]=useState<Record<string,boolean>>({});
  async function load(){setBusy(true);try{const response=await fetch('/api/admin/billing/ai-rates');const data=await response.json();if(!response.ok)throw Error(data.error);setRates(data.rates);setFlags(Object.fromEntries(data.models.map((m:{id:string;enabled:boolean})=>[m.id,m.enabled])));setMessage(`${data.rates.length} versões de tarifas carregadas.`);}catch(error){setMessage(error instanceof Error?error.message:'Falha ao carregar.');}finally{setBusy(false);}}
  async function toggle(){setBusy(true);try{const response=await fetch('/api/admin/billing/ai-rates',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({model_id:model,enabled:!flags[model]})});const data=await response.json();if(!response.ok)throw Error(data.error);setFlags(current=>({...current,[model]:data.enabled}));setMessage('Catálogo atualizado. A disponibilidade também exige acesso operacional ao modelo.');}catch(error){setMessage(error instanceof Error?error.message:'Falha ao atualizar.');}finally{setBusy(false);}}
  async function save(event:FormEvent){event.preventDefault();setBusy(true);try{
    const response=await fetch('/api/admin/billing/ai-rates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model_id:model,meter,provider_cost:Number(cost),credit_price:Number(price),plan_code:plan.trim()||null})});
    const data=await response.json();if(!response.ok)throw Error(data.error);setRates(current=>[data.rate,...current]);setMessage('Nova tarifa vigente. Operações em andamento mantêm o preço reservado.');
  }catch(error){setMessage(error instanceof Error?error.message:'Falha ao salvar.');}finally{setBusy(false);}}
  return <Panel title="Tarifas dos recursos da API de IA" eyebrow="centro de custo" collapsible>
    <p className="mb-4 text-sm">Configure custo em reais e preço em créditos por unidade de consumo. A tarifa vigente mais específica do modelo e do plano tem prioridade. Consultas, segundos, músicas e armazenamento têm medição própria.</p>
    <form onSubmit={save} className="grid gap-3 md:grid-cols-3">
      <label className="grid gap-1 text-xs">Modelo<select className={field} value={model} onChange={e=>setModel(e.target.value)}><option value="*">Todos os modelos</option>{publicAiModelDefinitions.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs">Dimensão de consumo<select className={field} value={meter} onChange={e=>setMeter(e.target.value)}>{meters.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
      <label className="grid gap-1 text-xs">Plano (vazio para todos)<input className={field} value={plan} onChange={e=>setPlan(e.target.value)}/></label>
      <label className="grid gap-1 text-xs">Custo por unidade (R$)<input className={field} required type="number" min="0" step="any" value={cost} onChange={e=>setCost(e.target.value)}/></label>
      <label className="grid gap-1 text-xs">Créditos por unidade<input className={field} required type="number" min="0.000000000001" step="any" value={price} onChange={e=>setPrice(e.target.value)}/></label>
      <button disabled={busy} className="rounded-lg bg-blue-600 p-2 text-sm text-white disabled:opacity-50">Salvar nova tarifa</button>
    </form>
    <p className="my-3 text-xs">Para preços por milhão de unidades, divida por 1.000.000. cache_hour mede unidades de contexto × horas; audio_second e video_* medem segundos; song mede músicas; search e maps medem consultas.</p>
    <button type="button" onClick={load} disabled={busy} className="text-sm underline">Carregar histórico de tarifas</button>
    {model!=='*'&&flags[model]!==undefined&&<button type="button" onClick={toggle} disabled={busy} className="ml-4 text-sm underline">{flags[model]?'Suspender':'Liberar'} modelo no catálogo</button>}
    <p role="status" className="my-2 text-sm">{message}</p>
    {rates.length>0&&<div className="max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead><tr>{['Modelo','Consumo','Plano','Custo R$','Créditos','Vigência'].map(t=><th className="p-2" key={t}>{t}</th>)}</tr></thead><tbody>{rates.filter(r=>r.model_id===model||r.model_id==='*').map(r=><tr key={r.id}>{[r.model_id,r.meter,r.plan_code||'Todos',r.provider_cost,r.credit_price,new Date(r.effective_from).toLocaleString('pt-BR')].map((value,i)=><td className="p-2" key={i}>{value}</td>)}</tr>)}</tbody></table></div>}
  </Panel>;
}
