'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLogger } from '@/lib/axiom/client';

interface UserContext {
  userId: string;
  email: string | null;
  orgId: string | null;
}

/**
 * Analytics hook that automatically attaches user context to every log.
 *
 * Usage:
 *   const analytics = useAnalytics();
 *   analytics.track('blog_metrics_refresh', { channelId, blogUrl });
 *
 * Every event will include: userId, email, orgId, timestamp, page URL.
 */
export function useAnalytics() {
  const log = useLogger();
  const [userCtx, setUserCtx] = useState<UserContext | null>(null);
  const ctxRef = useRef<UserContext | null>(null);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => {
      if (data.user) {
        const ctx: UserContext = {
          userId: data.user.id,
          email: data.user.email ?? null,
          orgId: data.user.user_metadata?.org_id ?? null,
        };
        setUserCtx(ctx);
        ctxRef.current = ctx;
      }
    });
  }, []);

  const track = useCallback(
    (event: string, properties?: Record<string, unknown>) => {
      const ctx = ctxRef.current;
      log.info(event, {
        ...ctx,
        url: typeof window !== 'undefined' ? window.location.pathname : undefined,
        ...properties,
      });
      log.flush();
    },
    [log],
  );

  const identify = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    log.info('user_identified', { ...ctx });
    log.flush();
  }, [log]);

  return { track, identify, user: userCtx };
}
