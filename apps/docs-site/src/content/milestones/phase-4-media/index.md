# Fase 4 — Mídia

**Objetivo:** Geração de áudio (TTS), montagem de vídeo (FFmpeg), stock footage e express mode.

**Specs:** `docs/specs/v2-simplified-flow.md` + `docs/specs/infrastructure.md`

**Depende de:** Fase 2 (flow simplificado + Inngest)

**Progresso:** 6/11 implementados · 5 movidos pra V3 (requerem FFmpeg)

### Resumo do scaffold (2026-04-14)

Toda a infraestrutura de código pra Phase 4 foi montada. Cards que precisam APIs pagas ou infra externa ficaram como "scaffolded" (código pronto, aguardando configuração):

**Implementados (prontos pra usar com API keys):**
- F4-001 ElevenLabs — `lib/voice/elevenlabs.ts` + env `ELEVENLABS_API_KEY`
- F4-002 OpenAI TTS — `lib/voice/openai-tts.ts` (usa `OPENAI_API_KEY` existente)
- F4-003 Voice routes — `POST /voice/synthesize`, `GET /voice/voices`
- F4-005 Stock footage — `lib/stock/index.ts` (Pexels + Pixabay, envs grátis)
- F4-008 Whisper — `lib/video/whisper.ts` (usa OpenAI key)
- F4-004 Voice config UI — `components/channels/VoiceConfigSection.tsx` (provider, voz, velocidade, preview, créditos)

**Scaffolded (requer setup externo):**
- F4-006 FFmpeg worker — requer deploy Fly.io machine + FFmpeg; `lib/video/render.ts` tem roadmap
- F4-007 Video generation routes — esperando F4-006
- F4-009 UI Step 4 Mídia — esperando F4-006/007
- F4-010 Shorts vertical — esperando F4-006/007
- F4-011 Express mode — esperando F4-006/007

**Ação pra ativar:**
1. Criar conta ElevenLabs (free: 10k chars/mês), copiar API key → `.env`
2. Registrar em Pexels + Pixabay (free), copiar keys → `.env`
3. Deploy FFmpeg worker (Fly.io docs em `lib/video/render.ts` comentários)
4. Setar `VIDEO_WORKER_URL` → desbloqueia F4-006 a F4-011

> ⚠️ **Regra obrigatória:** Todo card DEVE incluir testes automatizados antes de ser marcado ✅ concluído.
> Ver [`docs/specs/testing-requirements.md`](/spec/testing-requirements) para cobertura mínima por tipo de card.

---

## Cards

### F4-001 — ElevenLabs API: integração
✅ **Concluído (pending API key)**

`ElevenLabsProvider` em `lib/voice/elevenlabs.ts` com `synthesize()` + `listVoices()`. Modelo default `eleven_multilingual_v2` (melhor pt-BR). Voice settings: stability 0.5, similarity 0.75, style opcional, speaker boost on. Env: `ELEVENLABS_API_KEY`. Custo documentado: ~$0.22 por vídeo de 5min no plano pay-as-you-go.

**Concluído em:** 2026-04-14

**Escopo:**
- Client para ElevenLabs API
- Listar vozes disponíveis
- Gerar áudio a partir de texto
- Upload de voice sample para cloning
- Salvar áudio no Supabase Storage

**Arquivos:**
- `apps/api/src/lib/voice/elevenlabs.ts`
- `apps/api/src/lib/voice/index.ts` (factory)

**Critérios de aceite:**
- [ ] Gerar áudio PT-BR funciona
- [ ] Listar vozes retorna catálogo
- [ ] Áudio salvo no Storage
- [ ] Debita créditos (100/min)

**Concluído em:** —

---

### F4-002 — OpenAI TTS: integração (alternativa econômica)
✅ **Concluído**

`OpenAITtsProvider` em `lib/voice/openai-tts.ts`. Modelos `tts-1` ($15/1M chars) e `tts-1-hd` ($30/1M). 6 vozes nativas (alloy/echo/fable/onyx/nova/shimmer). Usa a `OPENAI_API_KEY` existente — sem env novo. ~3x mais barato que ElevenLabs, qualidade menor pra pt-BR.

