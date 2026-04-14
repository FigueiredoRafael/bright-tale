'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Volume2, Play, Square, Loader2 } from 'lucide-react';

interface VoiceOption {
  id: string;
  label: string;
  language?: string;
  gender?: string;
  sampleUrl?: string;
}

interface VoiceConfig {
  voiceProvider: string | null;
  voiceId: string | null;
  voiceSpeed: number;
}

interface Props {
  value: VoiceConfig;
  onChange: (config: VoiceConfig) => void;
}

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI TTS', credits: 50 },
  { value: 'elevenlabs', label: 'ElevenLabs', credits: 100 },
] as const;

export function VoiceConfigSection({ value, onChange }: Props) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const provider = value.voiceProvider ?? 'openai';

  const fetchVoices = useCallback(async (p: string) => {
    setLoadingVoices(true);
    setVoices([]);
    try {
      const res = await fetch(`/api/voice/voices?provider=${p}`);
      const json = await res.json();
      if (json.data) {
        setVoices(json.data.voices ?? []);
        setConfigured(json.data.configured !== false);
      }
    } catch {
      setVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  }, []);

  useEffect(() => {
    if (provider) fetchVoices(provider);
  }, [provider, fetchVoices]);

  function handleProviderChange(p: string) {
    onChange({ ...value, voiceProvider: p, voiceId: null });
  }

  function handleVoiceChange(voiceId: string) {
    onChange({ ...value, voiceId });
  }

  function handleSpeedChange(vals: number[]) {
    onChange({ ...value, voiceSpeed: vals[0] });
  }

  async function handlePreview() {
    if (!value.voiceId) return;

    if (previewing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPreviewing(false);
      return;
    }

    setPreviewing(true);
    try {
      const res = await fetch('/api/voice/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Olá! Este é um teste de voz para o seu canal de conteúdo.',
          voiceId: value.voiceId,
          provider: provider,
          speed: value.voiceSpeed,
        }),
      });
      const json = await res.json();
      if (json.data?.audioBase64) {
        const audio = new Audio(`data:${json.data.mimeType};base64,${json.data.audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => setPreviewing(false);
        audio.play();
      } else {
        setPreviewing(false);
      }
    } catch {
      setPreviewing(false);
    }
  }

  const selectedProvider = PROVIDERS.find((p) => p.value === provider);
  const selectedVoice = voices.find((v) => v.id === value.voiceId);

  return (
    <div className="space-y-4 col-span-2">
      <div className="flex items-center gap-2">
        <Volume2 className="h-4 w-4 text-muted-foreground" />
        <Label className="text-base font-medium">Configuração de Voz</Label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Provedor</Label>
          <Select value={provider} onValueChange={handleProviderChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  <span className="flex items-center gap-2">
                    {p.label}
                    <Badge variant="outline" className="text-[10px] ml-1">
                      {p.credits} créditos/5min
                    </Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!configured && (
            <p className="text-xs text-amber-600">
              Provedor não configurado — defina a API key no servidor.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Voz</Label>
          {loadingVoices ? (
            <div className="flex items-center gap-2 h-9 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando vozes...
            </div>
          ) : (
            <Select
              value={value.voiceId ?? ''}
              onValueChange={handleVoiceChange}
              disabled={voices.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar voz" />
              </SelectTrigger>
              <SelectContent>
                {voices.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    <span className="flex items-center gap-2">
                      {v.label}
                      {v.gender && (
                        <span className="text-xs text-muted-foreground">({v.gender})</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Velocidade</Label>
            <span className="text-xs text-muted-foreground font-mono">
              {value.voiceSpeed.toFixed(1)}x
            </span>
          </div>
          <Slider
            value={[value.voiceSpeed]}
            onValueChange={handleSpeedChange}
            min={0.5}
            max={2.0}
            step={0.1}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0.5x</span>
            <span>1.0x</span>
            <span>2.0x</span>
          </div>
        </div>

        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={!value.voiceId || (!configured && !previewing)}
          >
            {previewing ? (
              <><Square className="h-3.5 w-3.5 mr-1.5" /> Parar</>
            ) : (
              <><Play className="h-3.5 w-3.5 mr-1.5" /> Preview</>
            )}
          </Button>
          {selectedVoice && selectedProvider && (
            <span className="ml-3 text-xs text-muted-foreground">
              {selectedVoice.label} · {selectedProvider.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
