import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";

export type InfrastructureCredential = "INFRA_ADMIN_USER_IDS" | "INFRA_HEALTH_PROJECTS_JSON";

// Explicit environment configuration wins. Only platform-owned vault records
// are eligible; organization credentials can never grant platform privileges.
export async function infrastructureCredential(name: InfrastructureCredential): Promise<string | undefined> {
  const configured = process.env[name];
  if (configured?.trim()) return configured;
  try {
    const { data, error } = await createServiceClient().from("integration_credentials")
      .select("encrypted_value").eq("scope", "platform").is("organization_id", null)
      .eq("integration_id", "infrastructure").eq("env_name", name).maybeSingle();
    if (error) throw new Error("VAULT_UNAVAILABLE");
    if (!data) return undefined;
    return decryptCredentialValue(data.encrypted_value);
  } catch { throw new Error("INFRA_VAULT_UNAVAILABLE"); }
}
