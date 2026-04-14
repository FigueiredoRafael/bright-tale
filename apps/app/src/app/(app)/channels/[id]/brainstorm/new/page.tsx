"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Lightbulb, Sparkles, ArrowLeft, ArrowRight, ClipboardPaste } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModelPicker, MODELS_BY_PROVIDER, type ProviderId } from "@/components/ai/ModelPicker";
import { ManualModePanel } from "@/components/ai/ManualModePanel";
import { useManualMode } from "@/hooks/use-manual-mode";
import { friendlyAiError } from "@/lib/ai/error-message";

type Mode = "blind" | "fine_tuned" | "reference_guided";

interface Idea {
    id?: string; // UUID from DB (needed for FK references)
    idea_id: string; // BC-IDEA-NNN display ID
    title: string;
    target_audience: string;
    verdict: "viable" | "weak" | "experimental";
    discovery_data: string;
}

const MODES: { id: Mode; label: string; description: string }[] = [
    {
        id: "blind",
        label: "Prompt cego",
        description: "Só um tema. A IA gera ideias amplas a partir do nicho do canal.",
    },
    {
        id: "fine_tuned",
        label: "Fine-tuning",
        description: "Tema + nicho, tom, público, objetivo e restrições. Mais focado.",
    },
    {
        id: "reference_guided",
        label: "Guiado por referência",
        description: "URL de um conteúdo (blog/YouTube). A IA modela a partir dele.",
    },
];

