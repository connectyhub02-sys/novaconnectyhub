import "server-only";
import { randomBytes } from "node:crypto";
import { metaRecord, requireMetaScopes, type AdsLeadsContext, type MetaRecord } from "./ads-leads-context";

const endpoint = "https://mcp.facebook.com/ads";
export const adsMcpReadTools = ["ads_get_ad_entities", "ads_get_opportunity_score"] as const;
export type AdsMcpTool = {name:string; inputSchema:MetaRecord};

export function parseMcpResponse(text: string, id: number): MetaRecord {
  let packets: unknown[];
  try { packets = [JSON.parse(text)]; }
  catch { packets = text.split(/\r?\n\r?\n/).flatMap(event => {
    const data = event.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).trimStart()).join("\n");
    try { return data ? [JSON.parse(data)] : []; } catch { return []; }
  }); }
  const packet = packets.map(metaRecord).find(p => p.id === id);
  if (!packet || packet.error || !packet.result) throw new Error("MCP não concluiu a operação. Confira a autorização Meta.");
  const result = metaRecord(packet.result);
  if (result.isError) throw new Error("A ferramenta MCP recusou a operação. Confira acesso e parâmetros da conta.");
  return result;
}

async function rpc(ctx: AdsLeadsContext, method: "tools/list" | "tools/call", params?: MetaRecord) {
  requireMetaScopes(ctx,["ads_mcp_management"]);
  if (!ctx.scopes.some(s => s === "ads_read" || s === "ads_management") || !ctx.token)
    throw new Error("Reconecte a Meta com acesso à conta de anúncios.");
  const response = await fetch(endpoint, {method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(45000),
    headers:{Authorization:`Bearer ${ctx.token}`,"Content-Type":"application/json",Accept:"application/json, text/event-stream"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,...(params ? {params} : {})})});
  if (!response.ok) throw new Error(`MCP Meta indisponível (HTTP ${response.status}). Reconecte a conta com ads_mcp_management.`);
  return parseMcpResponse(await response.text(),1);
}
export async function listAdsMcpTools(ctx: AdsLeadsContext): Promise<AdsMcpTool[]> {
  const result = await rpc(ctx,"tools/list");
  return (Array.isArray(result.tools) ? result.tools : []).map(metaRecord)
    .filter(t => typeof t.name === "string").map(t => ({name:t.name as string,inputSchema:metaRecord(t.inputSchema)}));
}

// The browser cannot supply an account, tool name, arbitrary arguments or status.
// Discovery does not authorize execution: only these reviewed read tools run.
export function buildAdsMcpReadCall(tool: AdsMcpTool, account: string) {
  if (!adsMcpReadTools.includes(tool.name as typeof adsMcpReadTools[number])) throw new Error("Ferramenta não permitida neste painel.");
  if (!/^act_\d+$/.test(account)) throw new Error("Selecione a conta de anúncios em Integrações.");
  const props = metaRecord(tool.inputSchema.properties);
  const accountKey = ["ad_account_id", "account_id"].find(k => Object.hasOwn(props,k));
  if (!accountKey) throw new Error("A ferramenta mudou de formato; integração requer atualização.");
  const args:MetaRecord = {[accountKey]:account.replace(/^act_/,"")};
  if (Object.hasOwn(props,"level")) args.level = "campaign";
  if (Object.hasOwn(props,"entity_type")) args.entity_type = "campaign";
  if (Object.hasOwn(props,"date_preset")) args.date_preset = "last_30d";
  if (Object.hasOwn(props,"limit")) args.limit = 20;
  if (Object.hasOwn(props,"client_conversation_id")) args.client_conversation_id = randomBytes(10).toString("hex");
  if (Object.hasOwn(props,"advertiser_job")) args.advertiser_job = "report_measure_or_look_up";
  const required = Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required : [];
  if (required.some(k => typeof k !== "string" || !Object.hasOwn(args,k))) throw new Error("A ferramenta exige parâmetros ainda não suportados.");
  return {name:tool.name,arguments:args};
}
export async function runAdsMcpReport(ctx: AdsLeadsContext, kind: "campaigns" | "opportunities") {
  const name = kind === "campaigns" ? "ads_get_ad_entities" : "ads_get_opportunity_score";
  const tool = (await listAdsMcpTools(ctx)).find(t => t.name === name);
  if (!tool) throw new Error("Ferramenta não disponível para esta autorização Meta.");
  return rpc(ctx,"tools/call",buildAdsMcpReadCall(tool,ctx.adAccountId));
}
