---
title: Infrastructure — Storage, Queues, Email, Rate Limiting, Observability
status: draft
milestone: v2.0
author: Rafael
date: 2026-04-11
points: TBD
---

# Infrastructure

## 1. Storage de Mídia

### Problema
Hoje imagens ficam em `public/generated-images/` (filesystem local). Não escala, não funciona em serverless (Vercel), não tem CDN.

### Solução: Supabase Storage

| Bucket | Conteúdo | Acesso |
|---|---|---|
| `images` | Imagens geradas (Imagen, DALL-E) | Org members |
| `audio` | Narrações TTS (MP3/WAV) | Org members |
| `video` | Vídeos montados (MP4) | Org members |
| `thumbnails` | Thumbnails geradas | Org members |
| `exports` | ZIPs de export | Org members (temporário, 24h TTL) |
| `voice-samples` | Amostras para voice cloning | Org members |

### Policies (RLS no Storage)

```sql
-- Membros da org podem ler assets da org
CREATE POLICY "org_members_read_assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id IN ('images', 'audio', 'video', 'thumbnails')
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM organizations 
      WHERE id IN (
        SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
      )
    )
  );

-- Membros (não viewers) podem fazer upload
CREATE POLICY "org_members_upload_assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id IN ('images', 'audio', 'video', 'thumbnails')
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM org_memberships 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'member')
    )
  );
```

### Estrutura de Pastas

```
images/
  {org_id}/
    {project_id}/
      hero-image-001.png
      section-2-image.png
    standalone/
      image-bank-001.png

audio/
  {org_id}/
    {project_id}/
      narration-full.mp3
      narration-intro.mp3

video/
  {org_id}/
    {project_id}/
      final-1080p.mp4
      preview-720p.mp4
      subtitles.srt
```

### CDN

Supabase Storage tem CDN integrado. URLs:
```
https://{project}.supabase.co/storage/v1/object/public/images/{org_id}/{file}
```

Para assets privados (autenticados):
```
https://{project}.supabase.co/storage/v1/object/authenticated/audio/{org_id}/{file}
```

### Alternativa: Cloudflare R2

Se Supabase Storage ficar caro em volume:
- R2: $0.015/GB/mês (sem egress fees)
- S3 compatible API
- Workers para autenticação

---

## 2. Job Queue (Background Processing)

### Problema
Gerar vídeo leva 2-10 minutos. Gerar áudio leva 10-30 segundos. Não pode bloquear o request HTTP.

### Solução: Inngest (recomendado) ou BullMQ

#### Inngest (serverless-friendly)

```typescript
// Define o job
const generateVideo = inngest.createFunction(
  { id: 'generate-video', retries: 3 },
  { event: 'video/generate.requested' },
  async ({ event, step }) => {
    const { projectId, orgId, userId } = event.data
    
    // Step 1: Gerar áudio
    const audio = await step.run('generate-audio', async () => {
      return await generateTTS(event.data.script, event.data.voiceConfig)
    })
    
    // Step 2: Buscar stock footage
    const footage = await step.run('fetch-footage', async () => {
      return await fetchStockFootage(event.data.brollMarkers)
    })
    
    // Step 3: Gerar imagens IA
    const images = await step.run('generate-images', async () => {
      return await generateImages(event.data.imagePrompts)
    })
    
    // Step 4: Montar vídeo (FFmpeg)
    const video = await step.run('assemble-video', async () => {
      return await assembleVideo({ audio, footage, images })
    })
    
    // Step 5: Upload
    await step.run('upload-video', async () => {
      return await uploadToStorage(orgId, projectId, video)
    })
    
    // Step 6: Atualizar status
    await step.run('update-status', async () => {
      await updateVideoGeneration(event.data.generationId, {
        status: 'ready',
        videoUrl: video.url,
        durationSeconds: video.duration,
      })
    })
  }
)

// Disparar o job
await inngest.send({
  name: 'video/generate.requested',
  data: { projectId, orgId, userId, script, voiceConfig, brollMarkers }
})
```

#### Status Tracking (para o frontend)

