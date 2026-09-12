import { describe, expect, it } from "vitest";
import { parseOrderRevisionIntent, isOrderRevisionNoChangeIntent, normalizeOrderRevisionSpeech } from "../src/lib/whatsapp/order-revision-intent";

describe("explicit revisions after an order has been confirmed", () => {
  it.each([
    ["top faz o seguinte adicione uma limonada", "limonada", 1],
    ["sim, mas inclua duas pizzas de queijo no meu pedido", "pizzas de queijo", 2],
    ["Acrescente 3 limonadas, por favor", "limonadas", 3],
    ["coloque mais uma pizza de tomate no carrinho", "pizza de tomate", 1],
    ["Pode adicionar uma limonada?", "limonada", 1],
    ["quero mais duas pizzas de queijo", "pizzas de queijo", 2],
    ["mais uma limonada", "limonada", 1],
    ["aumente a pizza de queijo em 2 unidades", "pizza de queijo", 2],
    ["aumenta em duas unidades da pizza de queijo", "pizza de queijo", 2],
    ["inclua limonada 500ml", "limonada 500ml", 1],
    ["adicione 2x pizza de queijo", "pizza de queijo", 2],
  ])("applies an addition instead of interpreting an opening acknowledgement: %s", (text, productText, quantity) => {
    expect(parseOrderRevisionIntent(text)).toEqual({ kind: "add", productText, quantity });
  });

  it.each([
    ["sim mas tira a limonada", "limonada", null],
    ["retire a pizza de queijo do pedido", "pizza de queijo", null],
    ["remova uma pizza de queijo", "pizza de queijo", 1],
    ["tira 1 pizza de tomate", "pizza de tomate", 1],
    ["diminua a pizza de queijo em duas unidades", "pizza de queijo", 2],
    ["reduza em 1 unidade da limonada", "limonada", 1],
    ["cancele a limonada", "limonada", null],
  ])("distinguishes whole-line removal from a decrement: %s", (text, productText, quantity) => {
    expect(parseOrderRevisionIntent(text)).toEqual({ kind: "remove", productText, quantity });
  });

  it.each([
    ["reduza a pizza de queijo para 2", "pizza de queijo", 2],
    ["aumente a limonada para cinco unidades", "limonada", 5],
    ["deixe a pizza de tomate para zero", "pizza de tomate", 0],
    ["quero só duas pizzas de queijo", "pizzas de queijo", 2],
    ["deixe apenas uma limonada", "limonada", 1],
    ["reduza a quantidade da pizza de queijo para 2", "pizza de queijo", 2],
    ["aumente para 3 a pizza de queijo", "pizza de queijo", 3],
  ])("uses the requested final count, never a delta: %s", (text, productText, quantity) => {
    expect(parseOrderRevisionIntent(text)).toEqual({ kind: "set_quantity", productText, quantity });
  });

  it.each([
    ["troque a pizza de queijo pela pizza de tomate", "pizza de queijo", "pizza de tomate", null],
    ["substitua a pizza de queijo por duas pizzas de tomate", "pizza de queijo", "pizzas de tomate", 2],
    ["mude a pizza de tomate por limonada", "pizza de tomate", "limonada", null],
  ])("preserves explicit replacement direction: %s", (text, productText, replacementText, quantity) => {
    expect(parseOrderRevisionIntent(text)).toEqual({ kind: "replace", productText, replacementText, quantity });
  });

  it.each([
    ["troque o pix por cartão de crédito", "card"],
    ["muda o cartão para pix", "pix"],
    ["quero pagar no cartão", "card"],
    ["cartão crédito", "card"],
    ["muda a forma de pagamento", null],
    ["muda pra mim, quero pagar no cartão", "card"],
    ["melhor muda pra mim estou sem saldo no pix muda para cartão de credito", "card"],
  ])("routes payment changes without turning payment names into products: %s", (text, paymentMethod) => {
    expect(parseOrderRevisionIntent(text)).toEqual({ kind: "payment", paymentMethod });
  });

  it.each(["mude o endereço para Rua das Flores, número 20", "altere a entrega para retirada na loja"])("routes delivery revision: %s", text => {
    expect(parseOrderRevisionIntent(text)).toEqual({ kind: "delivery", deliveryText: text });
  });

  it.each(["cancele o pedido", "cancela meu pedido inteiro"])("identifies cancellation rather than silently emptying a cart: %s", text => {
    expect(parseOrderRevisionIntent(text)).toEqual({ kind: "cancel" });
  });
});

