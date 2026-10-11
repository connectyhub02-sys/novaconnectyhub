export function officialPhone(value: unknown) {
  const phone = typeof value === "string" ? value.replace(/[+ ()-]/g, "") : "";
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error("Informe o telefone com DDI e DDD.");
  return phone;
}

export function officialAssetId(value: unknown) {
  if (typeof value !== "string" || !/^\d{5,30}$/.test(value)) throw new Error("Identificador Meta inválido.");
  return value;
}

export function serviceWindowOpen(inboundAt: string | null, now = Date.now()) {
  const timestamp = inboundAt ? Date.parse(inboundAt) : NaN;
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp < 24 * 60 * 60 * 1000;
}

export function officialOptOut(text: string) {
  return /^(sair|parar|pare|stop|cancelar|remover|descadastrar|nao quero receber(?: mais)?(?: mensagens)?)[.!\s]*$/i.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
}

export function templateInput(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  const text = String(body.text ?? "").trim();
  const category = String(body.category ?? "MARKETING");
  const language = String(body.language ?? "pt_BR");
  if (!/^[a-z][a-z0-9_]{2,511}$/.test(name)) throw new Error("Nome do modelo: use letras minúsculas, números e sublinhado (mínimo 3 caracteres).");
  if (!text || text.length > 1024 || /\{\{|\}\}/.test(text)) throw new Error("Use até 1.024 caracteres, sem variáveis nesta primeira versão.");
  if (!["MARKETING", "UTILITY"].includes(category) || !["pt_BR", "en_US", "es"].includes(language)) throw new Error("Categoria ou idioma inválido.");
  return { name, category, language, components: [{ type: "BODY", text }] };
}
