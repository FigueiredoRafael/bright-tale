# Sistema de Tokens

**Status:** 🔲 A implementar

## Conceito

Cada ação que consome IA gasta tokens. Planos definem limites mensais.

## Ações que Consomem Tokens

| Ação | Tokens estimados |
|---|---|
| Brainstorm (geração de ideias) | A definir |
| Research (pesquisa com IA) | A definir |
| Production (blog, vídeo, etc.) | A definir |
| Review (revisão com IA) | A definir |
| Geração de imagem | A definir |

## Métricas por Usuário

- Tokens consumidos no período
- Tokens restantes
- Histórico de consumo
- Alertas de limite

## Campos Existentes no Banco

- `user_profiles.is_premium`
- `user_profiles.premium_plan` (monthly / yearly)
- `user_profiles.premium_started_at` / `premium_expires_at`

## A Implementar

- Tabela de consumo de tokens
- Middleware de rate limiting por tokens
- Dashboard de consumo para o usuário
- Alertas quando se aproximar do limite
- Reset mensal automático
