---
title: Projeções Financeiras — Custo, Margem e Comissão
status: draft
date: 2026-04-14
author: Rafael
---

# Projeções Financeiras — BrightTale

Análise de custo real por operação, margem por plano, e viabilidade de comissão para afiliados/vendedores.

---

## 1. Custo Real por Provider (USD)

Preços públicos por 1M tokens (abril 2026):

| Provider | Modelo | Input/1M | Output/1M | Nota |
|---|---|---:|---:|---|
| **Gemini** | 2.5 Flash | $0.15 | $0.60 | Mais barato, qualidade boa |
| **Gemini** | 2.5 Pro | $1.25 | $10.00 | Premium, melhor qualidade |
| **OpenAI** | GPT-4o-mini | $0.15 | $0.60 | Equivalente ao Flash |
| **OpenAI** | GPT-4o | $2.50 | $10.00 | Premium |
| **Anthropic** | Claude Sonnet 4 | $3.00 | $15.00 | Melhor escrita, mais caro |
| **Anthropic** | Claude Opus 4 | $15.00 | $75.00 | Top, muito caro |
| **Ollama** | Llama 3.1 8B | $0.00 | $0.00 | Local, grátis, qualidade menor |

### Custo de mídia (não-texto)

| Serviço | Operação | Custo USD | Nota |
|---|---|---:|---|
| **OpenAI TTS** | 1 min de áudio (~1K chars) | $0.015 | tts-1 standard |
| **OpenAI TTS HD** | 1 min de áudio | $0.030 | tts-1-hd |
| **ElevenLabs** | 1 min de áudio (~1K chars) | $0.044 | Multilingual v2, pay-as-you-go |
| **ElevenLabs** | 1 min (plano Creator $22/mês) | ~$0.018 | 100K chars/mês inclusos |
| **Gemini Imagen** | 1 imagem | $0.020 | |
| **DALL-E 3** | 1 imagem (1024x1024) | $0.040 | |

---

## 2. Custo por Operação (cenários de provider)

### Cenário A: Econômico (Gemini Flash + OpenAI TTS)

| Operação | Tokens aprox | Custo USD | Custo BRL (5.5x) |
|---|---|---:|---:|
| Brainstorm (5 ideias) | 3K in + 2K out | $0.002 | R$ 0,01 |
| Research (web + fontes) | 5K in + 4K out | $0.003 | R$ 0,02 |
| Blog post completo | 8K in + 6K out | $0.005 | R$ 0,03 |
| Roteiro de vídeo | 8K in + 6K out | $0.005 | R$ 0,03 |
| Review/QA | 4K in + 2K out | $0.002 | R$ 0,01 |
| YouTube Intelligence | 10K in + 5K out | $0.005 | R$ 0,03 |
| 1 imagem (Imagen) | — | $0.020 | R$ 0,11 |
| 5 min áudio (OpenAI TTS) | — | $0.075 | R$ 0,41 |

**1 blog post completo** (brainstorm→research→blog→review + 2 imagens):
- Custo: R$ **0,21**

**1 roteiro de vídeo** (brainstorm→research→roteiro→review + thumbnail):
- Custo: R$ **0,21**

**1 vídeo dark channel** (roteiro + 5min áudio OpenAI + thumbnail):
- Custo: R$ **0,62**

### Cenário B: Qualidade (Claude Sonnet + ElevenLabs)

| Operação | Tokens aprox | Custo USD | Custo BRL |
|---|---|---:|---:|
| Brainstorm | 3K in + 2K out | $0.039 | R$ 0,21 |
| Research | 5K in + 4K out | $0.075 | R$ 0,41 |
| Blog post | 8K in + 6K out | $0.114 | R$ 0,63 |
| Roteiro de vídeo | 8K in + 6K out | $0.114 | R$ 0,63 |
| Review/QA | 4K in + 2K out | $0.042 | R$ 0,23 |
| 5 min áudio (ElevenLabs) | — | $0.220 | R$ 1,21 |

**1 blog post completo**: R$ **1,70**
**1 roteiro de vídeo**: R$ **1,70**
**1 vídeo dark channel** (roteiro + ElevenLabs + thumbnail): R$ **3,02**

### Cenário C: Premium (Claude Opus)

| Operação | Tokens aprox | Custo USD | Custo BRL |
|---|---|---:|---:|
| Brainstorm | 3K in + 2K out | $0.195 | R$ 1,07 |
| Research | 5K in + 4K out | $0.375 | R$ 2,06 |
| Blog post | 8K in + 6K out | $0.570 | R$ 3,14 |

**1 blog post completo**: R$ **7,34**
**1 roteiro de vídeo**: R$ **7,34**

