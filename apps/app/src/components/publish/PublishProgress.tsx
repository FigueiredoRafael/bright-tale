'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Check, Loader2, X, ExternalLink, Upload, FileText,
  FolderOpen, Tag, Globe, Sparkles, ImageIcon,
} from 'lucide-react';

interface PublishProgressProps {
  publishBody: Record<string, unknown>;
  onComplete: (result: { wordpressPostId: number; publishedUrl: string }) => void;
  onError: (message: string) => void;
}

interface StepEvent {
  step: string;
  progress?: number;
  total?: number;
  message?: string;
  error?: boolean;
  result?: { wordpress_post_id: number; published_url: string };
}

const STEPS = [
  { key: 'preparing', label: 'Preparing content', icon: FileText },
  { key: 'uploading_featured', label: 'Featured image', icon: ImageIcon },
  { key: 'uploading_images', label: 'Section images', icon: Upload },
  { key: 'composing', label: 'Composing HTML', icon: Sparkles },
  { key: 'categories', label: 'Categories', icon: FolderOpen },
  { key: 'tags', label: 'Tags', icon: Tag },
  { key: 'publishing', label: 'Publishing', icon: Globe },
];

export function PublishProgress({ publishBody, onComplete, onError }: PublishProgressProps) {
  const [currentStep, setCurrentStep] = useState<string>('preparing');
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [errorStep, setErrorStep] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progressInfo, setProgressInfo] = useState<{ current: number; total: number } | null>(null);
  const [activeMsg, setActiveMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ wordpressPostId: number; publishedUrl: string } | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (started) return;
    setStarted(true);

    async function stream() {
      try {
        const response = await fetch('/api/wordpress/publish-draft/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(publishBody),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          const msg = data?.error?.message ?? `HTTP ${response.status}: ${response.statusText}`;
          setErrorStep('preparing');
          setErrorMsg(msg);
          onError(msg);
          return;
        }

        if (!response.body) {
          onError('No response stream');
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(trimmed.slice(6)) as StepEvent;
              processEvent(event);
            } catch {
              // skip malformed
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim().startsWith('data: ')) {
          try {
            const event = JSON.parse(buffer.trim().slice(6)) as StepEvent;
            processEvent(event);
          } catch { /* skip */ }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Connection failed';
        setErrorStep(currentStep);
        setErrorMsg(msg);
        onError(msg);
      }
    }

    function processEvent(event: StepEvent) {
      if (event.error) {
        setErrorStep(event.step);
        setErrorMsg(event.message ?? 'Unknown error');
        onError(event.message ?? 'Unknown error');
        return;
      }

      if (event.step === 'done' && event.result) {
        // Mark all steps done
        setCompletedSteps(new Set(STEPS.map((s) => s.key)));
        setCurrentStep('done');
        setActiveMsg(null);
        setProgressInfo(null);
        const r = {
          wordpressPostId: event.result.wordpress_post_id,
          publishedUrl: event.result.published_url,
        };
        setResult(r);
        onComplete(r);
        return;
      }

      // Mark previous steps as done
      const stepIdx = STEPS.findIndex((s) => s.key === event.step);
      if (stepIdx >= 0) {
        setCompletedSteps((prev) => {
          const next = new Set(prev);
          for (let i = 0; i < stepIdx; i++) next.add(STEPS[i].key);
          return next;
        });
      }

      setCurrentStep(event.step);
      setActiveMsg(event.message ?? null);
      setProgressInfo(
        event.progress && event.total
          ? { current: event.progress, total: event.total }
          : null,
      );
    }

    void stream();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDone = result !== null;
  const totalSteps = STEPS.length;
  const doneCount = completedSteps.size;
  const overallProgress = isDone ? 100 : Math.round((doneCount / totalSteps) * 100);

  return (
    <Card className="overflow-hidden">
      {/* Overall progress bar at top */}
      <div className="h-1 bg-muted">
        <div
          className={`h-full transition-all duration-500 ease-out ${
            errorStep ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-primary'
          }`}
          style={{ width: `${overallProgress}%` }}
        />
      </div>

      <CardContent className="pt-5 pb-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">
              {isDone ? 'Published!' : errorStep ? 'Publishing Failed' : 'Publishing to WordPress...'}
            </h3>
            {!isDone && !errorStep && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {activeMsg ?? 'Starting...'}
              </p>
            )}
          </div>
          {!isDone && !errorStep && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {doneCount}/{totalSteps}
            </span>
          )}
        </div>

        {/* Steps grid */}
        <div className="grid grid-cols-7 gap-1">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const done = completedSteps.has(step.key);
            const active = currentStep === step.key && !isDone && !errorStep;
            const failed = errorStep === step.key;
            const pending = !done && !active && !failed;

            return (
              <div key={step.key} className="flex flex-col items-center gap-1.5">
                <div className={`
                  relative h-8 w-8 rounded-full flex items-center justify-center transition-all duration-300
                  ${done ? 'bg-green-500/15 text-green-500' : ''}
                  ${active ? 'bg-primary/15 text-primary ring-2 ring-primary/30' : ''}
                  ${failed ? 'bg-red-500/15 text-red-500' : ''}
                  ${pending ? 'bg-muted text-muted-foreground/40' : ''}
                `}>
                  {done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : failed ? (
                    <X className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                </div>
                <span className={`text-[9px] text-center leading-tight ${
                  done ? 'text-green-500' :
                  active ? 'text-primary font-medium' :
                  failed ? 'text-red-500' :
                  'text-muted-foreground/50'
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bar for multi-image uploads */}
        {progressInfo && !isDone && (
          <div className="space-y-1">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(progressInfo.current / progressInfo.total) * 100}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-right tabular-nums">
              {progressInfo.current} / {progressInfo.total}
            </p>
          </div>
        )}

        {/* Error */}
        {errorStep && errorMsg && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
            <p className="text-xs text-red-400">{errorMsg}</p>
          </div>
        )}

        {/* Success */}
        {isDone && result && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 space-y-2">
            <p className="text-xs text-green-400">
              Post is live on WordPress.
            </p>
            <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1.5">
              <a href={result.publishedUrl} target="_blank" rel="noopener noreferrer">
                View post <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
