export type UazapiWhatsappStatus =
  | "draft"
  | "qr_pending"
  | "connected"
  | "disconnected"
  | "blocked"
  | "error";

type JsonRecord = Record<string, unknown>;

const CONNECTION_BOOLEAN_KEYS = [
  "connected",
  "isConnected",
  "loggedIn",
  "isLoggedIn",
  "online",
  "isOnline",
  "authenticated",
  "isAuthenticated",
  "ready",
  "isReady",
];

export function resolveUazapiWhatsappStatus(
  payload: unknown,
  fallback: UazapiWhatsappStatus = "draft",
): UazapiWhatsappStatus {
  const explicitConnection = readExplicitConnection(payload);

  if (explicitConnection === true) {
    return "connected";
  }

  const rawStatus = findStatusString(payload);
  const normalized = normalizeUazapiWhatsappStatus(rawStatus, fallback);

  if (normalized !== "draft") {
    if (explicitConnection === false && normalized === "connected") {
      return "disconnected";
    }

    return normalized;
  }

  return explicitConnection === false ? "disconnected" : fallback;
}

export function normalizeUazapiWhatsappStatus(
  value: string | null | undefined,
  fallback: UazapiWhatsappStatus = "draft",
): UazapiWhatsappStatus {
  const status = value?.toLowerCase().replace(/[_-]+/g, " ").trim() ?? "";

  if (!status) return fallback;

  if (["disconnected", "desconect", "not connected", "not logged", "closed", "close", "logout", "offline", "hibernat"].some((item) => status.includes(item))) {
    return "disconnected";
  }

  if (["qr", "pair", "scan", "connecting", "pending"].some((item) => status.includes(item))) {
    return "qr_pending";
  }

  if (["connected", "open", "online", "logged", "ready"].some((item) => status.includes(item))) {
    return "connected";
  }

  if (["blocked", "ban"].some((item) => status.includes(item))) {
    return "blocked";
  }

  if (["error", "fail"].some((item) => status.includes(item))) {
    return "error";
  }

  return fallback;
}

function readExplicitConnection(value: unknown): boolean | null {
  const direct = readConnectionBoolean(readRecord(value));

  if (direct !== null) {
    return direct;
  }

  const root = readRecord(value);
  const status = readConnectionBoolean(readRecord(root?.status));

  if (status !== null) {
    return status;
  }

  const instance = readConnectionBoolean(readRecord(root?.instance));

  if (instance !== null) {
    return instance;
  }

  return findConnectionBoolean(value);
}

function readConnectionBoolean(record: JsonRecord | null): boolean | null {
  if (!record) {
    return null;
  }

  const values = new Map(Object.entries(record).map(([key, item]) => [key.toLowerCase(), item]));

  for (const key of CONNECTION_BOOLEAN_KEYS) {
    const value = values.get(key.toLowerCase());

    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function findConnectionBoolean(value: unknown): boolean | null {
  const lowerKeys = new Set(CONNECTION_BOOLEAN_KEYS.map((key) => key.toLowerCase()));
  const found = findValue(value, (key, item) => lowerKeys.has(key.toLowerCase()) && typeof item === "boolean");

  return typeof found === "boolean" ? found : null;
}

function findStatusString(value: unknown): string | null {
  const direct = readRecord(value);

  if (direct) {
    const directStatus = readString(direct.status) ?? readString(direct.state) ?? readString(direct.connectionStatus);

    if (directStatus) {
      return directStatus;
    }

    const instance = readRecord(direct.instance);
    const instanceStatus = readString(instance?.status) ?? readString(instance?.state) ?? readString(instance?.connectionStatus);

    if (instanceStatus) {
      return instanceStatus;
    }
  }

  return findString(value, ["status", "state", "connectionStatus"]);
}

function findString(value: unknown, keys: string[]): string | null {
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));
  const found = findValue(value, (key, item) => lowerKeys.has(key.toLowerCase()) && typeof item === "string" && item.trim().length > 0);

  return readString(found);
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
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
