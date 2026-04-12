# Visão Geral do Produto

## O que é o BrightTale

BrightTale é uma plataforma de geração de conteúdo com IA para criadores que precisam produzir blogs e vídeos do YouTube em larga escala sem perder qualidade.

## Por que existe

Surgiu para resolver uma dor real: **falta de tempo para produzir conteúdo de qualidade em múltiplos formatos**. Um único tema gera automaticamente blog, vídeo, shorts, podcast e assets de engajamento.

## Proposta de Valor

1. **Usuário define tema** → IA gera conteúdo completo multi-formato
2. **Pipeline automatizado** — sem copiar/colar YAML manualmente
3. **Publicação direta** no WordPress / YouTube
4. **Poucos cliques** — feito para quem não é técnico

## Como Funciona

```
1. Escolha um tema
2. O Agent 1 (Brainstorm) gera 5-10 ideias
3. Selecione a melhor ideia
4. O Agent 2 (Research) valida e pesquisa fontes
5. O Agent 3 (Production) cria blog + vídeo + shorts + podcast
6. O Agent 4 (Review) faz QA e monta plano de publicação
7. Publique direto no WordPress/YouTube
```

## Monorepo

```
bright-tale/
├── apps/
│   ├── app/          ← UI principal (Next.js, porta 3000)
│   ├── api/          ← API (Next.js Route Handlers, porta 3001)
│   ├── web/          ← Landing page (porta 3002)
│   └── docs-site/    ← Esta documentação (porta 3003)
├── packages/
│   └── shared/       ← Tipos, schemas Zod, mappers
├── agents/           ← Definições dos agentes (markdown)
├── supabase/         ← Migrations + seed SQL
└── scripts/          ← Scripts auxiliares
```
