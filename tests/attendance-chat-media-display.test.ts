import { describe, expect, it } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type * as Media from "@/lib/whatsapp/message-media";

const media = serverModuleHarness<typeof Media>("src/lib/whatsapp/message-media.ts");
const message = (type: string | null, payload: Record<string, unknown> = {}, text: string | null = null): Media.ConversationMessageMediaInput => ({
  id: "message-1", message_type: type, provider_message_id: "owner:ABC", provider_chat_id: "chat-1", text_content: text, payload,
});
const whatsappImage = { messageType: "ImageMessage", type: "media", content: { URL: "https://mmg.whatsapp.net/v/t62/file.enc?x=1", mimetype: "image/jpeg" } };

describe("attendance chat media display", () => {
  it("shows the lead's photo through the proxy, never the encrypted WhatsApp link", () => {
    const resolved = media.resolveConversationMessageMedia(message("ImageMessage", { message: whatsappImage }), { proxyBasePath: "/api/dashboard/attendance/media" });
    expect(resolved.kind).toBe("image");
    expect(resolved.url).toBe("/api/dashboard/attendance/media/message-1");
    expect(media.isEncryptedWhatsappMediaUrl(resolved.directUrl)).toBe(true);
  });

  it("recognizes stickers and videos", () => {
    expect(media.resolveConversationMessageMedia(message("StickerMessage", { message: { ...whatsappImage, messageType: "StickerMessage", content: { ...whatsappImage.content, mimetype: "image/webp" } } }), { proxyBasePath: "/m" }).kind).toBe("sticker");
    expect(media.resolveConversationMessageMedia(message("VideoMessage", { message: { ...whatsappImage, messageType: "VideoMessage", content: { ...whatsappImage.content, mimetype: "video/mp4" } } }), { proxyBasePath: "/m" }).kind).toBe("video");
  });

  it("shows the product photo the agent sent with its caption", () => {
    const resolved = media.resolveConversationMessageMedia(message("text", {
      delivery_mode: "text", sent_media: { kind: "image", url: "https://storage.example.test/product.jpg" },
    }, "Enantato 10ml | R$ 269,99"), { proxyBasePath: "/m" });
    expect(resolved).toMatchObject({ kind: "image", url: "https://storage.example.test/product.jpg" });
  });

  it("keeps plain texts and reactions as text", () => {
    expect(media.resolveConversationMessageMedia(message("Conversation", {}, "😂"), { proxyBasePath: "/m" }).kind).toBe("unknown");
    expect(media.resolveConversationMessageMedia(message("ReactionMessage", { message: { messageType: "ReactionMessage", type: "reaction", text: "👍", content: { key: { ID: "XYZ" }, text: "👍" } } }, "👍"), { proxyBasePath: "/m" }).kind).toBe("unknown");
  });

  it("does not treat our own storage links as encrypted", () => {
    expect(media.isEncryptedWhatsappMediaUrl("https://storage.example.test/product.jpg")).toBe(false);
    expect(media.isEncryptedWhatsappMediaUrl(null)).toBe(false);
  });
});
