import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processWhatsappHandoffNotification } from "@/lib/whatsapp/handoff-notifications";
import { readAgentResponsibleHumans } from "@/lib/agents/responsible-human";

export async function queueAgendaHandoff(client: SupabaseClient, input: { organizationId: string; leadId: string; conversationId: string; agentId: string; runId: string; instanceId: string; reason: string; requestText: string }) {
  const saved = await client.from("customer_agenda_requests").upsert({ organization_id: input.organizationId, lead_id: input.leadId, conversation_id: input.conversationId, agent_id: input.agentId, run_id: input.runId, whatsapp_instance_id: input.instanceId, reason: input.reason.slice(0, 500), request_text: input.requestText.slice(0, 1500) }, { onConflict: "run_id", ignoreDuplicates: true });
  if (saved.error) throw new Error("Não foi possível registrar o encaminhamento da agenda.");
}

export async function dispatchAgendaHandoffs(client: SupabaseClient) {
  const now = new Date().toISOString();
  await client.from("customer_agenda_requests").update({ status: "uncertain" }).eq("status", "sending").lt("lease_until", now);
  const due = await client.from("customer_agenda_requests").select("*").eq("status", "pending").lte("due_at", now).order("due_at").limit(5);
  if (due.error) throw new Error("Não foi possível consultar encaminhamentos da agenda.");
  let sent = 0;
  for (const row of due.data ?? []) {
    // RPC locks the lead before the claim, the same ordering used by reset.
    const claim = await client.rpc("claim_customer_agenda_request", { p_org: row.organization_id, p_id: row.id });
    if (claim.error || !claim.data) continue;
    try {
      const [lead, agent] = await Promise.all([
        client.from("leads").select("display_name,phone_number").eq("organization_id", row.organization_id).eq("id", row.lead_id).maybeSingle(),
        client.from("agent_registry").select("metadata").eq("organization_id", row.organization_id).eq("id", row.agent_id).maybeSingle(),
      ]);
      if (lead.error || agent.error || !lead.data || !agent.data) throw new Error("attendance_missing");
      const numbers = readAgentResponsibleHumans(agent.data.metadata).filter(p => p.notifyOperational).map(p => p.phone).join("\n");
      const result = await processWhatsappHandoffNotification({ client, beforeSend: async () => {
        const lease = await client.from("customer_agenda_requests").update({ lease_until: new Date(Date.now() + 120000).toISOString() }).eq("organization_id", row.organization_id).eq("id", row.id).eq("status", "sending").gt("lease_until", new Date().toISOString()).select("id").maybeSingle();
        if (lease.error || !lease.data) throw new Error("agenda_delivery_lease_lost");
      }, data: { organizationId: row.organization_id, whatsappInstanceId: row.whatsapp_instance_id, conversationId: row.conversation_id, leadId: row.lead_id, agentId: row.agent_id, agentRunId: row.run_id, leadName: lead.data.display_name, leadPhone: lead.data.phone_number, notificationNumbers: numbers, requestText: `Agendamento não concluído: ${row.reason}\nPedido: ${row.request_text}`, source: "agenda_unavailable" } });
      // A failed transport may have delivered; never blindly resend uncertain sends.
      const status = result.status === "sent" ? (result.failed ? "uncertain" : "sent") : result.status === "failed" && !result.reason ? "uncertain" : row.attempts >= 2 ? "failed" : "pending";
      const saved = await client.from("customer_agenda_requests").update({ status, reason: "reason" in result ? result.reason ?? row.reason : row.reason, due_at: new Date(Date.now() + 15 * 60000).toISOString() }).eq("id", row.id).eq("status", "sending");
      if (saved.error) throw new Error("delivery_state_missing");
      if (status === "sent") sent++;
    } catch {
      await client.from("customer_agenda_requests").update({ status: "uncertain" }).eq("id", row.id).eq("status", "sending");
    }
  }
  return { sent };
}
