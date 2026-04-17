# Skipped in Phase 2C — tracked for Phase 2F

The `AffiliateAdminActions` contract from `@tn-figueiredo/affiliate-admin@0.3.3`
declares 14 actions. Phase 2C wires 10 and stubs 4 with throw-on-invoke.

- **`revalidateTaxId(affiliateId)`** — requires real Receita Federal
  integration (the current `StubTaxIdRepository` in apps/api returns a canned
  response). No corresponding admin HTTP route exists in Phase 2A.
- **`addSocialLink(affiliateId, platform, url)`** — no HTTP route in 2A; the
  package's `VerifySocialLinksUseCase` exists but is not wired.
- **`deleteSocialLink(affiliateId, platform)`** — same as above.
- **`verifySocialLinks(affiliateId)`** — same as above.

## Resolution path (2F)

1. Either add custom routes in `apps/api/src/routes/admin-affiliate/` for
   each of the four, OR upstream a PR to `@tn-figueiredo/affiliate` that
   registers them via `registerAffiliateAdminRoutes`.
2. Replace throws in `actions/skipped-2f.ts` with real `fetch` wrappers
   that POST / DELETE to the new routes.
3. Remove this file.

## References

- 2A spec §11.2C handoff:
  `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`
- 2C spec §4 decision matrix:
  `docs/superpowers/specs/2026-04-17-affiliate-2c-admin-ui-design.md`
