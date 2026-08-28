import { NextResponse, type NextRequest } from "next/server";
import { getAdminLeadCrmWorkspace } from "@/lib/client-os/leads-crm";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace();

    if (!workspace?.profile.isPlatformAdmin) {
      return NextResponse.json({ error: "Acesso administrativo obrigatorio." }, { status: 403 });
    }

    const scope = request.nextUrl.searchParams.get("scope") === "platform_internal"
      ? "platform_internal"
      : "all";
    const leadWorkspace = await getAdminLeadCrmWorkspace({
      includeEvents: false,
      limit: scope === "platform_internal" ? 180 : 140,
      messageLimit: 40,
      scope,
      syncAvatars: false,
    });

    return NextResponse.json(
      {
        ok: true,
        refreshedAt: new Date().toISOString(),
        workspace: leadWorkspace,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[AdminAttendanceLive] Falha ao atualizar atendimento", error);

    return NextResponse.json(
      { error: "Nao foi possivel atualizar o atendimento agora." },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 503,
      },
    );
  }
}
