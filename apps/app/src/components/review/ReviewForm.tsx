"use client";

import React, { useEffect, useState } from "react";
import yaml from "js-yaml";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AgentPromptViewer from "@/components/agents/AgentPromptViewer";
import {
    Copy,
    Check,
    ArrowRight,
    FileText,
    Video,
    Zap,
    Mic,
    AlertCircle,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Calendar,
} from "lucide-react";
import type {
    ReviewInput,
    ReviewOutput,
    BlogReview,
    VideoReview,
    ShortReview,
    ContentReview,
    PublicationPlan,
    ProductionOutput,
    BrainstormIdea,
    ResearchOutput,
} from "@brighttale/shared/types/agents";

interface ReviewFormProps {
    initialYaml?: string;
    projectId: string;
    stageId: string;
    onSave: (yamlContent: string) => void;
    onComplete: (yamlContent: string) => void;
    saving?: boolean;
}

export default function ReviewForm({
    initialYaml,
    projectId,
    stageId,
    onSave,
    onComplete,
    saving: externalSaving,
}: ReviewFormProps) {
    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════
    const [activeTab, setActiveTab] = useState<"input" | "output">("input");
    const [generatedYaml, setGeneratedYaml] = useState<string>("");
    const [aiResponse, setAiResponse] = useState<string>("");
    const [parsedContent, setParsedContent] = useState<ReviewOutput | null>(null);
    const [parseError, setParseError] = useState<string>("");
    const [copied, setCopied] = useState(false);
    const [localSaving, setLocalSaving] = useState(false);
    const [contentTab, setContentTab] = useState<"blog" | "video" | "shorts" | "podcast" | "publication">("blog");

    const saving = externalSaving || localSaving;

    // Input data from previous stages
    const [reviewInput, setReviewInput] = useState<Partial<ReviewInput>>({});
    const [productionOutput, setProductionOutput] = useState<ProductionOutput | null>(null);
    const [selectedIdea, setSelectedIdea] = useState<BrainstormIdea | null>(null);
    const [researchOutput, setResearchOutput] = useState<ResearchOutput | null>(null);

    // ═══════════════════════════════════════════════════════════════════════
    // EFFECTS
    // ═══════════════════════════════════════════════════════════════════════
    useEffect(() => {
        // Parse initial YAML if provided
        if (initialYaml) {
            try {
                const parsed = yaml.load(initialYaml) as Record<string, unknown>;
                if (parsed && typeof parsed === "object") {
                    // Restore parsed review output
                    if (parsed.review_output) {
                        setParsedContent(parsed.review_output as ReviewOutput);
                        setActiveTab("output");
                    }
                    // Restore raw AI response text if saved
                    if (parsed.ai_response_raw) {
                        setAiResponse(String(parsed.ai_response_raw));
                    }
                }
            } catch (err) {
                console.error("Failed to parse initial YAML:", err);
            }
        }

        // Fetch data from previous stages
        fetchPreviousStageData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, initialYaml]);

    async function fetchPreviousStageData() {
        try {
            let fetchedIdea: BrainstormIdea | null = null;
            let fetchedResearch: ResearchOutput | null = null;
            let fetchedProduction: ProductionOutput | null = null;

            // Fetch brainstorm stage for selected idea
            const brainstormRes = await fetch(`/api/stages/${projectId}/brainstorm`);
            if (brainstormRes.ok) {
                const brainstormData = await brainstormRes.json();
                if (brainstormData.data?.stage?.yaml_artifact) {
                    const brainstormParsed = yaml.load(brainstormData.data.stage.yaml_artifact) as Record<string, unknown>;
                    if (brainstormParsed.selected_idea) {
                        fetchedIdea = brainstormParsed.selected_idea as BrainstormIdea;
                        setSelectedIdea(fetchedIdea);
                    }
                }
            }

            // Fetch research stage
            const researchRes = await fetch(`/api/stages/${projectId}/research`);
            if (researchRes.ok) {
                const researchData = await researchRes.json();
                if (researchData.data?.stage?.yaml_artifact) {
                    const researchParsed = yaml.load(researchData.data.stage.yaml_artifact) as Record<string, unknown>;
                    if (researchParsed.research_output) {
                        fetchedResearch = researchParsed.research_output as ResearchOutput;
                        setResearchOutput(fetchedResearch);
                    }
                }
            }

            // Fetch production stage
            const productionRes = await fetch(`/api/stages/${projectId}/production`);
            if (productionRes.ok) {
                const productionData = await productionRes.json();
                if (productionData.data?.stage?.yaml_artifact) {
                    const productionParsed = yaml.load(productionData.data.stage.yaml_artifact) as Record<string, unknown>;
                    if (productionParsed.production_output) {
                        fetchedProduction = productionParsed.production_output as ProductionOutput;
                        setProductionOutput(fetchedProduction);

                        // Build review input using fetched data
                        setReviewInput({
                            idea_id: fetchedIdea?.idea_id || fetchedProduction.idea_id,
                            original_idea: {
                                title: fetchedIdea?.title || "",
                                core_tension: fetchedIdea?.core_tension || "",
                                target_audience: fetchedIdea?.target_audience || "",
                            },
                            research_validation: {
                                verified: fetchedResearch?.idea_validation?.core_claim_verified || false,
                                evidence_strength: fetchedResearch?.idea_validation?.evidence_strength || "unknown",
                            },
                            production: fetchedProduction,
                        });
                    }
                }
            }
        } catch (err) {
            console.error("Failed to fetch previous stage data:", err);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLERS
    // ═══════════════════════════════════════════════════════════════════════
    function handleGenerateYaml() {
        if (!productionOutput) {
            setParseError("No production data available. Complete the Production stage first.");
            return;
        }

        // Detect which content types were actually produced
        const contentTypesRequested: Array<"blog" | "video" | "shorts" | "podcast"> = [];
        if (productionOutput.blog?.title || productionOutput.blog?.full_draft) {
            contentTypesRequested.push("blog");
        }
        if (productionOutput.video?.script || productionOutput.video?.title_options?.length) {
            contentTypesRequested.push("video");
        }
        if (productionOutput.shorts && productionOutput.shorts.length > 0) {
            contentTypesRequested.push("shorts");
        }
        if (productionOutput.podcast?.episode_title || productionOutput.podcast?.talking_points?.length) {
            contentTypesRequested.push("podcast");
        }

        const input: ReviewInput = {
            idea_id: selectedIdea?.idea_id || productionOutput.idea_id || `BC-IDEA-${Date.now()}`,
            original_idea: {
                title: selectedIdea?.title || "",
                core_tension: selectedIdea?.core_tension || "",
                target_audience: selectedIdea?.target_audience || "",
            },
            research_validation: {
                verified: researchOutput?.idea_validation?.core_claim_verified || false,
                evidence_strength: researchOutput?.idea_validation?.evidence_strength || "unknown",
            },
            content_types_requested: contentTypesRequested,
            production: productionOutput,
        };

        const yamlStr = yaml.dump(input, { lineWidth: -1, noRefs: true });
        const finalYaml = `# BC_REVIEW_INPUT\n# Generated: ${new Date().toISOString()}\n# Project: ${projectId}\n# Content types: ${contentTypesRequested.join(", ")}\n\n${yamlStr}`;
        setGeneratedYaml(finalYaml);
        setActiveTab("output");
    }

    function parseAiResponse() {
        try {
            const cleanedYaml = aiResponse
                .replace(/^```ya?ml?\s*/gm, "")
                .replace(/```$/gm, "")
                .trim();

            const parsed = yaml.load(cleanedYaml) as Record<string, unknown>;

            if (!parsed || typeof parsed !== "object") {
                throw new Error("Invalid YAML structure");
            }

            // Handle different wrapper formats
            let reviewOutput: ReviewOutput | null = null;
            
            if (parsed.BC_REVIEW_OUTPUT) {
                reviewOutput = parsed.BC_REVIEW_OUTPUT as ReviewOutput;
            } else if (parsed.review_output) {
                reviewOutput = parsed.review_output as ReviewOutput;
            } else if (parsed.overall_verdict || parsed.blog_review) {
                // Direct format without wrapper
                reviewOutput = parsed as unknown as ReviewOutput;
            }

            if (!reviewOutput) {
                throw new Error("Missing review output fields. Expected BC_REVIEW_OUTPUT, review_output, or overall_verdict/blog_review at root level.");
            }

            // Validate it has review output fields
            if (!reviewOutput.overall_verdict && !reviewOutput.blog_review) {
                throw new Error("Missing review output fields (overall_verdict or blog_review)");
            }

            setParsedContent(reviewOutput);
            setParseError("");
        } catch (err) {
            setParseError(err instanceof Error ? err.message : "Failed to parse YAML");
            setParsedContent(null);
        }
    }

    async function handleSaveProgress() {
        const fullData: Record<string, unknown> = {
            review_input: reviewInput,
            ai_response_raw: aiResponse || undefined,
        };

        if (parsedContent) {
            fullData.review_output = parsedContent;
        }

        onSave(yaml.dump(fullData, { lineWidth: -1, noRefs: true }));
    }

    async function handleComplete() {
        if (!parsedContent) return;

        const fullData: Record<string, unknown> = {
            review_input: reviewInput,
            review_output: parsedContent,
        };

        onComplete(yaml.dump(fullData, { lineWidth: -1, noRefs: true }));
    }

    function copyToClipboard() {
        navigator.clipboard.writeText(generatedYaml);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════
    function getVerdictBadge(verdict: "approved" | "revision_required" | "rejected" | "not_requested" | undefined) {
        const variants = {
            approved: { icon: CheckCircle, color: "bg-green-100 text-green-800", label: "Approved" },
            revision_required: { icon: AlertTriangle, color: "bg-yellow-100 text-yellow-800", label: "Needs Revision" },
            rejected: { icon: XCircle, color: "bg-red-100 text-red-800", label: "Rejected" },
            not_requested: { icon: AlertCircle, color: "bg-muted text-muted-foreground", label: "Not Requested" },
        };
        const v = verdict && variants[verdict] ? variants[verdict] : { icon: AlertCircle, color: "bg-muted text-muted-foreground", label: "Unknown" };
        const Icon = v.icon;
        return (
            <Badge className={`${v.color} gap-1`}>
                <Icon className="h-3 w-3" />
                {v.label}
            </Badge>
        );
    }

    function getScoreBadge(score: number | undefined) {
        if (score === undefined) return null;
        const color = score >= 80 ? "bg-green-100 text-green-800" : score >= 60 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
        return <Badge className={color}>{score}/100</Badge>;
    }

    // Safely render a value that might be an object or string
    function renderSafeText(value: unknown): string {
        if (typeof value === "string") return value;
        if (typeof value === "number" || typeof value === "boolean") return String(value);
        if (value === null || value === undefined) return "";
        if (typeof value === "object") {
            // If it's an object with a single key-value, show "key: value"
            const keys = Object.keys(value);
            if (keys.length === 1) {
                const key = keys[0];
                return `${key}: ${(value as Record<string, unknown>)[key]}`;
            }
            return JSON.stringify(value);
        }
        return String(value);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════
    return (
        <div className="space-y-6">
            {/* Header with Agent Prompt Viewer */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">Review Stage</h2>
                    <p className="text-sm text-muted-foreground">
                        Review all content and get publication plan from the Review Agent
                    </p>
                </div>
                <AgentPromptViewer stage="review" />
            </div>

            {/* Production Summary Card */}
            {productionOutput && (
                <Card className="border-blue-200 bg-info/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Production Content Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">Blog</p>
                                <p className="font-medium">{productionOutput.blog?.title || "Not generated"}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Video</p>
                                <p className="font-medium">{productionOutput.video?.title_options?.[0] || "Not generated"}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Shorts</p>
                                <p className="font-medium">{productionOutput.shorts?.length || 0} shorts</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Podcast</p>
                                <p className="font-medium">{productionOutput.podcast?.episode_title || "Not generated"}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Main Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "input" | "output")}>
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="input">Input</TabsTrigger>
                    <TabsTrigger value="output">Output & Review</TabsTrigger>
                </TabsList>

                {/* INPUT TAB */}
                <TabsContent value="input" className="space-y-4 mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Review Input Summary</CardTitle>
                            <CardDescription className="text-xs">
                                The review agent will receive all production content for quality review
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!productionOutput ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                                    <p>No production data available.</p>
                                    <p className="text-xs mt-2">Complete the Production stage first.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {selectedIdea && (
                                        <div className="p-3 bg-muted rounded-lg">
                                            <h4 className="font-medium text-sm">Original Idea</h4>
                                            <p className="text-sm text-muted-foreground">{selectedIdea.title}</p>
                                            <p className="text-xs text-muted-foreground mt-1">{selectedIdea.core_tension}</p>
                                        </div>
                                    )}
                                    {researchOutput && (
                                        <div className="p-3 bg-muted rounded-lg">
                                            <h4 className="font-medium text-sm">Research Validation</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                {researchOutput.idea_validation?.core_claim_verified ? (
                                                    <Badge className="bg-green-100 text-green-800">Verified</Badge>
                                                ) : (
                                                    <Badge className="bg-yellow-100 text-yellow-800">Unverified</Badge>
                                                )}
                                                <span className="text-sm text-muted-foreground">
                                                    Evidence: {researchOutput.idea_validation?.evidence_strength || "Unknown"}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    <div className="p-3 bg-muted rounded-lg">
                                        <h4 className="font-medium text-sm">Content to Review</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Blog, Video Script, {productionOutput.shorts?.length || 0} Shorts, Podcast
                                        </p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button onClick={handleGenerateYaml} disabled={!productionOutput} className="gap-2">
                            <FileText className="h-4 w-4" />
                            Generate Review YAML
                        </Button>
                    </div>
                </TabsContent>

                {/* OUTPUT TAB */}
                <TabsContent value="output" className="space-y-6 mt-4">
                    {/* Generated YAML to Copy */}
                    {generatedYaml && (
                        <Card className="border-green-200 bg-green-50/50">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-green-900">
                                        📋 Copy this to Review Agent
                                    </CardTitle>
                                    <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-2">
                                        {copied ? (
                                            <>
                                                <Check className="h-4 w-4 text-success" />
                                                Copied!
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="h-4 w-4" />
                                                Copy
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <pre className="bg-card p-3 rounded-md text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto border">
                                    {generatedYaml}
                                </pre>
                            </CardContent>
                        </Card>
                    )}

                    {/* Paste AI Response */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">
                                Paste AI Response (BC_REVIEW_OUTPUT YAML)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Textarea
                                value={aiResponse}
                                onChange={(e) => setAiResponse(e.target.value)}
                                placeholder="Paste the AI's review YAML response here..."
                                className="min-h-[150px] font-mono text-sm"
                            />
                            {parseError && (
                                <div className="flex items-center gap-2 text-red-600 text-sm">
                                    <AlertCircle className="h-4 w-4" />
                                    {parseError}
                                </div>
                            )}
                            <Button onClick={parseAiResponse} disabled={!aiResponse.trim()} className="gap-2">
                                <ArrowRight className="h-4 w-4" />
                                Parse Review
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Parsed Review Content */}
                    {parsedContent && (
                        <>
                            {/* Overall Verdict Banner */}
                            <Card className={
                                parsedContent.overall_verdict === "approved"
                                    ? "border-green-300 bg-green-50"
                                    : parsedContent.overall_verdict === "rejected"
                                        ? "border-red-300 bg-red-50"
                                        : "border-yellow-300 bg-yellow-50"
                            }>
                                <CardContent className="py-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {parsedContent.overall_verdict === "approved" ? (
                                                <CheckCircle className="h-8 w-8 text-success" />
                                            ) : parsedContent.overall_verdict === "rejected" ? (
                                                <XCircle className="h-8 w-8 text-red-600" />
                                            ) : (
                                                <AlertTriangle className="h-8 w-8 text-yellow-600" />
                                            )}
                                            <div>
                                                <h3 className="font-semibold text-lg">
                                                    {parsedContent.overall_verdict === "approved"
                                                        ? "Content Approved!"
                                                        : parsedContent.overall_verdict === "rejected"
                                                            ? "Content Rejected"
                                                            : "Revisions Required"}
                                                </h3>
                                                <p className="text-sm text-muted-foreground">{parsedContent.overall_notes}</p>
                                            </div>
                                        </div>
                                        {getVerdictBadge(parsedContent.overall_verdict)}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Review Tabs */}
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-medium">Detailed Reviews</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Tabs value={contentTab} onValueChange={(v) => setContentTab(v as typeof contentTab)}>
                                        <TabsList className="grid w-full grid-cols-5">
                                            <TabsTrigger value="blog" className="gap-1 text-xs">
                                                <FileText className="h-3 w-3" />
                                                Blog
                                            </TabsTrigger>
                                            <TabsTrigger value="video" className="gap-1 text-xs">
                                                <Video className="h-3 w-3" />
                                                Video
                                            </TabsTrigger>
                                            <TabsTrigger value="shorts" className="gap-1 text-xs">
                                                <Zap className="h-3 w-3" />
                                                Shorts
                                            </TabsTrigger>
                                            <TabsTrigger value="podcast" className="gap-1 text-xs">
                                                <Mic className="h-3 w-3" />
                                                Podcast
                                            </TabsTrigger>
                                            <TabsTrigger value="publication" className="gap-1 text-xs">
                                                <Calendar className="h-3 w-3" />
                                                Publish
                                            </TabsTrigger>
                                        </TabsList>

                                        {/* Blog Review */}
                                        <TabsContent value="blog" className="mt-4 space-y-4">
                                            {parsedContent.blog_review ? (
                                                <>
                                                    <div className="flex items-center justify-between">
                                                        {getVerdictBadge(parsedContent.blog_review.verdict)}
                                                        {getScoreBadge(parsedContent.blog_review.score)}
                                                    </div>
                                                    {parsedContent.blog_review.strengths && parsedContent.blog_review.strengths.length > 0 && (
                                                        <div>
                                                            <Label className="text-xs text-muted-foreground">Strengths</Label>
                                                            <ul className="text-sm list-disc list-inside mt-1">
                                                                {parsedContent.blog_review.strengths.map((s, i) => (
                                                                    <li key={i} className="text-green-700">{renderSafeText(s)}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {parsedContent.blog_review.issues?.critical && parsedContent.blog_review.issues.critical.length > 0 && (
                                                        <div>
                                                            <Label className="text-xs text-red-600">Critical Issues</Label>
                                                            <ul className="space-y-2 mt-1">
                                                                {parsedContent.blog_review.issues.critical.map((issue, i) => (
                                                                    <li key={i} className="text-sm p-2 bg-red-50 rounded">
                                                                        <p className="font-medium">{renderSafeText(issue.location)}: {renderSafeText(issue.issue)}</p>
                                                                        <p className="text-xs text-muted-foreground">Fix: {renderSafeText(issue.suggested_fix)}</p>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {parsedContent.blog_review.issues?.minor && parsedContent.blog_review.issues.minor.length > 0 && (
                                                        <div>
                                                            <Label className="text-xs text-yellow-600">Minor Issues</Label>
                                                            <ul className="space-y-1 mt-1">
                                                                {parsedContent.blog_review.issues.minor.map((issue, i) => (
                                                                    <li key={i} className="text-sm p-2 bg-yellow-50 rounded">
                                                                        <p>{renderSafeText(issue.location)}: {renderSafeText(issue.issue)}</p>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {parsedContent.blog_review.seo_check && (
                                                        <div className="p-3 bg-muted rounded-lg">
                                                            <Label className="text-xs text-muted-foreground">SEO Check</Label>
                                                            <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                                                                <div className="flex items-center gap-2">
                                                                    {parsedContent.blog_review.seo_check.title_optimized ? (
                                                                        <CheckCircle className="h-4 w-4 text-success" />
                                                                    ) : (
                                                                        <XCircle className="h-4 w-4 text-red-600" />
                                                                    )}
                                                                    Title Optimized
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {parsedContent.blog_review.seo_check.meta_description_optimized ? (
                                                                        <CheckCircle className="h-4 w-4 text-success" />
                                                                    ) : (
                                                                        <XCircle className="h-4 w-4 text-red-600" />
                                                                    )}
                                                                    Meta Optimized
                                                                </div>
                                                                <div>Keyword Usage: <Badge variant="outline">{parsedContent.blog_review.seo_check.keyword_usage}</Badge></div>
                                                                <div>Readability: <Badge variant="outline">{parsedContent.blog_review.seo_check.readability_score}</Badge></div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-muted-foreground text-sm">No blog review available</p>
                                            )}
                                        </TabsContent>

                                        {/* Video Review */}
                                        <TabsContent value="video" className="mt-4 space-y-4">
                                            {parsedContent.video_review ? (
                                                <>
                                                    <div className="flex items-center justify-between">
                                                        {getVerdictBadge(parsedContent.video_review.verdict)}
                                                        {getScoreBadge(parsedContent.video_review.score)}
                                                    </div>
                                                    {parsedContent.video_review.strengths && parsedContent.video_review.strengths.length > 0 && (
                                                        <div>
                                                            <Label className="text-xs text-muted-foreground">Strengths</Label>
                                                            <ul className="text-sm list-disc list-inside mt-1">
                                                                {parsedContent.video_review.strengths.map((s, i) => (
                                                                    <li key={i} className="text-green-700">{renderSafeText(s)}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="p-3 bg-muted rounded-lg">
                                                            <Label className="text-xs text-muted-foreground">Hook Effectiveness</Label>
                                                            <p className="text-sm font-medium mt-1">{parsedContent.video_review.hook_effectiveness || "N/A"}</p>
                                                        </div>
                                                        <div className="p-3 bg-muted rounded-lg">
                                                            <Label className="text-xs text-muted-foreground">Thumbnail Feedback</Label>
                                                            <p className="text-sm mt-1">{parsedContent.video_review.thumbnail_feedback || "N/A"}</p>
                                                        </div>
                                                    </div>
                                                    {parsedContent.video_review.pacing_notes && (
                                                        <div>
                                                            <Label className="text-xs text-muted-foreground">Pacing Notes</Label>
                                                            <p className="text-sm bg-muted p-2 rounded mt-1">{parsedContent.video_review.pacing_notes}</p>
                                                        </div>
                                                    )}
                                                    {parsedContent.video_review.issues?.critical && parsedContent.video_review.issues.critical.length > 0 && (
                                                        <div>
                                                            <Label className="text-xs text-red-600">Critical Issues</Label>
                                                            <ul className="space-y-2 mt-1">
                                                                {parsedContent.video_review.issues.critical.map((issue, i) => (
                                                                    <li key={i} className="text-sm p-2 bg-red-50 rounded">
                                                                        <p className="font-medium">{renderSafeText(issue.location)}: {renderSafeText(issue.issue)}</p>
                                                                        <p className="text-xs text-muted-foreground">Fix: {renderSafeText(issue.suggested_fix)}</p>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-muted-foreground text-sm">No video review available</p>
                                            )}
                                        </TabsContent>

                                        {/* Shorts Review */}
                                        <TabsContent value="shorts" className="mt-4 space-y-4">
                                            {parsedContent.shorts_review ? (
                                                <>
                                                    <div className="flex items-center gap-2">
                                                        {getVerdictBadge(parsedContent.shorts_review.verdict)}
                                                        {parsedContent.shorts_review.notes && (
                                                            <span className="text-sm text-muted-foreground">{renderSafeText(parsedContent.shorts_review.notes)}</span>
                                                        )}
                                                    </div>
                                                    {parsedContent.shorts_review.individual_reviews && parsedContent.shorts_review.individual_reviews.length > 0 && (
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                            {parsedContent.shorts_review.individual_reviews.map((review, idx) => (
                                                                <div key={idx} className="p-3 border rounded-lg">
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <span className="text-xs text-muted-foreground">Short #{review.short_number}</span>
                                                                        {getVerdictBadge(review.verdict)}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-xs">
                                                                        <span>Hook:</span>
                                                                        <Badge variant="outline">{review.hook_strength}</Badge>
                                                                    </div>
                                                                    {review.notes && (
                                                                        <p className="text-xs text-muted-foreground mt-2">{renderSafeText(review.notes)}</p>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-muted-foreground text-sm">No shorts review available</p>
                                            )}
                                        </TabsContent>

                                        {/* Podcast Review */}
                                        <TabsContent value="podcast" className="mt-4 space-y-4">
                                            {parsedContent.podcast_review ? (
                                                <>
                                                    <div className="flex items-center justify-between">
                                                        {getVerdictBadge(parsedContent.podcast_review.verdict)}
                                                        {parsedContent.podcast_review.score && getScoreBadge(parsedContent.podcast_review.score)}
                                                    </div>
                                                    {parsedContent.podcast_review.strengths && parsedContent.podcast_review.strengths.length > 0 && (
                                                        <div>
                                                            <Label className="text-xs text-muted-foreground">Strengths</Label>
                                                            <ul className="text-sm list-disc list-inside mt-1">
                                                                {parsedContent.podcast_review.strengths.map((s, i) => (
                                                                    <li key={i} className="text-green-700">{renderSafeText(s)}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {parsedContent.podcast_review.notes && (
                                                        <div>
                                                            <Label className="text-xs text-muted-foreground">Notes</Label>
                                                            <p className="text-sm bg-muted p-2 rounded mt-1">{renderSafeText(parsedContent.podcast_review.notes)}</p>
                                                        </div>
                                                    )}
                                                    {parsedContent.podcast_review.issues && parsedContent.podcast_review.issues.length > 0 && (
                                                        <div>
                                                            <Label className="text-xs text-red-600">Issues</Label>
                                                            <ul className="space-y-2 mt-1">
                                                                {parsedContent.podcast_review.issues.map((issue, i) => (
                                                                    <li key={i} className="text-sm p-2 bg-red-50 rounded">
                                                                        <p className="font-medium">{renderSafeText(issue.issue)}</p>
                                                                        <p className="text-xs text-muted-foreground">Fix: {renderSafeText(issue.suggested_fix)}</p>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-muted-foreground text-sm">No podcast review available</p>
                                            )}
                                        </TabsContent>

                                        {/* Publication Plan */}
                                        <TabsContent value="publication" className="mt-4 space-y-4">
                                            {parsedContent.publication_plan ? (
                                                <>
                                                    <div className="flex items-center gap-2">
                                                        {parsedContent.publication_plan.ready_to_publish ? (
                                                            <Badge className="bg-green-100 text-green-800 gap-1">
                                                                <CheckCircle className="h-3 w-3" />
                                                                Ready to Publish
                                                            </Badge>
                                                        ) : (
                                                            <Badge className="bg-yellow-100 text-yellow-800 gap-1">
                                                                <AlertTriangle className="h-3 w-3" />
                                                                Not Ready
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    {/* Blog Schedule */}
                                                    {parsedContent.publication_plan.blog && (
                                                        <div className="p-3 bg-muted rounded-lg">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <FileText className="h-4 w-4" />
                                                                <Label className="font-medium">Blog</Label>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                                <div>
                                                                    <span className="text-muted-foreground">Date:</span>{" "}
                                                                    {parsedContent.publication_plan.blog.recommended_publish_date}
                                                                </div>
                                                                <div>
                                                                    <span className="text-muted-foreground">Time:</span>{" "}
                                                                    {parsedContent.publication_plan.blog.publish_time}
                                                                </div>
                                                            </div>
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                {parsedContent.publication_plan.blog.categories?.map((cat, i) => (
                                                                    <Badge key={i} variant="outline" className="text-xs">{cat}</Badge>
                                                                ))}
                                                                {parsedContent.publication_plan.blog.tags?.map((tag, i) => (
                                                                    <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* YouTube Schedule */}
                                                    {parsedContent.publication_plan.youtube && (
                                                        <div className="p-3 bg-muted rounded-lg">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <Video className="h-4 w-4" />
                                                                <Label className="font-medium">YouTube</Label>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                                <div>
                                                                    <span className="text-muted-foreground">Date:</span>{" "}
                                                                    {parsedContent.publication_plan.youtube.recommended_publish_date}
                                                                </div>
                                                                <div>
                                                                    <span className="text-muted-foreground">Time:</span>{" "}
                                                                    {parsedContent.publication_plan.youtube.publish_time}
                                                                </div>
                                                            </div>
                                                            <p className="text-sm font-medium mt-2">{parsedContent.publication_plan.youtube.final_title}</p>
                                                        </div>
                                                    )}

                                                    {/* Shorts Schedule */}
                                                    {parsedContent.publication_plan.shorts && parsedContent.publication_plan.shorts.length > 0 && (
                                                        <div className="p-3 bg-muted rounded-lg">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <Zap className="h-4 w-4" />
                                                                <Label className="font-medium">Shorts Schedule</Label>
                                                            </div>
                                                            <div className="space-y-2">
                                                                {parsedContent.publication_plan.shorts.map((short, i) => (
                                                                    <div key={i} className="flex items-center justify-between text-sm">
                                                                        <span>Short #{short.short_number}</span>
                                                                        <span>{short.publish_date} @ {short.publish_time}</span>
                                                                        <Badge variant="outline">{short.platform}</Badge>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Cross-Promotion */}
                                                    {parsedContent.publication_plan.cross_promotion && (
                                                        <div className="p-3 bg-blue-50 rounded-lg">
                                                            <Label className="font-medium">Cross-Promotion</Label>
                                                            <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                                                                <div>Twitter Thread: {parsedContent.publication_plan.cross_promotion.twitter_thread_date}</div>
                                                                <div>Community Post: {parsedContent.publication_plan.cross_promotion.community_post_date}</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-muted-foreground text-sm">No publication plan available</p>
                                            )}
                                        </TabsContent>
                                    </Tabs>
                                </CardContent>
                            </Card>

                            {/* A/B Tests */}
                            {parsedContent.ab_tests && (
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-sm font-medium">A/B Test Variants</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {parsedContent.ab_tests.thumbnail_variants?.length > 0 && (
                                            <div>
                                                <Label className="text-xs text-muted-foreground">Thumbnail Variants</Label>
                                                <div className="grid grid-cols-2 gap-2 mt-1">
                                                    {parsedContent.ab_tests.thumbnail_variants.map((v, i) => (
                                                        <div key={i} className="p-2 bg-muted rounded text-sm">
                                                            <span className="font-medium">{v.variant}:</span> {v.description}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {parsedContent.ab_tests.title_variants?.length > 0 && (
                                            <div>
                                                <Label className="text-xs text-muted-foreground">Title Variants</Label>
                                                <ul className="mt-1 space-y-1">
                                                    {parsedContent.ab_tests.title_variants.map((v, i) => (
                                                        <li key={i} className="text-sm p-2 bg-muted rounded">
                                                            <span className="font-medium">{v.variant}:</span> {v.title}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {parsedContent.ab_tests.testing_notes && (
                                            <p className="text-sm text-muted-foreground">{parsedContent.ab_tests.testing_notes}</p>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={handleSaveProgress} disabled={saving}>
                            {saving ? "Saving..." : "Save Progress"}
                        </Button>
                        <Button
                            onClick={handleComplete}
                            disabled={saving || !parsedContent}
                            className="gap-2"
                        >
                            Complete Review & Ready to Publish
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
