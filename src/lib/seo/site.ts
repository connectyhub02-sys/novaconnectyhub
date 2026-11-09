export const defaultConnectyhubSiteUrl = "https://www.connectyhub.com.br";

export const connectyhubSiteName = "ConnectyHub";

export const connectyhubSocialProfiles = [
  { name: "Instagram", url: "https://www.instagram.com/connectyhub.ai" },
  { name: "YouTube", url: "https://www.youtube.com/@connectyhub01" },
  { name: "TikTok", url: "https://www.tiktok.com/@connectyhub.ia" },
];

export const connectyhubSiteDescription =
  "Plataforma brasileira de agentes de IA, atendimento no WhatsApp, CRM, automações, catálogo de vendas e APIs para empresas.";

export const connectyhubSeoKeywords = [
  "ConnectyHub",
  "agente de IA para WhatsApp",
  "automacao WhatsApp",
  "API WhatsApp",
  "Estúdio de Voz e Áudio AI",
  "API de voz por créditos",
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
    || process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!explicit) return defaultConnectyhubSiteUrl;

  return explicit.replace(/^http:\/\//i, "https://").replace(/\/+$/, "");
}

export function buildCanonicalUrl(path = "/") {
  const baseUrl = getConnectyhubSiteUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const url = new URL(normalizedPath, `${baseUrl}/`);
  url.search = "";
  return url.toString().replace(/\/$/, normalizedPath === "/" ? "/" : "");
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
