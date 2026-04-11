/**
 * Lightweight Supabase client mock for unit tests.
 * Extend as needed — add methods when tests require them.
 */

type Fixtures = Record<string, unknown[]>;

function makeQueryBuilder(fixtures: Fixtures, table: string, rows?: unknown[]) {
  const data = rows ?? fixtures[table] ?? [];
  const builder: Record<string, unknown> = {
    data,
    error: null,
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    filter: () => builder,
    single: () => ({ data: (data as unknown[])[0] ?? null, error: null }),
    maybeSingle: () => ({ data: (data as unknown[])[0] ?? null, error: null }),
  };
  return builder;
}

export function createMockSupabase(fixtures: Fixtures = {}) {
  return {
    from: (table: string) => ({
      select: (_columns?: string) => makeQueryBuilder(fixtures, table),
      insert: (row: unknown) => ({
        select: () => ({
          single: () => ({ data: row, error: null }),
          data: Array.isArray(row) ? row : [row],
          error: null,
        }),
      }),
      update: (updates: unknown) => ({
        eq: () => ({
          select: () => ({
            single: () => ({ data: { ...((fixtures[table] ?? [null])[0] as object), ...(updates as object) }, error: null }),
          }),
          data: null,
          error: null,
        }),
      }),
      delete: () => ({
        eq: () => ({ data: null, error: null }),
        in: () => ({ data: null, error: null }),
      }),
    }),
    rpc: (_fn: string, _args?: unknown) => ({ data: null, error: null }),
  };
}