```typescript
// GET /api/video/status/:id
{
  "data": {
    "id": "uuid",
    "status": "assembling",  // pending → generating_audio → fetching_footage → assembling → uploading → ready
    "progress": 65,          // 0-100
    "currentStep": "Montando vídeo...",
    "estimatedTimeRemaining": 45,  // segundos
    "steps": [
      { "name": "Gerando áudio", "status": "completed", "duration": 12 },
      { "name": "Buscando footage", "status": "completed", "duration": 5 },
      { "name": "Gerando imagens", "status": "completed", "duration": 8 },
      { "name": "Montando vídeo", "status": "in_progress", "progress": 40 },
      { "name": "Finalizando", "status": "pending" }
    ]
  }
}
```

#### Frontend: Progress Bar

```
┌────────────────────────────────────────────────────────┐
│  🎬 Gerando vídeo: "Deep Work para Devs"              │
│                                                        │
│  ████████████████████░░░░░░░░░░ 65%                   │
│                                                        │
│  ✅ Gerando áudio (12s)                                │
│  ✅ Buscando footage (5s)                              │
│  ✅ Gerando imagens (8s)                               │
│  ⏳ Montando vídeo... (40%)                            │
│  ○ Finalizando                                         │
│                                                        │
│  Tempo estimado: ~45s                                  │
│                                                        │
│  Você pode sair desta página — avisaremos quando       │
│  estiver pronto.                                       │
└────────────────────────────────────────────────────────┘
```

### Jobs que precisam de queue

| Job | Duração estimada | Retries |
|---|---|---|
| `video/generate` | 2-10 min | 3 |
| `audio/generate` | 10-30s | 3 |
| `youtube/analyze-niche` | 30-60s | 2 |
| `youtube/analyze-references` | 1-3 min | 2 |
| `content/bulk-generate` | 1-5 min | 2 |
| `export/create-zip` | 30-60s | 2 |
| `publish/youtube-upload` | 1-5 min | 3 |

---

## 3. Email Transacional

### Provider: Resend (recomendado) ou SendGrid

| Email | Trigger | Template |
|---|---|---|
| **Welcome** | Signup | "Bem-vindo ao BrightTale" |
| **Invite** | Membro convidado | "Você foi convidado para [Org]" + magic link |
| **Credit alert (80%)** | 80% dos créditos usados | "Seus créditos estão acabando" |
| **Credit alert (100%)** | Créditos esgotados | "Créditos esgotados — upgrade ou add-on" |
| **Video ready** | Vídeo gerado com sucesso | "Seu vídeo está pronto! [link]" |
| **Payment receipt** | invoice.paid | "Recibo de pagamento — [plano] [valor]" |
| **Payment failed** | invoice.payment_failed | "Pagamento falhou — atualize seu cartão" |
| **Trial ending** | 3 dias antes do trial acabar | "Seu trial acaba em 3 dias" |
| **Subscription cancelled** | Cancelamento | "Sua assinatura foi cancelada" |
| **Reference alert** | Referência postou vídeo viral | "[Canal] postou um vídeo que fez X views" |

### Variáveis de Ambiente

```
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@brighttale.io
```

---

## 4. Rate Limiting

### Por Plano

| Plano | Requests/min | Concurrent jobs |
|---|---|---|
| Free | 30 | 1 |
| Starter | 60 | 2 |
| Creator | 120 | 5 |
| Pro | 300 | 10 |

### Implementação

```typescript
// Middleware usando Upstash Redis (serverless-friendly)
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, '1 m'),  // ajustar por plano
})

// No middleware
const { success, limit, remaining, reset } = await ratelimit.limit(orgId)
if (!success) {
  return fail(res, 429, { code: 'RATE_LIMITED', message: 'Too many requests' })
}
res.setHeader('X-RateLimit-Limit', limit)
res.setHeader('X-RateLimit-Remaining', remaining)
res.setHeader('X-RateLimit-Reset', reset)
```

### Variáveis de Ambiente

```
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

---

## 5. Observability

### Sentry (error tracking)

```
SENTRY_DSN=https://...@sentry.io/...
```

- Captura erros em apps/app e apps/api
- Source maps para stack traces legíveis
- Performance monitoring (slow requests)
- Alertas para erros novos

### Logs Estruturados

```typescript
// Usando Pino (já compatível com Vercel)
import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
})

