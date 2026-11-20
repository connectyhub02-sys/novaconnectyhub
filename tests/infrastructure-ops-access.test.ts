import * as nodeCrypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

const load = () => serverModuleHarness<typeof import("../src/lib/infrastructure/ops-access")>("src/lib/infrastructure/ops-access.ts", { "node:crypto": nodeCrypto });
const user = "389d7451-4217-421d-911f-3a80fff765fd";

describe("infrastructure ops access", () => {
  beforeEach(() => { vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", "test-key-for-ops-cookie"); });

  it("accepts a fresh token and rejects expired or tampered ones", () => {
    const ops = load();
    const now = Date.UTC(2026, 10, 20, 12);
    const token = ops.createOpsToken(user, now);
    expect(ops.verifyOpsToken(token, now + 60_000)?.userId).toBe(user);
    expect(ops.verifyOpsToken(token, now + (ops.opsCookieMaxAge + 1) * 1000)).toBeNull();
    const [id, exp, sig] = token.split(".");
    expect(ops.verifyOpsToken(`${id}.${Number(exp) + 3600}.${sig}`, now)).toBeNull();
    expect(ops.verifyOpsToken(`${id}.${exp}.${sig.slice(0, -2)}xx`, now)).toBeNull();
    expect(ops.verifyOpsToken("garbage", now)).toBeNull();
  });

  it("only knows the allowlisted consoles and reads the cookie from a header", () => {
    const ops = load();
    expect(ops.isOpsTool("vision:inngest")).toBe(true);
    expect(ops.isOpsTool("https://evil.example")).toBe(false);
    expect(ops.readCookie("a=1; ch_ops=abc.def.ghi; b=2", "ch_ops")).toBe("abc.def.ghi");
    expect(ops.readCookie(null, "ch_ops")).toBeNull();
  });
});
