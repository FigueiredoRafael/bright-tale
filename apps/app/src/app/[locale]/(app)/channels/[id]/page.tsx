'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  ArrowLeft,
  RefreshCw,
  Youtube,
  FileText,
  Eye,
  Users,
  Film,
  Loader2,
} from 'lucide-react';
import { NichePicker } from '@/components/channels/NichePicker';
import { LogoUpload } from '@/components/channels/LogoUpload';
import { VoiceConfigSection } from '@/components/channels/VoiceConfigSection';
import { ReferenceNotifications } from '@/components/channels/ReferenceNotifications';
import { invalidateChannelCache } from '@/hooks/use-active-channel';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

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
  blog_url: string | null;
  voice_provider: string | null;
  voice_id: string | null;
  voice_speed: number;
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

interface YouTubeMetrics {
  id: string;
  title: string;
  description: string;
  customUrl: string;
  thumbnail: string;
  country?: string;
  subscribers: number;
  totalViews: number;
  videoCount: number;
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

  // YouTube metrics
  const [ytMetrics, setYtMetrics] = useState<YouTubeMetrics | null>(null);
  const [ytLoading, setYtLoading] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [niche, setNiche] = useState('');
  const [market, setMarket] = useState('br');
  const [language, setLanguage] = useState('pt-BR');
  const [mediaTypes, setMediaTypes] = useState<string[]>(['blog']);
  const [videoStyle, setVideoStyle] = useState<string>('face');
  const [modelTier, setModelTier] = useState('standard');
  const [tone, setTone] = useState('informative');
  const [voiceProvider, setVoiceProvider] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);

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
        setVoiceProvider(c.voice_provider);
        setVoiceId(c.voice_id);
        setVoiceSpeed(c.voice_speed ?? 1.0);
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

  // Fetch YouTube metrics when channel loads and has youtube_url
  const fetchYtMetrics = useCallback(async (url: string) => {
    setYtLoading(true);
    try {
      const res = await fetch('/api/youtube/analyze-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (json.data) setYtMetrics(json.data);
    } catch {
      // silent — metrics are optional
    } finally {
      setYtLoading(false);
    }
  }, []);

  useEffect(() => {
    if (channel?.youtube_url) fetchYtMetrics(channel.youtube_url);
  }, [channel?.youtube_url, fetchYtMetrics]);

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
          voiceProvider: voiceProvider || undefined,
          voiceId: voiceId || undefined,
          voiceSpeed,
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

  const hasYoutube = mediaTypes.includes('video') || mediaTypes.includes('shorts') || !!channel.youtube_url;
  const hasBlog = mediaTypes.includes('blog');

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/channels')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Content Channels
        </Button>
        <h1 className="text-2xl font-bold">{channel.name}</h1>
      </div>

      <ReferenceNotifications channelId={id} />

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings className="h-4 w-4" /> Configurações
          </TabsTrigger>
          {hasYoutube && (
            <TabsTrigger value="youtube" className="gap-1.5">
              <Youtube className="h-4 w-4" /> YouTube
            </TabsTrigger>
          )}
          {hasBlog && (
            <TabsTrigger value="blog" className="gap-1.5">
              <FileText className="h-4 w-4" /> Blog
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── SETTINGS TAB ── */}
        <TabsContent value="settings" className="space-y-6 mt-6">
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
                {(mediaTypes.includes('video') || mediaTypes.includes('shorts') || mediaTypes.includes('podcast')) && (
                  <VoiceConfigSection
                    value={{ voiceProvider, voiceId, voiceSpeed }}
                    onChange={({ voiceProvider: vp, voiceId: vi, voiceSpeed: vs }) => {
                      setVoiceProvider(vp);
                      setVoiceId(vi);
                      setVoiceSpeed(vs);
                    }}
                  />
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
        </TabsContent>

        {/* ── YOUTUBE TAB ── */}
        {hasYoutube && (
          <TabsContent value="youtube" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Youtube className="h-5 w-5 text-red-500" /> YouTube Channel
                  </CardTitle>
                  {channel.youtube_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchYtMetrics(channel.youtube_url!)}
                      disabled={ytLoading}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${ytLoading ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {!channel.youtube_url ? (
                  <div className="text-center py-8 space-y-3">
                    <Youtube className="h-12 w-12 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      Nenhum canal do YouTube conectado.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Adicione a URL do canal nas configurações para ver métricas aqui.
                    </p>
                  </div>
                ) : ytLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : ytMetrics ? (
                  <>
                    {/* Channel stats */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-muted/50 rounded-lg p-4 text-center">
                        <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                        <div className="text-2xl font-bold">{formatNumber(ytMetrics.subscribers)}</div>
                        <div className="text-xs text-muted-foreground">Inscritos</div>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-4 text-center">
                        <Film className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                        <div className="text-2xl font-bold">{formatNumber(ytMetrics.videoCount)}</div>
                        <div className="text-xs text-muted-foreground">Vídeos</div>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-4 text-center">
                        <Eye className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                        <div className="text-2xl font-bold">{formatNumber(ytMetrics.totalViews)}</div>
                        <div className="text-xs text-muted-foreground">Views totais</div>
                      </div>
                    </div>

                    {/* Channel info */}
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-medium">{ytMetrics.title}</div>
                          <div className="text-sm text-muted-foreground">{ytMetrics.customUrl}</div>
                        </div>
                      </div>
                      {ytMetrics.description && (
                        <p className="text-sm text-muted-foreground line-clamp-3">{ytMetrics.description}</p>
                      )}
                      {ytMetrics.country && (
                        <div className="text-xs text-muted-foreground">País: {ytMetrics.country}</div>
                      )}
                    </div>

                    {/* Link to YouTube */}
                    <Button variant="outline" size="sm" asChild>
                      <a href={channel.youtube_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" /> Abrir no YouTube
                      </a>
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Não foi possível carregar métricas do canal.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── BLOG TAB ── */}
        {hasBlog && (
          <TabsContent value="blog" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-500" /> Blog
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>URL do blog / WordPress</Label>
                  <Input
                    placeholder="https://meublog.com.br"
                    value={channel.blog_url ?? ''}
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    Configure a URL do blog nas configurações gerais. Se for WordPress, vamos buscar métricas automaticamente.
                  </p>
                </div>

                {!channel.blog_url ? (
                  <div className="text-center py-8 space-y-3">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      Nenhum blog conectado.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Adicione a URL do blog nas configurações para ver métricas aqui.
                    </p>
                  </div>
                ) : (
                  <div className="bg-muted/50 rounded-lg p-4 text-center text-sm text-muted-foreground">
                    Métricas do blog em breve — WordPress REST API integration.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
