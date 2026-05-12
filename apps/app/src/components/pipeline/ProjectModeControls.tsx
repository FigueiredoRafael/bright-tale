"use client";

/**
 * <ProjectModeControls> — top-level toggles that drive the orchestrator:
 *
 *   Mode    autopilot ↔ manual     (writes projects.mode)
 *   Paused  on ↔ off               (writes projects.paused)
 *
 * View (overview ↔ supervised) is UI-only and lives in localStorage; it
 * is NOT a server concern, so this component intentionally does not
 * expose it. The dashboard-level <ProjectViewToggle> (a follow-up) owns
 * that bit.
 */
import { useState } from 'react';

interface ProjectModeControlsProps {
  projectId: string;
  initialMode: 'autopilot' | 'manual';
  initialPaused: boolean;
  /** Override the PATCH URL — useful for tests. Defaults to `/api/projects/:id`. */
  patchUrl?: string;
}

export function ProjectModeControls({
  projectId,
  initialMode,
  initialPaused,
  patchUrl,
}: ProjectModeControlsProps) {
  const [mode, setMode] = useState<'autopilot' | 'manual'>(initialMode);
  const [paused, setPaused] = useState<boolean>(initialPaused);
  const [pending, setPending] = useState<'mode' | 'paused' | null>(null);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const url = patchUrl ?? `/api/projects/${projectId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  }

  async function toggleMode(): Promise<void> {
    const next = mode === 'autopilot' ? 'manual' : 'autopilot';
    setPending('mode');
    const prev = mode;
    setMode(next);
    const ok = await patch({ mode: next });
    if (!ok) setMode(prev);
    setPending(null);
  }

  async function togglePaused(): Promise<void> {
    const next = !paused;
    setPending('paused');
    const prev = paused;
    setPaused(next);
    const ok = await patch({ paused: next });
    if (!ok) setPaused(prev);
    setPending(null);
  }

  return (
    <div className="flex items-center gap-3" data-testid="project-mode-controls">
      <button
        type="button"
        onClick={toggleMode}
        disabled={pending === 'mode'}
        className="rounded-md border px-3 py-1.5 text-sm"
        data-testid="mode-toggle"
        data-mode={mode}
        aria-label={`Switch to ${mode === 'autopilot' ? 'manual' : 'autopilot'} mode`}
      >
        Mode: <span className="font-semibold">{mode}</span>
      </button>
      <button
        type="button"
        onClick={togglePaused}
        disabled={pending === 'paused'}
        className="rounded-md border px-3 py-1.5 text-sm"
        data-testid="paused-toggle"
        data-paused={paused ? 'true' : 'false'}
        aria-label={paused ? 'Resume pipeline' : 'Pause pipeline'}
      >
        {paused ? 'Resume' : 'Pause'}
      </button>
    </div>
  );
}