describe("courtesy, completed actions and the scope of a new command", () => {
  it.each([
    "top pode fechar obrigado por tirar o frete pode fechar",
    "quero alterar nada não so estou agradecendo pelo frete gratis",
    "não quero mudar nada, só estou agradecendo pelo frete grátis",
    "obrigada por retirar a limonada, pode fechar",
    "valeu por trocar o Pix pelo cartão",
    "só queria agradecer por adicionar a pizza e retirar a limonada",
    "você acabou de tirar a pizza, ficou certo",
    "você conseguiu trocar o cartão por Pix, obrigado",
    "você já fez a troca do pedido, pode fechar",
    "sim, pode fechar; obrigado pela alteração",
    "não preciso de nenhuma alteração, obrigado",
    "não precisa mexer no pedido, só agradeci",
  ])("does not turn acknowledgement or a completed action into a new edit: %s", text => {
    expect(parseOrderRevisionIntent(text)).toBeNull();
  });

  it.each([
    ["obrigado por tirar o frete, mas adicione uma limonada", { kind: "add", productText: "limonada", quantity: 1 }],
    ["valeu por adicionar pizza e tire a limonada", { kind: "remove", productText: "limonada", quantity: null }],
    ["não tire a pizza; adicione uma limonada", { kind: "add", productText: "limonada", quantity: 1 }],
    ["quero alterar nada não, mas acrescente uma limonada", { kind: "add", productText: "limonada", quantity: 1 }],
    ["não mude nada só adicione uma limonada", { kind: "add", productText: "limonada", quantity: 1 }],
    ["troque a pizza por limonada não, prefiro pagar no cartão", { kind: "payment", paymentMethod: "card" }],
    ["não quero Pix, muda para cartão", { kind: "payment", paymentMethod: "card" }],
    ["você acabou de adicionar pizza. Agora reduza a pizza para 1", { kind: "set_quantity", productText: "pizza", quantity: 1 }],
    ["adicione uma limonada, obrigado por tirar o frete", { kind: "add", productText: "limonada", quantity: 1 }],
    ["obrigado adicione uma limonada", { kind: "add", productText: "limonada", quantity: 1 }],
    ["obrigada reduza a pizza para 1", { kind: "set_quantity", productText: "pizza", quantity: 1 }],
    ["não quero alterar nada, eu quero mais uma limonada", { kind: "add", productText: "limonada", quantity: 1 }],
    ["adicione uma limonada, não, tire a pizza", { kind: "remove", productText: "pizza", quantity: null }],
    ["obrigado por não alterar nada, mas adicione limonada", { kind: "add", productText: "limonada", quantity: 1 }],
  ])("preserves a separate positive instruction while discarding non-command clauses: %s", (text, expected) => {
    expect(parseOrderRevisionIntent(text as string)).toEqual(expected);
    expect(isOrderRevisionNoChangeIntent(text as string)).toBe(false);
  });

  it.each([
    "quero alterar nada não so estou agradecendo pelo frete gratis",
    "não quero nenhuma alteração",
    "não precisa mudar nada",
    "não precisa mexer no pedido, obrigado",
  ])("exposes an explicit no-change declaration for pending-draft recovery: %s", text => {
    expect(isOrderRevisionNoChangeIntent(text)).toBe(true);
    expect(parseOrderRevisionIntent(text)).toBeNull();
  });

  it.each(["obrigado por tirar frete", "obrigado por não alterar nada", "valeu por não mudar nada", "sim pode fechar", "não tire a pizza", "mude o endereço para Rua das Flores, 20"])("does not mistake courtesy, denial of one item or a real edit for a global no-change declaration: %s", text => {
    expect(isOrderRevisionNoChangeIntent(text)).toBe(false);
  });

  it.each(["tire o frete", "reduza o valor do frete para 10", "retire a taxa de entrega", "quanto fica o frete?"])("leaves freight pricing to the delivery/pricing flow rather than inventing a catalog product: %s", text => {
    expect(parseOrderRevisionIntent(text)).toBeNull();
  });

  it.each(["troque a pizza por limonada não", "tire a limonada não", "adicione uma pizza não, obrigado", "adicione uma limonada, não", "tire a pizza; não", "mude para cartão, não, obrigado"])("does not execute a command withdrawn after its verb: %s", text => {
    expect(parseOrderRevisionIntent(text)).toEqual({ kind: "clarify", reason: "negated" });
  });

  it("keeps a delivery address intact when a separate courtesy clause is removed", () => {
    const command = "mude o endereço para Rua das Flores, número 20, Centro";
    expect(parseOrderRevisionIntent(`Obrigado por tirar o frete, agora ${command}`)).toEqual({ kind: "delivery", deliveryText: command });
  });
  it("exposes the remaining approval without a completed freight-removal verb", () => {
    expect(normalizeOrderRevisionSpeech("top pode fechar obrigado por tirar o frete pode fechar")).toBe("top pode fechar pode fechar");
    expect(normalizeOrderRevisionSpeech("obrigado, tira o frete")).toBe("tira o frete");
    expect(normalizeOrderRevisionSpeech("obrigado tire o frete")).toBe("tire o frete");
  });
});

