'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lightbulb, Search, FileText, ArrowLeft, Eye } from 'lucide-react';
import type { PipelineContext, PipelineStage } from './types';

interface ContextBannerProps {
  stage: PipelineStage;
  context: PipelineContext;
  onBack?: (targetStage?: PipelineStage) => void;
}

export function ContextBanner({ stage, context, onBack }: ContextBannerProps) {
  if (stage === 'brainstorm') return null;

  const items: { icon: typeof Lightbulb; label: string; detail: string; backTo: PipelineStage }[] = [];

  if (context.ideaTitle) {
    items.push({
      icon: Lightbulb,
      label: 'Idea',
      detail: `${context.ideaTitle}${context.ideaVerdict ? ` (${context.ideaVerdict})` : ''}`,
      backTo: 'brainstorm',
    });
  }

  if (stage !== 'research' && context.researchSessionId) {
    items.push({
      icon: Search,
      label: 'Research',
      detail: `${context.approvedCardsCount ?? 0} cards approved · ${context.researchLevel ?? 'unknown'} depth`,
      backTo: 'research',
    });
  }

  if (['preview', 'review', 'assets', 'publish'].includes(stage) && context.draftTitle) {
    items.push({
      icon: FileText,
      label: 'Draft',
      detail: context.draftTitle,
      backTo: 'draft',
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex items-center gap-3 text-sm"
          >
            <Icon className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-xs text-muted-foreground">{item.label}:</span>
            <span className="truncate flex-1">{item.detail}</span>
            {onBack && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => onBack(item.backTo)}
              >
                <ArrowLeft className="h-3 w-3 mr-1" /> Change
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
