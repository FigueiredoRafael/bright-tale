"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, BookOpen, Plus } from "lucide-react";

export interface ResearchOption {
    id: string;
    level: "surface" | "medium" | "deep";
    status: string;
    input_json: { topic?: string | null; instruction?: string } | null;
    cards_json: unknown[] | null;
    created_at: string;
}

interface Props {
    open: boolean;
    channelId: string;
    onSelect: (research: ResearchOption) => void;
    onClose: () => void;
}

export function ResearchPickerModal({ open, channelId, onSelect, onClose }: Props) {
    const router = useRouter();
    const [sessions, setSessions] = useState<ResearchOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState("");

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        (async () => {
            try {
                const res = await fetch(`/api/research-sessions?channel_id=${channelId}&status=completed&limit=100`);
                const json = await res.json();
                setSessions(json?.data?.sessions ?? []);
            } catch {
                setSessions([]);
            } finally {
                setLoading(false);
            }
        })();
    }, [open, channelId]);

    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (!term) return sessions;
        return sessions.filter((s) => (s.input_json?.topic ?? "").toLowerCase().includes(term));
    }, [sessions, q]);

    function gotoNewResearch() {
        router.push(`/channels/${channelId}/research/new?returnTo=drafts`);
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5" /> Escolher pesquisa
                    </DialogTitle>
                    <DialogDescription>
                        A produção precisa de uma pesquisa pronta. Selecione uma existente ou crie uma nova.
                    </DialogDescription>
                </DialogHeader>

                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        className="pl-8"
                        placeholder="Filtrar por tema…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className="overflow-y-auto flex-1 -mx-2 px-2 space-y-2">
                    {loading && <p className="text-sm text-muted-foreground py-4 text-center">Carregando…</p>}
                    {!loading && filtered.length === 0 && (
                        <div className="py-6 text-center space-y-3">
                            <p className="text-sm text-muted-foreground">
                                {sessions.length === 0
                                    ? "Nenhuma pesquisa ainda neste canal."
                                    : "Nenhum resultado pra esse filtro."}
                            </p>
                            <Button onClick={gotoNewResearch} size="sm">
                                <Plus className="h-4 w-4 mr-1" /> Criar nova pesquisa
                            </Button>
                        </div>
                    )}
                    {filtered.map((s) => {
                        const cardCount = Array.isArray(s.cards_json) ? s.cards_json.length : 0;
                        return (
                            <button
                                key={s.id}
                                onClick={() => { onSelect(s); onClose(); }}
                                className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium line-clamp-2">
                                            {s.input_json?.topic ?? "Sem tema"}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            {new Date(s.created_at).toLocaleDateString("pt-BR")}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1 items-end shrink-0">
                                        <Badge variant="outline" className="text-[10px] capitalize">{s.level}</Badge>
                                        <Badge variant="secondary" className="text-[10px]">{cardCount} cards</Badge>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {!loading && filtered.length > 0 && (
                    <div className="border-t pt-3">
                        <Button onClick={gotoNewResearch} variant="outline" size="sm" className="w-full">
                            <Plus className="h-4 w-4 mr-1" /> Criar nova pesquisa
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
