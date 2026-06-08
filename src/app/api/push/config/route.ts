import { NextResponse } from "next/server";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type VapidCredentialRow = {
  encrypted_value: string | null;
};

export async function GET() {
  const envPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();

  if (envPublicKey) {
    return NextResponse.json({ public_key: envPublicKey, source: "environment" });
  }

  try {
    const client = createServiceClient();
    const { data, error } = await client
      .from("integration_credentials")
      .select("encrypted_value")
      .eq("scope", "platform")
      .eq("integration_id", "push")
      .eq("env_name", "NEXT_PUBLIC_VAPID_PUBLIC_KEY")
      .is("organization_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<VapidCredentialRow>();

    if (error || !data?.encrypted_value) {
      return NextResponse.json({ public_key: null, source: "missing" });
    }

    const vaultPublicKey = decryptCredentialValue(data.encrypted_value).trim();

    return NextResponse.json({
      public_key: vaultPublicKey || null,
      source: vaultPublicKey ? "vault" : "missing",
    });
  } catch {
    return NextResponse.json({ public_key: null, source: "missing" });
  }
}
