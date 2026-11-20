/** Google tag for a client's public store: GA4 measurement and Google Ads conversion IDs. */
export type GoogleStoreTag = {
  measurementId: string | null;
  adsConversionId: string | null;
  leadLabel: string | null;
  enabled: boolean;
};

export type GoogleStoreTagRow = {
  measurement_id: string | null;
  ads_conversion_id: string | null;
  lead_label: string | null;
  enabled: boolean;
};

function blank(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

/** Accepts "G-ABC123" in any case. */
export function normalizeMeasurementId(value: unknown) {
  if (blank(value)) return null;
  const id = String(value).trim().toUpperCase();
  if (!/^G-[A-Z0-9]{4,20}$/.test(id)) throw new Error("O ID do Google Analytics começa com G- (ex.: G-ABC123XYZ).");
  return id;
}

/** Accepts "AW-123456789" or just the digits. */
export function normalizeAdsConversionId(value: unknown) {
  if (blank(value)) return null;
  const raw = String(value).trim().toUpperCase().replace(/\s/g, "");
  const id = /^\d+$/.test(raw) ? `AW-${raw}` : raw;
  if (!/^AW-\d{6,15}$/.test(id)) throw new Error("O ID do Google Ads começa com AW- seguido de números (ex.: AW-123456789).");
  return id;
}

/** Conversion labels are case-sensitive; keep them as typed. */
export function normalizeConversionLabel(value: unknown) {
  if (blank(value)) return null;
  const label = String(value).trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(label)) throw new Error("Rótulo de conversão inválido. Copie o rótulo exibido no Google Ads.");
  return label;
}

export function parseGoogleStoreTag(body: unknown): GoogleStoreTag {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const tag: GoogleStoreTag = {
    measurementId: normalizeMeasurementId(input.measurementId),
    adsConversionId: normalizeAdsConversionId(input.adsConversionId),
    leadLabel: normalizeConversionLabel(input.leadLabel),
    enabled: input.enabled === true,
  };
  if (tag.leadLabel && !tag.adsConversionId) throw new Error("Informe o ID do Google Ads para usar o rótulo de conversão.");
  if (tag.enabled && !tag.measurementId && !tag.adsConversionId) throw new Error("Informe ao menos um ID: Google Analytics (G-) ou Google Ads (AW-).");
  return tag;
}

export function googleStoreTagFromRow(row: GoogleStoreTagRow | null): GoogleStoreTag | null {
  return row
    ? { measurementId: row.measurement_id, adsConversionId: row.ads_conversion_id, leadLabel: row.lead_label, enabled: row.enabled }
    : null;
}

/** What the public store page may learn: only active IDs, nothing else about the company. */
export function publicGoogleStoreTag(tag: GoogleStoreTag | null) {
  if (!tag?.enabled || (!tag.measurementId && !tag.adsConversionId)) return { active: false as const };
  return {
    active: true as const,
    measurementId: tag.measurementId,
    adsConversionId: tag.adsConversionId,
    leadSendTo: tag.adsConversionId && tag.leadLabel ? `${tag.adsConversionId}/${tag.leadLabel}` : null,
  };
}

/** Checkout paths carry bearer tokens: Google only ever sees the store path. */
export function safeStoreLocation(origin: string, pathname: string) {
  const path = pathname.startsWith("/checkout/") || pathname === "/checkout" ? "/checkout" : pathname;
  return origin + path;
}
