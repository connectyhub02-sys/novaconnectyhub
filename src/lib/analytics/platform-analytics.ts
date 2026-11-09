import "server-only";
import { createSign } from "node:crypto";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";

type GoogleReport = {
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
};
export type AnalyticsReport = {
  status: "connected" | "pending" | "error";
  detail: string;
  propertyId: string;
  measurementId: string;
  generatedAt: string;
  users: number | null; sessions: number | null; views: number | null;
  realtimeUsers: number | null;
  pages: { path: string; views: number; users: number }[];
  sources: { source: string; sessions: number }[];
};

async function serviceAccount() {
  let value = process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON?.trim();
  if (!value) {
    const { data, error } = await createServiceClient().from("integration_credentials")
      .select("encrypted_value").eq("scope", "platform").is("organization_id", null)
      .eq("integration_id", "google-analytics").eq("env_name", "GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Não foi possível consultar a configuração do Analytics.");
    if (data?.encrypted_value) value = decryptCredentialValue(data.encrypted_value);
  }
  if (!value) return null;
  const parsed = JSON.parse(value) as { client_email?: string; private_key?: string; type?: string };
  if (parsed.type !== "service_account" || !parsed.client_email?.endsWith(".iam.gserviceaccount.com") || !parsed.private_key) {
    throw new Error("Credencial de leitura do Analytics inválida.");
  }
  return { email: parsed.client_email, privateKey: parsed.private_key };
}

async function readAccessToken(account: { email: string; privateKey: string }) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.email,
    scope: "https://www.googleapis.com/auth/analytics.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.privateKey, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", cache: "no-store",
    signal: AbortSignal.timeout(12000), body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }) });
  const body = await response.json() as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error("Não foi possível autenticar a leitura no Google Analytics.");
  return body.access_token;
}

async function runReport(propertyId: string, token: string, body: unknown, realtime = false): Promise<GoogleReport> {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:${realtime ? "runRealtimeReport" : "runReport"}`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 403) throw new Error("O Google negou a leitura: confira a Analytics Data API e o acesso de Leitor à propriedade.");
    if (response.status === 429) throw new Error("Limite temporário do Google Analytics. Atualize novamente em alguns minutos.");
    throw new Error(`Relatório do Google Analytics indisponível (HTTP ${response.status}).`);
  }
  return response.json();
}

export async function getPlatformAnalytics(): Promise<AnalyticsReport> {
  const report: AnalyticsReport = {
    status: "pending", detail: "Conecte a conta de serviço com acesso de Leitor à propriedade GA4.",
    propertyId: process.env.GOOGLE_ANALYTICS_PROPERTY_ID?.trim() || "478860449",
    measurementId: process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_MEASUREMENT_ID || "",
    generatedAt: new Date().toISOString(), users: null, sessions: null, views: null, realtimeUsers: null, pages: [], sources: [],
  };
  try {
    if (!/^\d+$/.test(report.propertyId)) throw new Error("ID da propriedade Analytics inválido.");
    const account = await serviceAccount();
    if (!account) return report;
    const token = await readAccessToken(account);
    const common = { dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
      dimensionFilter: { filter: { fieldName: "hostName", inListFilter: { values: ["www.connectyhub.com.br", "connectyhub.com.br"] } } } };
    const [totals, pages, sources, realtime] = await Promise.allSettled([
      runReport(report.propertyId, token, { ...common, metrics: [{ name: "totalUsers" }, { name: "sessions" }, { name: "screenPageViews" }] }),
      runReport(report.propertyId, token, { ...common, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 10 }),
      runReport(report.propertyId, token, { ...common, dimensions: [{ name: "sessionSourceMedium" }], metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 10 }),
      runReport(report.propertyId, token, { metrics: [{ name: "activeUsers" }] }, true),
    ]);
    if (totals.status === "rejected") throw totals.reason;
    const number = (value?: string) => Number(value || 0);
    const metrics = totals.value.rows?.[0]?.metricValues;
    report.users = number(metrics?.[0]?.value); report.sessions = number(metrics?.[1]?.value); report.views = number(metrics?.[2]?.value);
    if (pages.status === "fulfilled") report.pages = (pages.value.rows ?? []).map(row => ({ path: row.dimensionValues?.[0]?.value || "/", views: number(row.metricValues?.[0]?.value), users: number(row.metricValues?.[1]?.value) }));
    if (sources.status === "fulfilled") report.sources = (sources.value.rows ?? []).map(row => ({ source: row.dimensionValues?.[0]?.value || "(not set)", sessions: number(row.metricValues?.[0]?.value) }));
    if (realtime.status === "fulfilled") report.realtimeUsers = number(realtime.value.rows?.[0]?.metricValues?.[0]?.value);
    report.status = "connected";
    report.detail = ["Dados consultados diretamente no GA4. Relatórios consolidados podem levar 24–48 horas para incorporar visitas recentes.",
      ...([pages, sources, realtime].some(result => result.status === "rejected") ? ["Parte dos relatórios está temporariamente indisponível."] : [])].join(" ");
  } catch (error) {
    report.status = "error";
    // Never render provider payloads or credential parsing errors.
    report.detail = error instanceof Error && /^(O Google|Relatório|Limite temporário|Não foi possível|ID da|Credencial de)/.test(error.message)
      ? error.message : "A conexão com o Analytics precisa ser verificada pelo administrador.";
  }
  return report;
}
