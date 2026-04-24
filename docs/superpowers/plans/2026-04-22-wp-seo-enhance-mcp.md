# WP SEO Enhance MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global Python MCP server that audits and improves WordPress blog post SEO — internal links, backlinks, alt text, Yoast meta, thin content flagging — with diff preview before any changes.

**Architecture:** Modular MCP server (`wp-seo-enhance`) using `mcp` SDK, `httpx` for async WP REST API calls, `BeautifulSoup` for HTML parsing. Config via YAML file. One-time CLI init pulls credentials from Bright Tale Supabase. Skill file orchestrates the workflow.

**Tech Stack:** Python 3.11+, mcp SDK, httpx, PyYAML, BeautifulSoup4, pytest, uv

---

## File Map

| File | Responsibility |
|------|---------------|
| `~/tools/wp-seo-enhance/pyproject.toml` | Project metadata, dependencies, entry points |
| `~/tools/wp-seo-enhance/config.example.yaml` | Template config for users |
| `src/wp_seo_enhance/__init__.py` | Package init |
| `src/wp_seo_enhance/server.py` | MCP server entry, registers all module tools |
| `src/wp_seo_enhance/config.py` | Load + validate YAML config |
| `src/wp_seo_enhance/wp_client.py` | Async WordPress REST API client (httpx) |
| `src/wp_seo_enhance/post_index.py` | Cached post corpus + relatedness scoring |
| `src/wp_seo_enhance/diff.py` | HTML diff preview generator |
| `src/wp_seo_enhance/modules/linker.py` | Internal link suggestion + HTML injection |
| `src/wp_seo_enhance/modules/backlinker.py` | Reciprocal link suggestions for older posts |
| `src/wp_seo_enhance/modules/auditor.py` | SEO scoring + thin content flagging |
| `src/wp_seo_enhance/modules/media.py` | Image alt text audit + update |
| `src/wp_seo_enhance/modules/yoast.py` | Yoast SEO meta read/write |
| `src/wp_seo_enhance/cli.py` | One-time init from Bright Tale Supabase |
| `tests/test_config.py` | Config loading tests |
| `tests/test_wp_client.py` | WP client tests (mocked HTTP) |
| `tests/test_post_index.py` | Indexing + relatedness tests |
| `tests/test_diff.py` | Diff generation tests |
| `tests/test_linker.py` | Link suggestion + injection tests |
| `tests/test_backlinker.py` | Backlink suggestion tests |
| `tests/test_auditor.py` | SEO scoring tests |
| `tests/test_media.py` | Alt text audit tests |
| `tests/test_yoast.py` | Yoast meta tests |
| `~/.claude/skills/wp-seo-enhance/SKILL.md` | Global Claude Code skill |

---

## Task 1: Project Scaffold + Config

**Files:**
- Create: `~/tools/wp-seo-enhance/pyproject.toml`
- Create: `~/tools/wp-seo-enhance/config.example.yaml`
- Create: `~/tools/wp-seo-enhance/src/wp_seo_enhance/__init__.py`
- Create: `~/tools/wp-seo-enhance/src/wp_seo_enhance/config.py`
- Create: `~/tools/wp-seo-enhance/tests/test_config.py`

- [ ] **Step 1: Create project directory**

```bash
mkdir -p ~/tools/wp-seo-enhance/src/wp_seo_enhance/modules
mkdir -p ~/tools/wp-seo-enhance/tests
```

- [ ] **Step 2: Write pyproject.toml**

```toml
[project]
name = "wp-seo-enhance"
version = "0.1.0"
description = "MCP server for WordPress SEO auditing and enhancement"
requires-python = ">=3.11"
dependencies = [
    "mcp>=1.0.0",
    "httpx>=0.27.0",
    "pyyaml>=6.0",
    "beautifulsoup4>=4.12.0",
]

[project.optional-dependencies]
init = [
    "supabase>=2.0.0",
    "pycryptodome>=3.20.0",
]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
]

[project.scripts]
wp-seo-enhance = "wp_seo_enhance.server:main"
wp-seo-init = "wp_seo_enhance.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

- [ ] **Step 3: Write config.example.yaml**

```yaml
sites:
  example-site:
    url: "https://example.com"
    username: "admin"
    app_password: "xxxx xxxx xxxx xxxx"
    modules: [linker, backlinker, auditor, media, yoast]
```

- [ ] **Step 4: Write the failing test for config loading**

```python
# tests/test_config.py
import pytest
from pathlib import Path
from wp_seo_enhance.config import load_config, SiteConfig, AppConfig


def test_load_config_from_yaml(tmp_path: Path):
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
sites:
  testsite:
    url: "https://test.example.com"
    username: "admin"
    app_password: "abcd 1234 efgh 5678"
    modules: [linker, auditor]
""")
    config = load_config(config_file)
    assert isinstance(config, AppConfig)
    assert "testsite" in config.sites
    site = config.sites["testsite"]
    assert site.url == "https://test.example.com"
    assert site.username == "admin"
    assert site.app_password == "abcd 1234 efgh 5678"
    assert site.modules == ["linker", "auditor"]


def test_load_config_missing_file(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        load_config(tmp_path / "nonexistent.yaml")


def test_load_config_missing_url(tmp_path: Path):
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
sites:
  bad:
    username: "admin"
    app_password: "xxxx"
    modules: [linker]
""")
    with pytest.raises(ValueError, match="url"):
        load_config(config_file)


def test_load_config_multiple_sites(tmp_path: Path):
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
sites:
  site1:
    url: "https://site1.com"
    username: "admin1"
    app_password: "pass1"
    modules: [linker]
  site2:
    url: "https://site2.com"
    username: "admin2"
    app_password: "pass2"
    modules: [auditor, media]
""")
    config = load_config(config_file)
    assert len(config.sites) == 2
    assert config.sites["site1"].url == "https://site1.com"
    assert config.sites["site2"].modules == ["auditor", "media"]


def test_load_config_default_modules(tmp_path: Path):
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
sites:
  minimal:
    url: "https://minimal.com"
    username: "admin"
    app_password: "pass"
""")
    config = load_config(config_file)
    site = config.sites["minimal"]
    assert site.modules == ["linker", "backlinker", "auditor", "media", "yoast"]
```

- [ ] **Step 5: Run test to verify it fails**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_config.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'wp_seo_enhance'`

- [ ] **Step 6: Write __init__.py**

```python
# src/wp_seo_enhance/__init__.py
```

- [ ] **Step 7: Write config.py**

```python
# src/wp_seo_enhance/config.py
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ALL_MODULES = ["linker", "backlinker", "auditor", "media", "yoast"]
DEFAULT_CONFIG_PATH = Path.home() / ".config" / "wp-seo-enhance" / "config.yaml"


@dataclass
class SiteConfig:
    url: str
    username: str
    app_password: str
    modules: list[str] = field(default_factory=lambda: list(ALL_MODULES))


@dataclass
class AppConfig:
    sites: dict[str, SiteConfig]


def load_config(path: Path = DEFAULT_CONFIG_PATH) -> AppConfig:
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    with open(path) as f:
        raw = yaml.safe_load(f)

    if not raw or "sites" not in raw:
        raise ValueError("Config must contain 'sites' key")

    sites: dict[str, SiteConfig] = {}
    for name, site_raw in raw["sites"].items():
        if not isinstance(site_raw, dict):
            raise ValueError(f"Site '{name}' must be a mapping")
        if "url" not in site_raw:
            raise ValueError(f"Site '{name}' missing required field: url")
        if "username" not in site_raw:
            raise ValueError(f"Site '{name}' missing required field: username")
        if "app_password" not in site_raw:
            raise ValueError(f"Site '{name}' missing required field: app_password")

        sites[name] = SiteConfig(
            url=site_raw["url"].rstrip("/"),
            username=site_raw["username"],
            app_password=site_raw["app_password"],
            modules=site_raw.get("modules", list(ALL_MODULES)),
        )

    return AppConfig(sites=sites)
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_config.py -v
```

Expected: All 5 tests PASS

- [ ] **Step 9: Commit**

```bash
cd ~/tools/wp-seo-enhance && git init && git add -A && git commit -m "feat: project scaffold with config loader and tests"
```

---

## Task 2: WordPress REST API Client

**Files:**
- Create: `~/tools/wp-seo-enhance/src/wp_seo_enhance/wp_client.py`
- Create: `~/tools/wp-seo-enhance/tests/test_wp_client.py`

- [ ] **Step 1: Write failing tests for WP client**

