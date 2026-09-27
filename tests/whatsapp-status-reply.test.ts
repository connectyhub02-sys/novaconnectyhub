import { describe, expect, it } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";

const reply = (contextInfo: Record<string, unknown>) => ({
  id: "m1", direction: "inbound", provider_message_id: "3EB0REPLY", text_content: "Boa noite quanto que tá essa",
  payload: { message: { content: { text: "Boa noite quanto que tá essa", contextInfo } } },
});

describe("reply to the agent's status post", () => {
  it("recognizes the quoted status, its id and caption", () => {
    const call = runtimeHarness();
    expect(call("readQuotedStatus", reply({ stanzaID: "3EB01B498AAD96E65C7978", remoteJID: "status@broadcast",
      quotedMessage: { imageMessage: { caption: "Enantato de Testosterona Power Lab" } } }))).toEqual({ stanzaId: "3EB01B498AAD96E65C7978", caption: "Enantato de Testosterona Power Lab", kind: "image" });
  });

  it("knows a status with only an image (then the media is downloaded) and ignores normal quotes", () => {
    const call = runtimeHarness();
    expect(call("readQuotedStatus", reply({ stanzaID: "X", remoteJID: "status@broadcast", quotedMessage: { imageMessage: {} } }))).toEqual({ stanzaId: "X", caption: null, kind: "image" });
    expect(call("readQuotedStatus", reply({ stanzaID: "X", remoteJID: "554788577996@s.whatsapp.net", quotedMessage: { conversation: "oi" } }))).toBeNull();
  });
});
