import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  assertAccountComplete,
  formatAccountCompletionError,
  statusForAccountCompletionError,
} from "@/lib/account/signup-completion";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import { assertStorageUploadAllowed, recordOrganizationStorageUsage } from "@/lib/storage/quotas";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

const maxLogoBytes = 4 * 1024 * 1024;
const allowedLogoMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const companyId = readString(formData?.get("companyId"));
  const logo = formData?.get("logo");

  if (!companyId) {
    return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
  }

  if (!(logo instanceof File)) {
    return NextResponse.json({ error: "Envie uma imagem no campo logo." }, { status: 400 });
  }

  const extension = allowedLogoMimeTypes.get(logo.type);

  if (!extension) {
    return NextResponse.json({ error: "Use uma imagem JPG, PNG ou WEBP." }, { status: 400 });
  }

  if (logo.size <= 0 || logo.size > maxLogoBytes) {
    return NextResponse.json({ error: "O logotipo precisa ter ate 4 MB." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    await assertAccountComplete({ userId: workspace.user.id, client });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });

    await assertStorageUploadAllowed({
      client,
      organizationId: company.id,
      category: "other",
      files: [{
        fileName: logo.name,
        contentType: logo.type,
        sizeBytes: logo.size,
      }],
    });

    const configResult = await loadR2Config(client);

    if (!configResult.ok) {
      return NextResponse.json({ error: configResult.error }, { status: 503 });
    }

    const bytes = new Uint8Array(await logo.arrayBuffer());
    const objectKey = `organizations/${company.id}/branding/${Date.now()}-${randomUUID()}.${extension}`;
    const uploadResult = await putR2Object(configResult.config, objectKey, bytes, logo.type);

    if (!uploadResult.ok) {
      return NextResponse.json({ error: uploadResult.error }, { status: 502 });
    }

    const { data: organizationRow, error: organizationError } = await client
      .from("organizations")
      .select("metadata")
      .eq("id", company.id)
      .maybeSingle<{ metadata: JsonRecord | null }>();

    if (organizationError) {
      return NextResponse.json({ error: organizationError.message }, { status: 500 });
    }

    const uploadedAt = new Date().toISOString();
    const metadata = {
      ...readRecord(organizationRow?.metadata),
      brand_logo_url: uploadResult.publicUrl,
      brand_logo_alt: company.name,
      brand_logo_storage: {
        provider: "cloudflare-r2",
        key: objectKey,
        content_type: logo.type,
        size: logo.size,
        uploaded_at: uploadedAt,
      },
      public_branding_updated_at: uploadedAt,
      public_branding_updated_by: workspace.user.id,
    };
    const { data: updatedOrganization, error: updateError } = await client
      .from("organizations")
      .update({ metadata, updated_at: uploadedAt })
      .eq("id", company.id)
      .eq("owner_id", workspace.user.id)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (updateError || !updatedOrganization) {
      return NextResponse.json({
        error: updateError?.message ?? "Somente o dono da empresa pode alterar o logotipo.",
      }, { status: updateError ? 500 : 403 });
    }

    await recordOrganizationStorageUsage({
      client,
      organizationId: company.id,
      category: "other",
      bytes: uploadResult.bytesSize,
      metadata: {
        object_key: objectKey,
        content_type: logo.type,
        source: "organization_brand_logo",
      },
    });

    await client.from("maintenance_audit_logs").insert({
      actor_id: workspace.user.id,
      event_type: "organization.brand_logo_uploaded",
      target_table: "organizations",
      target_id: company.id,
      metadata: {
        objectKey,
        size: logo.size,
        contentType: logo.type,
      },
    });

    revalidatePath("/dashboard/empresa");
    revalidatePath("/produto/[productId]", "page");
    revalidatePath("/checkout/[sessionId]", "page");

    return NextResponse.json({
      company: {
        ...company,
        brandLogoUrl: uploadResult.publicUrl,
        brandLogoAlt: company.name,
      },
    });
  } catch (error) {
    return NextResponse.json(formatAccountCompletionError(error), { status: statusForAccountCompletionError(error, 400) });
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
