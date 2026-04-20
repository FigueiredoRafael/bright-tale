# Spec: Kanban Board para Milestones Internos

## 1. Objetivo
Migrar o controle de progresso do projeto de arquivos Markdown para um banco de dados relacional (Supabase) e criar uma interface de Kanban interativa para gerenciar o desenvolvimento das fases do BrightTale.

## 2. Requisitos Funcionais

### 2.1 Gestão de Cards
- **CRUD Completo:** Criar, ler, atualizar e deletar cards de milestone.
- **Migração Inicial:** Script para importar os cards existentes nos arquivos `.md` do `apps/docs-site` para o banco de dados.
- **Sincronização:** Mudanças no board refletem instantaneamente no banco de dados.

### 2.2 Interface Kanban
- **Colunas de Status:** Backlog, To Do, In Progress, Done.
- **Drag & Drop:** Mover cards entre colunas para atualizar o status.
- **Visualização de Bloqueio:** Cards com o flag `is_blocked = true` devem ter fundo amarelo suave e borda amarela vibrante.
- **Tags Coloridas:** Suporte a múltiplas tags por card (ex: API, UI, DB, Bug).
- **Filtros Globais:** Filtrar por Fase (ex: Phase 2) e Prioridade (Fatal, High, Medium, Low).

## 3. Arquitetura Técnica

### 3.1 Modelo de Dados (Supabase)
Tabela: `project_milestone_cards`
- `id`: uuid (pk)
- `slug`: text (unique, ex: 'F2-001')
- `title`: text
- `description`: text (markdown)
- `status`: enum (backlog, todo, in_progress, done, na)
- `priority`: enum (fatal, high, medium, low)
- `phase`: text (ex: 'Phase 2')
- `tags`: jsonb (array de objetos `{label: string, color: string}`)
- `is_blocked`: boolean (default: false)
- `order`: float (para ordenação na coluna)
- `metadata`: jsonb (concluído_em, etc)
- `created_at` / `updated_at`: timestamps

### 3.2 Stack Frontend
- **Framework:** Next.js (App Router) em `apps/app/src/app/(app)/admin/board`.
- **Drag & Drop:** `@dnd-kit/core` e `@dnd-kit/sortable`.
- **State Management:** `TanStack Query` para cache e Optimistic Updates.
- **UI Components:** Tailwind CSS + Radix UI (Sheet para edição de cards).

## 4. Plano de Migração
1. Criar migration do banco de dados.
2. Desenvolver script `scripts/sync-milestones-to-db.ts` para parsear os arquivos Markdown atuais.
3. Executar o sync para popular o banco.
4. Implementar a interface no painel administrativo.

## 5. Critérios de Aceite
- [ ] Todos os cards do Markdown estão presentes no banco após o sync.
- [ ] Arrastar um card de "To Do" para "In Progress" atualiza o status no Supabase.
- [ ] Ativar o flag "Bloqueado" muda a cor do card para amarelo visualmente.
- [ ] O board é responsivo e performático com 50+ cards.
