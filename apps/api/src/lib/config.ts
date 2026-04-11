export const AI_PROVIDER = process.env.AI_PROVIDER ?? "mock";
export const IDEMPOTENCY_TOKEN_TTL_SECONDS = Number(
  process.env.IDEMPOTENCY_TOKEN_TTL_SECONDS ?? "3600",
);
export const MAX_BULK_CREATE = Number(process.env.MAX_BULK_CREATE ?? "50");
export const ENABLE_BULK_LIMITS =
  (process.env.ENABLE_BULK_LIMITS ?? "false") === "true";

export default {
  AI_PROVIDER,
  IDEMPOTENCY_TOKEN_TTL_SECONDS,
  MAX_BULK_CREATE,
  ENABLE_BULK_LIMITS,
};
