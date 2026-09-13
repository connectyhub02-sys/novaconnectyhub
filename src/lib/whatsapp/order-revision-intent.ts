/** An edit request is distinct from accepting a previously displayed order. */
export type CartRevisionIntent =
  | { kind: "add"; productText: string; quantity: number }
  | { kind: "remove"; productText: string; quantity: number | null }
  | { kind: "set_quantity"; productText: string; quantity: number }
  | { kind: "replace"; productText: string; replacementText: string; quantity: number | null };

export type OrderRevisionIntent = (CartRevisionIntent
  | { kind: "payment"; paymentMethod: "pix" | "card" | null }
  | { kind: "delivery"; deliveryText: string }
  | { kind: "cancel" }
  | { kind: "clarify"; reason: "ambiguous" | "multiple_operations" | "negated" | "inquiry"; pendingIntent?: CartRevisionIntent })
  & { preferredPaymentMethod?: "pix" | "card" };

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
const imperativePattern = "adicion[ae]|inclu[ai]|acrescent[ae]|coloca|coloque|bot[ae]|remov[ae]|retir[ae]|tir[ae]|exclu[ai]|aument[ae]|diminua|diminui|reduz[ae]?|troca|troque|substitu[ai]|mud[ae]|alter[ae]|deix[ae]|mantenha|cancel[ae]";
const clauseStart = `${verbPattern}|nao|nunca|nem|eu|voce|quero|prefiro|vou|pode|podemos|poderia|vamos|gostaria|obrigad[oa]|valeu|agradeco|agradecendo|so|apenas|agora|entao|ai`;

