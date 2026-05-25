'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ProjectModeControls } from '@/components/pipeline/ProjectModeControls';
import { PipelineWorkspace } from '@/components/pipeline/PipelineWorkspace';
import { ConnectChannelEmptyState } from '@/components/projects/ConnectChannelEmptyState';

interface Channel {
  id: string;
  name: string;
}

/** Coerce legacy mode taxonomy to the canonical {autopilot, manual} pair. */
function coerceMode(raw: unknown): 'autopilot' | 'manual' {
  if (raw === 'manual' || raw === 'step-by-step') return 'manual';
  return 'autopilot';
}

export default function ProjectPipelinePage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();
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
        // load. Idempotent on the server — cheap when nothing new to mirror.
        // Retained for one more wave per scope note (mirror-from-legacy endpoint).
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
        </div>
      </div>
      {/* PipelineWorkspace — Focus (default) or Graph (?view=graph) */}
      <div className="flex-1 min-h-0 mt-2">
        <PipelineWorkspace projectId={projectId} />
      </div>
    </div>
  );
}
