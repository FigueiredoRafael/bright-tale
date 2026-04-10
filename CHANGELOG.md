# Changelog

## 2026-01-31

- chore(docs): Declare `README.md` as the single source of truth for project requirements.
- feat(export): Abort ZIP export and standardize bulk export to JSON-only (server returns `projects-export.json`).
- feat(export): Add lightweight export job API to support async exports and progress polling (in-memory implementation, low-risk scaffold).
- test(export): Add tests to verify JSON export and export job endpoints.

> Notes: ZIP multi-file export has been explicitly aborted for Phase 1; ZIP support is deferred for a later iteration and will be reintroduced as an async job with progress tracking when required.
