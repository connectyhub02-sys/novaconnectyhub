import "server-only";
import { templateParameters, replyButtons, type OfficialTemplate } from "./whatsapp-workspace-policy";
import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMetaGuidedOAuthConfig } from "@/lib/client-os/guided-oauth";
import { decryptCredentialValue, encryptCredentialValue } from "@/lib/security/credentials-crypto";
import { officialAssetId, officialPhone, serviceWindowOpen, templateInput } from "./whatsapp-policy";
import { collectOutboundLinks } from "@/lib/whatsapp/outbound-links";
import { recipientAliases, recipientIdentity, recordRecipientIdentity } from "./whatsapp-recipient";

export type OfficialConnection = { organization_id: string; waba_id: string; phone_number_id: string; display_phone: string; verified_name: string; encrypted_token: string; permissions: string[]; status: string; connected_at: string; webhook_at: string | null; webhook_subscribed: boolean };
export type MetaTemplate = OfficialTemplate;
export class MetaCloudError extends Error {
  constructor(public code: string, public uncertain = false) { super(`Meta recusou a operação (${code}). Confira a conexão, as permissões e o status do número.`); }
}
export async function officialSettings(client: SupabaseClient) {
  const config = await loadMetaGuidedOAuthConfig({ client });
  const result = await client.from("integration_credentials").select("env_name, encrypted_value").eq("scope", "platform").is("organization_id", null).eq("integration_id", "meta").in("env_name", ["META_WHATSAPP_LOGIN_CONFIG_ID", "META_WHATSAPP_ACCESS_TOKEN", "META_WHATSAPP_WABA_ID", "META_WHATSAPP_PHONE_NUMBER_ID"]);
  if (result.error) throw new Error("Não foi possível consultar o cofre Meta.");
  const values = new Map<string,string>();
  for (const row of result.data ?? []) values.set(row.env_name, decryptCredentialValue(row.encrypted_value));
  return { ...config, signupConfigId: values.get("META_WHATSAPP_LOGIN_CONFIG_ID") ?? "", pilotToken: values.get("META_WHATSAPP_ACCESS_TOKEN") ?? "", pilotWaba: values.get("META_WHATSAPP_WABA_ID") ?? "", pilotPhone: values.get("META_WHATSAPP_PHONE_NUMBER_ID") ?? "" };
}

