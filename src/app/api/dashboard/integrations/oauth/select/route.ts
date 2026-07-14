import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  deleteOAuthCredentials,
  logIntegrationAction,
  normalizeGoogleCustomerId,
  normalizeMetaAdAccountId,
  saveOAuthCredentials,
  upsertGuidedOAuthConnection,
  type GuidedOAuthProviderId,
} from "@/lib/client-os/guided-oauth";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type IntegrationRow = {
  id: string;
  organization_id: string;
  provider_id: GuidedOAuthProviderId;
  scopes: string[] | null;
  metadata: JsonRecord | null;
};

type Option = {
  id: string;
  label: string;
  parentId?: string | null;
};

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson(request);
  const companyId = readString(body?.companyId);
  const providerId = normalizeProviderId(readString(body?.providerId));
  const selection = readRecord(body?.selection);

  if (!companyId || !providerId) {
    return NextResponse.json({ error: "Informe empresa e provedor." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });

    if (!["owner", "admin"].includes(company.role)) {
      return NextResponse.json({ error: "Somente dono ou admin da empresa pode alterar a conta selecionada." }, { status: 403 });
    }

    const { data: integration, error: integrationError } = await client
      .from("organization_integrations")
      .select("id, organization_id, provider_id, scopes, metadata")
      .eq("organization_id", company.id)
      .eq("provider_id", providerId)
      .maybeSingle<IntegrationRow>();

    if (integrationError) {
      throw new Error(integrationError.message);
    }

    if (!integration) {
      return NextResponse.json({ error: "Conecte esta integracao antes de selecionar contas." }, { status: 404 });
    }

    const metadata = readRecord(integration.metadata);
    const result = providerId === "google-growth"
      ? await saveGoogleSelection({
          actorId: workspace.user.id,
          client,
          companyId: company.id,
          companyName: company.name,
          integration,
          metadata,
          selection,
        })
      : await saveMetaSelection({
          actorId: workspace.user.id,
          client,
          companyId: company.id,
          companyName: company.name,
          integration,
          metadata,
          selection,
        });

    return NextResponse.json({ connection: result.connection });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel salvar a selecao.",
    }, { status: 400 });
  }
}

async function saveGoogleSelection(input: {
  actorId: string;
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  companyName: string;
  integration: IntegrationRow;
  metadata: JsonRecord;
  selection: JsonRecord;
}) {
  const customerId = normalizeGoogleCustomerId(readString(input.selection.customerId));
  const accessibleCustomers = readStringArray(input.metadata.accessible_customers).map((item) => normalizeGoogleCustomerId(item)).filter(Boolean);

  if (!customerId) {
    throw new Error("Escolha uma conta Google Ads.");
  }

  if (accessibleCustomers.length > 0 && !accessibleCustomers.includes(customerId)) {
    throw new Error("Esta conta Google Ads nao esta na lista autorizada pelo OAuth.");
  }

  const savedCredentials = await saveOAuthCredentials({
    client: input.client,
    organizationId: input.companyId,
    actorId: input.actorId,
    credentials: [
      {
        integrationId: "google-ads",
        envName: "GOOGLE_ADS_CUSTOMER_ID",
        label: "Google Ads Customer ID",
        kind: "identifier",
        requirement: "recommended",
        value: customerId,
      },
    ],
  });
  const now = new Date().toISOString();
  const nextMetadata = {
    ...input.metadata,
    selected_customer_id: customerId,
    credential_envs: mergeUnique(readStringArray(input.metadata.credential_envs), savedCredentials),
    selection_updated_at: now,
  };
  const accountLabel = `Google Ads ${customerId}`;
  const integrationId = await upsertGuidedOAuthConnection({
    client: input.client,
    organizationId: input.companyId,
    providerId: "google-growth",
    status: "connected",
    label: "Google conectado",
    externalAccountId: customerId,
    externalAccountLabel: accountLabel,
    scopes: input.integration.scopes ?? [],
    actorId: input.actorId,
    metadata: nextMetadata,
  });

  await logIntegrationAction({
    client: input.client,
    organizationId: input.companyId,
    organizationIntegrationId: integrationId,
    providerId: "google-growth",
    actorId: input.actorId,
    action: "oauth.selection.updated",
    metadata: { selected_customer_id: customerId, credential_envs: savedCredentials },
  });

  return {
    connection: buildConnection({
      providerId: "google-growth",
      companyId: input.companyId,
      companyName: input.companyName,
      label: "Google conectado",
      accountLabel,
      detail: `Conta selecionada em ${formatDateTime(now)}`,
      metadata: nextMetadata,
      lastSyncAt: now,
    }),
  };
}

