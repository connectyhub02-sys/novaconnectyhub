import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace?.organization) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  const cep = request.nextUrl.searchParams.get("cep") ?? "";
  if (!/^\d{8}$/.test(cep)) return NextResponse.json({ error: "Informe um CEP com 8 dígitos." }, { status: 422 });
  try {
    // Only the postal code is sent to ViaCEP, never identity or full billing data.
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (data.erro) return NextResponse.json({ error: "CEP não encontrado. Confira ou preencha o endereço manualmente." }, { status: 404 });
    const clean = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 160) : "";
    return NextResponse.json({ street: clean(data.logradouro), neighborhood: clean(data.bairro), city: clean(data.localidade), state: clean(data.uf) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Busca indisponível. Você pode preencher o endereço manualmente." }, { status: 503 }); }
}
