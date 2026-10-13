import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { access, failure, response } from "@/lib/infrastructure/server";
import { sameOrigin } from "@/lib/infrastructure/hosting-server";
import { InvalidInput, keys, object, readBody } from "@/lib/infrastructure/validation";
export async function POST(request: Request) {
  try {
    const auth = await access(true); if (auth instanceof NextResponse) return auth;
    sameOrigin(request);
    const b = object(await readBody(request)); keys(b, ["id", "name"]);
    if (typeof b.id !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(b.id) || typeof b.name !== "string" || b.name.trim().length < 2 || b.name.length > 100) throw new InvalidInput("Informe nome e identificador válidos.");
    const { error } = await createServiceClient().rpc("infra_register_project", { p_project: b.id, p_name: b.name.trim(), p_actor: auth.userId });
    if (error) throw new InvalidInput(error.code === "23505" ? "Este identificador já está cadastrado." : "Não foi possível cadastrar a infraestrutura.");
    return response({ id: b.id }, 201);
  } catch (e) { return failure(e); }
}