describe("a revision parser never invents consent or partially applies an ambiguous request", () => {
  it.each([
    "não adicione a pizza de queijo",
    "não quero tirar a limonada",
    "não precisa mudar o cartão para pix",
    "não quero que você troque a pizza de queijo",
    "não quero pagar no pix",
  ])("keeps a negated edit out of checkout confirmation: %s", text => {
    expect(parseOrderRevisionIntent(text)).toEqual({ kind: "clarify", reason: "negated" });
  });

  it.each([
    "se eu adicionar uma pizza de queijo?",
    "tem como trocar a pizza por limonada?",
    "consigo reduzir a pizza de queijo para duas?",
    "quanto fica no cartão?",
    "talvez tire a limonada",
    "preciso saber se pode adicionar uma limonada",
    "como adicionar uma limonada?",
    "pix tem taxa?",
  ])("does not apply hypothetical changes or capability questions: %s", text => {
    expect(parseOrderRevisionIntent(text)).toEqual({ kind: "clarify", reason: "inquiry" });
  });

  it.each([
    "adicione pizza de queijo e tire a limonada",
    "adicione uma pizza e duas limonadas",
    "sim mas tira pizza e muda para pix",
    "mude o endereço e o método de pagamento para pix",
    "troque pizza pela limonada e mude para cartão",
  ])("requires clarification before compound changes: %s", text => {
    expect(parseOrderRevisionIntent(text)).toMatchObject({ kind: "clarify" });
  });

  it.each([
    "adicione isso",
    "aumente o pedido",
    "reduza a pizza",
    "deixe a pizza",
    "troque a pizza",
    "adicione 0 pizza",
    "adicione -2 pizza",
    "adicione 1,5 pizza",
    "adicione meia pizza",
    "adicione 100001 pizzas",
    "adicione onze pizzas",
    "adicione algumas pizzas",
    "retire a segunda pizza de queijo",
    "troque 2 pizzas de queijo por uma pizza de tomate",
    "troque a pizza de queijo por 0 limonadas",
    "quero pagar pix e cartão",
    "quero mudar o pedido",
  ])("does not guess missing targets, invalid counts, or unsupported combinations: %s", text => {
    expect(parseOrderRevisionIntent(text)).toMatchObject({ kind: "clarify" });
  });

  it.each(["sim", "top", "pode fechar", "obrigado", "quanto custa a pizza?", "oi", "", "sim deixa assim", "fica como está", "meu cartão chegou"])("leaves ordinary conversation and approval to the caller: %s", text => {
    expect(parseOrderRevisionIntent(text)).toBeNull();
  });
});
