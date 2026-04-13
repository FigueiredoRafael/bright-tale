/**
 * Convert raw provider/API errors into something a human can act on.
 * Returns a short title + optional hint (next step the user can take).
 */
export interface FriendlyError {
    title: string;
    hint?: string;
}

export function friendlyAiError(raw: string): FriendlyError {
    const lower = raw.toLowerCase();

    // Gemini free-tier quota
    if (lower.includes('resource_exhausted') || (lower.includes('quota') && lower.includes('gemini'))) {
        return {
            title: 'Quota do Gemini free atingida',
            hint: 'Aguarde ~1 min (limite por minuto) ou troque pro Gemini 2.5 Pro / outro provider.',
        };
    }
    if (lower.includes('quota') || lower.includes('resource_exhausted')) {
        return {
            title: 'Quota do provider esgotada',
            hint: 'Espere alguns minutos ou troque o provider/modelo.',
        };
    }

    // Anthropic / OpenAI billing
    if (lower.includes('credit balance') || lower.includes('insufficient') || lower.includes('billing')) {
        return {
            title: 'Conta sem saldo nesse provider',
            hint: 'Adicione crédito na conta ou troque pra outro provider (Gemini é grátis).',
        };
    }

    // Rate limit (generic)
    if (lower.includes('429') || lower.includes('rate limit')) {
        return {
            title: 'Muitas requisições',
            hint: 'Aguarde alguns segundos antes de tentar de novo.',
        };
    }

    // Capacity
    if (lower.includes('overloaded') || lower.includes('unavailable') || lower.includes('high demand')) {
        return {
            title: 'Modelo sobrecarregado',
            hint: 'O provider está com pico de uso. Tente de novo em segundos ou troque o modelo.',
        };
    }

    // Network
    if (lower.includes('econn') || lower.includes('etimedout') || lower.includes('socket hang up') || lower.includes('network')) {
        return {
            title: 'Falha de rede',
            hint: 'Verifique se a API (npm run dev:api) está rodando.',
        };
    }

    // Auth
    if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid api key')) {
        return {
            title: 'API key inválida',
            hint: 'Confira a key do provider em apps/api/.env.local.',
        };
    }

    // Validation
    if (lower.includes('400') || lower.includes('validation') || lower.includes('invalid')) {
        return { title: 'Requisição inválida', hint: 'Reporta esse erro ou tenta com outro modelo.' };
    }

    // Fallback: trim long messages
    const short = raw.length > 140 ? raw.slice(0, 140) + '…' : raw;
    return { title: short };
}
