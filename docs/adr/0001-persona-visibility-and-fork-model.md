# ADR 0001 — Persona Visibility and Fork Model

**Date:** 2026-05-18  
**Status:** Accepted

---

## Context

Personas are org-created writing identities. As the platform grows, users want to share high-quality personas across orgs (similar to ChatGPT public GPTs or Claude public skills), while keeping their own personas private by default.

The original schema had no `org_id` or visibility concept — all personas were implicitly global and editable by any authenticated user.

## Decision

Personas have two visibility levels:

- **Private** — visible and editable only by the owning org. Default on creation.
- **Global** — visible and usable by all orgs. Promoted from Private by an Admin after review. Users cannot self-publish as global; they submit for review.

Ownership rules:
- Only the owning org can edit a Persona directly.
- Any org can **fork** a Global Persona — creating a Private copy in their own org that they can edit freely and independently. Changes to the original global do not propagate to forks.

## Alternatives Considered

**Any user self-publishes as global** — rejected because there is no moderation layer. Inappropriate or low-quality personas would appear for all customers immediately.

**Only admins create global personas** — rejected because it removes user agency. Users should be able to contribute to the global pool; admins just gatekeep quality.

**Edit global freely (no fork)** — rejected because one user's edits to a global persona would change the output for every org using it. Unpredictable side-effects at scale.

**Fork-only, no direct edit of own personas** — rejected. Owners must be able to iterate on their own personas without going through a fork cycle.

## Consequences

- `personas` table gains `org_id` (FK to `orgs`) and `visibility` (`private` | `global`).
- `GET /api/personas` returns: all private personas belonging to the user's org + all global personas.
- New endpoints: `POST /personas/:id/fork`, `POST /personas/:id/promote` (admin only).
- The persona detail page shows a visibility badge and a fork button when viewing a global persona from another org.
