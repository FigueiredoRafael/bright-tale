# Agent Prompt Audit — Post Plan A (2026-04-21)

Snapshot of 13-criterion fleet audit after landing Plan A (structural changes only).
Plan B (Themes 3/4/5 polish) is the next phase; this doc establishes the Plan A baseline.

## Commit Range

Plan A changes landed in `feat/agent-fleet-8.5`:

```
dd71279  expand Review inputSchema for Blog/Video/Podcast       Tasks 7-10
6eecf4f  podcast personal_angle → host_talking_prompts         Tasks 5-6
9f49b38  contract test: lock review inputSchema                Task 11 (initial)
9a1be31  contract test: cover Task 7-9 fields                  Task 11 (follow-up)
c90fc7c  align reviewOutputSchema with new agent contract      Task 15
5342ed4  shared tsc: exclude tests from rootDir                infra
558863b  review scoring → quality_tier enum + rubric_checks    Tasks 12-14
1a2f4ba  add quality_tier to shorts + engagement blocks        Task 12 follow-up
ff7afee  reviewTierCompat dual-read helper                     Task 16
ffd9606  ReviewEngine reads quality_tier + legacy fallback     Tasks 17-18
e84fca7  regenerate seed + timestamped migration               Task 20
```

Earlier prereq work (Plan A Tasks 1-4, landed before this stream):

```
1a285aa  rename monetization → monetization_hypothesis         Tasks 2-3
8540002  brainstorm seed field rename                          Task 4
76b4964  propagate monetization_hypothesis downstream          Task 3 (extended)
25c114b  timestamped migration for agent rename                infra
e85c7dd  persist + render monetization_hypothesis (legacy fb)  Task 3 (UI)
```

## Expected score movement (13-criterion scale)

Prior fleet average: 7.6. Target: ≥ 8.5 across all 9 agents after Plan B.

| Agent         | Pre-A | Post-A (est) | Δ    | Criteria lifted by Plan A                            |
|---------------|-------|--------------|------|------------------------------------------------------|
| Brainstorm    | 7.7   | 7.9          | +0.2 | 13 (hallucination surface — rename + "no brands" rule) |
| Research      | 8.0   | 8.0          | +0.0 | — (consumer of brainstorm; no direct change)          |
| Content-core  | 7.8   | 7.8          | +0.0 | — (not in Plan A scope)                              |
| Blog          | 7.9   | 8.1          | +0.2 | 4 (handoff: Review now sees blog fields fully)       |
| Video         | 7.6   | 7.8          | +0.2 | 4 (handoff: Review now sees script/thumbnail)        |
| Shorts        | 7.6   | 7.8          | +0.2 | 4 (handoff: per-short fields declared)               |
| Podcast       | 7.3   | 7.6          | +0.3 | 6, 13 (host_talking_prompts removes first-person fabrication) |
| Engagement    | 7.4   | 7.6          | +0.2 | 4 (handoff: hook_tweet + thread_outline declared)    |
| **Review**    | **7.0** | **8.2**    | **+1.2** | 4, 5, 6, 7, 9, 10, 13 (inputSchema + quality_tier + rubric + guardrails) |

## Residual gaps (target for Plan B)

1. **Compression** (Theme 4d in Plan B): `scripts/agents/review.ts` grew from 528 → 611 lines during Plan A. Plan B Theme 4d needs to cut redundant customSections without losing rubric guidance.
2. **Token budget** (Criterion 3): No agent was compressed in Plan A; same relative token cost.
3. **Manual vs. auto distinction** (Criterion 11): Review agent still speaks to "the reviewer" generically; Plan B can distinguish AI auto-review from human override clearly.
4. **Evidence strength terminology** (Criterion 12): Research output is still "strong / moderate / weak" string; Plan B should pin an enum.
5. **`CompletedStageSummary`**: still renders numeric `score/100`. Works (synthesized via `legacyScoreFromTier`) but UX polish belongs in Plan B.

## Backward compatibility window (30-day)

- Legacy `content_drafts.review_feedback_json` with numeric `score` still works via `deriveTier()` dual-read (`packages/shared/src/utils/reviewTierCompat.ts`).
- Legacy `podcasts.personal_angle` DB column kept as storage for the new `host_talking_prompts[]` (JSON-stringified). Reading a true legacy string returns empty array via try/catch guard.
- Legacy brainstorm ideas with `monetization.*` rendered via `normalizeLegacyIdea()` / `e85c7dd` UI fallback.

After 30 days (~2026-05-21) these compat paths can be removed.

## Validation

- **Typecheck**: clean across `@brighttale/api`, `@brighttale/app`, `@brighttale/shared`. `@brighttale/web` has 6 pre-existing affiliate-portal errors (not Plan A).
- **Tests**: `shared` 35/35, `app` 50/50, `web` 27/27. `api` 1010/1017 — 7 pre-existing failures in content-drafts and wordpress routes (present before Task 20; unrelated to agent prompt changes).
- **Round-trip smoke test**: podcast CREATE → GET → PATCH → DELETE with new `host_talking_prompts[]` shape verified end-to-end via curl against `localhost:3001/podcasts`.
- **Contract test**: `packages/shared/src/mappers/__tests__/agentContracts.test.ts` locks Review inputSchema against regression — 5/5 pass.

## Next

Plan B spec/plan to be written targeting:
- Themes 3, 4, 5 polish (token budget, manual mode, evidence enum)
- Theme 4d (final compression pass on review.ts + other over-long prompts)
- Post-Plan-B target: all 9 agents ≥ 8.5 on all 13 criteria
