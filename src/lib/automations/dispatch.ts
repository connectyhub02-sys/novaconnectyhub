import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WhatsappFollowUpEventData } from "@/lib/whatsapp/proactive-followup";
import { inngest } from "@/lib/inngest/client";

export type AutomationPolicy = {
  follow_up_enabled: boolean;
  timezone: string;
  window_start: string;
  window_end: string;
};
export async function loadAutomationPolicy(
  client: SupabaseClient,
  organizationId: string,
) {
  const { data, error } = await client
    .from("automation_policies")
    .select("follow_up_enabled,timezone,window_start,window_end")
    .eq("organization_id", organizationId)
    .maybeSingle<AutomationPolicy>();
  if (error)
    throw new Error(
      `Não foi possível consultar a política de automações: ${error.code}`,
    );
  return data;
}

export function dispatchKey(data: WhatsappFollowUpEventData) {
  const opportunity = data.returnId
    ? `return:${data.returnId}`
    : data.recommendationProductId
      ? `recommendation:${data.recommendationProductId}:${data.recommendationPeriod}`
      : `${data.agentRunId}:${data.salesCatalogOrderId ?? "conversation"}:${data.salesCatalogFollowUpKind ?? "conversation"}`;
  return createHash("sha256")
    .update([data.organizationId, data.leadId, opportunity].join(":"))
    .digest("hex");
}

export async function persistFollowUpDispatch(
  client: SupabaseClient,
  data: WhatsappFollowUpEventData,
  scheduledFor: Date,
) {
  const key = dispatchKey(data);
  const { error } = await client.from("automation_dispatches").upsert(
    {
      organization_id: data.organizationId,
      lead_id: data.leadId,
      conversation_id: data.conversationId,
      opportunity_key: key,
      journey: data.returnId
        ? "return"
        : data.recommendationProductId
          ? "recommendation"
          : data.salesCatalogOrderId
            ? "recovery"
            : "conversation",
      event_data: data,
      scheduled_for: scheduledFor.toISOString(),
    },
    { onConflict: "organization_id,opportunity_key", ignoreDuplicates: true },
  );
  if (error)
    throw new Error(`Não foi possível registrar o follow-up: ${error.code}`);
  const result = await client
    .from("automation_dispatches")
    .select("id,status,scheduled_for")
    .eq("organization_id", data.organizationId)
    .eq("opportunity_key", key)
    .single<{ id: string; status: string; scheduled_for: string }>();
  if (result.error)
    throw new Error("Não foi possível recuperar o agendamento.");
  return result.data;
}

export async function updateDispatch(
  client: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  claimToken?: string,
) {
  let query = client
    .from("automation_dispatches")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (claimToken)
    query = query
      .eq("claim_token", claimToken)
      .in("status", ["processing", "sending"]);
  if (patch.status === "sending")
    query = query
      .eq("status", "processing")
      .gt("lease_until", new Date().toISOString());
  const { data, error } = await query.select("id");
  if (error)
    throw new Error(
      `Não foi possível atualizar a tentativa de envio: ${error.code}`,
    );
  if (!data?.length)
    throw new Error(
      "Esta tentativa de envio não possui mais a reserva de execução.",
    );
}

export async function sweepFollowUpDispatches(client: SupabaseClient) {
  // Recover leases even if the original scheduler execution was interrupted.
  const now = new Date().toISOString();
  const uncertain = await client
    .from("automation_dispatches")
    .update({
      status: "uncertain",
      reason: "delivery_confirmation_missing",
      updated_at: now,
    })
    .eq("status", "sending")
    .lt("lease_until", now);
  if (uncertain.error) throw new Error(uncertain.error.message);
  const recovered = await client
    .from("automation_dispatches")
    .update({ status: "pending", lease_until: null, updated_at: now })
    .eq("status", "processing")
    .lt("lease_until", now);
  if (recovered.error) throw new Error(recovered.error.message);
  const result = await client
    .from("automation_dispatches")
    .select("id,event_data")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for")
    .limit(30);
  if (result.error) throw new Error(result.error.message);
  if (result.data?.length)
    await inngest.send(
      result.data.map((row) => ({
        id: `automation:${row.id}:${Math.floor(Date.now() / 120000)}`,
        name: "connectyhub/whatsapp.followup.scheduled",
        data: { ...row.event_data, dispatchId: row.id },
      })),
    );
  return { queued: result.data?.length ?? 0 };
}
