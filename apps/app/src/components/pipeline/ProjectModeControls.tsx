"use client";

/**
 * <ProjectModeControls> — compact icon toggles for the project header.
 *
 *   Mode    Bot icon (autopilot, blue) ↔ User icon (manual, slate)
 *   Paused  Pause icon (idle, neutral) ↔ Play icon (paused, amber)
 *
 * Each toggle PATCHes /api/projects/:id with optimistic UI + revert on
 * failure. Tooltips spell out the action that the click would trigger.
 *
 * View (overview ↔ supervised) is UI-only and deliberately not exposed
 * here — that surface concern belongs to whichever page renders the
 * pipeline.
 */
import { useState } from 'react';
import { Bot, Pause, Play, User } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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
    const prev = mode;
    setPending('mode');
    setMode(next);
    const ok = await patch({ mode: next });
    if (!ok) setMode(prev);
    setPending(null);
  }

  async function togglePaused(): Promise<void> {
    const next = !paused;
    const prev = paused;
    setPending('paused');
    setPaused(next);
    const ok = await patch({ paused: next });
    if (!ok) setPaused(prev);
    setPending(null);
  }

  const ModeIcon = mode === 'autopilot' ? Bot : User;
  const PausedIcon = paused ? Play : Pause;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1" data-testid="project-mode-controls">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleMode}
              disabled={pending === 'mode'}
              aria-label={`Switch to ${mode === 'autopilot' ? 'manual' : 'autopilot'} mode`}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md border transition',
                mode === 'autopilot'
                  ? 'border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-100'
                  : 'border-slate-300 bg-card text-slate-500 hover:bg-slate-100',
              )}
              data-testid="mode-toggle"
              data-mode={mode}
            >
              <ModeIcon className="h-4 w-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {mode === 'autopilot' ? 'Autopilot — click to switch to manual' : 'Manual — click to switch to autopilot'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={togglePaused}
              disabled={pending === 'paused'}
              aria-label={paused ? 'Resume pipeline' : 'Pause pipeline'}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md border transition',
                paused
                  ? 'border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100'
                  : 'border-slate-300 bg-card text-slate-500 hover:bg-slate-100',
              )}
              data-testid="paused-toggle"
              data-paused={paused ? 'true' : 'false'}
            >
              <PausedIcon className="h-4 w-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {paused ? 'Paused — click to resume' : 'Running — click to pause'}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
