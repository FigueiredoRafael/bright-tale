"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    ArrowLeft, FileText, Video, Zap, Mic, Loader2, Sparkles, Code2, MessageSquare, Trash2,
    Check, ThumbsUp, AlertCircle, Lightbulb, Hash, Globe, Star,
} from "lucide-react";
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

function findArray(node: unknown, keys: string[], depth = 0): unknown[] | null {
    if (depth > 6 || !node || typeof node !== "object") return null;
    const o = node as Record<string, unknown>;
    for (const k of keys) {
        const v = o[k];
        if (Array.isArray(v) && v.length > 0) return v;
    }
    for (const v of Object.values(o)) {
        const found = findArray(v, keys, depth + 1);
        if (found) return found;
    }
    return null;
}

function findObject(node: unknown, keys: string[], depth = 0): Record<string, unknown> | null {
    if (depth > 6 || !node || typeof node !== "object") return null;
    const o = node as Record<string, unknown>;
    for (const k of keys) {
        const v = o[k];
        if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    }
    for (const v of Object.values(o)) {
        const found = findObject(v, keys, depth + 1);
        if (found) return found;
    }
    return null;
}

function parseReview(raw: Record<string, unknown> | null) {
    if (!raw) return null;
    const verdict = findScalar(raw, ["verdict", "status", "decision"]);
    const scoreStr = findScalar(raw, ["score", "overall_score", "rating"]);
    const score = scoreStr ? Number(scoreStr) : (() => {
        // numeric score search
        const find = (n: unknown, d = 0): number | null => {
            if (d > 6 || !n || typeof n !== "object") return null;
            const o = n as Record<string, unknown>;
            for (const k of ["score", "overall_score", "rating"]) {
                if (typeof o[k] === "number") return o[k] as number;
            }
            for (const v of Object.values(o)) {
                const r = find(v, d + 1);
                if (r != null) return r;
            }
            return null;
        };
        return find(raw);
    })();
    const seo = findObject(raw, ["seo_check", "seo", "seo_analysis"]);
    const strengths = findArray(raw, ["strengths", "positives", "highlights"]) as string[] | null;
    const issues = findArray(raw, ["issues", "problems", "weaknesses", "concerns"]);
    const fixes = findArray(raw, ["suggested_fixes", "fixes", "suggestions", "recommendations"]);
    const critical = findArray(raw, ["critical", "blockers", "must_fix"]);
    const keywords = findArray(raw, ["keywords", "seo_keywords", "tags", "key_terms"]) as string[] | null;
    return { verdict, score, seo, strengths, issues, fixes, critical, keywords };
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
    const [editingBody, setEditingBody] = useState(false);
    const [bodyDraft, setBodyDraft] = useState("");
    const [savingBody, setSavingBody] = useState(false);

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

    const actionRef = useRef(false);
    const [actionBusy, setActionBusy] = useState(false);
    async function withActionGuard<T>(fn: () => Promise<T>): Promise<T | undefined> {
        if (actionRef.current) return undefined;
        actionRef.current = true;
        setActionBusy(true);
        try {
            return await fn();
        } finally {
            actionRef.current = false;
            setActionBusy(false);
        }
    }

    async function patchStatus(newStatus: string) {
        try {
            const res = await fetch(`/api/content-drafts/${draftId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            const json = await res.json();
            if (json?.error) {
                toast.error(json.error.message ?? "Falha ao atualizar status");
                return false;
            }
            await refetch();
            return true;
        } catch {
            toast.error("Falha ao atualizar status");
            return false;
        }
    }

    async function handleApprove() {
        await withActionGuard(async () => {
            if (await patchStatus("approved")) toast.success("Aprovado");
        });
    }

    async function handlePublish() {
        // Real platform integration (WordPress, etc.) ainda não tá ligada à
        // tabela content_drafts — só ao pipeline legado. Por enquanto, "Publicar"
        // só marca como publicado pra tu sinalizar que postou manualmente.
        await withActionGuard(async () => {
            if (await patchStatus("published")) toast.success("Marcado como publicado");
        });
    }

    /**
     * Recursively walk draft_json and replace the first long-string content
     * field (same heuristic as findContent). This keeps any other metadata
     * (title, meta, sections list, etc.) intact.
     */
    function replaceContent(node: unknown, newBody: string, depth = 0): { changed: boolean; node: unknown } {
        if (depth > 6) return { changed: false, node };
        if (node && typeof node === "object" && !Array.isArray(node)) {
            const o = { ...(node as Record<string, unknown>) };
            for (const key of ["body", "content", "text", "markdown", "draft", "post", "article", "full_text"]) {
                const v = o[key];
                if (typeof v === "string" && v.length > 50) {
                    o[key] = newBody;
                    return { changed: true, node: o };
                }
            }
            for (const [k, v] of Object.entries(o)) {
                const r = replaceContent(v, newBody, depth + 1);
                if (r.changed) {
                    o[k] = r.node;
                    return { changed: true, node: o };
                }
            }
        }
        return { changed: false, node };
    }

    async function saveBody() {
        if (!draft?.draft_json) return;
        setSavingBody(true);
        try {
            const { changed, node } = replaceContent(draft.draft_json, bodyDraft);
            if (!changed) {
                toast.error("Não consegui localizar o campo de texto pra salvar");
                return;
            }
            const res = await fetch(`/api/content-drafts/${draftId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ draftJson: node }),
            });
            const json = await res.json();
            if (json?.error) {
                toast.error(json.error.message ?? "Falha ao salvar");
                return;
            }
            await refetch();
            setEditingBody(false);
            toast.success("Texto atualizado");
        } finally {
            setSavingBody(false);
        }
    }

    async function handleUnapprove() {
        await withActionGuard(async () => {
            if (await patchStatus("in_review")) toast.success("Voltou pra revisão");
        });
    }

    async function handleDelete() {
        if (!confirm("Deletar este rascunho? Essa ação não pode ser desfeita.")) return;
        await withActionGuard(async () => {
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
        });
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
    // SEO/keywords often live in the produced draft AND in the review.
    const draftKeywords = (draft.draft_json ? findArray(draft.draft_json, ["keywords", "seo_keywords", "tags", "key_terms"]) : null) as string[] | null;
    const review = parseReview(draft.review_feedback_json);
    const allKeywords = Array.from(new Set([...(draftKeywords ?? []), ...(review?.keywords ?? [])])).filter(Boolean);
    const isApproved = draft.status === "approved" || draft.status === "scheduled" || draft.status === "published";
    const isPublished = draft.status === "published";

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
                        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={actionBusy} className="text-muted-foreground hover:text-red-500">
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

            {/* Pretty rendered content (or inline editor) */}
            {draft.draft_json && body && (
                <Card>
                    <CardContent className="py-6">
                        {metaDescription && (
                            <p className="text-sm text-muted-foreground italic mb-4 border-l-2 border-primary/40 pl-3">
                                {metaDescription}
                            </p>
                        )}
                        {editingBody ? (
                            <div className="space-y-2">
                                <textarea
                                    value={bodyDraft}
                                    onChange={(e) => setBodyDraft(e.target.value)}
                                    className="w-full min-h-[400px] text-sm font-mono leading-relaxed rounded-md border bg-background p-3 outline-none focus:ring-2 focus:ring-primary/40"
                                    autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={() => { setEditingBody(false); setBodyDraft(body); }} disabled={savingBody}>
                                        Cancelar
                                    </Button>
                                    <Button size="sm" onClick={saveBody} disabled={savingBody}>
                                        {savingBody ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                                        Salvar
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="group relative">
                                <button
                                    onClick={() => { setBodyDraft(body); setEditingBody(true); }}
                                    className="absolute -top-1 -right-1 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity"
                                    title="Editar texto"
                                >
                                    ✎ Editar
                                </button>
                                <article
                                    onClick={() => { setBodyDraft(body); setEditingBody(true); }}
                                    className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed cursor-text"
                                >
                                    {body}
                                </article>
                            </div>
                        )}
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

            {/* Keywords / SEO tags from the produced content */}
            {allKeywords.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Hash className="h-4 w-4" /> Palavras-chave SEO
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-1.5">
                            {allKeywords.map((k, i) => (
                                <Badge key={i} variant="secondary" className="text-[11px]">{k}</Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Pretty review feedback */}
            {review && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" /> Avaliação do revisor
                            </span>
                            <div className="flex items-center gap-2">
                                {review.score != null && !Number.isNaN(review.score) && (
                                    <div className="flex items-center gap-1 text-sm font-bold">
                                        <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                                        {review.score}{review.score <= 10 ? "/10" : ""}
                                    </div>
                                )}
                                {review.verdict && (
                                    <Badge
                                        variant={review.verdict.toLowerCase().includes("approv") ? "default" : "outline"}
                                        className="capitalize"
                                    >
                                        {review.verdict}
                                    </Badge>
                                )}
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* SEO checks */}
                        {review.seo && (
                            <div>
                                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                    <Globe className="h-3.5 w-3.5" /> SEO
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(review.seo).map(([k, v]) => {
                                        const ok = v === true || (typeof v === "string" && /good|easy|optimi[sz]ed|pass|true/i.test(v));
                                        const label = k.replace(/_/g, " ");
                                        return (
                                            <div key={k} className="flex items-center gap-2 text-xs">
                                                {ok ? (
                                                    <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                                ) : (
                                                    <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                                )}
                                                <span className="capitalize text-muted-foreground">{label}:</span>
                                                <span className="font-medium">{String(v)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Strengths */}
                        {review.strengths && review.strengths.length > 0 && (
                            <div>
                                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                    <ThumbsUp className="h-3.5 w-3.5 text-green-500" /> Pontos fortes
                                </div>
                                <ul className="text-sm space-y-1">
                                    {review.strengths.map((s, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <Check className="h-3.5 w-3.5 text-green-500 shrink-0 mt-1" />
                                            <span>{String(s)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Critical blockers */}
                        {review.critical && review.critical.length > 0 && (
                            <div>
                                <div className="text-xs text-red-500 mb-2 flex items-center gap-1">
                                    <AlertCircle className="h-3.5 w-3.5" /> Bloqueadores
                                </div>
                                <ul className="text-sm space-y-1">
                                    {review.critical.map((c, i) => (
                                        <li key={i} className="text-red-600 dark:text-red-400">• {typeof c === "string" ? c : JSON.stringify(c)}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Issues + suggested fixes */}
                        {((review.issues && review.issues.length > 0) || (review.fixes && review.fixes.length > 0)) && (
                            <div>
                                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                    <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Sugestões de melhoria
                                </div>
                                <ul className="text-sm space-y-1.5 text-muted-foreground">
                                    {[...(review.issues ?? []), ...(review.fixes ?? [])].map((s, i) => (
                                        <li key={i}>• {typeof s === "string" ? s : JSON.stringify(s)}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Images placeholder — F2-042 */}
            {draft.draft_json && draft.type === "blog" && (
                <Card className="border-dashed">
                    <CardContent className="py-5">
                        <div className="flex items-start gap-3">
                            <Sparkles className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                            <div className="flex-1 text-sm">
                                <div className="font-medium">Imagens do post (em breve)</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Vai dar pra gerar hero (topo) + imagens inline pelo seu provider de imagens
                                    configurado em <button onClick={() => router.push("/settings/image-generation")} className="text-primary hover:underline">Settings → Image Generation</button>,
                                    e ver onde cada uma vai aparecer no preview.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Action bar — Aprovar / Publicar */}
            {draft.draft_json && (
                <Card>
                    <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-xs text-muted-foreground">
                            {isPublished ? "Publicado" : isApproved ? "Aprovado, pronto pra publicar" : "Em revisão — aprove pra publicar"}
                        </div>
                        <div className="flex items-center gap-2">
                            {!isApproved && (
                                <Button onClick={handleApprove} variant="outline" size="sm" disabled={actionBusy}>
                                    {actionBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                                    Aprovar
                                </Button>
                            )}
                            {isApproved && !isPublished && (
                                <Button onClick={handleUnapprove} variant="ghost" size="sm" disabled={actionBusy}>
                                    Desaprovar
                                </Button>
                            )}
                            <Button onClick={handlePublish} disabled={!isApproved || isPublished || actionBusy} size="sm">
                                {actionBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Globe className="h-4 w-4 mr-1.5" />}
                                {isPublished ? "Publicado" : "Marcar como publicado"}
                            </Button>
                        </div>
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
