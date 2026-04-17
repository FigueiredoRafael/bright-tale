'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Sparkles, ArrowRight, ArrowLeft, Check, Globe,
  PenLine, Video, Zap, Mic, Ghost, User as UserIcon, Layers,
  Youtube, FileText, Loader2,
} from 'lucide-react';

/* ───────────────── constants ───────────────── */

const NICHE_OPTIONS = [
  'Tecnologia', 'Finanças', 'Produtividade', 'Saúde / Fitness',
  'Psicologia', 'Curiosidades', 'Automação', 'Empreendedorismo',
  'Educação', 'Entretenimento',
];

const MEDIA_OPTIONS = [
  { value: 'blog', label: 'Blog', icon: PenLine, desc: 'Posts SEO, newsletters, artigos', cost: '$' },
  { value: 'video', label: 'Vídeo', icon: Video, desc: 'Vídeos longos para YouTube', cost: '$$' },
  { value: 'shorts', label: 'Shorts', icon: Zap, desc: 'Vídeos verticais curtos', cost: '$$' },
  { value: 'podcast', label: 'Podcast', icon: Mic, desc: 'Episódios em áudio', cost: '$$' },
] as const;

const VIDEO_STYLES = [
  { value: 'face', label: 'Com Rosto', icon: UserIcon, desc: 'Roteiro + teleprompter, você grava' },
  { value: 'dark', label: 'Dark Channel', icon: Ghost, desc: 'IA gera tudo: voz, visual, montagem' },
  { value: 'hybrid', label: 'Híbrido', icon: Layers, desc: 'Mix: alguns com rosto, alguns dark' },
] as const;

const FEATURED_MARKETS = [
  { value: 'br', label: 'Brasil', flag: '🇧🇷', lang: 'pt-BR' },
  { value: 'us', label: 'Estados Unidos', flag: '🇺🇸', lang: 'en-US' },
  { value: 'uk', label: 'United Kingdom', flag: '🇬🇧', lang: 'en-GB' },
  { value: 'international', label: 'Internacional', flag: '🌍', lang: 'en-US' },
];

const ALL_LANGUAGES = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'pt-PT', label: 'Português (Portugal)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Español (España)' },
  { value: 'es-MX', label: 'Español (México)' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'nl-NL', label: 'Nederlands' },
  { value: 'pl-PL', label: 'Polski' },
  { value: 'ru-RU', label: 'Русский' },
  { value: 'uk-UA', label: 'Українська' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'zh-CN', label: '中文 (简体)' },
  { value: 'zh-TW', label: '中文 (繁體)' },
  { value: 'ar-SA', label: 'العربية' },
  { value: 'hi-IN', label: 'हिन्दी' },
  { value: 'tr-TR', label: 'Türkçe' },
  { value: 'sv-SE', label: 'Svenska' },
  { value: 'da-DK', label: 'Dansk' },
  { value: 'no-NO', label: 'Norsk' },
  { value: 'fi-FI', label: 'Suomi' },
  { value: 'id-ID', label: 'Bahasa Indonesia' },
  { value: 'th-TH', label: 'ไทย' },
  { value: 'vi-VN', label: 'Tiếng Việt' },
  { value: 'cs-CZ', label: 'Čeština' },
  { value: 'ro-RO', label: 'Română' },
  { value: 'el-GR', label: 'Ελληνικά' },
  { value: 'he-IL', label: 'עברית' },
  { value: 'hu-HU', label: 'Magyar' },
  { value: 'bg-BG', label: 'Български' },
];

