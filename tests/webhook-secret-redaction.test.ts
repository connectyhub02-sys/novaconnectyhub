import { describe, expect, it } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Ingest = typeof import("../src/lib/whatsapp/webhook-ingest");
const ingest = serverModuleHarness<Ingest>("src/lib/whatsapp/webhook-ingest.ts", {}, ["redactProviderSecrets"]);

describe("provider secrets in webhooks", () => {
  it("drops the instance token at any depth and keeps the event itself", () => {
    const payload = { type: "presence", token: "346774db-secret", BaseUrl: "https://provider.invalid", owner: "5511",
      event: { chatid: "5547@s.whatsapp.net", State: "composing", instanceToken: "nested-secret" }, list: [{ token: "in-array" }] };
    const safe = ingest.redactProviderSecrets(payload);
    expect(JSON.stringify(safe)).not.toContain("secret");
    expect(JSON.stringify(safe)).not.toContain("in-array");
    expect(safe).toMatchObject({ type: "presence", BaseUrl: "https://provider.invalid", event: { chatid: "5547@s.whatsapp.net", State: "composing" } });
  });
});
