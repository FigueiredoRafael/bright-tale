# WP SEO Enhance — MCP Server Design Spec

**Date:** 2026-04-21
**Status:** Approved

## Summary

A global Python MCP server (`wp-seo-enhance`) that audits and improves WordPress blog post SEO. Designed as a post-publish enhancer: after publishing a post, the skill orchestrates internal link injection, reciprocal backlinking, alt text enrichment, Yoast meta sync, and thin content flagging. All content changes require user approval via diff preview before applying.

## Architecture

### Approach: Modular MCP Server

One Python MCP server with pluggable internal modules. Single process, shared post index, per-site feature toggles via config.

### Project Location & Installation

- **Code:** `~/tools/wp-seo-enhance/`
- **Config:** `~/.config/wp-seo-enhance/config.yaml`
- **MCP registration:** `~/.claude/settings.json` (global, all projects)
- **Skill file:** `~/.claude/skills/wp-seo-enhance/SKILL.md` (global)

### File Structure

```
wp-seo-enhance/
├── pyproject.toml                 # deps: mcp, httpx, pyyaml, beautifulsoup4
├── config.example.yaml
├── src/
│   └── wp_seo_enhance/
│       ├── __init__.py
│       ├── server.py              # MCP server entry, registers module tools
│       ├── config.py              # YAML loader
│       ├── cli.py                 # One-time init (pull from Supabase → save config)
│       ├── wp_client.py           # Shared async WordPress REST API client (httpx)
│       ├── post_index.py          # Cached post corpus + relatedness scoring
│       ├── diff.py                # HTML diff preview generator
│       └── modules/
│           ├── linker.py          # Internal link suggestions + injection
│           ├── backlinker.py      # Reciprocal links in older posts
│           ├── auditor.py         # SEO audit scoring + thin content flagging
│           ├── media.py           # Alt text enrichment
│           └── yoast.py           # Focus keyword, meta desc, schema sync
└── skill/
    └── SKILL.md                   # Claude Code skill (copied to ~/.claude/skills/)
```

### Dependencies

**Runtime:** `mcp`, `httpx`, `pyyaml`, `beautifulsoup4`
**CLI init only (optional):** `supabase-py`, `pycryptodome` (for one-time credential pull from Bright Tale DB)

## Configuration

### Config File

Location: `~/.config/wp-seo-enhance/config.yaml`

```yaml
sites:
  brightcurios:
    url: "https://brightcurios.com"
    username: "admin"
    app_password: "xxxx xxxx xxxx xxxx"
    modules: [linker, backlinker, auditor, media, yoast]

  other-site:
    url: "https://other-site.com"
    username: "admin"
    app_password: "xxxx xxxx xxxx xxxx"
    modules: [linker, auditor]
```

### One-Time Init from Bright Tale

`wp-seo-enhance init --from-brighttale` connects to Supabase, reads `wordpress_configs` table, decrypts passwords (AES-256-GCM), writes to `config.yaml`. After init, no Supabase dependency at runtime.

### MCP Registration

In `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "wp-seo-enhance": {
      "command": "uv",
      "args": ["run", "--directory", "~/tools/wp-seo-enhance", "wp-seo-enhance"]
    }
  }
}
```

## MCP Tools

### Core

| Tool | Input | Output |
|------|-------|--------|
| `wp_list_sites` | — | Site names + URLs from config |
| `wp_audit_post` | `site`, `post_id` or `url` | SEO score + issue breakdown |
| `wp_audit_site` | `site`, `limit?` | Ranked posts by SEO score (worst-first) |

### Linker Module

| Tool | Input | Output |
|------|-------|--------|
| `wp_find_related` | `site`, `post_id` | Ranked related posts with relevance score |
| `wp_suggest_links` | `site`, `post_id`, `max_links?` | Suggested links with anchor text + placement |
| `wp_suggest_backlinks` | `site`, `post_id`, `max_posts?` | Older posts that should link TO this post |
| `wp_preview_changes` | `site`, `post_id`, `changes[]` | HTML diff (before/after) |
| `wp_apply_changes` | `site`, `post_id`, `changes[]` | Updated post URL |

**`changes[]` shape:**
```python
Change = {
    "type": "add_link" | "update_alt" | "update_meta",
    "target_post_id": int,           # post being modified
    "anchor_text": str,              # for add_link: text to wrap
    "href": str,                     # for add_link: destination URL
    "position": int,                 # char offset in post content
    "media_id": int,                 # for update_alt
    "alt_text": str,                 # for update_alt
    "meta_field": str,               # for update_meta
    "meta_value": str,               # for update_meta
}
```

