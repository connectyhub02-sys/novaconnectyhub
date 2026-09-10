import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chooseNotificationAgent, type NotificationSenderPreference } from "./notification-sender-policy";

type RecordValue = Record<string, unknown>;
type Agent = { id: string; organization_id: string; name: string; persona_name: string; status: string; metadata: RecordValue; created_at: string };
export type NotificationInstance = { id: string; organization_id: string; status: string; phone_number: string | null; instance_token_encrypted: string | null; metadata: RecordValue };
export type NotificationSender = { kind: "customer" | "platform"; agentId: string; agentName?: string; instance: NotificationInstance };
const instanceFields = "id,organization_id,status,phone_number,instance_token_encrypted,metadata";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const samePhone = (a: string | null, b?: string) => Boolean(a && b && a.replace(/\D/g, "") === b.replace(/\D/g, ""));

// Account ownership is checked independently of paid access: overdue accounts need notices too.
export async function loadNotificationAccount(client: SupabaseClient, organizationId: string) {
  const target = await client.from("organizations").select("id,owner_id,billing_organization_id").eq("id", organizationId).single();
  if (target.error || !target.data) throw new Error("Não foi possível conferir a conta dos avisos.");
  const billingId = target.data.billing_organization_id ?? target.data.id;
  const root = billingId === target.data.id ? target : await client.from("organizations").select("id,owner_id,billing_organization_id").eq("id", billingId).single();
  if (root.error || !root.data || root.data.owner_id !== target.data.owner_id) throw new Error("Conta dos avisos inválida.");
  const children = await client.from("organizations").select("id").eq("billing_organization_id", billingId).eq("owner_id", root.data.owner_id);
  if (children.error) throw new Error("Não foi possível conferir as empresas da conta.");
  return { id: String(billingId), ownerId: String(root.data.owner_id), organizationIds: [String(billingId), ...(children.data ?? []).map(row => String(row.id))] };
}

export async function loadNotificationSenderOptions(client: SupabaseClient, organizationId: string, recipientPhone?: string) {
  const account = await loadNotificationAccount(client, organizationId);
  const [saved, agents, instances] = await Promise.all([
    client.from("notification_sender_preferences").select("mode,agent_id").eq("organization_id", account.id).maybeSingle(),
    client.from("agent_registry").select("id,organization_id,name,persona_name,status,metadata,created_at").eq("scope", "organization").in("organization_id", account.organizationIds).contains("metadata", { agent_kind: "whatsapp" }).order("created_at").order("id"),
    client.from("whatsapp_instances").select(instanceFields).in("organization_id", account.organizationIds).eq("provider", "uazapi").neq("status", "archived").order("updated_at", { ascending: false }).order("id"),
  ]);
  if (saved.error || agents.error || instances.error) throw new Error("Não foi possível carregar o remetente dos avisos.");
  const preference: NotificationSenderPreference = saved.data ?? { mode: "automatic", agent_id: null };
  const candidates = ((agents.data ?? []) as Agent[]).filter(agent => agent.status !== "archived" && !agent.metadata.platform_whatsapp && !agent.metadata.admin_whatsapp).map(agent => {
    // Never fall back to an old connection of the same agent after it was replaced.
    const instance = ((instances.data ?? []) as NotificationInstance[]).find(row => row.organization_id === agent.organization_id && row.metadata.agent_id === agent.id && !row.metadata.platform_whatsapp && !row.metadata.admin_whatsapp);
    const available = agent.status === "online" && record(agent.metadata.whatsapp_behavior_config).agentEnabled !== false && instance?.status === "connected" && Boolean(instance.instance_token_encrypted) && !samePhone(instance.phone_number, recipientPhone);
    return { id: agent.id, name: agent.persona_name || agent.name, available, instance };
  });
  return { account, preference, candidates };
}

export async function saveNotificationSenderPreference(client: SupabaseClient, organizationId: string, actorId: string, body: RecordValue) {
  const options = await loadNotificationSenderOptions(client, organizationId);
  if (options.account.ownerId !== actorId) throw new Error("Somente o titular pode escolher o remetente dos avisos.");
  if (!["automatic", "agent", "platform"].includes(String(body.mode))) throw new Error("Escolha uma opção de remetente.");
  const agentId = body.mode === "agent" ? String(body.agentId ?? "") : null;
  if (agentId && (!uuid.test(agentId) || !options.candidates.some(agent => agent.id === agentId))) throw new Error("Escolha um agente desta conta.");
  if (body.mode === "agent" && !agentId) throw new Error("Escolha um agente desta conta.");
  const result = await client.from("notification_sender_preferences").upsert({ organization_id: options.account.id, mode: body.mode, agent_id: agentId, updated_by: actorId, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
  if (result.error) throw new Error("Não foi possível salvar o remetente dos avisos.");
}

export async function loadPlatformNotificationSender(client: SupabaseClient, preferredAgentId: string | null, recipientPhone?: string): Promise<NotificationSender | null> {
  const settings = await client.from("platform_billing_settings").select("billing_whatsapp_agent_id,notification_whatsapp_enabled").eq("setting_key", "default").maybeSingle();
  if (settings.error) throw new Error("Não foi possível conferir o WhatsApp da plataforma.");
  if (settings.data?.notification_whatsapp_enabled === false) return null;
  const agentIds = [...new Set([preferredAgentId, settings.data?.billing_whatsapp_agent_id].filter((id): id is string => Boolean(id)))];
  for (const agentId of agentIds) {
    const result = await client.from("whatsapp_instances").select(instanceFields).eq("provider", "uazapi").contains("metadata", { agent_id: agentId, admin_whatsapp: true, platform_whatsapp: true }).neq("status", "archived").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw new Error("Não foi possível conferir a conexão da plataforma.");
    const instance = result.data as NotificationInstance | null;
    if (instance?.status === "connected" && instance.instance_token_encrypted && !samePhone(instance.phone_number, recipientPhone)) return { kind: "platform", agentId, instance };
  }
  return null;
}

export async function resolveNotificationSender(client: SupabaseClient, organizationId: string, platformAgentId: string | null, recipientPhone?: string): Promise<NotificationSender | null> {
  const options = await loadNotificationSenderOptions(client, organizationId, recipientPhone);
  const chosen = chooseNotificationAgent(options.preference, options.candidates);
  const candidate = options.candidates.find(agent => agent.id === chosen?.id);
  if (candidate?.instance) return { kind: "customer", agentId: candidate.id, agentName: candidate.name, instance: candidate.instance };
  return loadPlatformNotificationSender(client, platformAgentId, recipientPhone);
}
