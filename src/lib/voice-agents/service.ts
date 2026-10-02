import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadElevenLabsCredentials } from "@/lib/elevenlabs/credentials";
import { meterUsageEvent, resolveActiveBillingRates } from "@/lib/billing/metered-usage";
import { TARIFF_REFERENCE_USD_BRL, INCLUDED_CREDIT_TARGET_MARKUP, CONNECTY_CREDIT_UNIT_BRL } from "@/lib/billing/credit-economics";

// Real-time voice agents on the provider's agent platform, mirroring a company's
// WhatsApp agent. The company pays per finished conversation, once, from its wallet:
// the larger of the per-minute base tariff and the provider's reported total cost
// (speech + language model) at the same markup. Calls only start when the balance
// covers the agent's maximum duration.

const origin = "https://api.elevenlabs.io";
export const voiceAgentFeature = "voice_agent_conversation";
const preferredLlms = ["gemini-2.5-flash", "gpt-4o-mini"];

export type VoiceAgentRow = {
  id: string; organization_id: string; agent_registry_id: string; provider_agent_id: string | null; name: string; voice_id: string;
  first_message: string; language: string; max_duration_seconds: number; status: string; last_synced_at: string | null;
};
type RegistryAgent = { id: string; name: string; persona_name: string | null; prompt: string | null; organization_id: string | null };

export class VoiceAgentError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}

/** Agent prompt for a spoken channel: same identity, short spoken answers, honest about being AI. */
export function buildVoiceAgentPrompt(agent: RegistryAgent, company: string) {
  const persona = agent.persona_name?.trim() || agent.name;
  return [
    agent.prompt?.trim() || `Você é ${persona}, atendente da ${company}.`,
    "",
    "ATENDIMENTO POR VOZ (LIGAÇÃO):",
    `- Você fala em nome da ${company}, como ${persona}.`,
    "- Responda como numa conversa falada: frases curtas, uma pergunta por vez, sem listas, links ou emojis.",
    "- Não leia URLs, códigos ou símbolos; ofereça enviar por WhatsApp quando precisar de link.",
    "- Se perguntarem se você é uma pessoa, diga com naturalidade que é um assistente de inteligência artificial da empresa.",
    "- Confirme ações apenas quando realmente concluídas; se não puder resolver, explique e ofereça encaminhar para a equipe.",
  ].join("\n");
}

