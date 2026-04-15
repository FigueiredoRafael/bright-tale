'use client';

import { useRouter } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import {
  Lightbulb, Search, FileText, CheckCircle, Image, Globe, Check,
} from 'lucide-react';

export type PipelineStep =
  | 'brainstorm'
  | 'research'
  | 'draft'
  | 'review'
  | 'assets'
  | 'published';

const STEPS: { key: PipelineStep; label: string; icon: typeof Lightbulb }[] = [
  { key: 'brainstorm', label: 'Idea', icon: Lightbulb },
  { key: 'research', label: 'Research', icon: Search },
  { key: 'draft', label: 'Draft', icon: FileText },
  { key: 'review', label: 'Review', icon: CheckCircle },
  { key: 'assets', label: 'Assets', icon: Image },
  { key: 'published', label: 'Published', icon: Globe },
];

interface PipelineStagesProps {
  currentStep: PipelineStep;
  channelId?: string;
  draftId?: string;
  projectId?: string;
  projectTitle?: string;
  ideaTitle?: string;
  brainstormSessionId?: string;
  researchSessionId?: string;
}

function buildStepUrl(
  step: PipelineStep,
  channelId?: string,
  draftId?: string,
  projectId?: string,
  brainstormSessionId?: string,
  researchSessionId?: string,
): string | null {
  if (!channelId) return null;
  switch (step) {
    case 'brainstorm':
      return brainstormSessionId
        ? `/channels/${channelId}/brainstorm/${brainstormSessionId}`
        : `/channels/${channelId}/brainstorm/new`;
    case 'research':
      return researchSessionId
        ? `/channels/${channelId}/research/${researchSessionId}`
        : `/channels/${channelId}/research/new`;
    case 'draft':
      return draftId
        ? `/channels/${channelId}/drafts/${draftId}`
        : `/channels/${channelId}/drafts/new`;
    case 'review':
      return draftId ? `/channels/${channelId}/drafts/${draftId}?tab=review` : null;
    case 'assets':
      return draftId ? `/channels/${channelId}/drafts/${draftId}?tab=assets` : null;
    case 'published':
      return draftId ? `/channels/${channelId}/drafts/${draftId}?tab=publish` : null;
    default:
      return null;
  }
}

export function PipelineStages({
  currentStep,
  channelId,
  draftId,
  projectId,
  projectTitle,
  ideaTitle,
  brainstormSessionId,
  researchSessionId,
}: PipelineStagesProps) {
  const router = useRouter();
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="border-b bg-muted/20 px-4 py-2">
      {/* Project/idea context */}
      {(projectTitle || ideaTitle) && (
        <div className="flex items-center gap-2 mb-1.5 text-xs text-muted-foreground">
          {projectTitle && (
            <Badge
              variant="outline"
              className="text-[10px] cursor-pointer hover:bg-muted"
              onClick={() => projectId && router.push(`/projects/${projectId}`)}
            >
              {projectTitle}
            </Badge>
          )}
          {ideaTitle && <span className="truncate">{ideaTitle}</span>}
        </div>
      )}

      {/* Steps */}
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isDone = i < currentIndex;
          const isActive = i === currentIndex;
          const isClickable = isDone || isActive;
          const url = isClickable ? buildStepUrl(step.key, channelId, draftId, projectId, brainstormSessionId, researchSessionId) : null;

          return (
            <div key={step.key} className="flex items-center shrink-0">
              {i > 0 && (
                <div className={`w-4 h-px mx-0.5 ${isDone ? 'bg-green-500' : 'bg-border'}`} />
              )}
              <button
                type="button"
                disabled={!url}
                onClick={() => url && router.push(url)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  isDone
                    ? 'text-green-600 dark:text-green-400 hover:bg-green-500/10 cursor-pointer'
                    : isActive
                    ? 'text-primary font-medium bg-primary/10'
                    : 'text-muted-foreground cursor-default'
                } ${url ? '' : 'cursor-default'}`}
              >
                {isDone ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
