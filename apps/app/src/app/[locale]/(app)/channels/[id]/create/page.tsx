"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lightbulb, Search, Sparkles, ArrowRight, Loader2 } from "lucide-react";

interface ChannelIdea {
    id: string;
    idea_id: string;
    title: string;
    target_audience: string | null;
    verdict: "viable" | "weak" | "experimental";
    discovery_data: string | null;
}

export default function CreateContentPage() {
    const { id: channelId } = useParams<{ id: string }>();
    const router = useRouter();

    const [ideas, setIdeas] = useState<ChannelIdea[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/ideas/library?channel_id=${channelId}&include_orphaned=true&limit=20`);
                const json = await res.json();
                if (json.data?.ideas) setIdeas(json.data.ideas);
            } finally {
                setLoading(false);
            }
        })();
    }, [channelId]);

    function startResearchFromIdea(idea: ChannelIdea) {
        router.push(`/channels/${channelId}/research/new?ideaId=${encodeURIComponent(idea.id)}`);
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Create Content</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Comece pelo passo que faz sentido pro que você tem em mãos.
                </p>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-3 gap-3">
                <ActionCard
                    icon={Lightbulb}
                    title="Brainstorm"
                    description="Não tem ideia? Gere com a IA."
                    cost="50c"
                    onClick={() => router.push(`/channels/${channelId}/brainstorm/new`)}
                />
                <ActionCard
                    icon={Search}
                    title="Pesquisa"
                    description="Já tem tema? Pesquise fontes."
                    cost="60-180c"
                    onClick={() => router.push(`/channels/${channelId}/research/new`)}
                />
                <ActionCard
                    icon={Sparkles}
                    title="Conteúdo"
                    description="Pula direto pra produção."
                    cost="200c+"
                    onClick={() => router.push(`/channels/${channelId}/drafts/new`)}
                />
            </div>

            {/* Channel ideas */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" /> Suas ideias geradas
                        {ideas.length > 0 && <Badge variant="secondary" className="text-[10px]">{ideas.length}</Badge>}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : ideas.length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                            Nenhuma ideia ainda.{" "}
                            <button
                                className="text-primary hover:underline"
                                onClick={() => router.push(`/channels/${channelId}/brainstorm/new`)}
                            >
                                Rode um brainstorm
                            </button>
                            .
                        </div>
                    ) : (
                        <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
                            {ideas.map((idea) => {
                                let extra: { angle?: string; repurposing?: string[] } = {};
                                try {
                                    if (idea.discovery_data) extra = JSON.parse(idea.discovery_data);
                                } catch {
                                    // ignore
                                }
                                return (
                                    <button
                                        key={idea.id}
                                        onClick={() => startResearchFromIdea(idea)}
                                        className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors"
                                    >
                                        <div className="flex items-start gap-3">
                                            <Badge
                                                variant={
                                                    idea.verdict === "viable" ? "default" :
                                                    idea.verdict === "weak" ? "destructive" : "secondary"
                                                }
                                                className="text-[10px] shrink-0"
                                            >
                                                {idea.verdict}
                                            </Badge>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium">{idea.title}</div>
                                                {idea.target_audience && (
                                                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                                                        Para: {idea.target_audience}
                                                    </div>
                                                )}
                                                {extra.repurposing && extra.repurposing.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                                        {extra.repurposing.map((r) => (
                                                            <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function ActionCard({
    icon: Icon, title, description, cost, onClick,
}: {
    icon: React.ElementType;
    title: string;
    description: string;
    cost: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="text-left p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-muted/30 transition-all"
        >
            <div className="flex items-start justify-between mb-2">
                <Icon className="h-5 w-5" />
                <Badge variant="outline" className="text-[10px]">{cost}</Badge>
            </div>
            <div className="font-medium text-sm">{title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        </button>
    );
}
