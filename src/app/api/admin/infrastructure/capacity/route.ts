import { NextResponse } from "next/server";
import { access, response } from "@/lib/infrastructure/server";
import { readCapacity } from "@/lib/infrastructure/capacity-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await access();
    if (auth instanceof NextResponse) return auth;
    return response({ snapshot: await readCapacity() });
  } catch {
    return response({ error: "Não foi possível ler a capacidade da VPS. A coleta precisa estar ativa no servidor." }, 503);
  }
}
