import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isContactWindow, localContactTime, nextContactWindow, observedContactWindow } from "./contact-window";

const evidenceDays = 30;
/** A follow-up waits for the lead's usual hour only when that hour comes soon; otherwise it goes now. */
const maxHabitWaitMs = 20 * 3600_000;

/**
 * The hour the lead usually is on WhatsApp: the hour with the most distinct days among the lead's own
 * messages and the moments the lead read our messages (read receipts) in the last 30 days.
 * Null while there are fewer than 3 days of evidence for any hour.
 */
export async function loadLeadActiveHour(client: SupabaseClient, input: {
  organizationId: string; leadId: string; whatsappInstanceId: string; phone: string | null; timezone: string;
}) {
  const since = new Date(Date.now() - evidenceDays * 86400000).toISOString();
  const [messages, receipts] = await Promise.all([
    client.from("conversation_messages").select("occurred_at").eq("organization_id", input.organizationId)
      .eq("lead_id", input.leadId).eq("direction", "inbound").gte("occurred_at", since).limit(300),
    input.phone
      ? client.from("whatsapp_webhook_events").select("received_at").eq("whatsapp_instance_id", input.whatsappInstanceId)
        .eq("event_type", "ReadReceipt").gte("received_at", since).eq("payload->event->>chatid", `${input.phone}@s.whatsapp.net`).limit(300)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const moments = [
    ...(messages.error ? [] : (messages.data ?? []).map(row => row.occurred_at as string)),
    ...(receipts.error ? [] : (receipts.data ?? []).map(row => row.received_at as string)),
  ].filter(Boolean);
  return observedContactWindow(moments, input.timezone)?.hour ?? null;
}

/**
 * When to send instead of now, so the message arrives at the lead's usual hour. Inside the company
 * window: an hour outside it moves to the closest edge. Null means send now (already the usual hour,
 * the usual hour is too far away, or nothing would change).
 */
export function leadHabitSendTime(now: Date, activeHour: number, window: { start: string; end: string; timezone: string }) {
  const localHour = Math.floor(localContactTime(now, window.timezone).minute / 60);
  const distance = Math.min(Math.abs(localHour - activeHour), 24 - Math.abs(localHour - activeHour));
  if (distance <= 1) return null;
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const startMinute = toMinutes(window.start);
  const endMinute = toMinutes(window.end);
  let targetMinute = activeHour * 60;
  const insideCompanyWindow = startMinute < endMinute
    ? targetMinute >= startMinute && targetMinute < endMinute
    : targetMinute >= startMinute || targetMinute < endMinute;
  if (!insideCompanyWindow) {
    const toStart = (startMinute - targetMinute + 1440) % 1440;
    const fromEnd = (targetMinute - endMinute + 1440) % 1440;
    targetMinute = fromEnd <= toStart ? (endMinute - 45 + 1440) % 1440 : startMinute;
  }
  const format = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const target = nextContactWindow(now, format(targetMinute), format((targetMinute + 30) % 1440), window.timezone);
  if (target.getTime() <= now.getTime() || target.getTime() - now.getTime() > maxHabitWaitMs) return null;
  return isContactWindow(target, window.start, window.end, window.timezone) ? target : null;
}
