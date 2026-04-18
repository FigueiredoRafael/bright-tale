'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Target,
  Users,
  Search,
  Sparkles,
  Megaphone,
  Eye,
  Repeat,
  DollarSign,
  BookOpen,
  Video,
  Mic,
  Zap,
} from 'lucide-react';

interface IdeaDetails {
  idea_id?: string;
  title: string;
  core_tension?: string;
  target_audience?: string;
  verdict?: 'viable' | 'weak' | 'experimental';
  angle?: string;
  search_intent?: string;
  primary_keyword?: {
    term?: string;
    difficulty?: string;
    monthly_volume_estimate?: string | number;
  };
  scroll_stopper?: string;
  curiosity_gap?: string;
  monetization?: {
    affiliate_angle?: string;
    product_fit?: string;
    sponsor_appeal?: string;
  };
  repurpose_potential?: {
    blog_angle?: string;
    video_angle?: string;
    shorts_hooks?: string[];
    podcast_angle?: string;
  };
  repurposing?: string[];
  risk_flags?: string[];
  verdict_rationale?: string;
}

interface Props {
  idea: IdeaDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IdeaDetailsDialog({ idea, open, onOpenChange }: Props) {
  if (!idea) return null;

  const verdictStyles =
    idea.verdict === 'viable'
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30'
      : idea.verdict === 'weak'
        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/30'
        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/30';
  const verdictDot =
    idea.verdict === 'viable'
      ? 'bg-emerald-500'
      : idea.verdict === 'weak'
        ? 'bg-rose-500'
        : 'bg-amber-500';

  const diffColor =
    idea.primary_keyword?.difficulty?.toLowerCase() === 'high'
      ? 'text-rose-500'
      : idea.primary_keyword?.difficulty?.toLowerCase() === 'medium'
        ? 'text-amber-500'
        : 'text-emerald-500';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-b from-muted/30 to-transparent">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {idea.idea_id && (
                  <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">
                    {idea.idea_id}
                  </span>
                )}
                {idea.verdict && (
                  <div
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${verdictStyles}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${verdictDot}`} />
                    {idea.verdict}
                  </div>
                )}
              </div>
              <DialogTitle className="text-lg leading-snug pr-8">{idea.title}</DialogTitle>
              {idea.verdict_rationale && (
                <DialogDescription className="mt-2 text-xs leading-relaxed">
                  {idea.verdict_rationale}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-6">
          {/* Core fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            {idea.core_tension && (
              <Section icon={<Target className="h-3.5 w-3.5" />} label="Core Tension">
                {idea.core_tension}
              </Section>
            )}
            {idea.target_audience && (
              <Section icon={<Users className="h-3.5 w-3.5" />} label="Target Audience">
                {idea.target_audience}
              </Section>
            )}
            {idea.angle && (
              <Section icon={<Sparkles className="h-3.5 w-3.5" />} label="Angle">
                {idea.angle}
              </Section>
            )}
            {idea.search_intent && (
              <Section icon={<Search className="h-3.5 w-3.5" />} label="Search Intent">
                {idea.search_intent}
              </Section>
            )}
          </div>

          {/* Primary keyword */}
          {idea.primary_keyword &&
            (idea.primary_keyword.term ||
              idea.primary_keyword.difficulty ||
              idea.primary_keyword.monthly_volume_estimate) && (
              <div className="rounded-lg border bg-card/50 p-4">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  <Zap className="h-3.5 w-3.5" /> Primary Keyword
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {idea.primary_keyword.term && (
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1">Term</div>
                      <div className="text-sm font-medium">{idea.primary_keyword.term}</div>
                    </div>
                  )}
                  {idea.primary_keyword.difficulty && (
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1">Difficulty</div>
                      <div className={`text-sm font-semibold capitalize ${diffColor}`}>
                        {idea.primary_keyword.difficulty}
                      </div>
                    </div>
                  )}
                  {idea.primary_keyword.monthly_volume_estimate && (
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1">
                        Monthly Volume
                      </div>
                      <div className="text-sm font-medium tabular-nums">
                        {Number(idea.primary_keyword.monthly_volume_estimate).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Hooks */}
          {(idea.scroll_stopper || idea.curiosity_gap) && (
            <div className="space-y-3">
              {idea.scroll_stopper && (
                <Quote icon={<Eye className="h-4 w-4" />} label="Scroll Stopper">
                  {idea.scroll_stopper}
                </Quote>
              )}
              {idea.curiosity_gap && (
                <Quote icon={<Sparkles className="h-4 w-4" />} label="Curiosity Gap">
                  {idea.curiosity_gap}
                </Quote>
              )}
            </div>
          )}

          {/* Monetization */}
          {idea.monetization &&
            (idea.monetization.affiliate_angle ||
              idea.monetization.product_fit ||
              idea.monetization.sponsor_appeal) && (
              <div className="rounded-lg border bg-card/50 p-4">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  <DollarSign className="h-3.5 w-3.5" /> Monetization
                </div>
                <div className="space-y-2.5">
                  {idea.monetization.affiliate_angle && (
                    <MiniField label="Affiliate Angle">
                      {idea.monetization.affiliate_angle}
                    </MiniField>
                  )}
                  {idea.monetization.product_fit && (
                    <MiniField label="Product Fit">{idea.monetization.product_fit}</MiniField>
                  )}
                  {idea.monetization.sponsor_appeal && (
                    <MiniField label="Sponsor Appeal">
                      {idea.monetization.sponsor_appeal}
                    </MiniField>
                  )}
                </div>
              </div>
            )}

          {/* Repurpose */}
          {idea.repurpose_potential &&
            (idea.repurpose_potential.blog_angle ||
              idea.repurpose_potential.video_angle ||
              idea.repurpose_potential.podcast_angle ||
              (idea.repurpose_potential.shorts_hooks &&
                idea.repurpose_potential.shorts_hooks.length > 0)) && (
              <div className="rounded-lg border bg-card/50 p-4">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  <Repeat className="h-3.5 w-3.5" /> Repurpose Potential
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {idea.repurpose_potential.blog_angle && (
                    <RepurposeCard
                      icon={<BookOpen className="h-3.5 w-3.5" />}
                      label="Blog"
                    >
                      {idea.repurpose_potential.blog_angle}
                    </RepurposeCard>
                  )}
                  {idea.repurpose_potential.video_angle && (
                    <RepurposeCard icon={<Video className="h-3.5 w-3.5" />} label="Video">
                      {idea.repurpose_potential.video_angle}
                    </RepurposeCard>
                  )}
                  {idea.repurpose_potential.podcast_angle && (
                    <RepurposeCard icon={<Mic className="h-3.5 w-3.5" />} label="Podcast">
                      {idea.repurpose_potential.podcast_angle}
                    </RepurposeCard>
                  )}
                  {idea.repurpose_potential.shorts_hooks &&
                    idea.repurpose_potential.shorts_hooks.length > 0 && (
                      <div className="rounded-md border bg-background/50 p-3 sm:col-span-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                          <Megaphone className="h-3.5 w-3.5" /> Shorts Hooks
                        </div>
                        <ul className="space-y-1">
                          {idea.repurpose_potential.shorts_hooks.map((h, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-xs text-foreground/90 leading-relaxed"
                            >
                              <span className="text-muted-foreground mt-0.5">›</span>
                              <span>{h}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              </div>
            )}

          {/* Legacy repurposing tags */}
          {idea.repurposing && idea.repurposing.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Tags
              </div>
              <div className="flex flex-wrap gap-1.5">
                {idea.repurposing.map((r) => (
                  <Badge key={r} variant="outline" className="text-[10px] font-normal">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Risk flags */}
          {idea.risk_flags && idea.risk_flags.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-500 mb-2">
                <AlertTriangle className="h-3.5 w-3.5" /> Risk Flags
              </div>
              <ul className="space-y-1.5">
                {idea.risk_flags.map((r) => (
                  <li
                    key={r}
                    className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 leading-relaxed"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {icon} {label}
      </div>
      <div className="text-xs text-foreground/90 leading-relaxed">{children}</div>
    </div>
  );
}

function Quote({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-lg border-l-2 border-primary/50 bg-primary/[0.03] pl-4 pr-3 py-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">
        {icon} {label}
      </div>
      <div className="text-sm text-foreground/90 italic leading-relaxed">“{children}”</div>
    </div>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
        {label}
      </div>
      <div className="text-xs text-foreground/90 leading-relaxed">{children}</div>
    </div>
  );
}

function RepurposeCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-background/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
        {icon} {label}
      </div>
      <div className="text-xs text-foreground/90 leading-relaxed">{children}</div>
    </div>
  );
}
