# Changelog

## 2026-05-24

### Video Pipeline Engines — Milestone 14 (#212)

- feat(assets): Video-track read-only asset layout with image-mode toggle (generate / prompts-only) persisted to `draft_json.assetSettings.imageMode` (#213, #219)
- feat(preview): Video-track read-only preview layout showing script chapters, b-roll prompts, thumbnail ideas, and full text bundle (#214)
- feat(publish): Video publish bundle mode UI — ZIP exporter, Direct (YouTube) mode, and bundle-type toggle (#215, #218)
- feat(shared): `videoAssetBundle` Zod schema + builder utility for packaging video assets (#216)
- feat(youtube): YouTube OAuth scaffolding + `publish_targets.kind` column for typed channel destinations (#217)
- feat(ai): AI image router + prompts-only short-circuit so image-generation calls are skipped when the user selects prompts-only mode (#220)
- feat(youtube): YouTube publish adapter + transport injection for the Direct publish path (#221)
- feat(youtube): YouTube publish API route + Direct-mode publish UI button wiring (#222)
- chore(video): Removed prototype directory `apps/app/src/app/[locale]/(app)/prototype/video-engines/` — design has shipped into the real engine components (#223)

## 2026-01-31

- chore(docs): Declare `README.md` as the single source of truth for project requirements.
- feat(export): Abort ZIP export and standardize bulk export to JSON-only (server returns `projects-export.json`).
- feat(export): Add lightweight export job API to support async exports and progress polling (in-memory implementation, low-risk scaffold).
- test(export): Add tests to verify JSON export and export job endpoints.

> Notes: ZIP multi-file export has been explicitly aborted for Phase 1; ZIP support is deferred for a later iteration and will be reintroduced as an async job with progress tracking when required.
