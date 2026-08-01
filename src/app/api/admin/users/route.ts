import { NextResponse } from "next/server";
import { getAdminPlatformUsers } from "@/lib/admin/users";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const snapshot = await getAdminPlatformUsers();
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel carregar os usuarios." },
      { status: 500 },
    );
  }
}
