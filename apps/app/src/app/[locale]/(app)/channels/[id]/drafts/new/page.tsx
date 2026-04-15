"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
    Loader2, Sparkles, FileText, Video, Zap, Mic,
    ArrowLeft, Check, Lightbulb, Search, ClipboardPaste,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManualModePanel } from "@/components/ai/ManualModePanel";
import { useManualMode } from "@/hooks/use-manual-mode";
import { PipelineStages } from "@/components/pipeline/PipelineStages";
import { MarkdownPreview } from "@/components/preview/MarkdownPreview";

type DraftType = "blog" | "video" | "shorts" | "podcast";

const TYPES: { id: DraftType; label: string; icon: typeof FileText; cost: number }[] = [
    { id: "blog", label: "Blog", icon: FileText, cost: 200 },
    { id: "video", label: "Video", icon: Video, cost: 200 },
    { id: "shorts", label: "Shorts", icon: Zap, cost: 100 },
    { id: "podcast", label: "Podcast", icon: Mic, cost: 150 },
];

interface LinkedIdea {
    idea_id: string;
    title: string;
    core_tension: string;
    verdict: string;
}

interface ResearchSummary {
    id: string;
    level: string;
    status: string;
    cardsCount: number;
    refinedAngle: Record<string, unknown> | null;
}

