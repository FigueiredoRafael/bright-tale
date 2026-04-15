'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Lightbulb, Search, FileText, CheckCircle, Image, Eye, Globe,
  ChevronDown, ChevronUp, RotateCcw,
} from 'lucide-react';
import type { PipelineStage, PipelineState } from '@/components/engines/types';

const STAGE_META: Record<PipelineStage, { icon: typeof Lightbulb; label: string; color: string }> = {
  brainstorm: { icon: Lightbulb, label: 'Idea', color: 'text-yellow-500' },
  research: { icon: Search, label: 'Research', color: 'text-blue-500' },
  draft: { icon: FileText, label: 'Draft', color: 'text-purple-500' },
  review: { icon: CheckCircle, label: 'Review', color: 'text-green-500' },
  assets: { icon: Image, label: 'Assets', color: 'text-pink-500' },
  preview: { icon: Eye, label: 'Preview', color: 'text-indigo-500' },
  publish: { icon: Globe, label: 'Published', color: 'text-emerald-500' },
};

interface CompletedStageSummaryProps {
  stage: PipelineStage;
  stageResults: PipelineState['stageResults'];
  onRevisit: (stage: PipelineStage) => void;
}

export function CompletedStageSummary({ stage, stageResults, onRevisit }: CompletedStageSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = STAGE_META[stage];
  const Icon = meta.icon;
  const result = stageResults[stage];
  if (!result) return null;

  function getSummary(): string {
    switch (stage) {
      case 'brainstorm': {
        const r = stageResults.brainstorm;
        return r ? `${r.ideaTitle} (${r.ideaVerdict})` : '';
      }
      case 'research': {
        const r = stageResults.research;
        return r ? `${r.approvedCardsCount} cards approved · ${r.researchLevel} depth` : '';
      }
      case 'draft': {
        const r = stageResults.draft;
        return r ? r.draftTitle : '';
      }
      case 'review': {
        const r = stageResults.review;
        return r ? `Score: ${r.score}/100 · ${r.verdict} · ${r.iterationCount} iteration(s)` : '';
      }
      case 'assets': {
        const r = stageResults.assets;
        return r ? `${r.assetIds.length} assets` : '';
      }
      case 'preview': {
        const r = stageResults.preview;
        return r ? `${r.categories.length} categories · ${r.tags.length} tags` : '';
      }
      case 'publish': {
        const r = stageResults.publish;
        return r ? `Published: ${r.publishedUrl}` : '';
      }
      default:
        return '';
    }
  }

  return (
    <Card className="border-green-500/30 bg-green-500/5">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          <Icon className={`h-4 w-4 ${meta.color} shrink-0`} />
          <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-600 dark:text-green-400">
            Done
          </Badge>
          <span className="text-sm font-medium">{meta.label}</span>
          <span className="text-xs text-muted-foreground truncate flex-1">{getSummary()}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onRevisit(stage)}>
            <RotateCcw className="h-3 w-3 mr-1" /> Change
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
        {expanded && (
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
