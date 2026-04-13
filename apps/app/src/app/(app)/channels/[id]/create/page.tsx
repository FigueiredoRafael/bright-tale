'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  Search,
  Sparkles,
  FileText,
  Video,
  Zap,
  Mic,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Play,
  Eye,
  ThumbsUp,
  Plus,
  Trash2,
  Youtube,
} from 'lucide-react';

type Step = 'research' | 'select' | 'generate' | 'done';

interface TopVideo {
  title: string;
  videoId: string;
  channelTitle: string;
  views: number;
  likes: number;
  duration: number;
  thumbnail: string;
  engagementRate: number;
}

interface NicheAnalysis {
  id: string;
  top_videos_json: TopVideo[] | null;
}

const FORMATS = [
  { id: 'blog', label: 'Blog Post', icon: FileText, credits: 110 },
  { id: 'video', label: 'Video Script', icon: Video, credits: 110 },
  { id: 'shorts', label: 'Shorts Script', icon: Zap, credits: 60 },
  { id: 'podcast', label: 'Podcast Script', icon: Mic, credits: 110 },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function CreateContentPage() {
  const { id: channelId } = useParams<{ id: string }>();
  const router = useRouter();

  const [step, setStep] = useState<Step>('research');
  const [topic, setTopic] = useState('');
  const [useYouTube, setUseYouTube] = useState(true);
  const [useReferences, setUseReferences] = useState(true);
  const [researching, setResearching] = useState(false);
  const [analysis, setAnalysis] = useState<NicheAnalysis | null>(null);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['blog']);
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  // References for this channel
  const [references, setReferences] = useState<Array<{ id: string; url: string; name: string | null; platform: string }>>([]);
  const [refsLoading, setRefsLoading] = useState(true);
  const [newRefUrl, setNewRefUrl] = useState('');
  const [addingRef, setAddingRef] = useState(false);

  // Load references for the channel
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/channels/${channelId}/references`);
        const json = await res.json();
        if (json.data?.references) setReferences(json.data.references);
      } catch {
        // silent
      } finally {
        setRefsLoading(false);
      }
    })();
  }, [channelId]);

  async function addReference(e: React.FormEvent) {
    e.preventDefault();
    if (!newRefUrl.trim()) return;
    setAddingRef(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/references`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newRefUrl }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error.message);
        return;
      }
      setReferences((prev) => [...prev, json.data]);
      setNewRefUrl('');
      toast.success('Reference added');
    } catch {
      toast.error('Failed to add reference');
    } finally {
      setAddingRef(false);
    }
  }

  // Step 1: Research
  async function handleResearch(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setResearching(true);

    try {
      if (useYouTube) {
        const res = await fetch('/api/youtube/analyze-niche', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: topic }),
        });
        const json = await res.json();
        if (json.error) {
          toast.error(json.error.message);
          setResearching(false);
          return;
        }
        setAnalysis(json.data);
      }
      setStep('select');
    } catch {
      toast.error('Research failed');
    } finally {
      setResearching(false);
    }
  }

  // Step 2: Toggle format selection
  function toggleFormat(formatId: string) {
    setSelectedFormats((prev) =>
      prev.includes(formatId) ? prev.filter((f) => f !== formatId) : [...prev, formatId],
    );
  }

  // Step 3: Generate
  async function handleGenerate() {
    if (selectedFormats.length === 0) {
      toast.error('Select at least one format');
      return;
    }

    setGenerating(true);
    try {
      // Trigger Inngest job via API
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          topic,
          formats: selectedFormats,
          useReferences: useReferences && references.length > 0,
        }),
      });
      const json = await res.json();

      if (json.error) {
        toast.error(json.error.message);
        setGenerating(false);
        return;
      }

      setJobId(json.data?.jobId ?? null);
      setStep('done');
    } catch {
      toast.error('Failed to start generation');
      setGenerating(false);
    }
  }

  const topVideos = (analysis?.top_videos_json ?? []) as TopVideo[];
  const totalCredits = selectedFormats.reduce((sum, f) => {
    const format = FORMATS.find((fmt) => fmt.id === f);
    return sum + (format?.credits ?? 0);
  }, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-2 text-sm">
        {(['research', 'select', 'generate'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-border" />}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${step === s || (['select', 'generate', 'done'].indexOf(step) > i - 1 && i <= ['select', 'generate', 'done'].indexOf(step)) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {i + 1}
            </div>
            <span className={step === s ? 'text-foreground font-medium' : 'text-muted-foreground'}>
              {s === 'research' ? 'Research' : s === 'select' ? 'Select' : 'Generate'}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Research */}
      {step === 'research' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" /> What do you want to create?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResearch} className="space-y-4">
              <div className="space-y-2">
                <Label>Topic or keyword</Label>
                <Input
                  placeholder="e.g. Deep work for developers, AI productivity tips"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  autoFocus
                />
              </div>

              {/* YouTube Intelligence — broad niche search */}
              <div className="flex items-start gap-2 p-3 rounded-lg border border-border">
                <Checkbox
                  id="youtube"
                  checked={useYouTube}
                  onCheckedChange={(c) => setUseYouTube(c === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="youtube" className="text-sm cursor-pointer flex-1">
                  <span className="font-medium">YouTube Intelligence</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Busca ampla: top vídeos do nicho no YouTube (últimos 30 dias).
                    Dá contexto do que está bombando. <strong>150 créditos</strong>.
                  </span>
                </Label>
              </div>

              {/* Reference modeling — specific channels */}
              <div className="p-3 rounded-lg border border-border space-y-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="references"
                    checked={useReferences && references.length > 0}
                    onCheckedChange={(c) => setUseReferences(c === true)}
                    disabled={references.length === 0}
                    className="mt-0.5"
                  />
                  <Label htmlFor="references" className="text-sm cursor-pointer flex-1">
                    <span className="font-medium">Modelar a partir das minhas referências</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Use os YouTubers/blogs que você configurou como referência desse canal.
                      A IA modela o estilo deles.
                    </span>
                  </Label>
                </div>

                {!refsLoading && references.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-6">
                    {references.map((ref) => (
                      <Badge key={ref.id} variant="secondary" className="text-[10px] gap-1">
                        <Youtube className="h-2.5 w-2.5" />
                        {ref.name ?? ref.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 25)}
                      </Badge>
                    ))}
                  </div>
                )}

                <form onSubmit={addReference} className="flex gap-2 pl-6">
                  <Input
                    placeholder="https://youtube.com/@youtuber-referencia"
                    value={newRefUrl}
                    onChange={(e) => setNewRefUrl(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button type="submit" size="sm" variant="outline" disabled={addingRef || !newRefUrl.trim()} className="h-8 px-2">
                    {addingRef ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  </Button>
                </form>

                {references.length === 0 && !refsLoading && (
                  <p className="text-[10px] text-muted-foreground pl-6">
                    Adicione canais do YouTube que você quer modelar. Ou configure todos no{' '}
                    <a href={`/channels/${channelId}`} className="underline">settings do canal</a>.
                  </p>
                )}
              </div>

              <Button type="submit" disabled={researching || !topic.trim()}>
                {researching ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Researching...</>
                ) : (
                  <><Search className="h-4 w-4 mr-2" /> Research</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Select formats + see results */}
      {step === 'select' && (
        <>
          {topVideos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top videos for &ldquo;{topic}&rdquo;</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topVideos.slice(0, 10).map((v, i) => (
                    <div key={v.videoId} className="flex items-center gap-3 py-2 border-b last:border-0">
                      <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{v.title}</div>
                        <div className="text-xs text-muted-foreground">{v.channelTitle}</div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {formatNumber(v.views)}</span>
                        <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {formatNumber(v.likes)}</span>
                        <span className="flex items-center gap-1"><Play className="h-3 w-3" /> {formatDuration(v.duration)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Select output formats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {FORMATS.map((f) => {
                  const Icon = f.icon;
                  const selected = selectedFormats.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleFormat(f.id)}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${selected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-4 w-4" />
                        <span className="font-medium text-sm">{f.label}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{f.credits} credits</Badge>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={() => setStep('research')}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    Total: <strong>{totalCredits}</strong> credits
                  </span>
                  <Button onClick={() => setStep('generate')} disabled={selectedFormats.length === 0}>
                    Continue <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Step 3: Confirm + Generate */}
      {step === 'generate' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Ready to generate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Topic</span>
                <span className="font-medium">{topic}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Formats</span>
                <span className="font-medium">{selectedFormats.join(', ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credits</span>
                <span className="font-medium">{totalCredits}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              The AI will run a full pipeline: brainstorm ideas, research the topic, produce content for each format, and review quality. This takes 1-3 minutes.
            </p>

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep('select')}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Generate Content</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Done */}
      {step === 'done' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold mb-2">Content generation started!</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm">
              Your content is being generated in the background. You&apos;ll find it in your projects when ready.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push(`/channels/${channelId}`)}>
                Back to Channel
              </Button>
              <Button onClick={() => router.push('/projects')}>
                View Projects
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
