import { NextResponse } from "next/server";

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
 * Custom API error class for route handlers
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
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

/**
 * Create a success JSON response with the standard envelope
 */
export function createSuccessResponse(data: unknown, status: number = 200) {
  return NextResponse.json({ data, error: null }, { status });
}

/**
 * Create an error response object (for inline use)
 */
export function createErrorResponse(message: string, status: number) {
  return { data: null, error: { message, code: status } };
}

/**
 * Handle API errors and return appropriate response
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { data: null, error: { message: error.message, code: error.code } },
      { status: error.status },
    );
  }

  if (error instanceof SupabaseError) {
    const { code, status } = translateSupabaseError(error.original);
    return NextResponse.json(
      { data: null, error: { message: error.message, code } },
      { status },
    );
  }

  // Supabase client errors come as plain objects with code/message
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const err = error as { code?: string; message: string };
    const { code, status } = translateSupabaseError(err);
    return NextResponse.json(
      { data: null, error: { message: err.message, code } },
      { status },
    );
  }

  console.error('Unhandled API error:', error);
  return NextResponse.json(
    { data: null, error: { message: 'Internal server error', code: 'INTERNAL' } },
    { status: 500 },
  );
}
