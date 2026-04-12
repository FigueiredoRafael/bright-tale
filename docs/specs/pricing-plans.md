---
title: Pricing Plans — Spec Completo para Landing Page
status: draft
milestone: v2.0
author: Rafael
date: 2026-04-11
points: TBD
---

# Pricing Plans — Spec para apps/web

## Modelo de Créditos

Sistema de **créditos unificados** (estilo ElevenLabs). O usuário recebe X créditos/mês e decide como gastar. Quem só quer roteiros gasta pouco crédito; quem quer vídeo completo dark channel gasta mais.

### Tabela de Consumo por Ação

| Ação | Créditos | Nota |
|---|---:|---|
| **Brainstorm** (gerar ideias) | 50 | ~5 ideias por execução |
| **Research** (pesquisa web) | 100 | Com fontes e estatísticas |
| **YouTube Intelligence** (análise de nicho) | 150 | Top vídeos + gaps + transcrições |
| **Blog post** (draft completo) | 200 | Outline + SEO + affiliate |
| **Roteiro de vídeo** (script only) | 200 | Capítulos + B-roll + thumbnail concept |
| **Shorts scripts** (3 shorts) | 100 | Hook + body + CTA cada |
| **Podcast script** | 150 | Talking points + intro/outro |
| **Review** (QA de conteúdo) | 100 | Fact-check + feedback |
| | | |
| **Geração de imagem IA** (1 imagem) | 30 | Gemini Imagen / DALL-E |
| **Geração de áudio** (1 min narração) | 50 | OpenAI TTS standard |
| **Geração de áudio Premium** (1 min) | 100 | ElevenLabs Multilingual |
| **Voice cloning setup** | 500 | Uma vez — clona sua voz |
| | | |
| **Vídeo dark channel** (montagem completa) | 1.000 | Script + áudio + stock footage + legendas + montagem |
| **Vídeo com clips IA** (Runway/Kling) | 2.000 | Inclui geração de clips IA |
| **Shorts vídeo** (1 short completo) | 300 | Áudio + visual + legendas |
| **Thumbnail** (geração IA) | 50 | 3 opções |

### Exemplos de Uso

| Perfil | O que faz | Créditos/mês |
|---|---|---:|
| **Blogueiro** | 4 blog posts + imagens | ~1.400 |
| **YouTuber (grava ele mesmo)** | 4 roteiros + thumbnails | ~1.200 |
| **Dark channel** | 4 vídeos completos (script→vídeo) | ~6.000 |
| **Agência** | 10 blogs + 5 vídeos + 15 shorts | ~15.000 |
| **Iniciante testando** | 1 blog + 1 roteiro | ~700 |

---

## Planos

### Layout: Estilo ElevenLabs

4 cards horizontais. Cada plano mostra:
1. Nome + preço
2. CTA button
3. "Everything in [plano anterior], plus" (exceto Free que lista tudo)
4. Créditos/mês no rodapé do card

---

### Free — $0/month

**CTA:** "Start for Free"

**Features listadas no card:**
- ✅ AI Brainstorming
- ✅ Blog post generation
- ✅ Video script generation
- ✅ Research agent
- ✅ 1 WordPress site
- ✅ Standard templates
- ✅ Image generation
- ✅ Community support

**Créditos:** **1.000 credits** per month

**O que dá para fazer com 1.000 créditos:**
- ~2 blog posts com imagens, OU
- ~2 roteiros de vídeo com thumbnails, OU
- Mix de ambos

**Limitações (não listadas no card, mas enforced):**
- Modelos: Standard apenas
- Sem áudio/vídeo generation
- Sem YouTube Intelligence
- Sem bulk generation
- Sem custom endpoints

---

### Starter — $9/month ($7/mo annual)

**CTA:** "Choose Starter"

**Card mostra:** "Everything in Free, plus"
- ✅ Audio narration (TTS)
- ✅ YouTube Intelligence (basic)
- ✅ Deep research with sources
- ✅ Shorts generation
- ✅ Podcast scripts
- ✅ 3 WordPress sites
- ✅ Bulk generation (up to 3)
- ✅ Email support

**Créditos:** **5.000 credits** per month

**O que dá para fazer com 5.000 créditos:**
- ~8 blog posts com imagens e áudio, OU
- ~4 roteiros + 4 blogs, OU
- ~2 vídeos dark channel completos, OU
- Mix variado

---

### Creator ⭐ Popular — $29/month ($23/mo annual)

**Badge:** "Popular"
**CTA:** "Choose Creator"

