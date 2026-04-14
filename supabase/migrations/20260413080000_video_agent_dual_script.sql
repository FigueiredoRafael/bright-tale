-- F2-045 — Video agent must produce TWO distinct scripts:
--   1. teleprompter_script  → clean narration (apenas o que o apresentador fala)
--   2. editor_script        → guia pro editor com A-roll/B-roll/efeitos/música
--
-- Appends a strong directive to the existing video agent prompt rather than
-- rewriting it (the original is hundreds of lines and well-tuned).

update public.agent_prompts
set instructions = instructions || E'

---

## CRITICAL — DUAL OUTPUT REQUIREMENT (anexado pela F2-045)

O output do agente DEVE conter, no top-level do JSON, DOIS scripts distintos
além das estruturas existentes (chapters, hook, etc):

### 1. `teleprompter_script` (string, multiline)

Roteiro LIMPO pro apresentador ler em ordem, sem cues de produção. Tom natural,
transições claras entre seções, parágrafos curtos. NADA de [colchetes], NADA
de marcações de B-roll, sound effects ou TEXT overlays — só o que sai da boca
do apresentador. Pense num teleprompter: fluxo contínuo do hook ao outro,
todas as transições escritas como falas reais.

Exemplo de formato:

```
[HOOK — 0:00]
Você sabia que 73% das pessoas que tentam X falham por causa de uma única
decisão errada nos primeiros minutos? Hoje a gente descobre qual é.

[INTRODUÇÃO — 0:15]
Eu sou o Rafael, e nesse vídeo a gente vai cobrir...

[CAPÍTULO 1 — 1:00]
...
```

### 2. `editor_script` (array de cenas, OU string markdown estruturado)

Roteiro pro EDITOR de vídeo, anotado como faria um editor-chefe sênior. Para
cada bloco do vídeo, descreva em detalhe:

- **A-roll**: o que aparece (apresentador talking head, ângulo, framing)
- **B-roll**: imagens/clipes/screen recordings sugeridos com timestamp do A-roll
  que devem cobrir (`"0:23–0:31 → b-roll de [descrição da cena ideal]"`)
- **C-roll** (se aplicável): metragem extra/transição
- **Lower-thirds / text overlays**: `[TEXT: "73% falham"]` com timing
- **Sound effects**: SFX específicos (`[SFX: whoosh ao trocar de cena]`)
- **Background music**: mood/intensidade (`[BGM: pulsante, sobe no hook,
  abaixa na intro]`)
- **Efeitos visuais**: zoom, jump cut, split screen, freeze frame, etc com
  motivo (`[FX: jump cut + zoom in pra ênfase]`)
- **Transições**: cortes secos, fade, match cut, etc
- **Pacing notes**: onde acelerar (cortes mais frequentes), onde respirar
- **Cor / mood**: ajustes de color grading sugeridos por seção

Trate como um briefing pra um editor que NÃO esteve no shoot. Seja específico
sobre o porquê de cada decisão (não só "adicione zoom", mas "zoom in lento
em 0:14 pra puxar atenção pro estatística"). Pense como um chief editor
guiando um editor júnior.

Exemplo de formato:

```
## SEÇÃO 1 — HOOK (0:00–0:10)

A-ROLL
- Talking head, framing close-up (peito pra cima), olhar direto pra câmera

B-ROLL
- 0:02–0:05 → cutaway com gráfico animado mostrando "73%"
- 0:05–0:08 → b-roll de pessoas frustradas/estressadas (stock ou shot do canal)

TEXT OVERLAYS
- 0:00 → [TEXT GRANDE: "73% FALHAM"] em destaque
- 0:08 → [TEXT pequeno: "Por quê?"]

SFX / BGM
- [SFX: whoosh suave em 0:00 quando o número aparece]
- [BGM: track pulsante, intensidade alta nos primeiros 5s, depois desce]

EFEITOS / EDIÇÃO
- Jump cut em 0:03 pra dar energia
- Zoom in lento (1.05x → 1.15x) ao longo do hook pra criar tensão
- Color: levemente saturado, contraste alto (mood "atenção")

PACING
- Hook bem cortado, evitar respiros longos. Cada frase precisa ter B-roll
  ou TEXT visual pra prender o scroll-stopper.
```

Se o output existente já tem `chapters[].b_roll_suggestions` e `sound_effects`,
**reuse essas informações** ao montar o `editor_script` em vez de duplicar
inconsistente.

**Os dois scripts são OBRIGATÓRIOS.** Sem `teleprompter_script` E sem
`editor_script`, o output é inválido.
'
where slug = 'video';
