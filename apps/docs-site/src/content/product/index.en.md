# Product Overview

## What is BrightTale

BrightTale is an AI-powered content generation platform for creators who need to produce blogs and YouTube videos at scale without losing quality.

## Why it Exists

Built to solve a real pain: **not enough time to produce quality content in multiple formats**. A single topic automatically generates blog, video, shorts, podcast, and engagement assets.

## Value Proposition

1. **Define a topic** → AI generates complete multi-format content
2. **Automated pipeline** — no manual YAML copy-pasting
3. **Direct publishing** to WordPress / YouTube
4. **Minimal clicks** — built for non-technical users

## How it Works

```
1. Choose a topic
2. Agent 1 (Brainstorm) generates 5-10 ideas
3. Select the best idea
4. Agent 2 (Research) validates and finds sources
5. Agent 3 (Production) creates blog + video + shorts + podcast
6. Agent 4 (Review) does QA and builds a publishing plan
7. Publish directly to WordPress/YouTube
```

## Monorepo

```
bright-tale/
├── apps/
│   ├── app/          ← Main UI (Next.js, port 3000)
│   ├── api/          ← API (Next.js Route Handlers, port 3001)
│   ├── web/          ← Landing page (port 3002)
│   └── docs-site/    ← This documentation (port 3003)
├── packages/
│   └── shared/       ← Types, Zod schemas, mappers
├── agents/           ← Agent definitions (markdown)
├── supabase/         ← Migrations + seed SQL
└── scripts/          ← Helper scripts
```
