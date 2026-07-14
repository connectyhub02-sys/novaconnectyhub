import { createHash, createHmac } from "node:crypto";
import { Inngest } from "inngest";
import { NextResponse } from "next/server";
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import { maintenanceIntegrations, type CredentialDefinition } from "@/lib/maintenance-vault";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CredentialRow = {
  env_name: string;
  encrypted_value: string;
  value_preview: string;
};

type CredentialBag = Map<string, string>;

type ConnectionTestResult = {
  status: "online" | "offline";
  message: string;
  checkedAt: string;
  httpStatus?: number;
  instanceCount?: number | null;
  model?: string;
  details?: string[];
};

const defaultGeminiModel = "gemini-2.5-flash";
const googleAdsApiVersion = "v24";

export async function POST(
  _request: Request,
  context: { params: Promise<{ integrationId: string }> },
) {
  const { integrationId } = await context.params;
  const integration = maintenanceIntegrations.find((item) => item.id === integrationId);

  if (!integration) {
    return NextResponse.json(
      { status: "offline", message: "Integracao nao encontrada no catalogo da sala de manutencao.", checkedAt: new Date().toISOString() },
      { status: 404 },
    );
  }

  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
    return NextResponse.json(
      { status: "offline", message: "CREDENTIAL_ENCRYPTION_KEY nao configurada. Nao e possivel ler o cofre.", checkedAt: new Date().toISOString() },
      { status: 503 },
    );
  }

  const credentialResult = await loadCredentialBag(auth.supabase, integration.id, integration.fields);

  if (!credentialResult.ok) {
    return NextResponse.json(
      { status: "offline", message: credentialResult.error, checkedAt: new Date().toISOString() },
      { status: 500 },
    );
  }

  const result = await testIntegration(integration.id, credentialResult.credentials);

  await auth.supabase.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "integration.connection_tested",
    target_table: "integration_credentials",
    target_id: null,
    metadata: {
      integrationId: integration.id,
      status: result.status,
      httpStatus: result.httpStatus,
      details: result.details,
    },
  });

  return NextResponse.json(result, { status: result.status === "online" ? 200 : 502 });
}

async function requirePlatformAdmin() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Supabase Auth nao configurado." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle<{ is_platform_admin: boolean | null }>();

  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: "Apenas administradores podem testar credenciais da plataforma." }, { status: 403 });
  }

  return { supabase, userId: user.id };
}

async function loadCredentialBag(
  supabase: Awaited<ReturnType<typeof createClient>>,
  integrationId: string,
  fields: CredentialDefinition[],
) {
  const envNames = fields.flatMap((field) => [field.env, ...(field.aliases ?? [])]);
  const { data, error } = await supabase
    .from("integration_credentials")
    .select("env_name, encrypted_value, value_preview")
    .eq("scope", "platform")
    .eq("integration_id", integrationId)
    .is("organization_id", null)
    .in("env_name", envNames)
    .order("updated_at", { ascending: false });

  if (error) {
    return { ok: false as const, error: error.message };
  }

  const credentials = new Map<string, string>();

  for (const credential of (data ?? []) as CredentialRow[]) {
    if (credentials.has(credential.env_name)) {
      continue;
    }

    credentials.set(credential.env_name, decryptStoredCredential(credential));
  }

  for (const envName of envNames) {
    const fallback = process.env[envName];

    if (fallback && !credentials.has(envName)) {
      credentials.set(envName, fallback);
    }
  }

  return { ok: true as const, credentials };
}

function decryptStoredCredential(credential: CredentialRow) {
  try {
    return decryptCredentialValue(credential.encrypted_value);
  } catch {
    return credential.value_preview;
  }
}

async function testIntegration(integrationId: string, credentials: CredentialBag): Promise<ConnectionTestResult> {
  switch (integrationId) {
    case "uazapi":
      return testUazapi(credentials);
    case "gemini":
      return testGemini(credentials);
    case "elevenlabs":
      return testElevenLabs(credentials);
    case "meta":
      return testMeta(credentials);
    case "google-ads":
      return testGoogleAds(credentials);
    case "supabase":
      return testSupabase(credentials);
    case "r2":
      return testR2(credentials);
    case "inngest":
      return testInngest(credentials);
    case "push":
      return testVapid(credentials);
    case "payments":
      return testStripe(credentials);
    case "mercado-pago":
      return testMercadoPago(credentials);
    default:
      return testConfiguredCredentials(credentials);
  }
}

