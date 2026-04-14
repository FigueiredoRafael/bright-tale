"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ModelPicker, MODELS_BY_PROVIDER, type ProviderId } from "@/components/ai/ModelPicker";
import { friendlyAiError } from "@/lib/ai/error-message";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Search, ArrowLeft, ArrowRight, Check, Sparkles, ClipboardPaste } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManualModePanel } from "@/components/ai/ManualModePanel";
import { useManualMode } from "@/hooks/use-manual-mode";

type Level = "surface" | "medium" | "deep";

interface Card {
    type?: string;
    title?: string;
    url?: string;
    author?: string;
    quote?: string;
    claim?: string;
    relevance?: number;
    [k: string]: unknown;
}

const LEVELS: { id: Level; label: string; cost: number; description: string }[] = [
    { id: "surface", label: "Surface", cost: 60, description: "Top 3 fontes, estatísticas básicas" },
    { id: "medium", label: "Medium", cost: 100, description: "5-8 fontes, citações de experts, dados" },
    { id: "deep", label: "Deep", cost: 180, description: "10+ fontes, contra-argumentos, validações" },
];

const FOCUS_OPTIONS = [
    { id: "stats", label: "Estatísticas" },
    { id: "expert_advice", label: "Expert advice" },
    { id: "pro_tips", label: "Pro tips" },
    { id: "validated_processes", label: "Processos validados" },
];

