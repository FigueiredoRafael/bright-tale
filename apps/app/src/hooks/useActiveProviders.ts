import { useState, useEffect } from 'react';
import type { ProviderId } from '@/components/ai/ModelPicker';

const ALL_KNOWN: ProviderId[] = ['gemini', 'openai', 'anthropic', 'ollama', 'manual'];
const DEFAULT_PROVIDERS: ProviderId[] = ['gemini', 'openai', 'anthropic', 'ollama'];

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
          // Nothing configured yet → show all as fallback
          _cache = { providers: DEFAULT_PROVIDERS, fetchedAt: now };
          setProviders(DEFAULT_PROVIDERS);
        } else {
          // Respect DB faithfully — only show what's is_active=true
          const active = data
            .filter((p) => p.isActive && ALL_KNOWN.includes(p.provider as ProviderId))
            .map((p) => p.provider as ProviderId);

          const result = active.length > 0 ? active : DEFAULT_PROVIDERS;
          _cache = { providers: result, fetchedAt: now };
          setProviders(result);
        }
        setReady(true);
      })
      .catch(() => {
        // On error keep showing current (graceful degradation)
        setReady(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { providers, ready };
}
