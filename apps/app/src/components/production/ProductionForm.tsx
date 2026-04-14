"use client";

import React, { useEffect, useState } from "react";
import yaml from "js-yaml";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import AgentPromptViewer from "@/components/agents/AgentPromptViewer";
import MarkdownImport from "@/components/import/MarkdownImport";
import dynamic from "next/dynamic";
import AssetsTabBlog from "@/components/assets/AssetsTabBlog";
import AssetsTabVideo from "@/components/assets/AssetsTabVideo";

const BlogEditor = dynamic(() => import("@/components/production/BlogEditor"), { ssr: false });
const BlogPreview = dynamic(() => import("@/components/production/BlogPreview"), { ssr: false });
const VideoPreview = dynamic(() => import("@/components/production/VideoPreview"), { ssr: false });
const CanonicalCoreEditor = dynamic(() => import("@/components/production/CanonicalCoreEditor"), { ssr: false });
import VideoStyleSelector from "@/components/production/VideoStyleSelector";
import { Copy, Check, ArrowRight, FileText, Video, Zap, Mic, AlertCircle, Upload, MessageSquare, CheckCircle, Edit3, Eye, Save, Library, Image } from "lucide-react";
import type { ParsedProduction } from "@/lib/parsers/markdown";
import type {
    ProductionOutput,
    ProductionInput,
    BlogOutput,
    VideoOutput,
    ShortOutput,
    PodcastOutput,
    BrainstormIdea,
    ResearchOutput,
    LegacyIdea
} from "@brighttale/shared/types/agents";
import { isLegacyIdea, normalizeLegacyIdea, mapBrainstormToResearchInput, mapResearchToProductionInput } from "@brighttale/shared/types/agents";
import { useToast } from "@/hooks/use-toast";
import { saveContentDraft } from "@/lib/workflow/contentSaver";
import { canonicalCoreSchema, type CanonicalCoreInput, type CanonicalCore } from "@brighttale/shared/schemas/canonicalCore";
import { type VideoStyleConfig } from "@brighttale/shared/schemas/videoStyle";
import { mapCanonicalCoreToBlogInput } from "@/lib/modules/blog/mapper";
import { mapCanonicalCoreToVideoInput } from "@/lib/modules/video/mapper";
import { mapCanonicalCoreToShortsInput } from "@/lib/modules/shorts/mapper";
import { mapCanonicalCoreToPodcastInput } from "@/lib/modules/podcast/mapper";
import { mapCanonicalCoreToEngagementInput } from "@/lib/modules/engagement/mapper";
import { blogOutputSchema } from "@/lib/modules/blog/schema";
import { videoOutputSchema } from "@/lib/modules/video/schema";
import { shortsOutputSchema } from "@/lib/modules/shorts/schema";
import { podcastOutputSchema } from "@/lib/modules/podcast/schema";
import { engagementOutputSchema } from "@/lib/modules/engagement/schema";
import { z } from "zod";

interface ProductionFormProps {
    initialYaml?: string;
    projectId?: string;
    onSave: (yamlContent: string) => void;
    onComplete: (yamlContent: string) => void;
    saving?: boolean;
}

