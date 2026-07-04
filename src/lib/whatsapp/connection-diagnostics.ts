type JsonRecord = Record<string, unknown>;

export type WhatsappConnectionMode = "qr" | "phone";

export type WhatsappConnectionFinalStatus =
  | "pending"
  | "success"
  | "passkey_blocked"
  | "qr_timeout"
  | "disconnected"
  | "provider_error"
  | "reset"
  | "unknown";

export type WhatsappConnectionEventType =
  | "connect_requested"
  | "connect_response"
  | "qr_received"
  | "qr_updated"
  | "pair_code_received"
  | "pair_code_updated"
  | "status_poll"
  | "status_connected"
  | "status_disconnected"
  | "passkey_blocked"
  | "timeout"
  | "provider_error"
  | "reset_requested";

export type WhatsappConnectionDiagnosticEvent = {
  type: WhatsappConnectionEventType;
  at: string;
  providerStatus: number | null;
  status: string | null;
  connected: boolean | null;
  loggedIn: boolean | null;
  hasQrCode: boolean;
  qrCodeLength: number | null;
  hasPairCode: boolean;
  pairCodeLength: number | null;
  lastDisconnectReason: string | null;
  message: string | null;
};

export type WhatsappConnectionAttemptDiagnostic = {
  id: string;
  mode: WhatsappConnectionMode;
  phonePreview: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  finalStatus: WhatsappConnectionFinalStatus;
  finalReason: string | null;
  lastDisconnectReason: string | null;
  qrReceivedCount: number;
  pairCodeReceivedCount: number;
  statusPollCount: number;
  scanDetected: boolean | null;
  events: WhatsappConnectionDiagnosticEvent[];
};

export type WhatsappConnectionDiagnostics = {
  activeAttemptId: string | null;
  latestAttempt: WhatsappConnectionAttemptDiagnostic | null;
  attempts: WhatsappConnectionAttemptDiagnostic[];
};

type AppendConnectionDiagnosticInput = {
  type: WhatsappConnectionEventType;
  mode?: WhatsappConnectionMode;
  phone?: string | null;
  at?: string;
  providerStatus?: number | null;
  providerPayload?: unknown;
  message?: string | null;
  finalStatus?: WhatsappConnectionFinalStatus;
  finalReason?: string | null;
};

const diagnosticsMetadataKey = "connection_diagnostics";
const maxStoredAttempts = 8;
const maxStoredEvents = 24;

export function readConnectionDiagnostics(metadata: unknown): WhatsappConnectionDiagnostics {
  const record = isRecord(metadata) ? readRecord(metadata[diagnosticsMetadataKey]) : null;
  const attempts = readArray(record?.attempts)
    .map(readConnectionAttempt)
    .filter(Boolean)
    .slice(-maxStoredAttempts) as WhatsappConnectionAttemptDiagnostic[];
  const activeAttemptId = readString(record?.activeAttemptId);
  const latestAttempt = attempts.at(-1) ?? null;

  return {
    activeAttemptId: activeAttemptId && attempts.some((attempt) => attempt.id === activeAttemptId) ? activeAttemptId : null,
    latestAttempt,
    attempts,
  };
}

export function appendConnectionDiagnosticEvent(
  metadata: JsonRecord | null | undefined,
  input: AppendConnectionDiagnosticInput,
): JsonRecord {
  const baseMetadata: JsonRecord = isRecord(metadata) ? { ...metadata } : {};
  const current = readConnectionDiagnostics(baseMetadata);
  const now = input.at ?? new Date().toISOString();
  const summary = summarizeConnectionProviderPayload(input.providerPayload);
  const inferredFinalStatus = input.finalStatus ?? inferConnectionFinalStatus(input.type, summary);
  const finalReason = input.finalReason ?? summary.lastDisconnectReason ?? summary.message;
  let attempts = current.attempts.map((attempt) => ({ ...attempt, events: [...attempt.events] }));
  let activeAttempt = current.activeAttemptId
    ? attempts.find((attempt) => attempt.id === current.activeAttemptId) ?? null
    : null;

  if (input.type === "connect_requested" || !activeAttempt) {
    activeAttempt = createConnectionAttempt({
      mode: input.mode ?? "qr",
      phone: input.phone,
      now,
    });
    attempts = [...attempts, activeAttempt].slice(-maxStoredAttempts);
  }

  const event = buildConnectionDiagnosticEvent(input, summary, now);
  activeAttempt.updatedAt = now;
  activeAttempt.lastDisconnectReason = event.lastDisconnectReason ?? activeAttempt.lastDisconnectReason;
  activeAttempt.events = [...activeAttempt.events, event].slice(-maxStoredEvents);
  if (input.type === "status_connected" || input.type === "passkey_blocked" || event.connected === true || event.loggedIn === true) {
    activeAttempt.scanDetected = true;
  }

  if (event.hasQrCode) {
    activeAttempt.qrReceivedCount += 1;
  }

  if (event.hasPairCode) {
    activeAttempt.pairCodeReceivedCount += 1;
  }

  if (input.type === "status_poll" || input.type === "qr_updated" || input.type === "pair_code_updated") {
    activeAttempt.statusPollCount += 1;
  }

  if (inferredFinalStatus !== "pending") {
    activeAttempt.finalStatus = inferredFinalStatus;
    activeAttempt.finalReason = finalReason;
    activeAttempt.finishedAt = now;
  }

  const activeAttemptId = inferredFinalStatus === "pending" ? activeAttempt.id : null;
  const normalizedAttempts = attempts.slice(-maxStoredAttempts);

  return {
    ...baseMetadata,
    [diagnosticsMetadataKey]: {
      activeAttemptId,
      attempts: normalizedAttempts,
    },
    last_connection_attempt: normalizedAttempts.at(-1) ?? null,
  };
}

