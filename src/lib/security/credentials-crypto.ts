import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function encryptCredentialValue(value: string) {
  const key = getCredentialEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptCredentialValue(encryptedValue: string) {
  const [version, iv, tag, encrypted] = encryptedValue.split(":");

  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Formato de credencial criptografada invalido.");
  }

  const key = getCredentialEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashCredentialValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function previewCredentialValue(value: string, kind: "secret" | "public" | "endpoint" | "identifier" = "secret") {
  if (kind === "endpoint") {
    return value;
  }

  if (kind === "identifier" && value.length <= 80) {
    return value;
  }

  if (value.length <= 8) {
    return "********";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function getCredentialEncryptionKey() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;

  if (!secret) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY nao configurada.");
  }

  return createHash("sha256").update(secret).digest();
}
