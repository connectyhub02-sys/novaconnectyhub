import { constants, createCipheriv, createHash, publicEncrypt, randomBytes, timingSafeEqual } from "node:crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const expires = 1790620462832;
const tokenHash = "cd68bc0fb8be095376ea4d90c5f10892ac87c9204388cf26478cddbf4cad6ad5";
const recipient = "-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA17/z2Yh4nfXXl3ge9iom\nmInQzLpkRJgZt7tyexBnlVn42vkPPm8YMs5g64zSF/8j3AXv8ivAAOB9texFBo+g\nqZDtZzSMexiVG6+zxV6qWqM/BklGZsyq3ywaJVbJ5rla25/n/QIp0+tOBedVMwr4\nRf7wMtUE1wN52LTsJvyvlsc9D+fWDjXslyFpnsz5kAXVHMYXj9KmGyzHWN3n8XM6\nZpLSist4dffAMxOuVhJ1tSP8GS1Qxcx8u/TU589OV9wkfxGv8dD76ZL9BtxptfDC\nO9cZS81Ng5M3EhZqR9v/5FmwkRv/1ok5s7pCYLbW+CdAVALReSz2DEC1GBSGl6AZ\nMtpEuwkmGDTQNuOZV5W+odyrZhb/NPfprvFKaEgfM5dKY1ZzlT2dpyH22uMDDEZO\nlS4Oz5C2uzqV4gYHVWFpnGVDjUj8ILHTVTjLtzj/RJfrKTcgbcyGQB9ubEOOvoV5\nEUU9Kmnn4dvrTDrAWpaboIVZAQoCNB66d3T9wSaZyHsxAgMBAAE=\n-----END PUBLIC KEY-----\n";
const names = ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","SUPABASE_SECRET_KEY","R2_ACCOUNT_ID","R2_ENDPOINT","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","R2_BUCKET","R2_PUBLIC_URL","CLOUDFLARE_R2_API_TOKEN","INNGEST_EVENT_KEY","INNGEST_SIGNING_KEY","NEXT_PUBLIC_VAPID_PUBLIC_KEY","VAPID_PRIVATE_KEY","VAPID_SUBJECT","UAZAPI_BASE_URL","UAZAPI_ADMIN_TOKEN","NEXT_PUBLIC_APP_URL","APP_URL","CREDENTIAL_ENCRYPTION_KEY","CONNECTYHUB_INTERNAL_API_KEY","MERCADO_PAGO_CLIENT_ID","MERCADO_PAGO_CLIENT_SECRET","MERCADO_PAGO_REDIRECT_URI","MERCADO_PAGO_WEBHOOK_SECRET","MERCADO_PAGO_TEST_TOKEN","MERCADO_PAGO_BILLING_PUBLIC_KEY","MERCADO_PAGO_BILLING_ACCESS_TOKEN","MERCADO_PAGO_BILLING_MODE","INNGEST_BASE_URL","INNGEST_DEV","TRACKING_PUBLIC_TOKEN_SECRET","AI_RELAY_SECRET","AI_RELAY_PUBLIC_URL","AI_UPLOAD_RELAY_ENABLED","WHATSAPP_TRACKING_ORIGINS_JSON","WHATSAPP_NATIVE_LINK_ORIGINS_JSON","STUDIO_ASSETS_ENABLED","STUDIO_OPERATIONS_ENABLED","ASAAS_PIX_AUTOMATIC_ENABLED"];
const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request) {
  if (Date.now() > expires) return new Response(null, { status: 404, headers });
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const provided = createHash("sha256").update(bearer).digest();
  if (!timingSafeEqual(provided, Buffer.from(tokenHash, "hex"))) return new Response(null, { status: 404, headers });
  const internal = request.headers.get("x-migration-internal") ?? "";
  const expected = process.env.CONNECTYHUB_INTERNAL_API_KEY;
  if (!expected || !timingSafeEqual(createHash("sha256").update(internal).digest(), createHash("sha256").update(expected).digest())) return new Response(null, { status: 404, headers });
  const env = Object.fromEntries(names.map(name => [name, process.env[name] ?? null]));
  const key = randomBytes(32), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ env, version: process.env.VERCEL_GIT_COMMIT_SHA, createdAt: new Date().toISOString() })), cipher.final()]);
  const wrappedKey = publicEncrypt({ key: recipient, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key);
  return Response.json({ key: wrappedKey.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") }, { headers });
}
