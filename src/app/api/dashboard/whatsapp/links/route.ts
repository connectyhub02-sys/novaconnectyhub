import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
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
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson<{
    companyId?: unknown;
    label?: unknown;
    url?: unknown;
  }>(request);

  const companyId = typeof body?.companyId === "string" ? body.companyId.trim() : "";
  const label = normalizeLabel(typeof body?.label === "string" ? body.label : "");

  if (!companyId) {
    return NextResponse.json({ error: "Escolha uma empresa antes de criar o link." }, { status: 422 });
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
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    const slug = createTrackedLinkSlug(label);

    const { data, error } = await client
      .from("intelligence_memory")
      .insert({
        scope: "organization",
        organization_id: company.id,
        memory_type: "tracked_link_button",
        title: label,
        content: url,
        importance: 0.68,
        tags: ["tracked_link_button", "whatsapp_agent", "lead_tracking"],
        metadata: {
          label,
          url,
          slug,
          click_count: 0,
          created_by: workspace.user.id,
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
      created_by: workspace.user.id,
    };

    const { error: updateError } = await client
      .from("intelligence_memory")
      .update({ metadata })
      .eq("id", data.id);

    if (updateError) {
      return NextResponse.json({ error: `Link criado, mas a tag nao foi salva: ${updateError.message}` }, { status: 500 });
    }

    await client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: company.id,
      source_type: "tracked_link_button",
      source_id: data.id,
      event_type: "tracked_link.created",
      title: `Link rastreado criado: ${label}`,
      summary: `Tag ${tag} criada para uso no prompt do agente WhatsApp.`,
      confidence: 1,
      visibility: "organization",
      tags: ["tracked_link_button", "whatsapp_agent", "lead_tracking"],
      payload: {
        label,
        url,
        tag,
        tracking_url: trackingUrl,
        created_by: workspace.user.id,
      },
    });

    revalidatePath("/dashboard/whatsapp");

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

export async function DELETE(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson<{
    companyId?: unknown;
    linkButtonId?: unknown;
  }>(request);

  const companyId = typeof body?.companyId === "string" ? body.companyId.trim() : "";
  const linkButtonId = typeof body?.linkButtonId === "string" ? body.linkButtonId.trim() : "";

  if (!companyId) {
    return NextResponse.json({ error: "Escolha uma empresa antes de excluir o link." }, { status: 422 });
  }

  if (!linkButtonId) {
    return NextResponse.json({ error: "Informe o link rastreado para excluir." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });

    const { data: deleted, error } = await client
      .from("intelligence_memory")
      .delete()
      .eq("id", linkButtonId)
      .eq("scope", "organization")
      .eq("organization_id", company.id)
      .eq("memory_type", "tracked_link_button")
      .select("id, title, content, metadata, created_at")
      .maybeSingle<LinkMemoryRow>();

    if (error) {
      return NextResponse.json({ error: `Nao foi possivel excluir o link: ${error.message}` }, { status: 500 });
    }

    if (!deleted) {
      return NextResponse.json({ error: "Link rastreado nao encontrado para esta empresa." }, { status: 404 });
    }

    const metadata = readRecord(deleted.metadata) ?? {};
    await client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: company.id,
      source_type: "tracked_link_button",
      source_id: deleted.id,
      event_type: "tracked_link.deleted",
      title: `Link rastreado excluido: ${deleted.title}`,
      summary: `Tag ${readString(metadata.tag) ?? deleted.id} removida do agente WhatsApp.`,
      confidence: 1,
      visibility: "organization",
      tags: ["tracked_link_button", "whatsapp_agent", "lead_tracking"],
      payload: {
        label: readString(metadata.label) ?? deleted.title,
        url: readString(metadata.url) ?? deleted.content,
        tag: readString(metadata.tag),
        deleted_by: workspace.user.id,
      },
    });

    revalidatePath("/dashboard/whatsapp");

    return NextResponse.json({ deletedLinkButtonId: deleted.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao excluir link rastreado." }, { status: 500 });
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

  if (label.length < 2) {
    return "";
  }

  return label;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
