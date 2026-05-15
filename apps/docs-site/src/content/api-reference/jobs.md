# Background Jobs (Inngest)

All background jobs run via [Inngest](https://www.inngest.com). The API exposes the Inngest endpoint at `POST /inngest`.

Source: `apps/api/src/jobs/`

---

## expire-reservations

**File:** `apps/api/src/jobs/expire-reservations.ts`
**Inngest ID:** `expire-reservations`
**Schedule:** every 5 minutes (`*/5 * * * *`)
**Retries:** 2

Sweeps held credit reservations older than 15 minutes and marks them expired. Calls the `expire_stale_reservations` Supabase RPC via `creditReservations.expireStale()`.

### Telemetry

Emits a structured Axiom event on every run:

```json
{
  "type": "credit_reservations.expired_count",
  "metric": "credit_reservations.expired_count",
  "expiredCount": 3,
  "ranAt": "2026-05-15T13:00:00.000Z"
}
```

### Alert threshold

When `expiredCount > 50` (named constant `EXPIRED_COUNT_ALERT_THRESHOLD = 50`), an additional event is logged at `error` level in Axiom with `type: "alert"` and a `[ALERT]` prefix in the message. No external webhook is configured — alerting relies on Axiom error dashboards. Raise the constant to tune sensitivity.

### Return value

```json
{ "expiredCount": 3, "ranAt": "2026-05-15T13:00:00.000Z" }
```

---

## affiliate-expire-referrals

**File:** `apps/api/src/jobs/affiliate-expire-referrals.ts`
**Inngest ID:** `affiliate-expire-referrals`
**Schedule:** `0 5 * * *` (05:00 UTC = 02:00 BRT)
**Retries:** 2

Expires pending affiliate referrals past their window. Uses `buildAffiliateContainer().expirePendingUseCase`.

---

## brainstorm-generate / research-generate / content-generate / production-generate / production-produce

Event-driven jobs triggered by the pipeline orchestrator. See `apps/api/src/jobs/` for each handler.

---

## reference-check

**Inngest ID:** `reference-check`

YouTube reference trend-detection job. Triggered when a new research session completes.
