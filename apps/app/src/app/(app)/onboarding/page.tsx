'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  FileText,
  Video,
  Ghost,
  Layers,
  Globe,
  Check,
} from 'lucide-react';

const STEPS = ['welcome', 'has-channel', 'connect', 'market', 'type', 'name'] as const;
type Step = typeof STEPS[number];

const NICHE_OPTIONS = [
  'Tecnologia', 'Finanças', 'Produtividade', 'Saúde / Fitness',
  'Psicologia', 'Curiosidades', 'Automação', 'Empreendedorismo',
  'Educação', 'Entretenimento',
];

const CHANNEL_TYPES = [
  { value: 'text', label: 'Texto', icon: FileText, desc: 'Blog posts, artigos SEO, newsletters', cost: '$' },
  { value: 'face', label: 'Com Rosto', icon: Video, desc: 'Roteiro + teleprompter, você grava', cost: '$$' },
  { value: 'dark', label: 'Dark Channel', icon: Ghost, desc: 'IA gera tudo: voz, visual, montagem', cost: '$$$' },
  { value: 'hybrid', label: 'Híbrido', icon: Layers, desc: 'Mix de tipos conforme o conteúdo', cost: '$$' },
] as const;

const MARKETS = [
  { value: 'br', label: 'Brasil', lang: 'pt-BR' },
  { value: 'us', label: 'Estados Unidos', lang: 'en-US' },
  { value: 'uk', label: 'United Kingdom', lang: 'en-GB' },
  { value: 'international', label: 'Internacional', lang: 'en-US' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [hasChannel, setHasChannel] = useState<boolean | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [customNiche, setCustomNiche] = useState('');
  const [market, setMarket] = useState('br');
  const [language, setLanguage] = useState('pt-BR');
  const [channelType, setChannelType] = useState('text');
  const [channelName, setChannelName] = useState('');
  const [creating, setCreating] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  function next() {
    if (step === 'has-channel') {
      setStep('connect');
    } else {
      const nextIdx = Math.min(stepIndex + 1, STEPS.length - 1);
      setStep(STEPS[nextIdx]);
    }
  }

  function back() {
    const prevIdx = Math.max(stepIndex - 1, 0);
    setStep(STEPS[prevIdx]);
  }

  function toggleNiche(niche: string) {
    setSelectedNiches((prev) =>
      prev.includes(niche) ? prev.filter((n) => n !== niche) : [...prev, niche],
    );
  }

  async function createChannel() {
    if (!channelName.trim()) {
      toast.error('Enter a channel name');
      return;
    }

    setCreating(true);
    try {
      const niche = selectedNiches[0] ?? customNiche ?? null;

      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: channelName,
          niche,
          nicheTags: selectedNiches.length > 0 ? selectedNiches : undefined,
          market,
          language,
          channelType,
          youtubeUrl: youtubeUrl || undefined,
        }),
      });

      const json = await res.json();
      if (json.error) {
        toast.error(json.error.message);
        setCreating(false);
        return;
      }

      // Mark onboarding complete
      await fetch('/api/onboarding/complete', { method: 'POST' });

      toast.success('Channel created!');
      router.push(`/channels/${json.data.id}`);
    } catch {
      toast.error('Failed to create channel');
      setCreating(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-8">
      {/* Progress bar */}
      {step !== 'welcome' && (
        <div className="w-full max-w-lg mb-8">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
        </div>
      )}

      <Card className="w-full max-w-lg">
        <CardContent className="p-8">
          {/* Step 1: Welcome */}
          {step === 'welcome' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Welcome to BrightTale!</h1>
                <p className="text-muted-foreground mt-2">
                  Let's set up your first content channel. It takes less than 2 minutes.
                </p>
              </div>
              <Button onClick={next} className="w-full">
                Get Started <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {/* Step 2: Do you have a channel? */}
          {step === 'has-channel' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-center">Do you already have a YouTube channel or blog?</h2>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => { setHasChannel(true); next(); }}
                  className={`p-6 rounded-lg border-2 text-center transition-all hover:border-primary ${hasChannel === true ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <Check className="h-6 w-6 mx-auto mb-2 text-green-500" />
                  <div className="font-medium">Yes, I have one</div>
                  <p className="text-xs text-muted-foreground mt-1">I'll analyze your channel and suggest ideas based on real data</p>
                </button>
                <button
                  onClick={() => { setHasChannel(false); next(); }}
                  className={`p-6 rounded-lg border-2 text-center transition-all hover:border-primary ${hasChannel === false ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <Sparkles className="h-6 w-6 mx-auto mb-2 text-purple-500" />
                  <div className="font-medium">No, starting fresh</div>
                  <p className="text-xs text-muted-foreground mt-1">I'll help you pick the best niche</p>
                </button>
              </div>
              <Button variant="ghost" onClick={back} className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
            </div>
          )}

          {/* Step 3: Connect / Pick niche */}
          {step === 'connect' && (
            <div className="space-y-6">
              {hasChannel ? (
                <>
                  <h2 className="text-xl font-bold">Connect your channel</h2>
                  <div className="space-y-2">
                    <Label>YouTube channel URL</Label>
                    <Input
                      placeholder="https://youtube.com/@yourchannel"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold">What topics interest you?</h2>
                  <p className="text-sm text-muted-foreground">Pick one or more. We'll analyze the best opportunities.</p>
                  <div className="flex flex-wrap gap-2">
                    {NICHE_OPTIONS.map((niche) => (
                      <Badge
                        key={niche}
                        variant={selectedNiches.includes(niche) ? 'default' : 'outline'}
                        className="cursor-pointer text-sm py-1.5 px-3"
                        onClick={() => toggleNiche(niche)}
                      >
                        {niche}
                      </Badge>
                    ))}
                  </div>
                  <Input
                    placeholder="Or type a custom niche..."
                    value={customNiche}
                    onChange={(e) => setCustomNiche(e.target.value)}
                  />
                </>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={back} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <Button onClick={next} className="flex-1">
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Market + Language */}
          {step === 'market' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Who's your audience?</h2>
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
                <Button variant="ghost" onClick={back} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <Button onClick={next} className="flex-1">
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Channel type */}
          {step === 'type' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">How do you want to produce content?</h2>
              <div className="grid grid-cols-2 gap-3">
                {CHANNEL_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      onClick={() => setChannelType(t.value)}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${channelType === t.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}
                    >
                      <Icon className="h-6 w-6 mb-2" />
                      <div className="font-medium text-sm">{t.label}</div>
                      <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
                      <Badge variant="outline" className="mt-2 text-[10px]">Credits: {t.cost}</Badge>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={back} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <Button onClick={next} className="flex-1">
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 6: Name + Create */}
          {step === 'name' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Name your channel</h2>
              <div className="space-y-2">
                <Label>Channel name</Label>
                <Input
                  placeholder="e.g. Produtividade Dark"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Internal only — not visible to your audience.</p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <h3 className="font-medium">Summary</h3>
                <div className="grid grid-cols-2 gap-y-1.5 text-muted-foreground">
                  <span>Niche:</span>
                  <span className="text-foreground">{selectedNiches[0] ?? customNiche ?? '—'}</span>
                  <span>Market:</span>
                  <span className="text-foreground">{MARKETS.find((m) => m.value === market)?.label} ({language})</span>
                  <span>Type:</span>
                  <span className="text-foreground">{CHANNEL_TYPES.find((t) => t.value === channelType)?.label}</span>
                  {youtubeUrl && (
                    <>
                      <span>YouTube:</span>
                      <span className="text-foreground truncate">{youtubeUrl}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={back} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <Button onClick={createChannel} disabled={creating || !channelName.trim()} className="flex-1">
                  {creating ? 'Creating...' : 'Create Channel'}
                  <Sparkles className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
