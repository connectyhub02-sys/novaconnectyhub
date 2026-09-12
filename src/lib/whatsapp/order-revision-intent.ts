/** An edit request is distinct from accepting a previously displayed order. */
export type OrderRevisionIntent =
  | { kind: "add"; productText: string; quantity: number }
  | { kind: "remove"; productText: string; quantity: number | null }
  | { kind: "set_quantity"; productText: string; quantity: number }
  | { kind: "replace"; productText: string; replacementText: string; quantity: number | null }
  | { kind: "payment"; paymentMethod: "pix" | "card" | null }
  | { kind: "delivery"; deliveryText: string }
  | { kind: "cancel" }
  | { kind: "clarify"; reason: "ambiguous" | "multiple_operations" | "negated" | "inquiry" };

const quantityWords: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4,
  cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};
const quantityPattern = "(?:\\d+|zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)";
const verbs = {
  add: "adicion(?:a|ar|e)|inclu(?:a|i|ir)|acrescent(?:a|ar|e)|colo(?:ca|car|que)|bot(?:a|ar|e)",
  remove: "remov(?:a|e|er)|retir(?:a|ar|e)|tir(?:a|ar|e)|exclu(?:a|i|ir)",
  increase: "aument(?:a|ar|e)",
  decrease: "diminu(?:a|i|ir)|reduz(?:a|ir)?|reduze",
  replace: "tro(?:ca|car|que)|substitu(?:a|i|ir)|mud(?:a|ar|e)|alter(?:a|ar|e)",
  set: "deix(?:a|ar|e)|fic(?:a|ar|o)|mantenh(?:a|o)",
  cancel: "cancel(?:a|ar|e)",
};
const verbPattern = Object.values(verbs).join("|");
const actionPattern = new RegExp(`\\b(${verbPattern})\\b`, "g");
const contextSuffix = /\s+(?:(?:no|do|ao|nesse|neste|desse|deste|pro|para o|pra o)\s+(?:meu\s+)?(?:pedido|carrinho)|(?:por|fazendo|faca)\s+favor|por gentileza|para mim|pra mim|tambem|a mais|junto)\s*$/;