> **Conclusão:** O custo varia **35x** entre Gemini Flash (R$ 0,21/post) e Claude Opus (R$ 7,34/post). O mix real depende de qual modelo o usuário escolhe.

---

## 3. Mix Estimado de Uso (realista)

Na prática, nem todo mundo usa o modelo mais caro. Estimativa de distribuição:

| Tier do modelo | % dos usuários | Provider típico | Custo médio/blog |
|---|---:|---|---:|
| Standard (default) | 60% | Gemini Flash / GPT-4o-mini | R$ 0,21 |
| Premium | 30% | Claude Sonnet / GPT-4o | R$ 1,70 |
| Ultra | 10% | Claude Opus | R$ 7,34 |

**Custo médio ponderado por blog post: R$ 1,00**
**Custo médio ponderado por roteiro: R$ 1,00**
**Custo médio ponderado por vídeo dark: R$ 2,50**

---

## 4. Simulação por Plano

### Plano Starter — R$ 49/mês (5.000 créditos)

| Perfil | Uso/mês | Créditos | Custo IA (mix) | Margem bruta |
|---|---|---:|---:|---:|
| Blogueiro leve | 8 posts + 2 imagens cada | 4.720 | R$ 8,00 | R$ 41 (**84%**) |
| YouTuber hobby | 8 roteiros | 4.000 | R$ 8,00 | R$ 41 (**84%**) |
| Iniciante testando | 3 posts + 3 roteiros | 3.060 | R$ 6,00 | R$ 43 (**88%**) |
| Usuário ativo | 10 posts | 5.100 | R$ 10,00 | R$ 39 (**80%**) |
| **Média estimada** | | | **R$ 8,00** | **R$ 41 (84%)** |

### Plano Creator — R$ 149/mês (15.000 créditos)

| Perfil | Uso/mês | Créditos | Custo IA (mix) | Margem bruta |
|---|---|---:|---:|---:|
| Blogueiro sério | 30 posts (1/dia) | 15.300 | R$ 30,00 | R$ 119 (**80%**) |
| YouTuber 4/semana | 16 roteiros + thumbnails | 8.800 | R$ 17,60 | R$ 131 (**88%**) |
| Dark channel 2/semana | 8 vídeos dark | 8.000 | R$ 20,00 | R$ 129 (**87%**) |
| Agência pequena | 15 blogs + 8 roteiros + 10 shorts | 14.500 | R$ 28,00 | R$ 121 (**81%**) |
| Gastador (Claude Opus tudo) | 10 posts (Opus) | 5.100 | R$ 73,40 | R$ 76 (**51%**) |
| **Média estimada** | | | **R$ 28,00** | **R$ 121 (81%)** |

### Plano Pro — R$ 499/mês (50.000 créditos)

| Perfil | Uso/mês | Créditos | Custo IA (mix) | Margem bruta |
|---|---|---:|---:|---:|
| Agência média | 50 blogs + 20 roteiros + 30 shorts | 40.000 | R$ 70,00 | R$ 429 (**86%**) |
| Fábrica de conteúdo | 100 blogs | 51.000 | R$ 100,00 | R$ 399 (**80%**) |
| Multi-canal YouTube | 40 vídeos dark | 40.000 | R$ 100,00 | R$ 399 (**80%**) |
| Power user (Opus) | 30 posts (Opus) | 15.300 | R$ 220,00 | R$ 279 (**56%**) |
| **Média estimada** | | | **R$ 100,00** | **R$ 399 (80%)** |

---

## 5. Simulação com Comissão de Afiliado/Vendedor

### Cenário: Vendedor fecha venda Creator (R$ 149/mês)

| Comissão | Valor/mês pro vendedor | Sobra pro BrightTale | Custo IA médio | Lucro líquido | Margem líquida |
|---:|---:|---:|---:|---:|---:|
| 20% | R$ 29,80 | R$ 119,20 | R$ 28,00 | **R$ 91,20** | **61%** |
| 25% | R$ 37,25 | R$ 111,75 | R$ 28,00 | **R$ 83,75** | **56%** |
| 30% | R$ 44,70 | R$ 104,30 | R$ 28,00 | **R$ 76,30** | **51%** |

### Cenário: Vendedor fecha venda Pro (R$ 499/mês)

| Comissão | Valor/mês pro vendedor | Sobra pro BrightTale | Custo IA médio | Lucro líquido | Margem líquida |
|---:|---:|---:|---:|---:|---:|
| 20% | R$ 99,80 | R$ 399,20 | R$ 100,00 | **R$ 299,20** | **60%** |
| 25% | R$ 124,75 | R$ 374,25 | R$ 100,00 | **R$ 274,25** | **55%** |
| 30% | R$ 149,70 | R$ 349,30 | R$ 100,00 | **R$ 249,30** | **50%** |

