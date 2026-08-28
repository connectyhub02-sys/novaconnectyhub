import { NextResponse, type NextRequest } from "next/server";
import { validatePublicWriteRequest, type PublicWriteGuardResult } from "@/lib/security/public-request-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveLeadTrackingContext } from "@/lib/tracking/lead-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
};

type LeadRow = {
  id: string;
  organization_id: string;
  channel: string;
  phone_number: string | null;
  display_name: string | null;
  source: string | null;
  metadata: JsonRecord | null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ storeSlug: string }> },
) {
  const guard = validatePublicWriteRequest({
    headers: request.headers,
    requestUrl: request.url,
    routeKey: "sales-catalog-store-newsletter",
    maxPayloadBytes: 12 * 1024,
    rateLimit: {
      limit: 8,
      windowMs: 60_000,
    },
  });

  if (!guard.ok) {
    return publicGuardResponse(guard);
  }

  const { storeSlug } = await context.params;
  const body = readRecord(await request.json().catch(() => null));
  const email = normalizeEmail(readString(body.email));

  if (!email) {
    return NextResponse.json({ error: "Informe um email valido." }, { status: 422 });
  }

  const client = createServiceClient();
  const organization = await loadOrganizationBySlug(client, storeSlug);

  if (!organization) {
    return NextResponse.json({ error: "Loja nao encontrada." }, { status: 404 });
  }

  const requestedLeadPhone = normalizePhone(readString(body.leadPhone));
  const leadContext = await resolveLeadTrackingContext(client, {
    organizationId: organization.id,
    leadId: readString(body.leadId),
    conversationId: readString(body.conversationId),
    leadPhone: requestedLeadPhone,
  });
  const leadPhone = leadContext.leadPhone ?? requestedLeadPhone;
  const now = new Date().toISOString();
  let savedLead: LeadRow | null = null;

  try {
    savedLead = leadContext.leadId
      ? await updateLeadNewsletterEmail(client, {
        organizationId: organization.id,
        leadId: leadContext.leadId,
        email,
        leadPhone,
        now,
      })
      : await createNewsletterLead(client, {
        organizationId: organization.id,
        organizationName: organization.name,
        email,
        leadPhone,
        now,
      });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel salvar o cadastro.",
    }, { status: 500 });
  }

  await client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: organization.id,
    source_type: "lead",
    source_id: savedLead?.id ?? leadContext.leadId ?? null,
    event_type: "sales_catalog.store_newsletter_subscribed",
    title: "Lead cadastrado na loja publica",
    summary: `Lead deixou email na loja publica da ${organization.name}.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "storefront", "newsletter", "lead_tracking"],
    payload: {
      lead_id: savedLead?.id ?? leadContext.leadId ?? null,
      lead_phone: leadPhone,
      email,
      conversation_id: leadContext.conversationId,
      tracking_link_id: normalizeUuid(readString(body.trackingLinkId)),
      source: "sales_catalog_store_newsletter",
    },
  });

  return NextResponse.json({
    ok: true,
    leadId: savedLead?.id ?? leadContext.leadId ?? null,
    message: "Cadastro salvo no CRM da loja.",
  });
}

async function updateLeadNewsletterEmail(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    leadId: string;
    email: string;
    leadPhone: string | null;
    now: string;
  },
): Promise<LeadRow> {
  const { data: existing } = await client
    .from("leads")
    .select("id, organization_id, channel, phone_number, display_name, source, metadata")
    .eq("id", input.leadId)
    .eq("organization_id", input.organizationId)
    .maybeSingle<LeadRow>();

  if (!existing) {
    return createNewsletterLead(client, {
      organizationId: input.organizationId,
      organizationName: null,
      email: input.email,
      leadPhone: input.leadPhone,
      now: input.now,
    });
  }

  const metadata = buildNewsletterMetadata(existing.metadata, input);
  const updatePayload: JsonRecord = {
    status: "active",
    last_event_summary: "Lead deixou email na loja publica.",
    metadata,
    updated_at: input.now,
  };

  if (!existing.source) {
    updatePayload.source = "sales_catalog_store_newsletter";
  }

  const { data, error } = await client
    .from("leads")
    .update(updatePayload)
    .eq("id", existing.id)
    .eq("organization_id", input.organizationId)
    .select("id, organization_id, channel, phone_number, display_name, source, metadata")
    .single<LeadRow>();

  if (error) {
    throw new Error(`Nao foi possivel salvar o email no CRM: ${error.message}`);
  }

  return data;
}

async function createNewsletterLead(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    organizationName: string | null;
    email: string;
    leadPhone: string | null;
    now: string;
  },
): Promise<LeadRow> {
  const metadata = buildNewsletterMetadata(null, {
    organizationId: input.organizationId,
    leadId: null,
    email: input.email,
    leadPhone: input.leadPhone,
    now: input.now,
  });

  if (input.leadPhone) {
    const { data: existing } = await client
      .from("leads")
      .select("id, organization_id, channel, phone_number, display_name, source, metadata")
      .eq("organization_id", input.organizationId)
      .eq("channel", "whatsapp")
      .eq("phone_number", input.leadPhone)
      .maybeSingle<LeadRow>();

    if (existing) {
      return updateLeadNewsletterEmail(client, {
        organizationId: input.organizationId,
        leadId: existing.id,
        email: input.email,
        leadPhone: input.leadPhone,
        now: input.now,
      });
    }
  }

  const { data, error } = await client
    .from("leads")
    .insert({
      organization_id: input.organizationId,
      channel: input.leadPhone ? "whatsapp" : "storefront",
      phone_number: input.leadPhone,
      display_name: "Lead da loja",
      status: "active",
      source: "sales_catalog_store_newsletter",
      last_event_summary: "Lead deixou contato na loja publica.",
      metadata: {
        ...metadata,
        organization_name: input.organizationName,
      },
      created_at: input.now,
      updated_at: input.now,
    })
    .select("id, organization_id, channel, phone_number, display_name, source, metadata")
    .single<LeadRow>();

  if (error) {
    throw new Error(`Nao foi possivel criar o lead no CRM: ${error.message}`);
  }

  return data;
}

function buildNewsletterMetadata(
  current: JsonRecord | null,
  input: {
    organizationId: string;
    leadId: string | null;
    email: string;
    leadPhone: string | null;
    now: string;
  },
) {
  return {
    ...(current ?? {}),
    email: input.email,
    customer_email: input.email,
    lead_email: input.email,
    phone: input.leadPhone ?? readString(current?.phone) ?? null,
    storefront_newsletter: {
      subscribed: true,
      subscribed_at: input.now,
      source: "sales_catalog_store_newsletter",
    },
    last_source: "sales_catalog_store_newsletter",
  };
}

async function loadOrganizationBySlug(
  client: ReturnType<typeof createServiceClient>,
  storeSlug: string,
) {
  const decoded = decodeURIComponent(storeSlug).trim();
  const query = client
    .from("organizations")
    .select("id, name, slug");

  const { data } = normalizeUuid(decoded)
    ? await query.eq("id", decoded).maybeSingle<OrganizationRow>()
    : await query.eq("slug", decoded).maybeSingle<OrganizationRow>();

  return data ?? null;
}

function publicGuardResponse(guard: PublicWriteGuardResult) {
  if (guard.ok) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: guard.message },
    {
      status: guard.status,
      headers: guard.retryAfterSeconds ? { "Retry-After": String(guard.retryAfterSeconds) } : undefined,
    },
  );
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

function normalizeEmail(value: string | null) {
  const normalized = value?.trim().toLowerCase().slice(0, 160);

  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function normalizeUuid(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function normalizePhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";

  return digits.length >= 8 ? digits.slice(0, 18) : null;
}
