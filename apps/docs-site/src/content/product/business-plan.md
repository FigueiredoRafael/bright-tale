# Plano de Negócio

## Problema

Criadores de conteúdo enfrentam uma equação impossível: **produzir conteúdo de qualidade, em múltiplos formatos, com consistência, sem uma equipe grande**. O resultado é que a maioria publica pouco, perde relevância algorítmica e não consegue monetizar.

## Solução

BrightTale automatiza a produção de conteúdo multi-formato usando IA, transformando **1 tema em 5 formatos publicáveis** (blog, vídeo, shorts, podcast, engagement) com um pipeline inteligente de 4 agentes.

## Modelo de Negócio

### Revenue Streams

| Stream | Descrição | Timeline |
|---|---|---|
| **SaaS por assinatura** | Planos mensais/anuais com limites de tokens | MVP |
| **Token overages** | Pagar por tokens extras além do plano | v1.0 |
| **Afiliados** | Comissão sobre indicações de novos assinantes | v1.1 |
| **Marketplace de templates** | Templates premium criados pela comunidade | Futuro |
| **Whitelabel/API** | Agências usam BrightTale como backend | Futuro |

### Planos

| Plano | Público | Preço (estimativa) | Tokens/mês |
|---|---|---|---|
| **Free** | Experimentação | R$ 0 | Limitado (~5 projetos) |
| **Creator** | Criadores individuais | R$ 49-79/mês | Médio (~30 projetos) |
| **Pro** | Criadores sérios / freelancers | R$ 149-199/mês | Alto (~100 projetos) |
| **Agency** | Agências / equipes | R$ 399-599/mês | Muito alto + multi-user |
| **Enterprise** | Grandes operações | Sob consulta | Ilimitado + SLA + API |

### Unit Economics (projeção)

| Métrica | Estimativa |
|---|---|
| **Custo por projeto** | ~R$ 0,50-2,00 (API calls das IAs) |
| **Preço médio por projeto** | ~R$ 3-5 (no plano Creator) |
| **Margem bruta** | ~60-70% |
| **CAC estimado** | A definir (orgânico + afiliados) |
| **LTV alvo** | 6-12x CAC |

## Mercado

### TAM (Total Addressable Market)

- **Criadores de conteúdo no Brasil:** ~10M (YouTube, blogs, Instagram)
- **Que monetizam ou querem monetizar:** ~1-2M
- **Dispostos a pagar por ferramentas:** ~200-400K

### Concorrência

| Concorrente | Diferencial BrightTale |
|---|---|
| ChatGPT / Claude direto | BrightTale orquestra pipeline completo, não é chat genérico |
| Jasper / Copy.ai | Focados em copy curta; BrightTale faz conteúdo longo multi-formato |
| Descript / Opus Clip | Focados em edição de vídeo; BrightTale gera o script/roteiro |
| Notion AI / Gamma | Focados em documentos; BrightTale é pipeline de publicação |

### Vantagem Competitiva

1. **Pipeline multi-formato** — 1 tema → 5 formatos (ninguém faz isso integrado)
2. **Canonical Core** — Garante consistência entre formatos
3. **Agentes especializados** — Cada etapa tem IA otimizada (não é um prompt genérico)
4. **Publicação direta** — WordPress/YouTube integrado
5. **Preço para o mercado brasileiro** — Pricing em BRL, acessível

## Go-to-Market

### Fase 1: Validação (atual)

- Uso próprio para produzir conteúdo
- Feedback de 5-10 early adopters
- Refinar UX para leigos

### Fase 2: Beta Fechado

- Convites por indicação
- Plano "custo" para early adopters
- Coletar métricas de uso e retenção

### Fase 3: Lançamento Público

- Landing page com demo
- Afiliados como canal principal
- Content marketing (dogfooding — usar BrightTale para produzir conteúdo sobre BrightTale)
- SEO com blog posts gerados pela própria plataforma

### Fase 4: Escala

- API para integrações
- Marketplace de templates
- Multi-idioma (EN, ES)
- Parcerias com influenciadores

## Métricas-Chave

| Métrica | O que mede |
|---|---|
| **MRR** | Receita recorrente mensal |
| **Churn mensal** | % de cancelamentos |
| **Projetos/usuário/mês** | Engajamento |
| **Stage completion rate** | % de projetos que chegam ao Publish |
| **Time to first publish** | Tempo do signup até publicar |
| **NPS** | Satisfação |

## Riscos

| Risco | Mitigação |
|---|---|
| Custo de API das IAs sobe | Multi-provider (Claude, Gemini, GPT), negociar volume |
| Qualidade do conteúdo gerado cai | Agente de Review + human-in-the-loop |
| Concorrentes grandes copiam | Velocidade de execução + nicho BR |
| Regulamentação de IA | Transparência, watermarking, opt-out |
| Dependência de plataformas (YouTube, WordPress) | Suportar múltiplas plataformas de publicação |
