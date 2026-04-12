# Planos & Pricing

**Status:** 📋 Spec definido — [docs/specs/pricing-plans.md](/docs/specs/pricing-plans.md)

## Modelo: Créditos Unificados

Sistema inspirado no ElevenLabs. O usuário recebe **X créditos/mês** e decide como gastar. Quem só quer roteiro gasta pouco; quem quer vídeo completo dark channel gasta mais.

## Consumo por Ação

| Ação | Créditos |
|---|---:|
| Brainstorm (gerar ideias) | 50 |
| Research (pesquisa web) | 100 |
| YouTube Intelligence | 150 |
| Blog post (draft completo) | 200 |
| Roteiro de vídeo | 200 |
| Shorts scripts (3) | 100 |
| Podcast script | 150 |
| Review (QA) | 100 |
| Imagem IA (1) | 30 |
| Áudio narração (1 min) | 50 |
| Áudio Premium ElevenLabs (1 min) | 100 |
| Voice cloning (setup) | 500 |
| Vídeo dark channel (completo) | 1.000 |
| Vídeo com clips IA | 2.000 |
| Short vídeo (1 completo) | 300 |
| Thumbnail IA | 50 |

## Multiplicadores de Modelo

| Tier | Multiplicador | Modelos |
|---|---:|---|
| **Standard** (default) | 1x | Gemini Flash, Claude Haiku, GPT-4o mini |
| **Premium** | 3x | Claude Sonnet, GPT-5, Gemini Pro |
| **Ultra** | 5x | Claude Opus, GPT-5.4 |

## Planos

| | Free | Starter | Creator ⭐ | Pro |
|---|:---:|:---:|:---:|:---:|
| **Preço (USD)** | $0 | $9/mo | $29/mo | $99/mo |
| **Anual** | $0 | $7/mo | $23/mo | $79/mo |
| **Créditos/mês** | 1K | 5K | 15K | 50K |
| | | | | |
| Blog + roteiro | ✅ | ✅ | ✅ | ✅ |
| Shorts + podcast | ❌ | ✅ | ✅ | ✅ |
| Áudio (TTS) | ❌ | ✅ | ✅ | ✅ |
| Voice cloning | ❌ | ❌ | ✅ | ✅ |
| Vídeo dark channel | ❌ | ❌ | ✅ | ✅ |
| Clips IA (Runway) | ❌ | ❌ | ❌ | ✅ |
| YouTube Intelligence | ❌ | Básico | Completo | Multi-canal |
| Express mode (⚡) | ❌ | ❌ | ✅ | ✅ |
| WordPress | 1 | 3 | ∞ | ∞ |
| YouTube publish | ❌ | ❌ | ✅ | ✅ |
| Custom endpoints | ❌ | ❌ | 3 | ∞ |
| Modelos IA | Standard | Standard | + Premium | Todos |
| Seats | 1 | 1 | 1 | 3 |
| API access | ❌ | ❌ | ❌ | ✅ |
| Suporte | Community | Email | Priority | Dedicado |

## Exemplos de Uso Real

| Perfil | Plano ideal | Uso mensal |
|---|---|---|
| "Só quero roteiros para gravar eu mesmo" | **Free/Starter** | ~1.200 créditos (4 roteiros + thumbnails) |
| "Quero blog posts para SEO" | **Starter** | ~1.400 créditos (4 posts + imagens) |
| "Quero vídeos dark channel completos" | **Creator** | ~6.000 créditos (4 vídeos completos) |
| "Agência com múltiplos clientes" | **Pro** | ~30.000 créditos (mix de tudo) |

## Add-ons (compra avulsa)

| Pack | Créditos | Preço |
|---|---:|---|
| Básico | 1.000 | $3 |
| Médio | 5.000 | $12 |
| Grande | 15.000 | $30 |
| Agência | 50.000 | $80 |

## Spec completo

Ver [docs/specs/pricing-plans.md] para: layout dos cards, FAQ, conversão BRL, trust badges, e notas de implementação.
