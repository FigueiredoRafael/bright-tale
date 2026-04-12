# Providers de IA

## Providers Suportados

| Provider | Uso | Status |
|---|---|---|
| **OpenAI** | Geração de texto (GPT) | ✅ Implementado |
| **Anthropic** | Geração de texto (Claude) | ✅ Implementado |
| **Gemini Imagen** | Geração de imagens | ✅ Implementado |
| **Mock** | Desenvolvimento/testes | ✅ Implementado |

## Prioridade de Configuração

1. `AI_ENABLED=false` → usa mock (para dev/testes)
2. `AI_PROVIDER` env var → `openai` | `anthropic` | `mock`
3. Config no banco (`ai_provider_configs` com `is_active=true`)
4. Fallback → mock

## Adapter Pattern

```
AIProvider (interface)
  ├── OpenAIProvider
  ├── AnthropicProvider
  ├── GeminiImagenProvider
  └── MockProvider
        ↓
ProviderAIAdapter (wrapper)
        ↓
AIAdapter (abstração usada pelo app)
```

**Arquivos:**
- `apps/api/src/lib/ai/index.ts` — Factory
- `apps/api/src/lib/ai/providers/openai.ts`
- `apps/api/src/lib/ai/providers/anthropic.ts`
- `apps/api/src/lib/ai/providers/gemini-imagen.ts`
- `apps/api/src/lib/ai/providers/mock.ts`

## Configuração via UI

Usuários configuram providers em **Settings > AI**:
- Provider (OpenAI / Anthropic)
- API Key (encriptada com AES-256-GCM antes de salvar)
- Modelo padrão
- Ativo/inativo

Tabela: `ai_provider_configs`

## Geração de Imagens

Configuração separada em **Settings > Image Generation**:
- Provider: Gemini Imagen
- Modelos: `gemini-2.5-flash-image` (recomendado), `imagen-3.0-generate-002`
- API Key

Tabela: `image_generator_configs`

## Feature Flags

| Flag | Descrição | Default |
|---|---|---|
| `AI_ENABLED` | Habilita/desabilita toda IA | `true` |
| `AI_PROVIDER` | Provider padrão | `mock` |
