'use client';

import { AlertTriangle } from 'lucide-react';

interface ContentWarningBannerProps {
  warning: string | null | undefined;
}

export function ContentWarningBanner({ warning }: ContentWarningBannerProps) {
  if (!warning) return null;
  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{warning}</span>
    </div>
  );
}