export default function NewDraftPage() {
    const { id: channelId } = useParams<{ id: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();
    const ideaIdParam = searchParams.get("ideaId") ?? undefined;
    const researchSessionIdParam = searchParams.get("researchSessionId") ?? undefined;
    const projectIdParam = searchParams.get("projectId") ?? undefined;
    const { enabled: manualEnabled } = useManualMode();

    const [type, setType] = useState<DraftType>("blog");
    const [title, setTitle] = useState("");
    const [draftId, setDraftId] = useState<string | null>(null);
    const [step, setStep] = useState<"setup" | "core" | "produce" | "done">("setup");
    const [busy, setBusy] = useState(false);
    const [producedContent, setProducedContent] = useState<string>("");
    const [genMode, setGenMode] = useState<"ai" | "manual">("ai");

    // Context from previous steps
    const [linkedIdea, setLinkedIdea] = useState<LinkedIdea | null>(null);
    const [researchSummary, setResearchSummary] = useState<ResearchSummary | null>(null);

    // Fetch idea context
    useEffect(() => {
        if (!ideaIdParam) return;
        (async () => {
            try {
                const res = await fetch("/api/ideas/library?limit=100");
                const json = await res.json();
                const idea = (json.data?.ideas ?? []).find(
                    (i: { id: string; idea_id: string }) => i.id === ideaIdParam || i.idea_id === ideaIdParam,
                );
                if (idea) {
                    setLinkedIdea({
                        idea_id: idea.idea_id,
                        title: idea.title,
                        core_tension: idea.core_tension ?? "",
                        verdict: idea.verdict ?? "experimental",
                    });
                    if (!title) setTitle(idea.title);
                }
            } catch { /* silent */ }
        })();
    }, [ideaIdParam]);

    // Fetch research context
    useEffect(() => {
        if (!researchSessionIdParam) return;
        (async () => {
            try {
                const res = await fetch(`/api/research-sessions/${researchSessionIdParam}`);
                const json = await res.json();
                if (json.data) {
                    const d = json.data;
                    const cards = d.approved_cards_json ?? d.cards_json;
                    setResearchSummary({
                        id: d.id,
                        level: d.level,
                        status: d.status,
                        cardsCount: Array.isArray(cards) ? cards.length : 0,
                        refinedAngle: d.refined_angle_json ?? null,
                    });
                }
            } catch { /* silent */ }
        })();
    }, [researchSessionIdParam]);

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
            toast.error(`${label} failed`);
            return null;
        } finally {
            setBusy(false);
        }
    }

    async function handleStart() {
        if (!title.trim()) {
            toast.error("Enter a title");
            return;
        }
        const draft = await runStep("Create draft", () =>
            fetch("/api/content-drafts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channelId,
                    projectId: projectIdParam,
                    ideaId: ideaIdParam,
                    researchSessionId: researchSessionIdParam,
                    type,
                    title,
                }),
            }),
        );
        if (!draft) return;
        const id = (draft as { id: string }).id;
        setDraftId(id);
        setStep("core");

        const core = await runStep("Canonical core", () =>
            fetch(`/api/content-drafts/${id}/canonical-core`, { method: "POST" }),
        );
        if (!core) return;
        setStep("produce");

        const produced = await runStep("Production", () =>
            fetch(`/api/content-drafts/${id}/produce`, { method: "POST" }),
        );
        if (!produced) return;
        setStep("done");
        // Extract full_draft for preview
        const draftJson = (produced as Record<string, unknown>).draft_json as Record<string, unknown> | undefined;
        const fullDraft = (draftJson?.full_draft as string) ?? "";
        setProducedContent(fullDraft);
        toast.success("Content generated — preview below");
    }

    return (
        <div>
            <PipelineStages
                currentStep="draft"
                channelId={channelId}
                ideaTitle={linkedIdea?.title}
                researchSessionId={researchSessionIdParam}
                projectId={projectIdParam}
            />
            <div className="p-6 max-w-3xl mx-auto space-y-6">
            <div>
                <button
                    onClick={() => router.back()}
                    className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                >
                    <ArrowLeft className="h-3 w-3" /> Back
                </button>
                <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
                    <Sparkles className="h-5 w-5" /> New Content
                </h1>
            </div>

            {/* Context from previous steps */}
            {(linkedIdea || researchSummary) && (
                <Card className="border-muted">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Pipeline context</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {linkedIdea && (
                            <div className="flex items-start gap-3">
                                <Lightbulb className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground">Idea</p>
                                    <p className="text-sm font-medium">{linkedIdea.title}</p>
                                    {linkedIdea.core_tension && (
                                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{linkedIdea.core_tension}</p>
                                    )}
                                </div>
                                <Badge
                                    variant={linkedIdea.verdict === "viable" ? "default" : linkedIdea.verdict === "weak" ? "destructive" : "secondary"}
                                    className="text-[10px] shrink-0"
                                >
                                    {linkedIdea.verdict}
                                </Badge>
                            </div>
                        )}
                        {researchSummary && (
                            <div className="flex items-start gap-3">
                                <Search className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground">Research</p>
                                    <p className="text-sm">
                                        <Badge variant="outline" className="text-[10px] mr-1">{researchSummary.level}</Badge>
                                        {researchSummary.cardsCount} approved cards
                                        <Badge variant="outline" className="text-[10px] ml-1">{researchSummary.status}</Badge>
                                    </p>
                                    {researchSummary.refinedAngle && Boolean((researchSummary.refinedAngle as Record<string, unknown>).should_pivot) && (
                                        <p className="text-xs text-yellow-600 mt-0.5">
                                            Pivot suggested: {String((researchSummary.refinedAngle as Record<string, unknown>).updated_title ?? "")}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Setup</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Title</Label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. How senior devs use AI"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Format</Label>
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

                    <Tabs value={genMode} onValueChange={(v) => setGenMode(v as "ai" | "manual")} className="mt-2">
                        <TabsList>
                            <TabsTrigger value="ai" className="gap-1.5">
                                <Sparkles className="h-3.5 w-3.5" /> AI Production
                            </TabsTrigger>
                            {manualEnabled && (
                                <TabsTrigger value="manual" className="gap-1.5">
                                    <ClipboardPaste className="h-3.5 w-3.5" /> Manual
                                </TabsTrigger>
                            )}
                        </TabsList>

                        <TabsContent value="ai" className="mt-3">
                            <Button onClick={handleStart} disabled={busy || step !== "setup"}>
                                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                Generate
                            </Button>
                        </TabsContent>

                        {manualEnabled && (
                            <TabsContent value="manual" className="mt-3">
                                <ManualModePanel
                                    agentSlug="content-core"
                                    inputContext={[
                                        `Title: ${title || "(enter title above)"}`,
                                        `Format: ${type}`,
                                        linkedIdea ? `Idea: ${linkedIdea.title}` : "",
                                        linkedIdea?.core_tension ? `Core Tension: ${linkedIdea.core_tension}` : "",
                                        researchSummary ? `Research: ${researchSummary.cardsCount} cards (${researchSummary.level})` : "",
                                        "",
                                        "Generate canonical core + blog draft.",
                                        "Output: {\"canonical_core\":{\"thesis\":\"...\",\"argument_chain\":[...]},\"draft\":{\"full_draft\":\"markdown...\",\"outline\":[...],\"meta_description\":\"...\",\"slug\":\"...\"}}",
                                    ].filter(Boolean).join("\n")}
                                    pastePlaceholder={'Paste JSON with canonical_core and/or draft:\n{"canonical_core":{...},"draft":{"full_draft":"# Title\\n\\nContent...","meta_description":"...","slug":"..."}}'}
                                    onImport={async (parsed) => {
                                        // Unwrap common wrappers
                                        let obj = parsed as Record<string, unknown>;
                                        if (obj.BC_CANONICAL_CORE && typeof obj.BC_CANONICAL_CORE === 'object') {
                                            obj = { canonical_core: obj.BC_CANONICAL_CORE, ...obj };
                                        }

                                        // Create draft first
                                        const res = await fetch("/api/content-drafts", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                                channelId,
                                                projectId: projectIdParam,
                                                ideaId: ideaIdParam,
                                                researchSessionId: researchSessionIdParam,
                                                type,
                                                title: title || "Untitled",
                                            }),
                                        });
                                        const json = await res.json();
                                        if (json.error) { toast.error(json.error.message); return; }
                                        const id = json.data.id;

                                        // Patch with content — save canonical core and/or draft
                                        const patchData: Record<string, unknown> = {};
                                        if (obj.canonical_core) patchData.canonicalCoreJson = obj.canonical_core;
                                        if (obj.draft) {
                                            patchData.draftJson = obj.draft;
                                        } else if (obj.full_draft || obj.outline) {
                                            // Flat structure — wrap as draft
                                            patchData.draftJson = obj;
                                        }

                                        if (Object.keys(patchData).length > 0) {
                                            const patchRes = await fetch(`/api/content-drafts/${id}`, {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify(patchData),
                                            });
                                            const patchJson = await patchRes.json();
                                            if (patchJson.error) {
                                                toast.error(`Draft created but patch failed: ${patchJson.error.message}`);
                                            }
                                        }

                                        toast.success("Draft created — redirecting to editor");
                                        router.push(`/channels/${channelId}/drafts/${id}`);
                                    }}
                                    importLabel="Create Draft"
                                    loading={busy}
                                />
                            </TabsContent>
                        )}
                    </Tabs>
                </CardContent>
            </Card>

            {/* Pipeline progress */}
            {step !== "setup" && step !== "done" && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Pipeline</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <PipelineStep label="Draft created" done={!!draftId} active={(step as string) === "core" && busy} />
                        <PipelineStep label="Canonical core (agent-3a)" done={(step as string) === "produce" || (step as string) === "done"} active={(step as string) === "core" && busy} />
                        <PipelineStep label={`Production (agent-3b-${type})`} done={(step as string) === "done"} active={(step as string) === "produce" && busy} />
                    </CardContent>
                </Card>
            )}

            {/* Generated content preview + actions */}
            {step === "done" && draftId && (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Generated Content Preview</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {producedContent ? (
                                <div className="max-h-[500px] overflow-y-auto border rounded-lg p-4">
                                    <MarkdownPreview content={producedContent} />
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">Content generated but no preview available.</p>
                            )}
                        </CardContent>
                    </Card>

                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={() => router.push(`/channels/${channelId}/drafts/${draftId}`)}
                        >
                            <FileText className="h-4 w-4 mr-2" /> Open in Editor
                        </Button>
                        <Button
                            onClick={() => router.push(`/channels/${channelId}/drafts/${draftId}?tab=review`)}
                        >
                            <Check className="h-4 w-4 mr-2" /> Continue to Review
                        </Button>
                    </div>
                </>
            )}
        </div>
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
            <span className={done || active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
        </div>
    );
}
