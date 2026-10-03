// Short acknowledgements ("legal", "vou analisar", "valeu irmão") carry nothing a
// lead analysis could use. Deliberately narrow: every word must be in this list, so
// numbers, questions, products, addresses, "não"/"sim" and any media still count as
// new information.
const acknowledgementWords = new Set([
  "ok", "okay", "okk", "blz", "beleza", "legal", "show", "top", "massa", "joia", "valeu", "vlw", "obrigado", "obrigada",
  "brigado", "brigada", "grato", "grata", "certo", "entendi", "entendido", "perfeito", "tranquilo", "tranquila", "suave",
  "de", "boa", "ta", "otimo", "fechou", "combinado", "oi", "ola", "opa", "eai", "e", "ai",
  "bom", "dia", "tarde", "noite", "tudo", "bem", "kk", "kkk", "kkkk", "kkkkk", "haha", "hahaha", "rs", "rsrs",
  "vou", "ver", "analisar", "pensar", "olhar", "depois", "falo", "te", "aviso", "chamo", "retorno", "ja", "volto",
  "irmao", "mano", "amigo", "amiga", "parceiro", "meu", "querido", "querida", "aguardo", "pode", "deixa", "comigo",
]);
const textTypes = new Set(["Conversation", "ExtendedTextMessage", "text"]);

export function isLowSignalLeadText(text: string | null | undefined) {
  const normalized = String(text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/\p{Extended_Pictographic}/gu, " ").replace(/[.,!;:~]+/g, " ").trim();
  if (!normalized || normalized.length > 40 || /[?\d@/]/.test(normalized)) return false;
  const words = normalized.split(/\s+/);
  return words.length <= 5 && words.every(word => acknowledgementWords.has(word));
}

type Message = { direction: string; message_type?: string | null; text_content?: string | null };

/** True when every lead message since the agent's last reply is a short acknowledgement. */
export function onlyAcknowledgementsSinceLastReply(messages: Message[]) {
  const lastOutbound = messages.map(message => message.direction).lastIndexOf("outbound");
  const fresh = messages.slice(lastOutbound + 1).filter(message => message.direction === "inbound");
  return fresh.length > 0 && fresh.every(message => textTypes.has(String(message.message_type ?? "")) && isLowSignalLeadText(message.text_content));
}
