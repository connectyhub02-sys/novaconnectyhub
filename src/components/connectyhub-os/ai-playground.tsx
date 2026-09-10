"use client";
import { useRef, useState } from "react";
import { formatPreciseCredits } from "./credit-explainer";
export function AiPlayground({onComplete}:{onComplete?:()=>void}) {
  const [secret,setSecret]=useState(""),[text,setText]=useState("Explique em uma frase o que é uma API."),[busy,setBusy]=useState(false);
  const [result,setResult]=useState<{text:string;credits?:number;id?:string}|null>(null);
  const [pending,setPending]=useState(false);
  const attempt=useRef<{id:string;body:string;secret:string}|null>(null);
  async function run() {
    if(!attempt.current) attempt.current={id:crypto.randomUUID(),body:JSON.stringify({messages:[{role:"user",content:text}]}),secret:secret.trim()};
    const current=attempt.current;
    setBusy(true);setResult(null);
    try {
      const response=await fetch("/api/v1/ai/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${current.secret}`,"Content-Type":"application/json","Idempotency-Key":current.id},body:current.body});
      const data=await response.json();
      if(response.ok) {
        setResult({text:data.choices?.[0]?.message?.content||"A solicitação foi concluída sem uma resposta de texto.",credits:Number(data.connectyhub?.credits??0),id:data.connectyhub?.request_id});
        attempt.current=null;setPending(false);
      } else {
        const uncertain=response.status>=500||(response.status===409&&data.error?.code!=="previous_request_failed");
        setPending(uncertain);
        setResult({text:uncertain?"Estamos conferindo esta solicitação. Consulte a mesma tentativa antes de enviar outra.":"Não foi possível concluir. Confira a chave, o saldo e as atividades do projeto.",id:data.error?.request_id});
        if(!uncertain) attempt.current=null;
      }
    } catch {setPending(true);setResult({text:"A conexão foi interrompida. Consulte esta tentativa para verificar o resultado sem duplicar o uso."});}
    finally {setBusy(false);onComplete?.();}
  }
  return <details className="rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer text-lg font-bold">Experimentar minha conexão</summary><p className="my-3 text-sm leading-7 text-slate-600">Envie uma mensagem e veja a resposta e os créditos utilizados. Esta é uma solicitação real. Sua chave permanece somente nesta tela.</p><form className="space-y-4" onSubmit={event=>{event.preventDefault();void run();}}><label className="block text-sm">Chave do projeto<input required autoComplete="off" type="password" disabled={busy||pending} value={secret} onChange={event=>setSecret(event.target.value)} placeholder="Cole sua chave" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3"/></label><label className="block text-sm">Sua mensagem<textarea required disabled={busy||pending} value={text} onChange={event=>setText(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 p-3"/></label><button disabled={busy} className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{busy?"Consultando…":pending?"Consultar esta tentativa":"Enviar com meus créditos"}</button></form>{result&&<div role="status" className="mt-4 space-y-3 rounded-xl bg-blue-50 p-4 text-sm leading-7"><p className="whitespace-pre-wrap">{result.text}</p>{result.credits!==undefined&&<p className="font-bold text-blue-900">{formatPreciseCredits(result.credits)} créditos utilizados</p>}{result.id&&<p className="break-all text-xs text-slate-500">Solicitação: {result.id}</p>}</div>}</details>;
}