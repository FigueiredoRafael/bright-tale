---
title: Projeções Financeiras — Custo, Margem e Comissão
status: draft
date: 2026-04-14
author: Rafael
---

# Projeções Financeiras — BrightTale

Análise de custo real por operação, margem por plano, e viabilidade de comissão para afiliados/vendedores.

**Princípio fundamental:** O usuário recebe X créditos/mês. Modelos mais caros consomem mais créditos por operação. O custo pro BrightTale é proporcional aos créditos — não existe "prejuízo por modelo caro", pois quem escolhe Opus gasta mais créditos e faz menos posts. A cota é o teto.

---

## 1. Custo Real por Provider (USD)

Preços públicos por 1M tokens (abril 2026):

| Provider | Modelo | Input/1M | Output/1M | Tier |
|---|---|---:|---:|---|
| **Gemini** | 2.5 Flash | $0.15 | $0.60 | Standard |
| **OpenAI** | GPT-4o-mini | $0.15 | $0.60 | Standard |
| **Gemini** | 2.5 Pro | $1.25 | $10.00 | Premium |
| **OpenAI** | GPT-4o | $2.50 | $10.00 | Premium |
| **Anthropic** | Claude Sonnet 4 | $3.00 | $15.00 | Premium |
| **Anthropic** | Claude Opus 4 | $15.00 | $75.00 | Ultra |
| **Ollama** | Llama 3.1 8B | $0.00 | $0.00 | Standard (local) |

### Custo de mídia

| Serviço | Operação | Custo USD |
|---|---|---:|
| **OpenAI TTS** | 1 min de áudio | $0.015 |
| **OpenAI TTS HD** | 1 min de áudio | $0.030 |
| **ElevenLabs** | 1 min de áudio (pay-as-you-go) | $0.044 |
| **ElevenLabs** | 1 min (plano Creator $22/mês) | ~$0.018 |
| **Gemini Imagen** | 1 imagem | $0.020 |
| **DALL-E 3** | 1 imagem | $0.040 |

---

## 2. Consumo de Créditos por Modelo (multiplicador)

O mesmo blog post consome créditos diferentes dependendo do modelo escolhido:

| Tier | Multiplicador | Exemplo: 1 blog post | Exemplo: 1 roteiro |
|---|---:|---:|---:|
| **Standard** (Flash/4o-mini) | 1x | 510 créditos | 500 créditos |
| **Premium** (Sonnet/4o/Gemini Pro) | 3x | 1.530 créditos | 1.500 créditos |
| **Ultra** (Opus) | 10x | 5.100 créditos | 5.000 créditos |

### Breakdown de 1 blog post (Standard = 1x)

| Etapa | Créditos (1x) | Créditos (3x) | Créditos (10x) |
|---|---:|---:|---:|
| Brainstorm | 50 | 150 | 500 |
| Research | 100 | 300 | 1.000 |
| Blog draft | 200 | 600 | 2.000 |
| Review | 100 | 300 | 1.000 |
| 2 imagens | 60 | 60 | 60 |
| **Total** | **510** | **1.410** | **4.560** |

> Imagens não mudam de preço com o tier — são sempre o mesmo custo.

### Breakdown de 1 vídeo dark channel (Standard)

| Etapa | Créditos (1x) |
|---|---:|
| Brainstorm | 50 |
| Research | 100 |
| Roteiro | 200 |
| Review | 100 |
| Thumbnail | 50 |
| Áudio 5min (OpenAI TTS) | 250 |
| Áudio 5min (ElevenLabs) | 500 |
| **Total (OpenAI TTS)** | **750** |
| **Total (ElevenLabs)** | **1.000** |

---

## 3. O que cada plano rende (por tier de modelo)

### Starter — R$ 49/mês · $9/mo (5.000 créditos)

| Modelo | Blog posts/mês | Roteiros/mês | Vídeos dark/mês |
|---|---:|---:|---:|
| **Standard** (1x) | ~9 posts | ~10 roteiros | ~6 (OpenAI TTS) |
| **Premium** (3x) | ~3 posts | ~3 roteiros | ~2 |
| **Ultra** (10x) | ~1 post | ~1 roteiro | 0 |
| **Mix realista** (70% std, 30% prm) | ~6 posts | ~7 roteiros | ~4 |

### Creator — R$ 149/mês · $29/mo (15.000 créditos)

| Modelo | Blog posts/mês | Roteiros/mês | Vídeos dark/mês |
|---|---:|---:|---:|
| **Standard** (1x) | ~29 posts | ~30 roteiros | ~20 (OpenAI TTS) |
| **Premium** (3x) | ~10 posts | ~10 roteiros | ~6 |
| **Ultra** (10x) | ~3 posts | ~3 roteiros | ~1 |
| **Mix realista** | ~20 posts | ~21 roteiros | ~14 |

### Pro — R$ 499/mês · $99/mo (50.000 créditos)