async function testUazapi(credentials: CredentialBag): Promise<ConnectionTestResult> {
  const baseUrl = normalizeBaseUrl(getCredential(credentials, ["UAZAPI_BASE_URL", "UAZAPI_ACCOUNT_EMAIL"]));
  const adminToken = getCredential(credentials, ["UAZAPI_ADMIN_TOKEN"]);

  if (!baseUrl || !adminToken) {
    return offline("Preencha Server URL e Admin Token antes de testar.");
  }

  const result = await fetchJson(`${baseUrl}/instance/all`, {
    headers: { Accept: "application/json", admintoken: adminToken },
  });

  if (!result.ok) {
    return offline(
      result.httpStatus === 401 || result.httpStatus === 403
        ? "Uazapi respondeu, mas o Admin Token nao foi aceito."
        : `Uazapi respondeu com status ${result.httpStatus ?? "desconhecido"}.`,
      { httpStatus: result.httpStatus },
    );
  }

  return online("Uazapi online. Server URL e Admin Token validados.", {
    httpStatus: result.httpStatus,
    instanceCount: countInstances(result.data),
  });
}

async function testGemini(credentials: CredentialBag): Promise<ConnectionTestResult> {
  const apiKey = getCredential(credentials, ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY"]);
  const model = normalizeGeminiModel(getCredential(credentials, ["GEMINI_DEFAULT_MODEL"]) || defaultGeminiModel);

  if (!apiKey) {
    return offline("Preencha a Google Gemini API Key antes de testar.", { model });
  }

  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
  url.searchParams.set("key", apiKey);

  const result = await fetchJson(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Responda apenas: ok" }] }],
      generationConfig: { maxOutputTokens: 8, temperature: 0 },
    }),
  });

  if (!result.ok) {
    return offline(resolveGeminiErrorMessage(result.httpStatus, result.data), { httpStatus: result.httpStatus, model });
  }

  return online("Gemini online. API Key e modelo validados.", { httpStatus: result.httpStatus, model });
}

async function testElevenLabs(credentials: CredentialBag): Promise<ConnectionTestResult> {
  const apiKey = getCredential(credentials, ["ELEVENLABS_API_KEY"]);

  if (!apiKey) {
    return offline("Preencha a API key da ElevenLabs antes de testar.");
  }

  const result = await fetchJson("https://api.elevenlabs.io/v1/user", {
    headers: { Accept: "application/json", "xi-api-key": apiKey },
  });

  if (!result.ok) {
    return offline(
      result.httpStatus === 401 || result.httpStatus === 403
        ? "ElevenLabs respondeu, mas a API key nao foi aceita."
        : `ElevenLabs respondeu com status ${result.httpStatus ?? "desconhecido"}.`,
      { httpStatus: result.httpStatus },
    );
  }

  return online("ElevenLabs online. API key validada.", { httpStatus: result.httpStatus });
}

