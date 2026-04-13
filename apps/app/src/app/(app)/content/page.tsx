"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, FileText, Video, Zap, Mic, Loader2, Search, Clock, Trash2 } from "lucide-react";
import { useActiveChannel } from "@/hooks/use-active-channel";
import { toast } from "sonner";

interface ContentDraft {
    id: string;
    type: "blog" | "video" | "shorts" | "podcast";
    title: string | null;
    status: string;
    channel_id: string | null;
    updated_at: string;
}

const TYPE_META: Record<ContentDraft["type"], { label: string; icon: typeof FileText; color: string }> = {
    blog: { label: "Blog", icon: FileText, color: "text-blue-500" },
    video: { label: "Vídeo", icon: Video, color: "text-purple-500" },
    shorts: { label: "Shorts", icon: Zap, color: "text-amber-500" },
    podcast: { label: "Podcast", icon: Mic, color: "text-rose-500" },
};

export default function ContentPage() {
    const router = useRouter();
    const { activeChannelId } = useActiveChannel();
    const [drafts, setDrafts] = useState<ContentDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const url = activeChannelId
                    ? `/api/content-drafts?channel_id=${activeChannelId}`
                    : `/api/content-drafts`;
                const res = await fetch(url);
                const json = await res.json();
                setDrafts(json?.data?.drafts ?? []);
            } finally {
                setLoading(false);
            }
        })();
    }, [activeChannelId]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return drafts;
        return drafts.filter((d) => (d.title ?? "").toLowerCase().includes(term));
    }, [drafts, search]);

    const counts = useMemo(() => {
        const c = { all: filtered.length, blog: 0, video: 0, shorts: 0, podcast: 0 };
        for (const d of filtered) c[d.type]++;
        return c;
    }, [filtered]);

    function gotoDraft(d: ContentDraft) {
        if (d.channel_id) router.push(`/channels/${d.channel_id}/drafts/${d.id}`);
    }

    async function deleteDraft(d: ContentDraft) {
        if (!confirm(`Deletar "${d.title ?? "rascunho"}"?`)) return;
        try {
            const res = await fetch(`/api/content-drafts/${d.id}`, { method: "DELETE" });
            const json = await res.json();
            if (json?.error) {
                toast.error(json.error.message ?? "Falha ao deletar");
                return;
            }
            setDrafts((prev) => prev.filter((x) => x.id !== d.id));
            toast.success("Deletado");
        } catch {
            toast.error("Falha ao deletar");
        }
    }

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Sparkles className="h-5 w-5" /> Conteúdo
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Todos os rascunhos {activeChannelId ? "deste canal" : "dos seus canais"}.
                </p>
            </div>

            <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    className="pl-8"
                    placeholder="Buscar por título…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : drafts.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                        Nenhum conteúdo gerado ainda.
                    </CardContent>
                </Card>
            ) : (
                <Tabs defaultValue="all" className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="all">Todos <Badge variant="secondary" className="text-[10px] ml-1">{counts.all}</Badge></TabsTrigger>
                        <TabsTrigger value="blog" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Blog <Badge variant="secondary" className="text-[10px] ml-1">{counts.blog}</Badge></TabsTrigger>
                        <TabsTrigger value="video" className="gap-1.5"><Video className="h-3.5 w-3.5" /> Vídeo <Badge variant="secondary" className="text-[10px] ml-1">{counts.video}</Badge></TabsTrigger>
                        <TabsTrigger value="shorts" className="gap-1.5"><Zap className="h-3.5 w-3.5" /> Shorts <Badge variant="secondary" className="text-[10px] ml-1">{counts.shorts}</Badge></TabsTrigger>
                        <TabsTrigger value="podcast" className="gap-1.5"><Mic className="h-3.5 w-3.5" /> Podcast <Badge variant="secondary" className="text-[10px] ml-1">{counts.podcast}</Badge></TabsTrigger>
                    </TabsList>

                    <TabsContent value="all" className="mt-4">
                        <DraftList items={filtered} onClick={gotoDraft} onDelete={deleteDraft} />
                    </TabsContent>
                    {(["blog", "video", "shorts", "podcast"] as const).map((t) => (
                        <TabsContent key={t} value={t} className="mt-4">
                            <DraftList items={filtered.filter((d) => d.type === t)} onClick={gotoDraft} onDelete={deleteDraft} />
                        </TabsContent>
                    ))}
                </Tabs>
            )}
        </div>
    );
}

function DraftList({ items, onClick, onDelete }: { items: ContentDraft[]; onClick: (d: ContentDraft) => void; onDelete: (d: ContentDraft) => void }) {
    if (items.length === 0) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum rascunho aqui.
                </CardContent>
            </Card>
        );
    }
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {items.map((d) => {
                const meta = TYPE_META[d.type];
                const Icon = meta.icon;
                return (
                    <div
                        key={d.id}
                        className="group relative text-left p-3 rounded-lg border hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    >
                        <button onClick={() => onClick(d)} className="w-full text-left">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
                                        <Icon className={`h-3 w-3 ${meta.color}`} /> {meta.label}
                                    </div>
                                    <div className="text-sm font-medium line-clamp-2 pr-6">{d.title ?? "Sem título"}</div>
                                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        {new Date(d.updated_at).toLocaleDateString("pt-BR")}
                                    </div>
                                </div>
                                <Badge variant={d.status === "published" ? "default" : "outline"} className="text-[10px] shrink-0 capitalize">
                                    {d.status}
                                </Badge>
                            </div>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(d); }}
                            className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-opacity"
                            title="Deletar"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
