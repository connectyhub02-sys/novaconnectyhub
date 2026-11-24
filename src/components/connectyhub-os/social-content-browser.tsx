'use client';
/* eslint-disable @next/next/no-img-element -- Meta thumbnails are short-lived CDN URLs. */
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import Link from 'next/link';
import {Dialog} from 'radix-ui';
import {CalendarDays,ChevronLeft,ChevronRight,Columns3,ExternalLink,Film,MoreHorizontal,Search,X} from 'lucide-react';
import {DropdownMenu,DropdownMenuCheckboxItem,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import type {ContentMetrics} from '@/lib/meta/content-metrics';
import {contentKindLabels,contentMatches,contentStatus,contentTabs,groupRemotePosts,inPeriod,localDay,monthDays,remoteKind,type ContentKind,type ContentTab,type ContentPost,type ContentDelivery} from '@/lib/social/content-view';
import {targets,type Target} from '@/lib/social/publishing-policy';
import type {SocialShell} from '@/lib/social/policy';
import type {InboxPost,InboxNetwork} from '@/lib/meta/inbox-model';
import {SocialBrandMark} from './social-brand-marks';
const names:Record<Target,string>={facebook:'Facebook',instagram:'Instagram',youtube:'YouTube',tiktok:'TikTok'};
const tones:Record<Target,string>={facebook:'bg-blue-50 text-blue-700',instagram:'bg-fuchsia-50 text-fuchsia-700',youtube:'bg-red-50 text-red-700',tiktok:'bg-slate-100 text-slate-800'};
const secondary='inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const select='mt-1 block min-h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm sm:w-auto sm:px-3';
const PAGE_SIZE=25, AUTO_PAGES=8;
const periods:{value:string;label:string;days:number|null}[]=[{value:'7',label:'Últimos 7 dias',days:7},{value:'30',label:'Últimos 30 dias',days:30},{value:'90',label:'Últimos 90 dias',days:90},{value:'365',label:'Últimos 12 meses',days:365},{value:'all',label:'Todo o período',days:null}];
type Props={companyId:string;shell:SocialShell;calendar:boolean;posts:ContentPost[];deliveries:ContentDelivery[];media:{id:string;url:string}[];onOpen:(post:ContentPost)=>void;onCreate:()=>void;canManage:boolean};
type MetricRef={network:InboxNetwork;id:string};
type Row={key:string;date:string;title:string;networks:Target[];kind:ContentKind;post:ContentPost|null;group:InboxPost[];refs:MetricRef[];thumb:string|null;video:string|null;comments:number|null;status:string};
type MetricKey='views'|'reach'|'interactions'|'comments';
const metricColumns:{key:MetricKey;label:string;hint:string}[]=[{key:'views',label:'Visualizações',hint:'Quantas vezes o conteúdo foi exibido ou reproduzido.'},{key:'reach',label:'Alcance',hint:'Instagram: contas alcançadas. Facebook: visualizadores únicos. Em publicações cruzadas, soma das redes.'},{key:'interactions',label:'Interações',hint:'Curtidas ou reações, comentários, compartilhamentos e salvamentos informados pela rede.'},{key:'comments',label:'Comentários',hint:'Comentários informados pela rede.'}];
const fmt=new Intl.NumberFormat('pt-BR');
const sumOf=(values:(number|null|undefined)[])=>{const ok=values.filter((v):v is number=>typeof v==='number');return ok.length?ok.reduce((a,b)=>a+b,0):null;};
export function SocialNetworkBadge({target}:{target:Target}) {return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${tones[target]}`}>{names[target]}</span>;}
export function SocialContentBrowser({companyId,shell,calendar,posts,deliveries,media,onOpen,onCreate,canManage}:Props){
 const [tab,setTab]=useState<ContentTab>('published'),[search,setSearch]=useState(''),[network,setNetwork]=useState(''),[kind,setKind]=useState(''),[period,setPeriod]=useState('90'),[page,setPage]=useState(0);
 const [month,setMonth]=useState(()=>new Date()),[day,setDay]=useState<string|null>(null),[external,setExternal]=useState<InboxPost[]|null>(null);
 const [remote,setRemote]=useState<Partial<Record<InboxNetwork,{posts:InboxPost[];after:string|null;pages:number;error?:string}>>>({});
 const [loading,setLoading]=useState<Partial<Record<InboxNetwork,boolean>>>({});
 const [now]=useState(()=>Date.now());
 const [metrics,setMetrics]=useState<Record<string,ContentMetrics&{unavailable?:boolean}>>({}),[columns,setColumns]=useState<MetricKey[]>(['views','reach','interactions','comments']);
 const requested=useRef(new Set<string>());
 const [missingPerms,setMissingPerms]=useState<Partial<Record<InboxNetwork,string[]>>>({});
 const base=`/api/dashboard/social/content?shell=${shell}&companyId=${encodeURIComponent(companyId)}`;
 const periodDays=periods.find(p=>p.value===period)?.days??null;
 useEffect(()=>{
  if(calendar)return;
  const controller=new AbortController();
  for(const n of ['instagram','facebook'] as const){
   void fetch(`${base}&network=${n}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const r=await response.json();if(!response.ok)throw Error(r.error||'Consulta indisponível.');return r;}).then(r=>setRemote(s=>({...s,[n]:{...r,pages:1}}))).catch(e=>{if(!controller.signal.aborted)setRemote(s=>({...s,[n]:{posts:[],after:null,pages:1,error:e.message}}));});
  }
  return()=>controller.abort();
 },[base,calendar]);
 async function more(n:InboxNetwork){setLoading(s=>({...s,[n]:true}));try{
  const r=await fetch(`${base}&network=${n}&after=${encodeURIComponent(remote[n]?.after??'')}`,{cache:'no-store'}),result=await r.json();if(!r.ok)throw Error(result.error||'Consulta indisponível.');
  setRemote(s=>({...s,[n]:{posts:[...new Map([...(s[n]?.posts??[]),...result.posts].map((p:InboxPost)=>[p.id,p])).values()],after:result.after,pages:(s[n]?.pages??1)+1}}));
 }catch(e){setRemote(s=>({...s,[n]:{posts:s[n]?.posts??[],after:null,pages:s[n]?.pages??1,error:e instanceof Error?e.message:'Consulta indisponível.'}}));}finally{setLoading(s=>({...s,[n]:false}));}}
 // Busca páginas mais antigas automaticamente até cobrir o período escolhido (com limite).
 useEffect(()=>{
  if(calendar||periodDays===null)return;
  for(const n of ['instagram','facebook'] as const){
   const r=remote[n];if(!r?.after||loading[n]||r.pages>=AUTO_PAGES)continue;
   const oldest=r.posts.reduce((min,p)=>Math.min(min,Date.parse(p.timestamp)),Infinity);
   if(inPeriod(new Date(oldest).toISOString(),periodDays,now))void more(n);
  }
 // eslint-disable-next-line react-hooks/exhaustive-deps -- more() reads the latest remote state
 },[remote,periodDays,calendar,now]);
 const matching=(text:string,date:string,nets:string[],rowKind:ContentKind)=>
  text.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))&&(!network||nets.includes(network))&&(!kind||kind===rowKind)&&inPeriod(date,periodDays,now);
 const delivered=new Set(deliveries.filter(d=>d.status==='published').map(d=>`${d.target}:${d.provider_id}`));
 const ownRows:Row[]=posts.filter(p=>contentMatches(p,deliveries.filter(d=>d.post_id===p.id),tab,now)).map(p=>{
  const ds=deliveries.filter(d=>d.post_id===p.id),legacyMedia=p.legacy?.media??[];
  const k:ContentKind=p.legacy?(legacyMedia.length>1?'carousel':legacyMedia[0]?.type==='video'?'video':'image'):'video';
  const refs=ds.filter(d=>d.status==='published'&&d.provider_id&&(d.target==='instagram'||d.target==='facebook')).map(d=>({network:d.target as InboxNetwork,id:d.provider_id!}));
  return {key:`local:${p.id}`,date:p.scheduled_for??p.created_at,title:p.draft.title||p.draft.caption||'Publicação sem legenda',networks:p.draft.targets,kind:k,post:p,group:[],refs,thumb:legacyMedia[0]?.type==='image'?legacyMedia[0].url:null,video:media.find(m=>m.id===p.draft.mediaId)?.url??null,comments:null,status:contentStatus(p,ds,now)};
 }).filter(r=>matching(`${r.title} ${r.post!.draft.caption}`,r.date,r.networks,r.kind));
 const remoteRows:Row[]=tab!=='published'?[]:groupRemotePosts(Object.values(remote).flatMap(r=>r?.posts??[]).filter(p=>!delivered.has(`${p.network}:${p.id}`))).map(group=>{
  const first=group[0],withThumb=group.find(p=>p.media[0]?.thumbnail||p.media[0]?.type==='image');
  const counts=group.map(p=>p.commentsCount).filter((c):c is number=>typeof c==='number');
  return {key:`remote:${group.map(p=>`${p.network}:${p.id}`).join('|')}`,date:first.timestamp,title:first.caption||'Publicação sem legenda',networks:group.map(p=>p.network),kind:remoteKind(first),post:null,group,refs:group.map(p=>({network:p.network,id:p.id})),thumb:withThumb?(withThumb.media[0].thumbnail||withThumb.media[0].url):null,video:null,comments:counts.length?counts.reduce((a,b)=>a+b,0):null,status:'Publicada'};
 }).filter(r=>matching(r.title,r.date,r.networks,r.kind));
 const rows=[...ownRows,...remoteRows].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
 const pageCount=Math.max(1,Math.ceil(rows.length/PAGE_SIZE)),current=Math.min(page,pageCount-1),visible=rows.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE);
 const visibleRefs=visible.flatMap(r=>r.refs).map(r=>`${r.network}:${r.id}`).join(',');
 useEffect(()=>{
  if(calendar||!visibleRefs)return;
  for(const n of ['instagram','facebook'] as const){
   const ids=visibleRefs.split(',').filter(k=>k.startsWith(`${n}:`)&&!requested.current.has(k)).map(k=>k.slice(n.length+1));
   if(!ids.length)continue;
   ids.forEach(id=>requested.current.add(`${n}:${id}`));
   void fetch(`${base}&network=${n}&ids=${ids.map(encodeURIComponent).join(',')}`,{cache:'no-store'}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error);return {metrics:v.metrics as Record<string,ContentMetrics>,missing:(v.missingPermissions??[]) as string[]};})
    .then(({metrics:m,missing})=>{setMissingPerms(s=>({...s,[n]:missing}));setMetrics(s=>({...s,...Object.fromEntries(Object.entries(m).map(([id,v])=>[`${n}:${id}`,v]))}));})
    .catch(()=>setMetrics(s=>({...s,...Object.fromEntries(ids.map(id=>[`${n}:${id}`,{views:null,reach:null,interactions:null,unavailable:true}]))})));
  }
 },[visibleRefs,base,calendar]);
 const metricOf=(row:Row,key:MetricKey)=>key==='comments'?row.comments:sumOf(row.refs.map(r=>metrics[`${r.network}:${r.id}`]?.[key]));
 const metricPending=(row:Row)=>row.refs.some(r=>!metrics[`${r.network}:${r.id}`]);
 const perNetwork=(row:Row,key:MetricKey):{network:InboxNetwork;value:number|null}[]=>key==='comments'
  ?row.group.map(p=>({network:p.network,value:p.commentsCount}))
  :row.refs.map(r=>({network:r.network,value:metrics[`${r.network}:${r.id}`]?.[key]??null}));
 const missingList=[...new Set(Object.values(missingPerms).flat())] as string[];
 const shownColumns=metricColumns.filter(c=>columns.includes(c.key));
 const gridStyle={'--content-cols':`minmax(16rem,1fr) 8rem 6.5rem ${shownColumns.map(()=>'5.75rem').join(' ')} 2.5rem`} as CSSProperties;
 const filtersActive=Boolean(search||network||kind);
 const resetPage=<T,>(set:(v:T)=>void)=>(v:T)=>{set(v);setPage(0);};
 const scheduled=posts.filter(p=>p.scheduled_for&&p.state!=='draft'&&p.state!=='cancelled'&&matching(`${p.draft.title} ${p.draft.caption}`,p.scheduled_for,p.draft.targets,'video'));
 const agenda=day?scheduled.filter(p=>localDay(new Date(p.scheduled_for!))===day):scheduled.filter(p=>{const d=new Date(p.scheduled_for!);return d.getMonth()===month.getMonth()&&d.getFullYear()===month.getFullYear();});
 const loadingRemote=!calendar&&(!remote.facebook||!remote.instagram||Boolean(loading.facebook||loading.instagram));
 const open=(row:Row)=>row.post?onOpen(row.post):setExternal(row.group);
 return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm">
  {!calendar&&<nav aria-label="Estado das publicações" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-3">{contentTabs.map(t=><button key={t.key} type="button" aria-current={tab===t.key?'page':undefined} onClick={()=>{setTab(t.key);setPage(0);}} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium ${tab===t.key?'border-blue-600 text-blue-700':'border-transparent text-slate-600 hover:bg-slate-50'}`}>{t.label}</button>)}</nav>}
  <div className={`grid gap-2 p-3 sm:flex sm:flex-wrap sm:items-end sm:gap-3 sm:p-4 ${calendar?"grid-cols-1":"grid-cols-3"}`}>
   {!calendar&&<label className="min-w-0 text-xs text-slate-600">Tipo<select className={select} value={kind} onChange={e=>resetPage(setKind)(e.target.value)}><option value="">Todos os tipos</option>{(Object.keys(contentKindLabels) as ContentKind[]).map(k=><option key={k} value={k}>{contentKindLabels[k]}</option>)}</select></label>}
   <label className="min-w-0 text-xs text-slate-600">Rede<select className={select} value={network} onChange={e=>resetPage(setNetwork)(e.target.value)}><option value="">Todas as redes</option>{targets.map(n=><option key={n} value={n}>{names[n]}</option>)}</select></label>
   <label className={`relative order-first min-w-0 sm:order-none sm:flex-1 sm:basis-56 ${calendar?"":"col-span-3"}`}><span className="sr-only">Buscar publicação</span><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input className="min-h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm" placeholder="Pesquisar título ou legenda" value={search} onChange={e=>resetPage(setSearch)(e.target.value)}/></label>
   {!calendar&&<label className="min-w-0 text-xs text-slate-600">Período<select className={select} value={period} onChange={e=>resetPage(setPeriod)(e.target.value)}>{periods.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>}
  </div>
  {calendar?<>
   <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-200 px-4 py-3"><h2 className="flex items-center gap-2 text-lg font-semibold capitalize"><CalendarDays size={20}/>{month.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</h2><div className="flex gap-2"><button className={secondary} aria-label="Mês anterior" onClick={()=>{setMonth(new Date(month.getFullYear(),month.getMonth()-1,1));setDay(null);}}><ChevronLeft size={18}/></button><button className={secondary} onClick={()=>{setMonth(new Date());setDay(null);}}>Hoje</button><button className={secondary} aria-label="Próximo mês" onClick={()=>{setMonth(new Date(month.getFullYear(),month.getMonth()+1,1));setDay(null);}}><ChevronRight size={18}/></button></div></div>
   <p className="px-4 py-2 text-xs text-slate-500">Horários no fuso {Intl.DateTimeFormat().resolvedOptions().timeZone}. Selecione um dia para ver a agenda.</p>
   <div className="grid grid-cols-7">{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d=><div key={d} className="border-b border-slate-200 py-2 text-center text-xs font-semibold text-slate-500">{d}</div>)}{monthDays(month).map(d=>{const key=localDay(d),events=scheduled.filter(p=>localDay(new Date(p.scheduled_for!))===key);return <button key={key} aria-label={`${d.toLocaleDateString('pt-BR')}, ${events.length} publicações`} aria-pressed={day===key} onClick={()=>setDay(day===key?null:key)} className={`min-h-20 min-w-0 border-b border-r border-slate-100 p-1 text-left align-top sm:min-h-28 sm:p-2 ${day===key?'bg-blue-50 ring-1 ring-inset ring-blue-400':d.getMonth()!==month.getMonth()?'bg-slate-50 text-slate-400':'hover:bg-slate-50'}`}><span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${key===localDay(new Date())?'bg-blue-600 font-bold text-white':''}`}>{d.getDate()}</span>{events.slice(0,2).map(p=><span key={p.id} className="mt-1 block truncate rounded bg-blue-100 px-1 py-1 text-[10px] text-blue-900 sm:text-xs"><span className="hidden sm:inline">{new Date(p.scheduled_for!).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · </span>{p.draft.title}</span>)}{events.length>2&&<span className="text-[10px] text-blue-700">+{events.length-2}</span>}</button>;})}</div>
   <div className="p-4"><h3 className="mb-3 font-semibold">{day?`Agenda de ${day.split('-').reverse().join('/')}`:'Agenda do mês'}</h3>{!agenda.length&&<p className="py-5 text-sm text-slate-500">Nenhuma publicação agendada neste período.</p>}{agenda.sort((a,b)=>Date.parse(a.scheduled_for!)-Date.parse(b.scheduled_for!)).map(p=><button key={p.id} className="mb-2 flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-left text-sm hover:bg-slate-50" onClick={()=>onOpen(p)}><span><strong>{p.draft.title}</strong><span className="mt-1 block text-xs text-slate-500">{new Date(p.scheduled_for!).toLocaleString('pt-BR')}</span></span><span className="flex flex-wrap gap-1">{p.draft.targets.map(t=><SocialNetworkBadge target={t} key={t}/>)}</span><span>{contentStatus(p,deliveries.filter(d=>d.post_id===p.id),now)}</span></button>)}</div>
  </>:<>
   {tab==='published'&&missingList.length>0&&<div role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
    <p><strong>Visualizações e alcance indisponíveis:</strong> a conexão com o Meta não tem a permissão {missingList.map((p,i)=><span key={p}>{i>0?' e ':''}<code className="rounded bg-amber-100 px-1">{p}</code></span>)}. Interações e comentários continuam aparecendo.</p>
    <p className="mt-1">{shell==='admin'?<>Inclua essas permissões na configuração de login do aplicativo no Meta e reconecte em <Link className="underline" href="/admin/redes-sociais/contas">Contas conectadas</Link>. Para clientes, elas também precisam estar aprovadas na revisão do aplicativo.</>:<>Reconecte o Instagram e Facebook em <Link className="underline" href="/dashboard/redes-sociais/contas">Contas conectadas</Link> e autorize o acesso às estatísticas. Se a opção não aparecer, fale com o suporte.</>}</p>
   </div>}
   <div className="hidden items-center gap-4 border-y border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-600 lg:grid lg:[grid-template-columns:var(--content-cols)]" style={gridStyle}><span>Conteúdo</span><span>Data</span><span>Estado</span>{shownColumns.map(c=><span key={c.key} title={c.hint} className="cursor-help text-right">{c.label}</span>)}<span className="flex justify-end"><ColumnPicker columns={columns} onChange={setColumns}/></span></div>
   {visible.map(row=>{const date=new Date(row.date);return <article key={row.key} style={gridStyle} className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-3 hover:bg-slate-50/60 lg:gap-4 lg:px-5 lg:[grid-template-columns:var(--content-cols)]">
    <button className="flex min-w-0 items-center gap-3 text-left" onClick={()=>open(row)}>
     <span className="relative h-14 w-14 shrink-0"><span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">{row.thumb?<img src={row.thumb} alt="" loading="lazy" className="h-full w-full object-cover"/>:row.video?<video src={row.video} preload="none" muted className="h-full w-full object-cover"/>:<Film size={20}/>}</span><span className="absolute -bottom-1.5 -right-1.5 flex gap-0.5 rounded-md bg-white p-0.5 shadow-sm">{row.networks.map(n=><SocialBrandMark key={n} brand={n} size={14}/>)}</span></span>
     <span className="min-w-0 flex-1"><span className="line-clamp-2 break-words text-sm font-medium text-slate-900">{row.title}</span><span className="mt-1 block truncate text-xs text-slate-500">{contentKindLabels[row.kind]} · {row.networks.length>1?`Publicação cruzada · ${row.networks.length} redes`:names[row.networks[0]]??'—'}{row.post&&!row.post.legacy?' · Criada na ConnectyHub':''}</span><span className="mt-0.5 block text-xs text-slate-500 lg:hidden">{date.toLocaleDateString('pt-BR')} {date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · {row.status}{metricOf(row,'views')!==null?` · ${fmt.format(metricOf(row,'views')!)} visualizações`:''}{row.comments!==null?` · ${row.comments} comentários`:''}</span></span>
    </button>
    <span className="hidden text-xs leading-5 text-slate-600 lg:block">{date.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'})}<br/>{date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
    <span className="hidden text-sm font-medium text-slate-700 lg:block">{row.status}</span>
    {shownColumns.map(c=>{const v=metricOf(row,c.key),parts=perNetwork(row,c.key);return <span key={c.key} className="hidden text-right tabular-nums lg:block" title={v===null&&!metricPending(row)&&c.key!=='comments'?'A rede não informou esta métrica para este conteúdo (permissão, tipo de mídia ou dado ainda em processamento).':undefined}>
     <span className="block text-sm font-medium text-slate-800">{v!==null?fmt.format(v):metricPending(row)&&c.key!=='comments'?'…':'—'}</span>
     {parts.length>1&&<span className="mt-0.5 flex flex-col items-end gap-0.5">{parts.map(p=><span key={p.network} className="inline-flex items-center gap-1 text-[11px] text-slate-500"><SocialBrandMark brand={p.network} size={11}/>{p.value!==null?fmt.format(p.value):'—'}</span>)}</span>}
    </span>;})}
    <RowMenu row={row} shell={shell} onOpen={()=>open(row)}/>
   </article>;})}
   {!rows.length&&<div className="px-6 py-14 text-center"><Film size={32} className="mx-auto mb-3 text-slate-300"/><h3 className="font-semibold">{loadingRemote&&tab==='published'?'Consultando publicações…':'Nenhuma publicação nesta seleção'}</h3><p className="mt-2 text-sm text-slate-500">{filtersActive?'Altere os filtros ou o período para ver outros conteúdos.':'Crie seu conteúdo e escolha em quais redes publicar.'}</p>{canManage&&!filtersActive&&!(loadingRemote&&tab==='published')&&<button className={`${secondary} mt-4`} onClick={onCreate}>Criar publicação</button>}</div>}
   <footer className="space-y-2 bg-slate-50 px-4 py-3 text-xs text-slate-500">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <p>{rows.length?`${current*PAGE_SIZE+1}–${Math.min(rows.length,(current+1)*PAGE_SIZE)} de ${rows.length} conteúdos`:'0 conteúdos'}{loadingRemote&&tab==='published'?' · consultando os perfis…':''}</p>
     {pageCount>1&&<div className="flex items-center gap-2"><button className={secondary} disabled={current===0} onClick={()=>setPage(current-1)} aria-label="Página anterior"><ChevronLeft size={16}/></button><span>Página {current+1} de {pageCount}</span><button className={secondary} disabled={current>=pageCount-1} onClick={()=>setPage(current+1)} aria-label="Próxima página"><ChevronRight size={16}/></button></div>}
    </div>
    <p>A mesma publicação em redes diferentes aparece numa linha só quando a legenda é igual e os horários ficam a até 15 minutos.</p>
    {(['instagram','facebook'] as const).map(n=><div key={n}>{remote[n]?.error&&<p>{names[n]}: {remote[n]?.error} <Link className="underline" href={shell==='admin'?'/admin/redes-sociais/contas':'/dashboard/redes-sociais/contas'}>Ver conexão</Link></p>}{tab==='published'&&remote[n]?.after&&!loading[n]&&(periodDays===null||remote[n]!.pages>=AUTO_PAGES)&&<button className={`${secondary} mt-1`} onClick={()=>void more(n)}>Carregar publicações mais antigas do {names[n]}</button>}</div>)}
   </footer>
  </>}
  <Dialog.Root open={Boolean(external)} onOpenChange={value=>{if(!value)setExternal(null);}}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50"/><Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 shadow-2xl"><Dialog.Title className="pr-10 text-lg font-semibold">{external&&external.length>1?`Publicação em ${external.length} redes`:`Publicação no ${external?names[external[0].network]:''}`}</Dialog.Title><Dialog.Description className="mt-1 text-sm text-slate-500">Conteúdo consultado nos perfis conectados.</Dialog.Description><Dialog.Close aria-label="Fechar detalhes" className="absolute right-4 top-4 rounded-lg p-2 hover:bg-slate-100"><X size={20}/></Dialog.Close>{external&&<>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">{external[0].media.map((m,i)=><div key={i} className="overflow-hidden rounded-lg bg-slate-50">{m.type==='video'&&m.url?<video controls preload="none" src={m.url} poster={m.thumbnail??undefined} className="max-h-80 w-full"/>:(m.thumbnail||m.url)?<img src={(m.thumbnail||m.url)!} alt="Mídia da publicação" className="max-h-80 w-full object-contain"/>:null}</div>)}</div>
   <p className="my-5 whitespace-pre-wrap break-words text-sm leading-6">{external[0].caption}</p>
   <h3 className="mb-2 text-sm font-semibold">Resultado por rede</h3>
   <ul className="space-y-2">{external.map(p=><li key={`${p.network}:${p.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"><span className="flex items-center gap-2"><SocialBrandMark brand={p.network} size={20}/><strong>{names[p.network]}</strong><span className="text-slate-500">{new Date(p.timestamp).toLocaleString('pt-BR')}{typeof p.commentsCount==='number'?` · ${p.commentsCount} comentários`:''}{networkMetricsText(metrics[`${p.network}:${p.id}`])}</span></span>{p.permalink&&<a className="inline-flex items-center gap-1 text-blue-700 hover:underline" href={p.permalink} target="_blank" rel="noreferrer">Abrir <ExternalLink size={14}/></a>}</li>)}</ul>
   <Link className={`${secondary} mt-4`} href={shell==='admin'?'/admin/meta/atendimento':'/dashboard/meta/atendimento'}>Comentários na caixa de entrada</Link>
  </>}</Dialog.Content></Dialog.Portal></Dialog.Root>
 </div>;
}
function RowMenu({row,shell,onOpen}:{row:Row;shell:SocialShell;onOpen:()=>void}){
 return <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`Ações de ${row.title.slice(0,40)}`} className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><MoreHorizontal size={18}/></button></DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="min-w-52">
   <DropdownMenuItem onSelect={onOpen}>{row.post?.state==='draft'&&!row.post.legacy?'Editar rascunho':row.post?.legacy?'Gerenciar':'Ver detalhes'}</DropdownMenuItem>
   {row.group.filter(p=>p.permalink).map(p=><DropdownMenuItem key={`${p.network}:${p.id}`} asChild><a href={p.permalink ?? undefined} target="_blank" rel="noreferrer">Abrir no {names[p.network]}</a></DropdownMenuItem>)}
   {row.group.length>0&&<DropdownMenuItem asChild><Link href={shell==='admin'?'/admin/meta/atendimento':'/dashboard/meta/atendimento'}>Comentários na caixa de entrada</Link></DropdownMenuItem>}
  </DropdownMenuContent></DropdownMenu>;
}
function networkMetricsText(m:(ContentMetrics&{unavailable?:boolean})|undefined){
 if(!m)return '';
 const parts=[m.views!==null?`${fmt.format(m.views)} visualizações`:'',m.reach!==null?`${fmt.format(m.reach)} de alcance`:'',m.interactions!==null?`${fmt.format(m.interactions)} interações`:''].filter(Boolean);
 return parts.length?` · ${parts.join(' · ')}`:'';
}
function ColumnPicker({columns,onChange}:{columns:MetricKey[];onChange:(c:MetricKey[])=>void}){
 return <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Escolher colunas" className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><Columns3 size={15}/></button></DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="min-w-48"><DropdownMenuLabel>Colunas</DropdownMenuLabel>{metricColumns.map(c=><DropdownMenuCheckboxItem key={c.key} checked={columns.includes(c.key)} onSelect={e=>e.preventDefault()} onCheckedChange={on=>onChange(on?metricColumns.map(x=>x.key).filter(k=>k===c.key||columns.includes(k)):columns.filter(k=>k!==c.key))}>{c.label}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu>;
}
