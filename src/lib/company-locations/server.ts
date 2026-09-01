import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeOrganizationLocations,
  type OrganizationLocation,
  type OrganizationLocationServiceMode,
} from "./shared";

type OrganizationLocationRow = {
  id: string;
  organization_id: string;
  label: string | null;
  address: string | null;
  cep: string | null;
  city: string | null;
  region: string | null;
  maps_url: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  is_primary: boolean | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
};

const selectColumns = [
  "id",
  "organization_id",
  "label",
  "address",
  "cep",
  "city",
  "region",
  "maps_url",
  "latitude",
  "longitude",
  "is_primary",
  "notes",
  "metadata",
  "updated_at",
].join(", ");

export async function listOrganizationLocations(
  client: SupabaseClient,
  organizationId: string,
): Promise<OrganizationLocation[]> {
  const { data, error } = await client
    .from("organization_locations")
    .select(selectColumns)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingOrganizationLocationsTable(error)) {
      return [];
    }

    throw new Error(`Nao foi possivel carregar localizacoes da empresa: ${error.message}`);
  }

  return ((data ?? []) as unknown as OrganizationLocationRow[]).map(mapOrganizationLocationRow);
}

export async function replaceOrganizationLocations(input: {
  client: SupabaseClient;
  organizationId: string;
  userId: string;
  locations: unknown;
}) {
  const locations = normalizeOrganizationLocations(input.locations);

  const { error: deleteError } = await input.client
    .from("organization_locations")
    .delete()
    .eq("organization_id", input.organizationId);

  if (deleteError) {
    throw new Error(`Nao foi possivel atualizar localizacoes da empresa: ${deleteError.message}`);
  }

  if (locations.length === 0) {
    return [];
  }

  const rows = locations.map((location) => ({
    organization_id: input.organizationId,
    label: location.label,
    address: location.address,
    cep: location.cep,
    city: location.city,
    region: location.region,
    maps_url: location.mapsUrl,
    latitude: location.latitude,
    longitude: location.longitude,
    is_primary: location.isPrimary,
    notes: location.notes,
    status: "active",
    created_by: input.userId,
    updated_by: input.userId,
    metadata: {
      source: "client_dashboard",
      service_mode: location.serviceMode,
    },
  }));

  const { data, error } = await input.client
    .from("organization_locations")
    .insert(rows)
    .select(selectColumns);

  if (error) {
    throw new Error(`Nao foi possivel salvar localizacoes da empresa: ${error.message}`);
  }

  return ((data ?? []) as unknown as OrganizationLocationRow[]).map(mapOrganizationLocationRow);
}

function mapOrganizationLocationRow(row: OrganizationLocationRow): OrganizationLocation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label?.trim() || "Unidade principal",
    serviceMode: readServiceMode(row.metadata?.service_mode),
    address: row.address?.trim() || null,
    cep: row.cep?.trim() || null,
    city: row.city?.trim() || null,
    region: row.region?.trim() || null,
    mapsUrl: row.maps_url?.trim() || null,
    latitude: readNumber(row.latitude),
    longitude: readNumber(row.longitude),
    isPrimary: row.is_primary === true,
    notes: row.notes?.trim() || null,
    updatedAt: row.updated_at,
  };
}

function readServiceMode(value: unknown): OrganizationLocationServiceMode {
  return value === "private_headquarters" || value === "warehouse_dispatch" || value === "no_fixed_location"
    ? value
    : "public_storefront";
}

function readNumber(value: number | string | null) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function isMissingOrganizationLocationsTable(error: { code?: string; message?: string }) {
  const message = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return message.includes("42p01")
    || message.includes("pgrst205")
    || (message.includes("organization_locations") && (
      message.includes("does not exist")
      || message.includes("schema cache")
    ));
}
