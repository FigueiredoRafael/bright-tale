# Spec: Inclusão de Assets Menos Morosa

## 1. Objetivo
Reduzir tempo e cliques do `AssetsEngine`. Fluxo atual é sequencial, com refetch completo após batch, sem feedback incremental.

## 2. Estado Atual (Pain Points)
- `apps/app/src/components/engines/AssetsEngine.tsx:1-1362`
- `apps/api/src/routes/assets.ts` — upload single-slot.
- **Lentidão 1:** upload de N imagens faz for-loop sequencial com `await` (linha 418-421).
- **Lentidão 2:** após commit batch, refetch **todos** os assets do DB (linha 542-557), não incremental.
- **Lentidão 3:** geração AI per-slot sequencial, sem paralelização.
- **UX:** sem progress bar por arquivo; sem preview antes de gerar prompts; sem drag-drop multi-file visível.

## 3. Requisitos Funcionais

### 3.1 Upload Paralelo
- `Promise.all` com concurrency limit (default 4, configurável por plano) via `p-limit`.
- Progress por arquivo em estado local: `{ [file]: { progress: 0..100, status } }`.
- Upload via API gateway (mantém `apps/api` como proxy — audit + RLS + rate limit).

### 3.2 Geração AI em Batch
- Endpoint `POST /api/assets/generate-batch` aceita array de slots, dispara N gerações em paralelo.
- Retorna stream SSE com atualização por slot.

### 3.3 Optimistic UI
- Ao fazer upload, inserir asset stub na lista imediatamente com placeholder + progress.
- Substituir por dado real ao confirmar sem refetch completo.
- Usar TanStack Query `setQueryData` para patch incremental.

### 3.4 Biblioteca Reutilizável
- Ao invés de upload novo, reusar asset existente da biblioteca do canal.
- Modal com grid + search.

## 4. Arquitetura
- **Upload via API:** `POST /api/assets/upload` aceita multi-file multipart. Stream para Supabase Storage.
- **Batch generate:** `POST /api/assets/generate-batch` com SSE response.
- Frontend: `useAssetUpload()` hook com queue + concurrency configurável.
- **Biblioteca por canal:** route `GET /api/channels/:id/assets?search=` retorna assets ativos do canal.

## 5. Arquivos Afetados
- `apps/app/src/components/engines/AssetsEngine.tsx` — refatorar fluxo de upload
- `apps/app/src/hooks/useAssetUpload.ts` — NOVO
- `apps/api/src/routes/assets.ts` — adicionar generate-batch + library-by-channel
- `apps/api/src/routes/channels/:id/assets.ts` — NOVO endpoint de biblioteca do canal
- `packages/shared/src/schemas/assets.ts` — NOVO/atualizar
- `apps/api/src/lib/ai/image-gen.ts` — suportar batch paralelo

## 6. Critérios de Aceite
- [ ] Upload de 10 imagens ≤ tempo da imagem mais lenta × 1.5 (não soma linear).
- [ ] Progress bar por arquivo durante upload.
- [ ] Nenhum refetch completo após batch — lista atualiza incrementalmente.
- [ ] Drag-drop de 10 arquivos distribui automaticamente nos slots.
- [ ] Reutilizar asset da biblioteca pula upload.
