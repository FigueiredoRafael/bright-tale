"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    CheckCircle,
    XCircle,
    Quote,
    BarChart3,
    ExternalLink,
    AlertTriangle,
    BookOpen,
    Lightbulb,
    FileText,
} from "lucide-react";

interface Source {
    source_id: string;
    title: string;
    url: string;
    type: string;
    credibility: string;
    key_insight: string;
    quote_excerpt?: string;
    date_published?: string;
}

interface Statistic {
    stat_id: string;
    claim: string;
    figure: string;
    source_id: string;
    context?: string;
}

interface ExpertQuote {
    quote_id: string;
    quote: string;
    author: string;
    credentials?: string;
    source_id: string;
}

interface Counterargument {
    counter_id: string;
    point: string;
    strength: string;
    rebuttal: string;
    source_id?: string;
}

interface IdeaValidation {
    core_claim_verified: boolean;
    evidence_strength: string;
    confidence_score: number;
    validation_notes: string;
}

interface RefinedAngle {
    should_pivot: boolean;
    updated_title: string;
    updated_hook: string;
    angle_notes: string;
    recommendation: string;
}

interface ParsedResearchContent {
    idea_id?: string;
    idea_validation?: IdeaValidation;
    sources?: Source[];
    statistics?: Statistic[];
    expert_quotes?: ExpertQuote[];
    counterarguments?: Counterargument[];
    knowledge_gaps?: string[];
    research_summary?: string;
    refined_angle?: RefinedAngle;
    content?: string; // Fallback for simple text content
}

interface ResearchContentDisplayProps {
    content: string;
}

