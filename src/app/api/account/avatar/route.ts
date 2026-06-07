import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const maxAvatarBytes = 5 * 1024 * 1024;
const allowedMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const avatar = formData?.get("avatar");

  if (!(avatar instanceof File)) {
    return NextResponse.json({ error: "Envie uma imagem no campo avatar." }, { status: 400 });
  }

  const extension = allowedMimeTypes.get(avatar.type);

  if (!extension) {
    return NextResponse.json({ error: "Use uma imagem JPG, PNG ou WEBP." }, { status: 400 });
  }

  if (avatar.size <= 0 || avatar.size > maxAvatarBytes) {
    return NextResponse.json({ error: "A foto precisa ter ate 5 MB." }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const configResult = await loadR2Config(serviceClient);

  if (!configResult.ok) {
    return NextResponse.json({ error: configResult.error }, { status: 503 });
  }

  const bytes = new Uint8Array(await avatar.arrayBuffer());
  const objectKey = `profiles/avatars/${user.id}/${Date.now()}-${randomUUID()}.${extension}`;
  const uploadResult = await putR2Object(configResult.config, objectKey, bytes, avatar.type);

  if (!uploadResult.ok) {
    return NextResponse.json({ error: uploadResult.error }, { status: 502 });
  }

  const avatarUrl = uploadResult.publicUrl;
  const nextMetadata = {
    ...(user.user_metadata ?? {}),
    avatar_url: avatarUrl,
    avatar_storage: {
      provider: "cloudflare-r2",
      key: objectKey,
      content_type: avatar.type,
      size: avatar.size,
      uploaded_at: new Date().toISOString(),
    },
  };

  const { error: updateError } = await supabase.auth.updateUser({
    data: nextMetadata,
  });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await serviceClient.from("maintenance_audit_logs").insert({
    actor_id: user.id,
    event_type: "profile.avatar_uploaded",
    target_table: "profiles",
    target_id: user.id,
    metadata: {
      objectKey,
      size: avatar.size,
      contentType: avatar.type,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/empresa");
  revalidatePath("/dashboard/agentes");
  revalidatePath("/dashboard/whatsapp");

  return NextResponse.json({ avatarUrl });
}
