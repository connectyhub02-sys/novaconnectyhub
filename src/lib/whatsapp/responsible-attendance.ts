import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAgentResponsibleHumans, readAgentResponsibleHumans, normalizeBrazilianWhatsappPhone } from "@/lib/agents/responsible-human";

type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue => v && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {};
const ddds = new Set("11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(" "));

export function attendancePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let phone = value.trim();
  const international = phone.startsWith("+") || phone.includes("@");
  if (phone.includes("@")) {
    if (!/^\d+(?::\d+)?@(s\.whatsapp\.net|c\.us)$/i.test(phone)) return null;
    phone = phone.split("@")[0].split(":")[0];
  }
  if (!/^[+\d() .-]+$/.test(phone)) return null;
  const digits = phone.replace(/\D/g, "");
  const normalized = international ? (/^\d{10,15}$/.test(digits) ? digits : "") : normalizeBrazilianWhatsappPhone(phone);
  return normalized || null;
}

export function sameAttendancePhone(left: unknown, right: unknown) {
  const a = attendancePhone(left), b = attendancePhone(right);
  if (!a || !b) return false;
  if (a === b) return true;
  // Only the Brazilian mobile ninth-digit representation is interchangeable.
  // Country, valid DDD and the complete eight-digit subscriber must match.
  const mobile = (p: string) => {
    if (!p.startsWith("55") || !ddds.has(p.slice(2, 4))) return p;
    if (p.length === 13 && /^9[6-9]\d{7}$/.test(p.slice(4))) return p.slice(0, 4) + p.slice(5);
    return p;
  };
  return mobile(a) === mobile(b);
}

export type AttendanceSender = { phone?: string | null; providerChatId?: string | null; isGroupChat?: boolean; payload?: unknown };
export function attendanceSender(input: AttendanceSender): string | null {
  const root = record(input.payload);
  const candidate = [root.message, root.msg, root.data, root.result, Array.isArray(root.messages) ? root.messages[0] : null].find(v => v && typeof v === "object" && !Array.isArray(v));
  const message = record(candidate), key = record(message.key ?? root.key);
  const m = Object.keys(message).length ? message : root;
  const authorPhones = [m.participant_pn, m.participantPn, m.sender_pn, m.senderPn, key.participantAlt, m.participant, key.participant, m.sender];
  if (input.isGroupChat || input.providerChatId?.endsWith("@g.us")) {
    return authorPhones.map(attendancePhone).find(Boolean) ?? null;
  }
  const canonical = attendancePhone(input.providerChatId);
  if (canonical) return canonical;
  const author = authorPhones.map(attendancePhone).find(Boolean);
  if (author) return author;
  const chat = record(root.chat);
  const lid = chat.wa_chatlid ?? chat.waChatLid ?? chat.chatlid ?? chat.chatLid;
  if (input.providerChatId?.endsWith("@lid")) {
    if (lid !== input.providerChatId) return null;
    return [chat.wa_chatid, chat.waChatId, chat.chatid, chat.phone].map(attendancePhone).find(Boolean) ?? null;
  }
  return attendancePhone(input.phone);
}

export function matchesAgentResponsible(metadata: unknown, input: AttendanceSender) {
  const m = record(metadata), sender = attendanceSender(input);
  if (!sender) return false;
  const list = m.responsible_humans ?? m.responsibleHumans;
  // An explicitly saved list, including [], supersedes stale legacy fields.
  const responsibles = Array.isArray(list) ? normalizeAgentResponsibleHumans(list) : readAgentResponsibleHumans(m);
  return responsibles.some(person => sameAttendancePhone(person.phone, sender));
}

export class ResponsibleAttendanceBlocked extends Error {
  constructor() { super("Atendimento automático ignorado: remetente é responsável pelo agente."); this.name = "ResponsibleAttendanceBlocked"; }
}
export async function assertAgentAttendanceAllowed(client: SupabaseClient, input: AttendanceSender & { organizationId: string; agentId: string; platformAgent?: boolean }) {
  let query = client.from("agent_registry").select("metadata").eq("id", input.agentId);
  query = input.platformAgent
    ? query.is("organization_id", null).contains("metadata", { admin_whatsapp: true, agent_kind: "whatsapp" })
    : query.eq("organization_id", input.organizationId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error("Não foi possível conferir os responsáveis do agente.");
  if (matchesAgentResponsible(data.metadata, input)) throw new ResponsibleAttendanceBlocked();
}
