-- F2-046 — Video agent must produce a complete YouTube package, not just a script.
-- Adds 4 required top-level fields and forces substantive content length.
-- The user kept getting 3-line scripts after waiting 2+ minutes — unacceptable.

update public.agent_prompts
set instructions = instructions || E'

---

## CRITICAL — COMPLETE YOUTUBE PACKAGE (anexado pela F2-046)

Além de `teleprompter_script` e `editor_script` (F2-045), o output DEVE
incluir, no top-level do JSON:

### 3. `video_title` (objeto)

```yaml
video_title:
  primary: "Título principal — máx 60 chars, com hook + curiosity gap"
  alternatives:
    - "Alternativa 1 — variação A/B test"
    - "Alternativa 2 — outro ângulo"
    - "Alternativa 3 — abordagem mais clickbait"
```

Cada título deve ter número, palavra forte (segredo, erro, verdade,
revolução, etc) ou estatística surpreendente. SEMPRE em pt-BR a menos
que o canal seja em outro idioma.

### 4. `thumbnail_ideas` (array de 3-5 objetos)

```yaml
thumbnail_ideas:
  - concept: "Descrição visual: pessoa surpresa apontando pra gráfico subindo"
    text_overlay: "73% FALHAM"
    emotion: "shock"
    color_palette: "vermelho vibrante + branco, alto contraste"
    composition: "rule of thirds, rosto à esquerda, gráfico à direita"
  - concept: "..."
    ...
```

Cada thumbnail deve ser visualmente distinta. Pense em CTR — qual faria
o usuário PARAR de scrollar.

### 5. `pinned_comment` (string)

Comentário pra fixar no vídeo que GERA engajamento. NÃO pode ser genérico
("deixa seu like!"). Deve:
- Fazer uma pergunta específica relacionada ao tema
- Ou pedir uma opinião polêmica
- Ou compartilhar um insight extra que NÃO tá no vídeo
- Ou dar um desafio prático

Exemplo bom: "Qual dessas 3 estratégias você acha que dá mais resultado
no longo prazo? Eu pessoalmente uso a #2, mas curioso pra saber qual
funcionou aí. Comenta o número 👇"

Exemplo ruim: "Curtam o vídeo!" ❌

### 6. `video_description` (string, multiline)

Descrição completa pro YouTube com:
- Parágrafo 1 (gancho, 2-3 frases): por que assistir
- Lista de tópicos cobertos com timestamps `00:00 - Hook`, `01:30 - ...`
- Links/recursos mencionados (placeholder se não houver)
- CTAs: inscreva-se, ative o sininho, siga em outras redes
- Hashtags relevantes (#tema, #nicho, etc)

Mínimo 800 caracteres. Descrições curtas matam discoverability no
algoritmo do YouTube.

---

## CRITICAL — CONTEÚDO SUBSTANTIVO (anexado pela F2-046)

`teleprompter_script` DEVE ter no MÍNIMO 1500 caracteres. Roteiros de
3 linhas são INACEITÁVEIS — o usuário gastou créditos esperando um
vídeo completo. Se você não tem material suficiente vindo do
canonical_core/research, EXPANDA com:

- Contexto histórico relevante
- Exemplos concretos com nomes/empresas/anos
- Comparações ("é como X, mas em vez de Y, faz Z")
- Estatísticas com fonte
- Estudos de caso curtos
- Citações de especialistas
- Aplicação prática step-by-step

Cada chapter do `chapters[]` deve ter content de pelo menos 300
caracteres (3-4 parágrafos). NÃO entregue um esqueleto vazio.

Se mesmo expandindo o roteiro fica curto pro tempo de vídeo alvo,
inclua um campo `content_warning` no output dizendo "Material
insuficiente: pesquisa só forneceu N pontos, considere fazer uma
pesquisa Deep antes de produzir."
'
where slug = 'video';
