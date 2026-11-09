export const videoServicePath = "/solucoes/producao-de-videos";
export const videoContactPath = `${videoServicePath}/conversar`;
// Public global WhatsApp verified on 2026-11-08. Used only if live lookup is unavailable.
export const globalWhatsappFallback = "554788556936";

export function videoWhatsappMessage(style?: string | null) {
  const styles: Record<string, string> = {
    edicao: "edição dos meus vídeos", ia: "produção de vídeos com IA", especial: "uma produção especial",
    apresentador: "vídeos com apresentador", produto: "vídeos de produto", motion: "vídeos com motion graphics",
  };
  const interest = style ? styles[style] : undefined;
  return `Olá, Eliane! Vim da página de produção e edição de vídeos da ConnectyHub. Quero conversar sobre ${interest ?? "uma proposta para os meus vídeos"}.`;
}

export function videoWhatsappUrl(phone: string, style?: string | null) {
  const normalized = phone.replace(/\D/g, "");
  const safePhone = /^[1-9][0-9]{9,14}$/.test(normalized) ? normalized : globalWhatsappFallback;
  return `https://wa.me/${safePhone}?text=${encodeURIComponent(videoWhatsappMessage(style))}`;
}
