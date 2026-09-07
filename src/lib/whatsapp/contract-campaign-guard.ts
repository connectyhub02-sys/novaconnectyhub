import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getContractAccess } from "@/lib/billing/contract-access";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { loadUazapiCredentials } from "./uazapi-credentials";

type Instance = { id: string; organization_id: string; instance_token_encrypted: string | null };

export function activeCampaignIds(data: unknown): string[] {
  if (!Array.isArray(data)) throw new Error("CAMPAIGN_QUEUE_INVALID_RESPONSE");
  return [...new Set(data.flatMap((folder) => {
    if (!folder || typeof folder !== "object") return [];
    const id = folder.id ?? folder.folder_id;
    const status = typeof folder.status === "string" ? folder.status.toLowerCase() : "";
    return typeof id === "string" && id.trim() && ["scheduled", "sending"].includes(status) ? [id] : [];
  }))];
}

// This adapter can only inspect and STOP a provider queue. It must never become an
// operational API bypass for a suspended account. Completed messages are preserved.
export async function pauseSuspendedInstanceCampaigns(client: SupabaseClient, instance: Instance) {
  if ((await getContractAccess(instance.organization_id, client)).allowed || !instance.instance_token_encrypted) return 0;
  const credentials = await loadUazapiCredentials(client);
  const token = decryptCredentialValue(instance.instance_token_encrypted);
  const baseUrl = credentials.baseUrl.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", token };
  const listed = await fetch(`${baseUrl}/sender/listfolders`, { headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!listed.ok) throw new Error("CAMPAIGN_QUEUE_LOOKUP_FAILED");
  const ids = activeCampaignIds(await listed.json());
  let paused = 0;
  for (const id of ids) {
    if ((await getContractAccess(instance.organization_id, client)).allowed) break;
    const stopped = await fetch(`${baseUrl}/sender/edit`, { method: "POST", headers,
      body: JSON.stringify({ folder_id: id, action: "stop" }), signal: AbortSignal.timeout(15000) });
    if (!stopped.ok) throw new Error("CAMPAIGN_QUEUE_PAUSE_FAILED");
    const result = await stopped.json();
    if (String(result?.status).toLowerCase() !== "paused") throw new Error("CAMPAIGN_QUEUE_PAUSE_UNCONFIRMED");
    paused++;
    const saved = await client.from("intelligence_events").insert({
      scope: "organization", organization_id: instance.organization_id, source_type: "whatsapp_instance", source_id: instance.id,
      event_type: "whatsapp.campaign.contract_paused", title: "Campanha pausada por suspensão do plano",
      summary: "A fila do provedor foi pausada. A campanha e o histórico foram preservados para revisão após a regularização.",
      payload: { folder_id: id, whatsapp_instance_id: instance.id, action: "stop", status: "paused" },
    });
    if (saved.error) throw new Error("CAMPAIGN_QUEUE_AUDIT_FAILED");
  }
  return paused;
}

export async function pauseSuspendedWhatsappCampaigns(client: SupabaseClient) {
  let checked = 0;
  let paused = 0;
  const failedInstances: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const result = await client.from("whatsapp_instances").select("id, organization_id, instance_token_encrypted")
      .neq("status", "archived").not("organization_id", "is", null).not("instance_token_encrypted", "is", null).order("id").range(offset, offset + 99);
    if (result.error) throw new Error("CAMPAIGN_GUARD_INSTANCES_FAILED");
    const instances = (result.data ?? []) as Instance[];
    for (let start = 0; start < instances.length; start += 5) {
      await Promise.all(instances.slice(start, start + 5).map(async (instance) => {
        checked++;
        try { paused += await pauseSuspendedInstanceCampaigns(client, instance); }
        catch { failedInstances.push(instance.id); }
      }));
    }
    if (instances.length < 100) break;
  }
  if (failedInstances.length) throw new Error(`CAMPAIGN_GUARD_INCOMPLETE:${failedInstances.join(",")}`);
  return { checked, paused };
}