```python
# tests/test_wp_client.py
import pytest
import httpx
import pytest_asyncio
from wp_seo_enhance.wp_client import WPClient
from wp_seo_enhance.config import SiteConfig


@pytest.fixture
def site_config():
    return SiteConfig(
        url="https://test.example.com",
        username="admin",
        app_password="abcd 1234 efgh 5678",
        modules=["linker"],
    )


@pytest.fixture
def mock_posts_response():
    return [
        {
            "id": 1,
            "title": {"rendered": "Test Post"},
            "slug": "test-post",
            "content": {"rendered": "<p>Hello world</p>"},
            "excerpt": {"rendered": "<p>Hello</p>"},
            "categories": [3],
            "tags": [5, 7],
            "status": "publish",
            "link": "https://test.example.com/test-post/",
            "yoast_head_json": {
                "title": "Test Post - Site",
                "description": "A test post",
                "og_image": [{"url": "https://test.example.com/image.jpg"}],
            },
        }
    ]


@pytest.mark.asyncio
async def test_client_auth_header(site_config: SiteConfig):
    client = WPClient(site_config)
    assert client._auth_header.startswith("Basic ")
    await client.close()


@pytest.mark.asyncio
async def test_fetch_posts(site_config: SiteConfig, mock_posts_response: list):
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json=mock_posts_response,
            headers={"X-WP-TotalPages": "1"},
        )
    )
    client = WPClient(site_config, transport=transport)
    posts = await client.fetch_all_posts()
    assert len(posts) == 1
    assert posts[0]["id"] == 1
    assert posts[0]["title"]["rendered"] == "Test Post"
    await client.close()


@pytest.mark.asyncio
async def test_fetch_posts_paginated(site_config: SiteConfig):
    page_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal page_count
        page_count += 1
        page = int(request.url.params.get("page", "1"))
        if page == 1:
            return httpx.Response(
                200,
                json=[{"id": 1, "title": {"rendered": "Post 1"}, "slug": "p1",
                       "content": {"rendered": ""}, "excerpt": {"rendered": ""},
                       "categories": [], "tags": [], "status": "publish",
                       "link": "https://test.example.com/p1/", "yoast_head_json": {}}],
                headers={"X-WP-TotalPages": "2"},
            )
        return httpx.Response(
            200,
            json=[{"id": 2, "title": {"rendered": "Post 2"}, "slug": "p2",
                   "content": {"rendered": ""}, "excerpt": {"rendered": ""},
                   "categories": [], "tags": [], "status": "publish",
                   "link": "https://test.example.com/p2/", "yoast_head_json": {}}],
            headers={"X-WP-TotalPages": "2"},
        )

    transport = httpx.MockTransport(handler)
    client = WPClient(site_config, transport=transport)
    posts = await client.fetch_all_posts()
    assert len(posts) == 2
    assert page_count == 2
    await client.close()


@pytest.mark.asyncio
async def test_fetch_single_post(site_config: SiteConfig, mock_posts_response: list):
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=mock_posts_response[0])
    )
    client = WPClient(site_config, transport=transport)
    post = await client.fetch_post(1)
    assert post["id"] == 1
    await client.close()


@pytest.mark.asyncio
async def test_update_post(site_config: SiteConfig):
    updated = {"id": 1, "content": {"rendered": "<p>Updated</p>"}}
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=updated)
    )
    client = WPClient(site_config, transport=transport)
    result = await client.update_post(1, content="<p>Updated</p>")
    assert result["id"] == 1
    await client.close()


@pytest.mark.asyncio
async def test_fetch_post_by_slug(site_config: SiteConfig, mock_posts_response: list):
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=mock_posts_response)
    )
    client = WPClient(site_config, transport=transport)
    post = await client.fetch_post_by_slug("test-post")
    assert post["id"] == 1
    await client.close()


@pytest.mark.asyncio
async def test_update_media_alt_text(site_config: SiteConfig):
    updated = {"id": 10, "alt_text": "New alt text"}
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=updated)
    )
    client = WPClient(site_config, transport=transport)
    result = await client.update_media(10, alt_text="New alt text")
    assert result["alt_text"] == "New alt text"
    await client.close()


@pytest.mark.asyncio
async def test_fetch_categories(site_config: SiteConfig):
    cats = [{"id": 3, "name": "Tech", "slug": "tech"}]
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=cats)
    )
    client = WPClient(site_config, transport=transport)
    result = await client.fetch_categories()
    assert len(result) == 1
    assert result[0]["name"] == "Tech"
    await client.close()


@pytest.mark.asyncio
async def test_fetch_tags(site_config: SiteConfig):
    tags = [{"id": 5, "name": "Python", "slug": "python"}]
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=tags)
    )
    client = WPClient(site_config, transport=transport)
    result = await client.fetch_tags()
    assert len(result) == 1
    assert result[0]["name"] == "Python"
    await client.close()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_wp_client.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'wp_seo_enhance.wp_client'`

- [ ] **Step 3: Write wp_client.py**

```python
# src/wp_seo_enhance/wp_client.py
import base64
from typing import Any

import httpx

from wp_seo_enhance.config import SiteConfig


class WPClient:
    def __init__(
        self,
        site: SiteConfig,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._site = site
        self._base = f"{site.url}/wp-json/wp/v2"
        token = base64.b64encode(
            f"{site.username}:{site.app_password}".encode()
        ).decode()
        self._auth_header = f"Basic {token}"
        kwargs: dict[str, Any] = {
            "headers": {"Authorization": self._auth_header},
            "timeout": 30.0,
        }
        if transport:
            kwargs["transport"] = transport
        self._http = httpx.AsyncClient(**kwargs)

    async def close(self) -> None:
        await self._http.aclose()

    async def fetch_all_posts(self) -> list[dict[str, Any]]:
        posts: list[dict[str, Any]] = []
        page = 1
        while True:
            resp = await self._http.get(
                f"{self._base}/posts",
                params={"per_page": 100, "status": "publish", "page": page},
            )
            resp.raise_for_status()
            posts.extend(resp.json())
            total_pages = int(resp.headers.get("X-WP-TotalPages", "1"))
            if page >= total_pages:
                break
            page += 1
        return posts

    async def fetch_post(self, post_id: int) -> dict[str, Any]:
        resp = await self._http.get(f"{self._base}/posts/{post_id}")
        resp.raise_for_status()
        return resp.json()

    async def fetch_post_by_slug(self, slug: str) -> dict[str, Any]:
        resp = await self._http.get(
            f"{self._base}/posts", params={"slug": slug}
        )
        resp.raise_for_status()
        results = resp.json()
        if not results:
            raise ValueError(f"No post found with slug: {slug}")
        return results[0]

    async def update_post(self, post_id: int, **fields: Any) -> dict[str, Any]:
        resp = await self._http.post(
            f"{self._base}/posts/{post_id}", json=fields
        )
        resp.raise_for_status()
        return resp.json()

    async def fetch_media(self, media_id: int) -> dict[str, Any]:
        resp = await self._http.get(f"{self._base}/media/{media_id}")
        resp.raise_for_status()
        return resp.json()

    async def update_media(self, media_id: int, **fields: Any) -> dict[str, Any]:
        resp = await self._http.post(
            f"{self._base}/media/{media_id}", json=fields
        )
        resp.raise_for_status()
        return resp.json()

    async def fetch_categories(self) -> list[dict[str, Any]]:
        resp = await self._http.get(
            f"{self._base}/categories", params={"per_page": 100}
        )
        resp.raise_for_status()
        return resp.json()

    async def fetch_tags(self) -> list[dict[str, Any]]:
        resp = await self._http.get(
            f"{self._base}/tags", params={"per_page": 100}
        )
        resp.raise_for_status()
        return resp.json()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_wp_client.py -v
```

Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/tools/wp-seo-enhance && git add -A && git commit -m "feat: async WordPress REST API client with tests"
```

---

## Task 3: Post Index + Relatedness Scoring

**Files:**
- Create: `~/tools/wp-seo-enhance/src/wp_seo_enhance/post_index.py`
- Create: `~/tools/wp-seo-enhance/tests/test_post_index.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_post_index.py
import pytest
import time
from wp_seo_enhance.post_index import PostIndex, IndexedPost, compute_relatedness


def make_post(
    post_id: int,
    title: str = "Post",
    slug: str = "post",
    content: str = "<p>content</p>",
    categories: list[int] | None = None,
    tags: list[int] | None = None,
    focus_keyword: str = "",
    link: str = "",
) -> dict:
    return {
        "id": post_id,
        "title": {"rendered": title},
        "slug": slug,
        "content": {"rendered": content},
        "excerpt": {"rendered": ""},
        "categories": categories or [],
        "tags": tags or [],
        "status": "publish",
        "link": link or f"https://example.com/{slug}/",
        "yoast_head_json": {
            "title": title,
            "description": "",
            "schema": {"@graph": [{"@type": "Article", "keywords": focus_keyword}]},
        },
    }


def test_index_post_extracts_fields():
    raw = make_post(1, title="Efficiency Debt", slug="efficiency-debt",
                    content="<h2>Toggle Tax</h2><p>Context switching costs.</p>",
                    categories=[3], tags=[5, 7], focus_keyword="efficiency debt")
    indexed = IndexedPost.from_wp_post(raw)
    assert indexed.post_id == 1
    assert indexed.title == "Efficiency Debt"
    assert indexed.slug == "efficiency-debt"
    assert indexed.categories == [3]
    assert indexed.tags == [5, 7]
    assert indexed.focus_keyword == "efficiency debt"
    assert "toggle tax" in indexed.h2_headings
    assert "switching" in indexed.keyword_bag


def test_index_post_keyword_bag_excludes_stopwords():
    raw = make_post(1, content="<p>The quick brown fox is a very good animal.</p>")
    indexed = IndexedPost.from_wp_post(raw)
    assert "the" not in indexed.keyword_bag
    assert "is" not in indexed.keyword_bag
    assert "a" not in indexed.keyword_bag
    assert "fox" in indexed.keyword_bag


def test_compute_relatedness_tag_overlap():
    a = IndexedPost(post_id=1, title="A", slug="a", url="", content_text="",
                    categories=[1], tags=[5, 7], focus_keyword="",
                    h2_headings=[], keyword_bag=set())
    b = IndexedPost(post_id=2, title="B", slug="b", url="", content_text="",
                    categories=[2], tags=[5, 9], focus_keyword="",
                    h2_headings=[], keyword_bag=set())
    score = compute_relatedness(a, b)
    assert score > 0  # 1 shared tag * weight 3


def test_compute_relatedness_category_overlap():
    a = IndexedPost(post_id=1, title="A", slug="a", url="", content_text="",
                    categories=[3], tags=[], focus_keyword="",
                    h2_headings=[], keyword_bag=set())
    b = IndexedPost(post_id=2, title="B", slug="b", url="", content_text="",
                    categories=[3], tags=[], focus_keyword="",
                    h2_headings=[], keyword_bag=set())
    score = compute_relatedness(a, b)
    assert score == 2  # 1 shared category * weight 2


def test_compute_relatedness_focus_keyword_match():
    a = IndexedPost(post_id=1, title="A", slug="a", url="", content_text="efficiency debt is real",
                    categories=[], tags=[], focus_keyword="efficiency debt",
                    h2_headings=[], keyword_bag=set())
    b = IndexedPost(post_id=2, title="B", slug="b", url="",
                    content_text="avoid efficiency debt in your workflow",
                    categories=[], tags=[], focus_keyword="workflow",
                    h2_headings=[], keyword_bag=set())
    score = compute_relatedness(a, b)
    assert score >= 4  # a's focus keyword found in b's content


