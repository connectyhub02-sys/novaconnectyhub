import { NextResponse } from "next/server";
import { loadGoogleMapsCredentials } from "@/lib/google-maps/credentials";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  try {
    const credentials = await loadGoogleMapsCredentials(createServiceClient());

    return NextResponse.json({
      browserApiKey: credentials.browserApiKey,
      mapId: credentials.mapId,
      configured: credentials.browserConfigured,
      serverConfigured: credentials.serverConfigured,
    });
  } catch {
    return NextResponse.json({
      browserApiKey: "",
      mapId: null,
      configured: false,
      serverConfigured: false,
      error: "Google Maps ainda nao configurado.",
    });
  }
}