export function resolveConnectionDiagnosticEventType(input: {
  defaultType: WhatsappConnectionEventType;
  providerPayload?: unknown;
  resolvedStatus?: string | null;
}) {
  const summary = summarizeConnectionProviderPayload(input.providerPayload);
  const status = input.resolvedStatus ?? summary.status;

  if (status === "connected" || summary.connected === true || summary.loggedIn === true) {
    return "status_connected";
  }

  if (isPasskeyDisconnectReason(summary.lastDisconnectReason)) {
    return "passkey_blocked";
  }

  if (isQrTimeoutDisconnectReason(summary.lastDisconnectReason)) {
    return "timeout";
  }

  if (status === "disconnected") {
    return "status_disconnected";
  }

  if (summary.hasPairCode) {
    return input.defaultType === "status_poll" ? "pair_code_updated" : "pair_code_received";
  }

  if (summary.hasQrCode) {
    return input.defaultType === "status_poll" ? "qr_updated" : "qr_received";
  }

  return input.defaultType;
}

export function summarizeConnectionProviderPayload(value: unknown) {
  const qrCode = findString(value, ["qrcode", "qrCode", "qr", "base64"]);
  const pairCode = findString(value, ["paircode", "pairCode", "pair_code"]);
  const lastDisconnectReason = findString(value, [
    "lastDisconnectReason",
    "last_disconnect_reason",
    "disconnectReason",
    "disconnect_reason",
  ]);

  return {
    status: findString(value, ["status", "state"]),
    connected: findBoolean(value, ["connected", "isConnected"]),
    loggedIn: findBoolean(value, ["loggedIn", "isLoggedIn"]),
    hasQrCode: Boolean(qrCode),
    qrCodeLength: qrCode?.length ?? null,
    hasPairCode: Boolean(pairCode),
    pairCodeLength: pairCode?.length ?? null,
    lastDisconnectReason,
    message: findString(value, ["error", "message", "detail", "reason"]),
  };
}

export function isPasskeyDisconnectReason(value: string | null | undefined) {
  const reason = value?.toLowerCase() ?? "";
  return reason.includes("passkey") || reason.includes("access key") || reason.includes("security key") || reason.includes("webauthn");
}

export function isQrTimeoutDisconnectReason(value: string | null | undefined) {
  const reason = value?.toLowerCase() ?? "";
  return reason.includes("qr code timeout") || reason.includes("qrcode timeout") || reason.includes("qr timeout");
}

