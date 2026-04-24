# SEC-003 — Agent prompts: crown-jewel protection

**Status:** draft · **Owner:** Rafael · **Created:** 2026-04-23
**Priority:** critical — ship **together** with SEC-002; they depend on each other

## Why this is SEC-003 and its own card

The `agent_prompts` table holds the business rules that make BrightTale
different from anyone else running a GPT wrapper. Specifically:

- `instructions` (TEXT) — the system prompt for every content-pipeline agent
- `sections_json` (JSONB) — structured configuration per stage
- `input_schema` / `output_schema` — the contract the model must honor

Source confirms: admin edits prompts via a Server Action at
`apps/web/src/app/zadmin/(protected)/agents/[slug]/actions.ts` using the
service-role client. The table stores `instructions` as **plaintext** and
there is no audit trail for reads or writes.

Threat model for this row specifically:

| Threat | Today's defense | Gap |
|---|---|---|
| Phished admin password | (none — no MFA) | **critical** |
| Admin session stolen | session expires eventually | no step-up on writes |
| DB ops compromise | RLS deny-all, service-role required | no encryption at rest |
| SQL injection anywhere in the codebase | parameterized queries | plaintext in DB = read = done |
| Malicious or mistaken edit | git doesn't cover DB | no version history, no diff alert |
| Exfil via `GET /api/agents` | INTERNAL_API_KEY gate | no per-session read rate limit |
| Prompt injection on the model side | agent prompt quotes untrusted input | no integrity check on the prompt itself |

Losing these prompts = competitor has the product by lunchtime.
Quietly modified prompts = customers' content degrades for days before
anyone notices and you cannot prove it wasn't a model change.

## Outcome

- **Confidentiality**: prompt text is never at rest in plaintext outside the
  running Node process. A DB snapshot leak yields ciphertext only.
- **Integrity**: every prompt carries a content hash; middleware refuses to
  serve a prompt whose hash no longer matches. Any out-of-band edit is
  surfaced immediately.
- **Accountability**: every read and every write is logged with a diff and
  an identity. Post-incident investigation can rebuild the timeline.
- **Containment**: exfil rate is capped per session. A compromised admin
  session can read ≤ 10 prompts in 60 s before an alert fires.
- **Step-up**: writing any prompt requires a fresh MFA challenge — even
  inside an AAL2 session older than 5 minutes.

## Changes (ordered, all together)

### 1. Column-level encryption (AES-256-GCM + AAD)

- Add `instructions_ct` (BYTEA), `instructions_nonce` (BYTEA 12), `instructions_tag` (BYTEA 16), `key_version` (INT default 1).
- Drop the plaintext `instructions` column only after the migration path proves the round-trip.
- AAD = `sha256("agent_prompts|instructions|" || id || "|" || coalesce(org_id, '<global>'))`.
  This binds the ciphertext to its row. Swapping a ciphertext from a
  different prompt or a different org into this cell fails decryption.
- Same treatment for `sections_json` if it carries content (it does for many stages).
- `key_version` lets us rotate — the handler looks up the right key,
  decrypts, optionally re-encrypts under the current version.
- `crypto.ts` grows a `encrypt(plaintext, { aad })` / `decrypt(ct, { aad })`
  overload. **This is the same AAD gap flagged on the earlier pentest
  `crypto` finding** — one fix pattern handles both.

### 2. Append-only audit log: `agent_prompt_audit_log`

Fields:
```
id BIGSERIAL PK
prompt_id UUID FK agent_prompts(id) ON DELETE CASCADE
actor_user_id UUID FK auth.users(id)
event TEXT CHECK IN ('read','update','delete','export')
diff_sha256 BYTEA        -- sha256(old.instructions || '\n---\n' || new.instructions)
old_sha256 BYTEA
new_sha256 BYTEA
ip_hash BYTEA
ua_hash BYTEA
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
metadata JSONB NOT NULL DEFAULT '{}'::jsonb
```

- Triggers refuse UPDATE / DELETE hard.
- RLS deny-all. service_role writes only.
- Writes happen from the Server Action after success (fail-secure: if the
  audit insert fails, the UPDATE is rolled back).

### 3. `agent_prompt_versions` — versioning + integrity

```
id BIGSERIAL PK
prompt_id UUID FK
version INT
content_sha256 BYTEA NOT NULL           -- sha256 of plaintext (hash only; no secret)
instructions_ct BYTEA                   -- the ciphertext at this version
sections_json_ct BYTEA
author_user_id UUID
created_at TIMESTAMPTZ DEFAULT now()
UNIQUE (prompt_id, version)
```

- Every update inserts a new version; the current pointer lives on
  `agent_prompts.current_version`.
- A nightly job compares `agent_prompts.current_version` content hash to
  the hash of the current row. If they diverge, alert. This catches
  tampering that skipped the audit log.
- Rollback is a row copy, not a destructive update.

### 4. Step-up MFA on writes

- `apps/web/src/middleware.ts` ALREADY gates protected pages on AAL2
  (after SEC-002 lands).
