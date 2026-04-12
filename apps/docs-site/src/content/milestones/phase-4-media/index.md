# Fase 4 — Mídia

**Objetivo:** Geração de áudio (TTS), montagem de vídeo (FFmpeg), stock footage e express mode.

**Specs:** `docs/specs/v2-simplified-flow.md` + `docs/specs/infrastructure.md`

**Depende de:** Fase 2 (flow simplificado + Inngest)

**Progresso:** 0/11 concluídos

---

## Cards

### F4-001 — ElevenLabs API: integração
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

**Escopo:**
- Em channel settings: escolher provider, voz, velocidade, estilo
- Preview (botão play com amostra)
- Indicador de créditos (ElevenLabs = 2x vs OpenAI TTS)

**Critérios de aceite:**
- [ ] Seletor de voz com preview funciona
- [ ] Config salva no canal
- [ ] Mostra diferença de créditos entre providers

**Concluído em:** —

---

### F4-005 — Pexels + Pixabay API: stock footage
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
