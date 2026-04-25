'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PipelineOrchestrator } from '@/components/pipeline/PipelineOrchestrator';
import { ConnectChannelEmptyState } from '@/components/projects/ConnectChannelEmptyState';

interface Channel {
  id: string;
  name: string;
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

  return (
    <div>
      <div className="px-6 pt-4">
        <button
          onClick={() => router.push('/projects')}
          className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Back to projects
        </button>
      </div>
      <PipelineOrchestrator
        projectId={projectId}
        channelId={channelId}
        projectTitle={(project.title as string) ?? 'Untitled Project'}
        initialPipelineState={project.pipeline_state_json as Record<string, unknown> | undefined}
      />
    </div>
  );
}
