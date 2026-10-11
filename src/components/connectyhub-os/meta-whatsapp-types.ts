import type { OfficialTemplate } from "@/lib/meta/whatsapp-workspace-policy";
export type Sender = {
  phone_number_id: string;
  display_phone: string;
  verified_name: string;
  label: string | null;
  status: string;
  webhook_subscribed: boolean;
  webhook_at: string | null;
};
export type Thread = {
  phone_number_id: string;
  phone: string;
  display_name: string | null;
  last_message_at: string;
  last_message_preview: string;
  last_inbound_at: string | null;
  unread_count: number;
  assigned_to: string | null;
  status: string;
};
export type ChatMessage = {
  id: string;
  phone_number_id: string;
  phone: string;
  direction: string;
  message_type: string;
  text_content: string;
  status: string;
  occurred_at: string;
  error_code: string | null;
  content: {
    templatePreview?: OfficialTemplate["components"];
    interactive?: {
      action?: { buttons?: Array<{ reply: { title: string } }> };
    };
    [key: string]: unknown;
  };
};
export type Campaign = {
  id: string;
  phone_number_id: string;
  name: string;
  template_name: string;
  language: string;
  template_snapshot: OfficialTemplate;
  parameters: string[];
  consent_note: string;
  status: string;
  scheduled_at: string;
  counts: Record<string, number>;
  total: number;
};
export type OfficialSnapshot = {
  connections: Sender[];
  selectedSender: string | null;
  signupReady: boolean;
  pilotReady: boolean;
  templates: OfficialTemplate[];
  templateError: string | null;
  threads: Thread[];
  selectedThread: Thread | null;
  requestedPhone: string | null;
  messages: ChatMessage[];
  notes: Array<{
    id: string;
    body: string;
    created_at: string;
    created_by: string;
  }>;
  contact: null | {
    opted_out: boolean;
    consent_note: string | null;
    lead_id: string | null;
  };
  actorId: string;
  hasMore: boolean;
};
export const officialStatus: Record<string, string> = {
  received: "Recebida",
  sending: "Enviando",
  accepted: "Aceita pela Meta",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  uncertain: "Conferência necessária",
  pending: "Na fila",
  processing: "Processando",
  skipped: "Não enviada",
  cancelled: "Cancelada",
  draft: "Rascunho",
  running: "Em andamento",
  paused: "Pausada",
  completed: "Processamento concluído",
  APPROVED: "Aprovado",
  PENDING: "Em análise",
  REJECTED: "Rejeitado",
};
export const officialField =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
export const officialPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45";
export const officialSecondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-45";
