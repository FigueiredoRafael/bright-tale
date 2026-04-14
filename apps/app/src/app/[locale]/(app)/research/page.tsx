"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, BookOpen, Loader2, Plus, Clock } from "lucide-react";
import { useActiveChannel } from "@/hooks/use-active-channel";

interface ResearchSession {
    id: string;
    channel_id: string | null;
    level: "surface" | "medium" | "deep";
    status: string;
    input_json: { topic?: string | null } | null;
    cards_json: unknown[] | null;
    created_at: string;
}

export default function ResearchPage() {
    const router = useRouter();
    const { activeChannelId } = useActiveChannel();
    const [sessions, setSessions] = useState<ResearchSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const url = activeChannelId
                    ? `/api/research-sessions?channel_id=${activeChannelId}&limit=100`
                    : `/api/research-sessions?limit=100`;
                const res = await fetch(url);
                const json = await res.json();
                setSessions(json?.data?.sessions ?? []);
            } finally {
                setLoading(false);
            }
        })();
    }, [activeChannelId]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return sessions;
        return sessions.filter((s) => (s.input_json?.topic ?? "").toLowerCase().includes(term));
    }, [sessions, search]);

    function gotoNew() {
        if (activeChannelId) router.push(`/channels/${activeChannelId}/research/new`);
    }

    function gotoSession(s: ResearchSession) {
        // For now we don't have a dedicated session view page — open the
        // drafts/new flow with this research preselected so the user can act on it.
        if (s.channel_id) router.push(`/channels/${s.channel_id}/drafts/new?researchSessionId=${s.id}`);
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <BookOpen className="h-5 w-5" /> Pesquisas
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Sessões de pesquisa {activeChannelId ? "deste canal" : "dos seus canais"}.
                    </p>
                </div>
                {activeChannelId && (
                    <Button onClick={gotoNew} size="sm">
                        <Plus className="h-4 w-4 mr-1" /> Nova pesquisa
                    </Button>
                )}
            </div>

            <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    className="pl-8"
                    placeholder="Buscar por tema…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : filtered.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-3">
                        <p>{sessions.length === 0 ? "Nenhuma pesquisa ainda." : "Nenhum resultado pra esse filtro."}</p>
                        {sessions.length === 0 && activeChannelId && (
                            <Button onClick={gotoNew} size="sm">
                                <Plus className="h-4 w-4 mr-1" /> Criar primeira pesquisa
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {filtered.map((s) => {
                        const cardCount = Array.isArray(s.cards_json) ? s.cards_json.length : 0;
                        return (
                            <button
                                key={s.id}
                                onClick={() => gotoSession(s)}
                                className="w-full text-left p-4 rounded-lg border hover:border-primary/50 hover:bg-muted/30 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium line-clamp-2">
                                            {s.input_json?.topic ?? "Sem tema"}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <Badge variant="outline" className="text-[10px] capitalize">{s.level}</Badge>
                                            <Badge variant="secondary" className="text-[10px]">{cardCount} cards</Badge>
                                            {s.status !== "completed" && (
                                                <Badge variant={s.status === "failed" ? "destructive" : "outline"} className="text-[10px] capitalize">
                                                    {s.status}
                                                </Badge>
                                            )}
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {new Date(s.created_at).toLocaleDateString("pt-BR")}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
