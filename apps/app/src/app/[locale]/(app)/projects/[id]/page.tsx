'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PipelineOrchestrator } from '@/components/pipeline/PipelineOrchestrator';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
      <div className="p-6 max-w-md mx-auto mt-12 space-y-4">
        <button
          onClick={() => router.push('/projects')}
          className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Back to projects
        </button>
        <div className="border rounded-lg p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Connect a Channel</h2>
            <p className="text-sm text-muted-foreground mt-1">
              This project needs a content channel to use the pipeline and publish to WordPress.
            </p>
          </div>
          <div className="space-y-2">
            <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a channel..." />
              </SelectTrigger>
              <SelectContent>
                {channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSaveChannel} disabled={!selectedChannelId || savingChannel}>
            {savingChannel ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Connect Channel
          </Button>
        </div>
      </div>
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
