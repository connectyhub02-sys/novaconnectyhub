import { describe, expect, it } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { normalizeWhatsappBehaviorConfig } from "../src/lib/whatsapp/agent-behavior";

let sequence = 0;
function message(text: string, options: { type?: string; minutesAgo?: number; direction?: string } = {}) {
  sequence += 1;
  return {
    id: `m${sequence}`,
    provider_message_id: `p${sequence}`,
    provider_chat_id: "5511999999999@s.whatsapp.net",
    direction: options.direction ?? "inbound",
    message_type: options.type ?? "text",
    text_content: text,
    payload: {},
    occurred_at: new Date(Date.parse("2026-09-30T20:00:00Z") - (options.minutesAgo ?? 0) * 60_000).toISOString(),
  };
}

function mirrorContext(messages: unknown[], overrides: Record<string, unknown> = {}) {
  const behavior = normalizeWhatsappBehaviorConfig({ agentEnabled: true, responseMode: "mirror", audioVoiceId: "gemini:kore",
    spontaneousAudio: false, mirrorTextFallbackProbability: 0, ...overrides });
  return { behavior, run: { id: "run" }, conversationId: "conv", providerMessageId: "p", messageType: "text", linkButtons: [], lead: {}, agent: {}, messages };
}

describe("audio or text reply requests", () => {
  const runtime = runtimeHarness();
  const asksText = (text: string) => runtime<boolean>("leadExplicitlyRequestsTextReply", message(text));
  const asksAudio = (text: string) => runtime<boolean>("leadExplicitlyRequestsAudioReply", message(text));

  it("does not read ordinary sentences as a request for text", () => {
    // Real audio to Eliane that was answered in text.
    expect(asksText("Elaine, o que que eu preciso pagar aqui? Veio aqui essa mensagem, mas não veio nada para eu pagar plano, nada ainda.")).toBe(false);
    expect(asksText("Escreve meu nome certo no pedido")).toBe(false);
    expect(asksText("Te mando mensagem amanhã no WhatsApp")).toBe(false);
    expect(asksText("Tô sem tempo, manda áudio")).toBe(false);
  });

  it("still honors real requests for text", () => {
    for (const text of ["Me manda por texto", "Prefiro texto", "Não consigo ouvir áudio agora", "Não manda áudio", "Sem áudio, por favor", "Pode mandar por escrito?", "Estou numa reunião, digita pra mim"]) {
      expect([text, asksText(text)]).toEqual([text, true]);
    }
  });

  it("recognizes a request for audio", () => {
    for (const text of ["Me manda um áudio, estou no trânsito", "Grava um áudio explicando", "Pode responder em áudio?", "Prefiro áudio", "Não consigo ler agora", "Tô dirigindo"]) {
      expect([text, asksAudio(text)]).toEqual([text, true]);
    }
    expect(asksAudio("Não manda áudio")).toBe(false);
    expect(asksAudio("Ouvi seu áudio, obrigado")).toBe(false);
  });

  it("answers in audio after the lead asks, even when they keep writing, until they ask for text again", () => {
    const request = message("Me manda um áudio, estou no trânsito", { minutesAgo: 5 });
    const latest = message("E qual o valor da entrega?");
    expect(runtime("shouldSendAudioResponse", mirrorContext([request, latest]), latest)).toBe(true);

    const backToText = message("Pode voltar a mandar por texto", { minutesAgo: 1 });
    expect(runtime("shouldSendAudioResponse", mirrorContext([request, backToText, latest]), latest)).toBe(false);

    const old = message("Me manda um áudio", { minutesAgo: 90 });
    expect(runtime("shouldSendAudioResponse", mirrorContext([old, latest]), latest)).toBe(false);
  });

  it("keeps text-only agents in text", () => {
    const latest = message("Me manda um áudio");
    expect(runtime("shouldSendAudioResponse", mirrorContext([latest], { responseMode: "text" }), latest)).toBe(false);
  });

  it("mirrors an audio that mentions a message with audio", () => {
    const audio = message("Preciso pagar aqui? Veio essa mensagem", { type: "AudioMessage" });
    expect(runtime("shouldSendAudioResponse", mirrorContext([audio]), audio)).toBe(true);
  });
});
