import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { loadNotificationSenderOptions, saveNotificationSenderPreference } from "@/lib/billing/notification-sender";
import { loadOwnerNoticeDelivery, saveOwnerNoticeDelivery } from "@/lib/billing/account-notice-preferences";

export async function GET() {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace?.organization) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
  try {
    const options = await loadNotificationSenderOptions(createServiceClient(), workspace.organization.id);
    const delivery = await loadOwnerNoticeDelivery(createServiceClient(), workspace.organization.id);
    return NextResponse.json({
      preference: options.preference,
      agents: options.candidates.map(({ id, name, available }) => ({ id, name, available })),
      canManage: options.account.ownerId === workspace.user.id,
      delivery: { enabled: delivery.enabled, hasPhone: Boolean(delivery.phone) },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Não foi possível carregar os avisos da conta." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace?.organization) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Escolha o remetente dos avisos." }, { status: 422 });
    if ("deliveryEnabled" in body) {
      if (typeof body.deliveryEnabled !== "boolean") return NextResponse.json({ error: "Escolha se deseja receber os avisos." }, { status: 422 });
      await saveOwnerNoticeDelivery(createServiceClient(), workspace.organization.id, workspace.user.id, body.deliveryEnabled);
    } else await saveNotificationSenderPreference(createServiceClient(), workspace.organization.id, workspace.user.id, body);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar os avisos." }, { status: 422 });
  }
}