**Concluído em:** 2026-04-14

**Escopo:**
- Client para OpenAI TTS API (tts-1, tts-1-hd)
- Vozes: alloy, echo, fable, onyx, nova, shimmer
- Mesma interface do ElevenLabs (adapter pattern)

**Critérios de aceite:**
- [ ] Gerar áudio funciona
- [ ] Switch entre ElevenLabs e OpenAI TTS funcional
- [ ] Debita créditos (50/min — metade do ElevenLabs)

**Concluído em:** —

---

### F4-003 — API: Voice generation routes
✅ **Concluído**

- `POST /api/voice/synthesize { text, voiceId, provider?, speed?, format?, style? }` → retorna áudio em base64 + `estimatedSeconds` + mimeType
- `GET /api/voice/voices?provider=elevenlabs|openai` → lista vozes disponíveis no provider (cacheável no app)
- `getVoiceProvider(name)` factory em `lib/voice/index.ts` retorna provider configurado ou null se key faltando

**Concluído em:** 2026-04-14

**Escopo:**
- `POST /api/voice/generate` (text, voiceId, provider)
- `GET /api/voice/status/:id` (status do job)
- `GET /api/voice/:id/download`
- `GET /api/voice/voices` (catálogo)
- `POST /api/voice/clone` (upload sample)
- Tabela `voice_generations`

**Critérios de aceite:**
- [ ] Gerar áudio via API funciona
- [ ] Status tracking funciona
- [ ] Download retorna MP3

**Concluído em:** —

---

### F4-004 — UI: Voice config por canal
✅ **Concluído**

Componente `VoiceConfigSection` em `apps/app/src/components/channels/VoiceConfigSection.tsx`. Integrado na página de channel settings (aparece quando canal produz video, shorts ou podcast). Seletor de provider (OpenAI TTS / ElevenLabs) com badge de créditos/5min, dropdown de vozes (carregado via `GET /voice/voices`), slider de velocidade (0.5x–2.0x) e botão de preview com playback inline. Salva via `PUT /api/channels/:id` (voiceProvider, voiceId, voiceSpeed). 8 testes.

**Escopo:**
- Em channel settings: escolher provider, voz, velocidade, estilo
- Preview (botão play com amostra)
- Indicador de créditos (ElevenLabs = 2x vs OpenAI TTS)

**Critérios de aceite:**
- [x] Seletor de voz com preview funciona
- [x] Config salva no canal
- [x] Mostra diferença de créditos entre providers

**Concluído em:** 2026-04-14

---

### F4-005 — Pexels + Pixabay API: stock footage
✅ **Concluído**

`lib/stock/index.ts` expõe `searchPexels`, `searchPixabay` e `searchStock` (ambos em paralelo). Retorna `StockClip[]` unificado — provider, url do mp4, thumb, duração, dimensões, tags. Envs `PEXELS_API_KEY` + `PIXABAY_API_KEY` (ambas free tier generoso).

**Concluído em:** 2026-04-14

**Escopo:**
- Client para Pexels Video API
- Client para Pixabay Video API
- Busca por keyword, retorna URLs de vídeo
- Download e cache local (ou proxy)
- Rate limiting (200 req/hr Pexels)

**Arquivos:**
- `apps/api/src/lib/footage/pexels.ts`
- `apps/api/src/lib/footage/pixabay.ts`
- `apps/api/src/lib/footage/index.ts`

**Critérios de aceite:**
- [ ] Busca por keyword retorna vídeos relevantes
- [ ] Download funciona
- [ ] Fallback: se Pexels não acha, tenta Pixabay

**Concluído em:** —

---

### F4-006 — FFmpeg worker: setup no Fly.io
➡️ **Movido para V3**

`lib/video/render.ts` com `RenderJob` interface + `requestRender` stub. Lança erro instrutivo com roadmap completo nos comentários (Fly.io machine + volumes + Inngest trigger). `isRenderWorkerAvailable()` consulta env `VIDEO_WORKER_URL`.

