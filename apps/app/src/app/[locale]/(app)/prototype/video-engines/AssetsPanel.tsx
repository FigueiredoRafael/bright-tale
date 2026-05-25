'use client';

// PROTOTYPE — Assets (consolidated). Scope: gerar texto + imagens só.
// Não simula YouTube Studio. Toggle global "Gerar aqui / Só prompts" no topo
// muda o comportamento das seções de imagem (thumbnail + b-roll por capítulo +
// hook visual). Textos sempre internos, com botão Copy por bloco.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Image as ImageIcon, Sparkles, Copy, Wand2, Type, MessageSquare, Hash,
  FileText, ChevronDown, Camera, GripVertical,
} from 'lucide-react';
import type { MockVideoDraft } from './mock-data';

type ImageMode = 'generate' | 'prompts-only';

export function AssetsPanel({ draft }: { draft: MockVideoDraft }) {
  const [mode, setMode] = useState<ImageMode>('generate');

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Asset bundle</h1>
          <p className="text-xs text-muted-foreground">
            Tudo que vai sair junto pro editor + YouTube. Imagens conforme o modo escolhido; textos sempre gerados aqui.
          </p>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </header>

      {/* IMAGE SECTION 1 — Thumbnail */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> Thumbnail
            <Badge variant="outline" className="ml-auto text-[10px]">
              {draft.thumbnailIdeas.length} conceitos
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {draft.thumbnailIdeas.map((t, i) => (
              <ImageConcept
                key={i}
                mode={mode}
                title={t.title}
                mood={t.mood}
                brief={t.brief}
                selected={i === 0}
                preview={
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-rose-900 text-white flex items-center justify-center text-xs font-bold p-2 text-center">
                    {t.title}
                  </div>
                }
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* IMAGE SECTION 2 — Per-chapter b-roll + lower-third (timeline) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Camera className="h-4 w-4" /> Capítulos · B-roll + lower thirds
            <Badge variant="outline" className="ml-auto text-[10px]">
              {draft.script.chapters.length} capítulos
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-1 px-1 pb-2">
            <div className="flex items-stretch gap-3 min-w-max">
              {draft.script.chapters.map((ch, i) => (
                <ChapterCard
                  key={i}
                  mode={mode}
                  index={i + 1}
                  title={ch.title}
                  duration={ch.duration}
                  brollPrompts={ch.broll}
                  lowerThird={draft.lowerThirds[i + 1]?.label ?? ''}
                  lowerThirdAt={draft.lowerThirds[i + 1]?.at ?? ''}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* IMAGE SECTION 3 — Hook visual */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wand2 className="h-4 w-4" /> Hook visual (primeiros 3 segundos)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ImageConcept
            mode={mode}
            title="Frame inicial"
            mood="Pattern interrupt"
            brief={draft.thumbnail.facePromptHint}
            preview={
              <div className="absolute inset-0 bg-gradient-to-br from-amber-700 to-rose-700 text-white flex items-center justify-center text-sm font-bold p-3 text-center">
                {draft.thumbnail.headline}
              </div>
            }
          />
        </CardContent>
      </Card>

      {/* TEXT BUNDLE */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TextBlock
          icon={<Type className="h-4 w-4" />}
          title="Título do vídeo"
          body={draft.videoTitle}
          alternatives={draft.titleOptions.slice(1)}
        />
        <TextBlock
          icon={<Hash className="h-4 w-4" />}
          title="Tags"
          body={draft.tags.join(', ')}
          tagged
        />
        <TextBlock
          icon={<FileText className="h-4 w-4" />}
          title="Descrição (com chapters)"
          body={draft.videoDescription}
          big
        />
        <TextBlock
          icon={<MessageSquare className="h-4 w-4" />}
          title="Pinned comment"
          body={draft.pinnedComment}
        />
      </section>

      <footer className="flex items-center justify-between border-t pt-3">
        <p className="text-xs text-muted-foreground">
          Bundle pronto · 3 grupos de imagens · 4 blocos de texto · modo: <strong>{mode === 'generate' ? 'gerar aqui' : 'só prompts'}</strong>
        </p>
        <Button>Finalizar assets → Preview</Button>
      </footer>
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: ImageMode; onChange: (m: ImageMode) => void }) {
  return (
    <div className="inline-flex rounded-full border bg-muted p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange('generate')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition ${
          mode === 'generate' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'
        }`}
      >
        <Sparkles className="h-3.5 w-3.5" /> Gerar aqui
      </button>
      <button
        type="button"
        onClick={() => onChange('prompts-only')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition ${
          mode === 'prompts-only' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'
        }`}
      >
        <Copy className="h-3.5 w-3.5" /> Só prompts
      </button>
    </div>
  );
}

function ImageConcept({
  mode,
  title,
  mood,
  brief,
  preview,
  selected,
}: {
  mode: ImageMode;
  title: string;
  mood?: string;
  brief: string;
  preview: React.ReactNode;
  selected?: boolean;
}) {
  if (mode === 'prompts-only') {
    return (
      <div className="rounded border p-3 space-y-2 bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">{title}</p>
          {selected && <Badge className="text-[10px]">selected</Badge>}
        </div>
        {mood && <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{mood}</p>}
        <Textarea defaultValue={brief} rows={3} className="font-mono text-[11px]" />
        <Button size="sm" variant="outline" className="gap-1.5 w-full text-xs">
          <Copy className="h-3 w-3" /> Copiar prompt
        </Button>
      </div>
    );
  }
  return (
    <figure className="space-y-1.5">
      <div className={`aspect-video rounded border relative overflow-hidden ${selected ? 'ring-2 ring-primary' : ''}`}>
        {preview}
        {selected && <Badge className="absolute top-1 right-1 text-[9px]">selected</Badge>}
      </div>
      <figcaption className="text-[11px] text-muted-foreground line-clamp-2">{brief}</figcaption>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" className="h-7 text-xs flex-1 gap-1">
          <Sparkles className="h-3 w-3" /> Regenerar
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs flex-1 gap-1">
          <Copy className="h-3 w-3" /> Prompt
        </Button>
      </div>
    </figure>
  );
}

function ChapterCard({
  mode,
  index,
  title,
  duration,
  brollPrompts,
  lowerThird,
  lowerThirdAt,
}: {
  mode: ImageMode;
  index: number;
  title: string;
  duration: string;
  brollPrompts: string[];
  lowerThird: string;
  lowerThirdAt: string;
}) {
  return (
    <Card className="w-[280px] shrink-0">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">CH {index}</Badge>
          <span className="flex items-center gap-1">
            <GripVertical className="h-3 w-3" /> {duration}
          </span>
        </div>
        <p className="text-xs font-medium leading-snug line-clamp-2">{title}</p>

        {/* B-roll */}
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">B-roll · {brollPrompts.length}</p>
          {brollPrompts.slice(0, 2).map((b, i) => (
            <div key={i} className="rounded border bg-muted/30 p-1.5 space-y-1">
              {mode === 'generate' ? (
                <div className="aspect-video rounded bg-gradient-to-br from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center">
                  <Camera className="h-4 w-4 opacity-50" />
                </div>
              ) : null}
              <p className="text-[10px] text-muted-foreground line-clamp-2">{b}</p>
              <button className="text-[10px] text-primary hover:underline w-full text-left flex items-center gap-1">
                <Copy className="h-2.5 w-2.5" /> {mode === 'generate' ? 'copiar prompt' : 'copiar'}
              </button>
            </div>
          ))}
        </div>

        {/* Lower third */}
        {lowerThird && (
          <div className="rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2 py-1.5 space-y-0.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-mono">{lowerThirdAt}</span>
              <span className="uppercase tracking-wider opacity-70">lower third</span>
            </div>
            <p className="text-[11px] font-medium">{lowerThird}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TextBlock({
  icon,
  title,
  body,
  alternatives,
  tagged,
  big,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  alternatives?: string[];
  tagged?: boolean;
  big?: boolean;
}) {
  return (
    <Card className={big ? 'md:col-span-2' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon}
          {title}
          <Button size="sm" variant="ghost" className="ml-auto h-7 gap-1 text-xs">
            <Copy className="h-3 w-3" /> Copy
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {tagged ? (
          <div className="flex flex-wrap gap-1">
            {body.split(',').map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">
                #{t.trim()}
              </Badge>
            ))}
          </div>
        ) : (
          <Textarea defaultValue={body} rows={big ? 8 : 3} className="text-xs" />
        )}
        {alternatives && alternatives.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
              <ChevronDown className="h-3 w-3" /> {alternatives.length} alternativas
            </summary>
            <ul className="mt-1.5 space-y-1">
              {alternatives.map((alt) => (
                <li key={alt} className="rounded border px-2 py-1 hover:bg-muted cursor-pointer text-[11px]">
                  {alt}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
