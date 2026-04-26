/**
 * Wording — single source of truth for user-facing terminology.
 *
 * V0.2 decision: "tokens" (not "créditos"). Apply in UI/copy. DB columns
 * keep their existing names (e.g., `plan_credits`) — only presentation
 * layer is normalized.
 */

export const WORDING = {
  TOKENS: 'tokens',
  TOKENS_TITLE: 'Tokens',
  TOKEN_SINGULAR: 'token',
  TOKEN_TITLE: 'Token',
} as const;

export type WordingKey = keyof typeof WORDING;
