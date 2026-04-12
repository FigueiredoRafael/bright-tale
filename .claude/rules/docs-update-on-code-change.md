# Mandatory Documentation Sync

Applied when: any code change that affects documented behavior.

## Rule

After implementing a code change, check `.claude/docs-config.yaml` to see which documentation sections are affected by the files you changed. If affected docs exist, update them.

## Process

1. List all files you changed
2. Look up each file path in `docs-config.yaml` → `feature_mappings` and `file_type_to_section`
3. For each matched documentation section:
   - Read the current documentation
   - Compare against the new code
   - Update if there's drift
4. If no documentation exists yet, note it as "missing docs" in your completion report

## Routing Table (Quick Reference)

| Changed Path | Update |
|---|---|
| `apps/api/src/routes/*` | API reference docs |
| `supabase/migrations/*` | Database schema docs |
| `packages/shared/src/schemas/*` | API reference (request/response shapes) |
| `apps/app/src/app/*` | Feature page docs |
| `apps/app/src/components/*` | Component docs |
| `agents/*` | Agent definition docs |
| `apps/api/src/lib/ai/*` | AI integration docs |

## Skip Documentation Update If

- The change is purely internal refactoring with no behavior change
- The change is a test file only
- The change is a dev tooling/config change
