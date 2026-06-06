"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "./env";

export function createClient() {
  const env = getSupabasePublicEnv();

  if (!env.configured) {
    throw new Error("Supabase Auth nao esta configurado.");
  }

  return createBrowserClient(env.url, env.publishableKey);
}
