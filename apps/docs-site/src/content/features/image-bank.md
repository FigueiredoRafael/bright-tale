# Image Bank

Galeria global de todas as imagens geradas por IA.

## Funcionalidades

- Galeria com filtro, busca e preview
- Geração via Gemini Imagen
- Prompt Builder para criação standalone
- Download individual ou ZIP em massa
- Exclusão em massa
- Busca no Unsplash

## Componentes

| Componente | Descrição |
|---|---|
| `ImageBankCard` | Card de imagem na galeria |
| `ImageGenerationCard` | Formulário de geração |
| `PromptBuilder` | Builder de prompts |
| `UnsplashGrid` | Grid de resultados do Unsplash |

## Armazenamento

Imagens salvas localmente em `public/generated-images/` (gitignored).
Cada asset pode ser vinculado a um projeto (`project_id`) ou ser standalone (Image Bank).