- Add: any Server Action under `/admin/(protected)/agents/*/actions.ts`
  calls `require_fresh_mfa(ttlSec: 300)` before writing.
- Implementation: the admin UI stores a signed cookie `mfa_fresh_at` set
  when the user last completed an MFA challenge. If older than 5 min, the
  Server Action returns an `mfa_challenge_required` result and the UI
  pops a TOTP modal; on success, a fresh cookie is set and the action
  retries. Never bypass this on the server.

### 5. Per-session read rate limit

- The admin UI reading the prompt list is 1 read. Opening a prompt editor
  is 1 read. A "download all" action is 1 read per prompt.
- Cap: **10 prompt-reads / 60s / admin session**. Above threshold:
  - Further reads return 429.
  - Event fires `agent_prompt_audit_log` with `event=read` AND `metadata.anomaly=rate`.
  - Email + Slack alert to Rafael.
- Rationale: a human admin opens 2–3 prompts per session. 10 is the
  "bulk download" threshold.

### 6. Least-privilege admin roles

Split `isAdminUser` into:
- `admin:ops` — users, orgs, affiliates, analytics, engine logs, **no prompt read**.
- `admin:prompts` — agents (read + write).
- `admin:root` — both (rare).

Most day-to-day admin work needs `admin:ops`. Only prompt curators get
`admin:prompts`. A single compromise of an `admin:ops` account does **not**
leak prompts.

### 7. Honey prompts

- Seed 1-2 rows in `agent_prompts` with benign-looking instructions that
  contain a canary string (random, unique, never used elsewhere).
- Scheduled job (`agents-canary-watcher`): once an hour, query every
  configured AI provider with a probe prompt and check whether the
  provider response, chat logs, or web search results contain the canary.
- A hit = someone is running our prompts in their own pipeline. Alert + rotate.

### 8. Export hardening

- `/admin/prompts/export` exists nowhere today — **do not build it** as a
  plain download. If/when needed:
  - Requires separate "high-sensitivity" role.
  - Requires typed confirmation + MFA challenge at the time of request.
  - Emits to a time-limited encrypted URL delivered by email; not an
    in-browser download.
  - Each export is an audit event of its own kind.

### 9. Response hygiene on admin prompt pages

- `Cache-Control: no-store, no-cache, must-revalidate, private`
- Prompts never serialized into `window.__NEXT_DATA__` or similar global
  shapes where a browser extension or compromised 3rd-party script could
  grab them. If Next.js serializes them by default (it does for RSC
  payloads that hydrate the editor), inline a check that forbids including
  the prompt text in the initial HTML — lazy-load via a separate
  authenticated fetch the client makes after mount.

### 10. API surface removal

- `apps/api/src/routes/agents.ts` currently serves agents over `/api`.
  Confirm that consumer is only internal (apps/app pipeline calls it with
  INTERNAL_API_KEY). If so, move it behind a dedicated internal-only
  subpath that the external rewrite can never reach, or split it into a
  different service that's not exposed to the internet at all.

## Test plan

- Unit: AES-GCM roundtrip with AAD tampering (must fail), version
  inserter, content-hash integrity checker, rate-limit counter, honey
  watcher.
- Integration:
  - Update a prompt from the admin UI → new version inserted, audit row
    exists, content hash matches.
  - Attempt update without fresh MFA → rejected.
  - Tamper a row out-of-band (SQL UPDATE against ciphertext) → nightly
    integrity job detects it.
  - Read 11 prompts in 60s from the same session → 11th blocked + alert.
- Security:
  - Pentest: probe `/api/agents/*` unauth → 401. probe the admin UI
    fetch after logout → 401. probe bulk reads → 429 after threshold.
  - Grep tests: `"instructions"` in request/response bodies must never
    appear outside the admin prompt editor and its Server Actions.
- Data migration: the initial encrypt-in-place migration runs once,
  idempotent, verifies round-trip for every row before deleting plaintext.

## Estimated effort

13–21 points. Most of the work is:
- crypto.ts AAD refactor + re-encrypt worker (3)
- Migrations: ciphertext columns + audit + versions (2)
- Server Action rewrite (encrypt on write, decrypt on read) (3)
- Step-up MFA middleware + UI (3)
- Rate limit counter + alert hook (2)
- Role split + middleware (2)
- Honey prompts + watcher job (2)
- Documentation + runbooks (1)

## Dependencies

- **SEC-002 must land first**. This card assumes AAL2 is enforced; without
  MFA there is no step-up to step up from.
- The `crypto.ts` AAD addition is shared with the general crypto finding
  flagged in the earlier pentest — implement once, use everywhere encrypted
  data lives (`ai_provider_configs`, `wordpress_configs`, `agent_prompts`).

## References

- OWASP ASVS V6.2 (data at rest), V8.3 (sensitive-data integrity), V14.6 (audit logging)
- NIST SP 800-38D — Galois/Counter Mode
- RFC 5116 — AEAD (why AAD is not optional)
- [previous finding: "AES-256-GCM without AAD binding — swappable ciphertexts across records"](../security/findings/pentest-localhost-dev-*.json)
