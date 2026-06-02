import { describe, it, expect, vi } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  migrateToCurrentVersion,
  stampSchemaVersion,
} from "../schema-version";

describe("CURRENT_SCHEMA_VERSION", () => {
  it("is the number 1", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});

describe("migrateToCurrentVersion", () => {
  it("null input returns null", () => {
    expect(migrateToCurrentVersion(null)).toBeNull();
  });

  it("undefined input returns null", () => {
    expect(migrateToCurrentVersion(undefined)).toBeNull();
  });

  it("blob with no _v (v0) gets stamped to CURRENT and preserves all original keys", () => {
    const blob = { brainstorm: "gemini", review: "anthropic" };
    const result = migrateToCurrentVersion(blob);
    expect(result).not.toBeNull();
    expect(result!._v).toBe(CURRENT_SCHEMA_VERSION);
    expect(result!.brainstorm).toBe("gemini");
    expect(result!.review).toBe("anthropic");
  });

  it("blob already at CURRENT_SCHEMA_VERSION is a no-op (returns equivalent object, _v unchanged, keys preserved)", () => {
    const blob = { _v: CURRENT_SCHEMA_VERSION, foo: "bar" };
    const result = migrateToCurrentVersion(blob);
    expect(result).not.toBeNull();
    expect(result!._v).toBe(CURRENT_SCHEMA_VERSION);
    expect(result!.foo).toBe("bar");
  });

  it("future version (_v > CURRENT) does not throw and returns blob unchanged", () => {
    const blob = { _v: 999, weird: "x" };
    expect(() => migrateToCurrentVersion(blob)).not.toThrow();
    const result = migrateToCurrentVersion(blob);
    expect(result).not.toBeNull();
    expect(result!._v).toBe(999);
    expect(result!.weird).toBe("x");
  });

  it("future version invokes onUnknownVersion callback with the version number", () => {
    const blob = { _v: 999, weird: "x" };
    const onUnknownVersion = vi.fn();
    migrateToCurrentVersion(blob, onUnknownVersion);
    expect(onUnknownVersion).toHaveBeenCalledOnce();
    expect(onUnknownVersion).toHaveBeenCalledWith(999);
  });

  it("onUnknownVersion callback is NOT called for current version", () => {
    const blob = { _v: CURRENT_SCHEMA_VERSION, foo: "bar" };
    const onUnknownVersion = vi.fn();
    migrateToCurrentVersion(blob, onUnknownVersion);
    expect(onUnknownVersion).not.toHaveBeenCalled();
  });

  it("onUnknownVersion callback is NOT called for v0 (migration path)", () => {
    const blob = { someKey: "val" };
    const onUnknownVersion = vi.fn();
    migrateToCurrentVersion(blob, onUnknownVersion);
    expect(onUnknownVersion).not.toHaveBeenCalled();
  });
});

describe("stampSchemaVersion", () => {
  it("stamps _v: CURRENT_SCHEMA_VERSION onto a plain object", () => {
    const result = stampSchemaVersion({ a: 1 });
    expect(result).toEqual({ a: 1, _v: CURRENT_SCHEMA_VERSION });
  });

  it("overwrites an existing _v with CURRENT_SCHEMA_VERSION", () => {
    const result = stampSchemaVersion({ _v: 0, x: "y" });
    expect(result._v).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.x).toBe("y");
  });

  it("preserves all original keys", () => {
    const original = { brainstorm: "gemini", review: "anthropic", assets: "openai" };
    const result = stampSchemaVersion(original);
    expect(result.brainstorm).toBe("gemini");
    expect(result.review).toBe("anthropic");
    expect(result.assets).toBe("openai");
    expect(result._v).toBe(CURRENT_SCHEMA_VERSION);
  });
});