/** Map YouTube country code → market + language */
function countryToMarket(country?: string): { market: string; lang: string } {
  switch (country?.toUpperCase()) {
    case 'BR': return { market: 'br', lang: 'pt-BR' };
    case 'PT': return { market: 'international', lang: 'pt-PT' };
    case 'US': return { market: 'us', lang: 'en-US' };
    case 'GB': return { market: 'uk', lang: 'en-GB' };
    case 'ES': return { market: 'international', lang: 'es-ES' };
    case 'MX': case 'AR': case 'CO': case 'CL': return { market: 'international', lang: 'es-MX' };
    case 'FR': return { market: 'international', lang: 'fr-FR' };
    case 'DE': case 'AT': case 'CH': return { market: 'international', lang: 'de-DE' };
    case 'IT': return { market: 'international', lang: 'it-IT' };
    case 'JP': return { market: 'international', lang: 'ja-JP' };
    case 'KR': return { market: 'international', lang: 'ko-KR' };
    default: return { market: 'international', lang: 'en-US' };
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/* ───────────────── types ───────────────── */

interface YouTubeChannelData {
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

type Step = 'welcome' | 'has-channel' | 'connect' | 'market' | 'media' | 'video-style' | 'name';

/* ───────────────── component ───────────────── */

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [hasExistingChannels, setHasExistingChannels] = useState(false);

  // Check if user already has channels — if so, allow skip/cancel
  useEffect(() => {
    fetch('/api/channels')
      .then((r) => r.json())
      .then((json) => {
        if (json.data?.items?.length > 0) setHasExistingChannels(true);
      })
      .catch(() => { /* silent */ });
  }, []);

  const [hasChannel, setHasChannel] = useState<boolean | null>(null);
  const [existingPlatforms, setExistingPlatforms] = useState<string[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [blogUrl, setBlogUrl] = useState('');
  const [ytChannel, setYtChannel] = useState<YouTubeChannelData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedNiche, setSelectedNiche] = useState('');
  const [customNiche, setCustomNiche] = useState('');
  const [market, setMarket] = useState('br');
  const [language, setLanguage] = useState('pt-BR');
  const [mediaTypes, setMediaTypes] = useState<string[]>(['blog']);
  const [videoStyle, setVideoStyle] = useState<string>('face');
  const [channelName, setChannelName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showAllLanguages, setShowAllLanguages] = useState(false);

  // When YouTube data is available, skip market step (already inferred)
  const hasYoutubeProfile = !!ytChannel;

  // Dynamic step order
  const steps: Step[] = ['welcome', 'has-channel', 'connect'];
  if (!hasYoutubeProfile) steps.push('market');
  steps.push('media');
  if (mediaTypes.includes('video') || mediaTypes.includes('shorts')) {
    steps.push('video-style');
  }
  steps.push('name');

  const stepIndex = steps.indexOf(step);
  const progress = ((stepIndex + 1) / steps.length) * 100;

  function next() {
    const nextIdx = Math.min(stepIndex + 1, steps.length - 1);
    setStep(steps[nextIdx]);
  }

  function back() {
    const prevIdx = Math.max(stepIndex - 1, 0);
    setStep(steps[prevIdx]);
  }

  function selectNiche(n: string) {
    setSelectedNiche((prev) => (prev === n ? '' : n));
  }

  function toggleMedia(m: string) {
    setMediaTypes((prev) =>
      prev.includes(m)
        ? prev.length > 1
          ? prev.filter((x) => x !== m)
          : prev
        : [...prev, m],
    );
  }

  /** Analyze YouTube channel and pre-fill onboarding data */
  const analyzeYouTube = useCallback(async () => {
    if (!youtubeUrl.trim()) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/youtube/analyze-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error.message ?? 'Canal não encontrado');
        setAnalyzing(false);
        return;
      }

      const data = json.data as YouTubeChannelData;
      setYtChannel(data);

      // Pre-fill from channel data
      setChannelName(data.title);
      const { market: m, lang } = countryToMarket(data.country);
      setMarket(m);
      setLanguage(lang);

      // Pre-select video media type since they have a YouTube channel
      setMediaTypes((prev) => (prev.includes('video') ? prev : [...prev, 'video']));

      toast.success(`Canal "${data.title}" encontrado!`);
    } catch {
      toast.error('Erro ao analisar canal');
    } finally {
      setAnalyzing(false);
    }
  }, [youtubeUrl]);

  async function createChannel() {
    if (!channelName.trim()) {
      toast.error('Nomeie seu canal');
      return;
    }

    setCreating(true);
    try {
      const niche = selectedNiche || customNiche || undefined;
      const needsVideoStyle = mediaTypes.includes('video') || mediaTypes.includes('shorts');

      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: channelName,
          niche,
          nicheTags: selectedNiche ? [selectedNiche] : undefined,
          market,
          language,
          mediaTypes,
          videoStyle: needsVideoStyle ? videoStyle : undefined,
          youtubeUrl: youtubeUrl || undefined,
          blogUrl: blogUrl || undefined,
          logoUrl: ytChannel?.thumbnail || undefined,
        }),
      });

      const json = await res.json();
      if (json.error) {
        toast.error(json.error.message);
        setCreating(false);
        return;
      }

      await fetch('/api/onboarding/complete', { method: 'POST' });

      if (typeof window !== 'undefined') {
        localStorage.setItem('brighttale:active-channel-id', json.data.id);
      }

      toast.success('Canal criado!');
      router.push(`/channels/${json.data.id}`);
    } catch {
      toast.error('Falha ao criar canal');
      setCreating(false);
    }
  }

  const needsVideoStyle = mediaTypes.includes('video') || mediaTypes.includes('shorts');

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-8 relative">
      {hasExistingChannels && (
        <button
          onClick={() => router.push('/channels')}
          className="absolute top-6 right-6 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancelar e voltar ←
        </button>
      )}

      {step !== 'welcome' && (
        <div className="w-full max-w-lg mb-8">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Step {stepIndex + 1} of {steps.length}
          </p>
        </div>
      )}

      <Card className="w-full max-w-lg">
        <CardContent className="p-8">

          {/* ── WELCOME ── */}
          {step === 'welcome' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Bem-vindo ao BrightTale!</h1>
                <p className="text-muted-foreground mt-2">
                  Vamos configurar seu primeiro canal. Leva menos de 2 minutos.
                </p>
              </div>
              <Button onClick={next} className="w-full">
                Começar <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {/* ── HAS CHANNEL ── */}
          {step === 'has-channel' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-bold">Você já produz conteúdo?</h2>
                <p className="text-sm text-muted-foreground mt-1">Selecione onde você já publica (pode marcar os dois)</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { value: 'youtube', label: 'YouTube', icon: Youtube, desc: 'Tenho um canal', color: 'text-red-500' },
                  { value: 'blog', label: 'Blog', icon: FileText, desc: 'Tenho um blog', color: 'text-blue-500' },
                ] as const).map((platform) => {
                  const Icon = platform.icon;
                  const selected = existingPlatforms.includes(platform.value);
                  return (
                    <button
                      key={platform.value}
                      onClick={() => setExistingPlatforms((prev) =>
                        prev.includes(platform.value) ? prev.filter((p) => p !== platform.value) : [...prev, platform.value],
                      )}
                      className={`p-6 rounded-lg border-2 text-center transition-all hover:border-primary relative ${selected ? 'border-primary bg-primary/5' : 'border-border'}`}
                    >
                      {selected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                      <Icon className={`h-6 w-6 mx-auto mb-2 ${platform.color}`} />
                      <div className="font-medium">{platform.label}</div>
                      <p className="text-xs text-muted-foreground mt-1">{platform.desc}</p>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => { setHasChannel(existingPlatforms.length > 0); next(); }}
                  className="w-full"
                >
                  {existingPlatforms.length > 0 ? 'Continuar' : 'Estou começando do zero'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button variant="ghost" onClick={back} className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
                </Button>
              </div>
            </div>
          )}

          {/* ── CONNECT ── */}
          {step === 'connect' && (
            <div className="space-y-6">
              {hasChannel ? (
                <>
                  <div>
                    <h2 className="text-xl font-bold">Conecte seus canais</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Vamos analisar e montar o perfil do seu conteúdo automaticamente.
                    </p>
                  </div>

                  {/* YouTube URL + analyze */}
                  {existingPlatforms.includes('youtube') && (
                    <div className="space-y-3">
                      <Label className="flex items-center gap-2">
                        <Youtube className="h-4 w-4 text-red-500" /> URL do canal do YouTube
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="https://youtube.com/@seucanal"
                          value={youtubeUrl}
                          onChange={(e) => { setYoutubeUrl(e.target.value); setYtChannel(null); }}
                          disabled={analyzing}
                        />
                        <Button
                          onClick={analyzeYouTube}
                          disabled={analyzing || !youtubeUrl.trim()}
                          size="sm"
                          className="shrink-0"
                        >
                          {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Analisar'}
                        </Button>
                      </div>

                      {/* YouTube channel preview */}
                      {ytChannel && (
                        <div className="bg-muted/50 rounded-lg p-4 flex items-start gap-3">
                          <Image
                            src={ytChannel.thumbnail}
                            alt={ytChannel.title}
                            width={48}
                            height={48}
                            className="rounded-full shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{ytChannel.title}</div>
                            <div className="text-xs text-muted-foreground">{ytChannel.customUrl}</div>
                            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                              <span>{formatNumber(ytChannel.subscribers)} inscritos</span>
                              <span>{formatNumber(ytChannel.videoCount)} vídeos</span>
                              <span>{formatNumber(ytChannel.totalViews)} views</span>
                            </div>
                            {ytChannel.country && (
                              <div className="text-xs text-muted-foreground mt-1">
                                País: {ytChannel.country} → {ALL_LANGUAGES.find((l) => l.value === language)?.label}
                              </div>
                            )}
                          </div>
                          <Check className="h-5 w-5 text-green-500 shrink-0" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Blog URL */}
                  {existingPlatforms.includes('blog') && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-500" /> URL do blog
                      </Label>
                      <Input placeholder="https://meublog.com.br" value={blogUrl} onChange={(e) => setBlogUrl(e.target.value)} />
                    </div>
                  )}

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Qual o tema principal?</h3>
                    <div className="flex flex-wrap gap-2">
                      {NICHE_OPTIONS.map((n) => (
                        <Badge key={n} variant={selectedNiche === n ? 'default' : 'outline'} className="cursor-pointer text-sm py-1.5 px-3" onClick={() => selectNiche(n)}>
                          {n}
                        </Badge>
                      ))}
                    </div>
                    <Input placeholder="Ou digite um nicho custom..." value={customNiche} onChange={(e) => setCustomNiche(e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold">Qual tema te interessa?</h2>
                  <p className="text-sm text-muted-foreground">Escolha o nicho principal do seu conteúdo.</p>
                  <div className="flex flex-wrap gap-2">
                    {NICHE_OPTIONS.map((n) => (
                      <Badge key={n} variant={selectedNiche === n ? 'default' : 'outline'} className="cursor-pointer text-sm py-1.5 px-3" onClick={() => selectNiche(n)}>
                        {n}
                      </Badge>
                    ))}
                  </div>
                  <Input placeholder="Ou digite um nicho custom..." value={customNiche} onChange={(e) => setCustomNiche(e.target.value)} />
                </>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={back} className="flex-1"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
                <Button
                  onClick={next}
                  className="flex-1"
                  disabled={!!hasChannel && existingPlatforms.includes('youtube') && !ytChannel && !!youtubeUrl.trim()}
                >
                  Continuar <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
              {hasChannel && !ytChannel && (
                <button
                  onClick={() => { setYoutubeUrl(''); next(); }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Configurar mais tarde →
                </button>
              )}
            </div>
          )}

          {/* ── MARKET (skipped when YouTube profile available) ── */}
          {step === 'market' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold">Qual seu público?</h2>
                <p className="text-sm text-muted-foreground mt-1">Escolha o idioma principal do conteúdo.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {FEATURED_MARKETS.map((m) => {
                  const selected = market === m.value && language === m.lang;
                  return (
                    <button
                      key={m.value}
                      onClick={() => { setMarket(m.value); setLanguage(m.lang); setShowAllLanguages(false); }}
                      className={`p-4 rounded-lg border-2 text-center transition-all ${selected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}
                    >
                      <span className="text-2xl">{m.flag}</span>
                      <div className="font-medium text-sm mt-1">{m.label}</div>
                      <div className="text-xs text-muted-foreground">{m.lang}</div>
                    </button>
                  );
                })}
              </div>

              {!showAllLanguages ? (
                <button
                  onClick={() => setShowAllLanguages(true)}
                  className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
                >
                  <Globe className="h-3.5 w-3.5" /> Outro idioma...
                </button>
              ) : (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Selecione o idioma</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {ALL_LANGUAGES.map((l) => (
                      <button
                        key={l.value}
                        onClick={() => { setLanguage(l.value); setMarket('international'); }}
                        className={`px-3 py-2 rounded-md border text-left text-sm transition-all ${language === l.value ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:border-muted-foreground/30'}`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="ghost" onClick={back} className="flex-1"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
                <Button onClick={next} className="flex-1">Continuar <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </div>
            </div>
          )}

          {/* ── MEDIA TYPES ── */}
          {step === 'media' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold">Quais mídias você vai produzir?</h2>
                <p className="text-sm text-muted-foreground mt-1">Pode escolher mais de uma. Você pode adicionar outras depois.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {MEDIA_OPTIONS.map((m) => {
                  const Icon = m.icon;
                  const selected = mediaTypes.includes(m.value);
                  return (
                    <button
                      key={m.value}
                      onClick={() => toggleMedia(m.value)}
                      className={`p-4 rounded-lg border-2 text-left transition-all relative ${selected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}
                    >
                      {selected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                      <Icon className="h-6 w-6 mb-2" />
                      <div className="font-medium text-sm">{m.label}</div>
                      <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
                      <Badge variant="outline" className="mt-2 text-[10px]">Créditos: {m.cost}</Badge>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={back} className="flex-1"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
                <Button onClick={next} className="flex-1" disabled={mediaTypes.length === 0}>Continuar <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </div>
            </div>
          )}

          {/* ── VIDEO STYLE ── */}
          {step === 'video-style' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold">Como vai produzir os vídeos?</h2>
                <p className="text-sm text-muted-foreground mt-1">Vale para vídeos longos e shorts. Pode mudar depois por vídeo.</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {VIDEO_STYLES.map((s) => {
                  const Icon = s.icon;
                  const selected = videoStyle === s.value;
                  return (
                    <button
                      key={s.value}
                      onClick={() => setVideoStyle(s.value)}
                      className={`p-4 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${selected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{s.label}</div>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                      </div>
                      {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={back} className="flex-1"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
                <Button onClick={next} className="flex-1">Continuar <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </div>
            </div>
          )}

          {/* ── NAME + REVIEW ── */}
          {step === 'name' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Nomeie seu canal</h2>
              <div className="space-y-2">
                <Label>Nome do canal</Label>
                <Input placeholder="Ex: Produtividade Dark" value={channelName} onChange={(e) => setChannelName(e.target.value)} autoFocus />
                <p className="text-xs text-muted-foreground">Só para organização interna — não aparece pra audiência.</p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <h3 className="font-medium">Resumo</h3>
                <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-muted-foreground">
                  {(selectedNiche || customNiche) && (
                    <>
                      <span>Nicho:</span>
                      <span className="text-foreground">{selectedNiche || customNiche}</span>
                    </>
                  )}
                  <span>Idioma:</span>
                  <span className="text-foreground">{ALL_LANGUAGES.find((l) => l.value === language)?.label ?? language}</span>
                  <span>Mídias:</span>
                  <span className="text-foreground">
                    {mediaTypes.map((m) => MEDIA_OPTIONS.find((o) => o.value === m)?.label).join(', ')}
                  </span>
                  {needsVideoStyle && (
                    <>
                      <span>Estilo vídeo:</span>
                      <span className="text-foreground">{VIDEO_STYLES.find((s) => s.value === videoStyle)?.label}</span>
                    </>
                  )}
                  {ytChannel && (
                    <>
                      <span>YouTube:</span>
                      <span className="text-foreground truncate">{ytChannel.title} ({formatNumber(ytChannel.subscribers)} subs)</span>
                    </>
                  )}
                  {blogUrl && (
                    <>
                      <span>Blog:</span>
                      <span className="text-foreground truncate">{blogUrl}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={back} className="flex-1"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
                <Button onClick={createChannel} disabled={creating || !channelName.trim()} className="flex-1">
                  {creating ? 'Criando...' : 'Criar Canal'} <Sparkles className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
