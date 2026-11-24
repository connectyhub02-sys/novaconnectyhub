import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountCompletionStatusForUser } from "./signup-completion";

export type InitialCompany = {
  id: string; name: string; slug: string | null; plan_code: string; status: string; created_at: string | null;
};

export async function createInitialCompany(input: {
  userId: string; client: SupabaseClient; automatic: boolean; name?: string;
}): Promise<InitialCompany | null> {
  const completion = await getAccountCompletionStatusForUser({ userId: input.userId, client: input.client });
  if (!completion.isComplete) {
    if (input.automatic) return null;
    throw new Error("Complete seu cadastro antes de criar a empresa.");
  }
  if (input.automatic && completion.accountType !== "company") return null;
  const name = (input.automatic ? completion.companyName : input.name)?.trim().replace(/\s+/g, " ") ?? "";
  if (name.length < 2 || name.length > 120) throw new Error("Informe um nome de empresa entre 2 e 120 caracteres.");
  const { data, error } = await input.client.rpc("create_initial_client_company", {
    p_user_id: input.userId, p_name: name, p_automatic: input.automatic,
  });
  if (error) throw new Error("Não foi possível criar a primeira empresa. " + error.message);
  return data as InitialCompany | null;
}
