export const metaFeatureLaunchPaused = true;

export const metaFeatureComingSoonTitle = "Meta, Instagram e Facebook em breve";

export const metaFeatureComingSoonMessage =
  "Em breve os agentes e dashboards vao atender tambem pelo Instagram e pelo Facebook. Por enquanto, o lancamento segue com WhatsApp ativo; assim que a Meta liberar o app, esses recursos serao habilitados aqui.";

export const metaFeatureComingSoonDetail =
  "Estamos aguardando a liberacao da Meta para ativar Facebook, Instagram, Messenger, comentarios, campanhas Meta Ads e organico Meta para os clientes.";

const metaComingSoonClientHrefs = new Set([
  "/dashboard/trafego/meta-ads",
  "/dashboard/trafego-organico",
]);

export function isMetaComingSoonClientHref(href: string) {
  return metaFeatureLaunchPaused && metaComingSoonClientHrefs.has(href);
}
