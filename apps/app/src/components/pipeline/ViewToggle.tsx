'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

// ─── ViewToggle ────────────────────────────────────────────────────────────────
// Pill control with Focus | Graph buttons. Clicking updates ?view= on the URL
// using router.replace (preserving all other params).

type ViewMode = 'focus' | 'graph';

export function ViewToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentView: ViewMode = searchParams.get('view') === 'graph' ? 'graph' : 'focus';

  function handleSwitch(view: ViewMode) {
    if (view === currentView) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('view', view);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div
      data-testid="view-toggle"
      className="inline-flex items-center rounded-full border border-border bg-background p-0.5 gap-0.5"
    >
      <button
        data-testid="view-toggle-focus"
        data-active={String(currentView === 'focus')}
        onClick={() => handleSwitch('focus')}
        className={[
          'rounded-full px-3 py-1 text-xs font-medium transition-colors',
          currentView === 'focus'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        ].join(' ')}
      >
        Focus
      </button>
      <button
        data-testid="view-toggle-graph"
        data-active={String(currentView === 'graph')}
        onClick={() => handleSwitch('graph')}
        className={[
          'rounded-full px-3 py-1 text-xs font-medium transition-colors',
          currentView === 'graph'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        ].join(' ')}
      >
        Graph
      </button>
    </div>
  );
}
