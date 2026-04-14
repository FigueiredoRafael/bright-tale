'use client';

import { Badge } from '@/components/ui/badge';
import {
  Lightbulb, Search, FileText, CheckCircle, Image, Globe, Check,
} from 'lucide-react';

export type PipelineStep =
  | 'brainstorm'
  | 'research'
  | 'production'
  | 'review'
  | 'assets'
  | 'published';

const STEPS: { key: PipelineStep; label: string; icon: typeof Lightbulb }[] = [
  { key: 'brainstorm', label: 'Brainstorm', icon: Lightbulb },
  { key: 'research', label: 'Research', icon: Search },
  { key: 'production', label: 'Production', icon: FileText },
  { key: 'review', label: 'Review', icon: CheckCircle },
  { key: 'assets', label: 'Assets', icon: Image },
  { key: 'published', label: 'Published', icon: Globe },
];

interface PipelineStagesProps {
  currentStep: PipelineStep;
  projectTitle?: string;
  ideaTitle?: string;
}

export function PipelineStages({ currentStep, projectTitle, ideaTitle }: PipelineStagesProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="border-b bg-muted/20 px-4 py-2">
      {/* Project/idea context */}
      {(projectTitle || ideaTitle) && (
        <div className="flex items-center gap-2 mb-1.5 text-xs text-muted-foreground">
          {projectTitle && <Badge variant="outline" className="text-[10px]">{projectTitle}</Badge>}
          {ideaTitle && <span className="truncate">{ideaTitle}</span>}
        </div>
      )}

      {/* Steps */}
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isDone = i < currentIndex;
          const isActive = i === currentIndex;

          return (
            <div key={step.key} className="flex items-center shrink-0">
              {i > 0 && (
                <div className={`w-4 h-px mx-0.5 ${isDone ? 'bg-green-500' : 'bg-border'}`} />
              )}
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  isDone
                    ? 'text-green-600 dark:text-green-400'
                    : isActive
                    ? 'text-primary font-medium bg-primary/10'
                    : 'text-muted-foreground'
                }`}
              >
                {isDone ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
