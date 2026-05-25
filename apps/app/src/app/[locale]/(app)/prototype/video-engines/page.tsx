'use client';

// PROTOTYPE — Video pipeline engine redesign (consolidated).
// One panel per stage — Assets, Preview, Publish — built around the actual
// scope: gera texto + imagens, sem simular YouTube Studio. Hit:
//   /en/prototype/video-engines?stage=assets
// Stage tabs swap the panel. Throwaway directory; delete when folded in.

import { Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MOCK_VIDEO_DRAFT } from './mock-data';
import { AssetsPanel } from './AssetsPanel';
import { PreviewPanel } from './PreviewPanel';
import { PublishPanel } from './PublishPanel';

type Stage = 'assets' | 'preview' | 'publish';

export default function VideoEnginesPrototypePage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const stage = (params?.get('stage') as Stage) ?? 'assets';

  function setStage(s: Stage) {
    const next = new URLSearchParams(params?.toString() ?? '');
    next.set('stage', s);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="p-6 pb-12 space-y-5">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">Video pipeline · engine prototype</h1>
          <span className="text-xs uppercase tracking-wider rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2 py-0.5">
            throwaway
          </span>
        </div>
        <p className="text-xs text-muted-foreground max-w-2xl">
          Escopo: gera texto + imagens. Não substitui YouTube Studio. Usuário leva o bundle pra um editor externo e publica via Studio OU push direto pela API.
        </p>
      </header>

      <Tabs value={stage} onValueChange={(s) => setStage(s as Stage)}>
        <TabsList>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="publish">Publish</TabsTrigger>
        </TabsList>
      </Tabs>

      {stage === 'assets' && <AssetsPanel draft={MOCK_VIDEO_DRAFT} />}
      {stage === 'preview' && <PreviewPanel draft={MOCK_VIDEO_DRAFT} />}
      {stage === 'publish' && <PublishPanel draft={MOCK_VIDEO_DRAFT} />}
    </div>
  );
}
