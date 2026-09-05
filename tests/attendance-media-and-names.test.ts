import { describe, expect, it } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { classifyWhatsappLeadDisplayName, resolveLeadDisplayName, resolveLeadPersonalName } from "@/lib/whatsapp/lead-names";
import type * as Media from "@/lib/whatsapp/message-media";

const media = serverModuleHarness<typeof Media>("src/lib/whatsapp/message-media.ts");
const message = (type: string | null, payload: Record<string, unknown> = {}): Media.ConversationMessageMediaInput => ({
  id: "message-1", message_type: type, provider_message_id: "provider-1", provider_chat_id: "chat-1", text_content: "Posso fechar o pedido?", payload,
});

describe("delivered WhatsApp media", () => {
  it.each(["text", "Conversation", "ExtendedTextMessage", "InteractiveMessage", null])("does not invent audio from metadata on %s", (type) => {
    const resolved = media.resolveConversationMessageMedia(message(type, {
      delivery_mode: "text", intended_delivery_mode: "audio", generated_audio_media_id: null,
      audio_fallback: false, interactive_button: true, provider_response: { checkoutUrl: "https://example.test/pay" },
    }), { proxyBasePath: "/media" });
    expect(resolved).toEqual({ kind: "unknown", url: null, directUrl: null, mimeType: null, fileName: null, transcription: null });
  });

  it("ignores null audio identifiers even when delivery mode is absent", () => {
    expect(media.resolveConversationMessageMedia(message(null, { generated_audio_media_id: null, audio_fallback: false })).kind).toBe("unknown");
  });

  it("uses actual text delivery after a voice failure", () => {
    const resolved = media.resolveConversationMessageMedia(message("audio", {
      delivery_mode: "text", intended_delivery_mode: "audio", audio_fallback: true,
      generated_audio_media_id: "generated-but-unsent", provider_response: { audioUrl: "https://example.test/unsent.mp3" },
    }));
    expect(resolved.kind).toBe("unknown");
    expect(resolved.url).toBeNull();
  });

  it("does not interpret body or quoted voice as current media", () => {
    const resolved = media.resolveConversationMessageMedia(message(null, {
      text: "Manda um áudio com a foto do documento e o vídeo",
      message: { contextInfo: { quotedMessage: { audioMessage: { mimetype: "audio/ogg", url: "https://example.test/quoted.ogg" } } } },
    }));
    expect(resolved.kind).toBe("unknown");
    expect(resolved.url).toBeNull();
    expect(resolved.mimeType).toBeNull();
  });

  it.each(["audio", "AudioMessage", "ptt"]) ("keeps true %s playable through the proxy", (type) => {
    const resolved = media.resolveConversationMessageMedia(message(type, {
      message: { content: { mimetype: "audio/ogg", URL: "unused", url: "https://example.test/voice.ogg" } },
      media_transcription: { provider: "test", transcribed_at: "2026-09-05T15:00:00Z" },
    }), { proxyBasePath: "/media" });
    expect(resolved.kind).toBe("audio");
    expect(resolved.url).toBe("/media/message-1");
    expect(resolved.directUrl).toBe("https://example.test/voice.ogg");
    expect(resolved.transcription?.provider).toBe("test");
  });

  it("recognizes structural incoming voice without a row type", () => {
    expect(media.resolveConversationMessageMedia(message(null, { message: { audioMessage: { url: "https://example.test/a.ogg" } } })).kind).toBe("audio");
  });

  it.each([["ImageMessage", "image", "image/jpeg"], ["VideoMessage", "video", "video/mp4"], ["DocumentMessage", "document", "application/pdf"]])("preserves %s despite a quoted voice", (type, kind, mime) => {
    const resolved = media.resolveConversationMessageMedia(message(type, { message: {
      content: { mimetype: mime, url: "https://example.test/current" },
      quotedMessage: { audioMessage: { mimetype: "audio/ogg", url: "https://example.test/quoted.ogg" } },
    } }));
    expect(resolved.kind).toBe(kind);
    expect(resolved.directUrl).toBe("https://example.test/current");
  });

  it("does not derive audio from a download hostname", () => {
    expect(media.resolveConversationMessageMedia(message(null, { fileUrl: "https://audio.example.test/receipt.pdf" })).kind).toBe("document");
  });
});

describe("lead identities", () => {
  it.each(["Qual o valor", "quanto custa", "Pode gerar o Pix", "sim pode aguardando", "Boa tarde", "quero comprar", "me manda o preço", "Você tem estoque?"])("rejects conversation fragment %s", (name) => {
    expect(classifyWhatsappLeadDisplayName(name)).toBe("unknown");
    expect(resolveLeadPersonalName({ displayName: name, metadata: { person_name: name, lead_memory: { personName: name } } })).toBeNull();
  });
  it.each(["Maria da Conceição", "João Pedro", "Ana Vitória", "José de Sá", "Cláudio Silva", "Carolina Alves"])("preserves real name %s", (name) => {
    expect(resolveLeadPersonalName({ displayName: name })).toBe(name);
  });
  it("prefers the saved contact over an inferred memory", () => {
    expect(resolveLeadPersonalName({ metadata: { person_name: "Maria Silva", lead_memory: { personName: "Outra Pessoa" } } })).toBe("Maria Silva");
  });
  it("shows the WhatsApp profile without turning it into a billing identity", () => {
    const input = { displayName: "Qual o valor", metadata: { whatsapp_display_name: "Maria Silva" } };
    expect(resolveLeadDisplayName(input)).toBe("Maria Silva");
    expect(resolveLeadPersonalName(input)).toBeNull();
  });
});
