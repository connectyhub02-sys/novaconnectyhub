import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function PUT(request: NextRequest, context: { params: Promise<{ productId: string }> }) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  const { productId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
  const client = createServiceClient();
  const { data: product } = await client.from("platform_products").select("id").eq("id", productId).maybeSingle();
  if (!product) return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
  const form = await request.formData();
  const body = String(form.get("body") ?? "").trim();
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (body.length > 200000 || uploads.length > 12 || uploads.some(f => f.size > 25 * 1024 * 1024) || uploads.reduce((n,f) => n + f.size, 0) > 100 * 1024 * 1024) {
    return NextResponse.json({ error: "Use até 12 arquivos, com 25 MB por arquivo e 100 MB no total." }, { status: 422 });
  }
  const current = await client.from("platform_product_contents").select("files").eq("product_id", productId).maybeSingle();
  if (current.error) return NextResponse.json({ error: "Não foi possível carregar o conteúdo atual." }, { status: 503 });
  const files = Array.isArray(current.data?.files) ? [...current.data.files] : [];
  if (files.length + uploads.length > 30) return NextResponse.json({ error: "Limite de 30 arquivos por produto." }, { status: 422 });
  const newKeys:string[]=[];
  for (const file of uploads) {
    const key = `${productId}/${randomUUID()}`;
    const uploaded = await client.storage.from("platform-deliverables").upload(key, await file.arrayBuffer(), { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploaded.error) { if(newKeys.length) await client.storage.from("platform-deliverables").remove(newKeys); return NextResponse.json({ error: "Não foi possível guardar o arquivo privado." }, { status: 503 }); }
    newKeys.push(key);
    files.push({ key, name: file.name.slice(0, 180), type: file.type || "application/octet-stream" });
  }
  const saved = await client.from("platform_product_contents").upsert({ product_id: productId, body, files, updated_at: new Date().toISOString() });
  if (saved.error) { if(newKeys.length) await client.storage.from("platform-deliverables").remove(newKeys); return NextResponse.json({ error: "Não foi possível salvar o conteúdo." }, { status: 503 }); }
  return NextResponse.json({ ok: true, files });
}
