/**
 * Error handling utilities for API routes
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export function handleApiError(error: unknown): NextResponse<ErrorResponse> {
  console.error("API Error:", error);

  // Zod validation errors
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          message: "Validation error",
          code: "VALIDATION_ERROR",
          details: error.issues,
        },
      },
      { status: 400 },
    );
  }

  // Custom API errors
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          message: error.message,
          code: error.code,
        },
      },
      { status: error.statusCode },
    );
  }

  // Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Record not found
    if (error.code === "P2025") {
      return NextResponse.json(
        {
          error: {
            message: "Resource not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 },
      );
    }

    // Unique constraint violation
    if (error.code === "P2002") {
      return NextResponse.json(
        {
          error: {
            message: "A record with this value already exists",
            code: "DUPLICATE_RECORD",
          },
        },
        { status: 409 },
      );
    }

    // Foreign key constraint violation
    if (error.code === "P2003") {
      return NextResponse.json(
        {
          error: {
            message: "Related record not found",
            code: "FOREIGN_KEY_ERROR",
          },
        },
        { status: 400 },
      );
    }
  }

  // Generic server error
  return NextResponse.json(
    {
      error: {
        message: "Internal server error",
        code: "INTERNAL_ERROR",
      },
    },
    { status: 500 },
  );
}

export function createSuccessResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function createErrorResponse(
  message: string,
  status = 400,
  code?: string,
) {
  return NextResponse.json(
    {
      error: {
        message,
        code: code || (status === 404 ? "NOT_FOUND" : "ERROR"),
      },
    },
    { status },
  );
}
