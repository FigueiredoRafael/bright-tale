# Content Types

BrightTale generates 5 content formats from a single idea.

## Blog

**Pipeline:** Brainstorm → Research → Canonical Core → Blog Draft → Review → WordPress

| Field | Description |
|---|---|
| `outline` | Hierarchical section structure (JSON) |
| `full_draft` | Complete draft (HTML/Markdown) |
| `primary_keyword` | Main SEO keyword |
| `secondary_keywords` | Secondary keywords |
| `meta_description` | SEO meta description |
| `slug` | URL-friendly slug |
| `affiliate_placement` | Affiliate link positioning |
| `internal_links` | Suggested internal links |

---

## YouTube Video

**Pipeline:** Brainstorm → Research → Canonical Core → Video Draft → Review → Export

| Field | Description |
|---|---|
| `title_options[]` | 3 title options |
| `thumbnail_json` | Thumbnail visual concept |
| `script_json` | Script with chapters, timestamps, B-roll, sound design |
| `total_duration_estimate` | Estimated duration |

### Variants

| Variant | Description | Status |
|---|---|---|
| **Regular channel** | Educational/informational with face | ✅ Implemented |
| **Dark channel** | Narration + stock footage (faceless) | 🔲 Planned |
| **Courses** | Structured video series (modules + lessons) | 🔲 Planned |

---

## Shorts

3-5 clips per project. Each clip: hook, body, CTA, duration (15-60s), captions, transitions.

---

## Podcast

Episode title, description, intro hook, talking points with timings, personal angle, guest questions, outro.

---

## Canonical Core

Central framework powering **all** formats. Ensures blog, video, shorts, and podcast tell the same story with the same factual basis.

| Field | Purpose |
|---|---|
| `thesis` | Core argument (1 sentence) |
| `argument_chain` | Logical flow: premise → evidence → conclusion |
| `emotional_arc` | Emotional beats: setup → conflict → resolution |
| `key_stats` | Supporting data with sources |
| `key_quotes` | Expert quotes with credentials |
| `affiliate_moment` | Product, link, copy, positioning rationale |
| `cta_subscribe` | Subscription CTA |
| `cta_comment_prompt` | Engagement prompt |
