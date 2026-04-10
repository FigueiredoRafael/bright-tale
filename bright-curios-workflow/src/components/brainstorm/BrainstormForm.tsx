"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import yaml from "js-yaml";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import AgentPromptViewer from "@/components/agents/AgentPromptViewer";
import IdeaLibraryPicker from "@/components/ideas/IdeaLibraryPicker";
import { Copy, Check, ArrowRight, Sparkles, AlertCircle, Library, Save, Pencil, X, Lightbulb } from "lucide-react";
import type { BrainstormIdea, BrainstormOutput, LegacyIdea } from "@/types/agents";
import { normalizeLegacyIdea, isLegacyIdea } from "@/types/agents";

// Form schema matching BC_BRAINSTORM_INPUT
const formSchema = z.object({
    theme_primary: z.string().min(1, "Theme is required"),
    theme_subthemes: z.string().optional(),
    goal: z.enum(["growth", "engagement", "monetization", "authority"]),
    recent_winners: z.string().optional(),
    recent_losers: z.string().optional(),
    avoid_topics: z.string().optional(),
    required_formats: z.string().optional(),
    evergreen_pct: z.number().min(0).max(100),
    seasonal_pct: z.number().min(0).max(100),
    trending_pct: z.number().min(0).max(100),
    ideas_requested: z.number().min(1).max(10),
});

type FormData = z.infer<typeof formSchema>;

// LibraryIdea interface for picking from library
interface LibraryIdea {
    id: string;
    idea_id: string;
    title: string;
    core_tension: string;
    target_audience: string;
    verdict: string;
    source_type: string;
    tags: string[];
    usage_count: number;
    created_at: string;
    discovery_data?: string;
}

interface BrainstormFormProps {
    initialYaml?: string;
    onSave: (yamlContent: string) => void;
    onComplete: (yamlContent: string) => void;
    onSelectIdea?: (idea: BrainstormIdea) => void;
    saving?: boolean;
}

