// Only the platform's marketing pages belong to its GA4 property.
export const platformAnalyticsPaths = [
  "/", "/solucoes", "/solucoes-personalizadas", "/docs/api", "/cadastro",
  "/privacidade", "/termos", "/exclusao-de-dados",
  "/solucoes/producao-de-videos", "/solucoes/agente-ia-whatsapp",
  "/solucoes/automacao-whatsapp", "/solucoes/catalogo-whatsapp",
  "/solucoes/api-whatsapp", "/solucoes/ia-para-imobiliarias", "/solucoes/ia-para-ecommerce",
];

export function isPlatformAnalyticsPage(path: string, hostname: string) {
  return ["connectyhub.com.br", "www.connectyhub.com.br"].includes(hostname)
    && platformAnalyticsPaths.includes(path);
}

export function analyticsLocation(rawUrl: string) {
  const url = new URL(rawUrl);
  // Deliberately omit query strings, hashes, auth codes and form values.
  return `${url.origin}${url.pathname}`;
}

export function analyticsReferrer(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    // External paths can contain private search terms or identifiers.
    return `${url.origin}/`;
  } catch { return ""; }
}
