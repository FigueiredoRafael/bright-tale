import { NextResponse } from 'next/server';
import type { ErrorCode } from './errors';

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data, error: null }, { status });
}

export function fail(
  code: ErrorCode,
  message: string,
  extras?: Record<string, unknown>,
  status = 400
): NextResponse {
  return NextResponse.json(
    { data: null, error: { code, message, ...extras } },
    { status }
  );
}
