import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export type StorageUploadCategory =
  | "product_media"
  | "knowledge"
  | "import_source"
  | "generated_media"
  | "lead_file"
  | "other";

export type StorageUploadFile = {
  fileName?: string | null;
  contentType?: string | null;
  sizeBytes: number;
};

export type OrganizationStorageEntitlement = {
  organizationId: string;
  planCode: string | null;
  planName: string | null;
  planStorageLimitBytes: number;
  planStorageFileLimit: number;
  storageImageMaxBytes: number;
  storageVideoMaxBytes: number;
  storageFileMaxBytes: number;
  addonStorageBytes: number;
  addonFileLimit: number;
  totalStorageLimitBytes: number;
  totalStorageFileLimit: number;
};

export type OrganizationStorageUsage = {
  usedBytes: number;
  billableFileCount: number;
  productMediaBytes: number;
  knowledgeBytes: number;
  importSourceBytes: number;
  generatedMediaBytes: number;
  leadFileBytes: number;
  otherBytes: number;
  updatedAt: string | null;
};

export type OrganizationStorageState = {
  entitlement: OrganizationStorageEntitlement;
  usage: OrganizationStorageUsage;
  availableBytes: number;
  availableFileCount: number;
  usedPercent: number;
};

type StorageEntitlementRow = {
  organization_id: string;
  plan_code: string | null;
  plan_name: string | null;
  plan_storage_limit_bytes: number | string | null;
  plan_storage_file_limit: number | string | null;
  storage_image_max_bytes: number | string | null;
  storage_video_max_bytes: number | string | null;
  storage_file_max_bytes: number | string | null;
  addon_storage_bytes: number | string | null;
  addon_file_limit: number | string | null;
  total_storage_limit_bytes: number | string | null;
  total_storage_file_limit: number | string | null;
};

type StorageUsageRow = {
  used_bytes: number | string | null;
  billable_file_count: number | string | null;
  product_media_bytes: number | string | null;
  knowledge_bytes: number | string | null;
  import_source_bytes: number | string | null;
  generated_media_bytes: number | string | null;
  lead_file_bytes: number | string | null;
  other_bytes: number | string | null;
  updated_at: string | null;
};

export class StorageQuotaError extends Error {
  status = 413;
  code = "storage_quota_exceeded";

  constructor(message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "StorageQuotaError";
  }
}

export async function getOrganizationStorageState(input: {
  client?: SupabaseClient;
  organizationId: string;
}): Promise<OrganizationStorageState> {
  const client = input.client ?? createServiceClient();
  const { data: entitlementData, error: entitlementError } = await client.rpc(
    "get_organization_storage_entitlement",
    { p_organization_id: input.organizationId },
  );

  if (entitlementError) {
    throw new Error(`Nao foi possivel carregar o limite de armazenamento: ${entitlementError.message}`);
  }

  const entitlementRow = Array.isArray(entitlementData)
    ? (entitlementData[0] as StorageEntitlementRow | undefined)
    : (entitlementData as StorageEntitlementRow | null);

  if (!entitlementRow) {
    throw new StorageQuotaError("Nao encontramos um plano de armazenamento ativo para esta empresa.", {
      organizationId: input.organizationId,
    });
  }

  const { data: usageData, error: usageError } = await client
    .from("organization_storage_usage")
    .select(
      [
        "used_bytes",
        "billable_file_count",
        "product_media_bytes",
        "knowledge_bytes",
        "import_source_bytes",
        "generated_media_bytes",
        "lead_file_bytes",
        "other_bytes",
        "updated_at",
      ].join(", "),
    )
    .eq("organization_id", input.organizationId)
    .maybeSingle<StorageUsageRow>();

  if (usageError) {
    throw new Error(`Nao foi possivel carregar o uso de armazenamento: ${usageError.message}`);
  }

  const entitlement = mapEntitlement(entitlementRow);
  const usage = mapUsage(usageData);
  const availableBytes = Math.max(0, entitlement.totalStorageLimitBytes - usage.usedBytes);
  const availableFileCount = Math.max(0, entitlement.totalStorageFileLimit - usage.billableFileCount);
  const usedPercent = entitlement.totalStorageLimitBytes > 0
    ? Math.min(100, Math.round((usage.usedBytes / entitlement.totalStorageLimitBytes) * 100))
    : 0;

  return {
    entitlement,
    usage,
    availableBytes,
    availableFileCount,
    usedPercent,
  };
}

