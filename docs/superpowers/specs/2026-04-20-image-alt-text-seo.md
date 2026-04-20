# Spec: Alt Text SEO-Friendly nas Imagens WordPress

## 1. Objetivo
Garantir que **todas** as imagens publicadas no WordPress tenham `alt` text descritivo e otimizado para SEO. Hoje o alt existe mas tem fallback ruim (usa `blogContent.title` quando ausente).

## 2. Estado Atual
- `apps/api/src/routes/wordpress.ts:102-112` — envia `alt_text` ao endpoint `/wp-json/wp/v2/media/{id}`.
- `apps/api/src/routes/wordpress.ts:121-153` — `stitchImagesAfterH2` injeta `alt="..."` no HTML.
- **Cadeia de fallback:** `asset.alt_text` → `blogContent.title` → string vazia.
- **Lacuna:** quando usuário não preenche alt, todas imagens herdam mesmo título = penalidade SEO (duplicate alt, keyword stuffing).

## 3. Requisitos Funcionais

### 3.1 Geração Automática de Alt Text (on-the-fly no publish)
- **Estratégia decidida:** gerar alt **on-the-fly no momento do publish**, não em batch após upload. Motivo: reduz latência percebida no AssetsEngine e garante que alt reflete a versão final do draft.
- No `publishToWordPress`, para cada imagem sem alt manual, chama endpoint `generate-alt-text` com contexto do draft.
- Prompt inclui: contexto do artigo (título + H2 próximo), foco SEO (keyword primária do draft meta).
- **Modelo hardcoded v1:** Gemini Flash vision (custo/qualidade ótimo). Sem UI de seleção na v1. Configurável via env var `ALT_TEXT_VISION_MODEL` para override técnico. UI de seleção por canal — backlog.
- Campo UI no AssetsEngine permite edição manual (override).

### 3.1.1 ⚠️ TODO: Validar keywordPrimary no output do agente
- **Precondição:** prompt de alt-text precisa receber `keywordPrimary` do draft meta.
- **Ação necessária:** inspecionar output YAML atual dos agentes Research e Draft. Procurar campo `keywordPrimary`, `seoKeyword`, `primary_keyword` ou similar.
- Se não existir: atualizar prompts em `agents/agent-2-research.md` + `agents/agent-3-draft.md` + schemas `BC_RESEARCH_OUTPUT` / `BC_DRAFT_OUTPUT` em `packages/shared/src/types/agents.ts` para incluir campo obrigatório `seo.primaryKeyword: string`.
- Se existe mas opcional: tornar obrigatório + propagar pelo pipeline.
- Arquivos a revisar: `apps/api/src/lib/ai/prompts/review.ts`, `packages/shared/src/types/agents.ts`, agentes 2 e 3.

### 3.2 Validação SEO
- Alt mínimo 10 caracteres, máximo 125.
- Não começar com "Imagem de..." / "Picture of...".
- Sem keyword stuffing (keyword primária ≤ 1× no alt).
- Único entre imagens do mesmo post.

### 3.3 UI
- Campo alt editável inline no `AssetsEngine` com contador + badge SEO (verde/amarelo/vermelho).
- Botão "Regenerar alt" por imagem.
- Aviso se alt duplicado no post.

### 3.4 Publicação
- Fallback NUNCA usa `blogContent.title` bruto.
- **Se alt vazio no momento do publish:** gera on-the-fly automaticamente (não bloqueia).
- **Validação SEO:** warnings inline na UI; usuário pode override e publicar mesmo com warning.
- Captions e `title` HTML attribute também populados.

## 4. Arquitetura
- Route `POST /api/assets/:id/generate-alt-text` — aceita `articleContext`, retorna alt gerado (modelo = env `ALT_TEXT_VISION_MODEL`, default `gemini-flash`).
- Coluna `assets.alt_text` já existe. Adicionar `alt_text_source: enum('ai','manual','fallback','auto_on_publish')`.
- **NÃO** adicionar `channels.preferred_vision_model` na v1 (backlog).
- Schema em `packages/shared/src/schemas/assets.ts` atualizar.
- `apps/app/src/components/engines/AssetsEngine.tsx` — inline edit + regen button.
- `apps/api/src/routes/wordpress.ts` — antes de `stitchImagesAfterH2`, itera imagens sem alt e chama `generate-alt-text`.
- Validação Zod: `altTextSchema` com regras de tamanho e formato (warnings, não erro).

## 5. Arquivos Afetados
- `supabase/migrations/<ts>_assets_alt_text_source.sql` — NOVO
- `apps/api/src/routes/assets.ts` — adicionar endpoint generate-alt-text
- `apps/api/src/lib/ai/alt-text.ts` — NOVO, wrapper do vision model
- `apps/api/src/routes/wordpress.ts` — remover fallback para título, validar alt antes de publish
- `apps/app/src/components/engines/AssetsEngine.tsx` — UI de edição
- `packages/shared/src/schemas/assets.ts` — validação

## 6. Critérios de Aceite
- [ ] Asset recém-uploaded sem alt gera AI alt em ≤ 3s.
- [ ] Publicação bloqueia (ou gera on-the-fly) se alt vazio.
- [ ] Alt duplicado entre imagens do mesmo post aparece como warning.
- [ ] Verificação WP: todas `<img>` publicadas tem `alt` não-vazio e não-duplicado.
- [ ] `alt_text_source` registrado (ai/manual/fallback).
