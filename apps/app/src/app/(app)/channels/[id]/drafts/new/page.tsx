"use client";

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Sparkles, FileText, Video, Zap, Mic, ArrowLeft, Check } from "lucide-react";

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
    const researchSessionId = searchParams.get("researchSessionId") ?? undefined;

    const [type, setType] = useState<DraftType>("blog");
    const [title, setTitle] = useState("");
    const [draftId, setDraftId] = useState<string | null>(null);
    const [step, setStep] = useState<"setup" | "core" | "produce" | "done">("setup");
    const [busy, setBusy] = useState(false);
    const [output, setOutput] = useState<unknown>(null);

    async function runStep(label: string, fn: () => Promise<Response>) {
        setBusy(true);
        try {
            const res = await fn();
            const json = await res.json();
            if (json.error) {
                toast.error(`${label}: ${json.error.message}`);
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
        if (!title.trim()) {
            toast.error("Informe um título");
            return;
        }
        const draft = await runStep("criar draft", () =>
            fetch("/api/content-drafts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channelId,
                    ideaId: ideaIdParam,
                    researchSessionId,
                    type,
                    title,
                }),
            }),
        );
        if (!draft) return;
        setDraftId((draft as { id: string }).id);
        setStep("core");

        const core = await runStep("canonical core", () =>
            fetch(`/api/content-drafts/${(draft as { id: string }).id}/canonical-core`, { method: "POST" }),
        );
        if (!core) return;
        setStep("produce");

        const produced = await runStep("produção", () =>
            fetch(`/api/content-drafts/${(draft as { id: string }).id}/produce`, { method: "POST" }),
        );
        if (!produced) return;
        setOutput((produced as { draft_json?: unknown }).draft_json);
        setStep("done");
        toast.success("Conteúdo gerado");
    }

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-6">
            <div>
                <button
                    onClick={() => router.back()}
                    className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                >
                    <ArrowLeft className="h-3 w-3" /> Voltar
                </button>
                <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
                    <Sparkles className="h-5 w-5" /> Novo conteúdo
                </h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Setup</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Título</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Como devs sênior usam IA" />
                    </div>

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

                    <Button onClick={handleStart} disabled={busy || step !== "setup"}>
                        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                        Gerar
                    </Button>
                </CardContent>
            </Card>

            {step !== "setup" && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Pipeline</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <PipelineStep label="Draft criado" done={!!draftId} active={step === "core" && busy} />
                        <PipelineStep label="Canonical core (agent-3a)" done={step === "produce" || step === "done"} active={step === "core" && busy} />
                        <PipelineStep label={`Produção (agent-3b-${type})`} done={step === "done"} active={step === "produce" && busy} />
                    </CardContent>
                </Card>
            )}

            {step === "done" && output !== null && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Output</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <pre className="text-xs bg-muted/40 rounded-md p-4 overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(output, null, 2)}
                        </pre>
                        {draftId && (
                            <p className="text-xs text-muted-foreground mt-2">
                                Draft id: <span className="font-mono">{draftId}</span> · Status: in_review
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function PipelineStep({ label, done, active }: { label: string; done: boolean; active: boolean }) {
    return (
        <div className="flex items-center gap-2 text-sm">
            {done ? (
                <Check className="h-4 w-4 text-green-500" />
            ) : active ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
                <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
            )}
            <span className={done ? "text-foreground" : active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
        </div>
    );
}
