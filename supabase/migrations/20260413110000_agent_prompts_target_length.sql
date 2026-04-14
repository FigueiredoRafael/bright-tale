-- F2-047 — Agents must respect target length when present in input.

update public.agent_prompts
set instructions = instructions || E'

---

## CRITICAL — TARGET LENGTH (anexado pela F2-047)

O input pode conter `production_params.target_word_count` (número).
Se presente, o `body` / `content` final DEVE ter aproximadamente esse
número de palavras (±15%). Não inflate com encheção; estruture o
conteúdo pra atingir o tamanho com substância:

- 300 palavras → post curto, 1 ideia central + take prático
- 500–700 palavras → post médio, 2-3 sub-pontos com exemplos
- 1000+ palavras → post longo-form, sub-headings, exemplos múltiplos,
  estudos de caso, FAQ no final

Se o material da pesquisa é insuficiente pro target, retorne campo
`content_warning` em vez de inflar com placeholder. Nunca repita
parágrafos pra encher.
'
where slug = 'blog';

update public.agent_prompts
set instructions = instructions || E'

---

## CRITICAL — TARGET DURATION (anexado pela F2-047)

O input pode conter `production_params.target_duration_minutes` (número).
Se presente, ajuste o `teleprompter_script` pra esse alvo (regra de
ouro: ~150 palavras por minuto de fala natural):

- 3 min → ~450 palavras, 1 chapter + hook + outro
- 5 min → ~750 palavras, 2-3 chapters
- 8 min → ~1200 palavras, 3-4 chapters
- 10 min → ~1500 palavras, 4 chapters + affiliate segment
- 15 min → ~2250 palavras, 5-6 chapters, contra-argumento + FAQ
- 20+ min → deep-dive, 6+ chapters, multiple case studies

Calibre `chapters[]` count e profundidade pra atingir o tempo. Se o
material é insuficiente, retorne `content_warning` ao invés de
estender artificialmente. Não repita pontos.
'
where slug = 'video';

update public.agent_prompts
set instructions = instructions || E'

---

## CRITICAL — TARGET DURATION (anexado pela F2-047)

`production_params.target_duration_minutes` no input define o alvo do
podcast (~140 palavras/min de fala natural):

- 10 min → conversa curta, 2 tópicos
- 20 min → 4 tópicos com debate
- 30 min → entrevista profunda ou solo deep-dive
- 45+ min → multi-segment com intervalos

Estruture segments + duração de cada pra somar o target.
'
where slug = 'podcast';

update public.agent_prompts
set instructions = instructions || E'

---

## CRITICAL — TARGET DURATION (anexado pela F2-047)

Shorts são entre 15s e 60s. `production_params.target_duration_minutes`
(em décimos) define o alvo:

- 0.25 (15s) → 1 hook + 1 punchline, 35-40 palavras
- 0.5 (30s) → hook + 2 beats + CTA, 70-80 palavras
- 1.0 (60s) → estrutura completa de mini-narrativa, 140-150 palavras
'
where slug = 'shorts';
