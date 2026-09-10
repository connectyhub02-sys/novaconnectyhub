import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppBaseUrl } from "@/lib/sales-catalog/mercado-pago";
import { collectOutboundLinks, rewriteOutboundBody, planOutboundMessages } from "./outbound-links";

export type WhatsappOutboundScope = { instanceId: string; client?: SupabaseClient; source?: string; sensitive?: boolean };
type Body = Record<string, unknown>;

function archiveBody(body: Body, sensitive: boolean) {
  if (sensitive) return { number:body.number,text:"Código de verificação enviado. Conteúdo protegido.",track_source:body.track_source,track_id:body.track_id };
  // Media bytes stay at the provider/storage; its receipt feeds the existing media archive queue.
  return Object.fromEntries(Object.entries(body).map(([key,value])=>[key,typeof value === "string" && (value.startsWith("data:") || (key === "file" && value.length>4096)) ? "[mídia enviada; arquivo em processamento]" : value]));
}
const textOf = (body: Body) => [body.text,body.caption,body.description].filter(v=>typeof v === "string").join("\n") || null;
const typeOf = (path: string, body: Body) => path === "/send/media" ? String(body.type ?? "document") : path === "/send/text" || path === "/send/menu" ? "text" : path.split("/").at(-1) ?? "text";

type Prepared = { id:string; path:string; body:Body };
async function prepare(client:SupabaseClient,scope:WhatsappOutboundScope,path:string,original:Body):Promise<Prepared[]> {
  const target=String(original.number ?? original.to ?? (path === "/send/status" ? "status@broadcast" : ""));
  const source=scope.source ?? String(original.track_source ?? "whatsapp");
  const firstId=randomUUID();
  const reserve=async(id:string,sendPath:string,body:Body)=>{
    const safe=archiveBody(body,scope.sensitive===true);
    const r=await client.rpc("prepare_whatsapp_outbound",{p_id:id,p_instance:scope.instanceId,p_target:target,p_path:sendPath,p_source:source,p_type:typeOf(sendPath,body),p_text:textOf(safe),p_payload:safe});
    if(r.error||!r.data)throw new Error("Não foi possível preservar a mensagem no arquivo do destinatário.");
    return r.data as {organization_id:string;lead_id:string|null};
  };
  const identity=await reserve(firstId,path,original);
  const links=collectOutboundLinks(original).map(link=>({...link,id:randomUUID(),url:""}));
  for(const link of links)link.url=`${getAppBaseUrl()}/w/${link.id}`;
  if(links.length){
    const saved=await client.from("whatsapp_outbound_links").insert(links.map(link=>({id:link.id,delivery_id:firstId,organization_id:identity.organization_id,lead_id:identity.lead_id,target_url:link.target,label:link.label})));
    if(saved.error)throw new Error("Não foi possível preparar os links rastreáveis.");
  }
  const messages=planOutboundMessages(path,rewriteOutboundBody(original,links),links);
  const prepared:Prepared[]=[];
  for(const [index,message] of messages.entries()){
    const id=index===0?firstId:randomUUID();
    const body={...message.body,track_id:`${String(message.body.track_id??"connectyhub")}:delivery:${id}`};
    if(index>0)await reserve(id,message.path,body);
    const safe=archiveBody(body,scope.sensitive===true);
    const saved=await client.from("whatsapp_outbound_deliveries").update({path:message.path,text_content:textOf(safe),payload:{...safe,outbound_links:links.map(link=>({id:link.id,label:link.label,url:link.url}))},updated_at:new Date().toISOString()}).eq("id",id);
    if(saved.error)throw new Error("Não foi possível preservar os botões da mensagem.");
    prepared.push({id,path:message.path,body});
  }
  return prepared;
}
async function markSending(client:SupabaseClient,messages:Prepared[]){
  const r=await client.from("whatsapp_outbound_deliveries").update({status:"sending",updated_at:new Date().toISOString()}).in("id",messages.map(m=>m.id));
  if(r.error)throw new Error("Não foi possível registrar o início do envio.");
}
async function receipt(client:SupabaseClient,messages:Prepared[],response:Response,batch=false){
  const data=await response.clone().json().catch(()=>null);
  const ok=response.ok && data && !data.error && data.success!==false && data.status!=="error";
  const status=ok?(batch?"queued":"sent"):response.status===408||response.status>=500||response.ok?"uncertain":"failed";
  const providerId=batch?null:[data?.messageid,data?.id,data?.key?.id].find(v=>typeof v==="string")??null;
  // Losing this update never causes the caller to resend an accepted message.
  await client.from("whatsapp_outbound_deliveries").update({status,provider_message_id:providerId,provider_status:response.status,updated_at:new Date().toISOString()}).in("id",messages.map(m=>m.id));
  return ok;
}
async function uncertain(client:SupabaseClient,messages:Prepared[]){
  await client.from("whatsapp_outbound_deliveries").update({status:"uncertain",updated_at:new Date().toISOString()}).in("id",messages.map(m=>m.id)).eq("status","sending");
}
const batchPath=(type:unknown)=>type==="text"?"/send/text":["button","list","poll","carousel"].includes(String(type))?"/send/menu":["contact","location"].includes(String(type))?`/send/${type}`:"/send/media";

