'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PipelineOrchestrator } from '@/components/pipeline/PipelineOrchestrator';

export default function ProjectPipelinePage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();
  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.data) setProject(json.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

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