def test_compute_relatedness_keyword_bag_overlap():
    a = IndexedPost(post_id=1, title="A", slug="a", url="", content_text="",
                    categories=[], tags=[], focus_keyword="",
                    h2_headings=[], keyword_bag={"python", "async", "httpx"})
    b = IndexedPost(post_id=2, title="B", slug="b", url="", content_text="",
                    categories=[], tags=[], focus_keyword="",
                    h2_headings=[], keyword_bag={"python", "flask", "httpx"})
    score = compute_relatedness(a, b)
    assert score == 2  # 2 shared keywords * weight 1


def test_post_index_find_related():
    posts = [
        make_post(1, title="Efficiency Debt", categories=[3], tags=[5, 7],
                  focus_keyword="efficiency debt",
                  content="<p>Tool hoarding erases billable hours.</p>"),
        make_post(2, title="PM Software Distraction", categories=[3], tags=[5],
                  focus_keyword="project management",
                  content="<p>Efficiency debt from too many PM tools.</p>"),
        make_post(3, title="FIRE Calculator", categories=[10], tags=[20],
                  focus_keyword="fire calculator",
                  content="<p>Calculate your financial independence.</p>"),
    ]
    index = PostIndex()
    index.build_from_posts(posts)
    related = index.find_related(1, limit=5)
    assert len(related) >= 1
    assert related[0][0] == 2  # post 2 should be most related to post 1


def test_post_index_cache_ttl():
    index = PostIndex(cache_ttl_seconds=0.1)
    posts = [make_post(1)]
    index.build_from_posts(posts)
    assert not index.is_stale()
    time.sleep(0.15)
    assert index.is_stale()


def test_post_index_invalidate():
    index = PostIndex()
    index.build_from_posts([make_post(1)])
    assert not index.is_stale()
    index.invalidate()
    assert index.is_stale()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_post_index.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write post_index.py**

```python
# src/wp_seo_enhance/post_index.py
import re
import time
from dataclasses import dataclass, field
from typing import Any

from bs4 import BeautifulSoup

STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "this", "that", "these",
    "those", "it", "its", "you", "your", "we", "our", "they", "their",
    "he", "she", "his", "her", "my", "me", "us", "them", "i", "not", "no",
    "so", "if", "as", "from", "about", "into", "more", "very", "just",
    "also", "than", "then", "when", "how", "what", "which", "who", "whom",
})

WORD_RE = re.compile(r"[a-z]{3,}")


@dataclass
class IndexedPost:
    post_id: int
    title: str
    slug: str
    url: str
    content_text: str
    categories: list[int]
    tags: list[int]
    focus_keyword: str
    h2_headings: list[str]
    keyword_bag: set[str]

    @classmethod
    def from_wp_post(cls, raw: dict[str, Any]) -> "IndexedPost":
        soup = BeautifulSoup(raw["content"]["rendered"], "html.parser")
        text = soup.get_text(separator=" ").lower()
        h2s = [h2.get_text().lower().strip() for h2 in soup.find_all("h2")]

        words = WORD_RE.findall(text)
        keyword_bag = {w for w in words if w not in STOPWORDS}

        focus_kw = ""
        yoast = raw.get("yoast_head_json") or {}
        schema = yoast.get("schema") or {}
        graph = schema.get("@graph") or []
        for node in graph:
            if node.get("@type") == "Article":
                kw = node.get("keywords", "")
                if isinstance(kw, str):
                    focus_kw = kw.lower().strip()
                break

        return cls(
            post_id=raw["id"],
            title=raw["title"]["rendered"],
            slug=raw["slug"],
            url=raw.get("link", ""),
            content_text=text,
            categories=raw.get("categories", []),
            tags=raw.get("tags", []),
            focus_keyword=focus_kw,
            h2_headings=h2s,
            keyword_bag=keyword_bag,
        )


def compute_relatedness(a: IndexedPost, b: IndexedPost) -> float:
    score = 0.0
    # Focus keyword match (weight 4): a's focus kw in b's content or vice versa
    if a.focus_keyword and a.focus_keyword in b.content_text:
        score += 4
    if b.focus_keyword and b.focus_keyword in a.content_text:
        score += 4
    # Tag overlap (weight 3)
    shared_tags = set(a.tags) & set(b.tags)
    score += len(shared_tags) * 3
    # Category overlap (weight 2)
    shared_cats = set(a.categories) & set(b.categories)
    score += len(shared_cats) * 2
    # Keyword bag overlap (weight 1)
    shared_kw = a.keyword_bag & b.keyword_bag
    score += len(shared_kw) * 1
    return score


class PostIndex:
    def __init__(self, cache_ttl_seconds: float = 600.0):
        self._posts: dict[int, IndexedPost] = {}
        self._built_at: float = 0.0
        self._ttl = cache_ttl_seconds

    def build_from_posts(self, raw_posts: list[dict[str, Any]]) -> None:
        self._posts = {}
        for raw in raw_posts:
            indexed = IndexedPost.from_wp_post(raw)
            self._posts[indexed.post_id] = indexed
        self._built_at = time.monotonic()

    def is_stale(self) -> bool:
        if self._built_at == 0.0:
            return True
        return (time.monotonic() - self._built_at) > self._ttl

    def invalidate(self) -> None:
        self._built_at = 0.0

    def get(self, post_id: int) -> IndexedPost | None:
        return self._posts.get(post_id)

    def all_posts(self) -> list[IndexedPost]:
        return list(self._posts.values())

    def find_related(
        self, post_id: int, limit: int = 10
    ) -> list[tuple[int, float]]:
        target = self._posts.get(post_id)
        if not target:
            return []
        scored = []
        for pid, post in self._posts.items():
            if pid == post_id:
                continue
            score = compute_relatedness(target, post)
            if score > 0:
                scored.append((pid, score))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:limit]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_post_index.py -v
```

Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/tools/wp-seo-enhance && git add -A && git commit -m "feat: post index with relatedness scoring and tests"
```

---

## Task 4: HTML Diff Preview Generator

**Files:**
- Create: `~/tools/wp-seo-enhance/src/wp_seo_enhance/diff.py`
- Create: `~/tools/wp-seo-enhance/tests/test_diff.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_diff.py
import pytest
from wp_seo_enhance.diff import generate_diff, Change


def test_diff_add_link():
    original = "<p>Context switching costs are real and measurable.</p>"
    changes = [
        Change(
            type="add_link",
            anchor_text="Context switching",
            href="https://example.com/context-switching/",
            position=3,  # char offset of "Context" inside <p>
        )
    ]
    result = generate_diff(original, changes)
    assert "Context switching" in result.proposed
    assert 'href="https://example.com/context-switching/"' in result.proposed
    assert result.original == original
    assert len(result.change_descriptions) == 1


def test_diff_multiple_links():
    original = "<p>Tool hoarding leads to efficiency debt and context switching.</p>"
    changes = [
        Change(type="add_link", anchor_text="efficiency debt",
               href="https://example.com/efficiency/", position=28),
        Change(type="add_link", anchor_text="context switching",
               href="https://example.com/switching/", position=48),
    ]
    result = generate_diff(original, changes)
    assert result.proposed.count("<a ") == 2


def test_diff_skip_link_inside_existing_anchor():
    original = '<p>Read about <a href="/old">context switching</a> here.</p>'
    changes = [
        Change(type="add_link", anchor_text="context switching",
               href="https://example.com/new/", position=17),
    ]
    result = generate_diff(original, changes)
    assert result.proposed.count("<a ") == 1  # only the original link
    assert len(result.skipped) == 1


def test_diff_skip_link_inside_heading():
    original = "<h2>Context Switching Tax</h2><p>It costs 23 minutes.</p>"
    changes = [
        Change(type="add_link", anchor_text="Context Switching",
               href="https://example.com/cs/", position=4),
    ]
    result = generate_diff(original, changes)
    assert "<h2>" in result.proposed
    assert result.proposed.count("<a ") == 0
    assert len(result.skipped) == 1


def test_diff_readable_summary():
    original = "<p>Some text about productivity tools and workflow.</p>"
    changes = [
        Change(type="add_link", anchor_text="productivity tools",
               href="https://example.com/tools/", position=16),
    ]
    result = generate_diff(original, changes)
    assert "productivity tools" in result.change_descriptions[0]
    assert "https://example.com/tools/" in result.change_descriptions[0]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_diff.py -v
```

Expected: FAIL

- [ ] **Step 3: Write diff.py**

```python
# src/wp_seo_enhance/diff.py
import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, NavigableString

FORBIDDEN_PARENTS = {"a", "h1", "h2", "h3", "blockquote", "figcaption"}


@dataclass
class Change:
    type: str
    anchor_text: str = ""
    href: str = ""
    position: int = 0
    media_id: int = 0
    alt_text: str = ""
    meta_field: str = ""
    meta_value: str = ""


@dataclass
class DiffResult:
    original: str
    proposed: str
    change_descriptions: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


def _is_inside_forbidden(element: NavigableString) -> bool:
    for parent in element.parents:
        if parent.name in FORBIDDEN_PARENTS:
            return True
    return False


