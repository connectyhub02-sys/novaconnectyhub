import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ from: vi.fn(), eq: vi.fn(), is: vi.fn(), row: null as null | { encrypted_value: string }, error: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: mock.from }) }));
import { infrastructureCredential } from "@/lib/infrastructure/credentials";
import { encryptCredentialValue } from "@/lib/security/credentials-crypto";
beforeEach(() => {
  vi.clearAllMocks(); mock.row = null; mock.error = null;
  vi.stubEnv("INFRA_ADMIN_USER_IDS", ""); vi.stubEnv("INFRA_HEALTH_PROJECTS_JSON", "");
  vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", "test-key-only");
  const chain = { select: () => chain, eq: mock.eq, is: mock.is, maybeSingle: async () => ({ data: mock.row, error: mock.error }) };
  mock.from.mockReturnValue(chain); mock.eq.mockReturnValue(chain); mock.is.mockReturnValue(chain);
});
afterEach(() => vi.unstubAllEnvs());
it("gives explicit environment precedence without accessing the vault", async () => {
  vi.stubEnv("INFRA_ADMIN_USER_IDS", "designated-admin");
  expect(await infrastructureCredential("INFRA_ADMIN_USER_IDS")).toBe("designated-admin");
  expect(mock.from).not.toHaveBeenCalled();
});
it("decrypts only platform infrastructure records with no organization", async () => {
  mock.row = { encrypted_value: encryptCredentialValue("designated-admin") };
  expect(await infrastructureCredential("INFRA_ADMIN_USER_IDS")).toBe("designated-admin");
  expect(mock.from).toHaveBeenCalledWith("integration_credentials");
  expect(mock.eq.mock.calls).toEqual([["scope", "platform"], ["integration_id", "infrastructure"], ["env_name", "INFRA_ADMIN_USER_IDS"]]);
  expect(mock.is).toHaveBeenCalledWith("organization_id", null);
});
it("does not cache permission grants and honors removal immediately", async () => {
  mock.row = { encrypted_value: encryptCredentialValue("designated-admin") };
  expect(await infrastructureCredential("INFRA_ADMIN_USER_IDS")).toBe("designated-admin");
  mock.row = null;
  expect(await infrastructureCredential("INFRA_ADMIN_USER_IDS")).toBeUndefined();
});
it("fails closed without exposing ciphertext, previews or database errors", async () => {
  mock.row = { encrypted_value: "SECRET_INVALID_CIPHERTEXT" };
  await expect(infrastructureCredential("INFRA_ADMIN_USER_IDS")).rejects.toThrow(/^INFRA_VAULT_UNAVAILABLE$/);
  mock.error = { message: "SECRET_DATABASE_ERROR" };
  await expect(infrastructureCredential("INFRA_HEALTH_PROJECTS_JSON")).rejects.toThrow(/^INFRA_VAULT_UNAVAILABLE$/);
});
