/**
 * Tests for encryption utilities
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// We need to set ENCRYPTION_SECRET before importing
const TEST_SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("crypto utilities", () => {
  beforeAll(() => {
    vi.stubEnv("ENCRYPTION_SECRET", TEST_SECRET);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("encrypts and decrypts a string correctly", async () => {
    // Dynamic import after env is set
    const { encrypt, decrypt } = await import("../crypto");

    const plaintext = "my-secret-password-123!";
    const encrypted = encrypt(plaintext);

    // Encrypted should be base64 and different from plaintext
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);

    // Decrypt should recover original
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext (random IV)", async () => {
    const { encrypt } = await import("../crypto");

    const plaintext = "same-input";
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);

    // Due to random IV, ciphertexts should differ
    expect(enc1).not.toBe(enc2);
  });

  it("throws on invalid encrypted data", async () => {
    const { decrypt } = await import("../crypto");

    expect(() => decrypt("short")).toThrow("Invalid encrypted data");
  });

  it("generateSecret returns a 64-char hex string", async () => {
    const { generateSecret } = await import("../crypto");

    const secret = generateSecret();
    expect(secret).toHaveLength(64);
    expect(secret).toMatch(/^[0-9a-f]+$/);
  });
});

describe("crypto utilities - missing secret", () => {
  it("throws if ENCRYPTION_SECRET is not set", async () => {
    vi.stubEnv("ENCRYPTION_SECRET", "");

    // Force re-import by clearing module cache (vitest doesn't cache by default in separate tests)
    vi.resetModules();

    const { encrypt } = await import("../crypto");

    expect(() => encrypt("test")).toThrow(
      "ENCRYPTION_SECRET environment variable is required",
    );

    vi.unstubAllEnvs();
  });
});
