type JsonRecord = Record<string, unknown>;

const profileNameKeys = [
  "profileName",
  "profile_name",
  "businessName",
  "business_name",
  "displayName",
  "display_name",
  "waName",
  "wa_name",
  "pushName",
  "notifyName",
  "verifiedName",
  "ownerName",
  "contactName",
  "name",
];

const providerPayloadNameKeys = [
  "profileName",
  "profile_name",
  "businessName",
  "business_name",
  "displayName",
  "display_name",
  "waName",
  "wa_name",
  "pushName",
  "notifyName",
  "verifiedName",
  "ownerName",
  "contactName",
];

const metadataNameKeys = [
  ...providerPayloadNameKeys,
  "requestedDisplayName",
  "requested_display_name",
  "whatsappDisplayName",
  "whatsapp_display_name",
  "lastDisplayName",
  "last_display_name",
];

const fallbackNameKeys = [
  "instanceName",
  "instance_name",
  "systemName",
  "system_name",
];

export function resolveWhatsappInstanceDisplayName(input: {
  providerData?: unknown;
  profileData?: unknown;
  avatarData?: unknown;
  metadata?: unknown;
  existingDisplayName?: string | null;
  requestedName?: string | null;
  fallbackName?: string | null;
  phoneNumber?: string | null;
  providerInstanceId?: string | null;
  instanceId?: string | null;
}) {
  const blocked = [input.phoneNumber, input.providerInstanceId, input.instanceId];
  const candidates = [
    findHumanName(input.profileData, profileNameKeys, blocked),
    findHumanName(input.avatarData, profileNameKeys, blocked),
    findHumanName(input.providerData, providerPayloadNameKeys, blocked),
    findHumanName(input.metadata, metadataNameKeys, blocked),
    normalizeWhatsappInstanceDisplayName(input.existingDisplayName, blocked),
    normalizeWhatsappInstanceDisplayName(input.requestedName, blocked),
    normalizeWhatsappInstanceDisplayName(input.fallbackName, blocked),
    findHumanName(input.profileData, fallbackNameKeys, blocked),
    findHumanName(input.avatarData, fallbackNameKeys, blocked),
  ];

  return candidates.find(Boolean) ?? null;
}

export function normalizeWhatsappInstanceDisplayName(value: string | null | undefined, blockedValues: Array<string | null | undefined> = []) {
  const cleaned = value?.replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length < 2) {
    return null;
  }

  if (isPhoneLike(cleaned) || isBlockedValue(cleaned, blockedValues) || isTechnicalWhatsappInstanceName(cleaned)) {
    return null;
  }

  return cleaned.slice(0, 120);
}

export function isTechnicalWhatsappInstanceName(value: string | null | undefined) {
  const cleaned = value?.trim();

  if (!cleaned) {
    return false;
  }

  const lower = cleaned.toLowerCase();
  const operationalLabels = new Set([
    "agente global",
    "whatsapp global",
    "api whatsapp",
    "connectyhub api",
  ]);

  return (
    operationalLabels.has(lower) ||
    /^(ch-api|user|instance|api)[_-]/.test(lower) ||
    lower.startsWith("connectyhub-") ||
    lower.startsWith("connectyhub api -") ||
    lower.startsWith("connectyhub interno -") ||
    /^[a-z]+_[0-9a-f-]{12,}_\d{8,}$/.test(lower) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned) ||
    /^[0-9a-f]{16,}$/i.test(cleaned)
  );
}

function findHumanName(value: unknown, keys: string[], blockedValues: Array<string | null | undefined>) {
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));

  for (const found of findStringCandidates(value, lowerKeys)) {
    const normalized = normalizeWhatsappInstanceDisplayName(found, blockedValues);
    if (normalized) return normalized;
  }

  return null;
}

function findStringCandidates(value: unknown, lowerKeys: Set<string>): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    const found: string[] = [];

    for (const item of value) {
      found.push(...findStringCandidates(item, lowerKeys));
    }

    return found;
  }

  const found: string[] = [];

  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (lowerKeys.has(key.toLowerCase()) && typeof item === "string" && item.trim().length > 0) {
      found.push(item.trim());
    }

    found.push(...findStringCandidates(item, lowerKeys));
  }

  return found;
}

function isPhoneLike(value: string) {
  return /^\+?\d[\d\s().-]{7,}$/.test(value);
}

function isBlockedValue(value: string, blockedValues: Array<string | null | undefined>) {
  const normalized = value.toLowerCase();

  return blockedValues.some((item) => {
    const blocked = item?.trim().toLowerCase();
    return Boolean(blocked && normalized === blocked);
  });
}
