"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Loader2, Youtube, Hash, Lightbulb } from "lucide-react";

interface TrendPoint { time: string; value: number; }
interface Trends {
    topic: string;
    geo: string;
    points: TrendPoint[];
    trend: "rising" | "stable" | "falling";
    relatedQueries: string[];
    peakValue: number;
    averageValue: number;
}
interface YtAnalysis {
    top_videos_json?: unknown;
    niche_summary?: string | null;
}
interface Signals {
    topic: string;
    trends: Trends | null;
    youtube: YtAnalysis | null;
}

function Sparkline({ points, color = "#14b8a6" }: { points: TrendPoint[]; color?: string }) {
    if (points.length < 2) return null;
    const w = 220, h = 40;
    const max = Math.max(...points.map((p) => p.value), 1);
    const step = w / (points.length - 1);
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${i * step},${h - (p.value / max) * h}`).join(" ");
    return (
        <svg width={w} height={h} className="block">
            <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
        </svg>
    );
}

interface Props {
    sessionId: string;
}

export function NicheSignalsCard({ sessionId }: Props) {
    const [signals, setSignals] = useState<Signals | null>(null);
    const [loading, setLoading] = useState(false);

    async function loadSignals() {
        setLoading(true);
        try {
            const res = await fetch(`/api/research-sessions/${sessionId}/signals`);
            const json = await res.json();
            setSignals(json?.data ?? null);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (sessionId) void loadSignals();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    if (loading && !signals) {
        return (
            <Card>
                <CardContent className="py-8 flex justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }
    if (!signals) return null;

    const trends = signals.trends;
    const trendIcon = trends?.trend === "rising" ? <TrendingUp className="h-4 w-4 text-green-500" />
        : trends?.trend === "falling" ? <TrendingDown className="h-4 w-4 text-red-500" />
        : <Minus className="h-4 w-4 text-muted-foreground" />;
    const trendLabel = trends?.trend === "rising" ? "Subindo" : trends?.trend === "falling" ? "Caindo" : "Estável";
    const trendColor = trends?.trend === "rising" ? "#14b8a6"
        : trends?.trend === "falling" ? "#f43f5e"
        : "#94a3b8";

    const recommendation = trends
        ? trends.trend === "rising" && trends.averageValue > 30
            ? { label: "Momento ideal pra publicar", kind: "good" as const }
            : trends.trend === "falling" && trends.averageValue < 20
                ? { label: "Nicho em queda — considere outro ângulo", kind: "warn" as const }
                : { label: "Nicho estável — atenção à execução", kind: "neutral" as const }
        : null;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" /> Sinais do nicho
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {recommendation && (
                    <div className={`rounded-md p-3 text-sm border ${
                        recommendation.kind === "good" ? "border-green-500/40 bg-green-500/5 text-green-700 dark:text-green-400"
                            : recommendation.kind === "warn" ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                                : "border-muted bg-muted/20"
                    }`}>
                        💡 {recommendation.label}
                    </div>
                )}

                {trends && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                {trendIcon} Google Trends (12 meses · {trends.geo})
                            </div>
                            <Badge variant="outline" className="text-[10px] capitalize">{trendLabel}</Badge>
                        </div>
                        <div className="flex items-end justify-between gap-3">
                            <Sparkline points={trends.points} color={trendColor} />
                            <div className="text-right text-[11px] text-muted-foreground">
                                <div>Pico: {trends.peakValue}</div>
                                <div>Média: {trends.averageValue}</div>
                            </div>
                        </div>
                        {trends.relatedQueries.length > 0 && (
                            <div className="pt-2">
                                <div className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
                                    <Hash className="h-3 w-3" /> Queries relacionadas
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {trends.relatedQueries.map((q, i) => (
                                        <Badge key={i} variant="secondary" className="text-[10px]">{q}</Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {signals.youtube?.niche_summary && (
                    <div className="space-y-1.5 pt-3 border-t">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <Youtube className="h-3.5 w-3.5 text-red-500" /> YouTube Intelligence
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{signals.youtube.niche_summary}</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
