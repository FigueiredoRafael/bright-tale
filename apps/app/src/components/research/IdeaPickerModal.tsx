"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Search } from "lucide-react";

export interface IdeaOption {
    id: string;
    idea_id: string;
    title: string;
    target_audience?: string | null;
    verdict?: string | null;
}

interface Props {
    open: boolean;
    channelId: string;
    onSelect: (idea: IdeaOption) => void;
    onClose: () => void;
}

export function IdeaPickerModal({ open, channelId, onSelect, onClose }: Props) {
    const [ideas, setIdeas] = useState<IdeaOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState("");

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        (async () => {
            try {
                const res = await fetch(`/api/ideas/library?channel_id=${channelId}&limit=100`);
                const json = await res.json();
                setIdeas(json?.data?.ideas ?? json?.data?.items ?? []);
            } catch {
                setIdeas([]);
            } finally {
                setLoading(false);
            }
        })();
    }, [open, channelId]);

    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (!term) return ideas;
        return ideas.filter(
            (i) =>
                i.title.toLowerCase().includes(term) ||
                (i.target_audience ?? "").toLowerCase().includes(term),
        );
    }, [ideas, q]);

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lightbulb className="h-5 w-5" /> Escolher ideia existente
                    </DialogTitle>
                    <DialogDescription>
                        Selecione uma ideia do brainstorm pra pré-preencher o tema da pesquisa.
                    </DialogDescription>
                </DialogHeader>

                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        className="pl-8"
                        placeholder="Filtrar por título ou público-alvo…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className="overflow-y-auto flex-1 -mx-2 px-2 space-y-2">
                    {loading && <p className="text-sm text-muted-foreground py-4 text-center">Carregando…</p>}
                    {!loading && filtered.length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            {ideas.length === 0 ? "Nenhuma ideia ainda. Gere ideias no brainstorm primeiro." : "Nenhum resultado."}
                        </p>
                    )}
                    {filtered.map((idea) => (
                        <button
                            key={idea.id}
                            onClick={() => { onSelect(idea); onClose(); }}
                            className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium line-clamp-2">{idea.title}</div>
                                    {idea.target_audience && (
                                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                            Para: {idea.target_audience}
                                        </div>
                                    )}
                                </div>
                                {idea.verdict && (
                                    <Badge
                                        variant={idea.verdict === "viable" ? "default" : "outline"}
                                        className="text-[10px] shrink-0"
                                    >
                                        {idea.verdict}
                                    </Badge>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
