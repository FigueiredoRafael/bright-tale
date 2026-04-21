'use client';

import Link from 'next/link';
import { BookOpen, Check, ArrowRight } from 'lucide-react';

interface Props {
  researchSessionId: string | null;
  researchSummary?: string | null;
  researchVerified?: boolean | null;
}

export function ResearchSummaryBanner({ researchSessionId, researchSummary, researchVerified }: Props) {
  if (!researchSessionId) return null;

  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-blue-400 mb-2">
        <BookOpen className="h-3.5 w-3.5" /> Research
        {researchVerified && (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <Check className="h-3 w-3" /> verified
          </span>
        )}
      </div>
      {researchSummary && <p className="text-sm text-foreground/80 mb-3">{researchSummary}</p>}
      <Link
        href={`/en/research/${researchSessionId}`}
        className="inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
      >
        View full research <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
