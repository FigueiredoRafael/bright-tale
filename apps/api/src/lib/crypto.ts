/**
 * Encryption utilities for sensitive data (e.g., WordPress passwords, AI API keys).
 *
 * Uses AES-256-GCM with optional Additional Authenticated Data (AAD) binding.
 * Requires ENCRYPTION_SECRET env var (32-byte hex string or 64 hex chars).
 *
 * Security guarantees:
 *   • Confidentiality + integrity from AES-256-GCM.
 *   • When AAD is supplied, a ciphertext encrypted for record A cannot be
 *     decrypted as record B — even with the same key — because the auth tag
 *     verification fails. This closes the "swap ciphertexts between rows"
 *     class of attacks flagged in SEC-003.
 *   • IV is 96-bit random per encryption (GCM standard).
 *   • Backwards-compatible: existing ciphertexts encrypted without AAD can
 *     still be decrypted by calling `decrypt(ct)` without the second arg.
 *     Once all rows are re-encrypted with AAD, the AAD form can be made
 *     mandatory for the affected callers.
 *
 * Call sites should build their AAD with enough context to uniquely pin
 * the ciphertext to a row:
 *
 *   encrypt(apiKey, { aad: `ai_provider_configs:api_key:${row.id}:${userId}` })
 *   decrypt(ct,    { aad: `ai_provider_configs:api_key:${row.id}:${userId}` })
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;

export interface AeadOptions {
  /** Additional Authenticated Data. Binds the ciphertext to a specific context
   *  (e.g. "<table>:<column>:<row_id>:<user_id>"). Pass the same string on
   *  encrypt and decrypt; mismatch → decryption fails with a tag error. */
  aad?: string;
}

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
 *
 * When `opts.aad` is provided, the auth tag covers both the ciphertext AND
 * the AAD — decryption will fail unless the same AAD is supplied later.
 * The AAD itself is NOT embedded in the ciphertext; callers must persist
 * the context (row id, user id, etc.) separately.
 */
export function encrypt(plaintext: string, opts: AeadOptions = {}): string {
  const key = getSecretKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  if (opts.aad) {
    cipher.setAAD(Buffer.from(opts.aad, "utf8"));
  }

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
 *
 * When `opts.aad` is provided, the same AAD used at encrypt time must be
 * supplied — otherwise the auth tag will fail and this throws.
 *
 * Backwards compatibility: decrypting a legacy ciphertext that was NOT
 * encrypted with AAD works if you omit `opts.aad`. Pass AAD only when the
 * corresponding encrypt call also passed it.
 */
export function decrypt(
  encryptedBase64: string,
  opts: AeadOptions = {},
): string {
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
  if (opts.aad) {
    decipher.setAAD(Buffer.from(opts.aad, "utf8"));
  }

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Build a conventional AAD string for a row-scoped ciphertext.
 *
 * Canonical format: `<table>:<column>:<row_id>:<user_id>`
 *
 * Example:
 *   aadFor("ai_provider_configs", "api_key", row.id, row.user_id)
 *     → "ai_provider_configs:api_key:<uuid>:<uuid>"
 *
 * Anything passing through this helper has the same shape, so call sites
 * don't drift. Use it wherever you call encrypt/decrypt on DB values.
 */
export function aadFor(
  table: string,
  column: string,
  rowId: string,
  userIdOrOrgId: string,
): string {
  return `${table}:${column}:${rowId}:${userIdOrOrgId}`;
}

/**
 * Generate a random 32-byte hex secret suitable for ENCRYPTION_SECRET.
 * Useful for initial setup.
 */
export function generateSecret(): string {
  return randomBytes(32).toString("hex");
}
