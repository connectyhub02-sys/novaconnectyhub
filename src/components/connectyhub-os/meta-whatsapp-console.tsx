"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel } from "./panel-primitives";

type Template = {id:string;name:string;status:string;language:string;category:string;components:Array<{type:string;text?:string}>};
type Message = {id:string;phone:string;direction:string;text_content:string;status:string;occurred_at:string;error_code:string|null};
type Snapshot = {connection:null|{displayPhone:string;verifiedName:string;permissions:string[];webhookAt:string|null;webhookSubscribed:boolean};signupReady:boolean;pilotReady:boolean;templates:Template[];templateError:string|null;messages:Message[]};
type Signup = {state:string;appId:string;configId:string;version:string};
type FacebookSdk = {init:(options:Record<string,unknown>)=>void;login:(callback:(response:{authResponse?:{code?:string}})=>void,options:Record<string,unknown>)=>void};
declare global {interface Window {FB?:FacebookSdk}}
const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const button = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const labels:Record<string,string>={received:"Recebida",sending:"Enviando — não repita",accepted:"Aceita pela Meta",sent:"Enviada",delivered:"Entregue",read:"Lida",failed:"Falhou",uncertain:"Resultado indeterminado — não repita"};

async function loadFacebookSdk() {
  if (window.FB) return window.FB;
  await new Promise<void>((resolve,reject)=>{
    const existing = document.getElementById("meta-whatsapp-sdk");
    if (existing) { existing.remove(); }
    const script=document.createElement("script"); script.id="meta-whatsapp-sdk";script.src="https://connect.facebook.net/pt_BR/sdk.js";script.async=true;
    script.onload=()=>resolve();script.onerror=()=>{script.remove();reject(new Error("Não foi possível carregar a conexão Meta."));};document.head.appendChild(script);
  });
  if (!window.FB) throw new Error("SDK Meta indisponível.");
  return window.FB;
}

