'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Search, ArrowRight, RefreshCw, Loader2, Check, Lightbulb, AlertTriangle } from 'lucide-react';
import { PipelineStages } from '@/components/pipeline/PipelineStages';

interface Card_ {
  type?: string;
  title?: string;
  url?: string;
  author?: string;
  quote?: string;
  claim?: string;
  relevance?: number;
  [k: string]: unknown;
}

interface Session {
  id: string;
  idea_id: string | null;
  level: string;
  status: string;
  cards_json: Card_[] | null;
  approved_cards_json: Card_[] | null;
  refined_angle_json: Record<string, unknown> | null;
  channel_id: string | null;
  project_id: string | null;
  input_json: Record<string, unknown>;
}

export default function ResearchSessionPage() {
  const params = useParams();
  const channelId = params.id as string;
  const sessionId = params.sessionId as string;
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [cards, setCards] = useState<Card_[]>([]);
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [linkedIdea, setLinkedIdea] = useState<{ title: string; verdict: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/research-sessions/${sessionId}`);
        const json = await res.json();
        if (json.data) {
          const s = json.data as Session;
          setSession(s);
          const c = (s.approved_cards_json ?? s.cards_json ?? []) as Card_[];
          setCards(c);
          setApproved(new Set(c.map((_, i) => i)));

          // Fetch linked idea
          if (s.idea_id) {
            try {
              const ideaRes = await fetch(`/api/ideas/library?limit=100`);
              const ideaJson = await ideaRes.json();
              const idea = (ideaJson.data?.ideas ?? []).find(
                (i: Record<string, unknown>) => i.id === s.idea_id || i.idea_id === s.idea_id,
              );
              if (idea) setLinkedIdea({ title: idea.title, verdict: idea.verdict });
            } catch { /* */ }
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  function toggleApproval(i: number) {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  async function handleApprove() {
    const approvedCards = cards.filter((_, i) => approved.has(i));
    try {
      const res = await fetch(`/api/research-sessions/${sessionId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedCardsJson: approvedCards }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error.message); return; }
    } catch {
      toast.error('Failed to save review');
      return;
    }

    toast.success(`${approvedCards.length} cards approved`);
    const p = new URLSearchParams();
    p.set('researchSessionId', sessionId);
    if (session?.idea_id) p.set('ideaId', session.idea_id);
    if (session?.project_id) p.set('projectId', session.project_id);
    router.push(`/channels/${channelId}/drafts/new?${p.toString()}`);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/research-sessions/${sessionId}/regenerate`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error.message); return; }
      const newId = json.data?.sessionId ?? json.data?.session?.id;
      if (newId) {
        toast.success('Regenerated — loading new session');
        router.push(`/channels/${channelId}/research/${newId}`);
      }
    } catch {
      toast.error('Regeneration failed');
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading session...</div>;
  if (!session) return <div className="p-6 text-red-500">Session not found.</div>;

  const pivot = session.refined_angle_json;
  const shouldPivot = pivot && Boolean(pivot.should_pivot);

  return (
    <div>
      <PipelineStages
        currentStep="research"
        channelId={channelId}
        researchSessionId={sessionId}
        ideaTitle={linkedIdea?.title}
      />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Search className="h-5 w-5" /> Research Session
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Level: {session.level} &middot; {cards.length} cards &middot; {session.status}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating}>
            {regenerating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Regenerate
          </Button>
        </div>

        {/* Linked idea */}
        {linkedIdea && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
            <Lightbulb className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm">{linkedIdea.title}</span>
            <Badge variant="outline" className="text-[10px]">{linkedIdea.verdict}</Badge>
          </div>
        )}

        {/* Pivot recommendation */}
        {shouldPivot && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">Pivot recommended</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {String(pivot?.updated_title ?? '')}
              </p>
            </div>
          </div>
        )}

        {/* Research cards */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Research cards <Badge variant="secondary" className="text-[10px] ml-1">{cards.length}</Badge></span>
              <span className="text-xs text-muted-foreground font-normal">{approved.size} approved</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cards.map((c, i) => {
              const isApproved = approved.has(i);
              return (
                <div
                  key={i}
                  className={`p-3 rounded-lg border ${isApproved ? 'border-primary/50 bg-primary/5' : 'border-border opacity-60'}`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox checked={isApproved} onCheckedChange={() => toggleApproval(i)} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {c.type && <Badge variant="outline" className="text-[10px]">{c.type}</Badge>}
                      </div>
                      <div className="text-sm font-medium mt-1">
                        {c.title ?? c.claim ?? c.quote ?? '—'}
                      </div>
                      {c.author && <div className="text-xs text-muted-foreground mt-1">— {c.author}</div>}
                      {c.url && (
                        <a href={c.url as string} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">
                          {c.url as string}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex justify-end pt-2">
              <Button onClick={handleApprove}>
                <Check className="h-4 w-4 mr-2" /> Approve ({approved.size}) <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
