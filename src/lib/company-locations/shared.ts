export type OrganizationLocation = {
  id: string | null;
  organizationId: string | null;
  label: string;
  address: string | null;
  cep: string | null;
  city: string | null;
  region: string | null;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  isPrimary: boolean;
  notes: string | null;
  updatedAt: string | null;
};

export type OrganizationLocationInput = Partial<Omit<OrganizationLocation, "organizationId" | "updatedAt">>;

const maxOrganizationLocations = 8;

export function normalizeOrganizationLocations(value: unknown): OrganizationLocation[] {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .slice(0, maxOrganizationLocations)
    .map((item, index) => normalizeOrganizationLocation(item, index))
    .filter((item): item is OrganizationLocation => Boolean(item));

  if (normalized.length === 0) {
    return [];
  }

  const primaryIndex = normalized.findIndex((item) => item.isPrimary);

  return normalized.map((item, index) => ({
    ...item,
    isPrimary: primaryIndex >= 0 ? index === primaryIndex : index === 0,
  }));
}

export function hasUsableOrganizationLocation(location: OrganizationLocation) {
  return Boolean(
    location.address
      || location.mapsUrl
      || (location.latitude !== null && location.longitude !== null),
  );
}

export function hasOrganizationLocationCoordinates(location: OrganizationLocation) {
  return location.latitude !== null && location.longitude !== null;
}

export function formatOrganizationLocationAddress(location: OrganizationLocation) {
  return [
    location.address,
    [location.city, location.region].filter(Boolean).join(" - "),
    location.cep ? `CEP ${location.cep}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function normalizeOrganizationLocation(value: unknown, index: number): OrganizationLocation | null {
  const input = isRecord(value) ? value : {};
  const label = readLimitedString(input.label, 80) || (index === 0 ? "Unidade principal" : `Unidade ${index + 1}`);
  const address = readLimitedString(input.address, 240);
  const cep = normalizeCep(input.cep);
  const city = readLimitedString(input.city, 80);
  const region = readLimitedString(input.region, 40);
  const mapsUrl = normalizeHttpUrl(input.mapsUrl ?? input.maps_url);
  const latitude = readCoordinate(input.latitude, -90, 90);
  const longitude = readCoordinate(input.longitude, -180, 180);
  const notes = readLimitedString(input.notes, 300);

  const location: OrganizationLocation = {
    id: readLimitedString(input.id, 80) || null,
    organizationId: null,
    label,
    address: address || null,
    cep,
    city: city || null,
    region: region || null,
    mapsUrl,
    latitude,
    longitude,
    isPrimary: readBoolean(input.isPrimary ?? input.is_primary, index === 0),
    notes: notes || null,
    updatedAt: null,
  };

  return hasUsableOrganizationLocation(location) ? location : null;
}

function normalizeCep(value: unknown) {
  const raw = typeof value === "string" ? value.replace(/\D/g, "") : "";

  if (!raw) {
    return null;
  }

  if (raw.length !== 8) {
    return null;
  }

  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

function normalizeHttpUrl(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function readCoordinate(value: unknown, min: number, max: number) {
  const number = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value.replace(",", "."))
      : NaN;

  if (!Number.isFinite(number) || number < min || number > max) {
    return null;
  }

  return Number(number.toFixed(7));
}

function readLimitedString(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
