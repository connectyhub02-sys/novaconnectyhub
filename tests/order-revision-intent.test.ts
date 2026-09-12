import { describe, expect, it } from "vitest";
import { parseOrderRevisionIntent } from "../src/lib/whatsapp/order-revision-intent";

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
