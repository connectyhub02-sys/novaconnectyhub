"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_AFTER_MAGIC_LINK = "/dashboard";

export function MagicLinkFragmentRedirect() {
  useEffect(() => {
    const hash = window.location.hash;

    if (!hash || !hash.includes("access_token")) {
      return;
    }

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      return;
    }

    let cancelled = false;

    async function completeSession() {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.setSession({
          access_token: accessToken!,
          refresh_token: refreshToken!,
        });

        if (cancelled) {
          return;
        }

        window.history.replaceState(null, "", window.location.pathname || "/");
        window.location.replace(error ? "/login?next=/dashboard" : DEFAULT_AFTER_MAGIC_LINK);
      } catch {
        if (!cancelled) {
          window.history.replaceState(null, "", window.location.pathname || "/");
          window.location.replace("/login?next=/dashboard");
        }
      }
    }

    void completeSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
