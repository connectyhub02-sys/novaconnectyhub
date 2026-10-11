import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { createServiceClient } from "@/lib/supabase/service";
import { loadAgentChannelAvailability } from "@/lib/agents/channel-availability-server";

export async function GET(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace)
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  try {
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId:
        new URL(request.url).searchParams.get("companyId") ||
        workspace.organization?.id ||
        "",
    });
    return NextResponse.json(
      {
        channels: await loadAgentChannelAvailability(
          createServiceClient(),
          company.id,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível verificar os canais desta empresa." },
      { status: 403 },
    );
  }
}
