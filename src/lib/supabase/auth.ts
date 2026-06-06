import type { User } from "@supabase/supabase-js";
import { isSupabaseAuthConfigured } from "./env";
import { createClient } from "./server";

export async function getAuthenticatedUser(): Promise<User | null> {
  if (!isSupabaseAuthConfigured()) {
    return null;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}
