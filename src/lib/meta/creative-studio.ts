import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGeminiCredentials } from "@/lib/gemini/credentials";
import { geminiLowThinkingConfig } from "@/lib/gemini/models";
import { loadR2Config, buildPublicObjectUrl } from "@/lib/storage/r2";
import { runMeteredMetaGeneration, metaAiTariffs } from "./ai-generation";
import { calculateMeteredUsageCharge } from "@/lib/billing/metered-usage";
import { assertContractAccess } from "@/lib/billing/contract-access";
import { creativePrompt, parseCreativeReport, type CreativeBrief } from "./creative-policy";

const host = "https://generativelanguage.googleapis.com";
const publicFields = "id,mode,status,brief,result,model,usage_event_id,charge_credits,error_message,created_at,proposal_approval";
export async function creativeTariffs(client:SupabaseClient,org:string) {
 const credentials=await loadGeminiCredentials(client);
 return Promise.all(["ai_traffic_manager","media_image_analysis","media_video_analysis"].map(async feature=>{
   const {rates}=await metaAiTariffs(client,org,credentials.model,feature);
   return {feature,inputPerThousand:calculateMeteredUsageCharge({rates,units:{inputTokens:1000}}).chargeCredits,outputPerThousand:calculateMeteredUsageCharge({rates,units:{outputTokens:1000}}).chargeCredits};
 }));
}
export async function approveCreativeProposal(client: SupabaseClient, org: string, userId: string, id: string) {
  await assertContractAccess(org, client);
  const row = await client.from("meta_creative_jobs").select("id,mode,status,brief,result,input_hash,proposal_approval").eq("organization_id", org).eq("id", id).single();
  const job = row.data;
  if (row.error || !job || job.status !== "completed" || job.mode !== "campaign" || !job.result?.campaign) throw Error("Selecione uma proposta concluída desta empresa.");
  if (job.proposal_approval) return creativeHistory(client, org);
  if (!job.brief?.mediaId || !job.brief?.currency || !Number.isFinite(job.brief?.dailyBudget) || job.brief.dailyBudget <= 0) throw Error("Prepare uma proposta com criativo, moeda e verba diária antes de aprovar.");
  const media = await client.from("content_pipeline_items").select("id,metadata").eq("organization_id", org).eq("scope", "organization").eq("content_type", "meta_organic_media").eq("id", job.brief.mediaId).single();
  if (media.error || !media.data) throw Error("O criativo original não está mais disponível nesta empresa.");
  const snapshot = { brief: job.brief, result: job.result, media: media.data };
  const approval = { approvedAt: new Date().toISOString(), approvedBy: userId, scope: "proposal_only", contentHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), snapshot };
  const updated = await client.from("meta_creative_jobs").update({ proposal_approval: approval }).eq("organization_id", org).eq("id", id).eq("status", "completed").eq("input_hash", job.input_hash).is("proposal_approval", null);
  if (updated.error) throw Error("Não foi possível registrar a aprovação. Atualize e confira antes de repetir.");
  return creativeHistory(client, org);
}
export async function creativeHistory(client: SupabaseClient, org: string) {
  const unfinished=await client.from("meta_creative_jobs").select("id,brief").eq("organization_id",org).in("status",["running","generated","uncertain"]).limit(10);
  for(const job of unfinished.data??[]) {
    const bill=await client.from("meta_ai_charges").select("status,settlement,provider_response,charge_credits,usage_event_id").eq("organization_id",org).eq("id",job.id).maybeSingle();
    if(bill.error||!bill.data)continue;
    if(bill.data.settlement&&bill.data.status!=="completed")await client.rpc("finish_meta_ai",{p_id:job.id});
    const receipt=await client.from("meta_ai_charges").select("status,provider_response,charge_credits,usage_event_id").eq("organization_id",org).eq("id",job.id).single();
    if(receipt.data?.status!=="completed")continue;
    try {
      const text=(receipt.data.provider_response?.candidates?.[0]?.content?.parts??[]).filter((p:{thought?:boolean})=>!p.thought).map((p:{text?:string})=>p.text??"").join("");
      const result=parseCreativeReport(JSON.parse(text),job.brief);
      await client.from("meta_creative_jobs").update({status:"completed",result,error_message:null,usage_event_id:receipt.data.usage_event_id,charge_credits:receipt.data.charge_credits}).eq("organization_id",org).eq("id",job.id);
    }catch{await client.from("meta_creative_jobs").update({error_message:"A IA retornou formato incompleto. O consumo efetivo está registrado; o suporte pode conferir o resultado.",usage_event_id:receipt.data.usage_event_id,charge_credits:receipt.data.charge_credits}).eq("organization_id",org).eq("id",job.id);}
  }
  // Interrupted processes must be reconciled, not automatically regenerated or charged twice.
  await client.from("meta_creative_jobs").update({ status: "uncertain", error_message: "A execução foi interrompida. O suporte precisa conferir resultado e consumo antes de repetir." })
    .eq("organization_id", org).in("status", ["running", "generated"]).lt("updated_at", new Date(Date.now() - 10 * 60000).toISOString());
  const r = await client.from("meta_creative_jobs").select(publicFields).eq("organization_id", org).order("created_at", { ascending: false }).limit(40);
  if (r.error) throw Error("Não foi possível carregar o histórico de criativos.");
  return (r.data ?? []).map(j => ({ ...j, result: j.status === "completed" ? j.result : null,
    proposal_approval: j.proposal_approval ? { approvedAt: j.proposal_approval.approvedAt, scope: j.proposal_approval.scope } : null }));
}
async function ownedMedia(client: SupabaseClient, org: string, id: string) {
  const r = await client.from("content_pipeline_items").select("id,title,metadata").eq("organization_id", org)
    .eq("scope", "organization").eq("content_type", "meta_organic_media").eq("id", id).single();
  if (r.error || !r.data) throw Error("Selecione uma mídia da biblioteca desta empresa.");
  const m = r.data.metadata;
  if (!m || !["image/jpeg", "video/mp4"].includes(m.content_type) || !Number.isFinite(m.size) || m.size <= 0 || m.size > 100 * 1024 * 1024
    || typeof m.storage_key !== "string" || !m.storage_key.startsWith(`meta/organic/${org}/`) || m.storage_key.includes("..")) throw Error("Mídia não compatível. Envie JPG ou MP4 pela biblioteca.");
  const config = await loadR2Config(client);
  if (!config.ok) throw Error("Armazenamento indisponível.");
  // Never fetch a caller-provided URL, a remote caption URL or redirects.
  const url = buildPublicObjectUrl(config.config.publicUrl, m.storage_key);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60000) });
  if (!response.ok || !response.body) throw Error("Não foi possível ler o arquivo do criativo.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  while (true) { const c = await reader.read(); if (c.done) break; size += c.value.length;
    if (size > 100 * 1024 * 1024 || size > m.size) { await reader.cancel(); throw Error("Arquivo acima do limite registrado."); } chunks.push(c.value); }
  if (size !== m.size) throw Error("O arquivo mudou. Envie o criativo novamente.");
  return { bytes: Buffer.concat(chunks), mime: m.content_type as string };
}
async function jsonCall(key: string, path: string, body?: unknown) {
  const r = await fetch(`${host}${path}`, { method: body === undefined ? "GET" : "POST", redirect: "error",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw Error(`O provedor de IA não concluiu a operação (HTTP ${r.status}).`);
  return r.json();
}
async function uploadFile(key: string, media: { bytes: Buffer; mime: string }) {
  const start = await fetch(`${host}/upload/v1beta/files`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { "x-goog-api-key": key, "Content-Type": "application/json", "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(media.bytes.length), "X-Goog-Upload-Header-Content-Type": media.mime }, body: JSON.stringify({ file: { display_name: "ConnectyHub creative" } }) });
  const location = start.headers.get("x-goog-upload-url");
  if (!start.ok || !location || new URL(location).origin !== host) throw Error("Não foi possível preparar a análise do arquivo.");
  const upload = await fetch(location, { method: "POST", redirect: "error", signal: AbortSignal.timeout(60000),
    headers: { "x-goog-api-key": key, "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" }, body: new Uint8Array(media.bytes) });
  if (!upload.ok) throw Error("Não foi possível enviar o criativo à IA.");
  const { file } = await upload.json();
  if (!file?.name || !/^files\/[a-zA-Z0-9_-]+$/.test(file.name)) throw Error("Arquivo da IA inválido.");
  return file as { name: string; uri: string; state: string };
}
export async function runCreativeJob(client: SupabaseClient, org: string, userId: string, id: string, brief: CreativeBrief) {
  await assertContractAccess(org, client);
  const hash = createHash("sha256").update(JSON.stringify(brief)).digest("hex");
  const existing = await client.from("meta_creative_jobs").select("id,input_hash,status").eq("organization_id", org).eq("id", id).maybeSingle();
  if (existing.error) throw Error("Histórico indisponível.");
  if (existing.data) {
    if (existing.data.input_hash !== hash) throw Error("Esta solicitação já foi usada com outro conteúdo.");
    return creativeHistory(client, org);
  }
  const credentials = await loadGeminiCredentials(client), prompt = creativePrompt(brief);
  let feature = "ai_traffic_manager";
  const inserted = await client.from("meta_creative_jobs").insert({ id, organization_id: org, user_id: userId, input_hash: hash, mode: brief.mode, brief, model: credentials.model });
  if (inserted.error) throw Error("Já existe uma análise em andamento. Atualize o histórico antes de repetir.");
  let fileName: string | null = null, dispatched = false, saved = false;
  const update = async (values: Record<string, unknown>) => {
    const r = await client.from("meta_creative_jobs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", org);
    if (r.error) throw Error("Não foi possível registrar esta operação. Confira o histórico antes de repetir.");
  };
  try {
    const parts: Record<string, unknown>[] = [{ text: prompt }];
    if (brief.mediaId) {
      const media = await ownedMedia(client, org, brief.mediaId);
      if (brief.mode === "analysis") feature = media.mime.startsWith("video/") ? "media_video_analysis" : "media_image_analysis";
      let file = await uploadFile(credentials.apiKey, media); fileName = file.name;
      const deadline = Date.now() + 90000;
      while (file.state === "PROCESSING" && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2000));
        file = await jsonCall(credentials.apiKey, `/v1beta/${fileName}`);
      }
      if (file.state !== "ACTIVE" || !file.uri?.startsWith(`${host}/v1beta/files/`)) throw Error("A mídia não ficou disponível para análise. Tente novamente mais tarde.");
      parts.push({ fileData: { mimeType: media.mime, fileUri: file.uri } });
    }
    const contents = [{ role: "user", parts }];
    const counted = await jsonCall(credentials.apiKey, `/v1beta/models/${encodeURIComponent(credentials.model)}:countTokens`, { contents });
    if (!Number.isFinite(counted.totalTokens) || counted.totalTokens <= 0 || counted.totalTokens > 180000) throw Error("Criativo longo demais para esta análise. Envie uma versão mais curta.");
    dispatched = true;
    const receipt = await runMeteredMetaGeneration({client,org,user:userId,id,feature,model:credentials.model,apiKey:credentials.apiKey,
      inputTokens:counted.totalTokens,maxOutput:8192,identity:brief,
      body:{contents,generationConfig:{...geminiLowThinkingConfig(credentials.model),temperature:0.35,maxOutputTokens:8192,responseMimeType:"application/json"}}});
    const data = receipt.data as { candidates?: {content?: {parts?: {thought?:boolean;text?:string}[]}}[] };
    const text = (data.candidates?.[0]?.content?.parts ?? []).filter(p=>!p.thought).map(p=>p.text??"").join("");
    await update({status:"generated",provider_response:data}); saved=true;
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw Error("A IA retornou um formato incompleto. O resultado e o consumo foram preservados para conferência."); }
    const result = parseCreativeReport(parsed, brief);
    await update({ status: "completed", result, usage_event_id: receipt.usageEventId, charge_credits: receipt.chargeCredits });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir a análise.";
    await update({ status: dispatched ? "uncertain" : "failed", error_message: saved ? "O resultado foi recebido, mas precisa de conferência antes de uma nova tentativa." : message });
    throw Error(message);
  } finally {
    if (fileName) await fetch(`${host}/v1beta/${fileName}`, { method: "DELETE", headers: { "x-goog-api-key": credentials.apiKey }, signal: AbortSignal.timeout(10000) }).catch(() => undefined);
  }
  return creativeHistory(client, org);
}