async function testMeta(credentials: CredentialBag): Promise<ConnectionTestResult> {
  const appId = getCredential(credentials, ["META_APP_ID"]);
  const appSecret = getCredential(credentials, ["META_APP_SECRET"]);
  const graphVersion = normalizeMetaGraphVersion(getCredential(credentials, ["META_GRAPH_API_VERSION"]));
  const loginConfigId = getCredential(credentials, ["META_LOGIN_CONFIG_ID"]);
  const enabledPermissions = getCredential(credentials, ["META_ENABLED_PERMISSIONS"]);
  const accessToken = getCredential(credentials, ["META_ACCESS_TOKEN"]);
  const adAccountId = normalizeMetaAdAccountId(getCredential(credentials, ["META_AD_ACCOUNT_ID"]));

  if (!appId || !appSecret) {
    return offline("Preencha Meta App ID e Meta App Secret do app oficial ConnectyHub antes de testar.");
  }

  const appAccessToken = `${appId}|${appSecret}`;
  const appUrl = new URL(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(appId)}`);
  appUrl.searchParams.set("fields", "id,name");
  appUrl.searchParams.set("access_token", appAccessToken);

  const appResult = await fetchJson(appUrl.toString(), { headers: { Accept: "application/json" } });

  if (!appResult.ok) {
    return offline(resolveProviderErrorMessage(appResult.data) || "Meta Graph API nao aceitou App ID e App Secret do app oficial.", {
      httpStatus: appResult.httpStatus,
    });
  }

  const details = [
    "App ID e App Secret validados com app access token.",
    loginConfigId ? "Login Configuration ID presente para o fluxo guiado." : "Login Configuration ID ainda nao informado.",
    enabledPermissions ? "Lista de permissoes Meta registrada no cofre." : "Lista de permissoes Meta ainda nao registrada.",
  ];

  if (!accessToken) {
    return online("Meta pronto para OAuth guiado. Token de cliente sera criado quando o usuario autorizar pelo painel.", {
      httpStatus: appResult.httpStatus,
      details,
    });
  }

  const url = new URL("https://graph.facebook.com/me");
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", accessToken);

  if (appSecret) {
    url.searchParams.set("appsecret_proof", createHmac("sha256", appSecret).update(accessToken).digest("hex"));
  }

  const result = await fetchJson(url.toString(), { headers: { Accept: "application/json" } });

  if (!result.ok) {
    return offline(resolveProviderErrorMessage(result.data) || "Meta Graph API nao aceitou o token informado.", { httpStatus: result.httpStatus });
  }

  details.push("Access token tecnico validado em /me.");

  if (adAccountId) {
    const accountUrl = new URL(`https://graph.facebook.com/${encodeURIComponent(adAccountId)}`);
    accountUrl.searchParams.set("fields", "id,name,account_status,currency");
    accountUrl.searchParams.set("access_token", accessToken);

    if (appSecret) {
      accountUrl.searchParams.set("appsecret_proof", createHmac("sha256", appSecret).update(accessToken).digest("hex"));
    }

    const accountResult = await fetchJson(accountUrl.toString(), { headers: { Accept: "application/json" } });

    if (!accountResult.ok) {
      return offline(resolveProviderErrorMessage(accountResult.data) || "Meta validou o token, mas nao conseguiu acessar a conta de anuncios informada.", {
        httpStatus: accountResult.httpStatus,
        details,
      });
    }

    details.push(`Conta de anuncios ${adAccountId} acessivel.`);
  } else {
    details.push("Ad Account ID ausente; leitura de conta de anuncios ainda nao foi testada.");
  }

  return online("Meta online. App oficial e token tecnico validados para leitura inicial.", { httpStatus: result.httpStatus, details });
}

