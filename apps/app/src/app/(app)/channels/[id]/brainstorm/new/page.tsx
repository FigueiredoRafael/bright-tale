"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Lightbulb, Sparkles, ArrowLeft, RefreshCw, Check } from "lucide-react";
import { ModelPicker, MODELS_BY_PROVIDER, type ProviderId } from "@/components/ai/ModelPicker";
import { friendlyAiError } from "@/lib/ai/error-message";
import { GenerationProgressModal } from "@/components/generation/GenerationProgressModal";
import { ConfirmRegenerateModal } from "@/components/generation/ConfirmRegenerateModal";
import { WizardStepper } from "@/components/generation/WizardStepper";
import { useUpgrade } from "@/components/billing/UpgradeProvider";

type Mode = "blind" | "fine_tuned" | "reference_guided";

interface Idea {
    id: string;
    idea_id?: string;              // present in saved ideas, undefined in drafts
    title: string;
    target_audience: string;
    verdict: "viable" | "weak" | "experimental";
    discovery_data: string;
    // brainstorm_drafts shape
    session_id?: string;
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
    const [count, setCount] = useState<number>(5);
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
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [confirmRegen, setConfirmRegen] = useState(false);
    const { handleMaybeCreditsError } = useUpgrade();

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
        try {
            const body: Record<string, unknown> = {
                channelId,
                inputMode: mode,
                provider,
                model,
                count,
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

            let json: { data?: { sessionId?: string }; error?: { message?: string; code?: string } } | null = null;
            try {
                json = await res.json();
            } catch {
                toast.error(`Servidor retornou ${res.status} sem JSON`);
                setRunning(false);
                return;
            }

            if (json?.error) {
                if (handleMaybeCreditsError(json.error)) {
                    setRunning(false);
                    return;
                }
                const friendly = friendlyAiError(json.error.message ?? "");
                toast.error(friendly.title, { description: friendly.hint });
                setRunning(false);
                return;
            }

            if (json?.data?.sessionId) {
                setActiveSessionId(json.data.sessionId);
                // running stays true; modal will flip it off on complete/fail.
            } else {
                setRunning(false);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const friendly = friendlyAiError(message);
            toast.error(friendly.title, { description: friendly.hint });
            setRunning(false);
        }
    }

    async function onJobComplete() {
        if (!activeSessionId) return;
        try {
            // F2-037: ideas são drafts (staging) até o user selecionar o que salvar.
            const res = await fetch(`/api/brainstorm/sessions/${activeSessionId}/drafts`);
            const json = await res.json();
            const generatedIdeas: Idea[] = json?.data?.drafts ?? [];
            setIdeas(generatedIdeas);
            // Pré-selecionar tudo — usuário só desmarca o que não quer.
            setSelectedIdeaIds(new Set(generatedIdeas.map((i) => i.id)));
            toast.success(`${generatedIdeas.length} ideias geradas — escolha quais salvar`);
        } catch {
            toast.error("Ideias geradas mas falha ao carregar");
        } finally {
            setRunning(false);
            setActiveSessionId(null);
        }
    }

    const [selectedIdeaIds, setSelectedIdeaIds] = useState<Set<string>>(new Set());
    const [savingSelection, setSavingSelection] = useState(false);

    function toggleIdea(id: string) {
        setSelectedIdeaIds((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
        });
    }

    async function saveSelected() {
        if (!activeSessionIdForDrafts() || selectedIdeaIds.size === 0 || savingSelection) return;
        setSavingSelection(true);
        try {
            const sid = activeSessionIdForDrafts();
            const res = await fetch(`/api/brainstorm/sessions/${sid}/drafts/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ draftIds: Array.from(selectedIdeaIds) }),
            });
            const json = await res.json();
            if (json?.error) {
                toast.error(json.error.message ?? "Falha ao salvar");
                return;
            }
            toast.success(`${json.data.saved} ideias salvas na biblioteca`);
            setIdeas([]);
            setSelectedIdeaIds(new Set());
        } finally {
            setSavingSelection(false);
        }
    }

    async function discardAll() {
        const sid = activeSessionIdForDrafts();
        if (!sid) return;
        if (!confirm("Descartar todas as ideias deste brainstorm? Não dá pra recuperar.")) return;
        await fetch(`/api/brainstorm/sessions/${sid}/drafts`, { method: "DELETE" });
        setIdeas([]);
        setSelectedIdeaIds(new Set());
        toast.success("Descartado");
    }

    function activeSessionIdForDrafts(): string | null {
        return ideas[0]?.session_id ?? null;
    }

    function onJobFailed(message: string) {
        const friendly = friendlyAiError(message);
        toast.error(friendly.title, { description: friendly.hint });
        setRunning(false);
        setActiveSessionId(null);
    }

    // (pickIdea removed in F2-037 — ideas now go through draft selection
    // instead of jumping straight to research. Once saved, users pick from
    // /create hub or directly on /research/new with ?ideaId=.)

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <ConfirmRegenerateModal
                open={confirmRegen}
                title="Refazer brainstorm?"
                description="Vai gerar um novo conjunto de ideias com o tema atual. As ideias anteriores ficam salvas no histórico."
                initialProvider={provider}
                initialModel={model}
                onConfirm={async (p, m) => {
                    setProvider(p);
                    setModel(m);
                    setConfirmRegen(false);
                    await handleRun();
                }}
                onClose={() => setConfirmRegen(false)}
            />
            {activeSessionId && (
                <GenerationProgressModal
                    open={!!activeSessionId}
                    sessionId={activeSessionId}
                    sseUrl={`/api/brainstorm/sessions/${activeSessionId}/events`}
                    onComplete={onJobComplete}
                    onFailed={onJobFailed}
                    onClose={() => { setActiveSessionId(null); setRunning(false); }}
                />
            )}
            <div>
                <button
                    onClick={() => router.push(`/channels/${channelId}`)}
                    className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                >
                    <ArrowLeft className="h-3 w-3" /> Voltar pro canal
                </button>
                <div className="mt-2"><WizardStepper current="brainstorm" /></div>
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

                    <div className="space-y-2">
                        <Label>Quantas ideias?</Label>
                        <div className="grid grid-cols-4 gap-2">
                            {[3, 5, 7, 10].map((n) => (
                                <button
                                    key={n}
                                    onClick={() => setCount(n)}
                                    className={`p-2 rounded-md border text-sm ${
                                        count === n ? "border-primary bg-primary/5 text-primary font-medium" : "border-border hover:border-muted-foreground/30"
                                    }`}
                                >
                                    {n}<span className="text-xs text-muted-foreground"> ideias</span>
                                </button>
                            ))}
                        </div>
                    </div>

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
                </CardContent>
            </Card>

            {ideas.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                                Ideias geradas <Badge variant="secondary" className="text-[10px]">{ideas.length}</Badge>
                                <span className="text-xs text-muted-foreground font-normal">— marque o que quer salvar</span>
                            </span>
                            <Button onClick={() => setConfirmRegen(true)} variant="outline" size="sm" disabled={running}>
                                <RefreshCw className="h-4 w-4 mr-1.5" /> Refazer
                            </Button>
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
                            const isSelected = selectedIdeaIds.has(idea.id);
                            return (
                                <div
                                    key={idea.id}
                                    onClick={() => toggleIdea(idea.id)}
                                    className={`w-full text-left p-4 rounded-lg border cursor-pointer transition-colors ${
                                        isSelected
                                            ? "border-primary/60 bg-primary/5"
                                            : "border-border opacity-60 hover:opacity-100 hover:border-muted-foreground/30"
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleIdea(idea.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="mt-1 shrink-0 accent-primary"
                                        />
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
                                </div>
                            );
                        })}

                        <div className="flex items-center justify-between pt-2 border-t">
                            <Button variant="ghost" size="sm" onClick={discardAll} disabled={savingSelection}>
                                Descartar tudo
                            </Button>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {selectedIdeaIds.size} de {ideas.length} selecionadas
                                </span>
                                <Button onClick={saveSelected} disabled={savingSelection || selectedIdeaIds.size === 0}>
                                    {savingSelection ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                                    Salvar {selectedIdeaIds.size}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