async function saveMetaSelection(input: {
  actorId: string;
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  companyName: string;
  integration: IntegrationRow;
  metadata: JsonRecord;
  selection: JsonRecord;
}) {
  const adAccountOptions = readOptionArray(input.metadata.ad_accounts).map((option) => ({ ...option, id: normalizeMetaAdAccountId(option.id) }));
  const pageOptions = readOptionArray(input.metadata.facebook_pages);
  const instagramOptions = readOptionArray(input.metadata.instagram_accounts);
  const adAccountId = normalizeMetaAdAccountId(readString(input.selection.adAccountId));
  const pageId = readString(input.selection.pageId) ?? "";
  const instagramBusinessId = readString(input.selection.instagramBusinessId) ?? "";

  if (adAccountOptions.length > 0 && !adAccountId) {
    throw new Error("Escolha uma conta de anuncios Meta.");
  }

  assertKnownOption(adAccountId, adAccountOptions, "conta de anuncios Meta");
  assertKnownOption(pageId, pageOptions, "pagina Facebook");
  assertKnownOption(instagramBusinessId, instagramOptions, "Instagram Business");

  const credentials = [
    {
      integrationId: "meta" as const,
      envName: "META_AD_ACCOUNT_ID",
      label: "Meta Ad Account ID",
      kind: "identifier" as const,
      requirement: "recommended" as const,
      value: adAccountId,
    },
    {
      integrationId: "meta" as const,
      envName: "FACEBOOK_PAGE_ID",
      label: "Facebook Page ID",
      kind: "identifier" as const,
      requirement: "optional" as const,
      value: pageId,
    },
    {
      integrationId: "meta" as const,
      envName: "INSTAGRAM_BUSINESS_ACCOUNT_ID",
      label: "Instagram Business ID",
      kind: "identifier" as const,
      requirement: "optional" as const,
      value: instagramBusinessId,
    },
  ];
  const savedCredentials = await saveOAuthCredentials({
    client: input.client,
    organizationId: input.companyId,
    actorId: input.actorId,
    credentials,
  });
  const envsToDelete = [
    pageId ? "" : "FACEBOOK_PAGE_ID",
    instagramBusinessId ? "" : "INSTAGRAM_BUSINESS_ACCOUNT_ID",
  ].filter(Boolean);

  await deleteOAuthCredentials({
    client: input.client,
    organizationId: input.companyId,
    integrationId: "meta",
    envNames: envsToDelete,
  });

  const now = new Date().toISOString();
  const accountLabel = findOptionLabel(adAccountId, adAccountOptions)
    || findOptionLabel(pageId, pageOptions)
    || findOptionLabel(instagramBusinessId, instagramOptions)
    || "Meta conectado";
  const nextMetadata = {
    ...input.metadata,
    ad_account_id: adAccountId || null,
    facebook_page_id: pageId || null,
    instagram_business_id: instagramBusinessId || null,
    selected_ad_account_id: adAccountId || null,
    selected_facebook_page_id: pageId || null,
    selected_instagram_business_id: instagramBusinessId || null,
    credential_envs: mergeUnique(readStringArray(input.metadata.credential_envs), savedCredentials).filter((envName) => !envsToDelete.includes(envName)),
    selection_updated_at: now,
  };
  const integrationId = await upsertGuidedOAuthConnection({
    client: input.client,
    organizationId: input.companyId,
    providerId: "meta-ads",
    status: "connected",
    label: "Meta conectado",
    externalAccountId: adAccountId || pageId || instagramBusinessId || null,
    externalAccountLabel: accountLabel,
    scopes: input.integration.scopes ?? [],
    actorId: input.actorId,
    metadata: nextMetadata,
  });

  await logIntegrationAction({
    client: input.client,
    organizationId: input.companyId,
    organizationIntegrationId: integrationId,
    providerId: "meta-ads",
    actorId: input.actorId,
    action: "oauth.selection.updated",
    metadata: {
      selected_ad_account_id: adAccountId || null,
      selected_facebook_page_id: pageId || null,
      selected_instagram_business_id: instagramBusinessId || null,
      credential_envs: savedCredentials,
      deleted_envs: envsToDelete,
    },
  });

  return {
    connection: buildConnection({
      providerId: "meta-ads",
      companyId: input.companyId,
      companyName: input.companyName,
      label: "Meta conectado",
      accountLabel,
      detail: `Conta selecionada em ${formatDateTime(now)}`,
      metadata: nextMetadata,
      lastSyncAt: now,
    }),
  };
}

function buildConnection(input: {
  providerId: GuidedOAuthProviderId;
  companyId: string;
  companyName: string;
  label: string;
  accountLabel: string;
  detail: string;
  metadata: JsonRecord;
  lastSyncAt: string;
}) {
  return {
    providerId: input.providerId,
    companyId: input.companyId,
    companyName: input.companyName,
    status: "connected",
    label: input.label,
    detail: input.detail,
    accountLabel: input.accountLabel,
    lastSyncAt: input.lastSyncAt,
    lastError: null,
    managementHref: null,
    metadata: input.metadata,
  };
}

async function readJson(request: NextRequest): Promise<JsonRecord | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  } catch {
    return null;
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function readOptionArray(value: unknown): Option[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as JsonRecord;
    const id = readString(record.id);

    if (!id) {
      return [];
    }

    return [{
      id,
      label: readString(record.label) ?? id,
      parentId: readString(record.parentId),
    }];
  });
}

function assertKnownOption(value: string, options: Option[], label: string) {
  if (!value || options.length === 0) {
    return;
  }

  if (!options.some((option) => option.id === value)) {
    throw new Error(`A ${label} selecionada nao esta na lista autorizada pelo OAuth.`);
  }
}

function findOptionLabel(value: string, options: Option[]) {
  if (!value) {
    return null;
  }

  return options.find((option) => option.id === value)?.label ?? null;
}

function mergeUnique(left: string[], right: string[]) {
  return Array.from(new Set([...left, ...right].filter(Boolean)));
}

function normalizeProviderId(value: string | null): GuidedOAuthProviderId | null {
  if (value === "meta-ads" || value === "google-growth") {
    return value;
  }

  return null;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
