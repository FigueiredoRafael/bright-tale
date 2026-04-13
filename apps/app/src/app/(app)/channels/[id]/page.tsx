'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Settings,
  Plus,
  Trash2,
  ExternalLink,
  Search,
  Sparkles,
  ArrowLeft,
  RefreshCw,
  Lightbulb,
} from 'lucide-react';
import { NichePicker } from '@/components/channels/NichePicker';
import { LogoUpload } from '@/components/channels/LogoUpload';
import { invalidateChannelCache } from '@/hooks/use-active-channel';

interface Channel {
  id: string;
  name: string;
  niche: string | null;
  market: string;
  language: string;
  channel_type: string;
  media_types: string[];
  video_style: string | null;
  logo_url: string | null;
  is_evergreen: boolean;
  youtube_url: string | null;
  voice_provider: string | null;
  voice_id: string | null;
  model_tier: string;
  tone: string | null;
}

interface Reference {
  id: string;
  url: string;
  platform: string;
  name: string | null;
  subscribers: number | null;
  analyzed_at: string | null;
}

export default function ChannelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [references, setReferences] = useState<Reference[]>([]);
  const [refLimit, setRefLimit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRefUrl, setNewRefUrl] = useState('');
  const [addingRef, setAddingRef] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [niche, setNiche] = useState('');
  const [market, setMarket] = useState('br');
  const [language, setLanguage] = useState('pt-BR');
  const [mediaTypes, setMediaTypes] = useState<string[]>(['blog']);
  const [videoStyle, setVideoStyle] = useState<string>('face');
  const [modelTier, setModelTier] = useState('standard');
  const [tone, setTone] = useState('informative');

  const fetchData = useCallback(async () => {
    try {
      const [channelRes, refsRes] = await Promise.all([
        fetch(`/api/channels/${id}`),
        fetch(`/api/channels/${id}/references`),
      ]);
      const channelJson = await channelRes.json();
      const refsJson = await refsRes.json();

      if (channelJson.data) {
        const c = channelJson.data;
        setChannel(c);
        setName(c.name);
        setNiche(c.niche ?? '');
        setMarket(c.market);
        setLanguage(c.language);
        setMediaTypes(c.media_types ?? ['blog']);
        setVideoStyle(c.video_style ?? 'face');
        setModelTier(c.model_tier);
        setTone(c.tone ?? 'informative');
      }
      if (refsJson.data) {
        setReferences(refsJson.data.references ?? []);
        setRefLimit(refsJson.data.limit ?? 0);
      }
    } catch {
      toast.error('Failed to load channel');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/channels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, niche: niche || undefined, market, language, modelTier, tone,
          mediaTypes,
          videoStyle: mediaTypes.includes('video') || mediaTypes.includes('shorts') ? videoStyle : null,
        }),
      });
      const json = await res.json();
      if (json.error) toast.error(json.error.message);
      else toast.success('Channel saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddReference(e: React.FormEvent) {
    e.preventDefault();
    if (!newRefUrl.trim()) return;
    setAddingRef(true);
    try {
      const res = await fetch(`/api/channels/${id}/references`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newRefUrl }),
      });
      const json = await res.json();
      if (json.error) toast.error(json.error.message);
      else { toast.success('Reference added'); setNewRefUrl(''); fetchData(); }
    } catch {
      toast.error('Failed to add reference');
    } finally {
      setAddingRef(false);
    }
  }

  async function handleDeleteRef(refId: string) {
    if (!confirm('Remove this reference?')) return;
    await fetch(`/api/channels/${id}/references/${refId}`, { method: 'DELETE' });
    fetchData();
  }

  async function handleAnalyzeAll() {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/channels/${id}/references/analyze`, { method: 'POST' });
      const json = await res.json();
      if (json.error) toast.error(json.error.message);
      else { toast.success(`Analyzed ${json.data.results.length} references`); fetchData(); }
    } catch {
      toast.error('Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-96 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!channel) return <div className="p-6">Channel not found</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/channels')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Content Channels
        </Button>
        <h1 className="text-2xl font-bold">{channel.name}</h1>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => router.push(`/channels/${id}/brainstorm/new`)}>
          <Lightbulb className="h-4 w-4 mr-2" /> Brainstorm
        </Button>
        <Button variant="outline" size="sm">
          <Search className="h-4 w-4 mr-2" /> New Research
        </Button>
        <Button size="sm" onClick={() => router.push(`/channels/${id}/create`)}>
          <Sparkles className="h-4 w-4 mr-2" /> Generate Content
        </Button>
      </div>

      {/* Channel config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" /> Content Channel Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="pb-2 border-b">
            <Label className="mb-2 block">Logo</Label>
            <LogoUpload
              channelId={channel.id}
              channelName={channel.name}
              currentLogoUrl={channel.logo_url}
              onUploaded={(url) => {
                setChannel({ ...channel, logo_url: url || null });
                invalidateChannelCache();
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Nicho</Label>
              <NichePicker value={niche} onChange={setNiche} />
            </div>
            <div className="space-y-2">
              <Label>Market</Label>
              <Select value={market} onValueChange={setMarket}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="br">Brasil</SelectItem>
                  <SelectItem value="us">USA</SelectItem>
                  <SelectItem value="uk">UK</SelectItem>
                  <SelectItem value="international">International</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">Português (BR)</SelectItem>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="en-GB">English (UK)</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Mídias produzidas</Label>
              <div className="flex flex-wrap gap-2">
                {(['blog', 'video', 'shorts', 'podcast'] as const).map((m) => {
                  const selected = mediaTypes.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMediaTypes((prev) =>
                          prev.includes(m)
                            ? prev.length > 1 ? prev.filter((x) => x !== m) : prev
                            : [...prev, m],
                        );
                      }}
                      className={`px-3 py-1.5 rounded-md border text-sm transition-all ${selected ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:border-muted-foreground/50'}`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
            {(mediaTypes.includes('video') || mediaTypes.includes('shorts')) && (
              <div className="space-y-2">
                <Label>Estilo de vídeo</Label>
                <Select value={videoStyle} onValueChange={setVideoStyle}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="face">Com Rosto</SelectItem>
                    <SelectItem value="dark">Dark Channel</SelectItem>
                    <SelectItem value="hybrid">Híbrido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>AI Model Tier</Label>
              <Select value={modelTier} onValueChange={setModelTier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="ultra">Ultra</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>

      {/* References */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>References</CardTitle>
              <CardDescription>
                {references.length} / {refLimit} references used
                {refLimit === 0 && ' — upgrade to add references'}
              </CardDescription>
            </div>
            {references.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleAnalyzeAll} disabled={analyzing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${analyzing ? 'animate-spin' : ''}`} />
                {analyzing ? 'Analyzing...' : 'Analyze All'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {refLimit > 0 && references.length < refLimit && (
            <form onSubmit={handleAddReference} className="flex gap-2">
              <Input
                placeholder="https://youtube.com/@reference-channel"
                value={newRefUrl}
                onChange={(e) => setNewRefUrl(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={addingRef} size="sm">
                <Plus className="h-4 w-4 mr-1" /> {addingRef ? 'Adding...' : 'Add'}
              </Button>
            </form>
          )}

          {references.length === 0 && refLimit > 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Add reference channels to model your content style after successful creators.
            </p>
          )}

          <div className="divide-y">
            {references.map((ref) => (
              <div key={ref.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">{ref.platform}</Badge>
                  <div>
                    <div className="text-sm font-medium">{ref.name ?? ref.url}</div>
                    {ref.subscribers && (
                      <span className="text-xs text-muted-foreground">
                        {(ref.subscribers / 1000).toFixed(1)}K subs
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {ref.analyzed_at && (
                    <Badge variant="secondary" className="text-[10px]">Analyzed</Badge>
                  )}
                  <Button variant="ghost" size="sm" asChild>
                    <a href={ref.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteRef(ref.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
