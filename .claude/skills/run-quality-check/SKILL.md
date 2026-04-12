# /run-quality-check — Parallel Quality Validation

Run typecheck, lint, tests, and build across all workspaces in parallel.

## Usage

```bash
/run-quality-check         # Run all checks
/run-quality-check api     # Run checks for API only
/run-quality-check app     # Run checks for App only
```

## Instructions

### Full Check (no arguments)

Run these in parallel:

1. **TypeScript:** `npm run typecheck`
2. **Lint:** `npm run lint`
3. **Tests:** `npm run test`
4. **Build:** `npm run build`

### Scoped Check (with argument)

| Argument | Commands |
|---|---|
| `api` | `npm run test:api && npm run build:api` |
| `app` | `npm run test:app` |
| `shared` | TypeScript check on packages/shared |

### Report Format

```markdown
## Quality Check Report

| Check | Status | Details |
|-------|--------|---------|
| TypeScript | ✅/❌ | X errors |
| Lint | ✅/❌ | X warnings, Y errors |
| Tests | ✅/❌ | X passed, Y failed |
| Build | ✅/❌ | Build time: Xs |

### Failures (if any)

#### TypeScript Errors
```
[error output]
```

#### Failed Tests
```
[test output]
```
```

### Rules

- Run all checks even if one fails (don't short-circuit)
- Include error output for failed checks
- Suggest fixes for common errors
- If all pass, just say "All checks passed ✅"