### Cenário: Vendedor fecha venda Starter (R$ 49/mês)

| Comissão | Valor/mês pro vendedor | Sobra pro BrightTale | Custo IA médio | Lucro líquido | Margem líquida |
|---:|---:|---:|---:|---:|---:|
| 20% | R$ 9,80 | R$ 39,20 | R$ 8,00 | **R$ 31,20** | **64%** |
| 25% | R$ 12,25 | R$ 36,75 | R$ 8,00 | **R$ 28,75** | **59%** |
| 30% | R$ 14,70 | R$ 34,30 | R$ 8,00 | **R$ 26,30** | **54%** |

---

## 6. Pior Cenário: Usuário que só usa Claude Opus + ElevenLabs

Se um usuário Creator (R$ 149) usa TUDO no modelo mais caro:

| Uso/mês | Custo IA real | Comissão 25% | Lucro líquido | Margem |
|---|---:|---:|---:|---:|
| 15 posts (Opus) + ElevenLabs | R$ 128,00 | R$ 37,25 | **-R$ 16,25** | **NEGATIVO** |
| 10 posts (Opus) + ElevenLabs | R$ 91,00 | R$ 37,25 | **R$ 20,75** | **14%** |
| 20 posts (Opus) | R$ 146,80 | R$ 37,25 | **-R$ 35,05** | **NEGATIVO** |

> **ALERTA:** Usuário que maximiza Claude Opus no plano Creator pode dar prejuízo, especialmente com comissão de afiliado.

### Mitigações possíveis:

1. **Limitar Opus ao plano Pro** — Creator só acessa Sonnet
2. **Custo de créditos diferente por modelo** — Opus consome 5x mais créditos por operação
3. **Cap de uso de modelos premium** — ex: máx 30% das operações em Opus no Creator
4. **Preço do crédito extra refletir custo real** — addon de créditos mais caro pra quem usa premium

**Recomendação: opção 2 (créditos diferenciados).** Já está parcialmente implementado no STAGE_COSTS. Expandir pra multiplicador por tier:

| Tier | Multiplicador de créditos |
|---|---:|
| Standard (Flash/4o-mini) | 1x |
| Premium (Sonnet/4o) | 3x |
| Ultra (Opus) | 10x |

Com isso, 15.000 créditos Creator rendem:
- 30 posts no Standard (como hoje)
- 10 posts no Premium
- 3 posts no Ultra

O usuário **escolhe**: mais volume (Standard) ou mais qualidade (Ultra).

---

## 7. Projeção de Receita (primeiros 12 meses)

### Cenário conservador

| Mês | Free | Starter | Creator | Pro | MRR | Custo IA | Comissão (25%) | Lucro |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 50 | 5 | 2 | 0 | R$ 543 | R$ 96 | R$ 136 | **R$ 311** |
| 3 | 200 | 20 | 8 | 1 | R$ 2.671 | R$ 484 | R$ 668 | **R$ 1.519** |
| 6 | 500 | 50 | 25 | 3 | R$ 7.672 | R$ 1.420 | R$ 1.918 | **R$ 4.334** |
| 12 | 1000 | 100 | 60 | 10 | R$ 19.840 | R$ 3.680 | R$ 4.960 | **R$ 11.200** |

### Cenário otimista

| Mês | Free | Starter | Creator | Pro | MRR | Custo IA | Comissão (25%) | Lucro |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 6 | 2000 | 200 | 80 | 10 | R$ 26.720 | R$ 4.920 | R$ 6.680 | **R$ 15.120** |
| 12 | 5000 | 500 | 200 | 30 | R$ 69.350 | R$ 12.800 | R$ 17.338 | **R$ 39.213** |

**Nota:** Free users não geram receita direta mas custam ~R$ 2/mês em IA cada (se usarem os 1.000 créditos). Com 1.000 free users ativos = R$ 2.000/mês de custo sem receita. Considerar limitar free tier a 500 créditos ou exigir email verificado.

---

## 8. Resumo Executivo

| Métrica | Valor |
|---|---|
| Custo médio por blog (mix de modelos) | R$ 1,00 |
| Custo médio por vídeo dark (mix) | R$ 2,50 |
| Margem bruta média (sem comissão) | **80-85%** |
| Margem líquida com comissão 25% | **55-60%** |
| Break-even mensal (infra + domínio) | ~R$ 200/mês |
| Break-even em assinantes | ~5 Creator ou ~2 Pro |
| Risco: usuário Opus no Creator | Pode dar prejuízo → mitigar com multiplicador de créditos |
| Comissão segura | **20-25%** (acima de 30% aperta no Creator com power users) |
