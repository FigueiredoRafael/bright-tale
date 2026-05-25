'use client';

// PROTOTYPE — Preview (consolidated). Scope: revisão do bundle antes da
// entrega. Topo: inventário visual (o que está pronto, o que falta).
// Esquerda: viewer-style preview (gut-check de thumbnail + título + descrição).
// Direita: teleprompter do roteiro (revisão falada antes de gravar).

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Check, Play, Mic, Clock, Image as ImageIcon, Camera, Type,
  FileText, MessageSquare, Hash,
} from 'lucide-react';
import type { MockVideoDraft } from './mock-data';

export function PreviewPanel({ draft }: { draft: MockVideoDraft }) {
  const brollCount = draft.script.chapters.reduce((n, c) => n + c.broll.length, 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Bundle preview</h1>
        <p className="text-xs text-muted-foreground">
          Última revisão antes de entregar. Confere o que o espectador vê e como o roteiro soa em voz alta.
        </p>
      </header>

      {/* Inventory strip */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-2">
            <InventoryPill icon={<ImageIcon className="h-3 w-3" />} label="Thumbnail" detail={`${draft.thumbnailIdeas.length} conceitos`} ok />
            <InventoryPill icon={<Camera className="h-3 w-3" />} label="B-roll" detail={`${brollCount} prompts`} ok />
            <InventoryPill icon={<Type className="h-3 w-3" />} label="Lower thirds" detail={`${draft.lowerThirds.length}`} ok />
            <InventoryPill icon={<FileText className="h-3 w-3" />} label="Descrição" ok />
            <InventoryPill icon={<Hash className="h-3 w-3" />} label="Tags" detail={`${draft.tags.length}`} ok />
            <InventoryPill icon={<MessageSquare className="h-3 w-3" />} label="Pinned comment" ok />
          </div>
        </CardContent>
      </Card>

      {/* Split — viewer preview / teleprompter */}
      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
        {/* Viewer-style card */}
        <div className="space-y-3">
          <Card className="overflow-hidden">
            <div className="aspect-video bg-black relative">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-rose-900 to-slate-800 flex items-center justify-center">
                <div className="text-center text-white px-4">
                  <p className="text-3xl font-black tracking-tight leading-none">{draft.thumbnail.headline}</p>
                  <p className="text-xs mt-1.5 opacity-80">{draft.thumbnail.subhead}</p>
                </div>
              </div>
              <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                {draft.estimatedDuration}
              </div>
              <button className="absolute inset-0 flex items-center justify-center group">
                <div className="bg-white/20 backdrop-blur rounded-full p-3 group-hover:scale-110 transition">
                  <Play className="h-6 w-6 text-white fill-white" />
                </div>
              </button>
            </div>
            <CardContent className="py-3 space-y-2">
              <p className="text-sm font-semibold leading-snug line-clamp-2">{draft.videoTitle}</p>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-rose-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">{draft.channel.name}</p>
                  <p className="text-[10px] text-muted-foreground">{draft.channel.subscribers} subs</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                {draft.videoDescription}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5" /> Pinned comment
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] text-muted-foreground">
              {draft.pinnedComment}
            </CardContent>
          </Card>
        </div>

        {/* Teleprompter */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mic className="h-4 w-4" /> Teleprompter — revisão falada
              <Badge variant="outline" className="ml-auto text-[10px] gap-1">
                <Clock className="h-3 w-3" /> {draft.estimatedDuration}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-[15px] leading-[1.7] max-h-[640px] overflow-y-auto">
            <ScriptSection label="HOOK · 0:00" body={draft.script.hook.content} />
            <ScriptSection label="PROBLEM · 0:42" body={draft.script.problem.content} />
            {draft.script.chapters.map((ch, i) => (
              <ScriptSection
                key={i}
                label={`CHAPTER ${i + 1} · ${ch.duration}`}
                title={ch.title}
                body={ch.content}
                lowerThird={draft.lowerThirds[i + 1]}
              />
            ))}
            <ScriptSection label="OUTRO" body={draft.script.outro.cta} />
          </CardContent>
        </Card>
      </div>

      <footer className="flex items-center justify-between border-t pt-3">
        <p className="text-xs text-muted-foreground">
          Tudo pronto · revisado · sem warnings
        </p>
        <Button size="lg">Aprovar bundle → Publish</Button>
      </footer>
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function InventoryPill({
  icon, label, detail, ok,
}: { icon: React.ReactNode; label: string; detail?: string; ok?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
      ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-muted-foreground/30'
    }`}>
      {ok ? <Check className="h-3 w-3" /> : icon}
      <span className="font-medium">{label}</span>
      {detail && <span className="text-muted-foreground">· {detail}</span>}
    </div>
  );
}

function ScriptSection({
  label, title, body, lowerThird,
}: {
  label: string;
  title?: string;
  body: string;
  lowerThird?: { at: string; label: string };
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {lowerThird && (
          <span className="text-[10px] rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 border border-amber-500/30 font-mono">
            ⌞ {lowerThird.at} · {lowerThird.label}
          </span>
        )}
      </div>
      {title && <h3 className="text-lg font-semibold leading-snug">{title}</h3>}
      <p className="whitespace-pre-wrap">{body}</p>
    </section>
  );
}
