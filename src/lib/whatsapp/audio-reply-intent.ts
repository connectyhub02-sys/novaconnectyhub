export function isLeadRequestingAudioReply(value: string | null | undefined) {
  const normalized = normalizeSearch(value);

  if (!normalized || isLeadRejectingAudioReply(normalized)) {
    return false;
  }

  return [
    /\b(?:me|mim|pra mim|para mim|pode|consegue|manda|mandar|envia|enviar|grava|gravar|responde|responder|explica|explicar)\b.{0,80}\b(?:audio|voz|mensagem de voz|por voz|falando)\b/,
    /\b(?:audio|voz|mensagem de voz|por voz|falando)\b.{0,80}\b(?:me|mim|pra mim|para mim|pode|consegue|manda|mandar|envia|enviar|grava|gravar|responde|responder|explica|explicar)\b/,
    /\b(?:estou|to|tou|tô)\s+(?:dirigindo|no volante|na estrada|ocupado|ocupada)\b.{0,100}\b(?:audio|ouvir|escutar|ler|texto)\b/,
    /\b(?:nao|n)\s+(?:consigo|posso)\s+(?:ler|entender|acompanhar)\b.{0,100}\b(?:audio|voz|falando|dirigindo)\b/,
    /\b(?:manda|envia|grava|responde)\s+(?:um\s+)?(?:audio|audiinho|áudio|voz)\b/,
  ].some((pattern) => pattern.test(normalized));
}

export function isLeadRejectingAudioReply(value: string | null | undefined) {
  const normalized = normalizeSearch(value);

  if (!normalized) {
    return false;
  }

  return [
    /\b(?:nao|n|nem)\s+(?:me\s+)?(?:manda|mandar|envia|enviar|grava|gravar|responde|responder)\b.{0,40}\b(?:audio|voz)\b/,
    /\b(?:nao|n)\s+(?:precisa|quero)\b.{0,30}\b(?:audio|voz)\b/,
    /\b(?:sem|nada de)\s+(?:audio|voz)\b/,
    /\b(?:prefiro|manda|envia|responde)\b.{0,40}\b(?:texto|por escrito|escrito)\b/,
    /\b(?:nao|n)\s+(?:posso|consigo|da pra|dá pra)\s+(?:ouvir|escutar|abrir audio|abrir o audio)\b/,
    /\b(?:estou|to|tou|tô)\s+(?:em reuniao|em reunião|no trabalho|ocupado|ocupada)\b.{0,100}\b(?:nao|n)\b.{0,25}\b(?:audio|ouvir|escutar)\b/,
  ].some((pattern) => pattern.test(normalized));
}

function normalizeSearch(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
