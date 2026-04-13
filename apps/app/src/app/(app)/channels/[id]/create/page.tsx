"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
    Lightbulb, Search, Sparkles, ArrowRight, Loader2, BookOpen,
    FileText, Video, Zap, Mic, Archive, Clock,
} from "lucide-react";

interface ChannelIdea {
    id: string;
    idea_id: string;
    title: string;
    target_audience: string | null;
    verdict: "viable" | "weak" | "experimental";
    discovery_data: string | null;
}

interface ResearchSession {
    id: string;
    level: "surface" | "medium" | "deep";
    status: string;
    input_json: { topic?: string | null } | null;
    cards_json: unknown[] | null;
    created_at: string;
}

interface ContentDraft {
    id: string;
    type: "blog" | "video" | "shorts" | "podcast";
    title: string | null;
    status: string;
    idea_id: string | null;
    research_session_id: string | null;
    updated_at: string;
}

const TYPE_META: Record<ContentDraft["type"], { label: string; icon: typeof FileText; color: string }> = {
    blog: { label: "Blog", icon: FileText, color: "text-blue-500" },
    video: { label: "Vídeo", icon: Video, color: "text-purple-500" },
    shorts: { label: "Shorts", icon: Zap, color: "text-amber-500" },
    podcast: { label: "Podcast", icon: Mic, color: "text-rose-500" },
};

