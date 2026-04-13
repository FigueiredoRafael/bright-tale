"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Sparkles, FileText, Video, Zap, Mic, ArrowLeft, Check, BookOpen, Pencil } from "lucide-react";
import { ResearchPickerModal, type ResearchOption } from "@/components/research/ResearchPickerModal";
import { ModelPicker, MODELS_BY_PROVIDER, type ProviderId } from "@/components/ai/ModelPicker";
import { friendlyAiError } from "@/lib/ai/error-message";
import { GenerationProgressModal } from "@/components/generation/GenerationProgressModal";
import { WizardStepper } from "@/components/generation/WizardStepper";

type DraftType = "blog" | "video" | "shorts" | "podcast";

const TYPES: { id: DraftType; label: string; icon: typeof FileText; cost: number }[] = [
    { id: "blog", label: "Blog", icon: FileText, cost: 200 },
    { id: "video", label: "Vídeo", icon: Video, cost: 200 },
    { id: "shorts", label: "Shorts", icon: Zap, cost: 100 },
    { id: "podcast", label: "Podcast", icon: Mic, cost: 150 },
];

export default function NewDraftPage() {
    const { id: channelId } = useParams<{ id: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();
    const ideaIdParam = searchParams.get("ideaId") ?? undefined;
    const researchSessionIdParam = searchParams.get("researchSessionId") ?? undefined;

    const [pickerOpen, setPickerOpen] = useState(false);
    const [research, setResearch] = useState<ResearchOption | null>(null);
    const [type, setType] = useState<DraftType>("blog");
    const [title, setTitle] = useState("");
    const [editingTitle, setEditingTitle] = useState(false);
    const [provider, setProvider] = useState<ProviderId>("ollama");
    const [model, setModel] = useState<string>("qwen2.5:7b");
    const [targetWords, setTargetWords] = useState<number>(700);
    const [targetMinutes, setTargetMinutes] = useState<number>(8);
    const [targetShortsSeconds, setTargetShortsSeconds] = useState<number>(30);

    // If query has researchSessionId, fetch and prefill.
    useEffect(() => {
        if (!researchSessionIdParam) return;
        (async () => {
            try {
                const res = await fetch(`/api/research-sessions/${researchSessionIdParam}`);
                const json = await res.json();
                if (json?.data) {
                    setResearch(json.data as ResearchOption);
                    if (!title && json.data.input_json?.topic) setTitle(json.data.input_json.topic);
                }
            } catch {
                // silent
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [researchSessionIdParam]);
    const [draftId, setDraftId] = useState<string | null>(null);
    const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function runStep(label: string, fn: () => Promise<Response>) {
        setBusy(true);
        try {
            const res = await fn();
            const json = await res.json();
            if (json.error) {
                const friendly = friendlyAiError(json.error.message ?? "");
                toast.error(`${label}: ${friendly.title}`, { description: friendly.hint });
                return null;
            }
            return json.data;
        } catch {
            toast.error(`${label} falhou`);
            return null;
        } finally {
            setBusy(false);
        }
    }

    async function handleStart() {
        if (busy || activeDraftId) return; // prevent double-click during in-flight POST
        if (!research) {
            toast.error("Escolha (ou crie) uma pesquisa antes de gerar conteúdo");
            setPickerOpen(true);
            return;
        }
        if (!title.trim()) {
            toast.error("Informe um título");
            return;
        }
        // Build production_params based on the chosen format.
        const productionParams: Record<string, unknown> = {};
        if (type === "blog") productionParams.target_word_count = targetWords;
        if (type === "video" || type === "podcast") productionParams.target_duration_minutes = targetMinutes;
        if (type === "shorts") productionParams.target_duration_minutes = targetShortsSeconds / 60;

        const draft = await runStep("criar draft", () =>
            fetch("/api/content-drafts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channelId,
                    ideaId: ideaIdParam,
                    researchSessionId: research.id,
                    type,
                    title,
                    productionParams,
                }),
            }),
        );
        if (!draft) return;
        const newDraftId = (draft as { id: string }).id;
        setDraftId(newDraftId);

        // Enqueue the full pipeline (canonical-core + produce) and watch progress via SSE.
        const enqueued = await runStep("iniciar produção", () =>
            fetch(`/api/content-drafts/${newDraftId}/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider, model }),
            }),
        );
        if (!enqueued) return;
        setActiveDraftId(newDraftId);
    }

    function onJobComplete() {
        if (!draftId) return;
        toast.success("Conteúdo gerado");
        router.push(`/channels/${channelId}/drafts/${draftId}`);
    }

    function onJobFailed(message: string) {
        const friendly = friendlyAiError(message);
        toast.error(friendly.title, { description: friendly.hint });
        setActiveDraftId(null);
        // Even on failure, the draft row exists with status='failed' — send the
        // user to the draft page so they can inspect, retry with another model,
        // or delete it. Better than leaving them stranded on /new.
        if (draftId) router.push(`/channels/${channelId}/drafts/${draftId}`);
    }

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-6">
            <ResearchPickerModal
                open={pickerOpen}
                channelId={channelId}
                onSelect={(r) => {
                    setResearch(r);
                    if (!title && r.input_json?.topic) setTitle(r.input_json.topic);
                }}
                onClose={() => setPickerOpen(false)}
            />
            {activeDraftId && (
                <GenerationProgressModal
                    open={!!activeDraftId}
                    sessionId={activeDraftId}
                    sseUrl={`/api/content-drafts/${activeDraftId}/events`}
                    title={`Gerando ${type}`}
                    onComplete={onJobComplete}
                    onFailed={onJobFailed}
                    onClose={() => {
                        setActiveDraftId(null);
                        // If the user closes the modal manually, take them to the
                        // draft so they can see status / retry / delete instead of
                        // staying on /new with a half-spawned draft.
                        if (draftId) router.push(`/channels/${channelId}/drafts/${draftId}`);
                    }}
                />
            )}
            <div>
                <button
                    onClick={() => router.back()}
                    className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                >
                    <ArrowLeft className="h-3 w-3" /> Voltar
                </button>
                <div className="mt-2"><WizardStepper current="drafts" /></div>
                <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
                    <Sparkles className="h-5 w-5" /> Novo conteúdo
                </h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <BookOpen className="h-4 w-4" /> Pesquisa base
                        <Badge variant="outline" className="text-[10px] ml-1">obrigatório</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {research ? (
                        <div className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-muted/20">
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium line-clamp-2">
                                    {research.input_json?.topic ?? "Sem tema"}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="text-[10px] capitalize">{research.level}</Badge>
                                    <Badge variant="secondary" className="text-[10px]">
                                        {Array.isArray(research.cards_json) ? research.cards_json.length : 0} cards
                                    </Badge>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setPickerOpen(true)}>
                                Trocar
                            </Button>
                        </div>
                    ) : (
                        <Button variant="outline" onClick={() => setPickerOpen(true)} className="w-full">
                            <BookOpen className="h-4 w-4 mr-2" /> Escolher ou criar pesquisa
                        </Button>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Formato + gerar</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {research && (
                        <div className="text-sm">
                            <span className="text-muted-foreground">Tema:</span>{" "}
                            {editingTitle ? (
                                <Input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    onBlur={() => setEditingTitle(false)}
                                    onKeyDown={(e) => { if (e.key === "Enter") setEditingTitle(false); }}
                                    autoFocus
                                    className="inline-block w-auto min-w-[300px] mt-1"
                                />
                            ) : (
                                <button
                                    onClick={() => setEditingTitle(true)}
                                    className="font-medium hover:text-primary inline-flex items-center gap-1.5 group"
                                    title="Clique pra editar"
                                >
                                    {title || "(sem título — clique pra editar)"}
                                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                                </button>
                            )}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Formato</Label>
                        <div className="grid grid-cols-4 gap-2">
                            {TYPES.map((t) => {
                                const Icon = t.icon;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setType(t.id)}
                                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                                            type === t.id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                                        }`}
                                    >
                                        <Icon className="h-4 w-4 mb-1.5" />
                                        <div className="text-sm font-medium">{t.label}</div>
                                        <Badge variant="outline" className="text-[10px] mt-1">{t.cost}c</Badge>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Per-type target length picker */}
                    {type === "blog" && (
                        <div className="space-y-2">
                            <Label>Tamanho do post</Label>
                            <div className="grid grid-cols-4 gap-2">
                                {[300, 500, 700, 1000, 1500, 2000].slice(0, 4).map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => setTargetWords(n)}
                                        className={`p-2 rounded-md border text-sm ${
                                            targetWords === n ? "border-primary bg-primary/5 text-primary font-medium" : "border-border hover:border-muted-foreground/30"
                                        }`}
                                    >
                                        {n}<span className="text-xs text-muted-foreground"> palavras</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {(type === "video" || type === "podcast") && (
                        <div className="space-y-2">
                            <Label>Duração alvo</Label>
                            <div className="grid grid-cols-5 gap-2">
                                {(type === "video" ? [3, 5, 8, 10, 15] : [10, 20, 30, 45, 60]).map((m) => (
                                    <button
                                        key={m}
                                        onClick={() => setTargetMinutes(m)}
                                        className={`p-2 rounded-md border text-sm ${
                                            targetMinutes === m ? "border-primary bg-primary/5 text-primary font-medium" : "border-border hover:border-muted-foreground/30"
                                        }`}
                                    >
                                        {m}<span className="text-xs text-muted-foreground">min</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {type === "shorts" && (
                        <div className="space-y-2">
                            <Label>Duração</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {[15, 30, 60].map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setTargetShortsSeconds(s)}
                                        className={`p-2 rounded-md border text-sm ${
                                            targetShortsSeconds === s ? "border-primary bg-primary/5 text-primary font-medium" : "border-border hover:border-muted-foreground/30"
                                        }`}
                                    >
                                        {s}<span className="text-xs text-muted-foreground">s</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <ModelPicker
                        provider={provider}
                        model={model}
                        recommended={{ provider: null, model: null }}
                        onProviderChange={(p) => {
                            setProvider(p);
                            setModel(MODELS_BY_PROVIDER[p][0].id);
                        }}
                        onModelChange={setModel}
                    />

                    <Button onClick={handleStart} disabled={busy || !!activeDraftId || !research}>
                        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                        Gerar
                    </Button>
                    {!research && (
                        <p className="text-xs text-muted-foreground">
                            Selecione uma pesquisa primeiro — produção sem pesquisa fica fraca.
                        </p>
                    )}
                </CardContent>
            </Card>

        </div>
    );
}
