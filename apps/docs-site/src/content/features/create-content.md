# Create Content (wizard v2)

O fluxo de criação roda como um wizard contínuo em 3 etapas — Ideia → Pesquisa → Conteúdo. Cada etapa tem sua própria página mas compartilham um `WizardStepper` no topo mostrando onde o usuário está.

## Página hub: `/channels/:id/create`

3 abas com busca + auto-arquivamento:

- **Ideias** — `idea_archives` do canal. Ideias que já viraram content_drafts são auto-arquivadas (ocultas por padrão, toggle "Mostrar arquivadas (N)").
- **Pesquisas** — `research_sessions` completas. Mesmo comportamento de arquivamento automático.
- **Conteúdo** — `content_drafts`, agrupados por formato (Blog/Vídeo/Shorts/Podcast) com ícone e cor por tipo. Hover revela botão de deletar.

Cada item tem `?type=X` query param vindo da Biblioteca do sidebar (Blogs, Vídeos, Shorts, Podcasts).

## Etapa 1: Brainstorm (`/channels/:id/brainstorm/new`)

**Inputs:**
- Modo: `blind` (só tema), `fine_tuned` (+ niche/tone/audience/goal/constraints), `reference_guided` (URL)
- Tema
- Provider + modelo (ModelPicker — default Ollama)

**Output:** cards de ideia com verdict (viable/weak/experimental), clique numa ideia vai pra `/research/new?ideaId=X`.

Botão **Refazer** no header da lista: abre `ConfirmRegenerateModal` pra escolher provider/modelo e re-rodar com aviso de custo.

## Etapa 2: Pesquisa (`/channels/:id/research/new`)

**Inputs:**
- "Escolher ideia existente" (abre `IdeaPickerModal`) ou digita tema
- Nível: Surface (60c) / Medium (100c) / Deep (180c)
- Focus tags (estatísticas / expert advice / pro tips / processos validados)
- Provider + modelo

**Output:** cards de pesquisa com checkbox pra aprovar. "Aprovar N" vai pra `/drafts/new?researchSessionId=X`.

## Etapa 3: Conteúdo (`/channels/:id/drafts/new`)

**Inputs:**
- **Pesquisa base (obrigatório)** — picker + "Criar nova pesquisa" se vazio
- **Tema** — pré-preenchido da pesquisa, editável inline (pencil icon)
- **Formato** — Blog / Vídeo / Shorts / Podcast
- **Target length** contextual:
  - Blog: 300/500/700/1000 palavras
  - Vídeo: 3/5/8/10/15 min
  - Podcast: 10/20/30/45/60 min
  - Shorts: 15s/30s/60s
- Provider + modelo

**Output:** navega pra `/drafts/:draftId` com conteúdo renderizado.

## Modal de progresso

Todas as 3 etapas usam o mesmo `<GenerationProgressModal>`:
- Log cronológico de eventos SSE
- Duração por step
- Aviso "stall" se 60s sem evento novo
- Filtrado por `?since=` pra não misturar runs antigas

## Página do draft: `/channels/:id/drafts/:draftId`

- Body do post/script renderizado como artigo (prose) com hook/meta em itálico no topo
- Edição inline (hover → ✎ Editar) — PATCH `draft_json` com heurística que preserva título/meta/sections
- Card "Pacote YouTube" (vídeo/shorts): títulos A/B, thumbnails (concept/overlay/emoção/paleta/composição), comentário fixado, descrição SEO
- Card "Roteiro pro editor" (vídeo/shorts): A-roll/B-roll/SFX/BGM/efeitos/color
- Card "Avaliação do revisor" (★ score, verdict badge, SEO checks, pontos fortes, bloqueadores, sugestões)
- Card "Palavras-chave SEO" — badges extraídos do draft+review
- Action bar: **Refazer** (abre ConfirmRegenerateModal) / **Aprovar** / **Desaprovar** / **Marcar como publicado** / 🗑
- "Ver dados técnicos" — toggle que revela canonical_core_json + draft_json crus

## Código

- Hub: `apps/app/src/app/(app)/channels/[id]/create/page.tsx`
- Wizard: `brainstorm/new/page.tsx`, `research/new/page.tsx`, `drafts/new/page.tsx`, `drafts/[draftId]/page.tsx`
- Stepper: `components/generation/WizardStepper.tsx`
- Modais: `GenerationProgressModal`, `ConfirmRegenerateModal`, `IdeaPickerModal`, `ResearchPickerModal`
