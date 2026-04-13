"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Video, Zap, Mic, Loader2, Sparkles, Code2, MessageSquare, Trash2 } from "lucide-react";
import { ModelPicker, MODELS_BY_PROVIDER, type ProviderId } from "@/components/ai/ModelPicker";
import { GenerationProgressModal } from "@/components/generation/GenerationProgressModal";
import { friendlyAiError } from "@/lib/ai/error-message";
import { toast } from "sonner";

interface Draft {
    id: string;
    type: "blog" | "video" | "shorts" | "podcast";
    title: string | null;
    status: string;
    canonical_core_json: Record<string, unknown> | null;
    draft_json: Record<string, unknown> | null;
    review_feedback_json: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

const TYPE_META: Record<Draft["type"], { label: string; icon: typeof FileText }> = {
    blog: { label: "Blog", icon: FileText },
    video: { label: "Vídeo", icon: Video },
    shorts: { label: "Shorts", icon: Zap },
    podcast: { label: "Podcast", icon: Mic },
};

/**
 * Recursively pull the first string from common content fields. Agents tend
 * to wrap output in {output:..., body:..., draft:..., content:..., text:...}.
 */
function findContent(node: unknown, depth = 0): string | null {
    if (depth > 6) return null;
    if (typeof node === "string" && node.length > 100) return node;
    if (node && typeof node === "object") {
        const o = node as Record<string, unknown>;
        for (const key of ["body", "content", "text", "markdown", "draft", "post", "article", "full_text"]) {
            const v = o[key];
            if (typeof v === "string" && v.length > 50) return v;
        }
        for (const v of Object.values(o)) {
            const found = findContent(v, depth + 1);
            if (found) return found;
        }
    }
    return null;
}

function findScalar(node: unknown, keys: string[], depth = 0): string | null {
    if (depth > 6 || !node || typeof node !== "object") return null;
    const o = node as Record<string, unknown>;
    for (const k of keys) {
        const v = o[k];
        if (typeof v === "string" && v.trim()) return v;
    }
    for (const v of Object.values(o)) {
        const found = findScalar(v, keys, depth + 1);
        if (found) return found;
    }
    return null;
}

export default function DraftViewPage() {
    const { id: channelId, draftId } = useParams<{ id: string; draftId: string }>();
    const router = useRouter();
    const [draft, setDraft] = useState<Draft | null>(null);
    const [loading, setLoading] = useState(true);
    const [showRaw, setShowRaw] = useState(false);
    const [provider, setProvider] = useState<ProviderId>("ollama");
    const [model, setModel] = useState<string>("qwen2.5:7b");
    const [generating, setGenerating] = useState(false);

    async function refetch() {
        const res = await fetch(`/api/content-drafts/${draftId}`);
        const json = await res.json();
        if (json?.data) setDraft(json.data as Draft);
    }

    const inFlightRef = useRef(false);
    async function startGeneration() {
        // Refs update synchronously — React state has a render-cycle delay,
        // so two clicks in the same tick can both pass a state-only guard.
        if (inFlightRef.current || generating) return;
        inFlightRef.current = true;
        setGenerating(true);
        try {
            const res = await fetch(`/api/content-drafts/${draftId}/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider, model }),
            });
            const json = await res.json();
            if (json?.error) {
                const f = friendlyAiError(json.error.message ?? "");
                toast.error(f.title, { description: f.hint });
                setGenerating(false);
                inFlightRef.current = false;
                return;
            }
        } catch {
            toast.error("Não consegui iniciar a geração");
            setGenerating(false);
            inFlightRef.current = false;
        }
    }

    async function handleDelete() {
        if (!confirm("Deletar este rascunho? Essa ação não pode ser desfeita.")) return;
        try {
            const res = await fetch(`/api/content-drafts/${draftId}`, { method: "DELETE" });
            const json = await res.json();
            if (json?.error) {
                toast.error(json.error.message ?? "Falha ao deletar");
                return;
            }
            toast.success("Rascunho deletado");
            router.push(`/channels/${channelId}/create`);
        } catch {
            toast.error("Falha ao deletar");
        }
    }

    useEffect(() => {
        if (!draftId) return;
        (async () => {
            try {
                const res = await fetch(`/api/content-drafts/${draftId}`);
                const json = await res.json();
                if (json?.data) setDraft(json.data as Draft);
            } finally {
                setLoading(false);
            }
        })();
    }, [draftId]);

    if (loading) {
        return (
            <div className="p-12 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!draft) {
        return (
            <div className="p-6 max-w-3xl mx-auto space-y-4">
                <button onClick={() => router.back()} className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
                    <ArrowLeft className="h-3 w-3" /> Voltar
                </button>
                <Card>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                        Draft não encontrado.
                    </CardContent>
                </Card>
            </div>
        );
    }

    const meta = TYPE_META[draft.type];
    const Icon = meta.icon;
    const body = draft.draft_json ? findContent(draft.draft_json) : null;
    const metaDescription = draft.draft_json ? findScalar(draft.draft_json, ["meta_description", "summary", "description", "hook"]) : null;

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <button
                    onClick={() => router.push(`/channels/${channelId}/create`)}
                    className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                >
                    <ArrowLeft className="h-3 w-3" /> Voltar pra Create Content
                </button>
                <div className="flex items-start justify-between gap-4 mt-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                            <Icon className="h-3.5 w-3.5" /> {meta.label}
                        </div>
                        <h1 className="text-2xl font-bold">{draft.title ?? "Sem título"}</h1>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={draft.status === "published" ? "default" : "outline"} className="capitalize">
                            {draft.status}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={handleDelete} className="text-muted-foreground hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {generating && (
                <GenerationProgressModal
                    open={generating}
                    sessionId={draftId as string}
                    sseUrl={`/api/content-drafts/${draftId}/events`}
                    title={`Gerando ${meta.label.toLowerCase()}`}
                    onComplete={async () => { setGenerating(false); inFlightRef.current = false; await refetch(); toast.success("Conteúdo gerado"); }}
                    onFailed={(msg) => { setGenerating(false); inFlightRef.current = false; const f = friendlyAiError(msg); toast.error(f.title, { description: f.hint }); }}
                    onClose={() => { setGenerating(false); inFlightRef.current = false; }}
                />
            )}

            {(!draft.draft_json || draft.status === "failed") && (
                <Card className={draft.status === "failed" ? "border-red-500/50" : ""}>
                    <CardContent className="py-6 space-y-4">
                        <div className="text-center space-y-2">
                            <Sparkles className="h-8 w-8 mx-auto text-muted-foreground" />
                            <p className="text-sm">
                                {draft.status === "failed"
                                    ? "Geração anterior falhou."
                                    : "Esse rascunho ainda não foi gerado."}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Escolha o modelo e clique gerar — vai rodar nesse mesmo rascunho.
                            </p>
                        </div>
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
                        <div className="flex justify-center">
                            <Button onClick={startGeneration} disabled={generating}>
                                <Sparkles className="h-4 w-4 mr-2" />
                                {draft.status === "failed" ? "Tentar de novo" : "Gerar agora"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Pretty rendered content */}
            {draft.draft_json && body && (
                <Card>
                    <CardContent className="py-6">
                        {metaDescription && (
                            <p className="text-sm text-muted-foreground italic mb-4 border-l-2 border-primary/40 pl-3">
                                {metaDescription}
                            </p>
                        )}
                        <article className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
                            {body}
                        </article>
                    </CardContent>
                </Card>
            )}

            {/* Fallback: draft exists but we couldn't extract a body */}
            {draft.draft_json && !body && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Conteúdo gerado</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <pre className="text-xs bg-muted/40 rounded-md p-4 overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(draft.draft_json, null, 2)}
                        </pre>
                    </CardContent>
                </Card>
            )}

            {/* Review feedback */}
            {draft.review_feedback_json && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" /> Feedback do agente revisor
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <pre className="text-xs bg-muted/40 rounded-md p-4 overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(draft.review_feedback_json, null, 2)}
                        </pre>
                    </CardContent>
                </Card>
            )}

            {/* Devtools — collapsible raw JSON for debugging */}
            {draft.draft_json && (
                <div className="text-xs">
                    <button
                        onClick={() => setShowRaw((v) => !v)}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                        <Code2 className="h-3 w-3" />
                        {showRaw ? "Ocultar" : "Ver"} dados técnicos (canonical core + draft JSON)
                    </button>
                    {showRaw && (
                        <div className="mt-2 space-y-3">
                            {draft.canonical_core_json && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-xs text-muted-foreground">Canonical Core</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <pre className="text-[10px] bg-muted/40 rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                                            {JSON.stringify(draft.canonical_core_json, null, 2)}
                                        </pre>
                                    </CardContent>
                                </Card>
                            )}
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs text-muted-foreground">Draft JSON cru</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <pre className="text-[10px] bg-muted/40 rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                                        {JSON.stringify(draft.draft_json, null, 2)}
                                    </pre>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            )}

            <p className="text-xs text-muted-foreground">
                Atualizado em {new Date(draft.updated_at).toLocaleString("pt-BR")}
            </p>
        </div>
    );
}
