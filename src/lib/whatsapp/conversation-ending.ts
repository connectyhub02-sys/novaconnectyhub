type Message = {
  id?: string;
  direction: string;
  text_content: string | null;
  message_type?: string | null;
  payload?: unknown;
};

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\bate (?:a )?proxima\b/g, "ate mais")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()
    .replace(/\b(?:abracos|abraco|abs)\b/g, "abraco").replace(/\bvlw\b/g, "valeu").replace(/\bblz\b/g, "beleza")
    .replace(/\bobg\b/g, "obrigado").replace(/\btmj\b/g, "tamo junto").replace(/\bflw\b/g, "falou");
}

// UAZAPI persists provider casing (Conversation, ExtendedTextMessage). Compare
// case-insensitively so plain text is never mistaken for an attachment.
// A reaction carries only its emoji and follows the same courtesy rules.
const textMessageTypes = new Set(["text", "conversation", "extendedtextmessage", "reactionmessage"]);
export function isTextMessageType(type: string | null | undefined) {
  return !type || textMessageTypes.has(type.toLowerCase());
}

const courtesyEmoji = /[👍🙏👋🤝👌😊🙂☺✌❤💪🔥😉]/u;

// Match entire courtesy messages, never a word inside a new question or request.
// Meaning still depends on the agent's last message: after a question or a
// proposal a courtesy is an answer, never a farewell.
function courtesy(text: string) {
  if (text.length > 400 || text.includes("?")) return false;
  const normalized = normalize(text);
  if (/^(bom dia|boa tarde|boa noite)$/.test(normalized)) return false;
  if (!normalized) return /^[\s\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]+$/u.test(text) && courtesyEmoji.test(text);
  return /^(?:(?:muito obrigado|muito obrigada|obrigado|obrigada|brigado|brigada|agradeco|grato|grata|gratidao|valeu|ok|okay|ta bom|tudo bem|tudo certo|certo|beleza|perfeito|combinado|entendido|top|show|show de bola|joia|otimo|otima|maravilha|fechou|falou|tamo junto|abraco|um abraco|fique com deus|deus abencoe|amem|tchau|ate mais|ate logo|ate breve|ate amanha|boa noite|bom dia|boa tarde|bom descanso|boa semana|bom fim de semana|bom final de semana|igualmente|pra voce tambem|para voce tambem|voce tambem|por tudo|pela ajuda|pelo atendimento|viu|sim|e|entao)\s*)+$/.test(normalized);
}

function farewell(text: string) {
  return courtesy(text) && /\b(tchau|ate mais|ate logo|ate breve|ate amanha|falou|abraco|fique com deus|bom descanso)\b/.test(normalize(text));
}

function thanks(text: string) {
  return courtesy(text) && /\b(obrigad[oa]|brigad[oa]|agradeco|grat[oa]|gratidao|valeu)\b/.test(normalize(text));
}

function agentFarewell(text: string) {
  if (text.length > 600 || text.includes("?")) return false;
  const normalized = normalize(text);
  // Names or a completed answer may precede a clear final goodbye. Generated
  // closings vary ("Um abraço e boa noite!", "nos falamos em breve").
  if (!pendingReply(text) && /\b(?:ate mais|ate mais tarde(?: entao)?|ate logo|ate breve|ate amanha|ate la|tchau)$/.test(normalized)) return true;
  if (!pendingReply(text) && /\b(?:a gente se fala|ate daqui a pouco)\b/.test(normalized)) return true;
  if (!pendingReply(text) && /\b(?:abraco|fique com deus|nos falamos|falamos em breve|bom descanso|(?:boa|otima|excelente) semana|bom (?:fim|final) de semana)\b/.test(normalized)) return true;
  return /^(?:(?:por nada|de nada|disponha|eu que agradeco|obrigado|obrigada|agradeco o contato|foi um prazer ajudar|tchau|ate mais|ate logo|bom dia|boa tarde|boa noite|se precisar estou aqui|se precisar to aqui|se precisar de algo estou aqui|estou aqui quando precisar|to aqui quando precisar|conte comigo|estou a disposicao|fico a disposicao|qualquer coisa estou por aqui|e|um|tenha)\s*)+$/.test(normalized)
    && /\b(por nada|de nada|disponha|agradeco|tchau|ate mais|ate logo|precisar|disposicao)\b/.test(normalized);
}

function isClosingReply(payload: unknown) {
  const event = payload && typeof payload === "object" ? (payload as { runtime_event?: { type?: unknown } }).runtime_event : null;
  return event?.type === "conversation_ending";
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
      const media = !isTextMessageType(message.message_type);
      if (media || !courtesy(text)) {
        ended = false;
        acknowledged = false;
      } else if (farewell(text) || (thanks(text) && lastAgentText && !pendingReply(lastAgentText))) {
        ended = true;
      }
    } else if (message.direction === "outbound") {
      // The runtime's own closing reply (even when it asks for the name) ends
      // the conversation; any other later bubble with a question reopens it.
      if (isClosingReply(message.payload)) {
        ended = true;
        acknowledged = true;
      } else if (pendingReply(text)) {
        ended = false;
        acknowledged = false;
      } else if (ended || agentFarewell(text)) {
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
  if (!isTextMessageType(latest.message_type)) return "continue";
  if (!courtesy(userText)) return "continue";
  // A new request and a courtesy in the same inbound burst still need an answer.
  let batchStart = index;
  while (batchStart > 0 && messages[batchStart - 1].direction === "inbound") batchStart--;
  if (messages.slice(batchStart, index).some(message => !courtesy(message.text_content ?? ""))) return "continue";
  const ending = conversationEnding([...messages.slice(0, index), { ...latest, text_content: userText }]);
  if (!ending.ended) {
    // "Ok"/"👍" to a promise of a later update only acknowledges it. Stay quiet
    // without ending the conversation, so the follow-up journey is preserved.
    const lastAgent = messages.slice(0, batchStart).reverse().find(message => message.direction === "outbound");
    return lastAgent && awaitingUpdate(lastAgent.text_content ?? "") ? "silence" : "continue";
  }
  return ending.acknowledged ? "silence" : "close";
}

/** The single closing reply: thanks deserve "Por nada", a plain goodbye does not. */
export function conversationClosingText(userText: string) {
  return thanks(userText) ? "Por nada! Até mais." : "Até mais!";
}

function awaitingUpdate(text: string) {
  if (text.includes("?")) return false;
  return /\b(?:te aviso|te mando|te envio|te retorno|retorno|te respondo|ja ja|um momentinho|um instante|so um momento|vou (?:conferir|verificar|ver|checar)|fico no (?:seu )?aguardo|me avisa)\b/.test(normalize(text));
}