function normalized(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isExplicitNoChangeClause(text: string) {
  if (/\bnada (?:menos|mais) que\b/.test(text)) return false;
  const changes = "(?:mudar|mude|muda|alterar|altere|altera|trocar|troque|troca|mexer|mexa|revisar|editar)";
  return new RegExp(`\\b${changes}\\s+(?:absolutamente\\s+)?(?:nada|nenhum(?:a)?\\s+(?:coisa|item|produto|detalhe))\\b`).test(text)
    || /\bnao\s+(?:(?:quero|preciso|precisa|pedi|solicitei)\s+)?(?:de\s+)?nenhum(?:a)?\s+(?:alteracao|mudanca|ajuste|troca)\b/.test(text)
    || new RegExp(`\\bnao\\s+(?:(?:quero|preciso|precisa)\\s+)?${changes}(?:\\s+(?:no|o|meu|esse|este|nesse)\\s+(?:pedido|carrinho))?[.!?]*$`).test(text);
}

function isNegatedRevisionClause(text: string) {
  return /\b(?:nao|nunca|nem)\s+(?:(?:quero|precisa|preciso|pode|vai|deve|e para|era para)\s+)?(?:mais\s+)?(?:que\s+)?(?:voce\s+)?(?:me\s+)?(?:adicion|inclu|acrescent|coloq|coloc|bot|remov|retir|tir|exclu|aument|diminu|reduz|tro|substitu|mud|alter|cancel)/.test(text)
    || /\b(?:nao|nunca|nem)\s+(?:(?:quero|vou|posso)\s+)?(?:pagar|pix|cartao|credito|debito)\b/.test(text)
    || new RegExp(`\\b(?:${verbPattern})\\b.+\\s+nao(?:\\s+(?:viu|ta|por favor))?[,.!?]*$`).test(text);
}

function isCompletedRevisionReference(text: string) {
  return new RegExp(`\\b(?:acabou de|terminou de|conseguiu)\\s+(?:${verbPattern})\\b`).test(text)
    || /\b(?:fez|fizeram|efetuou|concluiu|realizou)\s+(?:a\s+|essa\s+|esta\s+)?(?:troca|alteracao|mudanca|retirada|inclusao)\b/.test(text);
}

/** Segment by speech acts, not every comma: commas inside an address stay intact. */
function revisionSpeech(text: string) {
  // Folding accents preserves offsets for normal Portuguese text. Whitespace is
  // deliberately retained here so returned commands retain their original address.
  text = text.normalize("NFC");
  const folded = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const boundary = new RegExp(`(?:[,;.!?]\\s*|\\s+(?:mas|porem|agora|entao|ai)\\s+)(?=\\b(?:${clauseStart})\\b)`
    + `|\\s+e\\s+(?=\\b(?:${imperativePattern}|nao|prefiro|quero|pode)\\b)`
    + `|\\s+(?:so|apenas|somente)\\s+(?=\\b(?:${imperativePattern})\\b)`
    + "|\\s+(?=(?:(?:so\\s+)?(?:estou\\s+)?(?:obrigad[oa]|valeu|agradeco|agradecendo|agradeci))\\b)"
    + "|\\s+(?=(?:pode(?:mos)?|vamos)\\s+(?:fechar|finalizar|concluir)\\b)", "g");
  const pieces: string[] = [];
  let start = 0;
  for (const match of folded.matchAll(boundary)) {
    pieces.push(text.slice(start, match.index).trim());
    start = match.index! + match[0].length;
  }
  pieces.push(text.slice(start).trim());
  // A short correction belongs to the immediately preceding speech act, even
  // when transcription inserts a comma ("adicione limonada, não").
  for (let index = pieces.length - 1; index > 0; index--) {
    if (/^nao(?:\s+(?:viu|ta|por favor))?[,.!?]*$/.test(normalized(pieces[index]))) {
      pieces[index - 1] = `${pieces[index - 1].replace(/[,;.!?]+$/, "")} ${pieces[index]}`;
      pieces.splice(index, 1);
    }
  }
  const active: string[] = [], ordinary: string[] = [], denied: string[] = [];
  let noChange = false;
  for (let piece of pieces) {
    piece = piece.replace(/^(?:agora|ent[aã]o|a[ií]|mas|por[eé]m)[,:]?\s+/i, "").replace(/\s+/g, " ").trim();
    let segment = normalized(piece);
    if (!segment) continue;
    const thanks = segment.match(/\b(?:obrigad[oa]|valeu|agradeco|agradecemos|agradecendo|agradecer|agradeci|grato|grata)\b/);
    if (thanks) {
      const remainder = piece.slice(thanks.index! + thanks[0].length).replace(/^[,:;!?.\s]+/, "");
      // "Obrigado por tirar" describes what was done; "obrigado, tire" and
      // "obrigado tire" introduce an imperative and must retain that command.
      if (!remainder || /^(?:por|pel[ao]s?|que|a|ao|aos)\b/.test(normalized(remainder))) continue;
      piece = remainder;
      segment = normalized(piece);
    }
    if (isExplicitNoChangeClause(segment)) { noChange = true; continue; }
    if (isCompletedRevisionReference(segment)) continue;
    if (isNegatedRevisionClause(segment)) { denied.push(piece); continue; }
    const hasAction = [...segment.matchAll(actionPattern)].length > 0
      || /^(?:(?:eu\s+)?quero\s+)?mais\s+/.test(segment)
      || /\b(?:quero|prefiro|vou|pagar|pagamento)\b.*\b(?:pix|cartao|credito|debito)\b/.test(segment)
      || /^(?:pix|cartao(?:\s+de)?(?:\s+(?:credito|debito))?|credito|debito)[.!?]*$/.test(segment);
    (hasAction ? active : ordinary).push(piece);
  }
  // A refusal or completed action does not negate a separate, explicit command.
  // Multiple positive commands remain joined, so the parser still refuses to
  // execute just one part of a compound edit.
  return { text: active.length ? active.join(" e ") : denied.length ? denied.join(" e ") : ordinary.join(" "), noChange: noChange && active.length === 0 };
}

/** Shared with confirmation routing: gratitude is not another imperative verb. */
export function normalizeOrderRevisionSpeech(text: string) { return revisionSpeech(text).text; }

/** Only an explicit global refusal of changes can dismiss an unresolved draft. */
export function isOrderRevisionNoChangeIntent(text: string) { return revisionSpeech(text).noChange; }

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
function parseSingleOrderRevisionIntent(text: string): OrderRevisionIntent | null {
  const commandText = normalizeOrderRevisionSpeech(text);
  const input = normalized(commandText);
  if (!input) return null;
  if (/^(?:(?:sim|top|ok|beleza)[,!]?\s+)?(?:(?:pode\s+)?deixa(?:r)?|fica|ficar|mantenha)\s+(?:assim|como esta|igual)[.!]*$/.test(input)) return null;
  if (/\b(?:quanto|qual|calcula|calcule|calcular)\b.*\b(?:frete|taxa de entrega|custo de entrega)\b/.test(input)) return null;

  const actions = [...input.matchAll(actionPattern)];
  const shorthandAdd = input.match(/^(?:(?:sim|top|ok|beleza)[,!.]?\s+)?(?:(?:eu\s+)?quero\s+)?mais\s+(.+)$/);
  const shorthandSet = input.match(/^(?:(?:agora\s+)?(?:eu\s+)?quero|(?:eu\s+)?vou ficar com)\s+(?:so|apenas|somente)\s+(.+)$/);
  const paymentSignal = /\b(?:pix|cartao|credito|debito|forma de pagamento|metodo de pagamento)\b/.test(input);
  const deliverySignal = /\b(?:endereco|entrega|retirada|retirar na loja|cep|frete)\b/.test(input);
  const revisionMention = /\b(?:mudar|alterar|trocar|revisar|editar)\s+(?:o\s+)?(?:pedido|carrinho)\b/.test(input);
  if (!actions.length && !shorthandAdd && !shorthandSet && !paymentSignal && !revisionMention) return null;

  // Hypotheticals and refusals describe changes, but do not authorize any of them.
  if (isNegatedRevisionClause(input)) return clarify("negated");
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
    return { kind: "delivery", deliveryText: commandText.trim() };
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
  // Freight is a quote/price, not a catalog line that can be added or removed.
  if (/^(?:(?:valor|preco|custo|taxa)\s+(?:do|da|de)\s+)?(?:frete|entrega|envio)(?:\s+(?:gratis|gratuit[oa]))?$/.test(product.productText)) return null;
  if (/^(?:pix|cartao(?: de credito| de debito)?|pagamento|(?:forma|metodo) de pagamento|endereco|cep|retirada)$/.test(product.productText)) return clarify();
  if (product.invalid) return clarify();
  if (!isSpecificProduct(product.productText)) {
    const pending = kind === "set_quantity" && explicitQuantity === null && product.quantity === null ? null
      : { kind, productText: product.productText, quantity: explicitQuantity ?? product.quantity ?? (kind === "remove" ? null : 1) } as CartRevisionIntent;
    return pending ? { kind: "clarify", reason: "ambiguous", pendingIntent: pending } : clarify();
  }
  const quantity = explicitQuantity ?? product.quantity;
  if (kind === "set_quantity") return quantity === null ? clarify() : { kind, productText: product.productText, quantity };
  if (quantity === 0) return clarify();
  return kind === "remove"
    ? { kind, productText: product.productText, quantity }
    : { kind, productText: product.productText, quantity: quantity ?? 1 };
}

/** A payment choice may accompany one edit; it never accepts the edited total. */
export function parseOrderRevisionIntent(text: string): OrderRevisionIntent | null {
  const speech = normalizeOrderRevisionSpeech(text);
  const separators = /\s+(?:e|depois)\s+|[;,]\s*/g;
  for (const separator of speech.matchAll(separators)) {
    const left = speech.slice(0, separator.index).trim();
    const right = speech.slice(separator.index! + separator[0].length).trim();
    for (const [editText, paymentText] of [[left, right], [right, left]]) {
      const edit = parseSingleOrderRevisionIntent(editText);
      if (!edit || !("productText" in edit) && !(edit.kind === "clarify" && edit.pendingIntent)) continue;
      // Only an explicit payment command can be stripped from a catalog title.
      const paymentInput = normalized(paymentText).replace(/^(?:(?:me|ja)\s+)*(?:ger[ae]|gerar|gere|mand[ae]|envi[ae]|enviar)\s+(?:(?:um|o|novo|outro|link|codigo|de|do)\s+)*/, "quero pagar ");
      const payment = parseSingleOrderRevisionIntent(paymentInput);
      if (payment?.kind !== "payment" || !payment.paymentMethod) continue;
      return { ...edit, preferredPaymentMethod: payment.paymentMethod };
    }
  }
  return parseSingleOrderRevisionIntent(text);
}

/** Parse an answer to a specific pending edit without inventing a new operation. */
export function parseOrderRevisionClarification(pending: OrderRevisionIntent, text: string): OrderRevisionIntent | null {
  if (!("productText" in pending)) return null;
  const input = normalized(text);
  if (!input || /[?]/.test(input) || /\b(?:nao|nunca|nem|depois|amanha|aguarde|esper[ae]|quanto|qual|como|quando|porque|obrigad[oa]|valeu|sim|confirmo|confirmado)\b/.test(input)
    || parseOrderRevisionIntent(text)) return null;
  const product = extractProduct(input);
  if (product.invalid || !isSpecificProduct(product.productText) || hasUnresolvedList(product.productText)
    || product.quantity !== null && product.quantity < 1) return null;
  return { ...pending, productText: product.productText, quantity: product.quantity ?? pending.quantity } as OrderRevisionIntent;
}

export function parseOrderRevisionTotalQuantity(text: string): number | null {
  const match = normalized(text).match(new RegExp(`^(?:quero\\s+)?(?:ficar\\s+com\\s+)?(?:so\\s+|apenas\\s+)?(${quantityPattern})(?:\\s+(?:unidades?|unid|un|itens?))?(?:\\s+(?:no total|ao todo))?[.!]*$`));
  const quantity = match ? parseQuantity(match[1]) : null;
  return quantity !== null && quantity <= 99 ? quantity : null;
}
