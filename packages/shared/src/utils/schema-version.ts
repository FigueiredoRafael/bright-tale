/**
 * On-read schema versioning for settings/config JSON blobs.
 *
 * Every persisted blob carries a `_v` integer. Blobs without `_v` are treated
 * as version 0 (the legacy shape that pre-dates this versioning scheme).
 *
 * ## How to add a v1 → v2 migration step
 *
 * 1. Bump `CURRENT_SCHEMA_VERSION` to 2.
 * 2. Append a new entry to `MIGRATIONS`:
 *    ```ts
 *    (blob) => {
 *      // transform blob from v1 shape to v2 shape
 *      return { ...blob, newField: 'defaultValue' };
 *    },
 *    ```
 *    The entry at index `i` migrates a blob from version `i` to version `i+1`.
 *    An empty array means v0→v1 needs no transform (current state).
 */

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Migration steps registry.
 * Index 0 = v0 → v1, index 1 = v1 → v2, etc.
 * Currently empty: v0 and v1 are shape-identical.
 */
const MIGRATIONS: Array<(blob: Record<string, unknown>) => Record<string, unknown>> = [
  // v0 → v1: no shape transform needed
];

/**
 * Migrate a persisted blob to the current schema version in memory.
 *
 * - `null` / `undefined` → returns `null` (passthrough; never fabricates a blob).
 * - `_v` absent → treated as v0, migrated up to CURRENT and `_v` stamped.
 * - `_v === CURRENT` → no-op, blob returned unchanged.
 * - `_v > CURRENT` (future/unknown) → returned unchanged without migrating;
 *   the optional `onUnknownVersion` callback is invoked with the version number
 *   so callers can log if desired (shared package stays logger-free).
 */
export function migrateToCurrentVersion<T extends Record<string, unknown>>(
  blob: T | null | undefined,
  onUnknownVersion?: (v: number) => void,
): T | null {
  if (blob === null || blob === undefined) {
    return null;
  }

  const v = typeof blob._v === "number" ? blob._v : 0;

  if (v > CURRENT_SCHEMA_VERSION) {
    if (onUnknownVersion !== undefined) {
      onUnknownVersion(v);
    }
    return blob;
  }

  if (v === CURRENT_SCHEMA_VERSION) {
    return blob;
  }

  // Apply each migration step from the current version up to CURRENT.
  let migrated: Record<string, unknown> = { ...blob };
  for (let step = v; step < CURRENT_SCHEMA_VERSION; step++) {
    const migrateFn = MIGRATIONS[step];
    if (migrateFn !== undefined) {
      migrated = migrateFn(migrated);
    }
  }

  return { ...migrated, _v: CURRENT_SCHEMA_VERSION } as unknown as T;
}

/**
 * Stamp `_v: CURRENT_SCHEMA_VERSION` onto a blob before persisting.
 * Use at every write site. Callers guard null themselves.
 */
export function stampSchemaVersion<T extends Record<string, unknown>>(
  blob: T,
): T & { _v: number } {
  return { ...blob, _v: CURRENT_SCHEMA_VERSION };
}
