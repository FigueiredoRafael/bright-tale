export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INTERNAL'
  | 'UPSTREAM_ERROR';

export class SupabaseError extends Error {
  constructor(
    public readonly original: { code?: string; message: string; details?: string },
    public readonly httpStatus: number = 500
  ) {
    super(original.message);
    this.name = 'SupabaseError';
  }
}

/**
 * Translates a Supabase/PostgreSQL error code into our API error code.
 */
export function translateSupabaseError(err: { code?: string; message: string }): {
  code: ErrorCode;
  status: number;
} {
  switch (err.code) {
    case 'PGRST116': return { code: 'NOT_FOUND', status: 404 };
    case '23505':    return { code: 'CONFLICT', status: 409 };
    case '23503':    return { code: 'VALIDATION_ERROR', status: 400 };
    case '42501':    return { code: 'FORBIDDEN', status: 403 };
    default:         return { code: 'INTERNAL', status: 500 };
  }
}
