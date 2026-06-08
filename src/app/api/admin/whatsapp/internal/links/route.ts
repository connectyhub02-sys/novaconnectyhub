import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformWhatsappSector } from "@/lib/admin/platform-whatsapp-console";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { buildTrackedLinkUrl, createTrackedLinkSlug, createTrackedLinkTag, normalizeHttpUrl } from "@/lib/tracking/tracked-links";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type LinkMemoryRow = {
  id: string;
  title: string;
  content: string;
  metadata: JsonRecord | null;
  created_at: string | null;
};

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await readJson<{
    sectorId?: unknown;
    label?: unknown;
    url?: unknown;
  }>(request);

  const sectorId = typeof body?.sectorId === "string" ? body.sectorId.trim() : "";
  const label = normalizeLabel(typeof body?.label === "string" ? body.label : "");

  if (!sectorId) {
    return NextResponse.json({ error: "Escolha um setor antes de criar o link." }, { status: 422 });
  }

  if (!label) {
    return NextResponse.json({ error: "Informe o nome do botao." }, { status: 422 });
  }

  let url: string;

  try {
    url = normalizeHttpUrl(typeof body?.url === "string" ? body.url : "");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Informe uma URL valida." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const sector = await requirePlatformWhatsappSector(client, sectorId);
    const slug = createTrackedLinkSlug(label);

    const { data, error } = await client
      .from("intelligence_memory")
      .insert({
        scope: "platform",
        organization_id: null,
        memory_type: "tracked_link_button",
        title: label,
        content: url,
        importance: 0.7,
        tags: ["tracked_link_button", "platform_whatsapp_sector", "whatsapp_agent", "lead_tracking"],
        metadata: {
          admin_whatsapp: true,
          sector_id: sector.id,
          sector_code: sector.sector_code,
          sector_name: sector.name,
          label,
          url,
          slug,
          click_count: 0,
          created_by: auth.userId,
        },
      })
      .select("id, title, content, metadata, created_at")
      .single<LinkMemoryRow>();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Nao foi possivel criar o link." }, { status: 500 });
    }

    const tag = createTrackedLinkTag(label, data.id);
    const trackingUrl = buildTrackedLinkUrl(data.id);
    const metadata = {
      ...(readRecord(data.metadata) ?? {}),
      label,
      url,
      slug,
      tag,
      tracking_url: trackingUrl,
      click_count: 0,
      created_by: auth.userId,
    };

    const { error: updateError } = await client
      .from("intelligence_memory")
      .update({ metadata })
      .eq("id", data.id);

    if (updateError) {
      return NextResponse.json({ error: `Link criado, mas a tag nao foi salva: ${updateError.message}` }, { status: 500 });
    }

    await client.from("intelligence_events").insert({
      scope: "platform",
      organization_id: null,
      source_type: "tracked_link_button",
      source_id: data.id,
      event_type: "tracked_link.created",
      title: `Link rastreado interno criado: ${label}`,
      summary: `Tag ${tag} criada para uso no prompt do agente WhatsApp do setor ${sector.name}.`,
      confidence: 1,
      visibility: "platform",
      tags: ["tracked_link_button", "platform_whatsapp_sector", "whatsapp_agent", "lead_tracking"],
      payload: {
        sectorId: sector.id,
        sectorCode: sector.sector_code,
        label,
        url,
        tag,
        tracking_url: trackingUrl,
        created_by: auth.userId,
      },
    });

    revalidatePath("/admin/whatsapp/atendimento");

    return NextResponse.json({
      linkButton: {
        id: data.id,
        label,
        url,
        tag,
        trackingUrl,
        clicks: 0,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao criar link rastreado." }, { status: 500 });
  }
}

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function normalizeLabel(value: string) {
  const label = value.trim().replace(/\s+/g, " ").slice(0, 48);
  return label.length >= 2 ? label : "";
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}