| Modelo | Blog posts/mês | Roteiros/mês | Vídeos dark/mês |
|---|---:|---:|---:|
| **Standard** (1x) | ~98 posts | ~100 roteiros | ~66 |
| **Premium** (3x) | ~33 posts | ~33 roteiros | ~22 |
| **Ultra** (10x) | ~10 posts | ~10 roteiros | ~5 |
| **Mix realista** | ~68 posts | ~70 roteiros | ~46 |

---

## 4. Custo Real pro BrightTale por Plano

O custo real depende do mix de modelos que os usuários escolhem. A cota de créditos é fixa — o que varia é quanto gastamos na API por crédito consumido.

### Custo real por crédito consumido

| Tier | Custo IA por crédito (USD) | Custo IA por crédito (BRL) |
|---|---:|---:|
| Standard | ~$0.000004 | ~R$ 0,00002 |
| Premium | ~$0.000040 | ~R$ 0,00022 |
| Ultra | ~$0.000200 | ~R$ 0,00110 |

### Custo total se o usuário consome TODA a cota

| Plano | Créditos | 100% Standard | 100% Premium | 100% Ultra |
|---|---:|---:|---:|---:|
| **Starter** R$ 49 · $9 | 5.000 | R$ 0,10 · $0.02 | R$ 1,10 · $0.20 | R$ 5,50 · $1.00 |
| **Creator** R$ 149 · $29 | 15.000 | R$ 0,30 · $0.05 | R$ 3,30 · $0.60 | R$ 16,50 · $3.00 |
| **Pro** R$ 499 · $99 | 50.000 | R$ 1,00 · $0.18 | R$ 11,00 · $2.00 | R$ 55,00 · $10.00 |

### Mix realista (60% Standard, 30% Premium, 10% Ultra)

| Plano | Créditos | Custo IA (mix) | Margem bruta |
|---|---:|---:|---:|
| **Starter** R$ 49 · $9 | 5.000 | R$ 0,93 · $0.17 | **98%** |
| **Creator** R$ 149 · $29 | 15.000 | R$ 2,79 · $0.51 | **98%** |
| **Pro** R$ 499 · $99 | 50.000 | R$ 9,30 · $1.69 | **98%** |

> **Margem de 98%?** Sim — porque o multiplicador de créditos por tier já absorve o custo maior. Quem usa Opus consome 10x mais créditos e faz 10x menos posts, mas paga o mesmo. A margem é estável independente do modelo escolhido.

### Pior cenário: 100% Ultra (todo mundo usa só Opus)

| Plano | Custo IA | Margem bruta |
|---|---:|---:|
| **Starter** R$ 49 · $9 | R$ 5,50 · $1.00 | **89%** |
| **Creator** R$ 149 · $29 | R$ 16,50 · $3.00 | **89%** |
| **Pro** R$ 499 · $99 | R$ 55,00 · $10.00 | **89%** |

> Mesmo no pior cenário absoluto (100% Opus), a margem é 89%. **Não existe cenário de prejuízo com o multiplicador de créditos.**

---

## 5. Simulação com Comissão de Afiliado/Vendedor

### Vendedor fecha venda Creator — R$ 149 · $29/mês

| Comissão | Pro vendedor | Custo IA (mix) | Lucro BrightTale | Margem |
|---:|---:|---:|---:|---:|
| 20% | R$ 29,80 · $5.80 | R$ 2,79 | **R$ 116,41 · $21.17** | **78%** |
| 25% | R$ 37,25 · $7.25 | R$ 2,79 | **R$ 108,96 · $19.81** | **73%** |
| 30% | R$ 44,70 · $8.70 | R$ 2,79 | **R$ 101,51 · $18.46** | **68%** |

### Vendedor fecha venda Pro — R$ 499 · $99/mês

| Comissão | Pro vendedor | Custo IA (mix) | Lucro BrightTale | Margem |
|---:|---:|---:|---:|---:|
| 20% | R$ 99,80 · $19.80 | R$ 9,30 | **R$ 389,90 · $70.89** | **78%** |
| 25% | R$ 124,75 · $24.75 | R$ 9,30 | **R$ 364,95 · $66.35** | **73%** |
| 30% | R$ 149,70 · $29.70 | R$ 9,30 | **R$ 340,00 · $61.82** | **68%** |

### Vendedor fecha venda Starter — R$ 49 · $9/mês

| Comissão | Pro vendedor | Custo IA (mix) | Lucro BrightTale | Margem |
|---:|---:|---:|---:|---:|
| 20% | R$ 9,80 · $1.80 | R$ 0,93 | **R$ 38,27 · $6.96** | **78%** |
| 25% | R$ 12,25 · $2.25 | R$ 0,93 | **R$ 35,82 · $6.51** | **73%** |
| 30% | R$ 14,70 · $2.70 | R$ 0,93 | **R$ 33,37 · $6.07** | **68%** |

### Mesmo com Opus (pior cenário) + comissão 30%

| Plano | Comissão 30% | Custo IA (Opus) | Lucro | Margem |
|---|---:|---:|---:|---:|
| Starter R$ 49 · $9 | R$ 14,70 · $2.70 | R$ 5,50 · $1.00 | **R$ 28,80 · $5.24** | **59%** |
| Creator R$ 149 · $29 | R$ 44,70 · $8.70 | R$ 16,50 · $3.00 | **R$ 87,80 · $15.96** | **59%** |
| Pro R$ 499 · $99 | R$ 149,70 · $29.70 | R$ 55,00 · $10.00 | **R$ 294,30 · $53.51** | **59%** |