/** The sole HTTP boundary for outbound WhatsApp. Read operations pass through unchanged. */
export async function fetchWhatsappOutbound(input:RequestInfo|URL,init:RequestInit,scope?:WhatsappOutboundScope):Promise<Response>{
  const endpoint=new URL(String(input));
  const match=endpoint.pathname.match(/\/(send|sender)\/[^/]+$/);
  const path=match?.[0]??"";
  const batch=["/sender/simple","/sender/advanced"].includes(path);
  if(!path.startsWith("/send/")&&!batch)return fetch(input,init);
  if(!scope?.instanceId)throw new Error("Remetente obrigatório para registrar o envio de WhatsApp.");
  const client=scope.client??createServiceClient();
  const original=JSON.parse(String(init.body??"{}")) as Body;
  if(path==="/send/status"&&collectOutboundLinks(original).length)throw new Error("Status do WhatsApp não aceita botões de link. Envie esse conteúdo por mensagem para manter o link com botão e o registro por destinatário.");
  const urlFor=(next:string)=>{const url=new URL(endpoint);url.pathname=endpoint.pathname.slice(0,-path.length)+next;return url;};
  if(batch){
    const entries=path==="/sender/simple"&&Array.isArray(original.numbers)?original.numbers.map(number=>({...original,numbers:undefined,number})):original.messages;
    if(!Array.isArray(entries)||!entries.length)throw new Error("Destinatários obrigatórios para registrar a campanha.");
    const messages:Prepared[]=[];
    for(const entry of entries){if(!entry||typeof entry!=="object")throw new Error("Mensagem da campanha inválida.");messages.push(...await prepare(client,scope,batchPath(entry.type),entry));}
    await markSending(client,messages);
    try{
      const response=await fetch(urlFor("/sender/advanced"),{...init,body:JSON.stringify({...original,numbers:undefined,messages:messages.map(m=>({...m.body,type:m.path==="/send/text"?"text":m.body.type??m.path.split("/").at(-1)}))})});
      await receipt(client,messages,response,true);return response;
    }catch(error){await uncertain(client,messages);throw error;}
  }
  const messages=await prepare(client,scope,path,original);
  let firstResponse:Response|null=null;
  for(const [index,message] of messages.entries()){
    try{
      await markSending(client,[message]);
      const response=await fetch(urlFor(message.path),{...init,body:JSON.stringify(message.body)});
      if(index===0)firstResponse=response;
      const ok=await receipt(client,[message],response);
      if(!ok)break;
    }catch(error){
      await uncertain(client,[message]);
      if(!firstResponse)throw error;
      // A companion failure is archived separately, without repeating the primary message.
      break;
    }
  }
  return firstResponse!;
}
