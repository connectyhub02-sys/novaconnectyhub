type JsonRecord = Record<string, unknown>;

export type AgentResponsibleHuman = {
  name: string;
  phone: string;
  notifySales: boolean;
  notifyPayments: boolean;
  notifyOperational: boolean;
  source: string;
  updatedAt: string | null;
};

export const agentResponsibleHumanMetadataKey = "responsible_human";

export function readAgentResponsibleHuman(metadata: unknown): AgentResponsibleHuman {
  const record = readRecord(metadata);
  const responsible = readRecord(record[agentResponsibleHumanMetadataKey] ?? record.responsibleHuman);

  return normalizeAgentResponsibleHuman({
    name: responsible.name,
    phone: responsible.phone,
    notifySales: responsible.notify_sales ?? responsible.notifySales,
    notifyPayments: responsible.notify_payments ?? responsible.notifyPayments,
    notifyOperational: responsible.notify_operational ?? responsible.notifyOperational,
    source: responsible.source,
    updatedAt: responsible.updated_at ?? responsible.updatedAt,
  }, { requirePhone: false });
}

export function normalizeAgentResponsibleHuman(
  value: unknown,
  options: { requirePhone?: boolean; fallback?: AgentResponsibleHuman | null } = {},
): AgentResponsibleHuman {
  const record = readRecord(value);
  const fallback = options.fallback ?? emptyAgentResponsibleHuman();
  const name = readString(record.name) ?? fallback.name;
  const phone = normalizeBrazilianWhatsappPhone(record.phone) ?? fallback.phone;

  if (options.requirePhone && !phone) {
    throw new Error("Informe o WhatsApp do responsavel humano pelo agente.");
  }

  return {
    name: name || "Responsavel do agente",
    phone,
    notifySales: readBoolean(record.notifySales ?? record.notify_sales, fallback.notifySales),
    notifyPayments: readBoolean(record.notifyPayments ?? record.notify_payments, fallback.notifyPayments),
    notifyOperational: readBoolean(record.notifyOperational ?? record.notify_operational, fallback.notifyOperational),
    source: readString(record.source) ?? fallback.source,
    updatedAt: readString(record.updatedAt ?? record.updated_at) ?? fallback.updatedAt,
  };
}

export function serializeAgentResponsibleHuman(value: AgentResponsibleHuman): JsonRecord {
  return {
    name: value.name,
    phone: value.phone,
    notify_sales: value.notifySales,
    notify_payments: value.notifyPayments,
    notify_operational: value.notifyOperational,
    source: value.source,
    updated_at: value.updatedAt,
  };
}

export function mergeResponsibleHumanIntoBehaviorConfig<T extends object>(
  behavior: T,
  responsible: AgentResponsibleHuman,
) {
  if (!responsible.phone) {
    return behavior;
  }

  const existingNumbers = listResponsibleWhatsappPhones((behavior as { humanHandoffNotificationNumbers?: unknown }).humanHandoffNotificationNumbers);
  const numbers = Array.from(new Set([responsible.phone, ...existingNumbers]));

  return {
    ...behavior,
    humanHandoffNotifications: true,
    humanHandoffNotificationNumbers: numbers.join("\n"),
  };
}

export function listResponsibleWhatsappPhones(value: unknown) {
  return splitResponsibleNumbers(value);
}

export function readFirstResponsibleWhatsappPhone(value: unknown) {
  return listResponsibleWhatsappPhones(value)[0] ?? "";
}

export function normalizeBrazilianWhatsappPhone(value: unknown) {
  const digits = typeof value === "string" ? value.replace(/\D+/g, "") : "";

  if (!digits) {
    return "";
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits.length >= 12 && digits.length <= 15 ? digits : "";
}

export function emptyAgentResponsibleHuman(): AgentResponsibleHuman {
  return {
    name: "",
    phone: "",
    notifySales: true,
    notifyPayments: true,
    notifyOperational: true,
    source: "agent_setup",
    updatedAt: null,
  };
}

function splitResponsibleNumbers(value: unknown) {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[\n,;]+/)
    .map((item) => normalizeBrazilianWhatsappPhone(item))
    .filter(Boolean);
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}