export default function NewBrainstormPage() {
    const { id: channelId } = useParams<{ id: string }>();
    const router = useRouter();

    const [mode, setMode] = useState<Mode>("blind");
    const [provider, setProvider] = useState<ProviderId>("gemini");
    const [model, setModel] = useState<string>("gemini-2.5-flash");
    const [recommended, setRecommended] = useState<{ provider: string | null; model: string | null }>({ provider: null, model: null });
    const [topic, setTopic] = useState("");
    const [niche, setNiche] = useState("");
    const [tone, setTone] = useState("");
    const [audience, setAudience] = useState("");
    const [goal, setGoal] = useState("");
    const [constraints, setConstraints] = useState("");
    const [referenceUrl, setReferenceUrl] = useState("");

    const [running, setRunning] = useState(false);
    const [ideas, setIdeas] = useState<Idea[]>([]);
    const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Manual mode
    const [generationMode, setGenerationMode] = useState<"ai" | "manual">("ai");
    const { enabled: manualEnabled } = useManualMode();

    // Fetch the brainstorm agent's recommended provider/model so we can render
    // the "Recommended" badge and prefill the picker.
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/agents");
                const json = await res.json();
                const agent = json.data?.agents?.find((a: { slug: string }) => a.slug === "brainstorm");
                if (agent?.recommended_provider) {
                    setRecommended({ provider: agent.recommended_provider, model: agent.recommended_model ?? null });
                    setProvider(agent.recommended_provider);
                    if (agent.recommended_model) setModel(agent.recommended_model);
                }
            } catch {
                // silent — keep defaults
            }
        })();
    }, []);

    async function handleRun() {
        if (mode !== "reference_guided" && !topic.trim()) {
            toast.error("Informe um tema");
            return;
        }
        if (mode === "reference_guided" && !referenceUrl.trim()) {
            toast.error("Cole a URL de referência");
            return;
        }

        setRunning(true);
        setIdeas([]);
        setSelectedIdeaId(null);
        setElapsed(0);
        timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
        try {
            const body: Record<string, unknown> = {
                channelId,
                inputMode: mode,
                provider,
                model,
                topic: topic.trim() || undefined,
            };
            if (mode === "fine_tuned") {
                body.fineTuning = { niche, tone, audience, goal, constraints };
            }
            if (mode === "reference_guided") {
                body.referenceUrl = referenceUrl.trim();
            }

            const res = await fetch("/api/brainstorm/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            // Some 5xx responses might not be JSON — handle that gracefully.
            let json: { data?: { ideas?: Idea[] }; error?: { message?: string; code?: string } } | null = null;
            try {
                json = await res.json();
            } catch {
                toast.error(`Servidor retornou ${res.status} sem JSON`);
                return;
            }

            if (json?.error) {
                const friendly = friendlyAiError(json.error.message ?? "");
                toast.error(friendly.title, { description: friendly.hint });
                return;
            }
            const generatedIdeas = json?.data?.ideas ?? [];
            setIdeas(generatedIdeas);
            if (generatedIdeas.length === 0) {
                toast.warning("Nenhuma ideia reconhecida no output", {
                    description: "A IA respondeu mas o formato não bateu. Tente outro modelo ou re-execute.",
                });
            } else {
                toast.success(`${generatedIdeas.length} ideias geradas`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const friendly = friendlyAiError(message);
            toast.error(friendly.title, { description: friendly.hint });
        } finally {
            setRunning(false);
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        }
    }

    async function handleManualImport(parsed: unknown) {
        const obj = parsed as Record<string, unknown>;
        const rawIdeas = Array.isArray(parsed) ? parsed : (obj.ideas ?? obj.results ?? []) as Array<Record<string, unknown>>;

        if (rawIdeas.length === 0) {
            toast.error("No ideas found in pasted output");
            return;
        }

        // Save each idea via /ideas/library POST (auto-generates idea_id)
        const saved: Idea[] = [];
        const errors: string[] = [];
        for (const idea of rawIdeas) {
            try {
                const title = String(idea.title ?? "").trim();
                if (title.length < 5) {
                    errors.push(`"${title || "(empty)"}" — title too short (min 5 chars)`);
                    continue;
                }
                const res = await fetch("/api/ideas/library", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title,
                        core_tension: String(idea.core_tension ?? ""),
                        target_audience: String(idea.target_audience ?? ""),
                        verdict: ["viable", "experimental", "weak"].includes(String(idea.verdict ?? ""))
                            ? idea.verdict : "experimental",
                        source_type: "manual",
                        channel_id: channelId,
                        tags: Array.isArray(idea.tags) ? idea.tags : [],
                    }),
                });
                const json = await res.json();
                if (json.error) {
                    errors.push(`"${title}" — ${json.error.message}`);
                    continue;
                }
                if (json.data?.idea) {
                    saved.push({
                        id: json.data.idea.id, // UUID for FK references
                        idea_id: json.data.idea.idea_id,
                        title: json.data.idea.title,
                        target_audience: json.data.idea.target_audience ?? "",
                        verdict: json.data.idea.verdict ?? "experimental",
                        discovery_data: JSON.stringify({
                            monetization: idea.monetization,
                            repurposing: idea.repurposing,
                        }),
                    });
                }
            } catch (err) {
                errors.push(`"${idea.title ?? "?"}" — ${err instanceof Error ? err.message : "unknown error"}`);
            }
        }

        if (saved.length > 0) {
            setIdeas(saved);
            toast.success(`${saved.length} of ${rawIdeas.length} ideas saved`);
        }
        if (errors.length > 0) {
            toast.error(`${errors.length} failed`, { description: errors.slice(0, 3).join("\n") });
        }
        if (saved.length === 0 && errors.length === 0) {
            toast.error("No ideas found in pasted output");
        }
    }

    const selectedIdea = ideas.find((i) => i.idea_id === selectedIdeaId) ?? null;

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <button
                    onClick={() => router.push(`/channels/${channelId}`)}
                    className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                >
                    <ArrowLeft className="h-3 w-3" /> Voltar pro canal
                </button>
                <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" /> Brainstorm
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Gere ideias para esse canal usando a IA. Cada brainstorm consome 50 créditos.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Modo de entrada</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                        {MODES.map((m) => (
                            <button
                                key={m.id}
                                onClick={() => setMode(m.id)}
                                className={`text-left p-3 rounded-lg border-2 transition-all ${
                                    mode === m.id
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:border-muted-foreground/30"
                                }`}
                            >
                                <div className="font-medium text-sm">{m.label}</div>
                                <div className="text-[11px] text-muted-foreground mt-1">{m.description}</div>
                            </button>
                        ))}
                    </div>

                    {mode !== "reference_guided" && (
                        <div className="space-y-2">
                            <Label>Tema</Label>
                            <Input
                                placeholder="e.g. produtividade pra desenvolvedores"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                autoFocus
                            />
                        </div>
                    )}

                    {mode === "fine_tuned" && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Nicho</Label>
                                <Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="tech / educação" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Tom</Label>
                                <Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="técnico / casual" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Público</Label>
                                <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="devs sênior" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Objetivo</Label>
                                <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="educar / engajar" />
                            </div>
                            <div className="col-span-2 space-y-1.5">
                                <Label className="text-xs">Restrições</Label>
                                <Textarea
                                    value={constraints}
                                    onChange={(e) => setConstraints(e.target.value)}
                                    placeholder="evitar X, sempre incluir Y…"
                                    rows={2}
                                />
                            </div>
                        </div>
                    )}

                    {mode === "reference_guided" && (
                        <div className="space-y-2">
                            <Label>URL de referência</Label>
                            <Input
                                placeholder="https://youtube.com/watch?v=… ou https://blog.com/post"
                                value={referenceUrl}
                                onChange={(e) => setReferenceUrl(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                A IA extrai o contexto desse conteúdo e gera variações alinhadas ao seu canal.
                            </p>
                        </div>
                    )}

                    <Tabs value={generationMode} onValueChange={(v) => setGenerationMode(v as "ai" | "manual")} className="mt-2">
                        <TabsList>
                            <TabsTrigger value="ai" className="gap-1.5">
                                <Sparkles className="h-3.5 w-3.5" /> AI Generation
                            </TabsTrigger>
                            {manualEnabled && (
                                <TabsTrigger value="manual" className="gap-1.5">
                                    <ClipboardPaste className="h-3.5 w-3.5" /> Manual (ChatGPT/Gemini)
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
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando...</>
                                ) : (
                                    <><Sparkles className="h-4 w-4 mr-2" /> Gerar ideias</>
                                )}
                            </Button>
                        </TabsContent>

                        {manualEnabled && (
                            <TabsContent value="manual" className="mt-3">
                                <ManualModePanel
                                    agentSlug="brainstorm"
                                    inputContext={[
                                        `Topic: ${topic || "(enter topic above)"}`,
                                        mode === "fine_tuned" && niche ? `Niche: ${niche}` : "",
                                        mode === "fine_tuned" && tone ? `Tone: ${tone}` : "",
                                        mode === "fine_tuned" && audience ? `Audience: ${audience}` : "",
                                        mode === "fine_tuned" && goal ? `Goal: ${goal}` : "",
                                        mode === "fine_tuned" && constraints ? `Constraints: ${constraints}` : "",
                                    ].filter(Boolean).join("\n")}
                                    pastePlaceholder={'Paste JSON:\n{"ideas":[{"title":"...","core_tension":"...","target_audience":"...","verdict":"viable"}]}'}
                                    onImport={handleManualImport}
                                    importLabel="Import Ideas"
                                    loading={running}
                                />
                            </TabsContent>
                        )}
                    </Tabs>
                </CardContent>
            </Card>

            {/* Progress Panel */}
            {running && (
                <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="py-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                <span className="text-sm font-medium">Generating ideas with {model}...</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">{provider}</Badge>
                                <span className="text-xs text-muted-foreground tabular-nums">{elapsed}s</span>
                            </div>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "60%" }} />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Ideas Selection */}
            {!running && ideas.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            Ideias geradas
                            <Badge variant="secondary" className="text-[10px]">{ideas.length}</Badge>
                            <span className="text-xs text-muted-foreground font-normal ml-auto">
                                Select one to continue to Research
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {ideas.map((idea) => {
                            let extra: { angle?: string; monetization?: string; repurposing?: string[] } = {};
                            try {
                                extra = JSON.parse(idea.discovery_data);
                            } catch {
                                // ignore
                            }
                            const isSelected = selectedIdeaId === idea.idea_id;
                            return (
                                <button
                                    key={idea.idea_id}
                                    onClick={() => setSelectedIdeaId(idea.idea_id)}
                                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                                        isSelected
                                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                            : "border-border hover:border-muted-foreground/30"
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`h-5 w-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                                            isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                                        }`}>
                                            {isSelected && (
                                                <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
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
                                            <div className="font-medium text-sm">{idea.title}</div>
                                            {idea.target_audience && (
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    Para: {idea.target_audience}
                                                </div>
                                            )}
                                            {extra.angle && (
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    Ângulo: {extra.angle}
                                                </div>
                                            )}
                                            {extra.repurposing && extra.repurposing.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {extra.repurposing.map((r) => (
                                                        <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </CardContent>
                </Card>
            )}

            {/* Sticky Footer — Next Step */}
            {selectedIdea && !running && (
                <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-50">
                    <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                            <Badge
                                variant={
                                    selectedIdea.verdict === "viable" ? "default" :
                                    selectedIdea.verdict === "weak" ? "destructive" : "secondary"
                                }
                                className="text-[10px] shrink-0"
                            >
                                {selectedIdea.verdict}
                            </Badge>
                            <span className="text-sm font-medium truncate">{selectedIdea.title}</span>
                        </div>
                        <Button
                            onClick={() => router.push(`/channels/${channelId}/research/new?ideaId=${selectedIdea.id ?? selectedIdea.idea_id}`)}
                            className="shrink-0 gap-2"
                        >
                            Next: Research <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Spacer for sticky footer */}
            {selectedIdea && !running && <div className="h-16" />}
        </div>
    );
}
