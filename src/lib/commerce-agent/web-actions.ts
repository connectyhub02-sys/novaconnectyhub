/** Data-only commands. Never accept URLs, selectors, scripts or checkout mutations. */
export const webActionKinds = [
  "open_product", "highlight_product", "scroll_to_section", "open_cart", "open_checkout",
  "suggest_cart_item", "request_add_to_cart_confirmation", "add_to_cart_after_confirmation",
] as const;
export type WebActionKind = typeof webActionKinds[number];
export type WebAction = {
  id: string;
  kind: WebActionKind;
  productId?: string;
  productTitle?: string;
  quantity?: number;
  section?: "produtos" | "categorias" | "descricao-completa" | "informacoes-de-envio" | "perguntas-frequentes";
  reason: string;
};
export type WebActionMode = "observer" | "assistant" | "active_seller";
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const productKinds: readonly WebActionKind[] = ["open_product", "highlight_product", "suggest_cart_item", "request_add_to_cart_confirmation", "add_to_cart_after_confirmation"];
const cartKinds: readonly WebActionKind[] = ["suggest_cart_item", "request_add_to_cart_confirmation", "add_to_cart_after_confirmation"];

export function readWebAction(value: unknown): WebAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const a = value as Record<string, unknown>;
  if (Object.keys(a).some(key => !["id", "kind", "productId", "productTitle", "quantity", "section", "reason"].includes(key))) return null;
  if (typeof a.id !== "string" || !uuid.test(a.id) || !webActionKinds.includes(a.kind as WebActionKind)) return null;
  if (typeof a.reason !== "string" || !a.reason.trim() || a.reason.length > 300) return null;
  const kind = a.kind as WebActionKind;
  if (productKinds.includes(kind)) {
    if (typeof a.productId !== "string" || !uuid.test(a.productId) || typeof a.productTitle !== "string" || !a.productTitle.trim() || a.productTitle.length > 300) return null;
  } else if (a.productId !== undefined || a.productTitle !== undefined) return null;
  if (cartKinds.includes(kind)) {
    if (!Number.isInteger(a.quantity) || Number(a.quantity) < 1 || Number(a.quantity) > 20) return null;
  } else if (a.quantity !== undefined) return null;
  if (kind === "scroll_to_section") {
    if (!["produtos", "categorias", "descricao-completa", "informacoes-de-envio", "perguntas-frequentes"].includes(String(a.section))) return null;
  } else if (a.section !== undefined) return null;
  return a as WebAction;
}

export function hasCartConfirmation(action: WebAction, value: unknown) {
  if (!value || typeof value !== "object") return false;
  const consent = value as Record<string, unknown>;
  return action.kind === "request_add_to_cart_confirmation" && consent.accepted === true
    && consent.actionId === action.id && consent.productId === action.productId && consent.quantity === action.quantity;
}

export function canRunWebActions(mode: WebActionMode, surface: string) {
  return ["assistant", "active_seller"].includes(mode) && ["store", "product", "cart"].includes(surface);
}

export function matchesWebActionPermit(proposal: WebAction, permitted: WebAction, confirmed: boolean) {
  if (proposal.kind === "add_to_cart_after_confirmation") return false;
  const needsConsent = proposal.kind === "request_add_to_cart_confirmation";
  if (needsConsent !== confirmed) return false;
  return permitted.id === proposal.id && permitted.kind === (needsConsent ? "add_to_cart_after_confirmation" : proposal.kind)
    && permitted.productId === proposal.productId && permitted.quantity === proposal.quantity
    && permitted.section === proposal.section && permitted.productTitle === proposal.productTitle;
}

export type WebActionProduct = { id: string; title: string; canAdd: boolean };
export function isWebActionRequest(message: string) { return readIntent(message) !== null; }

export function planWebAction(input: { message: string; mode: WebActionMode; surface: string; products: WebActionProduct[]; currentProductId: string | null }): Omit<WebAction, "id"> | null {
  if (!canRunWebActions(input.mode, input.surface)) return null;
  const intent = readIntent(input.message);
  if (!intent) return null;
  const { text, add } = intent;
  const matches = input.products.filter(product => {
    const title = normalize(product.title);
    return title.length >= 3 && (` ${text} `).includes(` ${title} `);
  });
  // Prefer a full, longer title; equally plausible products need clarification.
  matches.sort((a, b) => b.title.length - a.title.length);
  const product = matches.length === 1 || (matches.length > 1 && matches[0].title.length > matches[1].title.length
    && matches.slice(1).every(item => (` ${normalize(matches[0].title)} `).includes(` ${normalize(item.title)} `)))
    ? matches[0]
    : matches.length === 0 && /\b(este|esse|este item|esse item)\b/.test(text)
      ? input.products.find(item => item.id === input.currentProductId) : undefined;
  if (product) {
    if (add && product.canAdd) {
      const quantity = requestedQuantity(text);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return null;
      return { kind: "request_add_to_cart_confirmation", productId: product.id, productTitle: product.title, quantity, reason: "Lead pediu inclusão do item no carrinho." };
    }
    return { kind: /\bdestac\w*\b/.test(text) || product.id === input.currentProductId ? "highlight_product" : "open_product", productId: product.id, productTitle: product.title, reason: "Lead pediu ajuda para localizar o item." };
  }
  if (add) return null;
  if (/\b(carrinho|checkout)\b/.test(text)) return { kind: text.includes("checkout") ? "open_checkout" : "open_cart", reason: "Lead pediu para ver a revisão do carrinho." };
  const section = /\bfrete|envio\b/.test(text) ? "informacoes-de-envio" : /\bdescricao\b/.test(text) ? "descricao-completa" : /\bperguntas frequentes\b/.test(text) ? "perguntas-frequentes" : /\bcategorias\b/.test(text) ? "categorias" : /\bprodutos|catalogo\b/.test(text) ? "produtos" : null;
  return section ? { kind: "scroll_to_section", section, reason: "Lead pediu para localizar uma seção da página." } : null;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function readIntent(message: string) {
  const text = normalize(message);
  // Refusals/questions about hypothetical actions never authorize a mutation.
  if (/\b(nao (?:quero|abr\w*|adicion\w*|coloc\w*|mostr\w*|destac\w*|inclu\w*|bote|bota|role|pode|precis\w*)|cancel\w*|talvez|se eu|quanto|preco)\b/.test(text)) return null;
  const add = /\b(adicione|adiciona|adicionar|coloque|coloca|colocar|inclua|incluir|bote|bota)\b/.test(text) && /\bcarrinho\b/.test(text);
  const navigation = /\b(nao (?:encontro|encontrei|acho|achei|consigo (?:achar|encontrar)|estou encontrando)|onde (?:esta|fica|encontro)|cade|mostr\w*|abr\w*|ver|procur\w*|destac\w*|role|rolar)\b/.test(text);
  return add || navigation ? { text, add } : null;
}

function requestedQuantity(text: string) {
  const words: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20 };
  const quantities = Object.keys(words).join("|");
  const match = text.match(new RegExp(`\\b(?:adicione|adiciona|adicionar|coloque|coloca|colocar|inclua|incluir|bote|bota)\\s+(\\d+|${quantities})\\b`))
    ?? text.match(new RegExp(`\\b(\\d+|${quantities})\\s+unidades?\\b`));
  return match ? words[match[1]] ?? Number(match[1]) : 1;
}