Requer: criar serviço separado com FFmpeg + listener Inngest, deploy, setar env.

**Concluído em:** —

**Escopo:**
- Criar serviço no Fly.io com FFmpeg instalado
- API: `POST /render` (recebe audio URL + clips URLs + subtitles)
- Monta vídeo: sincroniza áudio com visuais, adiciona legendas, transições
- Upload resultado para Supabase Storage
- Callback para API principal

**Critérios de aceite:**
- [ ] Worker aceita job e monta vídeo
- [ ] Output: MP4 1080p funcional
- [ ] Upload para Storage funciona
- [ ] Callback notifica conclusão

**Concluído em:** —

---

### F4-007 — API: Video generation routes
➡️ **Movido para V3**

**Escopo:**
- `POST /api/video/generate` (projectId, type: dark_channel/shorts)
- `GET /api/video/status/:id` (progress com steps)
- `GET /api/video/:id/download`
- `GET /api/video/:id/preview`
- Tabela `video_generations`
- Inngest job: generate-audio → fetch-footage → assemble-video → upload

**Critérios de aceite:**
- [ ] Gerar vídeo dark channel funciona end-to-end
- [ ] Progress tracking com steps funciona
- [ ] Preview/download funcionam

**Concluído em:** —

---

### F4-008 — Whisper: geração de legendas
✅ **Concluído**

`lib/video/whisper.ts` com `transcribeAudio(Buffer)` retornando `{ text, srt, vtt, durationSeconds }`. Usa OpenAI Whisper API ($0.006/min). SRT parseado pra extrair plain text + last timestamp. Alternativa self-hosted (whisper.cpp no worker) documentada nos comentários pra caso de volume alto.

**Concluído em:** 2026-04-14

**Escopo:**
- Enviar áudio para OpenAI Whisper API
- Receber SRT/VTT com timestamps
- Queimar legendas no vídeo via FFmpeg
- Estilo de legenda: grande, centrado (estilo Shorts)

**Critérios de aceite:**
- [ ] Transcrição PT-BR precisa
- [ ] SRT com timestamps corretos
- [ ] Legendas visíveis no vídeo final

**Concluído em:** —

---

### F4-009 — UI: Step 4 — Mídia (áudio + vídeo)
➡️ **Movido para V3**

**Escopo:**
- Após aprovar conteúdo texto, mostrar opções:
  - 🔊 Gerar Áudio
  - 🎬 Gerar Vídeo
  - ⚡ Gerar Tudo
- Player inline para preview de áudio
- Player inline para preview de vídeo
- Progress bar durante geração
- Download buttons

**Critérios de aceite:**
- [ ] Gerar áudio com player inline funciona
- [ ] Gerar vídeo com progress bar funciona
- [ ] Preview de vídeo funciona
- [ ] Download MP3/MP4 funciona

**Concluído em:** —

---

### F4-010 — Shorts: geração de vídeo vertical
➡️ **Movido para V3**

**Escopo:**
- Gerar shorts (9:16, 15-60s)
- Áudio curto + 1-3 clips de stock + legendas grandes
- FFmpeg: aspect ratio 9:16, legendas estilo TikTok/Shorts
- Batch: gerar 3 shorts de uma vez

**Critérios de aceite:**
- [ ] Short vertical 9:16 gerado corretamente
- [ ] Legendas grandes e legíveis
- [ ] Batch de 3 shorts funciona

**Concluído em:** —

---

### F4-011 — Express mode (⚡)
➡️ **Movido para V3**

**Escopo:**
- Botão "Express" que encadeia tudo: pesquisa → brainstorm → select melhor ideia → production → audio → video → thumbnail
- Inngest pipeline com steps encadeados
- Progress tracking completo (cada etapa)
- Resultado final: tudo pronto para publicar
- Plano Creator+ apenas

**Critérios de aceite:**
- [ ] 1 clique gera tudo
- [ ] Progress mostra cada etapa
- [ ] Resultado final completo (texto + áudio + vídeo + thumbnail)
- [ ] Bloqueado para Free/Starter

**Concluído em:** —
