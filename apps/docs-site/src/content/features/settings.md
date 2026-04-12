# Settings

Configurações do sistema.

## Páginas

| Rota | Descrição |
|---|---|
| `/settings/ai` | Providers de IA (Anthropic, OpenAI) |
| `/settings/image-generation` | Gemini Imagen config |
| `/settings/wordpress` | Credenciais WordPress |
| `/settings/agents` | Ver/editar prompts dos agentes |

## AI Providers

- Configurar API keys (encriptadas no banco)
- Escolher provider ativo
- Escolher modelo padrão

## Image Generation

- Configurar Gemini Imagen
- Modelos: `gemini-2.5-flash-image`, `imagen-3.0-generate-002`

## Agent Prompts

- Visualizar e editar system prompts dos 4 agentes
- Cada agente tem: name, slug, stage, instructions, input/output schema
