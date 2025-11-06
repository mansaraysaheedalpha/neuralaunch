// src/lib/encryption.ts
import crypto from "crypto";
import { env } from "./env";

const ALGORITHM = "aes-256-gcm";

/**
 * Decrypts data encrypted by the encryptData function.
 * @param encryptedData Base64 string in format "iv.ciphertext.authTag"
 * @returns The original decrypted string
 */
export function decryptData(encryptedData: string): string {
  const encryptionKey = env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY is not configured");
  }

  const key = Buffer.from(encryptionKey, "base64");
  const parts = encryptedData.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const [ivBase64, encryptedBase64, authTagBase64] = parts;
  const iv = Buffer.from(ivBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, undefined, "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
