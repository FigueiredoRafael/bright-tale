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
import { Loader2, Lightbulb, Sparkles, ArrowLeft, ArrowRight } from "lucide-react";
import { ModelPicker, MODELS_BY_PROVIDER, type ProviderId } from "@/components/ai/ModelPicker";

type Mode = "blind" | "fine_tuned" | "reference_guided";

interface Idea {
    idea_id: string;
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
            const json = await res.json();
            if (json.error) {
                toast.error(json.error.message);
                return;
            }
            setIdeas(json.data.ideas ?? []);
            toast.success(`${json.data.ideas?.length ?? 0} ideias geradas`);
        } catch {
            toast.error("Falha ao gerar ideias");
        } finally {
            setRunning(false);
        }
    }

    function pickIdea(_idea: Idea) {
        // Ideas were persisted with channel_id, so the Create Content page
        // will surface them in its "Suas ideias geradas" section.
        router.push(`/channels/${channelId}/create`);
    }

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
                        <CardTitle className="text-base flex items-center gap-2">
                            Ideias geradas <Badge variant="secondary" className="text-[10px]">{ideas.length}</Badge>
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
                            return (
                                <button
                                    key={idea.idea_id}
                                    onClick={() => pickIdea(idea)}
                                    className="w-full text-left p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors"
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
                                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                                    </div>
                                </button>
                            );
                        })}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
