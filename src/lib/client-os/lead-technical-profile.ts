type RecordValue = Record<string, unknown>;
export type LeadTechnicalTracking = {
  device: string | null;
  browser: string | null;
  os: string | null;
  location: string | null;
  ipAddress: string | null;
  lastClick: string | null;
};

/** Latest available observation per field; unrelated events cannot erase it. */
export function resolveLeadTechnicalTracking(metadata: RecordValue, events: Array<{ event_type: string; occurred_at: string | null; payload: unknown }>): LeadTechnicalTracking {
  const ordered = [...events].sort((a, b) => Date.parse(b.occurred_at ?? "") - Date.parse(a.occurred_at ?? ""));
  const payloads = ordered.map(event => record(event.payload));
  const sources = [...payloads, metadata];
  const pick = (...keys: string[]) => {
    for (const source of sources) for (const key of keys) {
      const value = text(source[key]) ?? text(record(source.tracking)[key]);
      if (value) return value;
    }
    return null;
  };
  // Keep city/region/country from the same visit instead of mixing locations.
  const location = sources.map(source => [text(source.city), text(source.region), text(source.country)].filter(Boolean).join(" / ")).find(Boolean) ?? null;
  const click = ordered.find(event => ["tracked_link.clicked", "button_clicked", "link_clicked", "click"].includes(event.event_type));
  return { device: pick("device_type", "device"), browser: pick("browser"), os: pick("os"), location, ipAddress: pick("ip_address", "ip"), lastClick: click?.occurred_at ?? text(metadata.last_click_at) };
}

export function mergeLeadTechnicalTracking(primary: Partial<LeadTechnicalTracking> | undefined, fallback: Partial<LeadTechnicalTracking> | undefined): Partial<LeadTechnicalTracking> {
  return Object.fromEntries(Object.entries({ ...fallback, ...primary }).map(([key, value]) => [key, value ?? fallback?.[key as keyof LeadTechnicalTracking] ?? null]));
}

function record(value: unknown): RecordValue { return value && typeof value === "object" ? value as RecordValue : {}; }
function text(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  return /^(unknown|undefined|null|nao identificado|não identificado)$/i.test(value.trim()) ? null : value.trim();
}
