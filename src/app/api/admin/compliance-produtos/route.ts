import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  deleteProductComplianceRule,
  listPlatformComplianceRules,
  saveProductComplianceRule,
  toggleProductComplianceRule,
} from "@/lib/compliance/product-compliance";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const client = createServiceClient();
    const rules = await listPlatformComplianceRules(client);
    return NextResponse.json({ ok: true, rules });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Corpo da requisicao invalido" }, { status: 400 });
    }

    const { id, name, slug, category, country_code, keywords, intent_keywords, action, blocked_message, is_enabled, notes } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ ok: false, error: "Nome da regra e obrigatorio" }, { status: 400 });
    }

    if (!Array.isArray(keywords) || !keywords.length) {
      return NextResponse.json({ ok: false, error: "Ao menos uma palavra-chave deve ser informada" }, { status: 400 });
    }

    if (!blocked_message || typeof blocked_message !== "string" || !blocked_message.trim()) {
      return NextResponse.json({ ok: false, error: "Mensagem de recusa e obrigatoria" }, { status: 400 });
    }

    const client = createServiceClient();
    const savedRule = await saveProductComplianceRule(
      client,
      {
        id: typeof id === "string" ? id : undefined,
        name: name.trim(),
        slug: typeof slug === "string" ? slug : undefined,
        category,
        country_code,
        keywords,
        intent_keywords: Array.isArray(intent_keywords) ? intent_keywords : [],
        action,
        blocked_message: blocked_message.trim(),
        is_enabled: typeof is_enabled === "boolean" ? is_enabled : true,
        notes: typeof notes === "string" ? notes : null,
      },
      auth.userId
    );

    revalidatePath("/admin/compliance-produtos");
    return NextResponse.json({ ok: true, rule: savedRule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { id, is_enabled } = body ?? {};

    if (!id || typeof id !== "string") {
      return NextResponse.json({ ok: false, error: "ID da regra e obrigatorio" }, { status: 400 });
    }

    if (typeof is_enabled !== "boolean") {
      return NextResponse.json({ ok: false, error: "Status booleano e obrigatorio" }, { status: 400 });
    }

    const client = createServiceClient();
    const updatedRule = await toggleProductComplianceRule(client, id, is_enabled, auth.userId);

    revalidatePath("/admin/compliance-produtos");
    return NextResponse.json({ ok: true, rule: updatedRule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, error: "Parametro id e obrigatorio" }, { status: 400 });
    }

    const client = createServiceClient();
    await deleteProductComplianceRule(client, id);

    revalidatePath("/admin/compliance-produtos");
    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