export default function ProductionForm({
    initialYaml,
    projectId,
    onSave,
    onComplete,
    saving,
}: ProductionFormProps) {
    const { toast } = useToast();

    const [workflowTab, setWorkflowTab] = useState<"input" | "core" | "output" | "edit" | "assets">("input");
    const [contentTab, setContentTab] = useState<"blog" | "video" | "shorts" | "podcast" | "engagement">("blog");

    // Core (CanonicalCore) workflow state
    const [coreSubTab, setCoreSubTab] = useState<"agent-input" | "paste-edit" | "format-inputs">("agent-input");
    const [coreAiResponse, setCoreAiResponse] = useState("");
    const [canonicalCore, setCanonicalCore] = useState<CanonicalCoreInput | null>(null);
    const [savedCoreId, setSavedCoreId] = useState<string | null>(null);
    const [savingCore, setSavingCore] = useState(false);
    const [coreParseError, setCoreParseError] = useState<string | null>(null);
    const [coreCopied, setCoreCopied] = useState(false);
    const [videoStyleConfig, setVideoStyleConfig] = useState<VideoStyleConfig>({ template: "talking_head_standard", cut_frequency: "moderate", b_roll_density: "low", text_overlays: "minimal", music_style: "calm_ambient", presenter_notes: false, b_roll_required: false });

    const [productionInput, setProductionInput] = useState<Partial<ProductionInput> | null>(null);
    const [formatResponses, setFormatResponses] = useState<Record<string, string>>({});
    const [formatParseErrors, setFormatParseErrors] = useState<Record<string, string | null>>({});
    const [parsedContent, setParsedContent] = useState<ProductionOutput | null>(null);
    const [importedFromMarkdown, setImportedFromMarkdown] = useState(false);

    // Blog editing states
    const [showPreview, setShowPreview] = useState(false);
    const [savingBlog, setSavingBlog] = useState(false);
    const [savedBlogId, setSavedBlogId] = useState<string | null>(null);

    // Video/Shorts/Podcast save states
    const [savingVideo, setSavingVideo] = useState(false);
    const [savedVideoId, setSavedVideoId] = useState<string | null>(null);
    const [savingShorts, setSavingShorts] = useState(false);
    const [savedShortsId, setSavedShortsId] = useState<string | null>(null);
    const [savingPodcast, setSavingPodcast] = useState(false);
    const [savedPodcastId, setSavedPodcastId] = useState<string | null>(null);

    // Content type selection
    const [selectedContentTypes, setSelectedContentTypes] = useState<{
        blog: boolean;
        video: boolean;
        shorts: boolean;
        podcast: boolean;
    }>({
        blog: true,
        video: false,
        shorts: false,
        podcast: false,
    });

    // Parse initial YAML
    useEffect(() => {
        if (initialYaml) {
            try {
                const parsed = yaml.load(initialYaml) as Record<string, unknown>;
                if (parsed) {
                    // Build production input from parsed data
                    const input: Partial<ProductionInput> = {};

                    if (parsed.selected_idea) {
                        const idea = parsed.selected_idea;
                        if (isLegacyIdea(idea)) {
                            const normalized = normalizeLegacyIdea(idea as LegacyIdea);
                            const researchInput = mapBrainstormToResearchInput(normalized);
                            input.selected_idea = {
                                idea_id: researchInput.idea_id,
                                title: researchInput.title,
                                core_tension: researchInput.core_tension,
                                target_audience: researchInput.target_audience,
                                scroll_stopper: researchInput.scroll_stopper,
                                curiosity_gap: researchInput.curiosity_gap,
                                monetization: { affiliate_angle: researchInput.monetization?.affiliate_angle || "" },
                            };
                        } else {
                            input.selected_idea = idea as ProductionInput["selected_idea"];
                        }
                    }

                    if (parsed.research_output) {
                        const research = parsed.research_output as ResearchOutput;
                        input.research = mapResearchToProductionInput(research);
                    }

                    setProductionInput(input);

                    if (parsed.canonical_core) {
                        const result = canonicalCoreSchema.safeParse(parsed.canonical_core);
                        if (result.success) {
                            setCanonicalCore(result.data as CanonicalCoreInput);
                            setCoreAiResponse(yaml.dump({ BC_CANONICAL_CORE: result.data }, { lineWidth: -1 }));
                        }
                    } else if (parsed.core_ai_response_raw) {
                        setCoreAiResponse(String(parsed.core_ai_response_raw));
                    }

                    if (parsed.selected_content_types && typeof parsed.selected_content_types === "object") {
                        setSelectedContentTypes(parsed.selected_content_types as typeof selectedContentTypes);
                    }

                    if (parsed.video_style_config && typeof parsed.video_style_config === "object") {
                        setVideoStyleConfig(parsed.video_style_config as VideoStyleConfig);
                    }

                    if (parsed.format_responses && typeof parsed.format_responses === "object") {
                        setFormatResponses(parsed.format_responses as Record<string, string>);
                    }

                    if (parsed.production_output) {
                        setParsedContent(parsed.production_output as ProductionOutput);
                        setWorkflowTab("output");
                    }
                }
            } catch {
                // Invalid YAML
            }
        }
    }, [initialYaml]);

    // Restore savedCoreId from DB if canonical_core is present but ID not yet known
    useEffect(() => {
        if (!projectId || savedCoreId || !canonicalCore) return;
        fetch(`/api/canonical-core?project_id=${projectId}`)
            .then(res => res.ok ? res.json() : null)
            .then(json => {
                const id = json?.data?.canonical_cores?.[0]?.id ?? null;
                if (id) setSavedCoreId(id);
            })
            .catch(() => {/* ignore */});
    }, [projectId, canonicalCore, savedCoreId]);

    // Fetch data from previous stages if not set
    useEffect(() => {
        if (productionInput || !projectId) return;

        const fetchPreviousStages = async () => {
            try {
                // Fetch brainstorm idea
                const brainstormRes = await fetch(`/api/stages/${projectId}/brainstorm`);
                let idea: BrainstormIdea | null = null;
                if (brainstormRes.ok) {
                    const json = await brainstormRes.json();
                    const brainstormYaml = json.data?.stage?.yaml_artifact;
                    if (brainstormYaml) {
                        const parsed = yaml.load(brainstormYaml) as Record<string, unknown>;
                        if (parsed?.selected_idea) {
                            const rawIdea = parsed.selected_idea;
                            if (isLegacyIdea(rawIdea)) {
                                idea = normalizeLegacyIdea(rawIdea as LegacyIdea);
                            } else {
                                idea = rawIdea as BrainstormIdea;
                            }
                        }
                    }
                }

                // Fetch research output
                const researchRes = await fetch(`/api/stages/${projectId}/research`);
                let research: ProductionInput["research"] | null = null;
                if (researchRes.ok) {
                    const json = await researchRes.json();
                    const researchYaml = json.data?.stage?.yaml_artifact;
                    if (researchYaml) {
                        const parsed = yaml.load(researchYaml) as Record<string, unknown>;
                        if (parsed?.research_output) {
                            research = mapResearchToProductionInput(parsed.research_output as ResearchOutput);
                        }
                    }
                }

                if (idea || research) {
                    const input: Partial<ProductionInput> = {};
                    if (idea) {
                        input.selected_idea = {
                            idea_id: idea.idea_id,
                            title: idea.title,
                            core_tension: idea.core_tension,
                            target_audience: idea.target_audience,
                            scroll_stopper: idea.scroll_stopper,
                            curiosity_gap: idea.curiosity_gap,
                            monetization: { affiliate_angle: idea.monetization?.affiliate_angle || "" },
                        };
                    }
                    if (research) {
                        input.research = research;
                    }
                    setProductionInput(input);
                }
            } catch {
                // Ignore errors
            }
        };

        fetchPreviousStages();
    }, [projectId, productionInput]);

    const handleGenerateYaml = () => {
        setWorkflowTab("core");
    };

    const getFormatInputYaml = (format: string): string => {
        if (!canonicalCore) return "";
        try {
            const parsed = canonicalCoreSchema.parse(canonicalCore);
            const mappers: Record<string, () => unknown> = {
                blog: () => ({ BC_BLOG_INPUT: mapCanonicalCoreToBlogInput(parsed) }),
                video: () => ({ BC_VIDEO_INPUT: mapCanonicalCoreToVideoInput(parsed, videoStyleConfig) }),
                shorts: () => ({ BC_SHORTS_INPUT: mapCanonicalCoreToShortsInput(parsed) }),
                podcast: () => ({ BC_PODCAST_INPUT: mapCanonicalCoreToPodcastInput(parsed) }),
                engagement: () => ({ BC_ENGAGEMENT_INPUT: mapCanonicalCoreToEngagementInput(parsed) }),
            };
            return yaml.dump(mappers[format]?.() ?? {}, { lineWidth: -1 });
        } catch {
            return "";
        }
    };

    const parseFormatOutput = (format: string, text: string) => {
        setFormatParseErrors(prev => ({ ...prev, [format]: null }));
        try {
            const raw = yaml.load(text) as Record<string, unknown>;
            const key = `BC_${format.toUpperCase()}_OUTPUT`;
            const data = raw?.[key] ?? raw;

            const schemas: Record<string, z.ZodTypeAny> = {
                blog: blogOutputSchema,
                video: videoOutputSchema,
                shorts: shortsOutputSchema,
                podcast: podcastOutputSchema,
                engagement: engagementOutputSchema,
            };

            const result = schemas[format]?.safeParse(data);
            if (!result) return;
            if (result.success) {
                setParsedContent(prev => ({
                    idea_id: prev?.idea_id ?? productionInput?.selected_idea?.idea_id ?? "",
                    blog: prev?.blog ?? ({} as BlogOutput),
                    video: prev?.video ?? ({} as VideoOutput),
                    shorts: prev?.shorts ?? [],
                    podcast: prev?.podcast ?? ({} as PodcastOutput),
                    engagement: prev?.engagement ?? { pinned_comment: "", community_post: "", twitter_thread: { hook_tweet: "", thread_outline: [] } },
                    [format]: result.data,
                }));
            } else {
                const msg = result.error.issues.map((i: z.ZodIssue) => i.message).join("; ");
                setFormatParseErrors(prev => ({ ...prev, [format]: msg }));
            }
        } catch (e) {
            setFormatParseErrors(prev => ({ ...prev, [format]: "Invalid YAML: " + (e instanceof Error ? e.message : String(e)) }));
        }
    };

    const buildSaveData = () => ({
        ...productionInput,
        canonical_core: canonicalCore ?? undefined,
        core_ai_response_raw: coreAiResponse || undefined,
        selected_content_types: selectedContentTypes,
        video_style_config: videoStyleConfig,
        format_responses: Object.keys(formatResponses).length > 0 ? formatResponses : undefined,
        production_output: parsedContent,
        imported_from_markdown: importedFromMarkdown,
    });

    const handleSaveProgress = () => {
        onSave(yaml.dump(buildSaveData()));
    };

    const handleComplete = () => {
        if (!parsedContent) {
            toast({ title: "Parse at least one format output before continuing.", variant: "destructive" });
            return;
        }
        onComplete(yaml.dump(buildSaveData()));
    };

    // Handle blog save from editor
    const handleBlogSave = async (blog: BlogOutput) => {
        // Update parsedContent with new blog
        setParsedContent(prev => ({
            ...prev,
            idea_id: productionInput?.selected_idea?.idea_id || prev?.idea_id || "",
            blog,
            video: prev?.video || {} as VideoOutput,
            shorts: prev?.shorts || [],
            podcast: prev?.podcast || {} as PodcastOutput,
            engagement: prev?.engagement || { pinned_comment: "", community_post: "", twitter_thread: { hook_tweet: "", thread_outline: [] } },
        }));

        setSavingBlog(true);
        const result = await saveContentDraft({
            format: "blog",
            data: {
                title: blog.title,
                slug: blog.slug,
                meta_description: blog.meta_description,
                full_draft: blog.full_draft,
                outline: blog.outline,
                primary_keyword: blog.primary_keyword,
                secondary_keywords: blog.secondary_keywords,
                affiliate_integration: blog.affiliate_integration,
                internal_links_suggested: blog.internal_links_suggested,
                word_count: blog.word_count,
                status: "draft",
                project_id: projectId,
                idea_id: productionInput?.selected_idea?.idea_id,
            },
            savedId: savedBlogId ?? undefined,
        });
        setSavingBlog(false);

        if (result.success) {
            if (!savedBlogId && result.id) setSavedBlogId(result.id);
            toast({ title: savedBlogId ? "Blog updated" : "Blog saved", variant: "success" });
        } else {
            console.error("Failed to save blog:", result.error);
            toast({ title: savedBlogId ? "Failed to update blog" : "Failed to save blog", variant: "destructive" });
        }
    };

    // Handle video save
    const handleVideoSave = async () => {
        if (!parsedContent?.video) return;
        setSavingVideo(true);
        const result = await saveContentDraft({
            format: "video",
            data: {
                title: parsedContent.video.title_options?.[0] || "Video Draft",
                title_options: parsedContent.video.title_options || [],
                thumbnail: parsedContent.video.thumbnail,
                script: parsedContent.video.script,
                total_duration_estimate: parsedContent.video.total_duration_estimate || "",
                status: "draft",
                project_id: projectId,
                idea_id: productionInput?.selected_idea?.idea_id,
            },
            savedId: savedVideoId ?? undefined,
        });
        setSavingVideo(false);

        if (result.success) {
            if (!savedVideoId && result.id) setSavedVideoId(result.id);
            toast({ title: savedVideoId ? "Video updated" : "Video saved", variant: "success" });
        } else {
            console.error("Failed to save video:", result.error);
            toast({ title: savedVideoId ? "Failed to update video" : "Failed to save video", variant: "destructive" });
        }
    };

    // Handle shorts save
    const handleShortsSave = async () => {
        if (!parsedContent?.shorts?.length) return;
        setSavingShorts(true);
        // Derive total_duration from individual short durations (best-effort)
        const total_duration = parsedContent.shorts
            .map(s => s.duration || "")
            .filter(Boolean)
            .join(", ") || undefined;

        const result = await saveContentDraft({
            format: "shorts",
            data: {
                shorts: parsedContent.shorts,
                total_duration,
                status: "draft",
                project_id: projectId,
                idea_id: productionInput?.selected_idea?.idea_id,
            },
            savedId: savedShortsId ?? undefined,
        });
        setSavingShorts(false);

        if (result.success) {
            if (!savedShortsId && result.id) setSavedShortsId(result.id);
            toast({ title: savedShortsId ? "Shorts updated" : "Shorts saved", variant: "success" });
        } else {
            console.error("Failed to save shorts:", result.error);
            toast({ title: savedShortsId ? "Failed to update shorts" : "Failed to save shorts", variant: "destructive" });
        }
    };

    // Handle podcast save
    const handlePodcastSave = async () => {
        if (!parsedContent?.podcast) return;
        setSavingPodcast(true);
        const result = await saveContentDraft({
            format: "podcast",
            data: {
                episode_title: parsedContent.podcast.episode_title,
                episode_description: parsedContent.podcast.episode_description,
                intro_hook: parsedContent.podcast.intro_hook,
                talking_points: parsedContent.podcast.talking_points,
                personal_angle: parsedContent.podcast.personal_angle,
                guest_questions: parsedContent.podcast.guest_questions,
                outro: parsedContent.podcast.outro,
                duration_estimate: parsedContent.podcast.duration_estimate,
                status: "draft",
                project_id: projectId,
                idea_id: productionInput?.selected_idea?.idea_id,
            },
            savedId: savedPodcastId ?? undefined,
        });
        setSavingPodcast(false);

        if (result.success) {
            if (!savedPodcastId && result.id) setSavedPodcastId(result.id);
            toast({ title: savedPodcastId ? "Podcast updated" : "Podcast saved", variant: "success" });
        } else {
            console.error("Failed to save podcast:", result.error);
            toast({ title: savedPodcastId ? "Failed to update podcast" : "Failed to save podcast", variant: "destructive" });
        }
    };

    // Handle video export download
    const handleVideoExport = (format: "markdown" | "html" | "teleprompter") => {
        if (savedVideoId) {
            window.open(`/api/videos/${savedVideoId}/export?format=${format}`, "_blank");
        }
    };

    const formToCoreInputYaml = (): string => {
        const input = {
            BC_CANONICAL_CORE_INPUT: {
                selected_idea: productionInput?.selected_idea ?? null,
                research: productionInput?.research ?? null,
            },
        };
        return yaml.dump(input, { lineWidth: -1 });
    };

    const parseCanonicalCore = () => {
        setCoreParseError(null);
        try {
            const raw = yaml.load(coreAiResponse) as Record<string, unknown>;
            const coreData = (raw?.BC_CANONICAL_CORE ?? raw) as unknown;
            const result = canonicalCoreSchema.safeParse(coreData);
            if (result.success) {
                setCanonicalCore(result.data as CanonicalCoreInput);
            } else {
                setCoreParseError(result.error.issues.map(i => i.message).join("; "));
            }
        } catch (e) {
            setCoreParseError("Invalid YAML: " + (e instanceof Error ? e.message : String(e)));
        }
    };

    const handleSaveCore = async (coreToSave?: CanonicalCoreInput) => {
        const core = coreToSave ?? canonicalCore;
        if (!core) return;
        setSavingCore(true);
        try {
            const res = await fetch("/api/canonical-core", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...core, project_id: projectId }),
            });
            if (res.ok) {
                const json = await res.json();
                setSavedCoreId(json.data?.canonical_core?.id ?? json.data?.id ?? json.id ?? null);
                setCoreSubTab("format-inputs");
                onSave(yaml.dump({ ...productionInput, canonical_core: core }));
                toast({ title: "Core saved", variant: "success" });
            } else {
                toast({ title: "Failed to save core", variant: "destructive" });
            }
        } catch {
            toast({ title: "Failed to save core", variant: "destructive" });
        }
        setSavingCore(false);
    };

    const copyText = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast({ title: `${label} copied` });
        } catch {
            // ignore
        }
    };

    // Handle markdown import
    const handleMarkdownImport = (parsed: ParsedProduction) => {
        const content: Partial<ProductionOutput> = {
            idea_id: productionInput?.selected_idea?.idea_id || "",
            blog: {
                title: parsed.title,
                slug: parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                meta_description: parsed.meta_description || "",
                primary_keyword: "",
                secondary_keywords: [],
                outline: parsed.sections?.map((s) => ({
                    h2: s.heading,
                    key_points: s.bullets || [],
                    word_count_target: 300,
                })) || [],
                full_draft: parsed.raw_content || "",
                affiliate_integration: {
                    placement: "middle",
                    copy: "",
                    product_link_placeholder: "",
                    rationale: "",
                },
                internal_links_suggested: [],
                word_count: parsed.raw_content?.split(/\s+/).length || 0,
            },
        };

        setParsedContent(content as ProductionOutput);
        setImportedFromMarkdown(true);
        setWorkflowTab("output");
    };

    return (
        <div className="space-y-6">
            {/* Agent Prompt Viewer — shows the relevant agent for the active workflow tab */}
            <AgentPromptViewer
                stage={
                    workflowTab === "core"
                        ? "content-core"
                        : workflowTab === "output"
                            ? `production-${contentTab}`
                            : "production"
                }
                key={
                    workflowTab === "core"
                        ? "content-core"
                        : workflowTab === "output"
                            ? `production-${contentTab}`
                            : "production"
                }
            />

            {/* Quick Import from Markdown */}
            <Card className="border-dashed">
                <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium text-sm">Import Existing Content</h3>
                            <p className="text-xs text-muted-foreground">
                                Skip AI generation by importing content from a markdown file
                            </p>
                        </div>
                        <MarkdownImport
                            type="production"
                            onImport={(parsed) => handleMarkdownImport(parsed as ParsedProduction)}
                            trigger={
                                <Button variant="outline" className="gap-2">
                                    <Upload className="h-4 w-4" />
                                    Import Markdown
                                </Button>
                            }
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Selected Idea Display */}
            {productionInput?.selected_idea && (
                <Card className="border-green-200 bg-green-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-green-900">
                            <CheckCircle className="h-4 w-4 inline mr-2" />
                            Producing Content For
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <h3 className="font-semibold">{productionInput.selected_idea.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{productionInput.selected_idea.core_tension}</p>
                        <p className="text-sm text-success italic mt-2">"{productionInput.selected_idea.scroll_stopper}"</p>
                        <div className="flex gap-2 mt-3">
                            <Badge variant="outline" className="text-xs">{productionInput.selected_idea.target_audience}</Badge>
                            {productionInput.selected_idea.monetization?.affiliate_angle && (
                                <Badge variant="outline" className="text-xs bg-green-50">
                                    {productionInput.selected_idea.monetization.affiliate_angle}
                                </Badge>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Research Summary */}
            {productionInput?.research && (
                <Card className="border-blue-200 bg-info/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-900">Research Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Badge variant={productionInput.research.validation?.verified ? "default" : "destructive"} className="text-xs">
                                {productionInput.research.validation?.verified ? "✓ Verified" : "✗ Unverified"}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                                Evidence: {productionInput.research.validation?.evidence_strength}
                            </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{productionInput.research.summary}</p>
                        {productionInput.research.key_statistics && productionInput.research.key_statistics.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                                <strong>Key Stats:</strong> {productionInput.research.key_statistics.map(s => s.figure).join(", ")}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <Tabs value={workflowTab} onValueChange={(v) => setWorkflowTab(v as "input" | "core" | "output" | "edit" | "assets")}>
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="input">1. Setup</TabsTrigger>
                    <TabsTrigger value="core">2. Core</TabsTrigger>
                    <TabsTrigger value="output">3. Output</TabsTrigger>
                    <TabsTrigger
                        value="edit"
                        className="gap-2"
                        disabled={!selectedContentTypes.blog}
                        title={!selectedContentTypes.blog ? "Select Blog Post in Setup to enable" : undefined}
                    >
                        <Edit3 className="h-4 w-4" />
                        4. Edit
                    </TabsTrigger>
                    <TabsTrigger value="assets" className="gap-2">
                        <Image className="h-4 w-4" />
                        5. Assets
                    </TabsTrigger>
                </TabsList>

                {/* INPUT TAB */}
                <TabsContent value="input" className="space-y-4 mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Production Input Summary</CardTitle>
                            <CardDescription className="text-xs">
                                The production agent will receive the selected idea and research data from previous stages
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!productionInput?.selected_idea && !productionInput?.research ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <p>No data from previous stages yet.</p>
                                    <p className="text-xs mt-2">Complete Brainstorm and Research stages first, or the data will be fetched automatically.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {productionInput?.selected_idea && (
                                        <div className="p-3 bg-muted rounded-lg">
                                            <h4 className="font-medium text-sm">Selected Idea</h4>
                                            <p className="text-sm text-muted-foreground">{productionInput.selected_idea.title}</p>
                                        </div>
                                    )}
                                    {productionInput?.research && (
                                        <div className="p-3 bg-muted rounded-lg">
                                            <h4 className="font-medium text-sm">Research</h4>
                                            <p className="text-sm text-muted-foreground">
                                                {productionInput.research.key_sources?.length || 0} sources, {productionInput.research.key_statistics?.length || 0} statistics, {productionInput.research.expert_quotes?.length || 0} quotes
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Content Type Selection */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Content Types to Generate</CardTitle>
                            <CardDescription className="text-xs">
                                Select which content types the AI should produce. Selecting fewer types gives more focused results.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                    { key: "blog", label: "Blog Post", icon: FileText, description: "Long-form article" },
                                    { key: "video", label: "Video Script", icon: Video, description: "YouTube video" },
                                    { key: "shorts", label: "Shorts", icon: Zap, description: "3 short videos" },
                                    { key: "podcast", label: "Podcast", icon: Mic, description: "Episode script" },
                                ].map(({ key, label, icon: Icon, description }) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setSelectedContentTypes(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                                        className={`p-3 rounded-lg border-2 transition-all text-left ${selectedContentTypes[key as keyof typeof selectedContentTypes]
                                            ? "border-green-500 bg-green-50"
                                            : "border-border hover:border-border"
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Icon className={`h-4 w-4 ${selectedContentTypes[key as keyof typeof selectedContentTypes] ? "text-success" : "text-muted-foreground"}`} />
                                            <span className="font-medium text-sm">{label}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{description}</p>
                                    </button>
                                ))}
                            </div>
                            {Object.values(selectedContentTypes).every(v => !v) && (
                                <p className="text-xs text-red-500 mt-2">Select at least one content type</p>
                            )}
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button
                            onClick={handleGenerateYaml}
                            disabled={!productionInput?.selected_idea || Object.values(selectedContentTypes).every(v => !v)}
                            className="gap-2"
                        >
                            Proceed to Core
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </TabsContent>

                {/* CORE TAB */}
                <TabsContent value="core" className="space-y-4 mt-4">
                    <Tabs value={coreSubTab} onValueChange={(v) => setCoreSubTab(v as "agent-input" | "paste-edit" | "format-inputs")}>
                        <TabsList className={`grid w-full ${savedCoreId ? "grid-cols-3" : "grid-cols-2"}`}>
                            <TabsTrigger value="agent-input">1. Agent 3a Input</TabsTrigger>
                            <TabsTrigger value="paste-edit">2. Paste &amp; Edit Core</TabsTrigger>
                            {savedCoreId && <TabsTrigger value="format-inputs">3. Format Inputs</TabsTrigger>}
                        </TabsList>

                        {/* Sub-tab 1: Agent 3a Input YAML */}
                        <TabsContent value="agent-input" className="mt-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-sm font-medium">BC_CANONICAL_CORE_INPUT</CardTitle>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => copyText(formToCoreInputYaml(), "Input YAML")}
                                            className="gap-2"
                                        >
                                            <Copy className="h-4 w-4" />
                                            Copy
                                        </Button>
                                    </div>
                                    <CardDescription className="text-xs">
                                        Copy this YAML and paste it into Agent 3a (Content Core Agent) to generate the canonical core.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto border">
                                        {formToCoreInputYaml()}
                                    </pre>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Sub-tab 2: Paste & Edit Core */}
                        <TabsContent value="paste-edit" className="mt-4 space-y-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-medium">Paste Agent 3a Output (BC_CANONICAL_CORE)</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <Textarea
                                        value={coreAiResponse}
                                        onChange={(e) => setCoreAiResponse(e.target.value)}
                                        placeholder="Paste the Agent 3a BC_CANONICAL_CORE YAML here..."
                                        className="min-h-[150px] font-mono text-sm"
                                    />
                                    {coreParseError && (
                                        <div className="flex items-center gap-2 text-red-600 text-sm">
                                            <AlertCircle className="h-4 w-4" />
                                            {coreParseError}
                                        </div>
                                    )}
                                    <Button onClick={parseCanonicalCore} disabled={!coreAiResponse.trim()} className="gap-2">
                                        <ArrowRight className="h-4 w-4" />
                                        Parse Core
                                    </Button>
                                </CardContent>
                            </Card>

                            {canonicalCore && (
                                <CanonicalCoreEditor
                                    value={canonicalCore}
                                    onChange={setCanonicalCore}
                                    onSave={async (core: CanonicalCore) => {
                                        const newCore = core as CanonicalCoreInput;
                                        setCanonicalCore(newCore);
                                        await handleSaveCore(newCore);
                                    }}
                                    saving={savingCore}
                                />
                            )}

                            {savedCoreId && (
                                <div className="flex items-center gap-2 text-sm text-green-700 pt-2">
                                    <CheckCircle className="h-4 w-4 text-success" />
                                    Core saved! Switch to "3. Format Inputs" to generate per-format agent inputs.
                                </div>
                            )}
                        </TabsContent>

                        {/* Sub-tab 3: Format Inputs (only visible after save) */}
                        {savedCoreId && canonicalCore && (
                            <TabsContent value="format-inputs" className="mt-4 space-y-4">
                                {[
                                    {
                                        key: "blog",
                                        label: "Blog (Agent 3b-Blog)",
                                        icon: FileText,
                                        getYaml: () => yaml.dump({ BC_BLOG_INPUT: mapCanonicalCoreToBlogInput(canonicalCoreSchema.parse(canonicalCore)) }, { lineWidth: -1 }),
                                    },
                                    {
                                        key: "video",
                                        label: "Video (Agent 3b-Video)",
                                        icon: Video,
                                        getYaml: () => yaml.dump({ BC_VIDEO_INPUT: mapCanonicalCoreToVideoInput(canonicalCoreSchema.parse(canonicalCore), videoStyleConfig) }, { lineWidth: -1 }),
                                    },
                                    {
                                        key: "shorts",
                                        label: "Shorts (Agent 3b-Shorts)",
                                        icon: Zap,
                                        getYaml: () => yaml.dump({ BC_SHORTS_INPUT: mapCanonicalCoreToShortsInput(canonicalCoreSchema.parse(canonicalCore)) }, { lineWidth: -1 }),
                                    },
                                    {
                                        key: "podcast",
                                        label: "Podcast (Agent 3b-Podcast)",
                                        icon: Mic,
                                        getYaml: () => yaml.dump({ BC_PODCAST_INPUT: mapCanonicalCoreToPodcastInput(canonicalCoreSchema.parse(canonicalCore)) }, { lineWidth: -1 }),
                                    },
                                    {
                                        key: "engagement",
                                        label: "Engagement (Agent 3b-Engagement)",
                                        icon: MessageSquare,
                                        getYaml: () => yaml.dump({ BC_ENGAGEMENT_INPUT: mapCanonicalCoreToEngagementInput(canonicalCoreSchema.parse(canonicalCore)) }, { lineWidth: -1 }),
                                    },
                                ].map(({ key, label, icon: Icon, getYaml }) => {
                                    const inputYaml = getYaml();
                                    const agentSlug = `production-${key}`;
                                    return (
                                        <Card key={key}>
                                            <CardHeader className="pb-3">
                                                <div className="flex items-center justify-between">
                                                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                                                        <Icon className="h-4 w-4" />
                                                        {label}
                                                    </CardTitle>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => copyText(inputYaml, label)}
                                                        className="gap-2"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                        Copy
                                                    </Button>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                <AgentPromptViewer stage={agentSlug} />
                                                {key === "video" && (
                                                    <VideoStyleSelector
                                                        value={videoStyleConfig}
                                                        onChange={setVideoStyleConfig}
                                                    />
                                                )}
                                                <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto border">
                                                    {inputYaml}
                                                </pre>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </TabsContent>
                        )}
                    </Tabs>
                </TabsContent>

                {/* OUTPUT TAB */}
                <TabsContent value="output" className="space-y-6 mt-4">
                    {!canonicalCore && (
                        <Card className="border-amber-200 bg-amber-50/50">
                            <CardContent className="py-3 flex items-center gap-2 text-amber-700 text-sm">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                Complete the <strong>2. Core</strong> tab first to get per-format input YAMLs. You can still paste agent outputs below.
                            </CardContent>
                        </Card>
                    )}

                    {/* Per-format tabs: paste agent output + review result */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">Paste Agent Output &amp; Review</CardTitle>
                            <CardDescription className="text-xs">
                                For each format: copy the Input YAML from the Core tab, run the corresponding agent, then paste the output here.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {(() => {
                                const activeFormats: { key: "blog" | "video" | "shorts" | "podcast" | "engagement"; label: string; icon: React.ElementType }[] = [
                                    ...(selectedContentTypes.blog ? [{ key: "blog" as const, label: "Blog", icon: FileText }] : []),
                                    ...(selectedContentTypes.video ? [{ key: "video" as const, label: "Video", icon: Video }] : []),
                                    ...(selectedContentTypes.shorts ? [{ key: "shorts" as const, label: "Shorts", icon: Zap }] : []),
                                    ...(selectedContentTypes.podcast ? [{ key: "podcast" as const, label: "Podcast", icon: Mic }] : []),
                                    { key: "engagement" as const, label: "Engage", icon: MessageSquare },
                                ];
                                return (
                                    <Tabs value={contentTab} onValueChange={(v) => setContentTab(v as "blog" | "video" | "shorts" | "podcast" | "engagement")}>
                                        <TabsList style={{ gridTemplateColumns: `repeat(${activeFormats.length}, minmax(0, 1fr))` }} className="grid w-full">
                                            {activeFormats.map(({ key, label, icon: Icon }) => (
                                                <TabsTrigger key={key} value={key} className="gap-1">
                                                    <Icon className="h-3.5 w-3.5" />
                                                    {label}
                                                    {(key === "shorts" ? (parsedContent?.shorts?.length ?? 0) > 0 : !!parsedContent?.[key as keyof ProductionOutput]) && (
                                                        <CheckCircle className="h-3 w-3 text-success" />
                                                    )}
                                                </TabsTrigger>
                                            ))}
                                        </TabsList>

                                        {/* BLOG TAB */}
                                        <TabsContent value="blog" className="mt-4 space-y-4">
                                            {/* Input reference */}
                                            {canonicalCore && (
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-xs text-muted-foreground">BC_BLOG_INPUT (reference)</Label>
                                                        <Button variant="ghost" size="sm" onClick={() => copyText(getFormatInputYaml("blog"), "Blog input")}>
                                                            <Copy className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                    <pre className="bg-amber-50 p-2 rounded text-xs font-mono overflow-x-auto max-h-28 overflow-y-auto border border-amber-200">{getFormatInputYaml("blog")}</pre>
                                                </div>
                                            )}
                                            {/* Paste + parse */}
                                            <Textarea
                                                value={formatResponses["blog"] ?? ""}
                                                onChange={(e) => setFormatResponses(prev => ({ ...prev, blog: e.target.value }))}
                                                placeholder="Paste BC_BLOG_OUTPUT YAML from Agent 3b-Blog here..."
                                                className="min-h-[120px] font-mono text-sm"
                                            />
                                            {formatParseErrors["blog"] && (
                                                <div className="flex items-center gap-2 text-red-600 text-sm">
                                                    <AlertCircle className="h-4 w-4" />
                                                    {formatParseErrors["blog"]}
                                                </div>
                                            )}
                                            <Button size="sm" onClick={() => parseFormatOutput("blog", formatResponses["blog"] ?? "")} disabled={!formatResponses["blog"]?.trim()} className="gap-2">
                                                <ArrowRight className="h-4 w-4" />
                                                Parse Blog Output
                                            </Button>
                                            {/* Result */}
                                            {parsedContent?.blog && (
                                                <div className="space-y-3 pt-3 border-t">
                                                    <div className="flex items-center gap-2 text-sm text-green-700">
                                                        <CheckCircle className="h-4 w-4" />
                                                        Blog parsed successfully
                                                    </div>
                                                    <div><Label className="text-xs text-muted-foreground">Title</Label><p className="font-semibold">{parsedContent.blog.title}</p></div>
                                                    <div><Label className="text-xs text-muted-foreground">Slug</Label><p className="text-sm font-mono">{parsedContent.blog.slug}</p></div>
                                                    <div><Label className="text-xs text-muted-foreground">Meta</Label><p className="text-sm">{parsedContent.blog.meta_description}</p></div>
                                                    {parsedContent.blog.outline && (
                                                        <div>
                                                            <Label className="text-xs text-muted-foreground">Outline</Label>
                                                            <ul className="text-sm list-disc list-inside mt-1">
                                                                {parsedContent.blog.outline.map((s: any, i: number) => <li key={i}>{s.h2}</li>)}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {parsedContent.blog.full_draft && (
                                                        <div>
                                                            <Label className="text-xs text-muted-foreground">Full Draft</Label>
                                                            <div className="mt-1 p-3 bg-muted rounded-md max-h-64 overflow-y-auto">
                                                                <pre className="text-sm whitespace-pre-wrap">{parsedContent.blog.full_draft}</pre>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </TabsContent>

                                        {/* VIDEO TAB */}
                                        <TabsContent value="video" className="mt-4 space-y-4">
                                            {canonicalCore && (
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-xs text-muted-foreground">BC_VIDEO_INPUT (reference)</Label>
                                                        <Button variant="ghost" size="sm" onClick={() => copyText(getFormatInputYaml("video"), "Video input")}>
                                                            <Copy className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                    <pre className="bg-amber-50 p-2 rounded text-xs font-mono overflow-x-auto max-h-28 overflow-y-auto border border-amber-200">{getFormatInputYaml("video")}</pre>
                                                </div>
                                            )}
                                            <Textarea
                                                value={formatResponses["video"] ?? ""}
                                                onChange={(e) => setFormatResponses(prev => ({ ...prev, video: e.target.value }))}
                                                placeholder="Paste BC_VIDEO_OUTPUT YAML from Agent 3b-Video here..."
                                                className="min-h-[120px] font-mono text-sm"
                                            />
                                            {formatParseErrors["video"] && (
                                                <div className="flex items-center gap-2 text-red-600 text-sm">
                                                    <AlertCircle className="h-4 w-4" />
                                                    {formatParseErrors["video"]}
                                                </div>
                                            )}
                                            <Button size="sm" onClick={() => parseFormatOutput("video", formatResponses["video"] ?? "")} disabled={!formatResponses["video"]?.trim()} className="gap-2">
                                                <ArrowRight className="h-4 w-4" />
                                                Parse Video Output
                                            </Button>
                                            {parsedContent?.video && (
                                                <div className="space-y-3 pt-3 border-t">
                                                    {savedVideoId && (
                                                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                                                            <Library className="h-4 w-4 text-success" />
                                                            <span className="text-sm text-green-700">Video saved to library!</span>
                                                        </div>
                                                    )}
                                                    <VideoPreview
                                                        video={parsedContent.video}
                                                        videoTitle={parsedContent.video.title_options?.[0]}
                                                        onSave={savingVideo ? undefined : handleVideoSave}
                                                        onExportMarkdown={savedVideoId ? () => handleVideoExport("markdown") : undefined}
                                                        onExportHtml={savedVideoId ? () => handleVideoExport("html") : undefined}
                                                        onExportTeleprompter={savedVideoId ? () => handleVideoExport("teleprompter") : undefined}
                                                    />
                                                    {savingVideo && <p className="text-xs text-muted-foreground">Saving video...</p>}
                                                </div>
                                            )}
                                        </TabsContent>

                                        {/* SHORTS TAB */}
                                        <TabsContent value="shorts" className="mt-4 space-y-4">
                                            {canonicalCore && (
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-xs text-muted-foreground">BC_SHORTS_INPUT (reference)</Label>
                                                        <Button variant="ghost" size="sm" onClick={() => copyText(getFormatInputYaml("shorts"), "Shorts input")}>
                                                            <Copy className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                    <pre className="bg-amber-50 p-2 rounded text-xs font-mono overflow-x-auto max-h-28 overflow-y-auto border border-amber-200">{getFormatInputYaml("shorts")}</pre>
                                                </div>
                                            )}
                                            <Textarea
                                                value={formatResponses["shorts"] ?? ""}
                                                onChange={(e) => setFormatResponses(prev => ({ ...prev, shorts: e.target.value }))}
                                                placeholder="Paste BC_SHORTS_OUTPUT YAML from Agent 3b-Shorts here..."
                                                className="min-h-[120px] font-mono text-sm"
                                            />
                                            {formatParseErrors["shorts"] && (
                                                <div className="flex items-center gap-2 text-red-600 text-sm">
                                                    <AlertCircle className="h-4 w-4" />
                                                    {formatParseErrors["shorts"]}
                                                </div>
                                            )}
                                            <Button size="sm" onClick={() => parseFormatOutput("shorts", formatResponses["shorts"] ?? "")} disabled={!formatResponses["shorts"]?.trim()} className="gap-2">
                                                <ArrowRight className="h-4 w-4" />
                                                Parse Shorts Output
                                            </Button>
                                            {(parsedContent?.shorts?.length ?? 0) > 0 && (
                                                <div className="space-y-3 pt-3 border-t">
                                                    <div className="flex items-center justify-between">
                                                        {savedShortsId && (
                                                            <div className="flex items-center gap-2 text-sm text-green-700">
                                                                <Library className="h-4 w-4 text-success" />
                                                                Shorts saved to library!
                                                            </div>
                                                        )}
                                                        <Button size="sm" variant="outline" onClick={handleShortsSave} disabled={savingShorts} className="ml-auto gap-2">
                                                            <Save className="h-4 w-4" />
                                                            {savingShorts ? "Saving..." : savedShortsId ? "Update in Library" : "Save to Library"}
                                                        </Button>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        {parsedContent!.shorts.map((short: ShortOutput, idx: number) => (
                                                            <div key={idx} className="p-3 border rounded-lg bg-gradient-to-b from-purple-50 to-white space-y-2">
                                                                <p className="text-xs text-muted-foreground">Short #{short.short_number || idx + 1}</p>
                                                                <h4 className="font-medium text-sm">{short.title}</h4>
                                                                <p className="text-xs"><span className="font-medium">Hook:</span> {short.hook}</p>
                                                                <p className="text-xs text-muted-foreground">{short.script}</p>
                                                                <div className="flex flex-wrap gap-1">
                                                                    <Badge variant="outline" className="text-xs">{short.duration}</Badge>
                                                                    <Badge variant="secondary" className="text-xs">{short.visual_style}</Badge>
                                                                </div>
                                                                {short.sound_effects && <div className="p-1.5 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800"><span className="font-semibold">SFX:</span> {short.sound_effects}</div>}
                                                                {short.background_music && <div className="p-1.5 bg-purple-50 border border-purple-200 rounded text-xs text-purple-800"><span className="font-semibold">Music:</span> {short.background_music}</div>}
                                                                {short.cta && <p className="text-xs font-medium text-blue-700">CTA: {short.cta}</p>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </TabsContent>

                                        {/* PODCAST TAB */}
                                        <TabsContent value="podcast" className="mt-4 space-y-4">
                                            {canonicalCore && (
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-xs text-muted-foreground">BC_PODCAST_INPUT (reference)</Label>
                                                        <Button variant="ghost" size="sm" onClick={() => copyText(getFormatInputYaml("podcast"), "Podcast input")}>
                                                            <Copy className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                    <pre className="bg-amber-50 p-2 rounded text-xs font-mono overflow-x-auto max-h-28 overflow-y-auto border border-amber-200">{getFormatInputYaml("podcast")}</pre>
                                                </div>
                                            )}
                                            <Textarea
                                                value={formatResponses["podcast"] ?? ""}
                                                onChange={(e) => setFormatResponses(prev => ({ ...prev, podcast: e.target.value }))}
                                                placeholder="Paste BC_PODCAST_OUTPUT YAML from Agent 3b-Podcast here..."
                                                className="min-h-[120px] font-mono text-sm"
                                            />
                                            {formatParseErrors["podcast"] && (
                                                <div className="flex items-center gap-2 text-red-600 text-sm">
                                                    <AlertCircle className="h-4 w-4" />
                                                    {formatParseErrors["podcast"]}
                                                </div>
                                            )}
                                            <Button size="sm" onClick={() => parseFormatOutput("podcast", formatResponses["podcast"] ?? "")} disabled={!formatResponses["podcast"]?.trim()} className="gap-2">
                                                <ArrowRight className="h-4 w-4" />
                                                Parse Podcast Output
                                            </Button>
                                            {parsedContent?.podcast && (
                                                <div className="space-y-3 pt-3 border-t">
                                                    <div><Label className="text-xs text-muted-foreground">Episode Title</Label><p className="font-semibold">{parsedContent.podcast.episode_title}</p></div>
                                                    <div><Label className="text-xs text-muted-foreground">Duration</Label><Badge variant="outline">{parsedContent.podcast.duration_estimate}</Badge></div>
                                                    <div><Label className="text-xs text-muted-foreground">Description</Label><p className="text-sm text-muted-foreground">{parsedContent.podcast.episode_description}</p></div>
                                                    <div><Label className="text-xs text-muted-foreground">Intro Hook</Label><p className="text-sm bg-muted p-2 rounded">{parsedContent.podcast.intro_hook}</p></div>
                                                    {parsedContent.podcast.talking_points?.length > 0 && (
                                                        <div>
                                                            <Label className="text-xs text-muted-foreground">Talking Points</Label>
                                                            <ul className="text-sm mt-1 space-y-2">
                                                                {parsedContent.podcast.talking_points.map((item, idx: number) => (
                                                                    <li key={idx} className="p-2 bg-muted rounded">
                                                                        <p className="font-medium">{item.point}</p>
                                                                        <p className="text-xs text-muted-foreground">{item.notes}</p>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {parsedContent.podcast.personal_angle && <div><Label className="text-xs text-muted-foreground">Personal Angle</Label><p className="text-sm bg-muted p-2 rounded">{parsedContent.podcast.personal_angle}</p></div>}
                                                    <div><Label className="text-xs text-muted-foreground">Outro</Label><p className="text-sm bg-blue-50 p-2 rounded">{parsedContent.podcast.outro}</p></div>
                                                    <div className="flex items-center justify-between pt-2 border-t">
                                                        {savedPodcastId && <div className="flex items-center gap-2 text-sm text-green-700"><Library className="h-4 w-4 text-success" />Podcast saved!</div>}
                                                        <Button size="sm" variant="outline" onClick={handlePodcastSave} disabled={savingPodcast} className="ml-auto gap-2">
                                                            <Save className="h-4 w-4" />
                                                            {savingPodcast ? "Saving..." : savedPodcastId ? "Update in Library" : "Save to Library"}
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </TabsContent>

                                        {/* ENGAGEMENT TAB */}
                                        <TabsContent value="engagement" className="mt-4 space-y-4">
                                            {canonicalCore && (
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-xs text-muted-foreground">BC_ENGAGEMENT_INPUT (reference)</Label>
                                                        <Button variant="ghost" size="sm" onClick={() => copyText(getFormatInputYaml("engagement"), "Engagement input")}>
                                                            <Copy className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                    <pre className="bg-amber-50 p-2 rounded text-xs font-mono overflow-x-auto max-h-28 overflow-y-auto border border-amber-200">{getFormatInputYaml("engagement")}</pre>
                                                </div>
                                            )}
                                            <Textarea
                                                value={formatResponses["engagement"] ?? ""}
                                                onChange={(e) => setFormatResponses(prev => ({ ...prev, engagement: e.target.value }))}
                                                placeholder="Paste BC_ENGAGEMENT_OUTPUT YAML from Agent 3b-Engagement here..."
                                                className="min-h-[120px] font-mono text-sm"
                                            />
                                            {formatParseErrors["engagement"] && (
                                                <div className="flex items-center gap-2 text-red-600 text-sm">
                                                    <AlertCircle className="h-4 w-4" />
                                                    {formatParseErrors["engagement"]}
                                                </div>
                                            )}
                                            <Button size="sm" onClick={() => parseFormatOutput("engagement", formatResponses["engagement"] ?? "")} disabled={!formatResponses["engagement"]?.trim()} className="gap-2">
                                                <ArrowRight className="h-4 w-4" />
                                                Parse Engagement Output
                                            </Button>
                                            {parsedContent?.engagement && (
                                                <div className="space-y-3 pt-3 border-t">
                                                    <Card>
                                                        <CardHeader className="pb-2">
                                                            <div className="flex items-center justify-between">
                                                                <CardTitle className="text-sm font-medium">Pinned Comment</CardTitle>
                                                                <Button variant="outline" size="sm" onClick={() => copyText(parsedContent.engagement?.pinned_comment ?? "", "Pinned comment")} className="gap-2"><Copy className="h-4 w-4" />Copy</Button>
                                                            </div>
                                                        </CardHeader>
                                                        <CardContent>
                                                            <p className="text-sm bg-muted p-3 rounded">{parsedContent.engagement.pinned_comment}</p>
                                                            <p className="text-xs text-muted-foreground mt-1">{parsedContent.engagement.pinned_comment.length} / 500 chars</p>
                                                        </CardContent>
                                                    </Card>
                                                    <Card>
                                                        <CardHeader className="pb-2">
                                                            <div className="flex items-center justify-between">
                                                                <CardTitle className="text-sm font-medium">Community Post</CardTitle>
                                                                <Button variant="outline" size="sm" onClick={() => copyText(parsedContent.engagement?.community_post ?? "", "Community post")} className="gap-2"><Copy className="h-4 w-4" />Copy</Button>
                                                            </div>
                                                        </CardHeader>
                                                        <CardContent>
                                                            <pre className="text-sm bg-muted p-3 rounded whitespace-pre-wrap">{parsedContent.engagement.community_post}</pre>
                                                        </CardContent>
                                                    </Card>
                                                    <Card>
                                                        <CardHeader className="pb-2">
                                                            <div className="flex items-center justify-between">
                                                                <CardTitle className="text-sm font-medium">Twitter Thread</CardTitle>
                                                                <Button variant="outline" size="sm" onClick={() => copyText([parsedContent.engagement?.twitter_thread.hook_tweet, ...(parsedContent.engagement?.twitter_thread.thread_outline ?? [])].join("\n\n---\n\n"), "Twitter thread")} className="gap-2"><Copy className="h-4 w-4" />Copy All</Button>
                                                            </div>
                                                        </CardHeader>
                                                        <CardContent className="space-y-2">
                                                            <div className="p-3 bg-blue-50 rounded border border-blue-200">
                                                                <p className="text-xs font-medium text-blue-700 mb-1">Hook Tweet</p>
                                                                <p className="text-sm">{parsedContent.engagement.twitter_thread.hook_tweet}</p>
                                                            </div>
                                                            {parsedContent.engagement.twitter_thread.thread_outline.map((tweet, idx) => (
                                                                <div key={idx} className="p-3 bg-muted rounded border">
                                                                    <p className="text-xs font-medium text-muted-foreground mb-1">Tweet {idx + 2}</p>
                                                                    <p className="text-sm">{tweet}</p>
                                                                </div>
                                                            ))}
                                                        </CardContent>
                                                    </Card>
                                                </div>
                                            )}
                                        </TabsContent>
                                    </Tabs>
                                );
                            })()}
                        </CardContent>
                    </Card>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={handleSaveProgress} disabled={saving}>
                            {saving ? "Saving..." : "Save Progress"}
                        </Button>
                        <Button
                            onClick={() => setWorkflowTab("edit")}
                            disabled={!parsedContent?.blog}
                            variant="outline"
                            className="gap-2"
                        >
                            <Edit3 className="h-4 w-4" />
                            Edit Blog Draft
                        </Button>
                        <Button
                            onClick={handleComplete}
                            disabled={saving || !parsedContent}
                            className="gap-2"
                        >
                            Complete &amp; Continue to Review
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </TabsContent>

                {/* EDIT BLOG TAB */}
                <TabsContent value="edit" className="space-y-4 mt-4">
                    {parsedContent?.blog ? (
                        <>
                            {savedBlogId && (
                                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                                    <Library className="h-4 w-4 text-success" />
                                    <span className="text-sm text-green-700">
                                        Blog saved to library! You can access it from the Blog Library page.
                                    </span>
                                </div>
                            )}

                            <BlogEditor
                                initialBlog={parsedContent.blog}
                                researchContext={productionInput?.research ? {
                                    key_statistics: productionInput.research.key_statistics,
                                    expert_quotes: productionInput.research.expert_quotes,
                                    key_sources: productionInput.research.key_sources,
                                } : undefined}
                                onSave={(blog) => handleBlogSave(blog)}
                                onPreview={() => setShowPreview(true)}
                                saving={savingBlog}
                            />

                            {/* Preview Dialog */}
                            <Dialog open={showPreview} onOpenChange={setShowPreview}>
                                <DialogContent className="!max-w-4xl max-h-[90vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle>Blog Preview</DialogTitle>
                                        <DialogDescription>
                                            Preview how your blog will appear when published
                                        </DialogDescription>
                                    </DialogHeader>
                                    <BlogPreview blog={parsedContent.blog} />
                                </DialogContent>
                            </Dialog>
                        </>
                    ) : (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <Edit3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                                <h3 className="font-semibold mb-2">No Blog Content Yet</h3>
                                <p className="text-muted-foreground text-sm mb-4">
                                    Generate content in the AI Content Output tab first to edit your blog draft.
                                </p>
                                <Button
                                    variant="outline"
                                    onClick={() => setWorkflowTab("output")}
                                >
                                    Go to Content Output
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* ASSETS TAB */}
                <TabsContent value="assets" className="space-y-6 mt-4">
                    {projectId ? (
                        <>
                            {/* Content-type tabs within assets */}
                            {selectedContentTypes.blog && contentTab === "blog" && (
                                <AssetsTabBlog
                                    projectId={projectId}
                                    blogDraft={parsedContent?.blog ?? null}
                                    blogDraftId={savedBlogId}
                                />
                            )}
                            {selectedContentTypes.video && contentTab === "video" && (
                                <AssetsTabVideo
                                    projectId={projectId}
                                    videoDraft={parsedContent?.video ?? null}
                                    videoDraftId={savedVideoId}
                                />
                            )}
                            {contentTab !== "blog" && contentTab !== "video" && (
                                <Card>
                                    <CardContent className="py-10 text-center text-muted-foreground text-sm">
                                        Switch to the Blog or Video tab above to generate image assets.
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    ) : (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <Image className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                                <h3 className="font-semibold mb-2">Project Required</h3>
                                <p className="text-muted-foreground text-sm">
                                    Save this production stage to a project first to generate image assets.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
