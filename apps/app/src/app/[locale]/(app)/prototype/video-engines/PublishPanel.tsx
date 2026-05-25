'use client';

// PROTOTYPE — Publish (consolidated). Scope: dois modos.
// Modo Bundle (default): checklist de assets prontos + download/copy individual.
// Modo Direct: mesmo checklist + form mínimo com campos exclusivos da API
// (upload do .mp4, visibility, schedule, made-for-kids).

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Package, Youtube, Check, Copy, Download, Upload, Calendar, Eye, Rocket,
  Image as ImageIcon, FileText, MessageSquare, Hash, Type, Camera,
} from 'lucide-react';
import type { MockVideoDraft } from './mock-data';

type Mode = 'bundle' | 'direct';

export function PublishPanel({ draft }: { draft: MockVideoDraft }) {
  const [mode, setMode] = useState<Mode>('bundle');

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Publish</h1>
          <p className="text-xs text-muted-foreground">
            Bundle handoff (default): leva pro YouTube Studio você mesmo. Direct: sobe vídeo + manda metadata via API.
          </p>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </header>

      {/* Shared: target channel */}
      <Card>
        <CardContent className="py-3 flex items-center gap-3">
          <Youtube className="h-5 w-5 text-rose-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{draft.channel.name}</p>
            <p className="text-xs text-muted-foreground">{draft.channel.handle} · {draft.channel.subscribers} subs</p>
          </div>
          <Badge variant="outline" className="text-[10px]">connected</Badge>
        </CardContent>
      </Card>

      {/* Asset checklist — shared, mode tweaks the action column */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {mode === 'bundle' ? <Package className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
            {mode === 'bundle' ? 'Conteúdo no bundle' : 'Pré-flight para API'}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <AssetRow
            mode={mode}
            icon={<ImageIcon className="h-4 w-4" />}
            label="Thumbnail"
            detail={`${draft.thumbnailIdeas.length} conceitos · 1 selected`}
            payloadKind="image"
          />
          <AssetRow
            mode={mode}
            icon={<Camera className="h-4 w-4" />}
            label="B-roll prompts/images"
            detail={`${draft.script.chapters.reduce((n, c) => n + c.broll.length, 0)} itens`}
            payloadKind="image"
          />
          <AssetRow
            mode={mode}
            icon={<Type className="h-4 w-4" />}
            label="Lower thirds (timestamps + texto)"
            detail={`${draft.lowerThirds.length} cues`}
            payloadKind="text"
          />
          <AssetRow
            mode={mode}
            icon={<Type className="h-4 w-4" />}
            label="Título"
            detail={`${draft.videoTitle.length}/100`}
            payloadKind="text"
          />
          <AssetRow
            mode={mode}
            icon={<FileText className="h-4 w-4" />}
            label="Descrição (com chapters)"
            detail={`${draft.videoDescription.length} chars`}
            payloadKind="text"
          />
          <AssetRow
            mode={mode}
            icon={<Hash className="h-4 w-4" />}
            label="Tags"
            detail={`${draft.tags.length} tags`}
            payloadKind="text"
          />
          <AssetRow
            mode={mode}
            icon={<MessageSquare className="h-4 w-4" />}
            label="Pinned comment"
            detail="ready"
            payloadKind="text"
          />
        </CardContent>
      </Card>

      {/* Mode-specific actions */}
      {mode === 'bundle' ? <BundleActions /> : <DirectActions draft={draft} />}
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex rounded-full border bg-muted p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange('bundle')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition ${
          mode === 'bundle' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'
        }`}
      >
        <Package className="h-3.5 w-3.5" /> Bundle handoff
      </button>
      <button
        type="button"
        onClick={() => onChange('direct')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition ${
          mode === 'direct' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'
        }`}
      >
        <Youtube className="h-3.5 w-3.5" /> Direct publish
      </button>
    </div>
  );
}

function AssetRow({
  mode, icon, label, detail, payloadKind,
}: {
  mode: Mode;
  icon: React.ReactNode;
  label: string;
  detail: string;
  payloadKind: 'image' | 'text';
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
        <Check className="h-3.5 w-3.5" />
      </div>
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground truncate">{detail}</p>
      </div>
      {mode === 'bundle' ? (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
            <Copy className="h-3 w-3" /> Copy
          </Button>
          {payloadKind === 'image' && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
              <Download className="h-3 w-3" />
            </Button>
          )}
        </div>
      ) : (
        <Badge variant="outline" className="text-[10px]">api</Badge>
      )}
    </div>
  );
}

function BundleActions() {
  return (
    <div className="space-y-3">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium">Baixe tudo de uma vez</p>
            <p className="text-[11px] text-muted-foreground">
              ZIP com imagens + .txt com título, descrição, tags, pinned comment, lower-third cues.
            </p>
          </div>
          <Button size="lg" className="gap-2">
            <Download className="h-4 w-4" /> Download bundle (.zip)
          </Button>
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted-foreground text-center">
        Próximo passo: sobe o vídeo no YouTube Studio e cola esses assets nos campos correspondentes.
      </p>
    </div>
  );
}

function DirectActions({ draft }: { draft: MockVideoDraft }) {
  return (
    <div className="space-y-3">
      {/* Video upload */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="h-4 w-4" /> Vídeo final (.mp4)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="aspect-[5/1] rounded border-2 border-dashed flex flex-col items-center justify-center text-sm text-muted-foreground gap-1 hover:border-primary transition cursor-pointer">
            <Upload className="h-5 w-5" />
            Arraste o .mp4 ou clique pra escolher
            <span className="text-[10px]">até 256 GB · h.264 / VP9</span>
          </div>
        </CardContent>
      </Card>

      {/* API-only fields */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Campos exclusivos da API</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Texto + imagens já vêm do bundle. Aqui só o que o YouTube exige no upload.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Input defaultValue={draft.category} />
            </Field>
            <Field label="Language">
              <Input defaultValue={draft.language} />
            </Field>
          </div>

          <div>
            <Label className="text-xs flex items-center gap-1.5 mb-2">
              <Eye className="h-3.5 w-3.5" /> Visibility
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(['public', 'unlisted', 'private'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`rounded border px-3 py-2 text-sm capitalize transition ${
                    draft.visibility === v ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="schedule" className="text-xs flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Agendar publicação
            </Label>
            <Switch id="schedule" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="kids" className="text-xs">Made for kids</Label>
            <Switch id="kids" defaultChecked={draft.madeForKids} />
          </div>
        </CardContent>
      </Card>

      <Button size="lg" className="w-full gap-2 bg-rose-600 hover:bg-rose-700 text-white">
        <Youtube className="h-4 w-4" /> Publicar no YouTube
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
