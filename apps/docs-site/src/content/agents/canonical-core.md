# Canonical Core

**Arquivo:** `agents/agent-3a-content-core.md`
**Tabela:** `canonical_core`

O Canonical Core é o **framework central** que alimenta todos os formatos de conteúdo. Ele garante que blog, vídeo, shorts e podcast contem a mesma história com a mesma base factual.

## Campos

| Campo | Tipo | Propósito |
|---|---|---|
| `thesis` | text | Argumento central em 1 frase |
| `argument_chain` | JSONB | Fluxo lógico: premissa → evidência → conclusão |
| `emotional_arc` | JSONB | Batidas emocionais: setup → conflito → resolução |
| `key_stats` | JSONB | Dados que sustentam a tese (com fontes) |
| `key_quotes` | JSONB | Citações de especialistas (com credenciais) |
| `affiliate_moment` | JSONB | Produto, link, copy, racional de posicionamento |
| `cta_subscribe` | text | Call-to-action de inscrição |
| `cta_comment_prompt` | text | Prompt de engajamento nos comentários |

## Por que existe

Sem o Canonical Core, cada formato geraria conteúdo independente — com inconsistências de dados, argumentos e tom. O Core garante:

1. **Mesma tese** em todos os formatos
2. **Mesmas estatísticas** (sem números conflitantes)
3. **Mesmo arco emocional** adaptado ao formato
4. **Mesmo posicionamento de afiliado**

## Como os formatos usam o Core

| Formato | Usa do Core |
|---|---|
| Blog | thesis → intro, argument_chain → seções, key_stats → citações inline |
| Video | emotional_arc → estrutura de capítulos, key_quotes → falas de autoridade |
| Shorts | thesis → hook, key_stats → dado impactante, cta → encerramento |
| Podcast | argument_chain → talking points, key_quotes → momentos de citação |

## API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/canonical-core` | Listar (filtros: idea_id, project_id) |
| POST | `/api/canonical-core` | Criar |
| GET | `/api/canonical-core/:id` | Detalhe |
| PUT | `/api/canonical-core/:id` | Atualizar |
| DELETE | `/api/canonical-core/:id` | Deletar |
