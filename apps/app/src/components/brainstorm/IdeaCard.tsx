'use client';

/**
 * <IdeaCard /> — canonical render of a single brainstormed idea.
 *
 * Two consumers:
 *   • BrainstormEngine — selectable list (radio + details button).
 *   • StageRunOutputSheet — read-only set with winner marked.
 *
 * The interface stays a single object so the same component can ship in both
 * surfaces without duplicating verdict colors, icon choices, or layout.
 */
import { Check, Target, Users, Sparkles, AlertTriangle, Info, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type IdeaVerdict = 'viable' | 'weak' | 'experimental';

export interface IdeaCardData {
  id: string;
  title: string;
  verdict?: IdeaVerdict | null;
  core_tension?: string | null;
  target_audience?: string | null;
  discovery_data?: string | Record<string, unknown> | null;
}

interface IdeaCardExtra {
  angle?: string;
  monetization?: string;
  repurposing?: string[];
  risk_flags?: string[];
}

export interface IdeaCardProps {
  idea: IdeaCardData;
  isSelected?: boolean;
  isPreSelected?: boolean;
  isWinner?: boolean;
  /** When provided, the card is interactive (cursor-pointer, click handler). */
  onSelect?: () => void;
  /** When provided, an `Info` button surfaces in the header. */
  onShowDetails?: () => void;
}

function parseExtra(discoveryData: IdeaCardData['discovery_data']): IdeaCardExtra {
  if (!discoveryData) return {};
  if (typeof discoveryData === 'object') return discoveryData as IdeaCardExtra;
  try {
    return JSON.parse(discoveryData) as IdeaCardExtra;
  } catch {
    return {};
  }
}

function verdictClasses(verdict: IdeaVerdict | null | undefined): { pill: string; dot: string } {
  switch (verdict) {
    case 'viable':
      return {
        pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30',
        dot: 'bg-emerald-500',
      };
    case 'weak':
      return {
        pill: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/30',
        dot: 'bg-rose-500',
      };
    case 'experimental':
      return {
        pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/30',
        dot: 'bg-amber-500',
      };
    default:
      return {
        pill: 'bg-muted text-muted-foreground ring-muted-foreground/20',
        dot: 'bg-muted-foreground',
      };
  }
}

export function IdeaCard({
  idea,
  isSelected = false,
  isPreSelected = false,
  isWinner = false,
  onSelect,
  onShowDetails,
}: IdeaCardProps) {
  const extra = parseExtra(idea.discovery_data);
  const { pill, dot } = verdictClasses(idea.verdict);
  const interactive = Boolean(onSelect);

  const containerClass = interactive
    ? `group relative w-full text-left p-4 rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer ${
        isSelected
          ? 'border-primary/60 bg-primary/[0.07] shadow-lg shadow-primary/10'
          : 'border-border/60 bg-card/50 hover:border-primary/30 hover:bg-card hover:-translate-y-0.5 hover:shadow-md'
      }`
    : `relative w-full p-4 rounded-xl border overflow-hidden ${
        isWinner
          ? 'border-primary/60 bg-primary/[0.07]'
          : 'border-border/60 bg-card/50'
      }`;

  const containerProps = interactive
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: onSelect,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.();
          }
        },
      }
    : {};

  return (
    <div {...containerProps} className={containerClass} data-testid="idea-card">
      {(isSelected || isWinner) && (
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary to-primary/60" />
      )}
      <div className="flex items-start gap-3">
        {interactive ? (
          <div
            className={`h-5 w-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all ${
              isSelected
                ? 'border-primary bg-primary scale-110'
                : 'border-muted-foreground/30 group-hover:border-primary/50'
            }`}
          >
            {isSelected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
          </div>
        ) : isWinner ? (
          <div
            className="h-5 w-5 rounded-full bg-primary shrink-0 mt-0.5 flex items-center justify-center"
            data-testid="idea-card-winner"
            aria-label="Winning idea"
          >
            <Trophy className="h-3 w-3 text-primary-foreground" />
          </div>
        ) : (
          <div className="h-5 w-5 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="font-semibold text-sm leading-snug flex-1">{idea.title}</div>
            <div className="flex items-center gap-1.5 shrink-0">
              {idea.verdict && (
                <div
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${pill}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  {idea.verdict}
                </div>
              )}
              {onShowDetails && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowDetails();
                  }}
                  className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  aria-label="View details"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          {isPreSelected && (
            <div className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" /> Previously selected
            </div>
          )}
          {idea.core_tension && (
            <div className="flex items-start gap-1.5 mt-2 text-xs text-muted-foreground leading-relaxed">
              <Target className="h-3 w-3 mt-0.5 shrink-0 opacity-70" />
              <span>{idea.core_tension}</span>
            </div>
          )}
          {idea.target_audience && (
            <div className="flex items-start gap-1.5 mt-1.5 text-xs text-muted-foreground leading-relaxed">
              <Users className="h-3 w-3 mt-0.5 shrink-0 opacity-70" />
              <span>{idea.target_audience}</span>
            </div>
          )}
          {extra.angle && (
            <div className="flex items-start gap-1.5 mt-1.5 text-xs text-muted-foreground leading-relaxed">
              <Sparkles className="h-3 w-3 mt-0.5 shrink-0 opacity-70" />
              <span>{extra.angle}</span>
            </div>
          )}
          {extra.repurposing && extra.repurposing.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2.5">
              {extra.repurposing.map((r) => (
                <Badge
                  key={r}
                  variant="outline"
                  className="text-[10px] font-normal bg-background/50"
                >
                  {r}
                </Badge>
              ))}
            </div>
          )}
          {extra.risk_flags && extra.risk_flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {extra.risk_flags.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
