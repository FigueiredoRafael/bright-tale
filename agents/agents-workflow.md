# BrightCurios Agent Workflow

## Overview

This document defines the complete 4-agent content pipeline for BrightCurios. Each agent has a specific role with strict input/output contracts that chain together seamlessly.

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              BRIGHTCURIOS CONTENT PIPELINE                                      │
│                                                                                                 │
│    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐          │
│    │   AGENT 1    │      │   AGENT 2    │      │   AGENT 3    │      │   AGENT 4    │          │
│    │  BRAINSTORM  │ ──→  │   RESEARCH   │ ──→  │  PRODUCTION  │ ──→  │    REVIEW    │ ──→ PUBLISH
│    │              │      │              │      │              │      │              │          │
│    └──────────────┘      └──────────────┘      └──────────────┘      └──────────────┘          │
│           │                     │                     │                     │                  │
│           ▼                     ▼                     ▼                     ▼                  │
│    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐          │
│    │ User selects │      │ User reviews │      │ Assets ready │      │ Final QA +   │          │
│    │ one idea     │      │ & validates  │      │ for review   │      │ Publish plan │          │
│    └──────────────┘      └──────────────┘      └──────────────┘      └──────────────┘          │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Summary

| Agent             | File                    | Purpose                           | Input                       | Output                       |
| ----------------- | ----------------------- | --------------------------------- | --------------------------- | ---------------------------- |
| **1. Brainstorm** | `agent-1-brainstorm.md` | Generate & validate content ideas | Theme, goal, constraints    | 5 ideas + recommendation     |
| **2. Research**   | `agent-2-research.md`   | Validate & research selected idea | Selected idea + focus areas | Sources, stats, validation   |
| **3. Production** | `agent-3-production.md` | Create all content assets         | Idea + research findings    | Blog, video, shorts, podcast |
| **4. Review**     | `agent-4-review.md`     | Quality gate + publish planning   | Production assets           | Feedback + publish schedule  |

---

## Data Flow Contracts

### Stage 1 → Stage 2 (Brainstorm → Research)

**User Action Required:** Select one idea from BC_BRAINSTORM_OUTPUT

```yaml
# Passed to BC_RESEARCH_INPUT.selected_idea:
selected_idea:
  idea_id: "" # From ideas[selected].idea_id
  title: "" # From ideas[selected].title
  core_tension: "" # From ideas[selected].core_tension
  target_audience: "" # From ideas[selected].target_audience
  scroll_stopper: "" # From ideas[selected].scroll_stopper
  curiosity_gap: "" # From ideas[selected].curiosity_gap
  primary_keyword:
    term: "" # From ideas[selected].primary_keyword.term
    difficulty: "" # From ideas[selected].primary_keyword.difficulty
  monetization:
    affiliate_angle: "" # From ideas[selected].monetization.affiliate_angle
```

---

### Stage 2 → Stage 3 (Research → Production)

**User Action Required:** Review research, confirm proceed/pivot/abandon

```yaml
# Passed to BC_PRODUCTION_INPUT:
selected_idea:
  idea_id: ""
  title: "" # Or refined_angle.updated_title
  core_tension: ""
  target_audience: ""
  scroll_stopper: "" # Or refined_angle.updated_hook
  curiosity_gap: ""
  monetization:
    affiliate_angle: ""

research:
  summary: "" # From research_summary
  validation:
    verified: true # From idea_validation.core_claim_verified
    evidence_strength: "" # From idea_validation.evidence_strength
  key_sources:
    - title: "" # From sources[].title
      url: "" # From sources[].url
      key_insight: "" # From sources[].key_insight
  key_statistics:
    - claim: "" # From statistics[].claim
      figure: "" # From statistics[].figure
      context: "" # From statistics[].context
  expert_quotes:
    - quote: "" # From expert_quotes[].quote
      author: "" # From expert_quotes[].author
      credentials: "" # From expert_quotes[].credentials
  counterarguments:
    - point: "" # From counterarguments[].point
      rebuttal: "" # From counterarguments[].rebuttal
```

---

### Stage 3 → Stage 4 (Production → Review)

**User Action Required:** None (automatic handoff)

```yaml
# Full BC_PRODUCTION_OUTPUT is passed to BC_REVIEW_INPUT
```

