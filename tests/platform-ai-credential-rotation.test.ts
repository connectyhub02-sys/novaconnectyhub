import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { loadGeminiCredentials } from "@/lib/gemini/credentials";
import { loadElevenLabsCredentials } from "@/lib/elevenlabs/credentials";
import { encryptCredentialValue } from "@/lib/security/credentials-crypto";

beforeEach(() => {
  vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", "synthetic-test-encryption-key");
  vi.stubEnv("GEMINI_API_KEY", "previous-environment-gemini-key");
  vi.stubEnv("ELEVENLABS_API_KEY", "previous-environment-elevenlabs-key");
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  ["gemini", "GEMINI_API_KEY", loadGeminiCredentials],
  ["elevenlabs", "ELEVENLABS_API_KEY", loadElevenLabsCredentials],
] as const)("%s uses the newly saved vault key on the next load, ahead of environment", async (integration, env, load) => {
  let value = "first-synthetic-key";
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    order: vi.fn(async () => ({ data: [{ env_name: env, encrypted_value: encryptCredentialValue(value), value_preview: "masked" }], error: null })),
  };
  const client = { from: vi.fn(() => query) } as unknown as SupabaseClient;
  expect((await load(client)).apiKey).toBe("first-synthetic-key");
  value = "replacement-synthetic-key";
  expect((await load(client)).apiKey).toBe("replacement-synthetic-key");
  expect(query.eq).toHaveBeenCalledWith("scope", "platform");
  expect(query.eq).toHaveBeenCalledWith("integration_id", integration);
  expect(query.is).toHaveBeenCalledWith("organization_id", null);
  expect(query.order).toHaveBeenCalledTimes(2);
});
