"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, Zap, DollarSign } from "lucide-react";

interface Group { name: string; inputTokens: number; outputTokens: number; costUsd: number; calls: number; }
interface Summary {
    windowDays: number;
    totals: { inputTokens: number; outputTokens: number; costUsd: number; calls: number };
    byProvider: Group[];
    byStage: Group[];
    byModel: Group[];
    byDay: Group[];
}

function fmtUsd(n: number) { return `$${n.toFixed(n < 1 ? 4 : 2)}`; }
function fmtBrl(n: number) { return `R$ ${(n * 6).toFixed(n < 1 ? 3 : 2)}`; }
function fmtTok(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

export default function UsagePage() {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);

    useEffect(() => {
        setLoading(true);
        (async () => {
            try {
                const res = await fetch(`/api/usage/summary?days=${days}`);
                const json = await res.json();
                setSummary(json?.data ?? null);
            } finally {
                setLoading(false);
            }
        })();
    }, [days]);

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" /> Uso & custo
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Tokens e custo estimado das gerações de IA do workspace.
                        Ollama local não conta custo; os outros usam preços públicos dos providers.
                    </p>
                </div>
                <div className="flex gap-1">
                    {[7, 30, 90].map((d) => (
                        <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
                            {d}d
                        </Button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : !summary || summary.totals.calls === 0 ? (
                <Card>
                    <CardContent className="py-16 text-center text-sm text-muted-foreground">
                        Nenhuma geração nos últimos {days} dias.
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <StatCard
                            icon={<Zap className="h-4 w-4 text-amber-500" />}
                            label="Chamadas"
                            value={String(summary.totals.calls)}
                        />
                        <StatCard
                            icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
                            label="Tokens entrada"
                            value={fmtTok(summary.totals.inputTokens)}
                        />
                        <StatCard
                            icon={<TrendingUp className="h-4 w-4 text-purple-500" />}
                            label="Tokens saída"
                            value={fmtTok(summary.totals.outputTokens)}
                        />
                        <StatCard
                            icon={<DollarSign className="h-4 w-4 text-green-500" />}
                            label="Custo estimado"
                            value={fmtUsd(summary.totals.costUsd)}
                            sub={fmtBrl(summary.totals.costUsd)}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <GroupCard title="Por provider" rows={summary.byProvider} />
                        <GroupCard title="Por etapa" rows={summary.byStage} />
                        <GroupCard title="Por modelo" rows={summary.byModel} />
                        <GroupCard title="Por dia" rows={summary.byDay.slice(-14).reverse()} showTokens />
                    </div>
                </>
            )}
        </div>
    );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
    return (
        <Card>
            <CardContent className="py-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                    {icon} {label}
                </div>
                <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
                {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
            </CardContent>
        </Card>
    );
}

function GroupCard({ title, rows, showTokens }: { title: string; rows: Group[]; showTokens?: boolean }) {
    const sorted = [...rows].sort((a, b) => b.costUsd - a.costUsd);
    const max = Math.max(...sorted.map((r) => r.costUsd), 0.001);
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {sorted.map((r) => (
                        <div key={r.name} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">{r.name}</span>
                                <span className="tabular-nums text-muted-foreground">
                                    {showTokens ? `${fmtTok(r.inputTokens + r.outputTokens)} tok · ` : ""}
                                    <Badge variant="outline" className="text-[10px] ml-1">{r.calls}x</Badge>
                                    <span className="ml-2">{fmtUsd(r.costUsd)}</span>
                                </span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (r.costUsd / max) * 100)}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