function createConnectionAttempt(input: {
  mode: WhatsappConnectionMode;
  phone?: string | null;
  now: string;
}): WhatsappConnectionAttemptDiagnostic {
  return {
    id: `wcx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    mode: input.mode,
    phonePreview: previewPhone(input.phone),
    startedAt: input.now,
    updatedAt: input.now,
    finishedAt: null,
    finalStatus: "pending",
    finalReason: null,
    lastDisconnectReason: null,
    qrReceivedCount: 0,
    pairCodeReceivedCount: 0,
    statusPollCount: 0,
    scanDetected: null,
    events: [],
  };
}

function buildConnectionDiagnosticEvent(
  input: AppendConnectionDiagnosticInput,
  summary: ReturnType<typeof summarizeConnectionProviderPayload>,
  now: string,
): WhatsappConnectionDiagnosticEvent {
  return {
    type: input.type,
    at: now,
    providerStatus: input.providerStatus ?? null,
    status: summary.status,
    connected: summary.connected,
    loggedIn: summary.loggedIn,
    hasQrCode: summary.hasQrCode,
    qrCodeLength: summary.qrCodeLength,
    hasPairCode: summary.hasPairCode,
    pairCodeLength: summary.pairCodeLength,
    lastDisconnectReason: summary.lastDisconnectReason,
    message: input.message ?? summary.message,
  };
}

function inferConnectionFinalStatus(
  type: WhatsappConnectionEventType,
  summary: ReturnType<typeof summarizeConnectionProviderPayload>,
): WhatsappConnectionFinalStatus {
  if (type === "status_connected" || summary.status === "connected" || summary.connected === true || summary.loggedIn === true) {
    return "success";
  }

  if (type === "passkey_blocked" || isPasskeyDisconnectReason(summary.lastDisconnectReason)) {
    return "passkey_blocked";
  }

  if (type === "timeout" || isQrTimeoutDisconnectReason(summary.lastDisconnectReason)) {
    return "qr_timeout";
  }

  if (type === "provider_error") {
    return "provider_error";
  }

  if (type === "reset_requested") {
    return "reset";
  }

  if (type === "status_disconnected" || summary.status === "disconnected") {
    return "disconnected";
  }

  return "pending";
}

function readConnectionAttempt(value: unknown): WhatsappConnectionAttemptDiagnostic | null {
  const record = readRecord(value);

  if (!record) {
    return null;
  }

  const id = readString(record.id);
  const mode = record.mode === "phone" ? "phone" : record.mode === "qr" ? "qr" : null;
  const startedAt = readString(record.startedAt);

  if (!id || !mode || !startedAt) {
    return null;
  }

  const finalStatus = readConnectionFinalStatus(record.finalStatus);

  return {
    id,
    mode,
    phonePreview: readString(record.phonePreview),
    startedAt,
    updatedAt: readString(record.updatedAt) ?? startedAt,
    finishedAt: readString(record.finishedAt),
    finalStatus,
    finalReason: readString(record.finalReason),
    lastDisconnectReason: readString(record.lastDisconnectReason),
    qrReceivedCount: readNumber(record.qrReceivedCount) ?? 0,
    pairCodeReceivedCount: readNumber(record.pairCodeReceivedCount) ?? 0,
    statusPollCount: readNumber(record.statusPollCount) ?? 0,
    scanDetected: typeof record.scanDetected === "boolean" ? record.scanDetected : null,
    events: readArray(record.events).map(readConnectionEvent).filter(Boolean).slice(-maxStoredEvents) as WhatsappConnectionDiagnosticEvent[],
  };
}

function readConnectionEvent(value: unknown): WhatsappConnectionDiagnosticEvent | null {
  const record = readRecord(value);

  if (!record) {
    return null;
  }

  const type = readConnectionEventType(record.type);
  const at = readString(record.at);

  if (!type || !at) {
    return null;
  }

  return {
    type,
    at,
    providerStatus: readNumber(record.providerStatus),
    status: readString(record.status),
    connected: typeof record.connected === "boolean" ? record.connected : null,
    loggedIn: typeof record.loggedIn === "boolean" ? record.loggedIn : null,
    hasQrCode: record.hasQrCode === true,
    qrCodeLength: readNumber(record.qrCodeLength),
    hasPairCode: record.hasPairCode === true,
    pairCodeLength: readNumber(record.pairCodeLength),
    lastDisconnectReason: readString(record.lastDisconnectReason),
    message: readString(record.message),
  };
}

function readConnectionFinalStatus(value: unknown): WhatsappConnectionFinalStatus {
  const status = readString(value);
  const allowed: WhatsappConnectionFinalStatus[] = [
    "pending",
    "success",
    "passkey_blocked",
    "qr_timeout",
    "disconnected",
    "provider_error",
    "reset",
    "unknown",
  ];

  return allowed.includes(status as WhatsappConnectionFinalStatus) ? (status as WhatsappConnectionFinalStatus) : "unknown";
}

function readConnectionEventType(value: unknown): WhatsappConnectionEventType | null {
  const type = readString(value);
  const allowed: WhatsappConnectionEventType[] = [
    "connect_requested",
    "connect_response",
    "qr_received",
    "qr_updated",
    "pair_code_received",
    "pair_code_updated",
    "status_poll",
    "status_connected",
    "status_disconnected",
    "passkey_blocked",
    "timeout",
    "provider_error",
    "reset_requested",
  ];

  return allowed.includes(type as WhatsappConnectionEventType) ? type as WhatsappConnectionEventType : null;
}

function previewPhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (!digits) {
    return null;
  }

  return digits.length <= 4 ? `****${digits}` : `${digits.slice(0, 4)}****${digits.slice(-4)}`;
}

function findString(value: unknown, keys: string[]): string | null {
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));
  const found = findValue(value, (key, item) => lowerKeys.has(key.toLowerCase()) && typeof item === "string" && item.trim().length > 0);
  return typeof found === "string" ? found.trim() : null;
}

function findBoolean(value: unknown, keys: string[]): boolean | null {
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));
  const found = findValue(value, (key, item) => lowerKeys.has(key.toLowerCase()) && typeof item === "boolean");
  return typeof found === "boolean" ? found : null;
}

function findValue(value: unknown, predicate: (key: string, value: unknown) => boolean): unknown {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, predicate);
      if (found !== null) return found;
    }

    return null;
  }

  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (predicate(key, item)) {
      return item;
    }

    const found = findValue(item, predicate);
    if (found !== null) return found;
  }

  return null;
}

function readRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