export default function BrainstormForm({
    initialYaml,
    onSave,
    onComplete,
    onSelectIdea,
    saving,
}: BrainstormFormProps) {
    const [activeTab, setActiveTab] = useState<"input" | "output">("input");
    const [generatedYaml, setGeneratedYaml] = useState("");
    const [aiResponse, setAiResponse] = useState("");
    const [parsedIdeas, setParsedIdeas] = useState<BrainstormIdea[]>([]);
    const [selectedIdea, setSelectedIdea] = useState<BrainstormIdea | null>(null);
    const [recommendation, setRecommendation] = useState<{ pick: string; rationale: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);

    // Library and editing features
    const [savingToLibrary, setSavingToLibrary] = useState(false);
    const [librarySaveStatus, setLibrarySaveStatus] = useState<{ success: boolean; message: string } | null>(null);
    const [editingIdea, setEditingIdea] = useState<BrainstormIdea | null>(null);
    const [editForm, setEditForm] = useState<Partial<BrainstormIdea>>({});
    const [selectedFromLibrary, setSelectedFromLibrary] = useState(false);

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        getValues,
        formState: { errors },
    } = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            theme_primary: "",
            theme_subthemes: "",
            goal: "growth",
            recent_winners: "",
            recent_losers: "",
            avoid_topics: "",
            required_formats: "blog, video",
            evergreen_pct: 70,
            seasonal_pct: 20,
            trending_pct: 10,
            ideas_requested: 5,
        },
    });

    const goal = watch("goal");

    // Parse initial YAML and populate form
    useEffect(() => {
        if (initialYaml) {
            try {
                const parsed = yaml.load(initialYaml) as Record<string, unknown>;
                if (parsed) {
                    // Handle BC_BRAINSTORM_INPUT format
                    const input = (parsed.BC_BRAINSTORM_INPUT || parsed) as Record<string, unknown>;

                    // Handle theme field
                    if (input.theme) {
                        const theme = input.theme as Record<string, unknown>;
                        if (theme.primary) setValue("theme_primary", String(theme.primary));
                        if (Array.isArray(theme.subthemes)) setValue("theme_subthemes", theme.subthemes.join(", "));
                    }
                    // Legacy: handle old topic field
                    if (input.topic) setValue("theme_primary", String(input.topic));

                    if (input.goal) setValue("goal", input.goal as FormData["goal"]);

                    // Handle performance_context
                    if (input.performance_context) {
                        const pc = input.performance_context as Record<string, unknown>;
                        if (Array.isArray(pc.recent_winners)) setValue("recent_winners", pc.recent_winners.join("\n"));
                        if (Array.isArray(pc.recent_losers)) setValue("recent_losers", pc.recent_losers.join("\n"));
                    }

                    // Handle constraints
                    if (input.constraints) {
                        const c = input.constraints as Record<string, unknown>;
                        if (Array.isArray(c.avoid_topics)) setValue("avoid_topics", c.avoid_topics.join(", "));
                        if (Array.isArray(c.required_formats)) setValue("required_formats", c.required_formats.join(", "));
                    }

                    // Handle temporal_mix
                    if (input.temporal_mix) {
                        const tm = input.temporal_mix as Record<string, unknown>;
                        if (typeof tm.evergreen_pct === "number") setValue("evergreen_pct", tm.evergreen_pct);
                        if (typeof tm.seasonal_pct === "number") setValue("seasonal_pct", tm.seasonal_pct);
                        if (typeof tm.trending_pct === "number") setValue("trending_pct", tm.trending_pct);
                    }

                    if (typeof input.ideas_requested === "number") setValue("ideas_requested", input.ideas_requested);

                    if (parsed.ai_response_raw) {
                        setAiResponse(String(parsed.ai_response_raw));
                    }

                    // Handle existing ideas (with legacy format support)
                    if (parsed.ideas && Array.isArray(parsed.ideas)) {
                        const normalizedIdeas = parsed.ideas.map((idea: unknown) => {
                            if (isLegacyIdea(idea)) {
                                return normalizeLegacyIdea(idea as LegacyIdea);
                            }
                            return idea as BrainstormIdea;
                        });
                        setParsedIdeas(normalizedIdeas);
                        setActiveTab("output");
                    }

                    if (parsed.selected_idea) {
                        const selIdea = parsed.selected_idea as BrainstormIdea | LegacyIdea;
                        if (isLegacyIdea(selIdea)) {
                            setSelectedIdea(normalizeLegacyIdea(selIdea));
                        } else {
                            setSelectedIdea(selIdea as BrainstormIdea);
                        }
                    }

                    if (parsed.recommendation) {
                        setRecommendation(parsed.recommendation as { pick: string; rationale: string });
                    }
                }
            } catch {
                // Invalid YAML, ignore
            }
        }
    }, [initialYaml, setValue]);

    const formToYaml = (data: FormData): string => {
        const structured = {
            BC_BRAINSTORM_INPUT: {
                theme: {
                    primary: data.theme_primary,
                    subthemes: data.theme_subthemes?.split(",").map(s => s.trim()).filter(Boolean) || [],
                },
                goal: data.goal,
                performance_context: {
                    recent_winners: data.recent_winners?.split("\n").filter(Boolean) || [],
                    recent_losers: data.recent_losers?.split("\n").filter(Boolean) || [],
                },
                constraints: {
                    avoid_topics: data.avoid_topics?.split(",").map(s => s.trim()).filter(Boolean) || [],
                    required_formats: data.required_formats?.split(",").map(s => s.trim()).filter(Boolean) || [],
                },
                temporal_mix: {
                    evergreen_pct: data.evergreen_pct,
                    seasonal_pct: data.seasonal_pct,
                    trending_pct: data.trending_pct,
                },
                ideas_requested: data.ideas_requested,
            },
        };
        return yaml.dump(structured, { lineWidth: -1 });
    };

    const handleGenerateYaml = (data: FormData) => {
        const yamlContent = formToYaml(data);
        setGeneratedYaml(yamlContent);
        setActiveTab("output");
    };

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(generatedYaml);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const parseAiResponse = () => {
        setParseError(null);
        try {
            const parsed = yaml.load(aiResponse) as Record<string, unknown>;

            // Handle BC_BRAINSTORM_OUTPUT wrapper or direct format
            let ideas: unknown[] = [];
            let rec: { pick: string; rationale: string } | null = null;

            if (parsed?.BC_BRAINSTORM_OUTPUT) {
                const output = parsed.BC_BRAINSTORM_OUTPUT as Record<string, unknown>;
                ideas = (output.ideas as unknown[]) || [];
                rec = (output.recommendation as { pick: string; rationale: string }) || null;
            } else if (parsed?.ideas) {
                ideas = parsed.ideas as unknown[];
                rec = (parsed.recommendation as { pick: string; rationale: string }) || null;
            } else if (Array.isArray(parsed)) {
                ideas = parsed;
            }

            if (ideas.length === 0) {
                setParseError("No ideas found. Make sure the YAML contains BC_BRAINSTORM_OUTPUT.ideas or an ideas array.");
                return;
            }

            // Normalize any legacy format ideas
            const normalizedIdeas = ideas.map((idea: unknown) => {
                if (isLegacyIdea(idea)) {
                    return normalizeLegacyIdea(idea as LegacyIdea);
                }
                return idea as BrainstormIdea;
            });

            setParsedIdeas(normalizedIdeas);
            if (rec) setRecommendation(rec);
        } catch (err) {
            let errorMsg = "Failed to parse YAML:\n\n";

            if (err instanceof Error) {
                const yamlError = err.message;
                errorMsg += `Error: ${yamlError}\n\n`;

                const lineMatch = yamlError.match(/line (\d+)/i);
                if (lineMatch) {
                    const lineNum = parseInt(lineMatch[1]);
                    errorMsg += `Check line ${lineNum} in your YAML.\n\n`;
                }
            }

            errorMsg += "Common issues:\n";
            errorMsg += "• Em-dashes (—) instead of regular dashes (-)\n";
            errorMsg += "• Curly quotes instead of straight quotes\n";
            errorMsg += "• Using > instead of | for multi-line strings\n";
            errorMsg += "• Triple backticks (```) inside YAML blocks\n";
            errorMsg += "• Incorrect indentation (must be 2 spaces)";

            setParseError(errorMsg);
        }
    };

    const handleIdeaSelect = (idea: BrainstormIdea) => {
        setSelectedIdea(idea);
        setSelectedFromLibrary(false);
        onSelectIdea?.(idea);
    };

    const buildSaveData = () => {
        const values = getValues();
        return {
            BC_BRAINSTORM_INPUT: {
                theme: {
                    primary: values.theme_primary,
                    subthemes: values.theme_subthemes?.split(",").map((s: string) => s.trim()).filter(Boolean) || [],
                },
                goal: values.goal,
                performance_context: {
                    recent_winners: values.recent_winners?.split("\n").filter(Boolean) || [],
                    recent_losers: values.recent_losers?.split("\n").filter(Boolean) || [],
                },
                constraints: {
                    avoid_topics: values.avoid_topics?.split(",").map((s: string) => s.trim()).filter(Boolean) || [],
                    required_formats: values.required_formats?.split(",").map((s: string) => s.trim()).filter(Boolean) || [],
                },
                temporal_mix: {
                    evergreen_pct: values.evergreen_pct,
                    seasonal_pct: values.seasonal_pct,
                    trending_pct: values.trending_pct,
                },
                ideas_requested: values.ideas_requested,
            },
            ai_response_raw: aiResponse || undefined,
            ideas: parsedIdeas,
            selected_idea: selectedIdea,
            selected_from_library: selectedFromLibrary,
            recommendation: recommendation,
        };
    };

    const handleSaveProgress = () => {
        onSave(yaml.dump(buildSaveData()));
    };

    const handleComplete = () => {
        if (!selectedIdea) {
            setParseError("Please select an idea before continuing.");
            return;
        }
        onComplete(yaml.dump(buildSaveData()));
    };

    // Save all parsed ideas to the library
    const handleSaveToLibrary = async () => {
        if (parsedIdeas.length === 0) return;

        setSavingToLibrary(true);
        setLibrarySaveStatus(null);

        try {
            let savedCount = 0;
            const warnings: string[] = [];

            for (const idea of parsedIdeas) {
                const res = await fetch("/api/ideas/library", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: idea.title,
                        core_tension: idea.core_tension || "",
                        target_audience: idea.target_audience || "",
                        verdict: idea.verdict || "experimental",
                        source_type: "brainstorm",
                        discovery_data: yaml.dump(idea),
                    }),
                });

                const json = await res.json();
                if (res.ok) {
                    savedCount++;
                    if (json.data?.warnings?.length > 0) {
                        warnings.push(`"${idea.title}" may be similar to existing ideas`);
                    }
                }
            }

            setLibrarySaveStatus({
                success: true,
                message: `Saved ${savedCount}/${parsedIdeas.length} ideas to library.${warnings.length > 0 ? ` (${warnings.length} with warnings)` : ""}`,
            });
        } catch {
            setLibrarySaveStatus({
                success: false,
                message: "Failed to save ideas to library",
            });
        } finally {
            setSavingToLibrary(false);
        }
    };

    // Handle selecting an idea from the library
    const handleLibrarySelect = (libraryIdea: LibraryIdea) => {
        // Convert library idea to BrainstormIdea format
        const idea: BrainstormIdea = {
            idea_id: libraryIdea.idea_id || `LIB-${Date.now()}`,
            title: libraryIdea.title || "",
            core_tension: libraryIdea.core_tension || "",
            target_audience: libraryIdea.target_audience || "",
            search_intent: "informational",
            primary_keyword: {
                term: "",
                difficulty: "medium",
                monthly_volume_estimate: "unknown",
            },
            scroll_stopper: "",
            curiosity_gap: libraryIdea.core_tension || "",
            monetization: {
                affiliate_angle: "",
                product_fit: "",
                sponsor_appeal: "",
            },
            repurpose_potential: {
                blog_angle: "",
                video_angle: "",
                shorts_hooks: [],
                podcast_angle: "",
            },
            risk_flags: [],
            verdict: (libraryIdea.verdict as "viable" | "experimental" | "weak") || "experimental",
            verdict_rationale: "",
        };

        // Try to restore full idea data from discovery_data
        if (libraryIdea.discovery_data) {
            try {
                const fullData = yaml.load(libraryIdea.discovery_data) as Record<string, unknown>;
                Object.assign(idea, fullData);
            } catch {
                // Use basic data
            }
        }

        setSelectedIdea(idea);
        setSelectedFromLibrary(true);
        setParsedIdeas([idea]);
        setActiveTab("output");
        onSelectIdea?.(idea);

        // Populate INPUT form fields from the idea's data
        if (idea.primary_keyword?.term) {
            setValue("theme_primary", idea.primary_keyword.term);
        } else if (idea.title) {
            const words = idea.title.split(" ").slice(0, 4).join(" ");
            setValue("theme_primary", words);
        }
    };

    // Inline editing handlers
    const startEditing = (idea: BrainstormIdea) => {
        setEditingIdea(idea);
        setEditForm({ ...idea });
    };

    const cancelEditing = () => {
        setEditingIdea(null);
        setEditForm({});
    };

    const saveEditing = () => {
        if (!editingIdea) return;

        const updatedIdea = { ...editingIdea, ...editForm } as BrainstormIdea;

        // Update in parsedIdeas
        setParsedIdeas((prev) =>
            prev.map((i) => (i.idea_id === editingIdea.idea_id ? updatedIdea : i))
        );

        // Update selected if it was the one being edited
        if (selectedIdea?.idea_id === editingIdea.idea_id) {
            setSelectedIdea(updatedIdea);
        }

        setEditingIdea(null);
        setEditForm({});
    };

    // Get verdict badge color
    const getVerdictColor = (verdict: string) => {
        switch (verdict) {
            case "viable":
                return "bg-green-100 text-green-800 border-green-300";
            case "experimental":
                return "bg-yellow-100 text-yellow-800 border-yellow-300";
            case "weak":
                return "bg-red-100 text-red-800 border-red-300";
            default:
                return "bg-gray-100 text-gray-800 border-gray-300";
        }
    };

    return (
        <div className="space-y-6">
            {/* Agent Prompt Viewer */}
            <AgentPromptViewer stage="brainstorm" />

            {/* Quick Actions - Select from Library */}
            <Card className="border-dashed">
                <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium text-sm">Quick Start</h3>
                            <p className="text-xs text-muted-foreground">
                                Skip brainstorming by selecting an existing idea from your library
                            </p>
                        </div>
                        <IdeaLibraryPicker
                            onSelect={handleLibrarySelect}
                            trigger={
                                <Button variant="outline" className="gap-2">
                                    <Library className="h-4 w-4" />
                                    Select from Library
                                </Button>
                            }
                        />
                    </div>
                </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "input" | "output")}>
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="input">1. Input Form</TabsTrigger>
                    <TabsTrigger value="output">
                        2. AI Response
                    </TabsTrigger>
                </TabsList>

                {/* INPUT TAB - Form to generate YAML */}
                <TabsContent value="input" className="space-y-4 mt-4">
                    <form onSubmit={handleSubmit(handleGenerateYaml)} className="space-y-6">
                        {/* Theme Section */}
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium">Theme & Focus</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="theme_primary">Primary Theme *</Label>
                                        <Input
                                            id="theme_primary"
                                            {...register("theme_primary")}
                                            placeholder="e.g., psychology, productivity, science"
                                            className="mt-1"
                                        />
                                        {errors.theme_primary && (
                                            <p className="text-xs text-red-600 mt-1">{errors.theme_primary.message}</p>
                                        )}
                                    </div>
                                    <div>
                                        <Label htmlFor="goal">Strategic Goal</Label>
                                        <Select value={goal} onValueChange={(v) => setValue("goal", v as FormData["goal"])}>
                                            <SelectTrigger className="mt-1">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="growth">Growth (Views & Subscribers)</SelectItem>
                                                <SelectItem value="engagement">Engagement (Comments & Shares)</SelectItem>
                                                <SelectItem value="monetization">Monetization (Affiliate & Sponsors)</SelectItem>
                                                <SelectItem value="authority">Authority (Trust & Expertise)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="theme_subthemes">Subthemes (comma-separated)</Label>
                                    <Input
                                        id="theme_subthemes"
                                        {...register("theme_subthemes")}
                                        placeholder="e.g., habit formation, decision making, cognitive biases"
                                        className="mt-1"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Performance Context (Optional) */}
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium">Performance Context (Optional)</CardTitle>
                                <CardDescription className="text-xs">Help the agent learn from past content performance</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="recent_winners">Recent Winners (one per line)</Label>
                                        <Textarea
                                            id="recent_winners"
                                            {...register("recent_winners")}
                                            placeholder="Topics/titles that performed well"
                                            className="mt-1 min-h-[80px]"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="recent_losers">Recent Losers (one per line)</Label>
                                        <Textarea
                                            id="recent_losers"
                                            {...register("recent_losers")}
                                            placeholder="Topics/titles that underperformed"
                                            className="mt-1 min-h-[80px]"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Constraints & Output */}
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium">Constraints & Output</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="avoid_topics">Topics to Avoid (comma-separated)</Label>
                                        <Input
                                            id="avoid_topics"
                                            {...register("avoid_topics")}
                                            placeholder="e.g., politics, religion"
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="required_formats">Required Formats (comma-separated)</Label>
                                        <Input
                                            id="required_formats"
                                            {...register("required_formats")}
                                            placeholder="e.g., blog, video, shorts"
                                            className="mt-1"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-4 gap-4">
                                    <div>
                                        <Label htmlFor="ideas_requested">Ideas to Generate</Label>
                                        <Input
                                            id="ideas_requested"
                                            type="number"
                                            {...register("ideas_requested", { valueAsNumber: true })}
                                            min={1}
                                            max={10}
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="evergreen_pct">Evergreen %</Label>
                                        <Input
                                            id="evergreen_pct"
                                            type="number"
                                            {...register("evergreen_pct", { valueAsNumber: true })}
                                            min={0}
                                            max={100}
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="seasonal_pct">Seasonal %</Label>
                                        <Input
                                            id="seasonal_pct"
                                            type="number"
                                            {...register("seasonal_pct", { valueAsNumber: true })}
                                            min={0}
                                            max={100}
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="trending_pct">Trending %</Label>
                                        <Input
                                            id="trending_pct"
                                            type="number"
                                            {...register("trending_pct", { valueAsNumber: true })}
                                            min={0}
                                            max={100}
                                            className="mt-1"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="flex justify-end gap-2 pt-4 border-t">
                            <Button type="submit" className="gap-2">
                                <Sparkles className="h-4 w-4" />
                                Generate AI Prompt
                            </Button>
                        </div>
                    </form>
                </TabsContent>

                {/* OUTPUT TAB - Copy YAML, Paste AI Response, Select Ideas */}
                <TabsContent value="output" className="space-y-6 mt-4">
                    {/* Generated YAML to Copy */}
                    {generatedYaml && (
                        <Card className="border-green-200 bg-green-50/50">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-green-900">
                                        📋 Copy this to Brainstorm Agent
                                    </CardTitle>
                                    <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-2">
                                        {copied ? (
                                            <>
                                                <Check className="h-4 w-4 text-green-600" />
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
                                <pre className="bg-white p-3 rounded-md text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto border">
                                    {generatedYaml}
                                </pre>
                            </CardContent>
                        </Card>
                    )}

                    {/* Paste AI Response */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">
                                Paste AI Response (BC_BRAINSTORM_OUTPUT)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Textarea
                                value={aiResponse}
                                onChange={(e) => setAiResponse(e.target.value)}
                                placeholder="Paste the Brainstorm Agent's YAML response here..."
                                className="min-h-[150px] font-mono text-sm"
                            />
                            {parseError && (
                                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                                    <AlertCircle className="h-4 w-4" />
                                    {parseError}
                                </div>
                            )}
                            <Button onClick={parseAiResponse} disabled={!aiResponse.trim()} className="gap-2">
                                <ArrowRight className="h-4 w-4" />
                                Parse Ideas
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Recommendation Banner */}
                    {recommendation && (
                        <Card className="border-blue-200 bg-blue-50/50">
                            <CardContent className="py-4">
                                <div className="flex items-start gap-3">
                                    <Lightbulb className="h-5 w-5 text-blue-600 mt-0.5" />
                                    <div>
                                        <h4 className="font-medium text-blue-900">Agent Recommendation: {recommendation.pick}</h4>
                                        <p className="text-sm text-blue-700 mt-1">{recommendation.rationale}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Idea Selection Grid */}
                    {parsedIdeas.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-medium">
                                    Select an Idea ({parsedIdeas.length} generated)
                                </h3>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSaveToLibrary}
                                    disabled={savingToLibrary}
                                    className="gap-2"
                                >
                                    <Save className="h-4 w-4" />
                                    {savingToLibrary ? "Saving..." : "Save All to Library"}
                                </Button>
                            </div>

                            {librarySaveStatus && (
                                <div className={`text-sm p-3 rounded-lg ${librarySaveStatus.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                                    {librarySaveStatus.message}
                                </div>
                            )}

                            <div className="grid gap-4">
                                {parsedIdeas.map((idea, idx) => (
                                    <Card
                                        key={idea.idea_id || idx}
                                        className={`cursor-pointer transition-all ${selectedIdea?.idea_id === idea.idea_id
                                            ? "ring-2 ring-blue-500 border-blue-300"
                                            : "hover:border-gray-400"
                                            } ${recommendation?.pick === idea.idea_id ? "border-blue-200" : ""}`}
                                        onClick={() => handleIdeaSelect(idea)}
                                    >
                                        <CardContent className="p-4">
                                            {editingIdea?.idea_id === idea.idea_id ? (
                                                // Inline Edit Mode
                                                <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                                                    <div>
                                                        <Label className="text-xs">Title</Label>
                                                        <Input
                                                            value={editForm.title || ""}
                                                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                                            className="mt-1 text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="text-xs">Core Tension</Label>
                                                        <Textarea
                                                            value={editForm.core_tension || ""}
                                                            onChange={(e) => setEditForm({ ...editForm, core_tension: e.target.value })}
                                                            className="mt-1 text-sm min-h-[60px]"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="text-xs">Scroll Stopper</Label>
                                                        <Input
                                                            value={editForm.scroll_stopper || ""}
                                                            onChange={(e) => setEditForm({ ...editForm, scroll_stopper: e.target.value })}
                                                            className="mt-1 text-sm"
                                                        />
                                                    </div>
                                                    <div className="flex gap-2 pt-2">
                                                        <Button size="sm" onClick={saveEditing}>
                                                            <Check className="h-4 w-4 mr-1" />
                                                            Save
                                                        </Button>
                                                        <Button size="sm" variant="ghost" onClick={cancelEditing}>
                                                            <X className="h-4 w-4 mr-1" />
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                // View Mode
                                                <>
                                                    <div className="flex items-start justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-mono text-muted-foreground">
                                                                {idea.idea_id}
                                                            </span>
                                                            {recommendation?.pick === idea.idea_id && (
                                                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                                                    ⭐ Recommended
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className={`text-xs ${getVerdictColor(idea.verdict)}`}>
                                                                {idea.verdict}
                                                            </Badge>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 w-6 p-0"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    startEditing(idea);
                                                                }}
                                                            >
                                                                <Pencil className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <h4 className="font-semibold mb-1">{idea.title}</h4>
                                                    <p className="text-sm text-muted-foreground mb-3">{idea.core_tension}</p>

                                                    <div className="grid grid-cols-2 gap-4 text-xs">
                                                        <div>
                                                            <span className="font-medium">Scroll Stopper:</span>
                                                            <p className="text-muted-foreground">{idea.scroll_stopper || "—"}</p>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium">Curiosity Gap:</span>
                                                            <p className="text-muted-foreground">{idea.curiosity_gap || "—"}</p>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium">Keyword:</span>
                                                            <p className="text-muted-foreground">
                                                                {idea.primary_keyword?.term || "—"} ({idea.primary_keyword?.difficulty || "—"})
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium">Target Audience:</span>
                                                            <p className="text-muted-foreground">{idea.target_audience || "—"}</p>
                                                        </div>
                                                    </div>

                                                    {idea.risk_flags && idea.risk_flags.length > 0 && (
                                                        <div className="mt-3 pt-3 border-t">
                                                            <span className="text-xs font-medium text-orange-600">⚠️ Risks:</span>
                                                            <p className="text-xs text-orange-600">{idea.risk_flags.join(", ")}</p>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Selected Idea Summary */}
                    {selectedIdea && (
                        <Card className="border-green-200 bg-green-50/50">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-green-900">
                                        ✓ Selected Idea
                                    </CardTitle>
                                    <div className="flex items-center gap-2">
                                        {selectedFromLibrary && (
                                            <Badge variant="outline" className="text-xs">From Library</Badge>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => startEditing(selectedIdea)}
                                            className="gap-1 h-7"
                                        >
                                            <Pencil className="h-3 w-3" />
                                            Edit
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <h4 className="font-semibold">{selectedIdea.title}</h4>
                                <p className="text-sm text-muted-foreground mt-1">{selectedIdea.core_tension}</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={handleSaveProgress} disabled={saving}>
                            {saving ? "Saving..." : "Save Progress"}
                        </Button>
                        <Button
                            onClick={handleComplete}
                            disabled={saving || !selectedIdea}
                            className="gap-2"
                        >
                            Complete & Continue to Research
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
