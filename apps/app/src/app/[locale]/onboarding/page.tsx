'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Sparkles, ArrowRight, ArrowLeft, Check, Globe,
  PenLine, Video, Zap, Mic, Ghost, User as UserIcon, Layers,
} from 'lucide-react';

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

const MARKETS = [
  { value: 'br', label: 'Brasil', lang: 'pt-BR' },
  { value: 'us', label: 'Estados Unidos', lang: 'en-US' },
  { value: 'uk', label: 'United Kingdom', lang: 'en-GB' },
  { value: 'international', label: 'Internacional', lang: 'en-US' },
];

type Step = 'welcome' | 'has-channel' | 'connect' | 'market' | 'media' | 'video-style' | 'name';

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
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [customNiche, setCustomNiche] = useState('');
  const [market, setMarket] = useState('br');
  const [language, setLanguage] = useState('pt-BR');
  const [mediaTypes, setMediaTypes] = useState<string[]>(['blog']);
  const [videoStyle, setVideoStyle] = useState<string>('face');
  const [channelName, setChannelName] = useState('');
  const [creating, setCreating] = useState(false);

  // Dynamic step order (video-style only shown if video is selected)
  const steps: Step[] = ['welcome', 'has-channel', 'connect', 'market', 'media'];
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

  function toggleNiche(n: string) {
    setSelectedNiches((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }

  function toggleMedia(m: string) {
    setMediaTypes((prev) =>
      prev.includes(m)
        ? prev.length > 1
          ? prev.filter((x) => x !== m)
          : prev // don't allow removing last
        : [...prev, m],
    );
  }

  async function createChannel() {
    if (!channelName.trim()) {
      toast.error('Nomeie seu canal');
      return;
    }

    setCreating(true);
    try {
      const niche = selectedNiches[0] ?? customNiche ?? null;
      const needsVideoStyle = mediaTypes.includes('video') || mediaTypes.includes('shorts');

      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: channelName,
          niche,
          nicheTags: selectedNiches.length > 0 ? selectedNiches : undefined,
          market,
          language,
          mediaTypes,
          videoStyle: needsVideoStyle ? videoStyle : undefined,
          youtubeUrl: youtubeUrl || undefined,
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
      {/* Cancel button — only if user has channels already */}
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

          {step === 'has-channel' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-center">Você já tem um canal?</h2>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => { setHasChannel(true); next(); }}
                  className={`p-6 rounded-lg border-2 text-center transition-all hover:border-primary ${hasChannel === true ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <Check className="h-6 w-6 mx-auto mb-2 text-green-500" />
                  <div className="font-medium">Sim, tenho</div>
                  <p className="text-xs text-muted-foreground mt-1">Vou analisar o canal</p>
                </button>
                <button
                  onClick={() => { setHasChannel(false); next(); }}
                  className={`p-6 rounded-lg border-2 text-center transition-all hover:border-primary ${hasChannel === false ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <Sparkles className="h-6 w-6 mx-auto mb-2 text-purple-500" />
                  <div className="font-medium">Estou começando</div>
                  <p className="text-xs text-muted-foreground mt-1">Ajudo a escolher nicho</p>
                </button>
              </div>
              <Button variant="ghost" onClick={back} className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
            </div>
          )}

          {step === 'connect' && (
            <div className="space-y-6">
              {hasChannel ? (
                <>
                  <h2 className="text-xl font-bold">Conecte seu canal</h2>
                  <div className="space-y-2">
                    <Label>URL do canal do YouTube</Label>
                    <Input placeholder="https://youtube.com/@seucanal" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold">Que temas te interessam?</h2>
                  <p className="text-sm text-muted-foreground">Pode marcar um ou mais. Vamos analisar as melhores oportunidades.</p>
                  <div className="flex flex-wrap gap-2">
                    {NICHE_OPTIONS.map((n) => (
                      <Badge key={n} variant={selectedNiches.includes(n) ? 'default' : 'outline'} className="cursor-pointer text-sm py-1.5 px-3" onClick={() => toggleNiche(n)}>
                        {n}
                      </Badge>
                    ))}
                  </div>
                  <Input placeholder="Ou digite um nicho custom..." value={customNiche} onChange={(e) => setCustomNiche(e.target.value)} />
                </>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={back} className="flex-1"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
                <Button onClick={next} className="flex-1">Continuar <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </div>
            </div>
          )}

          {step === 'market' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Qual seu público?</h2>
              <div className="space-y-3">
                {MARKETS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => { setMarket(m.value); setLanguage(m.lang); }}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${market === m.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}
                  >
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{m.label}</div>
                      <div className="text-xs text-muted-foreground">{m.lang}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={back} className="flex-1"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
                <Button onClick={next} className="flex-1">Continuar <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </div>
            </div>
          )}

          {/* NEW: Media types (multi-select) */}
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

          {/* NEW: Video style (conditional) */}
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
                  <span>Nicho:</span>
                  <span className="text-foreground">{selectedNiches[0] ?? customNiche ?? '—'}</span>
                  <span>Mercado:</span>
                  <span className="text-foreground">{MARKETS.find((m) => m.value === market)?.label} ({language})</span>
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
                  {youtubeUrl && (
                    <>
                      <span>YouTube:</span>
                      <span className="text-foreground truncate">{youtubeUrl}</span>
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
