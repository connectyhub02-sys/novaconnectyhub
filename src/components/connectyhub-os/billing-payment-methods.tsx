"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CreditCard, LockKeyhole, Plus } from "lucide-react";
import { cardManagementConsent, cardManagementConsentVersion } from "@/lib/billing/card-management-policy";
type Card = {id:string;status:string;brand:string|null;last_digits:string|null;exp_month:string|null;exp_year:string|null};
type Data = {subscriptionId:string;periodEnd:string|null;nextBillingAt:string|null;blocker:string|null;cards:Card[]};
type Subscription = {id:string;planName:string;status:string};
const field="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 focus:outline-blue-500";
const button="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50";
async function fetchCards(id:string):Promise<Data>{
  const response=await fetch('/api/dashboard/billing/payment-methods?subscriptionId='+encodeURIComponent(id),{cache:'no-store'});
  const data=await response.json();if(!response.ok)throw Error(data.error??'Não foi possível carregar seus cartões.');return data;
}
export function BillingPaymentMethods({subscriptions}:{subscriptions:Subscription[]}){
  const active=subscriptions.filter(s=>s.status==="active");
  const [selected,setSelected]=useState("");const subscription=active.find(s=>s.id===selected)??active[0];
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[choice,setChoice]=useState<string|null>(null);
  const subscriptionId=subscription?.id;
  const locked=useRef(false);const formRef=useRef<HTMLFormElement>(null);
  async function load(){if(subscriptionId)setData(await fetchCards(subscriptionId));}
  useEffect(()=>{
    let disposed=false;
    const timer=setTimeout(()=>{
      setData(null);setChoice(null);setError('');
      if(subscriptionId)void fetchCards(subscriptionId).then(next=>{if(!disposed)setData(next);}).catch(e=>{if(!disposed)setError(e.message);});
    },0);
    return()=>{disposed=true;clearTimeout(timer);};
  },[subscriptionId]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(locked.current||!data||!choice)return;
    const f=new FormData(e.currentTarget);const expiry=String(f.get("expiry")??"").split("/");
    const body={subscriptionId:data.subscriptionId,requestId:crypto.randomUUID(),expectedDefault:data.cards.find(c=>c.status==="active")?.id??null,expectedEnd:data.periodEnd,acceptRecurring:f.get("consent")==="on",consentVersion:cardManagementConsentVersion,
      ...(choice==="add"?{action:"add",card:{number:f.get("number"),holderName:f.get("holderName"),expiryMonth:expiry[0],expiryYear:expiry[1],ccv:f.get("ccv")},holder:Object.fromEntries(["name","email","cpfCnpj","phone","postalCode","addressNumber"].map(k=>[k,f.get(k)]))}:{action:"default",methodId:choice})};
    locked.current=true;setBusy(true);setMessage("");setError("");
    try{const r=await fetch("/api/dashboard/billing/payment-methods",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json();
      if(!r.ok)throw Error(j.error??"Não foi possível salvar o cartão.");
      setMessage(j.message);setChoice(null);await load();window.dispatchEvent(new Event("connectyhub:billing-refresh"));
    }catch(err){setError(err instanceof Error?err.message:"A conexão foi interrompida. Atualize a lista para conferir qual cartão ficou padrão. Esta ação não solicita cobrança.");await load().catch(()=>null);}
    finally{formRef.current?.reset();locked.current=false;setBusy(false);}
  }
  return <section id="metodos-pagamento" aria-labelledby="payment-methods-title" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="payment-methods-title" className="flex items-center gap-2 text-xl font-semibold text-slate-950"><CreditCard size={21}/>Métodos de pagamento</h2><p className="mt-1 text-sm text-slate-600">O cartão padrão será usado na próxima renovação. Adicionar ou trocar o cartão não cobra novamente o ciclo atual.</p></div>
      {data&&!data.blocker?<button className={button} disabled={busy} onClick={()=>{setChoice("add");setMessage("");setError("");}}><Plus size={16}/>Adicionar novo</button>:null}</div>
    {!subscription?<p className="mt-4 text-sm text-slate-600">Você ainda não possui uma assinatura ativa para cadastrar um cartão de renovação.</p>:null}
    {active.length>1?<label className="mt-4 block max-w-sm text-sm font-medium text-slate-700">Assinatura<select disabled={busy} className={field} value={subscription?.id} onChange={e=>setSelected(e.target.value)}>{active.map(s=><option key={s.id} value={s.id}>{s.planName}</option>)}</select></label>:null}
    {subscription&&!data&&!error?<p role="status" className="mt-4 text-sm text-slate-600">Carregando cartões…</p>:null}
    {data?<>
      {data.blocker?<p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{data.blocker}</p>:null}
      {data.cards.length?<ul className="mt-4 grid gap-3 md:grid-cols-2">{data.cards.map(card=><li key={card.id} className={`flex items-center justify-between gap-3 rounded-lg border p-4 ${card.status==="active"?"border-blue-200 bg-blue-50/60":"border-slate-200"}`}><div><p className="font-semibold text-slate-950">{card.brand??"Cartão"} {card.last_digits?`•••• ${card.last_digits}`:"cadastrado"} {card.status==="active"?<span className="ml-2 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800">Padrão</span>:null}</p><p className="mt-1 text-xs text-slate-600">{card.exp_month&&card.exp_year?`Validade ${card.exp_month}/${card.exp_year}`:"Dados parciais não disponíveis para este cartão antigo."}</p>{card.status==="active"?<p className="mt-2 text-xs font-medium text-blue-800">A próxima renovação usará este cartão.</p>:null}</div>{card.status!=="active"&&!data.blocker?<button disabled={busy} className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-blue-800 disabled:opacity-50" onClick={()=>{setChoice(card.id);setError("");setMessage("");}}>Tornar padrão</button>:null}</li>)}</ul>:!data.blocker?<p className="mt-4 text-sm text-slate-600">Nenhum cartão de renovação cadastrado. Adicione um cartão para autorizar as próximas renovações.</p>:null}
      {data.nextBillingAt?<p className="mt-3 text-xs text-slate-500">Vencimento mantido: {new Date(data.nextBillingAt).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"})}. As tentativas de renovação podem começar três dias antes.</p>:null}
      {data.cards.some(c=>c.status==="active")&&!data.blocker?<button disabled={busy} className="mt-3 min-h-11 text-sm font-semibold text-blue-700 underline" onClick={()=>{setChoice("add");setError("");setMessage("");}}>Alterar cartão da próxima renovação</button>:null}
    </>:null}
    {choice&&data&&!data.blocker?<form ref={formRef} onSubmit={submit} data-sensitive="payment" className="mt-5 max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-950">{choice==="add"?"Adicionar novo cartão e tornar padrão":"Confirmar cartão padrão"}</h3>
      <fieldset disabled={busy} className="space-y-4">
        {choice==="add"?<><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-slate-800 sm:col-span-2">Número do cartão<input className={field} name="number" autoComplete="cc-number" inputMode="numeric" maxLength={23} required/></label><label className="text-sm font-medium text-slate-800 sm:col-span-2">Nome impresso no cartão<input className={field} name="holderName" autoComplete="cc-name" maxLength={120} required/></label><label className="text-sm font-medium text-slate-800">Validade (MM/AA)<input className={field} name="expiry" autoComplete="cc-exp" placeholder="MM/AA" inputMode="numeric" maxLength={7} required onChange={e=>{const d=e.target.value.replace(/\D/g,"").slice(0,6);e.target.value=d.length>2?`${d.slice(0,2)}/${d.slice(2)}`:d;}}/></label><label className="text-sm font-medium text-slate-800">Código de segurança<input className={field} name="ccv" type="password" autoComplete="cc-csc" inputMode="numeric" maxLength={4} required/></label></div>
        <div><h4 className="text-sm font-semibold text-slate-800">Dados do titular</h4><div className="mt-2 grid gap-3 sm:grid-cols-2">{[{key:"name",label:"Nome completo"},{key:"email",label:"E-mail"},{key:"cpfCnpj",label:"CPF/CNPJ"},{key:"phone",label:"Telefone"},{key:"postalCode",label:"CEP"},{key:"addressNumber",label:"Número do endereço"}].map(f=><label key={f.key} className="text-sm font-medium text-slate-800">{f.label}<input className={field} name={f.key} type={f.key==="email"?"email":"text"} maxLength={120} required/></label>)}</div></div></>:<p className="text-sm text-slate-700">Selecionado: {data.cards.find(c=>c.id===choice)?.brand??"Cartão"} •••• {data.cards.find(c=>c.id===choice)?.last_digits??"dados antigos"}.</p>}
        <label className="flex items-start gap-3 text-sm leading-6 text-slate-700"><input className="mt-1.5" name="consent" type="checkbox" required/>{cardManagementConsent}</label>
        <div className="flex flex-wrap gap-3"><button className={button}><LockKeyhole size={16}/>{busy?"Salvando…":choice==="add"?"Salvar e usar na próxima renovação":"Confirmar como padrão"}</button><button className="min-h-11 px-3 text-sm font-semibold text-slate-700" type="button" onClick={()=>setChoice(null)}>Cancelar</button></div>
      </fieldset>
    </form>:null}
    {message?<p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>:null}
    {error?<div role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{error}<button disabled={busy} className="ml-2 min-h-11 underline" onClick={()=>{setError("");void load().catch(e=>setError(e.message));}}>Atualizar lista</button></div>:null}
  </section>;
}
