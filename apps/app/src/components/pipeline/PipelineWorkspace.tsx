'use client';

import { useSearchParams } from 'next/navigation';
import { FocusSidebar } from './FocusSidebar';
import { FocusPanel } from './FocusPanel';
import { GraphView } from './GraphView';
import { ViewToggle } from './ViewToggle';

// ─── PipelineWorkspace ────────────────────────────────────────────────────────
// Layout host that reads ?view= and renders either the Focus layout
// (FocusSidebar + FocusPanel) or the Graph layout (GraphView).
// ViewToggle is always shown in the header.

interface Props {
  projectId: string;
}

export function PipelineWorkspace({ projectId }: Props) {
  const searchParams = useSearchParams();
  const isGraph = searchParams.get('view') === 'graph';

  return (
    <div data-testid="pipeline-workspace" className="flex flex-col h-full min-h-0">
      {/* Header row with toggle */}
      <div className="flex items-center justify-end px-6 py-2 border-b border-border shrink-0">
        <ViewToggle />
      </div>

      {/* Body */}
      {isGraph ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <GraphView projectId={projectId} />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-56 shrink-0 border-r border-border overflow-y-auto">
            <FocusSidebar projectId={projectId} />
          </aside>
          {/* Main panel */}
          <main className="flex-1 overflow-y-auto">
            <FocusPanel projectId={projectId} />
          </main>
        </div>
      )}
    </div>
  );
}
