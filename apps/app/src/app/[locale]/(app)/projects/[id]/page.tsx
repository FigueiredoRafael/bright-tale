"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    ArrowLeft, Lightbulb, Search, FileText, CheckCircle,
    Image, Globe, ArrowRight, Loader2,
} from "lucide-react";

interface PipelineData {
    project: Record<string, unknown>;
    ideas: Array<Record<string, unknown>>;
    brainstormSessions: Array<Record<string, unknown>>;
    researchSessions: Array<Record<string, unknown>>;
    contentDrafts: Array<Record<string, unknown>>;
}

const STEPS = [
    { key: "idea", label: "Idea", icon: Lightbulb },
    { key: "research", label: "Research", icon: Search },
    { key: "draft", label: "Draft", icon: FileText },
    { key: "review", label: "Review", icon: CheckCircle },
    { key: "assets", label: "Assets", icon: Image },
    { key: "published", label: "Published", icon: Globe },
];

export default function ProjectPipelinePage() {
    const params = useParams();
    const projectId = params.id as string;
    const router = useRouter();
    const [data, setData] = useState<PipelineData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/projects/${projectId}/pipeline`);
                const json = await res.json();
                if (json.data) setData(json.data);
            } finally {
                setLoading(false);
            }
        })();
    }, [projectId]);

    if (loading) return <div className="p-6 text-muted-foreground">Loading project...</div>;
    if (!data) return <div className="p-6 text-red-500">Project not found.</div>;

    const project = data.project;
    const idea = data.ideas[0];
    const research = data.researchSessions[0];
    const draft = data.contentDrafts[0];

    // Determine current step
    const draftStatus = (draft?.status as string) ?? "";
    const reviewVerdict = (draft?.review_verdict as string) ?? "pending";
    let currentStep = "idea";
    if (data.ideas.length > 0) currentStep = "idea";
    if (data.researchSessions.length > 0) currentStep = "research";
    if (data.contentDrafts.length > 0) currentStep = "draft";
    if (reviewVerdict !== "pending" && draft?.review_feedback_json) currentStep = "review";
    if (reviewVerdict === "approved") currentStep = "assets";
    if (draftStatus === "published") currentStep = "published";

    const channelId = (project.channel_id as string) ?? "";

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <button
                    onClick={() => router.back()}
                    className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                >
                    <ArrowLeft className="h-3 w-3" /> Back to projects
                </button>
                <h1 className="text-2xl font-bold mt-2">{project.title as string}</h1>
                <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline">{project.status as string}</Badge>
                    <Badge variant="secondary">{project.current_stage as string}</Badge>
                </div>
            </div>

            {/* Pipeline stepper */}
            <Card>
                <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                        {STEPS.map((step, i) => {
                            const Icon = step.icon;
                            const stepIndex = STEPS.findIndex(s => s.key === currentStep);
                            const thisIndex = i;
                            const isDone = thisIndex < stepIndex;
                            const isActive = thisIndex === stepIndex;
                            return (
                                <div key={step.key} className="flex items-center gap-1">
                                    {i > 0 && (
                                        <div className={`h-px w-6 mx-1 ${isDone ? "bg-green-500" : "bg-border"}`} />
                                    )}
                                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${
                                        isDone ? "text-green-600 dark:text-green-400" :
                                        isActive ? "text-primary font-medium bg-primary/10" :
                                        "text-muted-foreground"
                                    }`}>
                                        <Icon className="h-3.5 w-3.5" />
                                        {step.label}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Pipeline entities */}
            <div className="space-y-4">
                {/* Idea */}
                {idea && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Lightbulb className="h-4 w-4 text-yellow-500" /> Idea
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="font-medium">{idea.title as string}</p>
                            <p className="text-sm text-muted-foreground mt-1">{idea.core_tension as string}</p>
                            <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">{idea.verdict as string}</Badge>
                                <span className="text-xs text-muted-foreground">{idea.idea_id as string}</span>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Research */}
                {research && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Search className="h-4 w-4 text-blue-500" /> Research
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">{research.level as string}</Badge>
                                <Badge variant="outline" className="text-xs">{research.status as string}</Badge>
                                {Array.isArray(research.approved_cards_json) && (
                                    <span className="text-xs text-muted-foreground">
                                        {(research.approved_cards_json as unknown[]).length} approved cards
                                    </span>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Draft */}
                {draft && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <FileText className="h-4 w-4 text-purple-500" /> Content Draft
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="font-medium">{draft.title as string}</p>
                            <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">{draft.type as string}</Badge>
                                <Badge variant="outline" className="text-xs">{draftStatus}</Badge>
                                {(draft.review_score as number) !== null && (
                                    <span className="text-xs text-muted-foreground">
                                        Score: {draft.review_score as number}/100
                                    </span>
                                )}
                                {reviewVerdict !== "pending" && (
                                    <Badge
                                        className={`text-xs ${
                                            reviewVerdict === "approved" ? "bg-green-100 text-green-800" :
                                            reviewVerdict === "revision_required" ? "bg-yellow-100 text-yellow-800" :
                                            "bg-red-100 text-red-800"
                                        }`}
                                    >
                                        {reviewVerdict.replace("_", " ")}
                                    </Badge>
                                )}
                            </div>
                            {(draft.published_url as string) && (
                                <a
                                    href={draft.published_url as string}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline mt-2 inline-flex items-center gap-1"
                                >
                                    <Globe className="h-3 w-3" /> {draft.published_url as string}
                                </a>
                            )}
                            {channelId && (
                                <div className="mt-3">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => router.push(`/channels/${channelId}/drafts/${draft.id as string}`)}
                                    >
                                        Open in editor <ArrowRight className="h-3.5 w-3.5 ml-1" />
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* No entities yet */}
                {data.ideas.length === 0 && data.contentDrafts.length === 0 && (
                    <Card>
                        <CardContent className="py-8 text-center text-muted-foreground">
                            <p>No pipeline activity yet for this project.</p>
                            {channelId && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-3"
                                    onClick={() => router.push(`/channels/${channelId}/brainstorm/new`)}
                                >
                                    Start Brainstorm
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