export function MetaWhatsAppConsole({admin=false}:{admin?:boolean}) {
  const endpoint=`/api/dashboard/integrations/meta/whatsapp${admin ? "?admin=1" : ""}`;
  const signupEndpoint=`/api/dashboard/integrations/meta/whatsapp/signup${admin ? "?admin=1" : ""}`;
  const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const [signup,setSignup]=useState<Signup|null>(null);
  const [pin,setPin]=useState("");
  const [phone,setPhone]=useState(""),[text,setText]=useState(""),[templateId,setTemplateId]=useState(""),[consent,setConsent]=useState(false),[consentNote,setConsentNote]=useState("");
  const [name,setName]=useState(""),[templateText,setTemplateText]=useState(""),[category,setCategory]=useState("MARKETING"),[language,setLanguage]=useState("pt_BR");
  const requestKey=useRef<string|null>(null), pending=useRef<{code?:string;wabaId?:string;phoneNumberId?:string;finishing?:boolean}>({});
  const load=useCallback(async()=>{
    const response=await fetch(endpoint,{cache:"no-store"}); const value=await response.json();
    if (!response.ok) throw new Error(value.error || "Falha ao carregar WhatsApp oficial."); setData(value);
  },[endpoint]);
  useEffect(()=>{ let active=true; const refresh=()=>load().catch(e=>{if(active)setError(e.message);}); void refresh(); const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},30000); return()=>{active=false;clearInterval(timer);}; },[load]);
  const post=useCallback(async(url:string,body:Record<string,unknown>)=>{
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();
    if(!response.ok)throw new Error(result.error || "Falha na operação.");return result;
  },[]);
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError("");setNotice("");try{await action();await load();}catch(e){setError(e instanceof Error?e.message:"Falha na operação.");}finally{setBusy(false);}};

  const finish=useCallback(async()=>{
    const p=pending.current;
    if(!signup || !p.code || !p.wabaId || !p.phoneNumberId || p.finishing)return;
    p.finishing=true;setBusy(true);
    try{await post(signupEndpoint,{action:"finish",state:signup.state,code:p.code,wabaId:p.wabaId,phoneNumberId:p.phoneNumberId});setNotice("Número oficial conectado. Confira os modelos e faça um envio autorizado.");await load();}
    catch(e){setError(e instanceof Error?e.message:"Falha ao conectar.");}
    finally{setSignup(null);setBusy(false);pending.current={};}
  },[signup,post,signupEndpoint,load]);
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if(!signup || !["https://www.facebook.com","https://web.facebook.com"].includes(event.origin))return;
      let value;try{value=typeof event.data==="string"?JSON.parse(event.data):event.data;}catch{return;}
      if(value?.type!=="WA_EMBEDDED_SIGNUP")return;
      if(value.event==="FINISH") {pending.current={...pending.current,wabaId:value.data?.waba_id,phoneNumberId:value.data?.phone_number_id};void finish();}
      if(value.event==="CANCEL" || value.event==="ERROR"){setError("Conexão não concluída na Meta. Você pode iniciar novamente.");setBusy(false);setSignup(null);}
    };window.addEventListener("message",receive);return()=>window.removeEventListener("message",receive);
  },[signup,finish]);
  const authorize=()=>{
    if(!signup||!window.FB)return;
    setError("");pending.current={};
    window.FB.login(response=>{const code=response.authResponse?.code;if(code){pending.current.code=code;void finish();}else{setError("Autorização não concluída.");setSignup(null);}}, {config_id:signup.configId,response_type:"code",override_default_response_type:true,extras:{setup:{},featureType:"",sessionInfoVersion:"3",version:"v4"}});
  };
  const selected=data?.templates.find(t=>t.id===templateId);
  const send=async(type:"text"|"template")=>{
    requestKey.current ??= crypto.randomUUID();
    const result=await post(endpoint,{action:"send",type,phone,text,requestKey:requestKey.current,templateName:selected?.name,language:selected?.language,consent,consentNote});
    setNotice(result.warning || labels[result.status] || result.status);
    // Preserve the key after failure/unknown outcomes. Editing or explicitly starting a new message creates a new intent.
    if(["accepted","sent","delivered","read"].includes(result.status)){setText("");requestKey.current=null;}
  };
  return <div className="space-y-5">
    <Panel title="WhatsApp oficial da Meta" eyebrow="Conexão e laboratório">
      <div className="space-y-4 text-sm">
        <p>Use um número separado do atendimento conectado por QR. Os modelos, mensagens e recibos deste chat usam a API oficial.</p>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-800">{notice}</p>}
        {data?.connection ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <p className="font-semibold">{data.connection.verifiedName} · {data.connection.displayPhone}</p>
          <p>{data.connection.webhookSubscribed ? "Conta inscrita para receber eventos." : "Assinatura pendente: reconecte antes de enviar."}</p><p>Último webhook: {data.connection.webhookAt ? new Date(data.connection.webhookAt).toLocaleString("pt-BR") : "ainda não recebido"}.</p>
          <button className="mt-3 underline" disabled={busy} onClick={()=>void run(async()=>{await post(endpoint,{action:"disconnect"});setNotice("Desconectado deste painel. Histórico preservado.");})}>Desconectar deste painel</button>
        </div> : <p>{data?.signupReady ? "Conecte pela janela oficial da Meta. Não é necessário copiar credenciais." : "Conexão guiada aguardando configuração WhatsApp na manutenção. O app de Facebook/Instagram continua separado."}</p>}
        <div className="flex flex-wrap gap-3">
          {!signup ? <button className={button} disabled={busy||!data?.signupReady} onClick={()=>void run(async()=>{const config=await post(signupEndpoint,{action:"start"});const sdk=await loadFacebookSdk();sdk.init({appId:config.appId,version:config.version,cookie:false,xfbml:false});setSignup(config);setNotice("Conexão preparada. Clique em Autorizar na Meta.");})}>Conectar WhatsApp oficial</button> : <button className={button} disabled={busy} onClick={authorize}>Autorizar na Meta</button>}
          {admin && <button className={button} disabled={busy||!data?.pilotReady} onClick={()=>void run(async()=>{await post(endpoint,{action:"import_pilot"});setNotice("Número de teste do cofre conectado à empresa interna.");})}>Usar número de teste do cofre</button>}
          <button className="rounded-xl border px-4 py-2" disabled={busy} onClick={()=>void run(async()=>{})}>Atualizar diagnóstico</button>
        </div>
        <p className="text-xs text-slate-500">O acesso para empresas externas depende das permissões aprovadas pela Meta. Esta liberação do painel permite preparar e testar os fluxos; não altera a aprovação do app.</p>
        {data?.connection && <details className="rounded-xl border p-3"><summary className="cursor-pointer font-medium">Finalizar ativação de um número novo</summary><p className="my-3 text-xs text-slate-500">Use após verificar o número no cadastro da Meta, caso ainda não esteja registrado na Cloud API. Não é necessário para o número de teste já ativo. Guarde seu PIN; ele não é salvo pela ConnectyHub.</p><label className="block">PIN de duas etapas<input className={field} type="password" inputMode="numeric" maxLength={6} autoComplete="off" value={pin} onChange={e=>setPin(e.target.value)} /></label><button className={`${button} mt-3`} disabled={busy||!/^\d{6}$/.test(pin)} onClick={()=>void run(async()=>{try{await post(endpoint,{action:"register",pin});setNotice("Meta confirmou o registro do número na Cloud API.");}finally{setPin("");}})}>Registrar número na Cloud API</button></details>}
        {admin && <Link className="text-blue-700 underline" href="/admin/maintenance#credenciais-do-sistema">Abrir credenciais na manutenção</Link>}
      </div>
    </Panel>
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Modelos de mensagem" eyebrow="Demonstração de gerenciamento">
        <form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await post(endpoint,{action:"create_template",name,text:templateText,category,language});setNotice(`Modelo criado na Meta: ${result.status || "aguardando análise"}.`);});}}>
          <label className="block text-sm">Nome do modelo<input className={field} value={name} onChange={e=>setName(e.target.value)} placeholder="aviso_connectyhub" required /></label>
          <div className="flex gap-3"><label className="flex-1 text-sm">Categoria<select className={field} value={category} onChange={e=>setCategory(e.target.value)}><option value="MARKETING">Marketing</option><option value="UTILITY">Utilidade</option></select></label><label className="flex-1 text-sm">Idioma<select className={field} value={language} onChange={e=>setLanguage(e.target.value)}><option value="pt_BR">Português BR</option><option value="en_US">English US</option><option value="es">Español</option></select></label></div>
          <label className="block text-sm">Texto<textarea className={field} rows={4} maxLength={1024} value={templateText} onChange={e=>setTemplateText(e.target.value)} placeholder="Texto sem variáveis nesta primeira versão" required /></label>
          <button className={button} disabled={busy||!data?.connection}>Criar modelo na Meta</button>
        </form>
        {data?.templateError && <p className="mt-3 text-sm text-red-700">{data.templateError}</p>}
        <ul className="mt-4 max-h-64 space-y-2 overflow-auto text-sm">{data?.templates.map(t=><li key={t.id} className="rounded-lg border p-3"><strong>{t.name}</strong> · {t.language}<p>{t.status} · {t.category}</p></li>)}</ul>
      </Panel>
      <Panel title="Enviar e acompanhar" eyebrow="Demonstração de mensagens">
        <div className="space-y-3">
          <label className="block text-sm">Telefone do destinatário<input className={field} value={phone} onChange={e=>{setPhone(e.target.value);requestKey.current=null;}} placeholder="5511999999999" /></label>
          <label className="block text-sm">Modelo aprovado<select className={field} value={templateId} onChange={e=>{setTemplateId(e.target.value);requestKey.current=null;}}><option value="">Selecione um modelo</option>{data?.templates.filter(t=>t.status==="APPROVED").map(t=><option key={t.id} value={t.id}>{t.name} · {t.language}</option>)}</select></label>
          {selected && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{selected.components.map(c=>c.text).filter(Boolean).join("\n")}</p>}
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />O destinatário autorizou receber esta mensagem.</label>
          <label className="block text-sm">Registro da autorização<input className={field} value={consentNote} onChange={e=>setConsentNote(e.target.value)} placeholder="Ex.: número próprio autorizado para teste" maxLength={500} /></label>
          <button className={button} disabled={busy||!data?.connection||!selected||!consent} onClick={()=>void run(()=>send("template"))}>Enviar modelo oficial</button>
          <div className="border-t pt-4"><label className="block text-sm">Resposta no chat<textarea className={field} rows={3} maxLength={4096} value={text} onChange={e=>{setText(e.target.value);requestKey.current=null;}} /></label><p className="my-2 text-xs text-slate-500">Resposta livre somente até 24 horas após uma mensagem do destinatário. Fora desse prazo, use um modelo aprovado.</p><button className={button} disabled={busy||!data?.connection||!text.trim()} onClick={()=>void run(()=>send("text"))}>Responder pelo WhatsApp oficial</button></div>
          <p className="text-xs text-slate-500">Envio individual para homologação. A Meta pode cobrar o uso conforme a conta. Disparos em lote e adicional por mensagem ainda não estão habilitados.</p>
        </div>
      </Panel>
    </div>
    <Panel title="Chat Meta oficial" eyebrow="Últimas 100 mensagens · atualização a cada 30 segundos">
      <div className="max-h-[560px] space-y-3 overflow-auto">{data?.messages.length ? data.messages.filter(m=>!phone || m.phone===phone.replace(/\D/g,"")).map(m=><article key={m.id} className={`max-w-[85%] rounded-xl border p-3 ${m.direction==="outbound" ? "ml-auto border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}><button className="text-xs font-semibold text-blue-700" onClick={()=>{setPhone(m.phone);requestKey.current=null;}}>{m.phone}</button><p className="whitespace-pre-wrap break-words text-sm text-slate-900">{m.text_content}</p><p className="mt-2 text-xs text-slate-500">{labels[m.status] || m.status} · {new Date(m.occurred_at).toLocaleString("pt-BR")}{m.error_code && ` · ${m.error_code}`}</p></article>) : <p className="text-sm text-slate-500">As mensagens oficiais recebidas e enviadas aparecerão aqui e no arquivo do lead.</p>}</div>
    </Panel>
  </div>;
}
