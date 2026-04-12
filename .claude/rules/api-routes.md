# API Route Rules

Applied when editing: `apps/api/src/routes/**`, `apps/api/src/lib/**`

## Response Envelope

ALL responses must use `{ data, error }`:
```typescript
// Success
return ok(res, data)

// Error
return fail(res, statusCode, { code: 'ERROR_CODE', message: 'Human-readable message' })
```

**No exceptions.** Even 404s, 401s, and 500s use this envelope.

## Request Validation

1. **Always validate** request body/query with Zod schemas from `@brighttale/shared`
2. Use the validation helpers in `apps/api/src/lib/api/validation.ts`
3. Return 400 with descriptive error for invalid requests

## Route Structure

```typescript
// Standard CRUD pattern:
// GET    /api/{resource}        — list (with pagination)
// POST   /api/{resource}        — create
// GET    /api/{resource}/:id    — get one
// PUT    /api/{resource}/:id    — full update
// PATCH  /api/{resource}/:id    — partial update
// DELETE /api/{resource}/:id    — delete
```

## Database Access

- Use Supabase client from `apps/api/src/lib/supabase/`
- Use `service_role` key (bypasses RLS)
- Always scope queries by `user_id` (from request context)
- Use mappers from `@brighttale/shared/mappers/db` for snake_case ↔ camelCase

## Error Handling

- Use error classes from `apps/api/src/lib/api/errors.ts`
- Don't expose internal errors to clients
- Log errors server-side, return generic messages to client
- Use `sendError()` helper for consistent error responses

## Pagination

List endpoints should support:
```
?page=1&limit=20&sort=created_at&order=desc
```

Return pagination metadata:
```json
{
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  },
  "error": null
}
```

## Security

- All routes require `X-Internal-Key` (enforced by middleware)
- Never trust client-supplied `user_id` headers
- Encrypt sensitive data (API keys) with AES-256-GCM before storing
- Use idempotency tokens for non-idempotent mutations