export default function NewResearchPage() {
    const { id: channelId } = useParams<{ id: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();
    const ideaIdParam = searchParams.get("ideaId") ?? undefined;

    const [topic, setTopic] = useState("");
    const [level, setLevel] = useState<Level>("medium");
    const [focusTags, setFocusTags] = useState<string[]>(["stats"]);
    const [provider, setProvider] = useState<ProviderId>("gemini");
    const [model, setModel] = useState<string>("gemini-2.5-flash");
    const [recommended, setRecommended] = useState<{ provider: string | null; model: string | null }>({ provider: null, model: null });
    const [running, setRunning] = useState(false);
    const [genMode, setGenMode] = useState<"ai" | "manual">("ai");
    const { enabled: manualEnabled } = useManualMode();

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/agents");
                const json = await res.json();
                const agent = json.data?.agents?.find((a: { slug: string }) => a.slug === "research");
                if (agent?.recommended_provider) {
                    setRecommended({ provider: agent.recommended_provider, model: agent.recommended_model ?? null });
                    setProvider(agent.recommended_provider);
                    if (agent.recommended_model) setModel(agent.recommended_model);
                }
            } catch {
                // silent
            }
        })();
    }, []);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [cards, setCards] = useState<Card[]>([]);
    const [approved, setApproved] = useState<Set<number>>(new Set());

    function toggleFocus(id: string) {
        setFocusTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
    }

    async function handleManualResearchImport(parsed: unknown) {
        const obj = parsed as Record<string, unknown>;
        const rawCards = (Array.isArray(parsed) ? parsed : obj.cards ?? obj.sources ?? obj.results ?? []) as Card[];
        if (rawCards.length === 0) {
            toast.error("No research cards found in pasted output");
            return;
        }
        setCards(rawCards);
        setApproved(new Set(rawCards.map((_, i) => i)));
        toast.success(`${rawCards.length} research cards imported`);
    }

    async function handleRun() {
        if (!topic.trim() && !ideaIdParam) {
            toast.error("Informe um tema ou venha de uma ideia");
            return;
        }
        setRunning(true);
        try {
            const res = await fetch("/api/research-sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channelId,
                    ideaId: ideaIdParam,
                    topic: topic.trim() || undefined,
                    level,
                    focusTags,
                    provider,
                    model,
                }),
            });
            const json = await res.json();
            if (json.error) {
                const friendly = friendlyAiError(json.error.message ?? "");
                toast.error(friendly.title, { description: friendly.hint });
                return;
            }
            setSessionId(json.data.sessionId);
            setCards(json.data.cards ?? []);
            setApproved(new Set((json.data.cards ?? []).map((_: Card, i: number) => i)));
            toast.success(`${json.data.cards?.length ?? 0} cards de pesquisa`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const friendly = friendlyAiError(message);
            toast.error(friendly.title, { description: friendly.hint });
        } finally {
            setRunning(false);
        }
    }

    function toggleApproval(i: number) {
        setApproved((prev) => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
        });
    }

    async function handleApprove() {
        if (!sessionId) return;
        const approvedCards = cards.filter((_, i) => approved.has(i));
        try {
            const res = await fetch(`/api/research-sessions/${sessionId}/review`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ approvedCardsJson: approvedCards }),
            });
            const json = await res.json();
            if (json.error) {
                toast.error(json.error.message);
                return;
            }
            toast.success(`${approvedCards.length} cards aprovados`);
            router.push(`/channels/${channelId}/create`);
        } catch {
            toast.error("Falha ao salvar review");
        }
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <button
                    onClick={() => router.back()}
                    className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                >
                    <ArrowLeft className="h-3 w-3" /> Voltar
                </button>
                <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
                    <Search className="h-5 w-5" /> Nova Pesquisa
                </h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Configuração</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Tema {ideaIdParam && <span className="text-xs text-muted-foreground">(opcional — vindo de uma ideia)</span>}</Label>
                        <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. deep work techniques" />
                    </div>

                    <div className="space-y-2">
                        <Label>Nível de pesquisa</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {LEVELS.map((l) => (
                                <button
                                    key={l.id}
                                    onClick={() => setLevel(l.id)}
                                    className={`text-left p-3 rounded-lg border-2 transition-all ${
                                        level === l.id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-sm">{l.label}</span>
                                        <Badge variant="outline" className="text-[10px]">{l.cost}c</Badge>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground mt-1">{l.description}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Foco</Label>
                        <div className="flex flex-wrap gap-2">
                            {FOCUS_OPTIONS.map((opt) => (
                                <label
                                    key={opt.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs cursor-pointer hover:bg-muted/30"
                                >
                                    <Checkbox
                                        checked={focusTags.includes(opt.id)}
                                        onCheckedChange={() => toggleFocus(opt.id)}
                                    />
                                    {opt.label}
                                </label>
                            ))}
                        </div>
                    </div>

                    <Tabs value={genMode} onValueChange={(v) => setGenMode(v as "ai" | "manual")} className="mt-2">
                        <TabsList>
                            <TabsTrigger value="ai" className="gap-1.5">
                                <Sparkles className="h-3.5 w-3.5" /> AI Research
                            </TabsTrigger>
                            {manualEnabled && (
                                <TabsTrigger value="manual" className="gap-1.5">
                                    <ClipboardPaste className="h-3.5 w-3.5" /> Manual
                                </TabsTrigger>
                            )}
                        </TabsList>

                        <TabsContent value="ai" className="space-y-4 mt-3">
                            <ModelPicker
                                provider={provider}
                                model={model}
                                recommended={recommended}
                                onProviderChange={(p) => {
                                    setProvider(p);
                                    setModel(MODELS_BY_PROVIDER[p][0].id);
                                }}
                                onModelChange={setModel}
                            />
                            <Button onClick={handleRun} disabled={running}>
                                {running ? (
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Pesquisando...</>
                                ) : (
                                    <><Search className="h-4 w-4 mr-2" /> Pesquisar</>
                                )}
                            </Button>
                        </TabsContent>

                        {manualEnabled && (
                            <TabsContent value="manual" className="mt-3">
                                <ManualModePanel
                                    agentSlug="research"
                                    inputContext={[
                                        `Topic: ${topic || "(enter topic above)"}`,
                                        `Level: ${level}`,
                                        `Focus: ${focusTags.join(", ") || "general"}`,
                                        ideaIdParam ? `Idea ID: ${ideaIdParam}` : "",
                                    ].filter(Boolean).join("\n")}
                                    pastePlaceholder={'Paste JSON:\n{"cards":[{"title":"Finding","summary":"...","source":"URL","credibility":"high"}]}'}
                                    onImport={handleManualResearchImport}
                                    importLabel="Import Research"
                                    loading={running}
                                />
                            </TabsContent>
                        )}
                    </Tabs>
                </CardContent>
            </Card>

            {cards.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center justify-between">
                            <span>Cards de pesquisa <Badge variant="secondary" className="text-[10px] ml-1">{cards.length}</Badge></span>
                            <span className="text-xs text-muted-foreground font-normal">{approved.size} aprovados</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {cards.map((c, i) => {
                            const isApproved = approved.has(i);
                            return (
                                <div
                                    key={i}
                                    className={`p-3 rounded-lg border ${
                                        isApproved ? "border-primary/50 bg-primary/5" : "border-border opacity-60"
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <Checkbox checked={isApproved} onCheckedChange={() => toggleApproval(i)} className="mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                {c.type && <Badge variant="outline" className="text-[10px]">{c.type}</Badge>}
                                                {typeof c.relevance === "number" && (
                                                    <Badge variant="secondary" className="text-[10px]">
                                                        relevância {c.relevance}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="text-sm font-medium mt-1">
                                                {c.title ?? c.claim ?? c.quote ?? "—"}
                                            </div>
                                            {c.author && <div className="text-xs text-muted-foreground mt-1">— {c.author}</div>}
                                            {c.url && (
                                                <a href={c.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">
                                                    {c.url}
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        <div className="flex justify-end pt-2">
                            <Button onClick={handleApprove}>
                                <Check className="h-4 w-4 mr-2" /> Aprovar ({approved.size}) <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
