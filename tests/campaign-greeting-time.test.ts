import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Channel = typeof import("../src/lib/whatsapp/channel-operations");

describe("campaign greeting matches the real send time (Brasília)", () => {
  const channel = serverModuleHarness<Channel>("src/lib/whatsapp/channel-operations.ts", {});
  const at = (brasilia: string) => new Date(`2026-09-28T${brasilia}:00-03:00`);

  it("replaces a greeting written for another period", () => {
    expect(channel.alignGreetingWithTime("Boa noite pessoal. Encerrando o dia com chave de ouro.", at("14:40"))).toBe("Boa tarde pessoal. Encerrando o dia com chave de ouro.");
    expect(channel.alignGreetingWithTime("Bom dia, turma! Olha essa oferta.", at("19:30"))).toBe("Boa noite, turma! Olha essa oferta.");
    expect(channel.alignGreetingWithTime("BOA TARDE GALERA", at("08:00"))).toBe("BOM DIA GALERA");
  });

  it("keeps the right greeting and texts without greeting", () => {
    expect(channel.alignGreetingWithTime("Bom dia, pessoal!", at("08:00"))).toBe("Bom dia, pessoal!");
    expect(channel.alignGreetingWithTime("Olha essa oferta de hoje.", at("22:00"))).toBe("Olha essa oferta de hoje.");
  });

  it("tells the model the local time of every post", () => {
    const source = readFileSync("src/lib/whatsapp/channel-operations.ts", "utf8");
    expect(source).toContain("Horario de cada post (Brasilia)");
    expect(source).toContain("Cumprimente de acordo com esse horario");
  });
});