async function testGoogleAds(credentials: CredentialBag): Promise<ConnectionTestResult> {
  const clientId = getCredential(credentials, ["GOOGLE_ADS_CLIENT_ID"]);
  const clientSecret = getCredential(credentials, ["GOOGLE_ADS_CLIENT_SECRET"]);
  const refreshToken = getCredential(credentials, ["GOOGLE_ADS_REFRESH_TOKEN"]);
  const developerToken = getCredential(credentials, ["GOOGLE_ADS_DEVELOPER_TOKEN"]);
  const redirectUri = getCredential(credentials, ["GOOGLE_OAUTH_REDIRECT_URI"]);
  const enabledScopes = getCredential(credentials, ["GOOGLE_ENABLED_SCOPES"]);
  const apiVersion = normalizeGoogleAdsApiVersion(getCredential(credentials, ["GOOGLE_ADS_API_VERSION"])) || googleAdsApiVersion;

  if (!clientId || !clientSecret || !developerToken) {
    return offline("Preencha Google Ads Developer Token, OAuth Client ID e OAuth Client Secret do app oficial ConnectyHub antes de testar.");
  }

  if (redirectUri && !isValidHttpUrl(redirectUri)) {
    return offline("OAuth Redirect URI do Google precisa ser uma URL http ou https valida.");
  }

  const details = [
    "Client ID, Client Secret e Developer Token estao presentes.",
    redirectUri ? "OAuth Redirect URI registrada no cofre." : "OAuth Redirect URI ainda nao registrada.",
    enabledScopes ? "Lista de scopes Google registrada no cofre." : "Lista de scopes Google ainda nao registrada.",
  ];

  if (!refreshToken) {
    return online("Google pronto para OAuth guiado. O refresh token sera criado por empresa quando o cliente autorizar pelo painel.", {
      details,
    });
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const result = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!result.ok) {
    return offline(resolveProviderErrorMessage(result.data) || "Google OAuth nao aceitou as credenciais informadas.", { httpStatus: result.httpStatus });
  }

  const accessToken = readAccessToken(result.data);

  if (!accessToken) {
    return offline("Google OAuth respondeu, mas nao retornou access_token para testar o Google Ads.", { httpStatus: result.httpStatus });
  }

  const customersResult = await fetchJson(`https://googleads.googleapis.com/${apiVersion}/customers:listAccessibleCustomers`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    },
  });

  if (!customersResult.ok) {
    return offline(resolveProviderErrorMessage(customersResult.data) || "Google Ads OAuth funcionou, mas o Developer token nao liberou listAccessibleCustomers.", {
      httpStatus: customersResult.httpStatus,
      details: [...details, "OAuth validado antes da chamada Google Ads."],
    });
  }

  const accessibleCustomers = readGoogleAdsAccessibleCustomers(customersResult.data);

  return online("Google Ads online. OAuth, Developer token e listagem de contas acessiveis validados.", {
    httpStatus: customersResult.httpStatus,
    details: [...details, `${accessibleCustomers.length} conta(s) acessivel(is) retornada(s).`],
  });
}

async function testSupabase(credentials: CredentialBag): Promise<ConnectionTestResult> {
  const projectUrl = normalizeBaseUrl(getCredential(credentials, ["NEXT_PUBLIC_SUPABASE_URL"]));
  const serviceRoleKey = getCredential(credentials, ["SUPABASE_SECRET_KEY"]);

  if (!projectUrl || !serviceRoleKey) {
    return offline("Preencha Project URL e Service role key do Supabase antes de testar.");
  }

  try {
    const supabase = createSupabaseServiceClient(projectUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error, count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (error) {
      return offline(`Supabase respondeu, mas a consulta administrativa falhou: ${error.message}`);
    }

    return online("Supabase online. URL e Service role key validadas.", {
      details: [`Profiles acessivel${typeof count === "number" ? `; ${count} registro(s) detectados.` : "."}`],
    });
  } catch {
    return offline("Nao foi possivel conectar ao Supabase com as credenciais informadas.");
  }
}

async function testR2(credentials: CredentialBag): Promise<ConnectionTestResult> {
  const accountId = getCredential(credentials, ["R2_ACCOUNT_ID"]);
  const endpoint = normalizeBaseUrl(getCredential(credentials, ["R2_ENDPOINT"]) || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : ""));
  const accessKeyId = getCredential(credentials, ["R2_ACCESS_KEY_ID"]);
  const secretAccessKey = getCredential(credentials, ["R2_SECRET_ACCESS_KEY"]);
  const bucket = getCredential(credentials, ["R2_BUCKET"]);

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    return offline("Preencha Endpoint, Access key ID, Secret access key e Bucket do Cloudflare R2 antes de testar.");
  }

  const result = await fetchSignedR2BucketList(endpoint, bucket, accessKeyId, secretAccessKey);

  if (!result.ok) {
    return offline(
      result.httpStatus === 401 || result.httpStatus === 403
        ? "Cloudflare R2 respondeu, mas as chaves nao foram aceitas para este bucket."
        : `Cloudflare R2 respondeu com status ${result.httpStatus ?? "desconhecido"}.`,
      { httpStatus: result.httpStatus },
    );
  }

  return online("Cloudflare R2 online. Bucket e chaves S3 compativeis validadas.", { httpStatus: result.httpStatus });
}

