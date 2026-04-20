'use client';

import {
  Target,
  Shield,
  ShieldAlert,
  BookOpen,
  BarChart3,
  Quote,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  ExternalLink,
  Calendar,
  TrendingUp,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface FindingsObject {
  idea_validation?: {
    core_claim_verified?: boolean;
    evidence_strength?: string;
    confidence_score?: number;
    validation_notes?: string;
  };
  sources?: Array<{
    source_id?: string;
    title?: string;
    url?: string;
    type?: string;
    credibility?: string;
    key_insight?: string;
    quote_excerpt?: string;
    date_published?: string;
  }>;
  statistics?: Array<{
    stat_id?: string;
    claim?: string;
    figure?: string;
    source_id?: string;
    context?: string;
  }>;
  expert_quotes?: Array<{
    quote_id?: string;
    quote?: string;
    author?: string;
    credentials?: string;
    source_id?: string;
  }>;
  counterarguments?: Array<{
    counter_id?: string;
    point?: string;
    strength?: string;
    rebuttal?: string;
    source_id?: string;
  }>;
  knowledge_gaps?: string[];
  research_summary?: string;
  refined_angle?: {
    should_pivot?: boolean;
    updated_title?: string;
    updated_hook?: string;
    angle_notes?: string;
    recommendation?: string;
  };
  [key: string]: unknown;
}

interface ResearchFindingsReportProps {
  findings: Record<string, unknown> | null;
}

export function ResearchFindingsReport({ findings }: ResearchFindingsReportProps) {
  if (!findings || typeof findings !== 'object') {
    return (
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">No research findings available.</p>
        </CardContent>
      </Card>
    );
  }

  const f = findings as FindingsObject;

  const confidenceScore = f.idea_validation?.confidence_score ?? null;
  const shouldPivot = f.refined_angle?.should_pivot ?? false;

  return (
    <div className="space-y-6">
      {/* Research Summary & Idea Validation */}
      {(f.research_summary || f.idea_validation) && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Research Summary
              </CardTitle>
              {confidenceScore !== null && (
                <div className="flex items-center gap-2">
                  <div className="relative h-12 w-12">
                    <svg className="h-12 w-12 -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-muted-foreground/20"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 45 * confidenceScore} ${2 * Math.PI * 45}`}
                        className="text-primary transition-all"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-bold">{Math.round(confidenceScore * 100)}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {f.idea_validation && (
              <div className="flex flex-wrap gap-2 pb-3">
                {f.idea_validation.core_claim_verified !== undefined && (
                  <Badge
                    variant="outline"
                    className={f.idea_validation.core_claim_verified ? 'border-green-500/50 text-green-600 dark:text-green-400' : 'border-red-500/50 text-red-600 dark:text-red-400'}
                  >
                    {f.idea_validation.core_claim_verified ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Claim Verified
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 mr-1" />
                        Claim Unverified
                      </>
                    )}
                  </Badge>
                )}
                {f.idea_validation.evidence_strength && (
                  <Badge variant="secondary" className="text-[11px]">
                    Evidence: {f.idea_validation.evidence_strength}
                  </Badge>
                )}
              </div>
            )}
            {f.research_summary && (
              <p className="text-sm leading-relaxed text-muted-foreground">{f.research_summary}</p>
            )}
            {f.idea_validation?.validation_notes && (
              <p className="text-xs text-muted-foreground italic pt-2 border-t border-primary/20">
                {f.idea_validation.validation_notes}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Refined Angle / Pivot Recommendation */}
      {f.refined_angle && (
        <Card
          className={`border-2 ${shouldPivot ? 'border-yellow-500/40 bg-yellow-50 dark:bg-yellow-950/20' : 'border-primary/30 bg-gradient-to-br from-primary/5 to-transparent'}`}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {shouldPivot ? (
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              ) : (
                <Sparkles className="h-4 w-4 text-primary" />
              )}
              {shouldPivot ? 'Pivot Recommended' : 'Refined Angle'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {f.refined_angle.updated_title && (
              <p className="font-semibold text-sm">{f.refined_angle.updated_title}</p>
            )}
            {f.refined_angle.updated_hook && (
              <p className="text-sm italic text-muted-foreground border-l-2 border-primary/40 pl-3">
                &ldquo;{f.refined_angle.updated_hook}&rdquo;
              </p>
            )}
            {f.refined_angle.angle_notes && (
              <p className="text-xs text-muted-foreground pt-1">{f.refined_angle.angle_notes}</p>
            )}
            {f.refined_angle.recommendation && (
              <div className="mt-3 p-2 rounded bg-primary/10 text-primary text-xs font-medium">
                {f.refined_angle.recommendation}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sources */}
      {f.sources && f.sources.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-4 w-4 text-blue-500" />
            <h3 className="font-semibold text-sm">Sources</h3>
            <Badge variant="secondary" className="text-[10px]">
              {f.sources.length}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {f.sources.map((source, idx) => (
              <Card key={`source-${idx}`} className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        {source.type && (
                          <Badge variant="outline" className="text-[9px] mb-2 inline-block">
                            {source.type}
                          </Badge>
                        )}
                        <h4 className="text-sm font-medium leading-tight">{source.title}</h4>
                      </div>
                      {source.credibility && (
                        <Badge
                          variant="outline"
                          className={`text-[9px] shrink-0 ${
                            source.credibility.toLowerCase() === 'high'
                              ? 'border-green-500/50 text-green-600 dark:text-green-400'
                              : source.credibility.toLowerCase() === 'medium'
                                ? 'border-yellow-500/50 text-yellow-600 dark:text-yellow-400'
                                : 'border-muted-foreground/40'
                          }`}
                        >
                          {source.credibility}
                        </Badge>
                      )}
                    </div>

                    {source.key_insight && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{source.key_insight}</p>
                    )}

                    {source.quote_excerpt && (
                      <blockquote className="text-xs italic text-muted-foreground pl-3 border-l-2 border-blue-300/50 my-2">
                        &ldquo;{source.quote_excerpt}&rdquo;
                      </blockquote>
                    )}

                    <div className="flex items-center justify-between pt-2 text-[10px] text-muted-foreground flex-wrap gap-1">
                      <div className="flex items-center gap-1">
                        {source.date_published && (
                          <>
                            <Calendar className="h-3 w-3" />
                            <span>{source.date_published}</span>
                          </>
                        )}
                      </div>
                      {source.source_id && <Badge variant="secondary" className="text-[9px]">{source.source_id}</Badge>}
                    </div>

                    {source.url && source.url !== 'N/A' && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 pt-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {(() => {
                          try {
                            return new URL(source.url).hostname;
                          } catch {
                            return source.url.slice(0, 30);
                          }
                        })()}
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Statistics */}
      {f.statistics && f.statistics.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-emerald-500" />
            <h3 className="font-semibold text-sm">Key Statistics</h3>
            <Badge variant="secondary" className="text-[10px]">
              {f.statistics.length}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {f.statistics.map((stat, idx) => (
              <Card key={`stat-${idx}`} className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
                <CardContent className="pt-4">
                  <div className="space-y-1">
                    <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 leading-tight">
                      {stat.figure}
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.claim}</p>
                    {stat.context && (
                      <p className="text-xs text-muted-foreground pt-2 leading-relaxed">{stat.context}</p>
                    )}
                    {stat.source_id && (
                      <Badge variant="secondary" className="text-[9px] mt-2 inline-block">
                        via {stat.source_id}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Expert Quotes */}
      {f.expert_quotes && f.expert_quotes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Quote className="h-4 w-4 text-violet-500" />
            <h3 className="font-semibold text-sm">Expert Quotes</h3>
            <Badge variant="secondary" className="text-[10px]">
              {f.expert_quotes.length}
            </Badge>
          </div>
          <div className="space-y-3">
            {f.expert_quotes.map((quote, idx) => (
              <Card key={`quote-${idx}`} className="border-violet-200 bg-violet-50 dark:bg-violet-950/20">
                <CardContent className="pt-4">
                  <blockquote className="text-sm italic text-muted-foreground leading-relaxed border-l-4 border-violet-400 pl-4 mb-3">
                    &ldquo;{quote.quote}&rdquo;
                  </blockquote>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{quote.author}</p>
                      {quote.credentials && (
                        <p className="text-xs text-muted-foreground">{quote.credentials}</p>
                      )}
                    </div>
                    {quote.source_id && (
                      <Badge variant="secondary" className="text-[9px] shrink-0">
                        {quote.source_id}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Counterarguments & Rebuttals */}
      {f.counterarguments && f.counterarguments.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            <h3 className="font-semibold text-sm">Counterarguments & Rebuttals</h3>
            <Badge variant="secondary" className="text-[10px]">
              {f.counterarguments.length}
            </Badge>
          </div>
          <div className="space-y-3">
            {f.counterarguments.map((counter, idx) => (
              <Card key={`counter-${idx}`} className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="pt-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{counter.point}</p>
                          {counter.strength && (
                            <Badge
                              variant="outline"
                              className={`text-[9px] mt-1 inline-block ${
                                counter.strength.toLowerCase() === 'high'
                                  ? 'border-red-500/50 text-red-600 dark:text-red-400'
                                  : counter.strength.toLowerCase() === 'medium'
                                    ? 'border-yellow-500/50 text-yellow-600 dark:text-yellow-400'
                                    : 'border-muted-foreground/40'
                              }`}
                            >
                              {counter.strength} risk
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {counter.rebuttal && (
                      <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded border-l-4 border-emerald-500/50">
                        <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 mb-1">
                          Rebuttal
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{counter.rebuttal}</p>
                      </div>
                    )}
                  </div>
                  {counter.source_id && (
                    <Badge variant="secondary" className="text-[9px] mt-2 inline-block">
                      {counter.source_id}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge Gaps */}
      {f.knowledge_gaps && f.knowledge_gaps.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-rose-500" />
            <h3 className="font-semibold text-sm">Knowledge Gaps</h3>
            <Badge variant="secondary" className="text-[10px]">
              {f.knowledge_gaps.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {f.knowledge_gaps.map((gap, idx) => (
              <div
                key={`gap-${idx}`}
                className="p-3 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/20 flex items-start gap-2"
              >
                <AlertTriangle className="h-4 w-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">{gap}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
