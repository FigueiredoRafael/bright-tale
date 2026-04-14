'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Lightbulb, ArrowRight, RefreshCw, Loader2 } from 'lucide-react';
import { PipelineStages } from '@/components/pipeline/PipelineStages';

interface Idea {
  id?: string;
  idea_id: string;
  title: string;
  core_tension?: string;
  target_audience?: string;
  verdict: string;
  discovery_data?: string;
}

interface Session {
  id: string;
  input_mode: string;
  input_json: Record<string, unknown>;
  model_tier: string;
  status: string;
  channel_id: string | null;
  project_id: string | null;
  created_at: string;
}

export default function BrainstormSessionPage() {
  const params = useParams();
  const channelId = params.id as string;
  const sessionId = params.sessionId as string;
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/brainstorm/sessions/${sessionId}`);
        const json = await res.json();
        if (json.data) {
          setSession(json.data.session);
          setIdeas(json.data.ideas ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  const selectedIdea = ideas.find(
    (i) => (i.id ?? i.idea_id) === selectedIdeaId,
  );

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/brainstorm/sessions/${sessionId}/regenerate`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error.message);
        return;
      }
      const newId = json.data?.sessionId ?? json.data?.session?.id;
      if (newId) {
        toast.success('Regenerated — loading new session');
        router.push(`/channels/${channelId}/brainstorm/${newId}`);
      }
    } catch {
      toast.error('Regeneration failed');
    } finally {
      setRegenerating(false);
    }
  }

  async function handleNextResearch() {
    if (!selectedIdea) return;
    const ideaId = selectedIdea.id ?? selectedIdea.idea_id;
    try {
      const res = await fetch('/api/projects/from-idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId, channelId }),
      });
      const json = await res.json();
      const projectId = (json.data?.project as Record<string, unknown>)?.id as string;
      router.push(
        `/channels/${channelId}/research/new?ideaId=${ideaId}&projectId=${projectId ?? ''}`,
      );
    } catch {
      router.push(`/channels/${channelId}/research/new?ideaId=${ideaId}`);
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading session...</div>;
  if (!session) return <div className="p-6 text-red-500">Session not found.</div>;

  const topic = (session.input_json?.topic as string) ?? 'Untitled';

  return (
    <div>
      <PipelineStages
        currentStep="brainstorm"
        channelId={channelId}
        brainstormSessionId={sessionId}
      />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Lightbulb className="h-5 w-5" /> Brainstorm Session
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Topic: {topic} &middot; {session.input_mode} &middot; {ideas.length} ideas
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating}>
            {regenerating ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Regenerate
          </Button>
        </div>

        {/* Ideas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Ideas <Badge variant="secondary" className="text-[10px]">{ideas.length}</Badge>
              <span className="text-xs text-muted-foreground font-normal ml-auto">
                Select one to continue to Research
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ideas.map((idea) => {
              let extra: Record<string, unknown> = {};
              try { extra = JSON.parse(idea.discovery_data ?? '{}'); } catch { /* */ }
              const isSelected = selectedIdeaId === (idea.id ?? idea.idea_id);
              return (
                <button
                  key={idea.idea_id}
                  onClick={() => setSelectedIdeaId(idea.id ?? idea.idea_id)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-5 w-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                      isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                    }`}>
                      {isSelected && (
                        <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <Badge
                      variant={idea.verdict === 'viable' ? 'default' : idea.verdict === 'weak' ? 'destructive' : 'secondary'}
                      className="text-[10px] shrink-0"
                    >
                      {idea.verdict}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{idea.title}</div>
                      {idea.core_tension && (
                        <div className="text-xs text-muted-foreground mt-1">{idea.core_tension}</div>
                      )}
                      {idea.target_audience && (
                        <div className="text-xs text-muted-foreground mt-0.5">For: {idea.target_audience}</div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Sticky footer */}
        {selectedIdea && (
          <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur z-50">
            <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <Badge
                  variant={selectedIdea.verdict === 'viable' ? 'default' : selectedIdea.verdict === 'weak' ? 'destructive' : 'secondary'}
                  className="text-[10px] shrink-0"
                >
                  {selectedIdea.verdict}
                </Badge>
                <span className="text-sm font-medium truncate">{selectedIdea.title}</span>
              </div>
              <Button onClick={handleNextResearch} className="shrink-0 gap-2">
                Next: Research <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        {selectedIdea && <div className="h-16" />}
      </div>
    </div>
  );
}