async function testInngest(credentials: CredentialBag): Promise<ConnectionTestResult> {
  const eventKey = getCredential(credentials, ["INNGEST_EVENT_KEY"]);
  const signingKey = getCredential(credentials, ["INNGEST_SIGNING_KEY"]);

  if (!eventKey || !signingKey) {
    return offline("Preencha Event key e Signing key da Inngest antes de testar.");
  }

  const details: string[] = [];

  try {
    const client = new Inngest({ id: "connectyhub-maintenance", eventKey });
    await client.send({
      name: "connectyhub/admin.ping",
      data: { source: "maintenance-room", checkedAt: new Date().toISOString() },
    });
    details.push("Event key aceitou um evento admin.ping.");
  } catch {
    return offline("Inngest nao aceitou o Event key informado.");
  }

  const appUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL);

  if (appUrl) {
    const result = await fetchJson(`${appUrl}/api/inngest`);

    if (result.httpStatus === 401 || result.httpStatus === 200 || result.httpStatus === 405) {
      details.push("Endpoint /api/inngest publicado e protegido por assinatura.");
    } else {
      details.push(`Endpoint /api/inngest respondeu status ${result.httpStatus ?? "desconhecido"}.`);
    }
  }

  return online("Inngest online. Event key validado; Signing key deve bater com o app sincronizado.", { details });
}

async function testVapid(credentials: CredentialBag): Promise<ConnectionTestResult> {
  const publicKey = getCredential(credentials, ["NEXT_PUBLIC_VAPID_PUBLIC_KEY"]);
  const privateKey = getCredential(credentials, ["VAPID_PRIVATE_KEY"]);
  const subject = getCredential(credentials, ["VAPID_SUBJECT"]);

  if (!publicKey || !privateKey || !subject) {
    return offline("Preencha Public key, Private key e Subject do VAPID antes de testar.");
  }

  if (!isLikelyVapidKey(publicKey) || !isLikelyVapidKey(privateKey)) {
    return offline("As chaves VAPID nao parecem estar no formato base64url esperado.");
  }

  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
    return offline("O Subject VAPID precisa ser um contato mailto: ou uma URL https://.");
  }

  return online("VAPID configurado. Par de chaves e subject parecem validos para Web Push.");
}

async function testStripe(credentials: CredentialBag): Promise<ConnectionTestResult> {
  const secretKey = getCredential(credentials, ["STRIPE_SECRET_KEY"]);

  if (!secretKey) {
    return offline("Preencha a Secret key da Stripe antes de testar.");
  }

  const result = await fetchJson("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${secretKey}` },
  });

  if (!result.ok) {
    return offline(
      result.httpStatus === 401 || result.httpStatus === 403
        ? "Stripe respondeu, mas a Secret key nao foi aceita."
        : `Stripe respondeu com status ${result.httpStatus ?? "desconhecido"}.`,
      { httpStatus: result.httpStatus },
    );
  }

  return online("Stripe online. Secret key validada na conta.", { httpStatus: result.httpStatus });
}

async function testMercadoPago(credentials: CredentialBag): Promise<ConnectionTestResult> {
  const clientId = getCredential(credentials, ["MERCADO_PAGO_CLIENT_ID"]);
  const clientSecret = getCredential(credentials, ["MERCADO_PAGO_CLIENT_SECRET"]);
  const redirectUri = getCredential(credentials, ["MERCADO_PAGO_REDIRECT_URI"]) || `${resolveAppBaseUrlForTest()}/api/dashboard/sales-catalog/payments/mercado-pago/callback`;
  const webhookSecret = getCredential(credentials, ["MERCADO_PAGO_WEBHOOK_SECRET"]);

  if (!clientId || !clientSecret) {
    return offline("Preencha Client ID e Client Secret do aplicativo Mercado Pago antes de testar.");
  }

  if (!normalizeBaseUrl(redirectUri)) {
    return offline("Redirect URI do Mercado Pago precisa ser uma URL https valida.");
  }

  return online("Mercado Pago pronto para OAuth. Client ID, Client Secret e Redirect URI estao presentes; o secret e validado no retorno oficial do Mercado Pago.", {
    details: webhookSecret
      ? ["Webhook signature configurada para validar notificacoes."]
      : ["Webhook signature ainda ausente; notificacoes serao processadas sem validacao HMAC ate configurar."],
  });
}

async function testConfiguredCredentials(credentials: CredentialBag): Promise<ConnectionTestResult> {
  if (credentials.size === 0) {
    return offline("Nenhuma credencial salva para testar nesta integracao.");
  }

  return online("Credenciais presentes no cofre. Teste externo dedicado ainda nao foi necessario para esta integracao.");
}

