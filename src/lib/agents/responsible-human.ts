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
export const agentResponsibleHumansMetadataKey = "responsible_humans";

export function readAgentResponsibleHuman(metadata: unknown): AgentResponsibleHuman {
  return readAgentResponsibleHumans(metadata)[0] ?? emptyAgentResponsibleHuman();
}

export function readAgentResponsibleHumans(metadata: unknown): AgentResponsibleHuman[] {
  const record = readRecord(metadata);
  const storedResponsibles = normalizeAgentResponsibleHumans(
    record[agentResponsibleHumansMetadataKey] ?? record.responsibleHumans,
    { requireAtLeastOne: false },
  );
  const legacyResponsible = readLegacyAgentResponsibleHuman(record);
  const legacyBehaviorNumbers = listResponsibleWhatsappPhones(
    readRecord(record.whatsapp_behavior_config).humanHandoffNotificationNumbers,
  ).map((phone) => normalizeAgentResponsibleHuman({
    name: "Responsavel do agente",
    phone,
    notifySales: true,
    notifyPayments: true,
    notifyOperational: true,
    source: "agent_behavior",
  }));

  return dedupeResponsibleHumans([
    ...storedResponsibles,
    ...(legacyResponsible.phone ? [legacyResponsible] : []),
    ...legacyBehaviorNumbers,
  ]);
}

function readLegacyAgentResponsibleHuman(metadata: unknown): AgentResponsibleHuman {
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
  options: { requirePhone?: boolean; requireName?: boolean; fallback?: AgentResponsibleHuman | null } = {},
): AgentResponsibleHuman {
  const record = readRecord(value);
  const fallback = options.fallback ?? emptyAgentResponsibleHuman();
  const name = readString(record.name) ?? fallback.name;
  const phone = normalizeBrazilianWhatsappPhone(record.phone) || fallback.phone;

  if (options.requireName && !name) {
    throw new Error("Informe o responsavel humano pelo agente.");
  }

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

export function normalizeAgentResponsibleHumans(
  value: unknown,
  options: {
    requireAtLeastOne?: boolean;
    requireName?: boolean;
    fallback?: AgentResponsibleHuman[] | null;
  } = {},
): AgentResponsibleHuman[] {
  const collected = collectResponsibleHumanInputs(value);
  const normalized = collected.values.map((item) => normalizeAgentResponsibleHuman(item, {
    requireName: options.requireName,
    requirePhone: options.requireAtLeastOne,
  }));
  const fallback = (options.fallback ?? []).filter((responsible) => responsible.phone);
  const responsibles = dedupeResponsibleHumans(
    normalized.length > 0 || collected.provided
      ? normalized
      : fallback.map((responsible) => normalizeAgentResponsibleHuman(responsible)),
  );

  if (options.requireAtLeastOne && responsibles.length === 0) {
    throw new Error("Cadastre pelo menos um responsavel humano com WhatsApp para o agente.");
  }

  return responsibles;
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

export function serializeAgentResponsibleHumans(values: AgentResponsibleHuman[]): JsonRecord[] {
  return values.map((value) => serializeAgentResponsibleHuman(value));
}

export function mergeResponsibleHumanIntoBehaviorConfig<T extends object>(
  behavior: T,
  responsible: AgentResponsibleHuman,
) {
  return mergeResponsibleHumansIntoBehaviorConfig(behavior, responsible.phone ? [responsible] : []);
}

export function mergeResponsibleHumansIntoBehaviorConfig<T extends object>(
  behavior: T,
  responsibles: AgentResponsibleHuman[],
) {
  const responsibleNumbers = dedupeResponsibleHumans(responsibles).map((responsible) => responsible.phone);

  if (responsibleNumbers.length === 0) {
    return behavior;
  }

  const existingNumbers = listResponsibleWhatsappPhones((behavior as { humanHandoffNotificationNumbers?: unknown }).humanHandoffNotificationNumbers);
  const numbers = Array.from(new Set([...responsibleNumbers, ...existingNumbers]));

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

function collectResponsibleHumanInputs(value: unknown) {
  if (Array.isArray(value)) {
    return {
      provided: true,
      values: value.filter((item) => {
        const record = readRecord(item);
        return Boolean(readString(record.name) || normalizeBrazilianWhatsappPhone(record.phone));
      }),
    };
  }

  const record = readRecord(value);
  const provided = Object.keys(record).length > 0;

  if (!provided || (!readString(record.name) && !normalizeBrazilianWhatsappPhone(record.phone))) {
    return { provided, values: [] as unknown[] };
  }

  return { provided: true, values: [record] };
}

function dedupeResponsibleHumans(values: AgentResponsibleHuman[]) {
  const seen = new Set<string>();
  const responsibles: AgentResponsibleHuman[] = [];

  for (const responsible of values) {
    if (!responsible.phone || seen.has(responsible.phone)) {
      continue;
    }

    seen.add(responsible.phone);
    responsibles.push(responsible);
  }

  return responsibles;
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
