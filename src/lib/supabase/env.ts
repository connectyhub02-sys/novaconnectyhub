export type SupabasePublicEnv = {
  url: string;
  publishableKey: string;
  configured: boolean;
};

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  return {
    url,
    publishableKey,
    configured: Boolean(url && publishableKey),
  };
}

export function isSupabaseAuthConfigured() {
  return getSupabasePublicEnv().configured;
}