export async function assertStorageUploadAllowed(input: {
  client?: SupabaseClient;
  organizationId: string;
  category: StorageUploadCategory;
  files: StorageUploadFile[];
}) {
  const files = input.files.filter((file) => file.sizeBytes > 0);
  if (files.length === 0) {
    return getOrganizationStorageState({
      client: input.client,
      organizationId: input.organizationId,
    });
  }

  const state = await getOrganizationStorageState({
    client: input.client,
    organizationId: input.organizationId,
  });
  const totalBytes = files.reduce((total, file) => total + file.sizeBytes, 0);

  if (state.entitlement.totalStorageLimitBytes <= 0) {
    throw new StorageQuotaError("Este plano ainda nao possui armazenamento liberado.", {
      organizationId: input.organizationId,
      planCode: state.entitlement.planCode,
    });
  }

  for (const file of files) {
    const maxBytes = maxBytesForUploadFile(state.entitlement, file);

    if (maxBytes > 0 && file.sizeBytes > maxBytes) {
      const kindLabel = uploadKindLabel(file);
      throw new StorageQuotaError(
        `${kindLabel} muito grande. O limite por arquivo neste plano e ${formatStorageBytes(maxBytes)}.`,
        {
          fileName: file.fileName ?? null,
          contentType: file.contentType ?? null,
          fileSizeBytes: file.sizeBytes,
          maxBytes,
        },
      );
    }
  }

  if (state.usage.usedBytes + totalBytes > state.entitlement.totalStorageLimitBytes) {
    throw new StorageQuotaError(
      `Armazenamento insuficiente. Restam ${formatStorageBytes(state.availableBytes)} e este envio usa ${formatStorageBytes(totalBytes)}.`,
      {
        availableBytes: state.availableBytes,
        uploadBytes: totalBytes,
        limitBytes: state.entitlement.totalStorageLimitBytes,
        usedBytes: state.usage.usedBytes,
      },
    );
  }

  if (
    state.entitlement.totalStorageFileLimit > 0
    && state.usage.billableFileCount + files.length > state.entitlement.totalStorageFileLimit
  ) {
    throw new StorageQuotaError(
      `Limite de arquivos atingido. Este plano permite ${formatInteger(state.entitlement.totalStorageFileLimit)} arquivos armazenados.`,
      {
        fileCount: files.length,
        currentFileCount: state.usage.billableFileCount,
        limitFileCount: state.entitlement.totalStorageFileLimit,
      },
    );
  }

  return state;
}

export async function recordOrganizationStorageUsage(input: {
  client?: SupabaseClient;
  organizationId: string;
  category: StorageUploadCategory;
  bytes: number;
  fileCount?: number;
  metadata?: Record<string, unknown>;
}) {
  const bytes = Math.max(0, Math.trunc(input.bytes));
  const fileCount = Math.max(0, Math.trunc(input.fileCount ?? 1));

  if (bytes <= 0 && fileCount <= 0) {
    return null;
  }

  const client = input.client ?? createServiceClient();
  const { data, error } = await client.rpc("record_organization_storage_usage", {
    p_organization_id: input.organizationId,
    p_bytes: bytes,
    p_file_count: fileCount,
    p_category: input.category,
    p_metadata: input.metadata ?? {},
  });

  if (error) {
    throw new Error(`Nao foi possivel registrar uso de armazenamento: ${error.message}`);
  }

  return data;
}

export function formatStorageBytes(value: number) {
  const bytes = Math.max(0, Number.isFinite(value) ? value : 0);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let nextValue = bytes;
  let unitIndex = 0;

  while (nextValue >= 1024 && unitIndex < units.length - 1) {
    nextValue /= 1024;
    unitIndex += 1;
  }

  const maximumFractionDigits = nextValue >= 10 || unitIndex === 0 ? 0 : 1;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(nextValue)} ${units[unitIndex]}`;
}

export function isStorageQuotaError(error: unknown): error is StorageQuotaError {
  return error instanceof StorageQuotaError;
}

function mapEntitlement(row: StorageEntitlementRow): OrganizationStorageEntitlement {
  return {
    organizationId: row.organization_id,
    planCode: row.plan_code,
    planName: row.plan_name,
    planStorageLimitBytes: toNumber(row.plan_storage_limit_bytes),
    planStorageFileLimit: toNumber(row.plan_storage_file_limit),
    storageImageMaxBytes: toNumber(row.storage_image_max_bytes),
    storageVideoMaxBytes: toNumber(row.storage_video_max_bytes),
    storageFileMaxBytes: toNumber(row.storage_file_max_bytes),
    addonStorageBytes: toNumber(row.addon_storage_bytes),
    addonFileLimit: toNumber(row.addon_file_limit),
    totalStorageLimitBytes: toNumber(row.total_storage_limit_bytes),
    totalStorageFileLimit: toNumber(row.total_storage_file_limit),
  };
}

function mapUsage(row: StorageUsageRow | null): OrganizationStorageUsage {
  return {
    usedBytes: toNumber(row?.used_bytes),
    billableFileCount: toNumber(row?.billable_file_count),
    productMediaBytes: toNumber(row?.product_media_bytes),
    knowledgeBytes: toNumber(row?.knowledge_bytes),
    importSourceBytes: toNumber(row?.import_source_bytes),
    generatedMediaBytes: toNumber(row?.generated_media_bytes),
    leadFileBytes: toNumber(row?.lead_file_bytes),
    otherBytes: toNumber(row?.other_bytes),
    updatedAt: row?.updated_at ?? null,
  };
}

function maxBytesForUploadFile(entitlement: OrganizationStorageEntitlement, file: StorageUploadFile) {
  const contentType = file.contentType?.toLowerCase() ?? "";
  const fileName = file.fileName?.toLowerCase() ?? "";

  if (contentType.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/i.test(fileName)) {
    return entitlement.storageImageMaxBytes || entitlement.storageFileMaxBytes;
  }

  if (contentType.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(fileName)) {
    return entitlement.storageVideoMaxBytes || entitlement.storageFileMaxBytes;
  }

  return entitlement.storageFileMaxBytes;
}

function uploadKindLabel(file: StorageUploadFile) {
  const contentType = file.contentType?.toLowerCase() ?? "";
  const fileName = file.fileName?.toLowerCase() ?? "";

  if (contentType.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/i.test(fileName)) {
    return "Imagem";
  }

  if (contentType.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(fileName)) {
    return "Video";
  }

  return "Arquivo";
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}