---

### Stage 4 → Publish

**User Action Required:** Make revisions if needed, confirm publish

```yaml
# If overall_verdict == "approved":
#   - publication_plan contains full schedule
#   - ready_to_publish: true
#   - User exports and publishes via platform

# If overall_verdict == "revision_required":
#   - Return to Production with specific feedback
#   - Fix issues, re-submit for review

# If overall_verdict == "rejected":
#   - Return to Brainstorm or Research
#   - Rare, indicates fundamental issues
```

---

## ChatGPT Custom GPT Setup

### GPT 1: BC — Brainstorm Agent

**Name:** `BC — Brainstorm Agent`

**Description:** Generate and validate content ideas for BrightCurios. Outputs structured YAML with 5 ideas and a recommendation.

**Instructions:** Copy full content from `agent-1-brainstorm.md`

**Capabilities:**

- ✅ Web Browsing (for trend research)
- ❌ DALL-E Image Generation
- ❌ Code Interpreter

**Conversation Starters:**

- "Generate 5 ideas about productivity"
- "I need content ideas for psychology with an affiliate focus"
- "What content should I make about habit formation?"

---

### GPT 2: BC — Research Agent

**Name:** `BC — Research Agent`

**Description:** Validate and research a selected content idea. Finds sources, statistics, and expert quotes.

**Instructions:** Copy full content from `agent-2-research.md`

**Capabilities:**

- ✅ Web Browsing (required for research)
- ❌ DALL-E Image Generation
- ❌ Code Interpreter

**Conversation Starters:**

- "Research this idea: [paste selected_idea YAML]"
- "Validate the claims in this content idea"
- "Find sources for this topic"

---

### GPT 3: BC — Production Agent

**Name:** `BC — Production Agent`

**Description:** Create blog posts, video scripts, shorts, and podcast content from validated ideas.

**Instructions:** Copy full content from `agent-3-production.md`

**Capabilities:**

- ❌ Web Browsing (works from provided research)
- ❌ DALL-E Image Generation
- ❌ Code Interpreter

**Conversation Starters:**

- "Create content for this idea: [paste idea + research YAML]"
- "Write the blog and video script for this topic"
- "Generate production assets"

---

### GPT 4: BC — Review Agent

**Name:** `BC — Review Agent`

**Description:** Review content for quality, provide feedback, and create publication schedules.

**Instructions:** Copy full content from `agent-4-review.md`

**Capabilities:**

- ❌ Web Browsing
- ❌ DALL-E Image Generation
- ❌ Code Interpreter

**Conversation Starters:**

- "Review this content: [paste production YAML]"
- "Is this ready to publish?"
- "Create a publication schedule for this content"

---

## Workflow Checklist

### Per-Content Workflow

- [ ] **Brainstorm Stage**
  - [ ] Provide BC_BRAINSTORM_INPUT to Agent 1
  - [ ] Receive 5 ideas with verdicts
  - [ ] Select ONE idea to proceed
  - [ ] Save to platform / idea library

- [ ] **Research Stage**
  - [ ] Pass selected_idea to Agent 2
  - [ ] Add research_focus questions
  - [ ] Receive validated research with sources
  - [ ] Review refined_angle recommendation
  - [ ] Decide: proceed / pivot / abandon

- [ ] **Production Stage**
  - [ ] Pass idea + research to Agent 3
  - [ ] Receive full content assets:
    - [ ] Blog post (full draft)
    - [ ] Video script with timestamps
    - [ ] 3 shorts scripts
    - [ ] Podcast talking points
    - [ ] Engagement assets

- [ ] **Review Stage**
  - [ ] Pass production assets to Agent 4
  - [ ] Receive quality feedback
  - [ ] Address critical issues
  - [ ] Get publication plan

- [ ] **Publish Stage** (Platform)
  - [ ] Export final assets
  - [ ] Follow publication schedule
  - [ ] Cross-promote per plan

---

## Version History

| Version | Date       | Changes                                        |
| ------- | ---------- | ---------------------------------------------- |
| 2.0     | 2026-02-01 | Complete rewrite with 4-agent chained workflow |
| 1.0     | 2025-xx-xx | Initial 3-agent setup                          |
