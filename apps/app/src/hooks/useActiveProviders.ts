import { useState, useEffect } from 'react';
import type { ProviderId } from '@/components/ai/ModelPicker';

const CLOUD_PROVIDERS: ProviderId[] = ['gemini', 'openai', 'anthropic'];
const DEFAULT_PROVIDERS: ProviderId[] = [...CLOUD_PROVIDERS, 'ollama'];

// Module-level cache shared across all hook instances (TTL: 60s)
let _cache: { providers: ProviderId[]; fetchedAt: number } | null = null;

function isCacheValid() {
  return _cache !== null && Date.now() - _cache.fetchedAt < 60_000;
}

export function useActiveProviders(): { providers: ProviderId[]; ready: boolean } {
  const [providers, setProviders] = useState<ProviderId[]>(
    () => _cache?.providers ?? DEFAULT_PROVIDERS,
  );
  const [ready, setReady] = useState<boolean>(() => isCacheValid());

  useEffect(() => {
    if (ready) return;

    fetch('/api/ai-providers')
      .then((r) => r.json())
      .then(({ data }: { data: { isActive: boolean; provider: string }[] | null }) => {
        const now = Date.now();
        if (!Array.isArray(data) || data.length === 0) {
          _cache = { providers: DEFAULT_PROVIDERS, fetchedAt: now };
          setProviders(DEFAULT_PROVIDERS);
        } else {
          const activeCloud = data
            .filter((p) => p.isActive && CLOUD_PROVIDERS.includes(p.provider as ProviderId))
            .map((p) => p.provider as ProviderId);

          // Ollama is local — always include alongside any active cloud provider
          // Fall back to all providers when nothing is configured
          const result: ProviderId[] = activeCloud.length > 0
            ? [...activeCloud, 'ollama']
            : DEFAULT_PROVIDERS;

          _cache = { providers: result, fetchedAt: now };
          setProviders(result);
        }
        setReady(true);
      })
      .catch(() => {
        // On error keep showing all providers (graceful degradation)
        setReady(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { providers, ready };
}
