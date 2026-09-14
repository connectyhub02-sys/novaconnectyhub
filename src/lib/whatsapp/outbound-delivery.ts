import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppBaseUrl } from "@/lib/sales-catalog/mercado-pago";
import { whatsappTrackingOrigin } from "./tracking-origin";
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
  const linkOrigin=links.length?whatsappTrackingOrigin(identity.organization_id,getAppBaseUrl()):null;
  for(const link of links)link.url=`${linkOrigin}/w/${link.id}`;
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

type Operation = { id: string; claimed: boolean; status: string; delivery_ids: string[]; response: Body | null; response_status: number | null };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** The sole HTTP boundary for outbound WhatsApp. Read operations pass through unchanged. */
export async function fetchWhatsappOutbound(input: RequestInfo | URL, init: RequestInit, scope?: WhatsappOutboundScope): Promise<Response> {
  const endpoint = new URL(String(input));
  const path = endpoint.pathname.match(/\/(send|sender)\/[^/]+$/)?.[0] ?? "";
  const batch = ["/sender/simple", "/sender/advanced"].includes(path);
  if (!path.startsWith("/send/") && !batch) return fetch(input, init);
  if (!scope?.instanceId) throw new Error("Remetente obrigatório para registrar o envio de WhatsApp.");
  const client = scope.client ?? createServiceClient();
  const original = JSON.parse(String(init.body ?? "{}")) as Body;
  if (path === "/send/status" && collectOutboundLinks(original).length) throw new Error("Status do WhatsApp não aceita botões de link. Envie esse conteúdo por mensagem para manter o link com botão e o registro por destinatário.");
  const urlFor = (next: string) => { const url = new URL(endpoint); url.pathname = endpoint.pathname.slice(0, -path.length) + next; return url; };
  const claimToken = randomUUID();
  let operation: Operation | null = null;
  if (typeof original.track_id === "string" && original.track_id.trim()) {
    const claimed = await client.rpc("claim_whatsapp_outbound_operation", {
      p_instance: scope.instanceId, p_claim: claimToken,
      p_key: digest([original.number ?? original.to ?? original.numbers ?? null, original.track_source ?? scope.source, original.track_id]),
      p_hash: digest([path, original]),
    });
    if (claimed.error || !claimed.data) throw new Error("Não foi possível conferir a operação de envio.");
    operation = claimed.data as Operation;
    if (!operation.claimed) {
      if (operation.status === "sent") return Response.json(operation.response ?? { success: true }, { status: operation.response_status ?? 200 });
      return Response.json({ error: "outbound_operation_unconfirmed", retryable: false }, { status: 503 });
    }
  }
  const checkpoint = async (values: Body) => {
    if (!operation) return;
    const saved = await client.from("whatsapp_outbound_operations").update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", operation.id).eq("claim_token", claimToken).select("id").maybeSingle();
    if (saved.error || !saved.data) throw new Error("Não foi possível registrar o resultado da operação de envio.");
  };
  let started = false;
  try {
    let messages: Prepared[] = [];
    let originalProviderId: string | null = null;
    const completed = new Set<string>();
    if (operation?.delivery_ids.length && !scope.sensitive) {
      const saved = await client.from("whatsapp_outbound_deliveries").select("id,path,payload,status,provider_message_id")
        .eq("whatsapp_instance_id", scope.instanceId).in("id", operation.delivery_ids);
      if (saved.error || saved.data?.length !== operation.delivery_ids.length) throw new Error("Arquivo da operação indisponível.");
      for (const id of operation.delivery_ids) {
        const row = saved.data!.find(row => row.id === id)!;
        if (id === operation.delivery_ids[0] && ["sent", "queued"].includes(row.status)) originalProviderId = row.provider_message_id ?? null;
        if (["sending", "uncertain"].includes(row.status)) {
          await checkpoint({ status: "uncertain" });
          return Response.json({ error: "outbound_part_unconfirmed", retryable: false }, { status: 503 });
        }
        if (["sent", "queued"].includes(row.status)) completed.add(id);
        const { outbound_links: _links, ...body } = row.payload as Body;
        void _links;
        messages.push({ id, path: row.path, body });
      }
    } else if (batch) {
      const entries = path === "/sender/simple" && Array.isArray(original.numbers)
        ? original.numbers.map(number => ({ ...original, numbers: undefined, number })) : original.messages;
      if (!Array.isArray(entries) || !entries.length) throw new Error("Destinatários obrigatórios para registrar a campanha.");
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") throw new Error("Mensagem da campanha inválida.");
        messages.push(...await prepare(client, scope, batchPath(entry.type), entry));
      }
    } else messages = await prepare(client, scope, path, original);
    if (operation) {
      const identity = await client.from("whatsapp_outbound_deliveries").select("lead_id").eq("id", messages[0].id).maybeSingle();
      if (identity.error) throw new Error("Destinatário da operação indisponível.");
      await checkpoint({ delivery_ids: messages.map(m => m.id), lead_id: batch ? null : identity.data?.lead_id ?? null });
    }
    const pending = messages.filter(m => !completed.has(m.id));
    await checkpoint({ status: "sending" });
    started = true;
    let firstResponse: Response | null = null;
    if (batch && pending.length) {
      await markSending(client, pending);
      try {
        firstResponse = await fetch(urlFor("/sender/advanced"), { ...init, body: JSON.stringify({ ...original, numbers: undefined,
          messages: pending.map(m => ({ ...m.body, type: m.path === "/send/text" ? "text" : m.body.type ?? m.path.split("/").at(-1) })) }) });
        const ok = await receipt(client, pending, firstResponse, true);
        if (!ok) {
          await checkpoint({ status: firstResponse.status >= 400 && firstResponse.status < 500 && firstResponse.status !== 408 ? "failed" : "uncertain" });
          return firstResponse;
        }
      } catch (error) { await uncertain(client, pending); throw error; }
    } else for (const message of pending) {
      await markSending(client, [message]);
      let response: Response;
      try { response = await fetch(urlFor(message.path), { ...init, body: JSON.stringify(message.body) }); }
      catch (error) { await uncertain(client, [message]); throw error; }
      firstResponse ??= response;
      if (!await receipt(client, [message], response)) {
        const definitive = response.status >= 400 && response.status < 500 && response.status !== 408;
        await checkpoint({ status: definitive ? "failed" : "uncertain" });
        return completed.size || firstResponse !== response
          ? Response.json({ error: "companion_delivery_unconfirmed", partial: true }, { status: 502 }) : response;
      }
      completed.add(message.id);
    }
    const result = firstResponse ? await firstResponse.clone().json().catch(() => null) : null;
    const providerId = originalProviderId ?? [result?.messageid, result?.id, result?.key?.id].find(v => typeof v === "string");
    await checkpoint({ status: "sent", response_status: 200,
      response: { success: true, ...(providerId ? { id: providerId, messageid: providerId } : {}) } });
    return originalProviderId ? Response.json({ success: true, id: originalProviderId, messageid: originalProviderId, replay: true })
      : firstResponse ?? Response.json({ success: true, replay: true });
  } catch (error) {
    await checkpoint({ status: started ? "uncertain" : "failed" }).catch(() => {});
    if (started) return Response.json({ error: "outbound_delivery_uncertain", partial: true }, { status: 502 });
    throw error;
  }
}
