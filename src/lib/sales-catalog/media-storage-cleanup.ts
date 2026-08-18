import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesCatalogMedia } from "@/lib/sales-catalog/shared";
import { deleteR2Object, loadR2Config, resolveR2ObjectKeyFromPublicUrl } from "@/lib/storage/r2";
import { releaseOrganizationStorageUsage } from "@/lib/storage/quotas";

export type SalesCatalogMediaCleanupReason =
  | "product_deleted"
  | "product_media_removed";

export type SalesCatalogMediaCleanupResult = {
  requestedCount: number;
  deletedCount: number;
  releasedBytes: number;
  releasedFileCount: number;
  deletedMediaIds: string[];
  skipped: Array<{ mediaId: string; reason: string }>;
  failed: Array<{ mediaId: string; objectKey: string; error: string }>;
};

type SalesCatalogMediaWithObjectKey = SalesCatalogMedia & {
  objectKey?: string | null;
};

export async function cleanupSalesCatalogMediaStorage(input: {
  client: SupabaseClient;
  organizationId: string;
  productId: string;
  userId: string;
  media: SalesCatalogMediaWithObjectKey[];
  reason: SalesCatalogMediaCleanupReason;
}): Promise<SalesCatalogMediaCleanupResult> {
  const result: SalesCatalogMediaCleanupResult = {
    requestedCount: input.media.length,
    deletedCount: 0,
    releasedBytes: 0,
    releasedFileCount: 0,
    deletedMediaIds: [],
    skipped: [],
    failed: [],
  };

  if (input.media.length === 0) {
    return result;
  }

  const configResult = await loadR2Config(input.client);
  if (!configResult.ok) {
    result.skipped.push(...input.media.map((media) => ({
      mediaId: media.id,
      reason: configResult.error,
    })));
    return result;
  }

  const seenObjectKeys = new Set<string>();

  for (const media of input.media) {
    const objectKey = resolveCatalogMediaObjectKey({
      media,
      organizationId: input.organizationId,
      publicUrl: configResult.config.publicUrl,
    });

    if (!objectKey) {
      result.skipped.push({ mediaId: media.id, reason: "Objeto fora do R2 do catalogo ou sem chave rastreavel." });
      continue;
    }

    if (seenObjectKeys.has(objectKey)) {
      result.skipped.push({ mediaId: media.id, reason: "Objeto ja processado nesta limpeza." });
      continue;
    }

    seenObjectKeys.add(objectKey);

    const deletion = await deleteR2Object(configResult.config, objectKey).catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : "Falha inesperada ao remover arquivo do storage.",
    }));
    if (!deletion.ok) {
      result.failed.push({ mediaId: media.id, objectKey, error: deletion.error });
      continue;
    }

    try {
      await releaseOrganizationStorageUsage({
        client: input.client,
        organizationId: input.organizationId,
        category: "product_media",
        bytes: media.size,
        fileCount: 1,
        metadata: {
          source: "sales_catalog_media_cleanup",
          reason: input.reason,
          product_id: input.productId,
          media_id: media.id,
          object_key: objectKey,
          deleted_by: input.userId,
          r2_already_missing: deletion.alreadyMissing,
        },
      });
    } catch (error) {
      result.failed.push({
        mediaId: media.id,
        objectKey,
        error: error instanceof Error ? error.message : "Falha inesperada ao liberar uso de armazenamento.",
      });
      continue;
    }

    result.deletedCount += 1;
    result.releasedBytes += media.size;
    result.releasedFileCount += 1;
    result.deletedMediaIds.push(media.id);
  }

  return result;
}

export function filterCleanedSalesCatalogMedia<T extends { id: string }>(
  media: T[],
  cleanup: Pick<SalesCatalogMediaCleanupResult, "deletedMediaIds">,
) {
  const deletedIds = new Set(cleanup.deletedMediaIds);
  return media.filter((item) => !deletedIds.has(item.id));
}

function resolveCatalogMediaObjectKey(input: {
  media: SalesCatalogMediaWithObjectKey;
  organizationId: string;
  publicUrl: string;
}) {
  const explicitKey = input.media.objectKey?.trim() ?? "";
  const objectKey = explicitKey || resolveR2ObjectKeyFromPublicUrl(input.publicUrl, input.media.storageUrl);

  if (!objectKey) {
    return null;
  }

  const normalizedObjectKey = objectKey.replace(/^\/+/, "");
  const allowedPrefix = `sales-catalog/${input.organizationId}/`;

  return normalizedObjectKey.startsWith(allowedPrefix) ? normalizedObjectKey : null;
}