function normalized(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function clarify(reason: Extract<OrderRevisionIntent, { kind: "clarify" }>["reason"] = "ambiguous"): OrderRevisionIntent {
  return { kind: "clarify", reason };
}

function cleanProduct(text: string) {
  let product = text.trim().replace(/^[,.:;!?\s]+|[,.:;!?\s]+$/g, "");
  for (;;) {
    const cleaned = product.replace(contextSuffix, "");
    if (cleaned === product) break;
    product = cleaned;
  }
  return product
    .replace(/^(?:(?:o|a|os|as|de|da|do|das|dos|mais|apenas|so|somente)\s+)+/, "")
    .replace(/^quantidade\s+(?:de|da|do|das|dos)\s+/, "")
    .replace(/\s+(?:por favor|por gentileza)$/, "")
    .replace(/^[,.:;!?\s]+|[,.:;!?\s]+$/g, "")
    .trim();
}

function parseQuantity(value: string) {
  const quantity = quantityWords[value] ?? Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= 100000 ? quantity : null;
}

/** Quantities must be separate tokens: a title's size (e.g. 500ml) is not a count. */
function extractProduct(text: string): { productText: string; quantity: number | null; invalid: boolean } {
  let productText = cleanProduct(text);
  if (/^(?:-\s*\d|\d+[.,/]\d|meia?\b|metade\b|onze\b|doze\b|treze\b|catorze\b|quatorze\b|quinze\b|dezesseis\b|dezessete\b|dezoito\b|dezenove\b|vinte\b|trinta\b|quarenta\b|cinquenta\b|sessenta\b|setenta\b|oitenta\b|noventa\b|cem\b|cento\b|mil\b|algum\w*\b|vari[oa]s\b|primeir[oa]\b|segund[oa]\b|terceir[oa]\b)/.test(productText)) {
    return { productText, quantity: null, invalid: true };
  }
  const prefix = productText.match(new RegExp(`^(${quantityPattern})\\s*(?:x\\s*|(?:unidades?|unid|un|itens?|pecas?)\\s+(?:de\\s+)?)?\\s+(.+)$`));
  if (prefix) {
    productText = cleanProduct(prefix[2]);
    return { productText, quantity: parseQuantity(prefix[1]), invalid: parseQuantity(prefix[1]) === null };
  }
  const suffix = productText.match(new RegExp(`^(.+?)\\s+(?:x\\s*)?(${quantityPattern})\\s+(?:unidades?|unid|un|itens?|pecas?)$`));
  if (suffix) {
    return { productText: cleanProduct(suffix[1]), quantity: parseQuantity(suffix[2]), invalid: parseQuantity(suffix[2]) === null };
  }
  return { productText, quantity: null, invalid: false };
}

function isSpecificProduct(text: string) {
  return Boolean(text) && !/^(?:isso|isto|esse|essa|ele|ela|deles|delas|tudo|algo|alguma coisa|produto|produtos|item|itens|pedido|carrinho|quantidade|unidades?|mais|menos|outro|outra|um|uma)$/.test(text);
}

function hasUnresolvedList(text: string) {
  // Multiple targets require catalog-aware disambiguation; never apply only the first.
  return /(?:\s(?:e|ou)\s|[,;]|\s\+\s)/.test(text);
}

/**
 * Parses a single explicit edit, independently from catalog identity and stock.
 * A clarify result must block confirmation/recovery of the previous checkout.
 * Catalog matching, authorization, persistence and payment safety belong to the caller.
 */
export function parseOrderRevisionIntent(text: string): OrderRevisionIntent | null {
  const input = normalized(text);
  if (!input) return null;
  if (/^(?:(?:sim|top|ok|beleza)[,!]?\s+)?(?:(?:pode\s+)?deixa(?:r)?|fica|ficar|mantenha)\s+(?:assim|como esta|igual)[.!]*$/.test(input)) return null;

  const actions = [...input.matchAll(actionPattern)];
  const shorthandAdd = input.match(/^(?:(?:sim|top|ok|beleza)[,!.]?\s+)?(?:(?:eu\s+)?quero\s+)?mais\s+(.+)$/);
  const shorthandSet = input.match(/^(?:(?:agora\s+)?(?:eu\s+)?quero|(?:eu\s+)?vou ficar com)\s+(?:so|apenas|somente)\s+(.+)$/);
  const paymentSignal = /\b(?:pix|cartao|credito|debito|forma de pagamento|metodo de pagamento)\b/.test(input);
  const deliverySignal = /\b(?:endereco|entrega|retirada|retirar na loja|cep|frete)\b/.test(input);
  const revisionMention = /\b(?:mudar|alterar|trocar|revisar|editar)\s+(?:o\s+)?(?:pedido|carrinho)\b/.test(input);
  if (!actions.length && !shorthandAdd && !shorthandSet && !paymentSignal && !revisionMention) return null;

  // Hypotheticals and refusals describe changes, but do not authorize any of them.
  if (/\b(?:nao|nunca|nem)\s+(?:(?:quero|precisa|preciso|pode|vai|deve|e para|era para)\s+)?(?:mais\s+)?(?:que\s+)?(?:voce\s+)?(?:me\s+)?(?:adicion|inclu|acrescent|coloq|coloc|bot|remov|retir|tir|exclu|aument|diminu|reduz|tro|substitu|mud|alter|cancel)/.test(input)) return clarify("negated");
  if (paymentSignal && /\b(?:nao|nunca|nem)\s+(?:(?:quero|vou|posso)\s+)?(?:pagar|pix|cartao|credito|debito)\b/.test(input)) return clarify("negated");
  if (/\b(?:se eu|se voce|caso eu|caso voce|e se|suponha|hipoteticamente|talvez|quem sabe)\b/.test(input)
    || /\b(?:consigo|posso|e possivel|seria possivel|tem como|da para|da pra|como faco para|como faz para|quanto|qual|quais)\b/.test(input)
    || /\b(?:como|quando)\s+(?:eu|voce|adicion|remov|retir|reduz|aument|tro|mud|alter)/.test(input)
    || /\b(?:saber|explicar)\b.*\b(?:se|como)\b/.test(input)
    || (paymentSignal && /\b(?:tem taxa|tem juros|aceita|aceitam|diferenca|funciona)\b/.test(input))) return clarify("inquiry");
  if (actions.length > 1) {
    // Speech may repeat the same payment request. Every clause must still be about payment.
    const repeatsPayment = paymentSignal && actions.every((action, index) =>
      new RegExp(`^(?:${verbs.replace})$`).test(action[0])
      && /\b(?:pix|cartao|credito|debito|pagamento)\b/.test(input.slice(action.index, actions[index + 1]?.index)),
    );
    if (!repeatsPayment) return clarify("multiple_operations");
  }

  const verb = actions[0]?.[0] ?? "";
  const afterVerb = actions[0] ? input.slice(actions[0].index! + verb.length).trim() : input;
  const isVerb = (kind: keyof typeof verbs) => new RegExp(`^(?:${verbs[kind]})$`).test(verb);

  if (paymentSignal && (isVerb("replace") || !actions.length)) {
    if (deliverySignal) return clarify("multiple_operations");
    if (!actions.length && !/\b(?:quero|prefiro|vou|vamos|pode|poderia|gostaria|decidi|escolho|pagar|pagamento)\b/.test(input)
      && !/^(?:(?:sim|top|ok|beleza)[,.!]?\s+)?(?:(?:no|por|pelo|com)\s+)?(?:pix|cartao(?:\s+de)?(?:\s+(?:credito|debito))?|credito|debito)[.!?]*$/.test(input)) return null;
    const destination = input.match(/\b(?:para|pra|por|pelo|pela|no|na)\s+(?:o\s+|a\s+)?(pix|cartao|credito|debito)\b/g)?.at(-1);
    const hasPix = /\bpix\b/.test(input);
    const hasCard = /\b(?:cartao|credito|debito)\b/.test(input);
    if (hasPix && hasCard && (!destination || /\b(?:e|ou)\s+(?:no\s+|na\s+)?(?:pix|cartao|credito|debito)\b/.test(input))) return clarify();
    return { kind: "payment", paymentMethod: destination ? (/\bpix\b/.test(destination) ? "pix" : "card") : hasPix ? "pix" : hasCard ? "card" : null };
  }
  if (deliverySignal && (isVerb("replace") || isVerb("set"))) {
    return { kind: "delivery", deliveryText: text.trim() };
  }
  if (isVerb("cancel") && /^(?:(?:o|meu|esse|este|todo|inteiro)\s+)*(?:pedido|carrinho)(?:\s+(?:inteiro|todo))?[.!?]*$/.test(afterVerb)) return { kind: "cancel" };

  let kind: "add" | "remove" | "set_quantity" | "replace";
  let productSource: string;
  let explicitQuantity: number | null = null;
  if (shorthandAdd && !actions.length) {
    kind = "add";
    productSource = shorthandAdd[1];
  } else if (shorthandSet && !actions.length) {
    kind = "set_quantity";
    productSource = shorthandSet[1];
  } else if (isVerb("add")) {
    kind = "add";
    productSource = afterVerb;
  } else if (isVerb("remove") || isVerb("cancel")) {
    kind = "remove";
    productSource = afterVerb;
  } else if (isVerb("increase") || isVerb("decrease") || isVerb("set")) {
    const target = afterVerb.match(new RegExp(`^(.+?)\\s+(?:para|pra|em)\\s+(${quantityPattern})(?:\\s+(?:unidades?|unid|un|itens?))?[.!?]*$`));
    const targetFirst = afterVerb.match(new RegExp(`^(?:para|pra)\\s+(${quantityPattern})\\s+(?:unidades?\\s+)?(.+)$`));
    const deltaFirst = afterVerb.match(new RegExp(`^(?:em\\s+)?(${quantityPattern})\\s+(?:unidades?\\s+)?(?:de\\s+|da\\s+|do\\s+)?(.+)$`));
    if (target) {
      explicitQuantity = parseQuantity(target[2]);
      if (explicitQuantity === null) return clarify();
      kind = /\s(?:para|pra)\s/.test(target[0]) || isVerb("set") ? "set_quantity" : isVerb("increase") ? "add" : "remove";
      productSource = target[1];
    } else if (targetFirst) {
      explicitQuantity = parseQuantity(targetFirst[1]);
      if (explicitQuantity === null) return clarify();
      kind = "set_quantity";
      productSource = targetFirst[2];
    } else if (deltaFirst && !isVerb("set")) {
      explicitQuantity = parseQuantity(deltaFirst[1]);
      if (explicitQuantity === null) return clarify();
      kind = isVerb("increase") ? "add" : "remove";
      productSource = deltaFirst[2];
    } else if (isVerb("set")) {
      kind = "set_quantity";
      productSource = afterVerb.replace(/^(?:com\s+)?(?:apenas|so|somente)\s+/, "");
    } else return clarify();
  } else if (isVerb("replace")) {
    kind = "replace";
    productSource = afterVerb;
  } else return revisionMention || actions.length ? clarify() : null;

  if (kind === "replace") {
    const parts = productSource.match(/^(.+?)\s+(?:por|pelo|pela|para|pra)\s+(.+)$/);
    if (!parts || hasUnresolvedList(parts[1]) || hasUnresolvedList(parts[2])) return clarify();
    const oldProduct = extractProduct(parts[1]);
    const newProduct = extractProduct(parts[2]);
    if (oldProduct.invalid || newProduct.invalid || !isSpecificProduct(oldProduct.productText) || !isSpecificProduct(newProduct.productText)) return clarify();
    // Partial replacement needs both a removal count and an addition count; that is a compound edit.
    if (oldProduct.quantity !== null) return clarify();
    if (newProduct.quantity === 0) return clarify();
    return { kind, productText: oldProduct.productText, replacementText: newProduct.productText, quantity: newProduct.quantity };
  }

  if (hasUnresolvedList(cleanProduct(productSource))) return clarify("multiple_operations");
  const product = extractProduct(productSource);
  if (product.invalid || !isSpecificProduct(product.productText)) return clarify();
  const quantity = explicitQuantity ?? product.quantity;
  if (kind === "set_quantity") return quantity === null ? clarify() : { kind, productText: product.productText, quantity };
  if (quantity === 0) return clarify();
  return kind === "remove"
    ? { kind, productText: product.productText, quantity }
    : { kind, productText: product.productText, quantity: quantity ?? 1 };
}