export default function CreateContentPage() {
    const { id: channelId } = useParams<{ id: string }>();
    const router = useRouter();

    const [ideas, setIdeas] = useState<ChannelIdea[]>([]);
    const [researches, setResearches] = useState<ResearchSession[]>([]);
    const [drafts, setDrafts] = useState<ContentDraft[]>([]);
    const [loading, setLoading] = useState(true);

    const [showArchivedIdeas, setShowArchivedIdeas] = useState(false);
    const [showArchivedResearch, setShowArchivedResearch] = useState(false);
    const [searchIdeas, setSearchIdeas] = useState("");
    const [searchResearch, setSearchResearch] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const [iRes, rRes, dRes] = await Promise.all([
                    fetch(`/api/ideas/library?channel_id=${channelId}&limit=100`),
                    fetch(`/api/research-sessions?channel_id=${channelId}&status=completed&limit=100`),
                    fetch(`/api/content-drafts?channel_id=${channelId}`),
                ]);
                const [iJson, rJson, dJson] = await Promise.all([iRes.json(), rRes.json(), dRes.json()]);
                setIdeas(iJson?.data?.ideas ?? []);
                setResearches(rJson?.data?.sessions ?? []);
                setDrafts(dJson?.data?.drafts ?? []);
            } finally {
                setLoading(false);
            }
        })();
    }, [channelId]);

    // Derive "used" sets so the user knows what's already turned into content.
    const usedIdeaIds = useMemo(() => new Set(drafts.map((d) => d.idea_id).filter(Boolean) as string[]), [drafts]);
    const usedResearchIds = useMemo(() => new Set(drafts.map((d) => d.research_session_id).filter(Boolean) as string[]), [drafts]);

    const visibleIdeas = useMemo(() => {
        const term = searchIdeas.trim().toLowerCase();
        return ideas
            .filter((i) => showArchivedIdeas || !usedIdeaIds.has(i.id))
            .filter((i) => !term || i.title.toLowerCase().includes(term));
    }, [ideas, usedIdeaIds, showArchivedIdeas, searchIdeas]);

    const visibleResearch = useMemo(() => {
        const term = searchResearch.trim().toLowerCase();
        return researches
            .filter((r) => showArchivedResearch || !usedResearchIds.has(r.id))
            .filter((r) => !term || (r.input_json?.topic ?? "").toLowerCase().includes(term));
    }, [researches, usedResearchIds, showArchivedResearch, searchResearch]);

    const archivedIdeasCount = ideas.filter((i) => usedIdeaIds.has(i.id)).length;
    const archivedResearchCount = researches.filter((r) => usedResearchIds.has(r.id)).length;
    const draftsByType = useMemo(() => {
        const grouped: Record<ContentDraft["type"], ContentDraft[]> = { blog: [], video: [], shorts: [], podcast: [] };
        for (const d of drafts) grouped[d.type]?.push(d);
        return grouped;
    }, [drafts]);

    function startResearchFromIdea(idea: ChannelIdea) {
        router.push(`/channels/${channelId}/research/new?ideaId=${encodeURIComponent(idea.id)}`);
    }
    function startDraftFromResearch(r: ResearchSession) {
        router.push(`/channels/${channelId}/drafts/new?researchSessionId=${encodeURIComponent(r.id)}`);
    }

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Create Content</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Brainstorm → Pesquisa → Conteúdo. Itens já usados ficam arquivados pra evitar duplicação.
                </p>
            </div>

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

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <Tabs defaultValue="ideas" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="ideas" className="gap-1.5">
                            <Lightbulb className="h-3.5 w-3.5" /> Ideias
                            <Badge variant="secondary" className="text-[10px] ml-1">{visibleIdeas.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="research" className="gap-1.5">
                            <BookOpen className="h-3.5 w-3.5" /> Pesquisas
                            <Badge variant="secondary" className="text-[10px] ml-1">{visibleResearch.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="content" className="gap-1.5">
                            <Sparkles className="h-3.5 w-3.5" /> Conteúdo
                            <Badge variant="secondary" className="text-[10px] ml-1">{drafts.length}</Badge>
                        </TabsTrigger>
                    </TabsList>

                    {/* IDEAS */}
                    <TabsContent value="ideas" className="mt-4">
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between gap-3">
                                    <CardTitle className="text-base">Ideias disponíveis</CardTitle>
                                    {archivedIdeasCount > 0 && (
                                        <button
                                            onClick={() => setShowArchivedIdeas((v) => !v)}
                                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                        >
                                            <Archive className="h-3 w-3" />
                                            {showArchivedIdeas ? "Ocultar" : "Mostrar"} arquivadas ({archivedIdeasCount})
                                        </button>
                                    )}
                                </div>
                                <Input
                                    placeholder="Buscar por título…"
                                    value={searchIdeas}
                                    onChange={(e) => setSearchIdeas(e.target.value)}
                                    className="mt-2"
                                />
                            </CardHeader>
                            <CardContent>
                                {visibleIdeas.length === 0 ? (
                                    <EmptyState
                                        message={ideas.length === 0 ? "Nenhuma ideia ainda neste canal." : "Tudo já virou conteúdo. 🎉"}
                                        cta={ideas.length === 0 ? "Rodar brainstorm" : null}
                                        onCta={() => router.push(`/channels/${channelId}/brainstorm/new`)}
                                    />
                                ) : (
                                    <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
                                        {visibleIdeas.map((idea) => {
                                            const used = usedIdeaIds.has(idea.id);
                                            return (
                                                <button
                                                    key={idea.id}
                                                    onClick={() => startResearchFromIdea(idea)}
                                                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                                                        used
                                                            ? "border-border opacity-60 hover:opacity-100 hover:border-primary/50"
                                                            : "border-border hover:border-primary/50 hover:bg-muted/30"
                                                    }`}
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
                                                            <div className="text-sm font-medium flex items-center gap-2">
                                                                {idea.title}
                                                                {used && <Badge variant="outline" className="text-[9px]"><Archive className="h-2.5 w-2.5 mr-0.5" /> usada</Badge>}
                                                            </div>
                                                            {idea.target_audience && (
                                                                <div className="text-xs text-muted-foreground truncate mt-0.5">
                                                                    Para: {idea.target_audience}
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
                    </TabsContent>

                    {/* RESEARCH */}
                    <TabsContent value="research" className="mt-4">
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between gap-3">
                                    <CardTitle className="text-base">Pesquisas disponíveis</CardTitle>
                                    {archivedResearchCount > 0 && (
                                        <button
                                            onClick={() => setShowArchivedResearch((v) => !v)}
                                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                        >
                                            <Archive className="h-3 w-3" />
                                            {showArchivedResearch ? "Ocultar" : "Mostrar"} arquivadas ({archivedResearchCount})
                                        </button>
                                    )}
                                </div>
                                <Input
                                    placeholder="Buscar por tema…"
                                    value={searchResearch}
                                    onChange={(e) => setSearchResearch(e.target.value)}
                                    className="mt-2"
                                />
                            </CardHeader>
                            <CardContent>
                                {visibleResearch.length === 0 ? (
                                    <EmptyState
                                        message={researches.length === 0 ? "Nenhuma pesquisa ainda." : "Todas viraram conteúdo. 🎉"}
                                        cta={researches.length === 0 ? "Iniciar pesquisa" : null}
                                        onCta={() => router.push(`/channels/${channelId}/research/new`)}
                                    />
                                ) : (
                                    <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
                                        {visibleResearch.map((r) => {
                                            const used = usedResearchIds.has(r.id);
                                            const cardCount = Array.isArray(r.cards_json) ? r.cards_json.length : 0;
                                            return (
                                                <button
                                                    key={r.id}
                                                    onClick={() => startDraftFromResearch(r)}
                                                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                                                        used
                                                            ? "border-border opacity-60 hover:opacity-100 hover:border-primary/50"
                                                            : "border-border hover:border-primary/50 hover:bg-muted/30"
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <BookOpen className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-medium flex items-center gap-2">
                                                                {r.input_json?.topic ?? "Sem tema"}
                                                                {used && <Badge variant="outline" className="text-[9px]"><Archive className="h-2.5 w-2.5 mr-0.5" /> usada</Badge>}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <Badge variant="outline" className="text-[10px] capitalize">{r.level}</Badge>
                                                                <Badge variant="secondary" className="text-[10px]">{cardCount} cards</Badge>
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                                                                </span>
                                                            </div>
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
                    </TabsContent>

                    {/* CONTENT */}
                    <TabsContent value="content" className="mt-4 space-y-3">
                        {drafts.length === 0 ? (
                            <Card>
                                <CardContent className="py-8">
                                    <EmptyState
                                        message="Nenhum conteúdo gerado ainda."
                                        cta="Gerar conteúdo"
                                        onCta={() => router.push(`/channels/${channelId}/drafts/new`)}
                                    />
                                </CardContent>
                            </Card>
                        ) : (
                            (Object.keys(TYPE_META) as ContentDraft["type"][]).map((t) => {
                                const list = draftsByType[t];
                                if (!list || list.length === 0) return null;
                                const meta = TYPE_META[t];
                                const Icon = meta.icon;
                                return (
                                    <Card key={t}>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <Icon className={`h-4 w-4 ${meta.color}`} /> {meta.label}
                                                <Badge variant="secondary" className="text-[10px]">{list.length}</Badge>
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {list.map((d) => (
                                                    <button
                                                        key={d.id}
                                                        onClick={() => router.push(`/channels/${channelId}/drafts/${d.id}`)}
                                                        className="text-left p-3 rounded-lg border hover:border-primary/50 hover:bg-muted/30 transition-colors"
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-sm font-medium line-clamp-2">{d.title ?? "Sem título"}</div>
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
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })
                        )}
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}

function EmptyState({ message, cta, onCta }: { message: string; cta: string | null; onCta: () => void }) {
    return (
        <div className="text-center py-8 text-sm text-muted-foreground">
            {message}
            {cta && (
                <>
                    {" "}
                    <button className="text-primary hover:underline" onClick={onCta}>
                        {cta}
                    </button>
                </>
            )}
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
