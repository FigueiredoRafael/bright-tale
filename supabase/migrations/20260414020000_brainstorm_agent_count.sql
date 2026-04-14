-- F2-037 — Brainstorm agent honors target count.
-- Anexa diretiva de cap explícito ao prompt existente.

update public.agent_prompts
set instructions = instructions || E'

---

## CRITICAL — TARGET COUNT (anexado pela F2-037)

`input.target_count` (número, 3-10) quando presente define **exatamente** quantas
ideias o output deve conter. Regras:

- Produza `target_count` ideias, nem uma a mais, nem a menos.
- Se o tema fornecer menos contexto do que o alvo pede, mesmo assim entregue
  `target_count` ideias variando ângulos (técnico, business, ético, pessoal,
  educacional, etc) em vez de repetir a mesma tese.
- **NÃO** invente placeholders como "Ideia 6 — a definir". Cada ideia precisa
  ser útil e distinta.
- Se realmente não há material pra N ideias distintas (ex. nicho ultra-estreito
  + count=10), emita um campo top-level `content_warning: "..."` explicando
  e ainda assim entregue o máximo que conseguir sem repetir.

O campo `count` em outputs anteriores (ex. 5 fixo) é ignorado — use `target_count`
do input.
'
where slug = 'brainstorm';
