'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {Code2,RefreshCw} from 'lucide-react';
import {VoiceUsageCharts} from './voice-usage-charts';
import {VoiceStudioShell} from './voice-studio-shell';
import {StudioAdminControls} from './studio-admin-controls';
import {voiceModelName} from '../../lib/voice-api/model-presentation';
type Summary={requests:number;completed:number;failed:number;pending:number;credits:number;reserved_credits:number;characters:number;daily:{day:string;requests:number;credits:number}[];models:{model_id:string;requests:number;credits:number}[];operations:{operation:string;requests:number;credits:number}[];voices:{voice_id:string;requests:number;credits:number}[];accounts?:{organization_id:string;name:string;requests:number;credits:number;estimated_cost:number;errors:number}[];estimated_provider_cost?:number;effective_provider_cost?:number|null;cost_reconciled_requests?:number;credit_value_brl?:number;estimated_margin_brl?:number};
type AdminProject={id:string;name:string;organization_id:string;status:string};
type History={id:string;project_id:string;operation:string;status:string;charged_credits:number;reserved_credits:number;created_at:string;error_code:string|null;organization_id?:string;model_id?:string};
const number=(n:unknown)=>Number(n??0).toLocaleString('pt-BR',{maximumFractionDigits:6});
async function readResponse(r:Response){const data=await r.json();if(!r.ok)throw new Error(data.error?.message??'Não foi possível concluir.');return data;}
const field='min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:outline-2 focus:outline-blue-500';
const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50';
const box='min-w-0 rounded-2xl border border-slate-200 bg-white p-5';
const statusLabels:Record<string,string>={completed:'Concluída',failed:'Não concluída',reserved:'Em andamento',processing:'Em andamento',uncertain:'Em conferência',verification_required:'Aguardando verificação'};
const operationLabels:Record<string,string>={text_to_speech:'Geração de áudio',voice_clone:'Clonagem de voz',voice_clone_preview:'Prévia de voz'};
// Clients get the Studio (tools, voices, agents, developer area); platform admins get the operational view.
export function VoiceConsole({admin=false}:{admin?:boolean}){return admin?<AdminVoiceConsole/>:<VoiceStudioShell/>;}
function AdminVoiceConsole(){
 const [adminProject,setAdminProject]=useState('');
 const [days,setDays]=useState('30'),[data,setData]=useState<{summary:Summary;history?:History[];adminProjects?:AdminProject[];projectsTruncated?:boolean}|null>(null);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const url=`/api/admin/voice?days=${days}${adminProject?`&project=${encodeURIComponent(adminProject)}`:''}`;
 const refresh=useCallback(async()=>{setData(await fetch(url).then(readResponse));},[url]);
 useEffect(()=>{let active=true;fetch(url).then(readResponse).then(next=>{if(active)setData(next);}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[url]);
 async function act(action:()=>Promise<void>){setBusy(true);setMessage('');try{await action();}catch(e){setMessage(e instanceof Error?e.message:'Falha na operação.');}finally{setBusy(false);}}
 const summary=data?.summary;
 return <div className="mx-auto min-w-0 max-w-6xl space-y-6 text-slate-900">
  <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">Operação da plataforma</p><h1 className="mt-2 text-3xl font-bold">Estúdio de Voz e Áudio</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">Acompanhe o consumo, os custos e os resultados de voz por cliente.</p></div><Link href="/docs/api#voz" className={button}><Code2 size={17}/>Documentação</Link></header>
  <section className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm"><span className="mr-auto text-slate-600">Visão operacional. Vozes e arquivos privados continuam nos respectivos projetos.</span><Link className="min-h-11 content-center font-semibold text-blue-800 underline" href="/admin/financeiro">Tarifas, modelos e disponibilidade</Link><Link className="min-h-11 content-center font-semibold text-blue-800 underline" href="/admin/maintenance">Configuração do serviço</Link></section>
  <StudioAdminControls/>
  {message&&<p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{message}</p>}
  <div className="flex flex-wrap items-end gap-3">
   <label className="min-w-0 flex-1 text-sm font-medium">Projeto<select aria-label="Filtrar projeto de voz" className={`${field} mt-2`} value={adminProject} onChange={e=>{setData(null);setAdminProject(e.target.value);}}><option value="">Todos os projetos</option>{data?.adminProjects?.map(p=><option key={p.id} value={p.id}>{p.name} · {p.id.slice(0,8)}</option>)}</select></label>
   <label className="text-sm font-medium">Período<select aria-label="Período de uso" className={`${field} mt-2`} value={days} onChange={e=>{setData(null);setDays(e.target.value);}}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select></label>
   <button aria-label="Atualizar Estúdio de Voz e Áudio" className="ml-auto grid size-11 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50" onClick={()=>act(refresh)} disabled={busy}><RefreshCw size={17} className={busy?'animate-spin':''}/></button>
  </div>
  {!data||!summary?<p role="status" className="py-12 text-center text-sm text-slate-500">{message?'Não foi possível carregar os dados. Tente atualizar.':'Carregando…'}</p>:<>
   {data.projectsTruncated&&<p className="text-sm text-amber-800">O seletor mostra os primeiros 1.000 projetos. Os totais incluem todos os projetos do filtro.</p>}
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Solicitações',summary.requests],['Concluídas',summary.completed],['Créditos debitados',summary.credits],['Falhas / pendentes',`${number(summary.failed)} / ${number(summary.pending)}`]].map(([label,value])=><div className={box} key={String(label)}><p className="text-sm text-slate-500">{label}</p><strong className="mt-2 block text-2xl">{typeof value==='string'?value:number(value)}</strong></div>)}</div>
   <VoiceUsageCharts daily={summary.daily}/>
   <p className="text-xs leading-6 text-slate-500">Os gráficos usam recibos reais, agrupados em UTC.</p>
   <div className="grid gap-5 lg:grid-cols-3">{[['Modelos',summary.models?.map(v=>({label:voiceModelName(v.model_id),...v}))],['Operações',summary.operations?.map(v=>({label:operationLabels[v.operation]??v.operation,...v}))],['Vozes',summary.voices?.map(v=>({label:v.voice_id,...v}))]].map(([label,rows])=><div className={box} key={String(label)}><h3 className="font-bold">{String(label)}</h3>{!(rows as unknown[]|undefined)?.length&&<p className="mt-4 text-sm text-slate-500">Nenhum consumo neste período.</p>}{(rows as {label:string;requests:number;credits:number}[]|undefined)?.map(row=><div key={row.label} className="mt-3 text-sm"><p className="break-all text-slate-700">{row.label}</p><p className="text-xs text-slate-500">{row.requests} solicitações · {number(row.credits)} créditos</p></div>)}</div>)}</div>
   <div className="grid gap-3 md:grid-cols-3">{[['Custo estimado do fornecedor (R$)',summary.estimated_provider_cost],['Valor equivalente dos créditos (R$)',summary.credit_value_brl],['Margem estimada (R$)',summary.estimated_margin_brl]].map(([label,value])=><div className={box} key={String(label)}><p className="text-sm text-slate-500">{label}</p><strong className="text-xl">{value==null?'Não apurado':number(value)}</strong></div>)}</div>
   <p className="text-xs text-slate-500">Custos estimados pelas tarifas configuradas. Custo efetivo apurado em {summary.cost_reconciled_requests==null?'quantidade não informada':number(summary.cost_reconciled_requests)} de {number(summary.completed)} operações concluídas: {summary.effective_provider_cost==null?'ainda não disponível':number(summary.effective_provider_cost)}. Valor de créditos consumidos não equivale a receita recebida neste período.</p>
   <div className={`${box} overflow-x-auto`}><table className="w-full text-left text-sm"><thead><tr><th>Cliente</th><th>Operações</th><th>Créditos</th><th>Falhas/pendências</th></tr></thead><tbody>{summary.accounts?.map(a=><tr key={a.organization_id} className="border-t border-slate-200"><td className="py-3">{a.name}</td><td>{a.requests}</td><td>{number(a.credits)}</td><td>{a.errors}</td></tr>)}</tbody></table></div>
   <section className={box}><h3 className="text-lg font-bold">Atividades recentes</h3><p className="mt-1 text-sm text-slate-500">Até 50 solicitações mais recentes do período selecionado.</p>{!data.history?.length&&<p className="mt-5 text-sm text-slate-500">Nenhuma solicitação neste período.</p>}{data.history?.map(r=><details key={r.id} className="mt-3 rounded-xl border border-slate-200 p-4 text-sm"><summary className="cursor-pointer leading-7"><strong>{data.adminProjects?.find(p=>p.id===r.project_id)?.name??'Projeto'}</strong><span className="ml-3">{number(r.charged_credits)} créditos</span><span className="ml-3 text-slate-500">{statusLabels[r.status]??'Em conferência'}</span></summary><div className="mt-3 space-y-2 text-xs leading-6 text-slate-500"><p>{new Date(r.created_at).toLocaleString('pt-BR')} · {operationLabels[r.operation]??r.operation}</p><p className="break-all">Solicitação: {r.id}</p><p className="break-all">Projeto: {r.project_id} · Conta: {r.organization_id}</p><p>Modelo: {voiceModelName(r.model_id??'')}</p>{Number(r.reserved_credits)>0&&<p>{number(r.reserved_credits)} créditos em processamento.</p>}{r.error_code&&<p className="break-words text-amber-800">Código de erro: {r.error_code}</p>}</div></details>)}</section>
  </>}
 </div>;
}