async function provider(apiKey: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${origin}${path}`, {
    ...init, headers: { "xi-api-key": apiKey, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000), redirect: "error", cache: "no-store",
  });
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300) }; } })() : {};
  return { ok: response.ok, status: response.status, data };
}

export function agentConfig(row: Pick<VoiceAgentRow, "name" | "voice_id" | "first_message" | "language" | "max_duration_seconds">, prompt: string, llm: string) {
  return {
    name: row.name,
    tags: ["connectyhub"],
    conversation_config: {
      agent: { prompt: { prompt, llm }, first_message: row.first_message, language: row.language },
      tts: { voice_id: row.voice_id, model_id: row.language === "en" ? "eleven_flash_v2" : "eleven_flash_v2_5" },
      conversation: { max_duration_seconds: row.max_duration_seconds },
    },
  };
}

/** Creates or updates the provider agent from the company's WhatsApp agent. */
export async function syncVoiceAgent(client: SupabaseClient, input: {
  organizationId: string; agentRegistryId: string; voiceId: string; firstMessage?: string; maxDurationSeconds?: number; language?: string; userId?: string | null;
}) {
  const [{ data: agent }, { data: org }] = await Promise.all([
    client.from("agent_registry").select("id,name,persona_name,prompt,organization_id").eq("id", input.agentRegistryId).maybeSingle<RegistryAgent>(),
    client.from("organizations").select("name").eq("id", input.organizationId).maybeSingle<{ name: string }>(),
  ]);
  if (!agent || agent.organization_id !== input.organizationId) throw new VoiceAgentError("agent_not_found", 404, "Agente não encontrado nesta conta.");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.voiceId)) throw new VoiceAgentError("invalid_voice", 422, "Escolha uma voz do catálogo.");
  const company = org?.name ?? "empresa";
  const persona = agent.persona_name?.trim() || agent.name;
  const existing = await client.from("voice_agents").select("*").eq("agent_registry_id", agent.id).maybeSingle<VoiceAgentRow>();
  const row = {
    organization_id: input.organizationId, agent_registry_id: agent.id, name: `${persona} · voz`, voice_id: input.voiceId,
    first_message: (input.firstMessage?.trim() || `Olá! Aqui é ${persona}, da ${company}. Como posso ajudar?`).slice(0, 400),
    language: input.language === "en" || input.language === "es" ? input.language : "pt",
    max_duration_seconds: Math.min(1800, Math.max(60, Math.round(input.maxDurationSeconds ?? existing.data?.max_duration_seconds ?? 300))),
  };
  const { apiKey } = await loadElevenLabsCredentials(client);
  const prompt = buildVoiceAgentPrompt(agent, company);
  let providerId = existing.data?.provider_agent_id ?? null, last = { ok: false, status: 0, data: {} as Record<string, unknown> };
  for (const llm of preferredLlms) {
    const config = agentConfig(row, prompt, llm);
    last = providerId
      ? await provider(apiKey, `/v1/convai/agents/${encodeURIComponent(providerId)}`, { method: "PATCH", body: JSON.stringify(config) })
      : await provider(apiKey, "/v1/convai/agents/create", { method: "POST", body: JSON.stringify(config) });
    if (last.ok) break;
    if (last.status !== 422 && last.status !== 400) break;
  }
  if (!last.ok) throw new VoiceAgentError("provider_rejected", 502, "Não foi possível configurar o agente de voz no serviço de voz.");
  providerId = providerId ?? String(last.data.agent_id ?? "");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(providerId)) throw new VoiceAgentError("provider_rejected", 502, "Identificador do agente de voz inválido.");
  const now = new Date().toISOString();
  const saved = await client.from("voice_agents").upsert({ ...row, provider_agent_id: providerId, status: "active", last_synced_at: now, updated_at: now, ...(existing.data ? {} : { created_by: input.userId ?? null }) }, { onConflict: "agent_registry_id" }).select("*").single<VoiceAgentRow>();
  if (saved.error || !saved.data) throw new VoiceAgentError("save_failed", 503, "Agente configurado, mas o registro não foi salvo. Repita a operação.");
  return saved.data;
}

async function baseRate(client: SupabaseClient, planCode: string | null) {
  const rates = await resolveActiveBillingRates(client, { provider: "elevenlabs", featureCode: voiceAgentFeature, modelId: "elevenlabs-agents", planCode });
  const rate = rates.find(item => item.unit === "minute");
  if (!rate || rate.connectyPricePerUnit <= 0) throw new VoiceAgentError("pricing_unavailable", 503, "Tarifa do agente de voz indisponível.");
  return rate;
}

/** Credits for one finished conversation: per-minute base or provider total cost at the same markup, whichever is larger. */
export function voiceAgentCharge(durationSeconds: number, costUsd: number | null, rate: { connectyPricePerUnit: number; minimumChargeCredits: number }) {
  const minutes = Math.ceil(Math.max(0, durationSeconds)) / 60;
  const base = minutes * rate.connectyPricePerUnit;
  const byCost = costUsd && costUsd > 0 ? (costUsd * TARIFF_REFERENCE_USD_BRL * INCLUDED_CREDIT_TARGET_MARKUP) / CONNECTY_CREDIT_UNIT_BRL : 0;
  const credits = Math.max(rate.minimumChargeCredits, base, byCost);
  return { minutes, credits: Math.round(credits * 1e6) / 1e6, providerCostBrl: Math.round(Math.max(costUsd ?? 0, minutes * 0.08) * TARIFF_REFERENCE_USD_BRL * 1e8) / 1e8 };
}

/** Signed URL for a browser call, only when the balance covers the whole maximum duration. */
export async function startVoiceAgentCall(client: SupabaseClient, organizationId: string, voiceAgentId: string) {
  const { data: agent } = await client.from("voice_agents").select("*").eq("id", voiceAgentId).eq("organization_id", organizationId).maybeSingle<VoiceAgentRow>();
  if (!agent || agent.status !== "active" || !agent.provider_agent_id) throw new VoiceAgentError("agent_unavailable", 404, "Agente de voz indisponível.");
  const { data: org } = await client.from("organizations").select("billing_organization_id,plan_code").eq("id", organizationId).maybeSingle<{ billing_organization_id: string | null; plan_code: string | null }>();
  const billingOrg = org?.billing_organization_id ?? organizationId;
  const [{ data: wallet }, { data: billingPlan }] = await Promise.all([
    client.from("credit_wallets").select("balance_credits,reserved_credits").eq("organization_id", billingOrg).maybeSingle<{ balance_credits: number; reserved_credits: number }>(),
    client.from("organizations").select("plan_code").eq("id", billingOrg).maybeSingle<{ plan_code: string | null }>(),
  ]);
  const rate = await baseRate(client, billingPlan?.plan_code ?? org?.plan_code ?? null);
  const needed = Math.max(rate.minimumChargeCredits, (agent.max_duration_seconds / 60) * rate.connectyPricePerUnit);
  const available = Number(wallet?.balance_credits ?? 0) - Number(wallet?.reserved_credits ?? 0);
  if (available < needed) throw new VoiceAgentError("insufficient_credits", 402, `Saldo insuficiente para uma chamada: até ${Math.round(needed)} créditos para ${Math.round(agent.max_duration_seconds / 60)} minutos; disponível ${Math.floor(available)}.`);
  const { apiKey } = await loadElevenLabsCredentials(client);
  const result = await provider(apiKey, `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agent.provider_agent_id)}`, { method: "GET" });
  if (!result.ok || typeof result.data.signed_url !== "string") throw new VoiceAgentError("provider_rejected", 502, "Não foi possível iniciar a chamada.");
  return { signed_url: result.data.signed_url as string, max_duration_seconds: agent.max_duration_seconds, credits_per_minute: rate.connectyPricePerUnit };
}

type ProviderConversation = { conversation_id: string; status: string; call_duration_secs?: number; start_time_unix_secs?: number };

/** Cron (Inngest): charges finished conversations once; idempotent by provider conversation id. */
export async function meterVoiceAgentConversations(client: SupabaseClient) {
  const { data: agents, error } = await client.from("voice_agents").select("*").not("provider_agent_id", "is", null).neq("status", "deleted").limit(200);
  if (error) throw new Error("Voice agents unavailable");
  if (!agents?.length) return { processed: 0 };
  const { apiKey } = await loadElevenLabsCredentials(client);
  const results: Array<Record<string, unknown>> = [];
  for (const agent of agents as VoiceAgentRow[]) {
    const list = await provider(apiKey, `/v1/convai/conversations?agent_id=${encodeURIComponent(agent.provider_agent_id!)}&page_size=30`, { method: "GET" });
    if (!list.ok) { results.push({ agent: agent.id, status: "list_failed" }); continue; }
    for (const item of (list.data.conversations ?? []) as ProviderConversation[]) {
      if (!["done", "failed"].includes(item.status)) continue;
      const known = await client.from("voice_agent_conversations").select("id,metered_at").eq("provider_conversation_id", item.conversation_id).maybeSingle();
      if (known.data?.metered_at) continue;
      const detail = await provider(apiKey, `/v1/convai/conversations/${encodeURIComponent(item.conversation_id)}`, { method: "GET" });
      if (!detail.ok) continue;
      const metadata = (detail.data.metadata ?? {}) as { call_duration_secs?: number; cost_fiat?: number; start_time_unix_secs?: number };
      const duration = Number(metadata.call_duration_secs ?? item.call_duration_secs ?? 0);
      const costUsd = Number.isFinite(Number(metadata.cost_fiat)) ? Number(metadata.cost_fiat) : null;
      const record = { voice_agent_id: agent.id, organization_id: agent.organization_id, provider_conversation_id: item.conversation_id, status: item.status, duration_seconds: Math.round(duration), cost_usd: costUsd,
        started_at: item.start_time_unix_secs ? new Date(item.start_time_unix_secs * 1000).toISOString() : null };
      await client.from("voice_agent_conversations").upsert(record, { onConflict: "provider_conversation_id" });
      if (duration <= 0) { await client.from("voice_agent_conversations").update({ metered_at: new Date().toISOString(), charged_credits: 0 }).eq("provider_conversation_id", item.conversation_id); continue; }
      const { data: org } = await client.from("organizations").select("billing_organization_id,plan_code").eq("id", agent.organization_id).maybeSingle<{ billing_organization_id: string | null; plan_code: string | null }>();
      const billingOrg = org?.billing_organization_id ?? agent.organization_id;
      const { data: billingPlan } = await client.from("organizations").select("plan_code").eq("id", billingOrg).maybeSingle<{ plan_code: string | null }>();
      const charge = voiceAgentCharge(duration, costUsd, await baseRate(client, billingPlan?.plan_code ?? org?.plan_code ?? null));
      try {
        const metered = await meterUsageEvent(client, {
          organizationId: agent.organization_id, provider: "elevenlabs", featureCode: voiceAgentFeature, modelId: "elevenlabs-agents",
          minutes: charge.minutes, connectyChargeCreditsOverride: charge.credits, providerCostOverride: charge.providerCostBrl,
          requestId: `voice-agent:${item.conversation_id}`, debitDescription: "Agente de voz ConnectyHub",
          metadata: { source: "voice_agent", voice_agent_id: agent.id, provider_conversation_id: item.conversation_id, duration_seconds: duration, provider_cost_usd: costUsd },
        });
        await client.from("voice_agent_conversations").update({ metered_at: new Date().toISOString(), charged_credits: metered.chargeCredits, usage_event_id: metered.usageEventId }).eq("provider_conversation_id", item.conversation_id);
        results.push({ conversation: item.conversation_id, credits: metered.chargeCredits });
      } catch {
        results.push({ conversation: item.conversation_id, status: "metering_pending" });
      }
    }
  }
  return { processed: results.length, results };
}

export async function deleteVoiceAgent(client: SupabaseClient, organizationId: string, voiceAgentId: string) {
  const { data: agent } = await client.from("voice_agents").select("*").eq("id", voiceAgentId).eq("organization_id", organizationId).maybeSingle<VoiceAgentRow>();
  if (!agent) throw new VoiceAgentError("agent_not_found", 404, "Agente de voz não encontrado.");
  if (agent.provider_agent_id) {
    const { apiKey } = await loadElevenLabsCredentials(client);
    const removed = await provider(apiKey, `/v1/convai/agents/${encodeURIComponent(agent.provider_agent_id)}`, { method: "DELETE" });
    if (!removed.ok && removed.status !== 404) throw new VoiceAgentError("provider_rejected", 502, "Não foi possível remover o agente de voz.");
  }
  // Keeps the row (and its conversations) for billing history; the provider agent is gone.
  await client.from("voice_agents").update({ status: "deleted", updated_at: new Date().toISOString() }).eq("id", agent.id);
  return { id: agent.id, status: "deleted" };
}