def generate_diff(html: str, changes: list[Change]) -> DiffResult:
    soup = BeautifulSoup(html, "html.parser")
    descriptions: list[str] = []
    skipped: list[str] = []

    link_changes = sorted(
        [c for c in changes if c.type == "add_link"],
        key=lambda c: c.position,
        reverse=True,
    )

    for change in link_changes:
        target_text = change.anchor_text
        found = False

        for text_node in soup.find_all(string=re.compile(re.escape(target_text), re.IGNORECASE)):
            if not isinstance(text_node, NavigableString):
                continue
            if _is_inside_forbidden(text_node):
                skipped.append(
                    f"Skipped '{target_text}' → inside {text_node.parent.name} tag"
                )
                found = True
                break

            match = re.search(re.escape(target_text), str(text_node), re.IGNORECASE)
            if not match:
                continue

            before = str(text_node)[: match.start()]
            matched = str(text_node)[match.start(): match.end()]
            after = str(text_node)[match.end():]

            new_tag = soup.new_tag("a", href=change.href)
            new_tag.string = matched

            text_node.replace_with(NavigableString(before))
            text_node.next_element.insert_after(NavigableString(after))
            text_node.next_element.insert_after(new_tag)

            descriptions.append(
                f"Link '{matched}' → {change.href}"
            )
            found = True
            break

        if not found:
            skipped.append(f"No match for '{target_text}' in content")

    return DiffResult(
        original=html,
        proposed=str(soup),
        change_descriptions=descriptions,
        skipped=skipped,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_diff.py -v
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/tools/wp-seo-enhance && git add -A && git commit -m "feat: HTML diff preview generator with safety rules"
```

---

## Task 5: Linker Module

**Files:**
- Create: `~/tools/wp-seo-enhance/src/wp_seo_enhance/modules/__init__.py`
- Create: `~/tools/wp-seo-enhance/src/wp_seo_enhance/modules/linker.py`
- Create: `~/tools/wp-seo-enhance/tests/test_linker.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_linker.py
import pytest
from wp_seo_enhance.modules.linker import suggest_links, LinkSuggestion
from wp_seo_enhance.post_index import PostIndex, IndexedPost


def _make_indexed(post_id: int, title: str, slug: str, url: str,
                  content_text: str, focus_keyword: str = "",
                  tags: list[int] | None = None,
                  categories: list[int] | None = None) -> IndexedPost:
    return IndexedPost(
        post_id=post_id, title=title, slug=slug, url=url,
        content_text=content_text, categories=categories or [],
        tags=tags or [], focus_keyword=focus_keyword,
        h2_headings=[], keyword_bag=set(),
    )


@pytest.fixture
def index() -> PostIndex:
    idx = PostIndex()
    idx._posts = {
        1: _make_indexed(
            1, "Efficiency Debt", "efficiency-debt",
            "https://example.com/efficiency-debt/",
            "tool hoarding erases billable hours through context switching",
            focus_keyword="efficiency debt", tags=[5, 7], categories=[3],
        ),
        2: _make_indexed(
            2, "PM Software Distraction", "pm-distraction",
            "https://example.com/pm-distraction/",
            "project management tools create efficiency debt and overhead",
            focus_keyword="project management", tags=[5], categories=[3],
        ),
        3: _make_indexed(
            3, "Micro Habits Productivity", "micro-habits",
            "https://example.com/micro-habits/",
            "simple habits beat complex tool stacks for productivity",
            focus_keyword="micro habits", tags=[7], categories=[3],
        ),
    }
    idx._built_at = 1.0
    return idx


def test_suggest_links_returns_suggestions(index: PostIndex):
    html = "<p>Project management tools create efficiency debt and overhead.</p>"
    suggestions = suggest_links(index, post_id=2, html=html, max_links=5)
    assert len(suggestions) >= 1
    assert all(isinstance(s, LinkSuggestion) for s in suggestions)


def test_suggest_links_respects_max(index: PostIndex):
    html = "<p>Efficiency debt and micro habits and project management.</p>"
    suggestions = suggest_links(index, post_id=1, html=html, max_links=1)
    assert len(suggestions) <= 1


def test_suggest_links_no_self_link(index: PostIndex):
    html = "<p>Efficiency debt is a real problem.</p>"
    suggestions = suggest_links(index, post_id=1, html=html, max_links=5)
    for s in suggestions:
        assert s.target_post_id != 1


def test_suggest_links_uses_focus_keyword_as_anchor(index: PostIndex):
    html = "<p>Tool hoarding creates efficiency debt in your workflow.</p>"
    suggestions = suggest_links(index, post_id=2, html=html, max_links=5)
    anchors = [s.anchor_text.lower() for s in suggestions]
    assert any("efficiency debt" in a for a in anchors)


def test_suggest_links_skips_already_linked(index: PostIndex):
    html = '<p>Learn about <a href="https://example.com/efficiency-debt/">efficiency debt</a> here.</p>'
    suggestions = suggest_links(index, post_id=2, html=html, max_links=5)
    for s in suggestions:
        assert s.href != "https://example.com/efficiency-debt/"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_linker.py -v
```

Expected: FAIL

- [ ] **Step 3: Write modules/__init__.py and linker.py**

```python
# src/wp_seo_enhance/modules/__init__.py
```

```python
# src/wp_seo_enhance/modules/linker.py
import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

from wp_seo_enhance.post_index import PostIndex, IndexedPost


@dataclass
class LinkSuggestion:
    target_post_id: int
    target_url: str
    anchor_text: str
    href: str
    position: int


def _extract_existing_hrefs(html: str) -> set[str]:
    soup = BeautifulSoup(html, "html.parser")
    return {a["href"] for a in soup.find_all("a", href=True)}


def _find_anchor_match(
    html_text: str, phrases: list[str]
) -> tuple[str, int] | None:
    for phrase in phrases:
        match = re.search(re.escape(phrase), html_text, re.IGNORECASE)
        if match:
            body_len = len(html_text)
            if body_len > 0 and match.start() / body_len <= 0.6:
                return phrase, match.start()
    for phrase in phrases:
        match = re.search(re.escape(phrase), html_text, re.IGNORECASE)
        if match:
            return phrase, match.start()
    return None


def _candidate_phrases(post: IndexedPost) -> list[str]:
    phrases: list[str] = []
    if post.focus_keyword:
        phrases.append(post.focus_keyword)
    title_words = post.title.lower().split()
    if len(title_words) >= 3:
        phrases.append(post.title.lower())
        phrases.append(" ".join(title_words[:3]))
    return phrases


def suggest_links(
    index: PostIndex,
    post_id: int,
    html: str,
    max_links: int = 5,
) -> list[LinkSuggestion]:
    existing_hrefs = _extract_existing_hrefs(html)
    soup = BeautifulSoup(html, "html.parser")
    plain_text = soup.get_text(separator=" ").lower()

    related = index.find_related(post_id, limit=max_links * 2)
    suggestions: list[LinkSuggestion] = []

    for rel_id, _score in related:
        if len(suggestions) >= max_links:
            break
        rel_post = index.get(rel_id)
        if not rel_post:
            continue
        if rel_post.url in existing_hrefs:
            continue

        phrases = _candidate_phrases(rel_post)
        match = _find_anchor_match(plain_text, phrases)
        if not match:
            continue

        anchor_text, position = match
        suggestions.append(LinkSuggestion(
            target_post_id=rel_id,
            target_url=rel_post.url,
            anchor_text=anchor_text,
            href=rel_post.url,
            position=position,
        ))

    return suggestions
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_linker.py -v
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/tools/wp-seo-enhance && git add -A && git commit -m "feat: linker module with link suggestion engine"
```

---

## Task 6: Backlinker Module

**Files:**
- Create: `~/tools/wp-seo-enhance/src/wp_seo_enhance/modules/backlinker.py`
- Create: `~/tools/wp-seo-enhance/tests/test_backlinker.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_backlinker.py
import pytest
from wp_seo_enhance.modules.backlinker import suggest_backlinks, BacklinkSuggestion
from wp_seo_enhance.post_index import PostIndex, IndexedPost


def _make_indexed(post_id: int, title: str, slug: str, url: str,
                  content_text: str, focus_keyword: str = "",
                  tags: list[int] | None = None,
                  categories: list[int] | None = None) -> IndexedPost:
    return IndexedPost(
        post_id=post_id, title=title, slug=slug, url=url,
        content_text=content_text, categories=categories or [],
        tags=tags or [], focus_keyword=focus_keyword,
        h2_headings=[], keyword_bag=set(),
    )


@pytest.fixture
def index() -> PostIndex:
    idx = PostIndex()
    idx._posts = {
        1: _make_indexed(
            1, "Efficiency Debt", "efficiency-debt",
            "https://example.com/efficiency-debt/",
            "tool hoarding erases billable hours",
            focus_keyword="efficiency debt", tags=[5], categories=[3],
        ),
        2: _make_indexed(
            2, "PM Distraction", "pm-distraction",
            "https://example.com/pm-distraction/",
            "tools create overhead and efficiency debt for teams",
            focus_keyword="project management", tags=[5], categories=[3],
        ),
        3: _make_indexed(
            3, "Micro Habits", "micro-habits",
            "https://example.com/micro-habits/",
            "simple habits beat complex tool stacks",
            focus_keyword="micro habits", tags=[7], categories=[8],
        ),
    }
    idx._built_at = 1.0
    return idx


def test_suggest_backlinks_finds_candidates(index: PostIndex):
    suggestions = suggest_backlinks(index, new_post_id=1, max_posts=3)
    assert len(suggestions) >= 1
    assert all(isinstance(s, BacklinkSuggestion) for s in suggestions)


def test_suggest_backlinks_respects_max(index: PostIndex):
    suggestions = suggest_backlinks(index, new_post_id=1, max_posts=1)
    assert len(suggestions) <= 1


def test_suggest_backlinks_no_self(index: PostIndex):
    suggestions = suggest_backlinks(index, new_post_id=1, max_posts=5)
    for s in suggestions:
        assert s.source_post_id != 1


def test_suggest_backlinks_provides_anchor(index: PostIndex):
    suggestions = suggest_backlinks(index, new_post_id=1, max_posts=5)
    for s in suggestions:
        assert len(s.anchor_text) > 0
        assert len(s.new_post_url) > 0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_backlinker.py -v
```

Expected: FAIL

- [ ] **Step 3: Write backlinker.py**

```python
# src/wp_seo_enhance/modules/backlinker.py
import re
from dataclasses import dataclass

from wp_seo_enhance.post_index import PostIndex, IndexedPost


@dataclass
class BacklinkSuggestion:
    source_post_id: int
    source_url: str
    new_post_url: str
    anchor_text: str
    position: int


def suggest_backlinks(
    index: PostIndex,
    new_post_id: int,
    max_posts: int = 3,
) -> list[BacklinkSuggestion]:
    new_post = index.get(new_post_id)
    if not new_post:
        return []

    phrases: list[str] = []
    if new_post.focus_keyword:
        phrases.append(new_post.focus_keyword)
    title_lower = new_post.title.lower()
    words = title_lower.split()
    if len(words) >= 3:
        phrases.append(title_lower)
        phrases.append(" ".join(words[:3]))

    if not phrases:
        return []

    related = index.find_related(new_post_id, limit=max_posts * 2)
    suggestions: list[BacklinkSuggestion] = []

    for rel_id, _score in related:
        if len(suggestions) >= max_posts:
            break
        rel_post = index.get(rel_id)
        if not rel_post:
            continue

        for phrase in phrases:
            match = re.search(re.escape(phrase), rel_post.content_text, re.IGNORECASE)
            if match:
                suggestions.append(BacklinkSuggestion(
                    source_post_id=rel_id,
                    source_url=rel_post.url,
                    new_post_url=new_post.url,
                    anchor_text=phrase,
                    position=match.start(),
                ))
                break

    return suggestions
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_backlinker.py -v
```

Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/tools/wp-seo-enhance && git add -A && git commit -m "feat: backlinker module for reciprocal link suggestions"
```

---

## Task 7: Auditor Module

**Files:**
- Create: `~/tools/wp-seo-enhance/src/wp_seo_enhance/modules/auditor.py`
- Create: `~/tools/wp-seo-enhance/tests/test_auditor.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_auditor.py
import pytest
from wp_seo_enhance.modules.auditor import audit_post, AuditResult, audit_site_thin_content
from wp_seo_enhance.post_index import PostIndex, IndexedPost


def _make_wp_post(post_id: int, content: str, title: str = "Test Post",
                  images_with_alt: list[tuple[str, str]] | None = None,
                  focus_keyword: str = "", meta_desc: str = "",
                  internal_links: int = 0, external_links: int = 0) -> dict:
    img_html = ""
    if images_with_alt:
        for src, alt in images_with_alt:
            img_html += f'<img src="{src}" alt="{alt}" />'

    link_html = ""
    for i in range(internal_links):
        link_html += f' <a href="https://example.com/post-{i}/">link {i}</a>'
    for i in range(external_links):
        link_html += f' <a href="https://other.com/page-{i}/">ext {i}</a>'

    full_content = f"{content}{img_html}{link_html}"
    return {
        "id": post_id,
        "title": {"rendered": title},
        "slug": "test-post",
        "content": {"rendered": full_content},
        "excerpt": {"rendered": ""},
        "categories": [],
        "tags": [],
        "status": "publish",
        "link": "https://example.com/test-post/",
        "yoast_head_json": {
            "title": title,
            "description": meta_desc,
            "schema": {"@graph": [{"@type": "Article", "keywords": focus_keyword}]},
        },
    }


def test_audit_scores_word_count():
    short = _make_wp_post(1, content="<p>Short post.</p>")
    result = audit_post(short, site_url="https://example.com")
    assert result.word_count < 1000
    assert result.issues["thin_content"] is True

    long_content = "<p>" + " ".join(["word"] * 1200) + "</p>"
    long_post = _make_wp_post(2, content=long_content)
    result2 = audit_post(long_post, site_url="https://example.com")
    assert result2.word_count >= 1000
    assert result2.issues["thin_content"] is False


def test_audit_flags_missing_alt_text():
    post = _make_wp_post(1, content="<p>Text</p>",
                         images_with_alt=[("img.jpg", ""), ("img2.jpg", "good alt")])
    result = audit_post(post, site_url="https://example.com")
    assert result.issues["images_missing_alt"] == 1


def test_audit_flags_no_internal_links():
    post = _make_wp_post(1, content="<p>No links here.</p>")
    result = audit_post(post, site_url="https://example.com")
    assert result.issues["internal_links"] == 0


def test_audit_counts_internal_vs_external():
    post = _make_wp_post(1, content="<p>Text</p>",
                         internal_links=3, external_links=2)
    result = audit_post(post, site_url="https://example.com")
    assert result.issues["internal_links"] == 3
    assert result.issues["external_links"] == 2


def test_audit_flags_missing_meta():
    post = _make_wp_post(1, content="<p>Text</p>", focus_keyword="", meta_desc="")
    result = audit_post(post, site_url="https://example.com")
    assert result.issues["missing_focus_keyword"] is True
    assert result.issues["missing_meta_description"] is True


def test_audit_calculates_score():
    good = _make_wp_post(
        1, content="<p>" + " ".join(["word"] * 1200) + "</p>",
        images_with_alt=[("img.jpg", "Good alt text")],
        focus_keyword="testing", meta_desc="A good description here",
        internal_links=4, external_links=2,
    )
    result = audit_post(good, site_url="https://example.com")
    assert result.score > 50

    bad = _make_wp_post(2, content="<p>Short.</p>")
    result2 = audit_post(bad, site_url="https://example.com")
    assert result2.score < result.score


def test_audit_site_thin_content():
    index = PostIndex()
    index._posts = {
        1: IndexedPost(post_id=1, title="Short", slug="short",
                       url="https://example.com/short/",
                       content_text=" ".join(["word"] * 500),
                       categories=[], tags=[], focus_keyword="",
                       h2_headings=[], keyword_bag=set()),
        2: IndexedPost(post_id=2, title="Long", slug="long",
                       url="https://example.com/long/",
                       content_text=" ".join(["word"] * 1500),
                       categories=[], tags=[], focus_keyword="",
                       h2_headings=[], keyword_bag=set()),
    }
    index._built_at = 1.0
    thin = audit_site_thin_content(index, min_words=1000)
    assert len(thin) == 1
    assert thin[0]["post_id"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_auditor.py -v
```

Expected: FAIL

- [ ] **Step 3: Write auditor.py**

```python
# src/wp_seo_enhance/modules/auditor.py
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from wp_seo_enhance.post_index import PostIndex


@dataclass
class AuditResult:
    post_id: int
    title: str
    url: str
    word_count: int
    score: int
    issues: dict[str, Any] = field(default_factory=dict)


def audit_post(wp_post: dict[str, Any], site_url: str) -> AuditResult:
    soup = BeautifulSoup(wp_post["content"]["rendered"], "html.parser")
    text = soup.get_text(separator=" ")
    words = [w for w in text.split() if len(w) > 0]
    word_count = len(words)

    images = soup.find_all("img")
    images_missing_alt = sum(1 for img in images if not img.get("alt", "").strip())

    site_domain = urlparse(site_url).netloc
    links = soup.find_all("a", href=True)
    internal = 0
    external = 0
    for link in links:
        href = link["href"]
        parsed = urlparse(href)
        if parsed.netloc == "" or parsed.netloc == site_domain:
            internal += 1
        else:
            external += 1

    yoast = wp_post.get("yoast_head_json") or {}
    meta_desc = yoast.get("description", "")
    focus_kw = ""
    schema = yoast.get("schema") or {}
    for node in (schema.get("@graph") or []):
        if node.get("@type") == "Article":
            kw = node.get("keywords", "")
            if isinstance(kw, str):
                focus_kw = kw.strip()
            break

    issues = {
        "thin_content": word_count < 1000,
        "word_count_target": 1200,
        "images_total": len(images),
        "images_missing_alt": images_missing_alt,
        "internal_links": internal,
        "external_links": external,
        "missing_focus_keyword": focus_kw == "",
        "missing_meta_description": meta_desc.strip() == "",
    }

    score = 0
    # Word count: up to 25 points
    if word_count >= 1200:
        score += 25
    elif word_count >= 1000:
        score += 20
    elif word_count >= 700:
        score += 10
    # Images with alt: up to 15 points
    if len(images) > 0 and images_missing_alt == 0:
        score += 15
    elif len(images) > 0:
        score += max(0, 15 - images_missing_alt * 5)
    else:
        score += 10  # no images is neutral
    # Internal links: up to 20 points
    score += min(internal * 5, 20)
    # External links: up to 10 points
    score += min(external * 5, 10)
    # Focus keyword: 15 points
    if focus_kw:
        score += 15
    # Meta description: 15 points
    if meta_desc.strip():
        score += 15

    return AuditResult(
        post_id=wp_post["id"],
        title=wp_post["title"]["rendered"],
        url=wp_post.get("link", ""),
        word_count=word_count,
        score=min(score, 100),
        issues=issues,
    )


def audit_site_thin_content(
    index: PostIndex, min_words: int = 1000
) -> list[dict[str, Any]]:
    thin: list[dict[str, Any]] = []
    for post in index.all_posts():
        wc = len(post.content_text.split())
        if wc < min_words:
            thin.append({
                "post_id": post.post_id,
                "title": post.title,
                "url": post.url,
                "word_count": wc,
                "target": min_words,
                "gap": min_words - wc,
            })
    thin.sort(key=lambda x: x["word_count"])
    return thin
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_auditor.py -v
```

Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/tools/wp-seo-enhance && git add -A && git commit -m "feat: auditor module with SEO scoring and thin content detection"
```

---

## Task 8: Media Module

**Files:**
- Create: `~/tools/wp-seo-enhance/src/wp_seo_enhance/modules/media.py`
- Create: `~/tools/wp-seo-enhance/tests/test_media.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_media.py
import pytest
from wp_seo_enhance.modules.media import audit_images, ImageAuditItem


def test_audit_images_finds_missing_alt():
    html = '''
    <p>Text</p>
    <img src="https://example.com/img1.jpg" alt="" />
    <img src="https://example.com/img2.jpg" alt="Good description" />
    <img src="https://example.com/img3.jpg" />
    '''
    items = audit_images(html)
    assert len(items) == 3
    missing = [i for i in items if i.needs_improvement]
    assert len(missing) == 2


def test_audit_images_flags_generic_alt():
    html = '<img src="img.jpg" alt="image" /><img src="img2.jpg" alt="photo" />'
    items = audit_images(html)
    assert all(i.needs_improvement for i in items)


def test_audit_images_accepts_good_alt():
    html = '<img src="img.jpg" alt="A professional working at a clean desk with a laptop" />'
    items = audit_images(html)
    assert len(items) == 1
    assert items[0].needs_improvement is False


def test_audit_images_empty_content():
    items = audit_images("<p>No images here.</p>")
    assert items == []


def test_audit_image_item_fields():
    html = '<img src="https://example.com/photo.jpg" alt="Old alt" class="wp-image-42" />'
    items = audit_images(html)
    assert len(items) == 1
    assert items[0].src == "https://example.com/photo.jpg"
    assert items[0].current_alt == "Old alt"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_media.py -v
```

Expected: FAIL

- [ ] **Step 3: Write media.py**

```python
# src/wp_seo_enhance/modules/media.py
import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

GENERIC_ALTS = frozenset({
    "image", "photo", "picture", "screenshot", "img", "pic",
    "banner", "header", "thumbnail", "logo", "icon",
})


@dataclass
class ImageAuditItem:
    src: str
    current_alt: str
    needs_improvement: bool
    wp_image_id: int | None


def _extract_wp_image_id(img_tag) -> int | None:
    classes = img_tag.get("class", [])
    for cls in classes:
        match = re.match(r"wp-image-(\d+)", cls)
        if match:
            return int(match.group(1))
    return None


def audit_images(html: str) -> list[ImageAuditItem]:
    soup = BeautifulSoup(html, "html.parser")
    items: list[ImageAuditItem] = []

    for img in soup.find_all("img"):
        src = img.get("src", "")
        alt = img.get("alt", "").strip()
        wp_id = _extract_wp_image_id(img)

        needs_fix = False
        if not alt:
            needs_fix = True
        elif alt.lower() in GENERIC_ALTS:
            needs_fix = True
        elif len(alt.split()) < 3:
            needs_fix = True

        items.append(ImageAuditItem(
            src=src,
            current_alt=alt,
            needs_improvement=needs_fix,
            wp_image_id=wp_id,
        ))

    return items
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_media.py -v
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/tools/wp-seo-enhance && git add -A && git commit -m "feat: media module for image alt text auditing"
```

---

## Task 9: Yoast Module

**Files:**
- Create: `~/tools/wp-seo-enhance/src/wp_seo_enhance/modules/yoast.py`
- Create: `~/tools/wp-seo-enhance/tests/test_yoast.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_yoast.py
import pytest
from wp_seo_enhance.modules.yoast import extract_yoast_meta, YoastMeta


def _make_wp_post(focus_kw: str = "", meta_desc: str = "",
                  title: str = "Test Post") -> dict:
    return {
        "id": 1,
        "title": {"rendered": title},
        "slug": "test-post",
        "content": {"rendered": "<p>Content</p>"},
        "yoast_head_json": {
            "title": title,
            "description": meta_desc,
            "og_title": title,
            "og_description": meta_desc,
            "schema": {
                "@graph": [
                    {"@type": "Article", "keywords": focus_kw, "wordCount": 500}
                ]
            },
        },
    }


def test_extract_yoast_meta_basic():
    post = _make_wp_post(focus_kw="efficiency debt", meta_desc="A great description")
    meta = extract_yoast_meta(post)
    assert isinstance(meta, YoastMeta)
    assert meta.focus_keyword == "efficiency debt"
    assert meta.meta_description == "A great description"
    assert meta.title == "Test Post"


def test_extract_yoast_meta_missing_fields():
    post = _make_wp_post()
    meta = extract_yoast_meta(post)
    assert meta.focus_keyword == ""
    assert meta.meta_description == ""


def test_extract_yoast_meta_no_yoast():
    post = {"id": 1, "title": {"rendered": "X"}, "content": {"rendered": ""}}
    meta = extract_yoast_meta(post)
    assert meta.focus_keyword == ""
    assert meta.meta_description == ""
    assert meta.title == ""


def test_extract_yoast_meta_issues_flagged():
    post = _make_wp_post(focus_kw="", meta_desc="Short")
    meta = extract_yoast_meta(post)
    assert meta.issues["missing_focus_keyword"] is True
    assert meta.issues["meta_description_too_short"] is True


def test_extract_yoast_meta_good_desc_length():
    desc = "A" * 155
    post = _make_wp_post(focus_kw="testing", meta_desc=desc)
    meta = extract_yoast_meta(post)
    assert meta.issues["missing_focus_keyword"] is False
    assert meta.issues["meta_description_too_short"] is False
    assert meta.issues["meta_description_too_long"] is False
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_yoast.py -v
```

Expected: FAIL

- [ ] **Step 3: Write yoast.py**

```python
# src/wp_seo_enhance/modules/yoast.py
from dataclasses import dataclass, field
from typing import Any


@dataclass
class YoastMeta:
    title: str
    focus_keyword: str
    meta_description: str
    og_title: str
    og_description: str
    word_count: int
    issues: dict[str, bool] = field(default_factory=dict)


def extract_yoast_meta(wp_post: dict[str, Any]) -> YoastMeta:
    yoast = wp_post.get("yoast_head_json") or {}

    title = yoast.get("title", "")
    meta_desc = yoast.get("description", "")
    og_title = yoast.get("og_title", "")
    og_desc = yoast.get("og_description", "")

    focus_kw = ""
    word_count = 0
    schema = yoast.get("schema") or {}
    for node in (schema.get("@graph") or []):
        if node.get("@type") == "Article":
            kw = node.get("keywords", "")
            if isinstance(kw, str):
                focus_kw = kw.strip()
            word_count = node.get("wordCount", 0)
            break

    desc_len = len(meta_desc.strip())
    issues = {
        "missing_focus_keyword": focus_kw == "",
        "meta_description_too_short": 0 < desc_len < 120 or desc_len == 0,
        "meta_description_too_long": desc_len > 160,
        "missing_og_title": og_title.strip() == "",
        "missing_og_description": og_desc.strip() == "",
    }

    return YoastMeta(
        title=title,
        focus_keyword=focus_kw,
        meta_description=meta_desc,
        og_title=og_title,
        og_description=og_desc,
        word_count=word_count,
        issues=issues,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/test_yoast.py -v
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/tools/wp-seo-enhance && git add -A && git commit -m "feat: yoast module for SEO meta extraction and validation"
```

---

## Task 10: MCP Server Entry Point

**Files:**
- Create: `~/tools/wp-seo-enhance/src/wp_seo_enhance/server.py`

This task wires all modules into the MCP server. No unit tests for the server itself — integration tested manually via `uv run wp-seo-enhance`.

- [ ] **Step 1: Write server.py**

```python
# src/wp_seo_enhance/server.py
import asyncio
import json
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from wp_seo_enhance.config import load_config, AppConfig, SiteConfig
from wp_seo_enhance.wp_client import WPClient
from wp_seo_enhance.post_index import PostIndex
from wp_seo_enhance.diff import generate_diff, Change
from wp_seo_enhance.modules.linker import suggest_links
from wp_seo_enhance.modules.backlinker import suggest_backlinks
from wp_seo_enhance.modules.auditor import audit_post, audit_site_thin_content
from wp_seo_enhance.modules.media import audit_images
from wp_seo_enhance.modules.yoast import extract_yoast_meta

app = Server("wp-seo-enhance")

_config: AppConfig | None = None
_clients: dict[str, WPClient] = {}
_indexes: dict[str, PostIndex] = {}


def _get_config() -> AppConfig:
    global _config
    if _config is None:
        _config = load_config()
    return _config


def _get_client(site_name: str) -> WPClient:
    if site_name not in _clients:
        config = _get_config()
        if site_name not in config.sites:
            raise ValueError(f"Unknown site: {site_name}. Available: {list(config.sites.keys())}")
        _clients[site_name] = WPClient(config.sites[site_name])
    return _clients[site_name]


def _get_index(site_name: str) -> PostIndex:
    if site_name not in _indexes:
        _indexes[site_name] = PostIndex()
    return _indexes[site_name]


async def _ensure_index(site_name: str) -> PostIndex:
    index = _get_index(site_name)
    if index.is_stale():
        client = _get_client(site_name)
        posts = await client.fetch_all_posts()
        index.build_from_posts(posts)
    return index


def _json_response(data: Any) -> list[TextContent]:
    return [TextContent(type="text", text=json.dumps(data, indent=2, default=str))]


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(name="wp_list_sites", description="List configured WordPress sites",
             inputSchema={"type": "object", "properties": {}}),
        Tool(name="wp_audit_post", description="Full SEO audit of a single post",
             inputSchema={"type": "object", "properties": {
                 "site": {"type": "string", "description": "Site name from config"},
                 "post_id": {"type": "integer", "description": "WordPress post ID"},
                 "url": {"type": "string", "description": "Post URL (alternative to post_id)"},
             }, "required": ["site"]}),
        Tool(name="wp_audit_site", description="Rank all posts by SEO score (worst first)",
             inputSchema={"type": "object", "properties": {
                 "site": {"type": "string"},
                 "limit": {"type": "integer", "default": 20},
             }, "required": ["site"]}),
        Tool(name="wp_find_related", description="Find related posts for internal linking",
             inputSchema={"type": "object", "properties": {
                 "site": {"type": "string"},
                 "post_id": {"type": "integer"},
             }, "required": ["site", "post_id"]}),
        Tool(name="wp_suggest_links", description="Suggest internal links to add to a post",
             inputSchema={"type": "object", "properties": {
                 "site": {"type": "string"},
                 "post_id": {"type": "integer"},
                 "max_links": {"type": "integer", "default": 5},
             }, "required": ["site", "post_id"]}),
        Tool(name="wp_suggest_backlinks", description="Suggest older posts that should link to this post",
             inputSchema={"type": "object", "properties": {
                 "site": {"type": "string"},
                 "post_id": {"type": "integer"},
                 "max_posts": {"type": "integer", "default": 3},
             }, "required": ["site", "post_id"]}),
        Tool(name="wp_preview_changes", description="Preview HTML diff before applying link changes",
             inputSchema={"type": "object", "properties": {
                 "site": {"type": "string"},
                 "post_id": {"type": "integer"},
                 "changes": {"type": "array", "items": {"type": "object"}},
             }, "required": ["site", "post_id", "changes"]}),
        Tool(name="wp_apply_changes", description="Apply approved link changes to a post",
             inputSchema={"type": "object", "properties": {
                 "site": {"type": "string"},
                 "post_id": {"type": "integer"},
                 "changes": {"type": "array", "items": {"type": "object"}},
             }, "required": ["site", "post_id", "changes"]}),
        Tool(name="wp_audit_images", description="Audit image alt text in a post",
             inputSchema={"type": "object", "properties": {
                 "site": {"type": "string"},
                 "post_id": {"type": "integer"},
             }, "required": ["site", "post_id"]}),
        Tool(name="wp_update_alt_text", description="Update alt text for a media item",
             inputSchema={"type": "object", "properties": {
                 "site": {"type": "string"},
                 "media_id": {"type": "integer"},
                 "alt_text": {"type": "string"},
             }, "required": ["site", "media_id", "alt_text"]}),
        Tool(name="wp_get_yoast_meta", description="Get Yoast SEO metadata for a post",
             inputSchema={"type": "object", "properties": {
                 "site": {"type": "string"},
                 "post_id": {"type": "integer"},
             }, "required": ["site", "post_id"]}),
        Tool(name="wp_update_yoast_meta", description="Update Yoast SEO fields for a post",
             inputSchema={"type": "object", "properties": {
                 "site": {"type": "string"},
                 "post_id": {"type": "integer"},
                 "fields": {"type": "object", "description": "Fields to update: meta_description, focus_keyword"},
             }, "required": ["site", "post_id", "fields"]}),
        Tool(name="wp_flag_thin_content", description="List posts below word count threshold",
             inputSchema={"type": "object", "properties": {
                 "site": {"type": "string"},
                 "min_words": {"type": "integer", "default": 1000},
             }, "required": ["site"]}),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    if name == "wp_list_sites":
        config = _get_config()
        sites = {k: {"url": v.url, "modules": v.modules} for k, v in config.sites.items()}
        return _json_response(sites)

    site_name = arguments.get("site", "")

    if name == "wp_audit_post":
        client = _get_client(site_name)
        config = _get_config()
        if "url" in arguments and arguments["url"]:
            slug = arguments["url"].rstrip("/").split("/")[-1]
            wp_post = await client.fetch_post_by_slug(slug)
        else:
            wp_post = await client.fetch_post(arguments["post_id"])
        result = audit_post(wp_post, site_url=config.sites[site_name].url)
        return _json_response({
            "post_id": result.post_id, "title": result.title,
            "url": result.url, "word_count": result.word_count,
            "score": result.score, "issues": result.issues,
        })

    if name == "wp_audit_site":
        client = _get_client(site_name)
        config = _get_config()
        index = await _ensure_index(site_name)
        all_posts = await client.fetch_all_posts()
        results = []
        for wp_post in all_posts:
            r = audit_post(wp_post, site_url=config.sites[site_name].url)
            results.append({"post_id": r.post_id, "title": r.title,
                            "score": r.score, "word_count": r.word_count})
        results.sort(key=lambda x: x["score"])
        limit = arguments.get("limit", 20)
        return _json_response(results[:limit])

    if name == "wp_find_related":
        index = await _ensure_index(site_name)
        related = index.find_related(arguments["post_id"], limit=10)
        items = []
        for pid, score in related:
            post = index.get(pid)
            if post:
                items.append({"post_id": pid, "title": post.title,
                              "url": post.url, "score": score})
        return _json_response(items)

    if name == "wp_suggest_links":
        index = await _ensure_index(site_name)
        client = _get_client(site_name)
        wp_post = await client.fetch_post(arguments["post_id"])
        html = wp_post["content"]["rendered"]
        suggestions = suggest_links(index, arguments["post_id"], html,
                                    max_links=arguments.get("max_links", 5))
        return _json_response([{
            "target_post_id": s.target_post_id, "target_url": s.target_url,
            "anchor_text": s.anchor_text, "href": s.href, "position": s.position,
        } for s in suggestions])

    if name == "wp_suggest_backlinks":
        index = await _ensure_index(site_name)
        suggestions = suggest_backlinks(index, arguments["post_id"],
                                        max_posts=arguments.get("max_posts", 3))
        return _json_response([{
            "source_post_id": s.source_post_id, "source_url": s.source_url,
            "new_post_url": s.new_post_url, "anchor_text": s.anchor_text,
        } for s in suggestions])

    if name == "wp_preview_changes":
        client = _get_client(site_name)
        wp_post = await client.fetch_post(arguments["post_id"])
        html = wp_post["content"]["rendered"]
        changes = [Change(**c) for c in arguments["changes"]]
        diff = generate_diff(html, changes)
        return _json_response({
            "original_length": len(diff.original),
            "proposed_length": len(diff.proposed),
            "changes_applied": diff.change_descriptions,
            "changes_skipped": diff.skipped,
            "proposed_html": diff.proposed,
        })

    if name == "wp_apply_changes":
        client = _get_client(site_name)
        wp_post = await client.fetch_post(arguments["post_id"])
        html = wp_post["content"]["rendered"]
        changes = [Change(**c) for c in arguments["changes"]]
        diff = generate_diff(html, changes)
        result = await client.update_post(arguments["post_id"], content=diff.proposed)
        _get_index(site_name).invalidate()
        return _json_response({
            "post_id": arguments["post_id"],
            "changes_applied": diff.change_descriptions,
            "changes_skipped": diff.skipped,
            "url": result.get("link", ""),
        })

    if name == "wp_audit_images":
        client = _get_client(site_name)
        wp_post = await client.fetch_post(arguments["post_id"])
        html = wp_post["content"]["rendered"]
        items = audit_images(html)
        return _json_response([{
            "src": i.src, "current_alt": i.current_alt,
            "needs_improvement": i.needs_improvement,
            "wp_image_id": i.wp_image_id,
        } for i in items])

    if name == "wp_update_alt_text":
        client = _get_client(site_name)
        result = await client.update_media(
            arguments["media_id"], alt_text=arguments["alt_text"]
        )
        return _json_response({"media_id": arguments["media_id"],
                                "alt_text": arguments["alt_text"], "status": "updated"})

    if name == "wp_get_yoast_meta":
        client = _get_client(site_name)
        wp_post = await client.fetch_post(arguments["post_id"])
        meta = extract_yoast_meta(wp_post)
        return _json_response({
            "title": meta.title, "focus_keyword": meta.focus_keyword,
            "meta_description": meta.meta_description,
            "og_title": meta.og_title, "og_description": meta.og_description,
            "word_count": meta.word_count, "issues": meta.issues,
        })

    if name == "wp_update_yoast_meta":
        client = _get_client(site_name)
        fields = arguments["fields"]
        meta_fields: dict[str, Any] = {}
        if "meta_description" in fields:
            meta_fields["_yoast_wpseo_metadesc"] = fields["meta_description"]
        if "focus_keyword" in fields:
            meta_fields["_yoast_wpseo_focuskw"] = fields["focus_keyword"]
        if meta_fields:
            await client.update_post(arguments["post_id"], meta=meta_fields)
        return _json_response({"post_id": arguments["post_id"],
                                "updated_fields": list(fields.keys()), "status": "updated"})

    if name == "wp_flag_thin_content":
        index = await _ensure_index(site_name)
        thin = audit_site_thin_content(index, min_words=arguments.get("min_words", 1000))
        return _json_response(thin)

    return _json_response({"error": f"Unknown tool: {name}"})


def main():
    async def run():
        async with stdio_server() as (read_stream, write_stream):
            await app.run(read_stream, write_stream, app.create_initialization_options())
    asyncio.run(run())


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run all tests to verify nothing broke**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/ -v
```

Expected: All tests PASS (config: 5, wp_client: 9, post_index: 9, diff: 5, linker: 5, backlinker: 4, auditor: 7, media: 5, yoast: 5 = 54 total)

- [ ] **Step 3: Smoke test the server starts**

```bash
cd ~/tools/wp-seo-enhance && timeout 3 uv run wp-seo-enhance 2>&1 || true
```

Expected: Server starts and waits for stdio input (timeout kills it after 3s). No crash.

- [ ] **Step 4: Commit**

```bash
cd ~/tools/wp-seo-enhance && git add -A && git commit -m "feat: MCP server entry point wiring all modules"
```

---

## Task 11: CLI Init Command

**Files:**
- Create: `~/tools/wp-seo-enhance/src/wp_seo_enhance/cli.py`

One-time setup tool. Tested manually — requires real Supabase credentials.

- [ ] **Step 1: Write cli.py**

```python
# src/wp_seo_enhance/cli.py
import argparse
import base64
import os
import sys
from pathlib import Path

import yaml

CONFIG_DIR = Path.home() / ".config" / "wp-seo-enhance"
CONFIG_PATH = CONFIG_DIR / "config.yaml"


def decrypt_aes_gcm(encrypted_b64: str, secret_hex: str) -> str:
    from Crypto.Cipher import AES
    combined = base64.b64decode(encrypted_b64)
    iv = combined[:12]
    auth_tag = combined[12:28]
    ciphertext = combined[28:]
    key = bytes.fromhex(secret_hex)
    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    plaintext = cipher.decrypt_and_verify(ciphertext, auth_tag)
    return plaintext.decode("utf-8")


def init_from_brighttale(
    supabase_url: str, supabase_key: str, encryption_secret: str
) -> dict:
    from supabase import create_client
    client = create_client(supabase_url, supabase_key)
    result = client.table("wordpress_configs").select("*").execute()

    sites = {}
    for row in result.data:
        name = row.get("site_url", "").replace("https://", "").replace("/", "").replace(".", "-")
        if not name:
            name = f"site-{row['id'][:8]}"
        password = decrypt_aes_gcm(row["password"], encryption_secret)
        sites[name] = {
            "url": row["site_url"].rstrip("/"),
            "username": row["username"],
            "app_password": password,
            "modules": ["linker", "backlinker", "auditor", "media", "yoast"],
        }

    return {"sites": sites}


def main():
    parser = argparse.ArgumentParser(description="WP SEO Enhance setup")
    sub = parser.add_subparsers(dest="command")

    init_parser = sub.add_parser("init", help="Initialize config")
    init_parser.add_argument("--from-brighttale", action="store_true",
                             help="Pull credentials from Bright Tale Supabase")
    init_parser.add_argument("--supabase-url", default=os.environ.get("SUPABASE_URL", ""))
    init_parser.add_argument("--supabase-key", default=os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
    init_parser.add_argument("--encryption-secret", default=os.environ.get("ENCRYPTION_SECRET", ""))

    args = parser.parse_args()

    if args.command == "init":
        if args.from_brighttale:
            if not all([args.supabase_url, args.supabase_key, args.encryption_secret]):
                print("Error: --from-brighttale requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, "
                      "and ENCRYPTION_SECRET (as env vars or flags)")
                sys.exit(1)

            print("Fetching WordPress configs from Bright Tale...")
            config_data = init_from_brighttale(
                args.supabase_url, args.supabase_key, args.encryption_secret
            )

            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            with open(CONFIG_PATH, "w") as f:
                yaml.dump(config_data, f, default_flow_style=False)
            os.chmod(CONFIG_PATH, 0o600)

            site_count = len(config_data.get("sites", {}))
            print(f"Saved {site_count} site(s) to {CONFIG_PATH}")
            print(f"Permissions set to 600 (owner-only read/write)")
        else:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            if CONFIG_PATH.exists():
                print(f"Config already exists at {CONFIG_PATH}")
            else:
                template = {"sites": {"example": {
                    "url": "https://example.com",
                    "username": "admin",
                    "app_password": "xxxx xxxx xxxx xxxx",
                    "modules": ["linker", "backlinker", "auditor", "media", "yoast"],
                }}}
                with open(CONFIG_PATH, "w") as f:
                    yaml.dump(template, f, default_flow_style=False)
                os.chmod(CONFIG_PATH, 0o600)
                print(f"Template config written to {CONFIG_PATH}")
                print("Edit it with your WordPress credentials.")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Test CLI help runs**

```bash
cd ~/tools/wp-seo-enhance && uv run wp-seo-init --help
```

Expected: Shows help text with `init` subcommand.

- [ ] **Step 3: Test template init (no Supabase)**

```bash
cd ~/tools/wp-seo-enhance && uv run wp-seo-init init
```

Expected: Creates `~/.config/wp-seo-enhance/config.yaml` with template content.

- [ ] **Step 4: Commit**

```bash
cd ~/tools/wp-seo-enhance && git add -A && git commit -m "feat: CLI init command for config setup and Bright Tale import"
```

---

## Task 12: Claude Code Skill File

**Files:**
- Create: `~/.claude/skills/wp-seo-enhance/SKILL.md`

- [ ] **Step 1: Create skill directory**

```bash
mkdir -p ~/.claude/skills/wp-seo-enhance
```

- [ ] **Step 2: Write SKILL.md**

```markdown
---
name: wp-seo-enhance
description: Post-publish SEO enhancer for WordPress. Use after publishing a blog post, or anytime to audit and improve existing posts. Adds internal links, reciprocal backlinks, fixes alt text, syncs Yoast meta, flags thin content.
---

# WP SEO Enhance

Audit and improve WordPress blog post SEO using the wp-seo-enhance MCP server.

## When to Use

- After publishing a post via Bright Tale pipeline or WordPress admin
- When the user says "enhance", "SEO audit", "add internal links", "fix alt text"
- When reviewing content quality across the site

## Prerequisites

- MCP server `wp-seo-enhance` must be registered in `~/.claude/settings.json`
- Config file at `~/.config/wp-seo-enhance/config.yaml` with site credentials
- For Yoast meta writes: WordPress must have `register_rest_field` snippet installed

## Workflow

Follow these steps in order. Present results to the user between each step. All content changes require user approval before applying.

### Step 1: Audit

Call `wp_audit_post` with the post URL or ID.

Present the score breakdown as a table:
- Overall score (0-100)
- Word count + thin content flag
- Internal links count
- External links count
- Images missing alt text
- Focus keyword present/missing
- Meta description present/missing

### Step 2: Internal Links

1. Call `wp_find_related` to get related posts ranked by relevance
2. Call `wp_suggest_links` to get anchor text + placement suggestions
3. Present suggestions to user as a table: anchor text, target post, target URL
4. Call `wp_suggest_backlinks` to find older posts that should link to this post
5. Present backlink suggestions: source post, anchor text
6. For all approved links:
   - Call `wp_preview_changes` to show the HTML diff
   - Wait for user to approve the diff
   - Call `wp_apply_changes` to push approved changes

### Step 3: Image Alt Text

1. Call `wp_audit_images` to list all images with current alt text
2. For images flagged as needing improvement, suggest descriptive alt text that:
   - Describes the image content
   - Includes relevant keywords naturally
   - Is 8-15 words
3. Present suggestions to user
4. For approved changes, call `wp_update_alt_text`

### Step 4: Yoast Meta

1. Call `wp_get_yoast_meta` to read current SEO metadata
2. If focus keyword is missing, suggest one based on post content
3. If meta description is missing or weak, suggest an improved version (150-160 chars)
4. Present suggestions to user
5. For approved changes, call `wp_update_yoast_meta`

### Step 5: Thin Content Flag

If word count < 1000:
- Note the gap (current words vs 1200 target)
- Suggest 2-3 sections to add based on the post topic
- Do NOT auto-write content — just flag and suggest

### Step 6: Summary

Report what changed:
- Posts modified (count)
- Links added (count)
- Alt text updated (count)
- Meta fields updated (count)
- New SEO score (re-audit if changes were made)

## Batch Mode

For auditing the full site:
1. Call `wp_audit_site` to rank all posts by SEO score
2. Present the bottom 10 as a prioritized list
3. Ask user which post to enhance first
4. Run Steps 1-6 on selected post
5. Ask if user wants to continue to the next post

## Notes

- The MCP server caches the post index for 10 minutes. Cache invalidates when posts are modified.
- Max 5 new links per post, max 3 older posts updated per backlink session.
- Links are never injected inside headings, existing links, blockquotes, or figure captions.
- If no natural anchor text match exists for a related post, it's skipped — links are never forced.
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/skills/wp-seo-enhance && git init && git add -A && git commit -m "feat: wp-seo-enhance Claude Code skill"
```

(Note: this is a standalone git repo for the skill, separate from bright-tale and wp-seo-enhance)

- [ ] **Step 4: Register MCP server in settings.json**

Read `~/.claude/settings.json`, add the `wp-seo-enhance` entry to `mcpServers`:

```json
"wp-seo-enhance": {
  "command": "uv",
  "args": ["run", "--directory", "/home/hectorlutero/tools/wp-seo-enhance", "wp-seo-enhance"]
}
```

- [ ] **Step 5: Commit settings change**

No commit needed — `settings.json` is not in a git repo.

---

## Task 13: Integration Test + Smoke Test

**Files:**
- No new files — manual verification

- [ ] **Step 1: Run full test suite**

```bash
cd ~/tools/wp-seo-enhance && uv run pytest tests/ -v --tb=short
```

Expected: All 54 tests PASS.

- [ ] **Step 2: Init config with template**

```bash
uv run --directory ~/tools/wp-seo-enhance wp-seo-init init
```

Expected: Config file created at `~/.config/wp-seo-enhance/config.yaml`.

- [ ] **Step 3: Edit config with real credentials**

Edit `~/.config/wp-seo-enhance/config.yaml` with Bright Curios credentials (either manually or via `wp-seo-init init --from-brighttale`).

- [ ] **Step 4: Verify MCP server starts**

```bash
timeout 3 uv run --directory ~/tools/wp-seo-enhance wp-seo-enhance 2>&1 || true
```

Expected: Server starts without errors.

- [ ] **Step 5: Test from Claude Code**

Open a new Claude Code session and invoke the skill:

```
/wp-seo-enhance
```

Or ask: "Audit the SEO of https://brightcurios.com/efficiency-debt-tool-hoarding-billable-hours/"

Verify the MCP tools are available and responding.

- [ ] **Step 6: Commit any fixes**

```bash
cd ~/tools/wp-seo-enhance && git add -A && git commit -m "fix: integration test adjustments"
```

---

## Task 14: WordPress Yoast REST Field Snippet

**Files:**
- Create: `~/tools/wp-seo-enhance/wordpress/yoast-rest-fields.php`

One-time WordPress setup — install in theme's `functions.php` or as a mu-plugin.

- [ ] **Step 1: Write the PHP snippet**

```php
<?php
/**
 * Expose Yoast SEO fields as writable REST API fields.
 * Install in your theme's functions.php or as a mu-plugin.
 *
 * After adding this, you can update Yoast fields via:
 * POST /wp-json/wp/v2/posts/{id} with body: { "meta": { "_yoast_wpseo_metadesc": "...", "_yoast_wpseo_focuskw": "..." } }
 */
add_action('init', function () {
    $fields = ['_yoast_wpseo_metadesc', '_yoast_wpseo_focuskw'];

    foreach ($fields as $field) {
        register_post_meta('post', $field, [
            'show_in_rest'  => true,
            'single'        => true,
            'type'          => 'string',
            'auth_callback' => function () {
                return current_user_can('edit_posts');
            },
        ]);
    }
});
```

- [ ] **Step 2: Create wordpress directory**

```bash
mkdir -p ~/tools/wp-seo-enhance/wordpress
```

- [ ] **Step 3: Commit**

```bash
cd ~/tools/wp-seo-enhance && git add -A && git commit -m "docs: WordPress Yoast REST field snippet for write access"
```
