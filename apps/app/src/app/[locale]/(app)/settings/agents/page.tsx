"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers, Loader2, Lock, Shield } from "lucide-react";

interface AgentPrompt {
    id: string;
    name: string;
    slug: string;
    stage: string;
    instructions: string;
    updated_at: string;
}

// F2-026: read-only view. Editing lives in web/admin.
export default function AgentsSettingsPage() {
    const params = useParams<{ locale: string }>();
    const locale = params?.locale ?? "en";
    const [agents, setAgents] = useState<AgentPrompt[]>([]);
    const [selected, setSelected] = useState<AgentPrompt | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/agents");
                const json = await res.json();
                if (json.data?.agents) {
                    setAgents(json.data.agents);
                    if (json.data.agents.length > 0) setSelected(json.data.agents[0]);
                }
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Agentes</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Veja as instruções dos agentes que geram o seu conteúdo. A edição é feita pelo time de produto
                    no console de administração para garantir consistência entre usuários.
                </p>
            </div>

            <div className="flex gap-3 pb-4 border-b">
                <Link
                    href={`/${locale}/settings/agents/personas/guardrails`}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
                >
                    <Shield className="h-4 w-4" />
                    Guardrails
                </Link>
                <Link
                    href={`/${locale}/settings/agents/personas/archetypes`}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
                >
                    <Layers className="h-4 w-4" />
                    Archetypes
                </Link>
            </div>

            <div className="grid grid-cols-[260px_1fr] gap-6">
                <nav className="space-y-1">
                    {agents.map((a) => (
                        <button
                            key={a.id}
                            onClick={() => setSelected(a)}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                                selected?.id === a.id
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "hover:bg-muted/50"
                            }`}
                        >
                            <div className="truncate">{a.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                                {a.slug}
                            </div>
                        </button>
                    ))}
                </nav>

                {selected && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>{selected.name}</CardTitle>
                                    <CardDescription className="mt-1 flex items-center gap-2">
                                        <span className="font-mono text-xs">{selected.slug}</span>
                                        <span>·</span>
                                        <Badge variant="secondary" className="text-[10px]">{selected.stage}</Badge>
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Lock className="h-3 w-3" />
                                    Somente leitura
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <pre className="whitespace-pre-wrap text-xs font-mono bg-muted/40 rounded-md p-4 max-h-[600px] overflow-y-auto">
                                {selected.instructions}
                            </pre>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
