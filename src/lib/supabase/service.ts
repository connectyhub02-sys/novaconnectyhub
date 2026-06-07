import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";

let serviceClient: SupabaseClient | null = null;

export function createServiceClient() {
  const env = getSupabasePublicEnv();
  const serviceKey = process.env.SUPABASE_SECRET_KEY;

  if (!env.url || !serviceKey) {
    throw new Error("Supabase service role nao esta configurado.");
  }

  if (!serviceClient) {
    serviceClient = createClient(env.url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return serviceClient;
}
