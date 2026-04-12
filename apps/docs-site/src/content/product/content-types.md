# Tipos de Conteúdo

O BrightTale gera 5 formatos de conteúdo a partir de uma única ideia.

## Blog

**Pipeline:** Brainstorm → Research → Canonical Core → Blog Draft → Review → WordPress

| Campo | Descrição |
|---|---|
| `outline` | Estrutura hierárquica de seções (JSON) |
| `full_draft` | Draft completo (HTML/Markdown) |
| `primary_keyword` | Palavra-chave principal para SEO |
| `secondary_keywords` | Palavras-chave secundárias |
| `meta_description` | Meta description para SEO |
| `slug` | URL-friendly slug |
| `affiliate_placement` | Posicionamento do link de afiliado |
| `affiliate_copy` | Copy do afiliado |
| `internal_links` | Links internos sugeridos |

**Review específico:** SEO, legibilidade, fact-checking, affiliate placement.

---

## Vídeo YouTube

**Pipeline:** Brainstorm → Research → Canonical Core → Video Draft → Review → Export

| Campo | Descrição |
|---|---|
| `title_options[]` | 3 opções de título |
| `thumbnail_json` | Conceito visual da thumbnail |
| `script_json` | Script com capítulos, timestamps, B-roll, sound design |
| `total_duration_estimate` | Duração estimada |

### Variantes

| Variante | Descrição | Status |
|---|---|---|
| **Canal normal** | Vídeos educativos/informativos com rosto | ✅ Implementado |
| **Canal dark** | Narração + imagens/vídeos stock (sem rosto) | 🔲 Planejado |
| **Cursos** | Série de vídeos estruturados (módulos + aulas) | 🔲 Planejado |

**Review específico:** Ritmo, retenção, thumbnail appeal, CTA positioning.

---

## Shorts

**Pipeline:** Brainstorm → Research → Canonical Core → Shorts Draft → Review

| Campo | Descrição |
|---|---|
| `shorts_json` | Array de 3-5 clips |
| `short_count` | Quantidade de shorts |
| `total_duration` | Duração total |

Cada clip contém: hook, corpo, CTA, duração (15-60s), captions, transições.

---

## Podcast

**Pipeline:** Brainstorm → Research → Canonical Core → Podcast Draft → Review

| Campo | Descrição |
|---|---|
| `episode_title` | Título do episódio |
| `episode_description` | Descrição |
| `intro_hook` | Hook de abertura |
| `talking_points_json` | Pontos de discussão com timings |
| `personal_angle` | Ângulo pessoal do host |
| `guest_questions[]` | Perguntas para convidado |
| `outro` | Encerramento |

---

## Engagement

Assets de engajamento gerados junto com o conteúdo:

| Asset | Descrição |
|---|---|
| `cta_subscribe` | CTA de inscrição |
| `cta_comment_prompt` | Prompt de engajamento nos comentários |
| Social hooks | Hooks para redes sociais |

---

## Canonical Core

Framework central que alimenta **todos** os formatos acima:

| Campo | Propósito |
|---|---|
| `thesis` | Argumento central (1 frase) |
| `argument_chain` | Fluxo lógico de argumentos |
| `emotional_arc` | Batidas emocionais (setup, conflito, resolução) |
| `key_stats` | Dados que sustentam a tese |
| `key_quotes` | Citações de especialistas |
| `affiliate_moment` | Produto, link, copy, racional |
| `cta_subscribe` | CTA de inscrição |
| `cta_comment_prompt` | Prompt de engajamento |

Cada sub-agente de produção (Blog, Video, Shorts, Podcast, Engagement) herda o Canonical Core para garantir consistência entre formatos.
