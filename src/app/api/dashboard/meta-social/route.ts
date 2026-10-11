import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { createServiceClient } from "@/lib/supabase/service";
const channels = [
  "instagram_direct",
  "facebook_messenger",
  "instagram_comments",
  "facebook_comments",
];
export async function GET(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace)
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  if (!workspace.organization)
    return NextResponse.json(
      { error: "Empresa obrigatória." },
      { status: 422 },
    );
  const client = createServiceClient();
  try {
    const company = await requireClientCompanyAccess({
      client,
      userId: workspace.user.id,
      companyId: workspace.organization.id,
    });
    const result = await client
      .from("conversations")
      .select("id,lead_id,channel,last_message_preview,last_message_at,status")
      .eq("organization_id", company.id)
      .in("channel", channels)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (result.error) throw result.error;
    const selected = new URL(request.url).searchParams.get("conversation");
    let messages: unknown[] = [];
    if (selected) {
      const owned = await client
        .from("conversations")
        .select("id")
        .eq("organization_id", company.id)
        .eq("id", selected)
        .in("channel", channels)
        .maybeSingle();
      if (owned.error || !owned.data)
        return NextResponse.json(
          { error: "Conversa não encontrada." },
          { status: 404 },
        );
      const history = await client
        .from("conversation_messages")
        .select("id,direction,text_content,message_type,occurred_at")
        .eq("organization_id", company.id)
        .eq("conversation_id", selected)
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (history.error) throw history.error;
      messages = (history.data ?? []).reverse();
    }
    const ids = [
      ...new Set((result.data ?? []).map((c) => c.lead_id).filter(Boolean)),
    ];
    const leads = ids.length
      ? await client
          .from("leads")
          .select("id,display_name")
          .eq("organization_id", company.id)
          .in("id", ids)
      : { data: [] };
    const names = new Map(
      (leads.data ?? []).map((l) => [l.id, l.display_name]),
    );
    return NextResponse.json(
      {
        conversations: (result.data ?? []).map((c) => ({
          ...c,
          name: names.get(c.lead_id) || "Contato Meta",
        })),
        messages,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar o atendimento Meta." },
      { status: 403 },
    );
  }
}
