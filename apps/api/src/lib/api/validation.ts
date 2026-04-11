/**
 * Validation middleware utilities for API routes
 */

import { z } from "zod";
import { ApiError } from "./errors.js";

export async function validateBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  try {
    const body = await request.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw error;
    }
    throw new ApiError(400, "Invalid JSON in request body", "INVALID_JSON");
  }
}

export function validateQueryParams<T extends z.ZodType>(
  url: URL,
  schema: T,
): z.infer<T> {
  const params = Object.fromEntries(url.searchParams);
  return schema.parse(params);
}
