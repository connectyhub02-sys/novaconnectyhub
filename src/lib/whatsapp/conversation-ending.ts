type Message = {
  id?: string;
  direction: string;
  text_content: string | null;
  message_type?: string | null;
  payload?: unknown;
};

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\bate (?:a )?proxima\b/g, "ate mais")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

// Match entire courtesy messages, never a word inside a new question or request.
function courtesy(text: string) {
  if (text.length > 400 || text.includes("?")) return false;
  const normalized = normalize(text);
  if (/^(bom dia|boa tarde|boa noite)$/.test(normalized)) return false;
  if (!normalized) return /^[\s\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]+$/u.test(text) && /[👍🙏👋]/u.test(text);
  return /^(?:(?:muito obrigado|muito obrigada|obrigado|obrigada|brigado|brigada|agradeco|valeu|ok|okay|ta bom|tudo bem|certo|beleza|perfeito|combinado|entendido|tchau|ate mais|ate logo|ate breve|boa noite|bom dia|boa tarde|bom descanso|igualmente|pra voce tambem|para voce tambem|por tudo|pela ajuda|pelo atendimento|viu|sim|e|entao)\s*)+$/.test(normalized);
}

function farewell(text: string) {
  return courtesy(text) && /\b(tchau|ate mais|ate logo|ate breve)\b/.test(normalize(text));
}

function thanks(text: string) {
  return courtesy(text) && /\b(obrigad[oa]|brigad[oa]|agradeco|valeu)\b/.test(normalize(text));
}

function agentFarewell(text: string) {
  if (text.length > 600 || text.includes("?")) return false;
  const normalized = normalize(text);
  // Names or a completed answer may precede a clear final goodbye.
  if (!pendingReply(text) && /\b(?:ate mais|ate logo|ate breve|tchau)$/.test(normalized)) return true;
  return /^(?:(?:por nada|de nada|disponha|eu que agradeco|obrigado|obrigada|agradeco o contato|foi um prazer ajudar|tchau|ate mais|ate logo|bom dia|boa tarde|boa noite|se precisar estou aqui|se precisar to aqui|se precisar de algo estou aqui|estou aqui quando precisar|to aqui quando precisar|conte comigo|estou a disposicao|fico a disposicao|qualquer coisa estou por aqui|e|um|tenha)\s*)+$/.test(normalized)
    && /\b(por nada|de nada|disponha|agradeco|tchau|ate mais|ate logo|precisar|disposicao)\b/.test(normalized);
}

function pendingReply(text: string) {
  return /\?|\b(?:me (?:confirma|informa|diga|envia)|aguardo|aguardando|preciso (?:saber|confirmar)|pode (?:enviar|confirmar)|envie|confirme)\b/i.test(text);
}

/** Reconstruct ending from persisted messages. A substantive inbound always reopens it. */
export function conversationEnding(messages: readonly Message[]) {
  let ended = false;
  let acknowledged = false;
  let lastAgentText = "";
  for (const message of messages) {
    const text = message.text_content ?? "";
    if (message.direction === "inbound") {
      // An attachment/caption is not a courtesy-only turn.
      const media = message.message_type && !["text", "conversation", "extendedTextMessage"].includes(message.message_type);
      if (media || !courtesy(text)) {
        ended = false;
        acknowledged = false;
      } else if (farewell(text) || (thanks(text) && lastAgentText && !pendingReply(lastAgentText))) {
        ended = true;
      }
    } else if (message.direction === "outbound") {
      if (ended || agentFarewell(text)) {
        ended = true;
        acknowledged = true;
      }
      lastAgentText = text;
    }
  }
  return { ended, acknowledged };
}

export function conversationEndingAction(messages: readonly Message[], latestInboundId: string, userText: string): "continue" | "close" | "silence" {
  const index = messages.findIndex(message => message.id === latestInboundId);
  if (index < 0) return "continue";
  const latest = messages[index];
  if (latest.message_type && !["text", "conversation", "extendedTextMessage"].includes(latest.message_type)) return "continue";
  if (!courtesy(userText)) return "continue";
  // A new request and a courtesy in the same inbound burst still need an answer.
  let batchStart = index;
  while (batchStart > 0 && messages[batchStart - 1].direction === "inbound") batchStart--;
  if (messages.slice(batchStart, index).some(message => !courtesy(message.text_content ?? ""))) return "continue";
  const ending = conversationEnding([...messages.slice(0, index), { ...latest, text_content: userText }]);
  if (!ending.ended) return "continue";
  return ending.acknowledged ? "silence" : "close";
}
