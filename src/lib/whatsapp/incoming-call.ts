import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import type { WhatsappBehaviorConfig } from "./agent-behavior";
import { loadUazapiCredentials } from "./uazapi-credentials";

type JsonRecord = Record<string, unknown>;

export type IncomingCallOffer = {
  callId: string;
  providerChatId: string;
  phoneNumber: string;
  occurredAt: string;
};

/** What the agent reads in place of a text: it answers by message, as a person who could not pick up. */
export const incomingCallLeadText = "[O cliente acabou de te ligar pelo WhatsApp e você não pôde atender. "
  + "Responda por mensagem, curto e natural, dizendo que não consegue atender ligação agora e continue o atendimento por aqui.]";

/**
 * Reads a ringing call from the provider's `call` webhook. Only the offer (the phone ringing) counts:
 * accept, reject, terminate and relay events of the same call are ignored. Group calls are ignored.
 */
export function readIncomingCallOffer(payload: JsonRecord, now = new Date()): IncomingCallOffer | null {
  const serialized = JSON.stringify(payload);
  if (!/offer/i.test(serialized) || /terminate|reject|accept|timeout/i.test(stateOf(payload))) return null;
  const callId = findDeep(payload, ["CallID", "callId", "call_id", "callid"]) ?? findDeep(payload, ["id", "Id", "ID"]);
  const jids = ["CallCreator", "callCreator", "From", "from", "chatid", "chatId", "sender", "Sender", "number"]
    .map(key => findDeep(payload, [key])).filter((value): value is string => Boolean(value));
  if (!callId || jids.some(jid => jid.endsWith("@g.us")) || findDeep(payload, ["GroupJID", "groupJid"])) return null;
  const jid = jids.find(value => value.endsWith("@s.whatsapp.net")) ?? jids.find(value => /^\+?\d{10,15}$/.test(value.replace(/\D/g, "")) && !value.includes("@lid"));
  const phoneNumber = jid?.split("@")[0]?.split(":")[0]?.replace(/\D/g, "");
  if (!phoneNumber || phoneNumber.length < 10) return null;
  return { callId, providerChatId: `${phoneNumber}@s.whatsapp.net`, phoneNumber, occurredAt: now.toISOString() };
}

/** Same rule as the agent: outside the configured AI window nobody rejects the call automatically. */
export function isInsideAiWindow(behavior: WhatsappBehaviorConfig, now = new Date()) {
  if (!behavior.aiScheduleEnabled) return true;
  const parse = (value: string) => {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const start = parse(behavior.aiScheduleStart);
  const end = parse(behavior.aiScheduleEnd);
  if (start == null || end == null || start === end) return true;
  const local = new Date(now.toLocaleString("en-US", { timeZone: behavior.aiScheduleTimezone || "America/Sao_Paulo" }));
  const minutes = local.getHours() * 60 + local.getMinutes();
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export async function rejectIncomingCall(client: SupabaseClient, instance: { instance_token_encrypted?: string | null }, call: IncomingCallOffer) {
  if (!instance.instance_token_encrypted) return false;
  try {
    const token = decryptCredentialValue(instance.instance_token_encrypted);
    const credentials = await loadUazapiCredentials(client);
    const response = await fetch(`${credentials.baseUrl}/call/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", token },
      body: JSON.stringify({ number: call.phoneNumber, id: call.callId }),
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function stateOf(payload: JsonRecord) {
  return [findDeep(payload, ["type", "Type", "tag", "Tag", "status", "Status", "state"]) ?? "", findDeep(payload, ["event", "Event"]) ?? ""].join(" ");
}

function findDeep(value: unknown, keys: string[], depth = 0): string | null {
  if (!value || typeof value !== "object" || depth > 6) return null;
  const record = value as JsonRecord;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
  for (const nested of Object.values(record)) {
    const found = findDeep(nested, keys, depth + 1);
    if (found) return found;
  }
  return null;
}