// Exemplo
logger.info({
  action: 'video.generate',
  orgId,
  userId,
  projectId,
  credits: 1000,
  duration: 245,  // seconds
}, 'Video generated successfully')
```

### Métricas (Vercel Analytics ou Datadog)

| Métrica | Tipo | Alerta |
|---|---|---|
| API response time (p95) | Gauge | > 2s |
| Credit usage rate | Counter | > 90% do plano |
| Job failure rate | Rate | > 5% |
| Video generation time | Histogram | > 10 min |
| Active users (DAU) | Counter | — |
| Revenue (MRR) | Gauge | — |

### Request Tracing

Já existe `x-request-id` no middleware. Propagar para:
- Logs
- Sentry breadcrumbs
- Job metadata
- External API calls

---

## 6. FFmpeg Server

### Problema
FFmpeg não roda em serverless (Vercel). Precisa de um server persistente para montagem de vídeo.

### Opções

| Opção | Custo | Prós | Contras |
|---|---|---|---|
| **Fly.io** (recomendado) | $5-20/mês | Simples, escala, GPU opcional | Mais um serviço |
| **Railway** | ~$5-20/mês | Deploy fácil | Menos controle |
| **VPS (Hetzner)** | €4-8/mês | Barato, controle total | Manutenção manual |
| **AWS Lambda + Layer** | Pay per use | Serverless | Limite de 15 min, complexo |
| **Modal** | Pay per use | GPU, serverless | Mais caro por uso |

### Arquitetura

```
apps/api (Vercel)
    ↓ enqueue job
Inngest / BullMQ
    ↓ process job
Video Worker (Fly.io)
    ├── Recebe job (script + audio URL + footage URLs)
    ├── Download assets
    ├── FFmpeg montagem
    ├── Upload para Supabase Storage
    └── Callback para API (job done)
```

### Video Worker API (interno)

```
POST /render
{
  "jobId": "uuid",
  "audio": { "url": "https://storage.../narration.mp3" },
  "clips": [
    { "url": "https://pexels.com/...", "start": 0, "duration": 10 },
    { "url": "https://storage.../image1.png", "start": 10, "duration": 5 },
  ],
  "subtitles": { "srt": "1\n00:00:00,000 --> 00:00:05,000\nOlá..." },
  "output": {
    "resolution": "1080p",
    "aspect": "16:9",
    "format": "mp4"
  },
  "callbackUrl": "https://api.brighttale.io/api/webhooks/video-ready"
}
```

---

## 7. Variáveis de Ambiente (consolidadas)

```env
# === Auth ===
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_URL=

# === App ↔ API ===
INTERNAL_API_KEY=
API_URL=
ENCRYPTION_SECRET=

# === Stripe ===
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# === AI Providers ===
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_AI_API_KEY=

# === Voice ===
ELEVENLABS_API_KEY=

# === YouTube ===
YOUTUBE_DATA_API_KEY=

# === Video Worker ===
VIDEO_WORKER_URL=https://video-worker.fly.dev
VIDEO_WORKER_SECRET=

# === Storage ===
# (uses Supabase Storage — same env vars)

# === Queue ===
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# === Rate Limiting ===
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# === Email ===
RESEND_API_KEY=
EMAIL_FROM=noreply@brighttale.io

# === Observability ===
SENTRY_DSN=
LOG_LEVEL=info

# === Mercado Pago (BR) ===
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=
```

---

## 8. Segurança Adicional

| Item | Implementação |
|---|---|
| CSRF protection | Next.js built-in (App Router) |
| Content Security Policy | Headers no Vercel config |
| API key rotation | Suporte a múltiplas keys ativas |
| Webhook signature validation | Stripe/MercadoPago verify signature |
| File upload validation | Mime type + size limits no Storage |
| SQL injection | Supabase client (parameterized queries) |
| XSS | React (auto-escape) + CSP headers |
| Secrets management | Vercel env vars (encrypted) |

---

## 9. Legal

| Documento | Status | Nota |
|---|---|---|
| Terms of Service | 🔲 A criar | Obrigatório antes de cobrar |
| Privacy Policy | 🔲 A criar | LGPD + GDPR |
| Cookie Policy | 🔲 A criar | Se usar analytics |
| Acceptable Use Policy | 🔲 A criar | IA usage guidelines |
| Refund Policy | 🔲 A criar | Stripe requer |
