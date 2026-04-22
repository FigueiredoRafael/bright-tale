'use client';

import { Target, Eye, Sparkles } from 'lucide-react';
import type { IdeaRow } from '@/app/[locale]/(app)/ideas/[id]/page.client';
import { InlineEditableText } from './InlineEditableText';
import { MonetizationHypothesisCard } from './MonetizationHypothesisCard';
import { RepurposePotentialCard } from './RepurposePotentialCard';
import { RiskFlagsCard } from './RiskFlagsCard';
import { ResearchSummaryBanner } from './ResearchSummaryBanner';
import { parseIdea } from './parseIdea';

interface Props {
  idea: IdeaRow;
  onPatchDiscovery: (partial: Record<string, unknown>) => Promise<IdeaRow>;
  onIdeaUpdated: (next: IdeaRow) => void;
}

function d(idea: IdeaRow): Record<string, unknown> {
  return idea.discovery_data ?? {};
}

export function IdeaNarrativeColumn({ idea, onPatchDiscovery, onIdeaUpdated }: Props) {
  const disc = d(idea);
  const coreTension = idea.core_tension ?? '';
  const scrollStopper = (disc.scroll_stopper as string | undefined) ?? '';
  const curiosityGap = (disc.curiosity_gap as string | undefined) ?? '';
  const monetization = disc.monetization_hypothesis as any;
  const legacyMonetization = disc.monetization as any;
  const repurpose = disc.repurpose_potential as any;
  const riskFlags = (disc.risk_flags as string[] | undefined) ?? [];

  async function savePartial(partial: Record<string, unknown>) {
    const next = await onPatchDiscovery(partial);
    onIdeaUpdated(next);
  }

  return (
    <div className="space-y-5">
      <ResearchSummaryBanner
        researchSessionId={idea.research_session_id}
        researchSummary={(idea as any).research_summary ?? null}
        researchVerified={(idea as any).research_verified ?? null}
      />

      <SectionCard icon={<Target className="h-3.5 w-3.5" />} label="Core Tension">
        <InlineEditableText
          value={coreTension}
          multiline
          ariaLabel="Core tension"
          onSave={async (next) => {
            // Top-level field, not under discovery_data
            const res = await fetch(`/api/ideas/library/${idea.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ core_tension: next }),
            });
            const json = await res.json();
            if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed');
            onIdeaUpdated(parseIdea(json.data.idea));
          }}
        />
      </SectionCard>

      <QuoteCard icon={<Eye className="h-3.5 w-3.5" />} label="Scroll Stopper">
        <InlineEditableText
          value={scrollStopper}
          multiline
          ariaLabel="Scroll stopper"
          onSave={async (next) => { await savePartial({ scroll_stopper: next }); }}
        />
      </QuoteCard>

      <QuoteCard icon={<Sparkles className="h-3.5 w-3.5" />} label="Curiosity Gap">
        <InlineEditableText
          value={curiosityGap}
          multiline
          ariaLabel="Curiosity gap"
          onSave={async (next) => { await savePartial({ curiosity_gap: next }); }}
        />
      </QuoteCard>

      <MonetizationHypothesisCard
        hypothesis={monetization}
        legacy={legacyMonetization}
        onSave={async (payload) => { await savePartial({ monetization_hypothesis: payload }); }}
      />

      <RepurposePotentialCard
        value={repurpose}
        onSave={async (payload) => { await savePartial({ repurpose_potential: payload }); }}
      />

      <RiskFlagsCard
        flags={riskFlags}
        onSave={async (payload) => { await savePartial({ risk_flags: payload }); }}
      />
    </div>
  );
}

function SectionCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {icon} {label}
      </div>
      {children}
    </div>
  );
}

function QuoteCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-l-4 border-primary/40 bg-card/30 p-4 pl-5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {icon} {label}
      </div>
      <div className="text-lg italic text-foreground/90">{children}</div>
    </div>
  );
}
