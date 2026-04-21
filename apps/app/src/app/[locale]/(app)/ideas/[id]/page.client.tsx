'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

// Placeholder row shape — will be tightened via @brighttale/shared types later.
export interface IdeaRow {
  id: string;
  idea_id: string;
  title: string;
  core_tension: string | null;
  target_audience: string | null;
  verdict: 'viable' | 'experimental' | 'weak';
  tags: string[] | null;
  source_type: string | null;
  discovery_data: Record<string, unknown> | null;
  channel_id: string | null;
  research_session_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  ideaId: string;
}

export function IdeaPageClient({ ideaId }: Props) {
  const [idea, setIdea] = useState<IdeaRow | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus('loading');
      try {
        const res = await fetch(`/api/library/${ideaId}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.status === 404) {
          setStatus('notfound');
          return;
        }
        if (!res.ok || json.error) {
          setErrorMsg(json.error?.message ?? 'Failed to load idea');
          setStatus('error');
          return;
        }
        setIdea(json.data.idea);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : 'Network error');
        setStatus('error');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ideaId]);

  if (status === 'loading') {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (status === 'notfound') {
    return (
      <div className="p-12 text-center space-y-4">
        <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Idea not found</h1>
        <Button asChild variant="outline">
          <Link href="/en/ideas"><ArrowLeft className="mr-2 h-4 w-4" />Back to library</Link>
        </Button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-destructive">{errorMsg}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  if (!idea) return null;

  return (
    <div className="p-6">
      <div className="text-xs text-muted-foreground mb-4">
        <Link href="/en/ideas" className="hover:underline">Ideas</Link>
        <span className="mx-2">/</span>
        <span>{idea.idea_id}</span>
      </div>
      {/* Columns land in Tasks 6 and 7 */}
      <pre className="text-xs">{JSON.stringify(idea, null, 2)}</pre>
    </div>
  );
}