### Media Module

| Tool | Input | Output |
|------|-------|--------|
| `wp_audit_images` | `site`, `post_id` | Images with current alt text + suggestions |
| `wp_update_alt_text` | `site`, `media_id`, `alt_text` | Confirmation |

### Yoast Module

| Tool | Input | Output |
|------|-------|--------|
| `wp_get_yoast_meta` | `site`, `post_id` | Current focus keyword, meta desc, schema |
| `wp_update_yoast_meta` | `site`, `post_id`, `fields` | Confirmation |

### Auditor Module

| Tool | Input | Output |
|------|-------|--------|
| `wp_flag_thin_content` | `site`, `min_words?` | Posts under threshold with expansion suggestions |

## Post Index & Relatedness

### Indexing

- Fetches all published posts via `GET /wp-json/wp/v2/posts?per_page=100&status=publish` (paginated)
- Per post extracts: title, slug, categories, tags, Yoast focus keyword, H2 headings, keyword bag (top terms by frequency)
- In-memory dict keyed by post ID
- Cache TTL: 10 minutes. Invalidated immediately when `wp_apply_changes` modifies a post.

### Relatedness Scoring

TF-based keyword overlap — no external embeddings, no AI calls.

Weighted sum:
- **Focus keyword match** (weight 4) — Yoast focus keyword appears in another post's content
- **Tag overlap** (weight 3) — shared tags
- **Category overlap** (weight 2) — same category
- **Keyword bag overlap** (weight 1) — content term similarity

Pure keyword matching. Fast, deterministic, zero cost. Sufficient for corpora under ~500 posts. Semantic scoring via embeddings can be added later if needed.

## Link Injection Strategy

### Finding Anchor Points

1. Parse post HTML with BeautifulSoup
2. For each related post, search content for keyword phrases matching: focus keyword, title fragments, tag names
3. Pick the **first natural occurrence** of each phrase
4. Max 1 link per target post. Max 5 new links per post total.

### Injection Rules

- Never link the same URL twice in one post
- Never inject inside an existing `<a>` tag
- Never inject inside headings (H1-H3), blockquotes, or figure captions
- Prefer matches in the first 60% of the post body
- If no natural keyword match exists, skip — never force a link

### Backlink Strategy

- Same rules, reversed: find where new post's keywords appear in older posts
- Max 3 older posts modified per publish event
- Each older post gets max 1 new link to the new post

### Diff Preview

- Side-by-side: line number, original text, proposed text with `<a>` tag highlighted
- Grouped by post (multiple posts in one preview if backlinks touch several)
- User can approve all, approve per-post, or reject

## Skill Workflow

Invoked manually after publishing (or on any existing post). Not auto-triggered.

### Steps

1. **Audit** — `wp_audit_post` → present score breakdown
2. **Internal links** — `wp_find_related` → `wp_suggest_links` → `wp_suggest_backlinks` → `wp_preview_changes` → wait for approval → `wp_apply_changes`
3. **Image alt text** — `wp_audit_images` → suggest improvements → `wp_update_alt_text` per approved change
4. **Yoast meta** — `wp_get_yoast_meta` → suggest improvements if weak → `wp_update_yoast_meta` with approved changes
5. **Thin content flag** — If word count < 1000, list recommended sections to add (no auto-write)
6. **Summary** — What changed, how many posts touched, new SEO score

## Yoast Write Access

Yoast REST API is read-only for SEO fields. To enable write access, a small WordPress plugin or `functions.php` snippet is required to expose `_yoast_wpseo_metadesc` and `_yoast_wpseo_focuskw` as writable REST fields via `register_rest_field()`. This is a one-time WordPress setup step documented in the skill.

## Security

- App passwords stored in local YAML config file (not committed to any repo)
- Config file permissions: `chmod 600 ~/.config/wp-seo-enhance/config.yaml`
- No credentials in environment variables at runtime
- One-time init decrypts Bright Tale credentials locally — no Supabase connection after init
- All WordPress API calls over HTTPS with Basic Auth

## Out of Scope

- Auto-triggering after pipeline publish (future hook)
- Content auto-generation or rewriting (only flags thin content)
- Vector/semantic embeddings for relatedness (keyword overlap sufficient for now)
- Multi-user access control (single-user CLI tool)
