import type { WhatsappBehaviorConfig } from "./agent-behavior";

export function applyTextEmojiPreference(text: string, behavior: Pick<WhatsappBehaviorConfig, "textEmojis">) {
  if (behavior.textEmojis !== false) return text;
  return text.replace(/\p{Extended_Pictographic}[\p{Emoji_Modifier}\uFE0E\uFE0F\u200D]*|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3/gu, "")
    .replace(/[ \t]{2,}/g, " ").trim();
}

export function selectConversationReaction(text: string, style: WhatsappBehaviorConfig["conversationStyle"]): string | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // A complaint, bereavement or urgent case should not receive an automatic celebration.
  if (/\b(dor|urgente|urgencia|acidente|falec|morreu|luto|reclam|problema|processo|intimacao|vazamento|choque|sinistro)/.test(normalized)) return null;
  if (style === "discreet") return /obrigad|confirmad|combinado/.test(normalized) ? "👍" : null;
  if (/obrigad|valeu|agradec/.test(normalized)) return style === "warm" ? "😊" : "👍";
  if (/bom dia|boa tarde|boa noite|^oi\b|^ola\b/.test(normalized)) return "👋";
  if (/confirmad|combinado|perfeito|otimo/.test(normalized)) return "👍";
  if (style === "warm" && /haha|kkk|😂|🤣/.test(normalized)) return "😄";
  return null;
}

export function conversationStyleInstructions(behavior: WhatsappBehaviorConfig) {
  return [
    "PREFERÊNCIAS EFETIVAS DE CONVERSA (prevalecem sobre sugestões de estilo do perfil):",
    behavior.textEmojis === false ? "- Não use emojis no texto das respostas." : "- Emojis no texto são opcionais; use com moderação e conforme o contexto.",
    `- Estilo: ${behavior.conversationStyle === "discreet" ? "discreto, sem intimidade ou celebrações" : behavior.conversationStyle === "warm" ? "acolhedor e leve quando houver abertura" : "equilibrado e consultivo"}.`,
    "- Reações e figurinhas são enviadas pelo sistema conforme as preferências; não prometa enviá-las.",
    behavior.responseMode === "text" ? "- O modo escolhido é texto; não prometa áudio." : "- Áudio depende da voz disponível e do modo de resposta; o perfil orienta apenas o tom.",
  ];
}
