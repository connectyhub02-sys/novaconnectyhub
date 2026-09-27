import { describe, expect, it } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";

type Message = { id: string; direction: string; payload: unknown; text_content: string };
const from = (id: string, sender: string, text: string): Message => ({ id, direction: "inbound", text_content: text,
  payload: { message: { sender: "202997669847166:2@lid", sender_pn: `${sender}@s.whatsapp.net`, chatid: "120363404228732400@g.us" } } });
const reply = (id: string, text: string): Message => ({ id, direction: "outbound", text_content: text, payload: {} });

describe("group conversations, one participant at a time", () => {
  it("reads the real number behind a hidden id", () => {
    const call = runtimeHarness();
    expect(call("readGroupSender", from("1", "554788577996", "oi").payload)).toBe("554788577996@s.whatsapp.net");
    expect(call("readGroupSender", { message: { sender: "123@lid" } })).toBeNull();
  });

  it("keeps only the participant's questions and the replies they received", () => {
    const call = runtimeHarness();
    const messages = [
      from("a1", "554788577996", "qual produto para secar?"),
      reply("r1", "Para secar, o Turinabol..."),
      from("b1", "554799990000", "boa tarde Luna"),
      reply("r2", "Boa tarde!"),
      from("a2", "554788577996", "como eu compro?"),
      from("b2", "554799990000", "quero definição"),
    ];
    expect(call<Message[]>("sliceGroupThread", messages, "554788577996@s.whatsapp.net").map(message => message.id)).toEqual(["a1", "r1", "a2"]);
    expect(call<Message[]>("sliceGroupThread", messages, "554799990000@s.whatsapp.net").map(message => message.id)).toEqual(["b1", "r2", "b2"]);
  });

  it("mentions the real number of who asked, never the hidden id", () => {
    const call = runtimeHarness();
    expect(call("resolveGroupAuthorMention", { payload: { message: { sender: "202997669847166:2@lid", sender_pn: "554788577996@s.whatsapp.net" } } })).toBe("554788577996");
  });
});