function getCredential(credentials: CredentialBag, envNames: string[]) {
  for (const envName of envNames) {
    const value = credentials.get(envName);

    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
}

function normalizeMetaAdAccountId(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed.replace(/^act_/, "")}`;
}

function readAccessToken(data: unknown) {
  if (!data || typeof data !== "object") {
    return "";
  }

  const token = (data as Record<string, unknown>).access_token;
  return typeof token === "string" ? token : "";
}

function readGoogleAdsAccessibleCustomers(data: unknown) {
  if (!data || typeof data !== "object") {
    return [];
  }

  const resourceNames = (data as Record<string, unknown>).resourceNames;
  return Array.isArray(resourceNames)
    ? resourceNames.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeBaseUrl(value?: string) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value.trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    return url.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeMetaGraphVersion(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "v23.0";
  }

  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function normalizeGoogleAdsApiVersion(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function resolveAppBaseUrlForTest() {
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "";
  const deploymentUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";

  return normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL)
    || normalizeBaseUrl(process.env.APP_URL)
    || normalizeBaseUrl(productionUrl)
    || normalizeBaseUrl(deploymentUrl);
}

function normalizeGeminiModel(value: string) {
  return value.trim().replace(/^models\//, "") || defaultGeminiModel;
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await readResponse(response);

    return { ok: response.ok, httpStatus: response.status, data };
  } catch (error) {
    return {
      ok: false,
      httpStatus: error instanceof Error && error.name === "AbortError" ? 408 : undefined,
      data: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null) as Promise<unknown>;
  }

  const text = await response.text().catch(() => "");

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function countInstances(data: unknown) {
  if (Array.isArray(data)) {
    return data.length;
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  const candidates = [record.instances, record.data, record.result, record.results];
  const arrayCandidate = candidates.find(Array.isArray);

  return arrayCandidate ? arrayCandidate.length : null;
}

function resolveGeminiErrorMessage(status: number | undefined, data: unknown) {
  const message = resolveProviderErrorMessage(data);

  if (status === 400) {
    return message || "Gemini respondeu 400. Verifique se o modelo escolhido aceita generateContent.";
  }

  if (status === 401 || status === 403) {
    return message || "Gemini respondeu, mas a API Key nao foi aceita.";
  }

  if (status === 404) {
    return message || "Modelo Gemini nao encontrado para esta chave.";
  }

  if (status === 408) {
    return "Teste de conexao expirou depois de 12 segundos.";
  }

  return message || `Gemini respondeu com status ${status ?? "desconhecido"}.`;
}

function resolveProviderErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  const error = record.error;

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    return typeof errorRecord.message === "string" ? errorRecord.message : null;
  }

  return typeof record.error_description === "string" ? record.error_description : null;
}

async function fetchSignedR2BucketList(endpoint: string, bucket: string, accessKeyId: string, secretAccessKey: string) {
  const endpointUrl = new URL(endpoint);
  const method = "GET";
  const region = "auto";
  const service = "s3";
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = `/${encodeURIComponent(bucket)}`;
  const canonicalQueryString = "list-type=2&max-keys=1";
  const payloadHash = sha256Hex("");
  const host = endpointUrl.host;
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(getSignatureKey(secretAccessKey, dateStamp, region, service), stringToSign);
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");
  const url = `${endpointUrl.origin}${canonicalUri}?${canonicalQueryString}`;

  return fetchJson(url, {
    method,
    headers: {
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
  });
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function getSignatureKey(secretAccessKey: string, dateStamp: string, regionName: string, serviceName: string) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, "aws4_request");
}

function isLikelyVapidKey(value: string) {
  return /^[A-Za-z0-9_-]{40,}$/.test(value);
}

function online(message: string, extra: Partial<ConnectionTestResult> = {}): ConnectionTestResult {
  return { status: "online", message, checkedAt: new Date().toISOString(), ...extra };
}

function offline(message: string, extra: Partial<ConnectionTestResult> = {}): ConnectionTestResult {
  return { status: "offline", message, checkedAt: new Date().toISOString(), ...extra };
}
