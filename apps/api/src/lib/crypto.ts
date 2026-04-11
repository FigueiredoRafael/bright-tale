/**
 * Encryption utilities for sensitive data (e.g., WordPress passwords)
 *
 * Uses AES-256-GCM for authenticated encryption.
 * Requires ENCRYPTION_SECRET env var (32-byte hex string or 64 hex chars).
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;

function getSecretKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "ENCRYPTION_SECRET environment variable is required for encryption",
    );
  }
  // Expect 64 hex chars (32 bytes)
  if (secret.length !== 64 || !/^[0-9a-fA-F]+$/.test(secret)) {
    throw new Error(
      "ENCRYPTION_SECRET must be a 64-character hex string (32 bytes)",
    );
  }
  return Buffer.from(secret, "hex");
}

/**
 * Encrypt a plaintext string.
 * Returns a base64-encoded string containing IV + authTag + ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getSecretKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: iv (12) + authTag (16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a base64-encoded encrypted string.
 * Expects format: IV + authTag + ciphertext.
 */
export function decrypt(encryptedBase64: string): string {
  const key = getSecretKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted data: too short");
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Generate a random 32-byte hex secret suitable for ENCRYPTION_SECRET.
 * Useful for initial setup.
 */
export function generateSecret(): string {
  return randomBytes(32).toString("hex");
}