export function ResearchContentDisplay({ content }: ResearchContentDisplayProps) {
    let parsed: ParsedResearchContent | null = null;

    try {
        parsed = JSON.parse(content);
    } catch {
        // Not JSON, show as plain text
        return (
            <div className="prose max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {content}
                </pre>
            </div>
        );
    }

    // Handle simple content wrapper
    if (parsed?.content && !parsed.sources) {
        return (
            <div className="prose max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {parsed.content}
                </pre>
            </div>
        );
    }

    const credibilityColor = (level: string) => {
        switch (level.toLowerCase()) {
            case "high": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
            case "medium": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
            case "low": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
            default: return "bg-gray-100 text-gray-800";
        }
    };

    const strengthColor = (strength: string) => {
        switch (strength.toLowerCase()) {
            case "strong": return "bg-red-100 text-red-800";
            case "moderate": return "bg-yellow-100 text-yellow-800";
            case "weak": return "bg-green-100 text-green-800";
            default: return "bg-gray-100 text-gray-800";
        }
    };

    return (
        <div className="space-y-6">
            {/* Idea Validation */}
            {parsed?.idea_validation && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            {parsed.idea_validation.core_claim_verified ? (
                                <CheckCircle className="h-5 w-5 text-green-600" />
                            ) : (
                                <XCircle className="h-5 w-5 text-red-600" />
                            )}
                            Idea Validation
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="text-center p-3 bg-muted rounded-lg">
                                <div className="text-2xl font-bold">{parsed.idea_validation.confidence_score}/10</div>
                                <div className="text-xs text-muted-foreground">Confidence</div>
                            </div>
                            <div className="text-center p-3 bg-muted rounded-lg">
                                <Badge className={credibilityColor(parsed.idea_validation.evidence_strength)}>
                                    {parsed.idea_validation.evidence_strength}
                                </Badge>
                                <div className="text-xs text-muted-foreground mt-1">Evidence</div>
                            </div>
                            <div className="text-center p-3 bg-muted rounded-lg">
                                <div className="text-lg font-medium">
                                    {parsed.idea_validation.core_claim_verified ? "Verified" : "Unverified"}
                                </div>
                                <div className="text-xs text-muted-foreground">Core Claim</div>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {parsed.idea_validation.validation_notes}
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Research Summary */}
            {parsed?.research_summary && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            Research Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">
                            {parsed.research_summary}
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Refined Angle */}
            {parsed?.refined_angle && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Lightbulb className="h-5 w-5 text-yellow-500" />
                            Refined Angle
                            {parsed.refined_angle.should_pivot && (
                                <Badge variant="destructive" className="ml-2">Pivot Suggested</Badge>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Updated Title</div>
                            <p className="font-medium">{parsed.refined_angle.updated_title}</p>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Hook</div>
                            <p className="text-sm italic">&ldquo;{parsed.refined_angle.updated_hook}&rdquo;</p>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</div>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {parsed.refined_angle.angle_notes}
                            </p>
                        </div>
                        <Badge className="bg-blue-100 text-blue-800">
                            Recommendation: {parsed.refined_angle.recommendation}
                        </Badge>
                    </CardContent>
                </Card>
            )}

            {/* Sources */}
            {parsed?.sources && parsed.sources.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <BookOpen className="h-5 w-5" />
                            Sources ({parsed.sources.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {parsed.sources.map((source) => (
                                <div key={source.source_id} className="border rounded-lg p-4">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-muted-foreground">{source.source_id}</span>
                                                <Badge variant="outline" className="text-xs">{source.type}</Badge>
                                                <Badge className={`text-xs ${credibilityColor(source.credibility)}`}>
                                                    {source.credibility}
                                                </Badge>
                                            </div>
                                            <h4 className="font-medium mt-1">{source.title}</h4>
                                            {source.date_published && (
                                                <p className="text-xs text-muted-foreground">{source.date_published}</p>
                                            )}
                                        </div>
                                        {source.url && (
                                            <a
                                                href={source.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </a>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-2">{source.key_insight}</p>
                                    {source.quote_excerpt && (
                                        <blockquote className="border-l-2 pl-3 italic text-sm text-muted-foreground">
                                            {source.quote_excerpt}
                                        </blockquote>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Statistics */}
            {parsed?.statistics && parsed.statistics.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            Statistics ({parsed.statistics.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {parsed.statistics.map((stat) => (
                                <div key={stat.stat_id} className="border rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-mono text-muted-foreground">{stat.stat_id}</span>
                                        <span className="text-xs text-muted-foreground">→ {stat.source_id}</span>
                                    </div>
                                    <p className="font-medium mb-1">{stat.claim}</p>
                                    <p className="text-lg font-bold text-primary mb-2">{stat.figure}</p>
                                    {stat.context && (
                                        <p className="text-sm text-muted-foreground">{stat.context}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Expert Quotes */}
            {parsed?.expert_quotes && parsed.expert_quotes.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Quote className="h-5 w-5" />
                            Expert Quotes ({parsed.expert_quotes.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {parsed.expert_quotes.map((quote) => (
                                <div key={quote.quote_id} className="border rounded-lg p-4">
                                    <blockquote className="text-lg italic mb-3">
                                        &ldquo;{quote.quote}&rdquo;
                                    </blockquote>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium">— {quote.author}</p>
                                            {quote.credentials && (
                                                <p className="text-xs text-muted-foreground">{quote.credentials}</p>
                                            )}
                                        </div>
                                        <span className="text-xs text-muted-foreground">{quote.source_id}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Counterarguments */}
            {parsed?.counterarguments && parsed.counterarguments.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-orange-500" />
                            Counterarguments ({parsed.counterarguments.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {parsed.counterarguments.map((counter) => (
                                <div key={counter.counter_id} className="border rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-mono text-muted-foreground">{counter.counter_id}</span>
                                        <Badge className={strengthColor(counter.strength)}>
                                            {counter.strength} strength
                                        </Badge>
                                    </div>
                                    <p className="font-medium mb-2">{counter.point}</p>
                                    <Separator className="my-2" />
                                    <div>
                                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Rebuttal:</span>
                                        <p className="text-sm mt-1">{counter.rebuttal}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Knowledge Gaps */}
            {parsed?.knowledge_gaps && parsed.knowledge_gaps.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Knowledge Gaps</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="list-disc list-inside space-y-2">
                            {parsed.knowledge_gaps.map((gap, index) => (
                                <li key={index} className="text-sm text-muted-foreground">{gap}</li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
