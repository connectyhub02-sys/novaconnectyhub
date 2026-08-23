import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { deleteR2Object, loadR2Config, putR2Object, type R2Config } from "@/lib/storage/r2";
import {
  assertStorageUploadAllowed,
  isStorageQuotaError,
  recordOrganizationStorageUsage,
  releaseOrganizationStorageUsage,
} from "@/lib/storage/quotas";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const maxAvatarBytes = 5 * 1024 * 1024;
const allowedMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
type JsonRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const avatar = formData?.get("avatar");

  if (!(avatar instanceof File)) {
    return NextResponse.json({ error: "Envie uma imagem no campo avatar." }, { status: 400 });
  }

  const extension = allowedMimeTypes.get(avatar.type);

  if (!extension) {
    return NextResponse.json({ error: "Use uma imagem JPG, PNG ou WEBP." }, { status: 400 });
  }

  if (avatar.size <= 0 || avatar.size > maxAvatarBytes) {
    return NextResponse.json({ error: "A foto precisa ter ate 5 MB." }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const organizationId = await loadPrimaryOrganizationId(serviceClient, user.id);

  if (organizationId) {
    try {
      await assertStorageUploadAllowed({
        client: serviceClient,
        organizationId,
        category: "other",
        files: [{
          fileName: avatar.name,
          contentType: avatar.type,
          sizeBytes: avatar.size,
        }],
      });
    } catch (error) {
      if (isStorageQuotaError(error)) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json({
        error: error instanceof Error ? error.message : "Nao foi possivel validar limite de armazenamento.",
      }, { status: 500 });
    }
  }

  const configResult = await loadR2Config(serviceClient);

  if (!configResult.ok) {
    return NextResponse.json({ error: configResult.error }, { status: 503 });
  }

  const bytes = new Uint8Array(await avatar.arrayBuffer());
  const objectKey = `profiles/avatars/${user.id}/${Date.now()}-${randomUUID()}.${extension}`;
  const uploadResult = await putR2Object(configResult.config, objectKey, bytes, avatar.type);

  if (!uploadResult.ok) {
    return NextResponse.json({ error: uploadResult.error }, { status: 502 });
  }

  const avatarUrl = uploadResult.publicUrl;
  const uploadedAt = new Date().toISOString();
  const previousAvatarStorage = readAvatarStorage(user.user_metadata);

  if (organizationId) {
    try {
      await recordOrganizationStorageUsage({
        client: serviceClient,
        organizationId,
        category: "other",
        bytes: avatar.size,
        fileCount: 1,
        metadata: {
          source: "profile_avatar",
          user_id: user.id,
          object_key: objectKey,
          content_type: avatar.type,
        },
      });
    } catch (error) {
      await deleteR2Object(configResult.config, objectKey).catch(() => null);
      return NextResponse.json({
        error: error instanceof Error ? error.message : "Nao foi possivel registrar uso de armazenamento.",
      }, { status: 500 });
    }
  }

  const nextMetadata = {
    ...(user.user_metadata ?? {}),
    avatar_url: avatarUrl,
    avatar_source: "manual_upload",
    avatar_synced_at: uploadedAt,
    avatar_storage: {
      provider: "cloudflare-r2",
      key: objectKey,
      content_type: avatar.type,
      size: avatar.size,
      uploaded_at: uploadedAt,
    },
  };

  const { error: updateError } = await supabase.auth.updateUser({
    data: nextMetadata,
  });

  if (updateError) {
    await deleteR2Object(configResult.config, objectKey).catch(() => null);
    if (organizationId) {
      await releaseOrganizationStorageUsage({
        client: serviceClient,
        organizationId,
        category: "other",
        bytes: avatar.size,
        fileCount: 1,
        metadata: {
          source: "profile_avatar_update_failed",
          user_id: user.id,
          object_key: objectKey,
        },
      }).catch(() => null);
    }

    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (organizationId && previousAvatarStorage?.key && previousAvatarStorage.key !== objectKey) {
    await deletePreviousAvatarObject({
      config: configResult.config,
      objectKey: previousAvatarStorage.key,
      organizationId,
      serviceClient,
      sizeBytes: previousAvatarStorage.size,
      userId: user.id,
    }).catch(() => null);
  }

  await serviceClient.from("maintenance_audit_logs").insert({
    actor_id: user.id,
    event_type: "profile.avatar_uploaded",
    target_table: "profiles",
    target_id: user.id,
    metadata: {
      objectKey,
      size: avatar.size,
      contentType: avatar.type,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/empresa");
  revalidatePath("/dashboard/agentes");
  revalidatePath("/dashboard/whatsapp");

  return NextResponse.json({ avatarUrl });
}

async function loadPrimaryOrganizationId(client: ReturnType<typeof createServiceClient>, userId: string) {
  const { data } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ organization_id: string | null }>();

  return data?.organization_id ?? null;
}

async function deletePreviousAvatarObject(input: {
  config: R2Config;
  objectKey: string;
  organizationId: string;
  serviceClient: ReturnType<typeof createServiceClient>;
  sizeBytes: number;
  userId: string;
}) {
  const safePrefix = `profiles/avatars/${input.userId}/`;

  if (!input.objectKey.startsWith(safePrefix)) {
    return;
  }

  await deleteR2Object(input.config, input.objectKey);
  await releaseOrganizationStorageUsage({
    client: input.serviceClient,
    organizationId: input.organizationId,
    category: "other",
    bytes: input.sizeBytes,
    fileCount: 1,
    metadata: {
      source: "profile_avatar_replaced",
      user_id: input.userId,
      object_key: input.objectKey,
    },
  });
}

function readAvatarStorage(metadata: unknown) {
  const storage = readRecord(readRecord(metadata).avatar_storage);
  const provider = readString(storage.provider);
  const key = readString(storage.key);
  const size = readNumber(storage.size);

  if (provider !== "cloudflare-r2" || !key) {
    return null;
  }

  return {
    key,
    size: size ?? 0,
  };
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
