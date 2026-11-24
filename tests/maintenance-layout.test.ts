import { describe, expect, it } from "vitest";
import {
  integrationArea,
  maintenanceAreas,
  resolveFieldSource,
  summarizeIntegration,
} from "../src/lib/maintenance-layout";
import { getMaintenanceVaultSnapshot, maintenanceIntegrations } from "../src/lib/maintenance-vault";

describe("maintenance room layout", () => {
  it("treats a value defined only on the server as configured, not missing", () => {
    expect(resolveFieldSource(false, true)).toBe("environment");
    expect(resolveFieldSource(true, true)).toBe("vault");
    expect(resolveFieldSource(false, false)).toBe("missing");
  });

  it("only flags missing required fields as pending", () => {
    const summary = summarizeIntegration("youtube", [
      { requirement: "required", source: "environment" },
      { requirement: "required", source: "missing" },
      { requirement: "optional", source: "missing" },
    ]);
    expect(summary).toMatchObject({ state: "pending", missingRequired: 1, requiredTotal: 2, configured: 1, total: 3 });
    expect(summarizeIntegration("youtube", [
      { requirement: "required", source: "environment" },
      { requirement: "optional", source: "missing" },
    ]).state).toBe("ready");
  });

  it("keeps declared standby integrations out of pending even with missing values", () => {
    expect(summarizeIntegration("mercado-pago", [{ requirement: "required", source: "missing" }]).state).toBe("standby");
  });

  it("places every catalogued integration in a known area", () => {
    const keys = new Set(maintenanceAreas.map((area) => area.key));
    for (const integration of maintenanceIntegrations) {
      expect(keys.has(integrationArea(integration.id)), integration.id).toBe(true);
    }
    expect(integrationArea("youtube")).toBe("redes");
    expect(integrationArea("gemini")).toBe("ia");
  });

  it("reports server presence independently of the vault", () => {
    const previous = process.env.TIKTOK_CLIENT_KEY;
    process.env.TIKTOK_CLIENT_KEY = "server-value";
    try {
      const fromEnv = getMaintenanceVaultSnapshot().integrations.find((i) => i.id === "tiktok")!
        .fields.find((f) => f.env === "TIKTOK_CLIENT_KEY")!;
      expect(fromEnv).toMatchObject({ source: "environment", environmentConfigured: true, configured: true });

      const withVault = getMaintenanceVaultSnapshot({
        storedCredentials: [{ integration_id: "tiktok", env_name: "TIKTOK_CLIENT_KEY", value_preview: "abc…" }],
      }).integrations.find((i) => i.id === "tiktok")!.fields.find((f) => f.env === "TIKTOK_CLIENT_KEY")!;
      expect(withVault).toMatchObject({ source: "vault", environmentConfigured: true });
    } finally {
      if (previous === undefined) delete process.env.TIKTOK_CLIENT_KEY;
      else process.env.TIKTOK_CLIENT_KEY = previous;
    }
  });
});
