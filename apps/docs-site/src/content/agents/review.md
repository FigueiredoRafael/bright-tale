# Agent 4 — Review

**Arquivo:** `agents/agent-4-review.md`
**Papel:** Quality gate — revisão final e plano de publicação.

## Input

Recebe **todos os assets** do Agent 3 (Production):
- Blog draft
- Video script
- Shorts scripts
- Podcast draft
- Engagement assets
- Canonical Core

## Output

| Campo | Descrição |
|---|---|
| `overall_verdict` | `approved` / `revision_required` / `rejected` |
| `feedback[]` | Lista de feedbacks por formato |
| `critical_issues[]` | Problemas que bloqueiam publicação |
| `suggestions[]` | Melhorias opcionais |
| `publication_plan` | Cronograma de publicação (se approved) |

## Critérios de Revisão

### Blog
- SEO: keyword density, meta description, heading structure
- Legibilidade: tom consistente, parágrafos curtos
- Fact-checking: dados conferem com o Research?
- Affiliate: posicionamento natural, não forçado

### Video
- Retenção: hook nos primeiros 10s, pacing adequado
- Script: falas naturais, não robóticas
- Thumbnail: conceito atrativo
- CTA: posicionamento estratégico

### Shorts
- Hook: primeiros 3 segundos capturam atenção
- Duração: 15-60s adequado ao conteúdo
- CTA: claro e direto

### Podcast
- Naturalidade: talking points, não script rígido
- Profundidade: complementa blog/vídeo sem repetir
- Abertura: hook que segura o ouvinte

## Vereditos

| Veredito | Ação |
|---|---|
| `approved` | Publicar conforme `publication_plan` |
| `revision_required` | Volta ao Production com feedback específico |
| `rejected` | Volta ao Brainstorm ou Research (raro, indica problema fundamental) |

## Próximo Passo

Se aprovado → **Publish** (WordPress, YouTube, export manual).
