'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PipelineOrchestrator } from '@/components/pipeline/PipelineOrchestrator';
import { ProjectModeControls } from '@/components/pipeline/ProjectModeControls';
import { PipelineSettingsProvider } from '@/providers/PipelineSettingsProvider';
import { PipelineAbortProvider } from '@/components/pipeline/PipelineAbortProvider';
import { PipelineWorkspace } from '@/components/pipeline/PipelineWorkspace';
import { ConnectChannelEmptyState } from '@/components/projects/ConnectChannelEmptyState';
import { type Stage } from '@brighttale/shared/pipeline/inputs';

/** Coerce legacy mode taxonomy to the canonical {autopilot, manual} pair. */
function coerceMode(raw: unknown): 'autopilot' | 'manual' {
  if (raw === 'manual' || raw === 'step-by-step') return 'manual';
  return 'autopilot';
}

interface Channel {
  id: string;
  name: string;
}

export default function ProjectPipelinePage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  // Demo flag — render the new <PipelineView supervised /> instead of the
  // legacy <PipelineOrchestrator />. Set ?v=2 on the URL. Remove once the
  // legacy code is deleted in Slice 14 (#22).
  const useV2 = searchParams?.get('v') === '2';
  const stageParam = searchParams?.get('stage') as Stage | null;
  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [savingChannel, setSavingChannel] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [projRes, chRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch('/api/channels'),
        ]);
        const projJson = await projRes.json();
        const chJson = await chRes.json();
        if (projJson.data) {
          setProject(projJson.data);
          setSelectedChannelId((projJson.data.channel_id as string) ?? '');
        }
        if (chJson.data?.items) setChannels(chJson.data.items);

        // Mirror legacy `pipeline_state_json` into `stage_runs` on every page
        // load. The legacy orchestrator already triggers this after PATCH
        // persist, but a user landing directly on `?v=2` never mounts the
        // legacy orchestrator and would otherwise see a half-populated rail.
        // Idempotent on the server — cheap when nothing new to mirror.
        void fetch(`/api/projects/${projectId}/stage-runs/mirror-from-legacy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }).catch(() => {});
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  async function handleSaveChannel() {
    if (!selectedChannelId) return;
    setSavingChannel(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: selectedChannelId }),
      });
      const json = await res.json();
      if (json.data) setProject(json.data);
    } finally {
      setSavingChannel(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading project...
      </div>
    );
  }

  if (!project) {
    return <div className="p-6 text-red-500">Project not found.</div>;
  }

  const channelId = (project.channel_id as string) || '';

  if (!channelId) {
    return (
      <ConnectChannelEmptyState
        channels={channels}
        selectedChannelId={selectedChannelId}
        onChannelChange={setSelectedChannelId}
        onConnect={handleSaveChannel}
        onBack={() => router.push('/projects')}
        connecting={savingChannel}
      />
    );
  }

  // Derive abort-provider props. `mode`/`paused` are top-level columns since
  // Slice 12; everything else still rides `pipeline_state_json`. We re-merge
  // them into a single bag for the legacy orchestrator's hydration, which
  // expects mode/paused there.
  const rawStateJson = project.pipeline_state_json as Record<string, unknown> | undefined
  const persistedMode = (project.mode as string | undefined) ?? (rawStateJson?.mode as string | undefined)
  const persistedStage = (rawStateJson?.currentStage as string | undefined) ?? 'brainstorm'
  const persistedPaused = Boolean((project.paused as boolean | undefined) ?? rawStateJson?.paused)
  const pipelineStateJson: Record<string, unknown> | undefined = rawStateJson || persistedMode || persistedPaused
    ? {
        ...(rawStateJson ?? {}),
        ...(persistedMode ? { mode: persistedMode } : {}),
        // Honour `?stage=` for legacy view too — clicking "Open in engine"
        // on a v2 TerminalPanel deep-links here at the chosen stage.
        ...(stageParam ? { currentStage: stageParam } : {}),
        paused: persistedPaused,
      }
    : undefined

  // machineState is 'setup' when there is no mode set yet, 'done' when published, else 'running'
  const machineState: 'setup' | 'running' | 'done' = !persistedMode
    ? 'setup'
    : persistedStage === 'publish' && pipelineStateJson?.stageResults
        ? (() => {
            const sr = pipelineStateJson.stageResults as Record<string, unknown>
            return sr.publish ? 'done' : 'running'
          })()
        : 'running'

  // Wizard gate — runs before any view (legacy or v2). The Pipeline Wizard
  // collects content type (blog/video/shorts/podcast), mode preset, and other
  // per-stage defaults that the dispatchers/engines need to read. Once it
  // completes, `pipeline_state_json.mode` is persisted and subsequent loads
  // bypass this branch to render the chosen view.
  if (machineState === 'setup') {
    return (
      <div>
        <div className="flex items-center justify-between px-6 pt-4">
          <button
            onClick={() => router.push('/projects')}
            className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back to projects
          </button>
        </div>
        <PipelineAbortProvider
          projectId={projectId}
          machineState={machineState}
          currentStage={persistedStage}
          isPaused={persistedPaused}
        >
          <PipelineSettingsProvider>
            <PipelineOrchestrator
              projectId={projectId}
              channelId={channelId}
              projectTitle={(project.title as string) ?? 'Untitled Project'}
              initialPipelineState={pipelineStateJson}
            />
          </PipelineSettingsProvider>
        </PipelineAbortProvider>
      </div>
    );
  }

  if (useV2) {
    const initialMode = coerceMode(project.mode);
    const initialPaused = Boolean(project.paused);
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 pt-4 shrink-0">
          <button
            onClick={() => router.push('/projects')}
            className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back to projects
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold">{(project.title as string) ?? 'Untitled Project'}</h1>
            <ProjectModeControls
              projectId={projectId}
              initialMode={initialMode}
              initialPaused={initialPaused}
            />
            <a
              href={`?${stageParam ? `stage=${stageParam}` : ''}`}
              className="text-xs text-muted-foreground hover:underline"
              data-testid="v2-toggle-off"
            >
              ← Legacy view
            </a>
          </div>
        </div>
        {/* T4.4: PipelineWorkspace — Focus↔Graph toggle + URL state */}
        <div className="flex-1 min-h-0 mt-2">
          <PipelineWorkspace projectId={projectId} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 pt-4">
        <button
          onClick={() => router.push('/projects')}
          className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Back to projects
        </button>
        <a
          href={`?v=2${stageParam ? `&stage=${stageParam}` : ''}`}
          className="text-xs text-muted-foreground hover:underline"
          data-testid="v2-toggle-on"
        >
          Try the new pipeline view →
        </a>
      </div>
      <PipelineAbortProvider
        projectId={projectId}
        machineState={machineState}
        currentStage={persistedStage}
        isPaused={persistedPaused}
      >
        <PipelineSettingsProvider>
          <PipelineOrchestrator
            projectId={projectId}
            channelId={channelId}
            projectTitle={(project.title as string) ?? 'Untitled Project'}
            initialPipelineState={pipelineStateJson}
          />
        </PipelineSettingsProvider>
      </PipelineAbortProvider>
    </div>
  );
}