export async function cloudRequest<T>(config: {graphVersion:string;appSecret:string}, token: string, path: string, body?: unknown, query: Record<string,string> = {}): Promise<T> {
  if (!/^(?:\d{5,30}|debug_token|oauth)(?:\/[a-z_]+)?$/.test(path)) throw new Error("Caminho Meta inválido.");
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${path}`);
  for (const [key,value] of Object.entries(query)) url.searchParams.set(key,value);
  url.searchParams.set("appsecret_proof", createHmac("sha256", config.appSecret).update(token).digest("hex"));
  let response: Response;
  try { response = await fetch(url, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type":"application/json" }, ...(body ? {body:JSON.stringify(body)} : {}), cache:"no-store", signal:AbortSignal.timeout(20000) }); }
  catch { throw new MetaCloudError("conexão_indeterminada", true); }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error || !data) throw new MetaCloudError(String(data?.error?.code ?? response.status), response.status >= 500 || response.status === 408 || !data);
  return data as T;
}

async function cloudList<T>(config: {graphVersion:string;appSecret:string}, token: string, path: string, query: Record<string,string> = {}) {
  const all: T[] = []; let after = "";
  for (let page = 0; page < 20; page++) {
    const result = await cloudRequest<{data:T[];paging?:{next?:string;cursors?:{after?:string}}}>(config,token,path,undefined,{...query,limit:"100",...(after ? {after} : {})});
    if (!Array.isArray(result.data)) throw new Error("Resposta Meta sem lista de ativos.");
    all.push(...result.data);
    if (!result.paging?.next) return all;
    const next = result.paging.cursors?.after;
    if (!next || next === after) throw new Error("Paginação Meta inválida.");
    after = next;
  }
  throw new Error("Lista Meta excedeu o limite de consulta. Refine os ativos da conexão.");
}

export async function officialConnection(client: SupabaseClient, organizationId: string, sender?: string) {
  let query = client.from("meta_whatsapp_connections").select("*").eq("organization_id",organizationId).eq("status","connected");
  if(sender) query=query.eq("phone_number_id",officialAssetId(sender));
  const result = await query.order("connected_at",{ascending:true}).limit(1).maybeSingle<OfficialConnection>();
  if (result.error) throw new Error("Não foi possível consultar a conexão oficial.");
  return result.data;
}

export async function connectOfficial(client: SupabaseClient, organizationId: string, actorId: string, token: string, wabaValue: unknown, phoneValue: unknown) {
  const wabaId = officialAssetId(wabaValue), phoneId = officialAssetId(phoneValue);
  const config = await officialSettings(client);
  const debug = await cloudRequest<{data:{app_id:string;is_valid:boolean;scopes:string[]}}>(config,`${config.appId}|${config.appSecret}`,"debug_token",undefined,{input_token:token});
  if (!debug.data?.is_valid || debug.data.app_id !== config.appId || !["whatsapp_business_messaging","whatsapp_business_management"].every(p=>debug.data.scopes?.includes(p))) throw new Error("Token não pertence ao app ou falta autorização de mensagens/gerenciamento WhatsApp.");
  const phones = await cloudList<{id:string;display_phone_number:string;verified_name:string}>(config,token,`${wabaId}/phone_numbers`,{fields:"id,display_phone_number,verified_name"});
  const phone = phones.find(p=>p.id===phoneId);
  if (!phone) throw new Error("Número não pertence à conta WhatsApp autorizada.");
  const separate = await client.rpc("meta_whatsapp_number_separate",{p_phone:officialPhone(phone.display_phone_number)});
  if (separate.error || separate.data !== true) throw new Error("Use um número separado do atendimento UAZAPI. Coexistência ainda não homologada.");
  const saved = await client.rpc("connect_meta_whatsapp_sender",{p_org:organizationId,p_sender:phoneId,p_waba:wabaId,p_phone:phone.display_phone_number,p_name:phone.verified_name,p_token:encryptCredentialValue(token),p_permissions:debug.data.scopes,p_actor:actorId});
  if (saved.error) throw new Error("Número já pertence a outra empresa ou não foi possível salvar a conexão.");
  // WABA subscription is an explicit part of connecting the account.
  const subscription = await cloudRequest<{success:boolean}>(config,token,`${wabaId}/subscribed_apps`,{});
  if (!subscription.success) throw new Error("Conexão salva, mas a Meta não confirmou a assinatura do webhook. Reconecte para tentar novamente.");
  const activated = await client.from("meta_whatsapp_connections").update({webhook_subscribed:true}).eq("organization_id",organizationId).eq("phone_number_id",phoneId);
  if (activated.error) throw new Error("Assinatura confirmada; reconecte para concluir o registro local.");
  await client.from("maintenance_audit_logs").insert({actor_id:actorId,event_type:"meta.whatsapp.connected",target_table:"meta_whatsapp_connections",target_id:organizationId,metadata:{waba_id:wabaId,phone_number_id:phoneId}});
  return { displayPhone:phone.display_phone_number, verifiedName:phone.verified_name };
}

export async function listOfficialTemplates(client: SupabaseClient, connection: OfficialConnection) {
  return cloudList<MetaTemplate>(await officialSettings(client),decryptCredentialValue(connection.encrypted_token),`${connection.waba_id}/message_templates`,{fields:"id,name,status,language,category,components"});
}

export async function createOfficialTemplate(client: SupabaseClient, connection: OfficialConnection, body: Record<string,unknown>) {
  return cloudRequest<{id:string;status:string}>(await officialSettings(client),decryptCredentialValue(connection.encrypted_token),`${connection.waba_id}/message_templates`,templateInput(body));
}

export async function registerOfficialNumber(client: SupabaseClient, connection: OfficialConnection, pin: unknown) {
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) throw new Error("Informe o PIN de seis dígitos da verificação em duas etapas. Ele não será armazenado.");
  const result = await cloudRequest<{success:boolean}>(await officialSettings(client),decryptCredentialValue(connection.encrypted_token),`${connection.phone_number_id}/register`,{messaging_product:"whatsapp",pin});
  if (!result.success) throw new Error("Meta não confirmou o registro do número.");
  return {ok:true};
}

export async function sendOfficialMessage(client: SupabaseClient, connection: OfficialConnection, actorId: string, body: Record<string,unknown>) {
  if (!connection.webhook_subscribed) throw new Error("Reconecte o número para concluir a assinatura dos recibos antes de enviar.");
  const phone = officialPhone(body.phone), key = String(body.requestKey ?? "");
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(key)) throw new Error("Identificador do envio obrigatório.");
  const type = String(body.type ?? "text");
  if(!["template","text","interactive","image","audio","video","document"].includes(type))throw new Error("Tipo de mensagem inválido.");
  const org = connection.organization_id;
  const hash = createHash("sha256").update(JSON.stringify([connection.phone_number_id,phone,type,body.text,body.templateName,body.language,body.parameters,body.buttons,body.mediaId])).digest("hex");
  const existing = await client.from("meta_whatsapp_messages").select("id,status,request_hash").eq("organization_id",org).eq("request_key",key).maybeSingle();
  if (existing.error) throw new Error("Não foi possível conferir o envio anterior.");
  if (existing.data) {
    if (existing.data.request_hash !== hash) throw new Error("Identificador já usado para outra mensagem.");
    return existing.data;
  }
  const identity=recipientIdentity(phone,await recipientAliases(client,org,connection.phone_number_id,[phone]));
  const contact = await client.from("meta_whatsapp_contacts").select("*").eq("organization_id",org).in("phone",identity.phones);
  if (contact.error) throw new Error("Não foi possível conferir o contato.");
  if (contact.data?.some(c=>c.opted_out)) throw new Error("Contato pediu para não receber mensagens.");
  // Respect existing CRM decisions even before the first official message.
  for(const alias of identity.phones) {
    const leads = await client.rpc("meta_whatsapp_contact_allowed",{p_org:org,p_phone:alias});
    if (leads.error) throw new Error("Não foi possível conferir as preferências do lead.");
    if (leads.data !== true) throw new Error("Contato desativado no CRM.");
  }
  const payload: Record<string,unknown> = {messaging_product:"whatsapp",recipient_type:"individual",to:identity.phone,type};
  let content = String(body.text ?? "").trim();
  if (type === "template") {
    const consentNote = String(body.consentNote ?? "").trim();
    if (body.consent !== true || consentNote.length < 5 || consentNote.length > 500) throw new Error("Registre como o destinatário autorizou o contato.");
    const template = (await listOfficialTemplates(client,connection)).find(t=>t.name===body.templateName && t.language===body.language && t.status==="APPROVED");
    if (!template) throw new Error("Selecione um modelo aprovado pela Meta.");
    if(body.expectedTemplate && JSON.stringify(template.components)!==JSON.stringify(body.expectedTemplate))throw new Error("O modelo mudou após a revisão da campanha.");
    const rendered=templateParameters(template,body.parameters);
    content = template.components.map(c=>c.type==="BODY"?rendered.text:c.text ?? "").filter(Boolean).join("\n");
    payload.template = {name:template.name,language:{code:template.language},...(rendered.components.length?{components:rendered.components}:{})};
    payload.templatePreview = template.components;
    const created = await client.from("meta_whatsapp_contacts").upsert({organization_id:org,phone},{onConflict:"organization_id,phone",ignoreDuplicates:true});
    if (created.error) throw new Error("Não foi possível registrar o contato.");
    const consent = await client.from("meta_whatsapp_contacts").update({consent_note:consentNote,consent_at:new Date().toISOString()}).eq("organization_id",org).eq("phone",phone).eq("opted_out",false).select("phone").maybeSingle();
    if (consent.error || !consent.data) throw new Error("Não foi possível registrar o consentimento. Confira se o contato pediu parada.");
  } else {
    const inbound=await client.from("meta_whatsapp_messages").select("occurred_at").eq("organization_id",org).eq("phone_number_id",connection.phone_number_id).in("phone",identity.phones).eq("direction","inbound").order("occurred_at",{ascending:false}).limit(1).maybeSingle();
    if(inbound.error)throw new Error("Não foi possível conferir a janela de atendimento deste número.");
    if (!serviceWindowOpen(inbound.data?.occurred_at ?? null)) throw new Error("Fora da janela de atendimento de 24 horas. Envie um modelo aprovado.");
    if (["text","interactive"].includes(type)) {
      if (!content || content.length > (type==="interactive"?1024:4096)) throw new Error("Texto vazio ou acima do limite do tipo de mensagem.");
      if(type==="interactive")payload.interactive={type:"button",body:{text:content},action:{buttons:replyButtons(body.buttons)}};
      else payload.text = {body:content,preview_url:false};
    } else {
      const media=await client.from("meta_whatsapp_media").select("id,media_type,filename").eq("organization_id",org).eq("phone_number_id",connection.phone_number_id).eq("id",String(body.mediaId ?? "")).maybeSingle();
      if(media.error||!media.data||media.data.media_type!==type)throw new Error("Anexe um arquivo deste número antes de enviar.");
      if(content.length>1024)throw new Error("Legenda: até 1.024 caracteres.");
      if(type==='audio'&&content)throw new Error("Áudios não aceitam legenda. Envie o texto em uma mensagem separada.");
      payload[type]={id:media.data.id,...(content&&type!=="audio"?{caption:content}:{}),...(type==="document"?{filename:media.data.filename}:{})};
      content=content || `[${type}: ${media.data.filename}]`;
    }
  }
  // The pilot does not bypass the platform's tracked-link/button delivery policy.
  if (collectOutboundLinks({text:content}).length) throw new Error("Use texto sem URLs. Links rastreáveis em botões oficiais ainda não estão habilitados.");
  const storedContent={...payload};delete storedContent.to;delete storedContent.messaging_product;delete storedContent.recipient_type;
  delete payload.templatePreview;
  const reserved = await client.from("meta_whatsapp_messages").insert({organization_id:org,phone_number_id:connection.phone_number_id,phone,direction:"outbound",message_type:type,text_content:content,request_key:key,request_hash:hash,status:"sending",content:storedContent,created_by:actorId}).select("id,status").single();
  if (reserved.error) throw new Error(reserved.error.code === "23505" ? "Este envio já está em processamento. Atualize o chat." : "Não foi possível registrar o envio.");
  const id = reserved.data.id;
  try {
    const result = await cloudRequest<{messages:Array<{id:string}>;contacts?:unknown}>(await officialSettings(client),decryptCredentialValue(connection.encrypted_token),`${connection.phone_number_id}/messages`,payload);
    const messageId = result.messages?.[0]?.id;
    if (!messageId) throw new MetaCloudError("sem_recibo",true);
    const saved = await client.from("meta_whatsapp_messages").update({provider_message_id:messageId,status:"accepted",updated_at:new Date().toISOString()}).eq("id",id).eq("status","sending");
    if (saved.error) throw new MetaCloudError("recibo_não_persistido",true);
    try { await recordRecipientIdentity(client,org,connection.phone_number_id,identity.phone,result.contacts); }
    catch { return {id,status:"accepted",warning:"Meta aceitou o envio; associação do contato pendente. Não reenvie."}; }
    const receipt = await client.rpc("reconcile_meta_whatsapp_receipt",{p_phone:connection.phone_number_id,p_message:messageId});
    const archive = await client.rpc("archive_meta_whatsapp_message",{p_id:id});
    if (receipt.error || archive.error) return {id,status:"accepted",warning:"Meta aceitou o envio; sincronização do histórico pendente. Não reenvie."};
    return {id,status:"accepted"};
  } catch (error) {
    const status = error instanceof MetaCloudError && !error.uncertain ? "failed" : "uncertain";
    await client.from("meta_whatsapp_messages").update({status,error_code:error instanceof MetaCloudError ? error.code : "falha_interna",updated_at:new Date().toISOString()}).eq("id",id).eq("status","sending");
    throw error;
  }
}