**Card mostra:** "Everything in Starter, plus"
- ✅ Dark channel video generation
- ✅ YouTube Intelligence (full)
- ✅ Premium AI models (Opus, GPT-5.4)
- ✅ Voice cloning
- ✅ Express mode (⚡ 1-click)
- ✅ Custom endpoints (3)
- ✅ YouTube publishing
- ✅ Custom brand voice
- ✅ Priority support

**Créditos:** **15.000 credits** per month

**O que dá para fazer com 15.000 créditos:**
- ~10 vídeos dark channel completos, OU
- ~30 blog posts com tudo, OU
- ~5 vídeos dark + 10 blogs + 15 shorts, OU
- Mix variado

---

### Pro — $99/month ($79/mo annual)

**Card com fundo gradient** (como ElevenLabs Pro)
**CTA:** "Choose Pro"

**Card mostra:** "Everything in Creator, plus"
- ✅ AI video clips (Runway/Kling)
- ✅ Team collaboration (3 seats)
- ✅ Custom AI prompts (agentes personalizados)
- ✅ Unlimited WordPress sites
- ✅ Unlimited custom endpoints
- ✅ API access (REST)
- ✅ Webhooks
- ✅ Multi-brand kits
- ✅ Analytics avançado
- ✅ Dedicated support

**Créditos:** **50.000 credits** per month

**O que dá para fazer com 50.000 créditos:**
- ~35 vídeos dark channel, OU
- ~100+ blog posts, OU
- Pipeline de agência com múltiplos clientes

---

### Enterprise — Custom

**Não é card visual — é uma seção abaixo com:**

"Need more? Contact us for custom plans with unlimited credits, SLA, fine-tuned models, and dedicated infrastructure."

**CTA:** "Contact Sales"

**Inclui:**
- Créditos ilimitados ou volume custom
- Seats ilimitados
- SLA 99.9%
- Fine-tuning de modelos
- Dedicated account manager
- On-premise option
- Custom integrations

---

## Multiplicadores de Modelo (transparente para o usuário)

Na página de settings do app, o usuário vê:

```
Modelo de IA: Standard (recomendado)

ℹ️ Modelos premium gastam mais créditos:

Standard (default):     1x créditos
  → Gemini Flash, Claude Haiku, GPT-4o mini
  
Premium:                3x créditos  
  → Claude Sonnet, GPT-5, Gemini Pro
  
Ultra:                  5x créditos
  → Claude Opus, GPT-5.4
```

**Exemplo:** Blog post custa 200 créditos no Standard, 600 no Premium, 1.000 no Ultra.

Na landing page NÃO mostrar os multiplicadores — apenas dizer "Premium AI models" como feature do Creator+.

---

## Add-ons (compra avulsa)

| Add-on | Créditos | Preço |
|---|---:|---|
| Pack básico | 1.000 | $3 |
| Pack médio | 5.000 | $12 |
| Pack grande | 15.000 | $30 |
| Pack agência | 50.000 | $80 |

Mostrar na landing page:
"Need more credits? Purchase add-on packs anytime — no plan upgrade required."

---

## Seção de Comparação (tabela expandível na landing page)

| Feature | Free | Starter | Creator ⭐ | Pro |
|---|:---:|:---:|:---:|:---:|
| **Credits/month** | 1K | 5K | 15K | 50K |
| | | | | |
| **Content** | | | | |
| Blog posts | ✅ | ✅ | ✅ | ✅ |
| Video scripts | ✅ | ✅ | ✅ | ✅ |
| Shorts scripts | ❌ | ✅ | ✅ | ✅ |
| Podcast scripts | ❌ | ✅ | ✅ | ✅ |
| Bulk generation | ❌ | 3/vez | 5/vez | 10/vez |
| | | | | |
| **AI & Research** | | | | |
| AI models | Standard | Standard | Standard + Premium | All |
| Research agent | Basic | Deep | Deep + transcriptions | Deep + transcriptions |
| YouTube Intelligence | ❌ | Basic | Full | Multi-channel |
| | | | | |
| **Media** | | | | |
| Image generation | ✅ | ✅ | ✅ | ✅ |
| Audio narration (TTS) | ❌ | ✅ | ✅ | ✅ |
| Voice cloning | ❌ | ❌ | ✅ | ✅ |
| Dark channel video | ❌ | ❌ | ✅ | ✅ |
| AI video clips (Runway) | ❌ | ❌ | ❌ | ✅ |
| Express mode (⚡) | ❌ | ❌ | ✅ | ✅ |
| | | | | |
| **Publishing** | | | | |
| WordPress | 1 site | 3 sites | ∞ | ∞ |
| YouTube upload | ❌ | ❌ | ✅ | ✅ |
| Custom endpoints | ❌ | ❌ | 3 | ∞ |
| | | | | |
| **Team & API** | | | | |
| Seats | 1 | 1 | 1 | 3 (+$20/extra) |
| API access | ❌ | ❌ | ❌ | ✅ |
| Webhooks | ❌ | ❌ | ❌ | ✅ |
| Multi-brand | ❌ | ❌ | ❌ | ✅ |
| | | | | |
| **Support** | Community | Email | Priority | Dedicated |