> **Conclusão: até com 30% de comissão e 100% dos usuários usando Opus, a margem é 59%.** Qualquer faixa de comissão entre 20-30% é segura.

---

## 6. Custo com ElevenLabs e Áudio

ElevenLabs é o item mais caro da stack. Simulação separada pra quem produz vídeo com narração:

| Item | Custo real | Créditos cobrados |
|---|---:|---:|
| 5 min áudio OpenAI TTS | R$ 0,41 | 250 |
| 5 min áudio ElevenLabs | R$ 1,21 | 500 |
| 5 min áudio ElevenLabs (plano) | R$ 0,50 | 500 |

### Quanto custa se o Creator faz 10 vídeos dark/mês com ElevenLabs

| Item | Cálculo | Total |
|---|---|---:|
| 10 roteiros (Standard) | 10 × 500 créditos | 5.000 |
| 10 áudios ElevenLabs 5min | 10 × 500 créditos | 5.000 |
| 10 thumbnails | 10 × 50 créditos | 500 |
| **Total créditos** | | **10.500** |
| **Cabe no Creator (15.000)?** | | **Sim, sobram 4.500** |
| **Custo IA real** | | **R$ 15,10** |
| **Receita** | | **R$ 149,00** |
| **Margem** (sem comissão) | | **90%** |
| **Margem** (com 25% comissão) | | **65%** |

Se o usuário preferir ElevenLabs com modelo Premium (3x):
- 10 roteiros Premium: 10 × 1.500 = 15.000 créditos → **estoura a cota** → só faz ~7 vídeos no Premium
- O sistema se autoregula: quer qualidade premium? Faz menos. Quer volume? Usa Standard.

---

## 7. Projeção de Receita (primeiros 12 meses)

### Cenário conservador

| Mês | Free | Starter | Creator | Pro | MRR (BRL) | MRR (USD) | Custo IA | Comissão 25% | Lucro |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 50 | 5 | 2 | 0 | R$ 543 | $99 | R$ 11 | R$ 136 | **R$ 396 · $72** |
| 3 | 200 | 20 | 8 | 1 | R$ 2.671 | $486 | R$ 53 | R$ 668 | **R$ 1.950 · $355** |
| 6 | 500 | 50 | 25 | 3 | R$ 7.672 | $1,395 | R$ 153 | R$ 1.918 | **R$ 5.601 · $1,018** |
| 12 | 1.000 | 100 | 60 | 10 | R$ 19.840 | $3,607 | R$ 397 | R$ 4.960 | **R$ 14.483 · $2,633** |

### Cenário otimista

| Mês | Free | Starter | Creator | Pro | MRR (BRL) | MRR (USD) | Custo IA | Comissão 25% | Lucro |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 6 | 2.000 | 200 | 80 | 10 | R$ 26.720 | $4,858 | R$ 534 | R$ 6.680 | **R$ 19.506 · $3,547** |
| 12 | 5.000 | 500 | 200 | 30 | R$ 69.350 | $12,609 | R$ 1.387 | R$ 17.338 | **R$ 50.626 · $9,205** |

### Custo dos free users

Free users recebem 1.000 créditos. Se usam tudo:
- Custo real (mix): ~R$ 0,19/usuário/mês
- Com 1.000 free users ativos: R$ 190/mês (insignificante)
- Com 5.000 free users ativos: R$ 950/mês (ainda baixo)

> Free tier de 1.000 créditos é sustentável sem problema.

---

## 8. Resumo Executivo

| Métrica | BRL | USD |
|---|---|---|
| Custo médio por blog post (1x Standard) | R$ 0,10 | $0.02 |
| Custo médio por vídeo dark (1x + OpenAI TTS) | R$ 0,30 | $0.05 |
| Margem bruta (sem comissão) | **89-98%** | **89-98%** |
| Margem líquida com comissão 25% | **64-73%** | **64-73%** |
| Margem mínima absoluta (Opus + 30% comissão) | **59%** | **59%** |
| Break-even mensal (infra) | ~R$ 200 (~2 Creator) | ~$36 (~2 Creator) |
| Comissão segura | **Até 30%** | **Até 30%** |
| Free tier (1.000 créditos) | Custo: R$ 0,19/user | Custo: $0.03/user |

### Por que não existe cenário de prejuízo

O multiplicador de créditos por tier de modelo (1x/3x/10x) garante que:
1. Quem usa Opus gasta 10x mais créditos → faz 10x menos posts → consome a mesma cota
2. O custo por crédito no Opus é ~50x maior, mas o consumo de créditos é 10x → custo real sobe ~5x
3. Mesmo com 5x de custo, a margem mínima é 89% (sem comissão) ou 59% (com 30% comissão)
4. **A cota de créditos é o mecanismo de proteção de margem** — não precisa de cap, limite de modelo ou restrição artificial
