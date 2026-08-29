export const defaultConnectyhubSiteUrl = "https://connectyhub.com.br";

export const connectyhubSiteName = "ConnectyHub";

export const connectyhubSiteDescription =
  "Plataforma brasileira para criar agentes de IA, automacoes, CRM, catalogo de vendas, checkout e atendimento conectado ao WhatsApp.";

export const connectyhubSeoKeywords = [
  "ConnectyHub",
  "agente de IA para WhatsApp",
  "automacao WhatsApp",
  "API WhatsApp",
  "catalogo WhatsApp",
  "clone digital WhatsApp",
  "CRM WhatsApp",
  "checkout WhatsApp",
  "IA para vendas",
  "atendimento automatico WhatsApp",
];

export function getConnectyhubSiteUrl() {
  const explicit =
    process.env.NEXT_PUBLIC_CONNECTYHUB_SITE_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  if (!explicit) return defaultConnectyhubSiteUrl;

  return explicit.replace(/^http:\/\//i, "https://").replace(/\/+$/, "");
}

export function buildCanonicalUrl(path = "/") {
  const baseUrl = getConnectyhubSiteUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return new URL(normalizedPath, `${baseUrl}/`).toString().replace(/\/$/, normalizedPath === "/" ? "/" : "");
}

export function toAbsoluteUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    return new URL(value, `${getConnectyhubSiteUrl()}/`).toString();
  } catch {
    return null;
  }
}

export function truncateSeoText(value: string | null | undefined, maxLength = 155) {
  const compact = (value ?? "").replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) return compact;

  const slice = compact.slice(0, maxLength);
  const lastBreak = Math.max(slice.lastIndexOf("."), slice.lastIndexOf(","), slice.lastIndexOf(" "));
  const ending = lastBreak > 80 ? slice.slice(0, lastBreak) : slice;

  return `${ending.trim()}...`;
}

export function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