---

## Conversão BRL

Toggle na landing page: **USD | BRL**

| Plano | USD Mensal | USD Anual | BRL Mensal | BRL Anual |
|---|---:|---:|---:|---:|
| Free | $0 | $0 | R$ 0 | R$ 0 |
| Starter | $9 | $7 | R$ 19 | R$ 14 |
| Creator | $29 | $23 | R$ 57 | R$ 45 |
| Pro | $99 | $79 | R$ 197 | R$ 157 |

---

## Trust Badges

```
🔒 AES-256 Encrypted    ⏱️ 99.9% Uptime    🚫 Cancel Anytime    🇪🇺 GDPR Compliant
```

---

## FAQ

### Como funcionam os créditos?
Cada ação gasta uma quantidade de créditos. Gerar um blog post gasta 200 créditos; gerar um vídeo dark channel completo gasta 1.000. Você escolhe como usar seus créditos — só texto, só áudio, ou o pacote completo.

### Preciso usar créditos para fazer vídeo?
Não necessariamente! Se você grava seus próprios vídeos, use os créditos apenas para gerar roteiros, thumbnails e pesquisa. O vídeo completo (dark channel) é opcional e gasta mais créditos.

### Modelos Premium gastam mais créditos?
Sim. Modelos Standard (recomendados) gastam 1x. Modelos Premium (Claude Sonnet, GPT-5) gastam 3x. Modelos Ultra (Claude Opus) gastam 5x. O modo Standard é otimizado para custo-benefício.

### O que é o botão Express (⚡)?
Um clique gera tudo: pesquisa + conteúdo + áudio + vídeo + thumbnail. Disponível no plano Creator+. Ideal para quem quer resultado rápido sem revisar cada etapa.

### Posso usar só para blog sem fazer vídeo?
Com certeza! Os créditos são flexíveis. Use 100% para blogs se quiser. Ou 100% para vídeos. Ou mix. Você decide.

### E se meus créditos acabarem antes do fim do mês?
Compre packs avulsos a partir de $3 (1.000 créditos). Sem upgrade de plano obrigatório.

### Posso clonar minha própria voz?
Sim, no plano Creator+. Envie uma amostra de 30 segundos e use sua voz em todas as narrações.

### Aceita PIX?
Sim! Aceitamos PIX, cartão de crédito e boleto bancário.

### O conteúdo gerado é meu?
100%. Todo conteúdo pertence a você. Exporte a qualquer momento, sem lock-in.

### Posso cancelar quando quiser?
Sim. Sem multa, sem burocracia. Cancele pelo dashboard em 1 clique.

---

## Notas para Implementação (apps/web)

### Estrutura de dados:

```typescript
interface PricingPlan {
  id: 'free' | 'starter' | 'creator' | 'pro'
  name: string
  tagline: string
  badge?: 'Popular'
  price: {
    monthly: { usd: number; brl: number }
    annual: { usd: number; brl: number }
  }
  credits: number  // créditos por mês
  prevPlan?: string  // "Everything in X, plus"
  features: string[]  // features listadas no card
  cta: { label: string; href: string; variant: 'primary' | 'outline' }
  trial?: { days: number }
  cardStyle?: 'default' | 'gradient'  // Pro tem gradient
}
```

### Layout inspiração: ElevenLabs
- 4 cards horizontais
- Free lista todas as features base
- Starter+ mostra "Everything in [anterior], plus"
- Creator tem badge "Popular"
- Pro tem card com fundo gradient
- Créditos em destaque no rodapé de cada card
- Toggle: Monthly / Annual (save 20%)
- Toggle: USD / BRL
- Tabela de comparação expandível abaixo
- FAQ com accordion
- Trust badges

### Mudanças vs. versão atual (apps/web):
1. ~~Starter~~ → **Free** ($0, 1K créditos)
2. Novo plano **Starter** ($9, 5K créditos)
3. ~~Pro $29~~ → **Creator** ($29, 15K créditos, badge Popular)
4. ~~Agency $99~~ → **Pro** ($99, 50K créditos, gradient card)
5. Adicionar Enterprise como seção simples abaixo
6. Adicionar toggle USD/BRL
7. Adicionar tabela de comparação
8. Adicionar FAQ
9. Atualizar features para incluir áudio, vídeo, YouTube Intelligence
10. Adicionar seção "How credits work" com exemplos visuais
