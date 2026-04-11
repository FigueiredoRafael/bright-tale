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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AgentPromptViewer from "@/components/agents/AgentPromptViewer";
import MarkdownImport from "@/components/import/MarkdownImport";
import { Copy, Check, ArrowRight, Search, AlertCircle, Upload, BookOpen, CheckCircle, XCircle, Lightbulb, Download, Library, RefreshCw } from "lucide-react";
import type { ParsedResearch } from "@/lib/parsers/markdown";
import { researchToMarkdown } from "@/lib/parsers/markdown";
import type { BrainstormIdea, ResearchOutput, SelectedIdeaForResearch, LegacyIdea } from "@brighttale/shared/types/agents";
import { normalizeLegacyIdea, isLegacyIdea, mapBrainstormToResearchInput } from "@brighttale/shared/types/agents";

const formSchema = z.object({
    research_focus: z.string().optional(),
    depth: z.enum(["quick", "standard", "deep"]),
});

type FormData = z.infer<typeof formSchema>;

interface ResearchFormProps {
    initialYaml?: string;
    projectId?: string;
    onSave: (yamlContent: string) => void;
    onComplete: (yamlContent: string) => void;
    saving?: boolean;
}

export default function ResearchForm({
    initialYaml,
    projectId,
    onSave,
    onComplete,
    saving,
}: ResearchFormProps) {
    const [activeTab, setActiveTab] = useState<"input" | "output">("input");
    const [selectedIdea, setSelectedIdea] = useState<SelectedIdeaForResearch | null>(null);
    const [generatedYaml, setGeneratedYaml] = useState("");
    const [aiResponse, setAiResponse] = useState("");
    const [parsedResearch, setParsedResearch] = useState<ResearchOutput | null>(null);
    const [copied, setCopied] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);
    const [importedFromMarkdown, setImportedFromMarkdown] = useState(false);

    // New state for enhanced features
    const [existingResearch, setExistingResearch] = useState<Array<{ id: string; title: string; created_at: string }>>([]);
    const [loadingExisting, setLoadingExisting] = useState(false);
    const [savingToLibrary, setSavingToLibrary] = useState(false);
    const [savedResearchId, setSavedResearchId] = useState<string | null>(null);
    const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
    const [pendingImport, setPendingImport] = useState<ParsedResearch | null>(null);

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
            research_focus: "",
            depth: "standard",
        },
    });

    const depth = watch("depth");

    // Parse initial YAML
    useEffect(() => {
        if (initialYaml) {
            try {
                const parsed = yaml.load(initialYaml) as Record<string, unknown>;
                if (parsed) {
                    // Handle selected_idea - could be new format or legacy
                    if (parsed.selected_idea) {
                        const idea = parsed.selected_idea;
                        if (isLegacyIdea(idea)) {
                            const normalized = normalizeLegacyIdea(idea as LegacyIdea);
                            setSelectedIdea(mapBrainstormToResearchInput(normalized));
                        } else {
                            setSelectedIdea(idea as SelectedIdeaForResearch);
                        }
                    }
                    if (parsed.research_focus) {
                        setValue("research_focus", Array.isArray(parsed.research_focus)
                            ? (parsed.research_focus as string[]).join("\n")
                            : String(parsed.research_focus));
                    }
                    if (parsed.depth) {
                        setValue("depth", parsed.depth as FormData["depth"]);
                    }
                    if (parsed.ai_response_raw) {
                        setAiResponse(String(parsed.ai_response_raw));
                    }
                    if (parsed.research_output) {
                        setParsedResearch(parsed.research_output as ResearchOutput);
                        setActiveTab("output");
                    }
                }
            } catch {
                // Invalid YAML
            }
        }
    }, [initialYaml, setValue]);

    // Fetch selected idea from brainstorm stage if not already set
    useEffect(() => {
        if (selectedIdea || !projectId) return;

        const fetchBrainstormIdea = async () => {
            try {
                const res = await fetch(`/api/stages/${projectId}/brainstorm`);
                if (res.ok) {
                    const json = await res.json();
                    const brainstormYaml = json.data?.stage?.yaml_artifact;
                    if (brainstormYaml) {
                        const parsed = yaml.load(brainstormYaml) as Record<string, unknown>;
                        if (parsed?.selected_idea) {
                            const idea = parsed.selected_idea;
                            if (isLegacyIdea(idea)) {
                                const normalized = normalizeLegacyIdea(idea as LegacyIdea);
                                setSelectedIdea(mapBrainstormToResearchInput(normalized));
                            } else {
                                setSelectedIdea(mapBrainstormToResearchInput(idea as BrainstormIdea));
                            }
                        }
                    }
                }
            } catch {
                // Ignore errors
            }
        };

        fetchBrainstormIdea();
    }, [projectId, selectedIdea]);

    const formToYaml = (data: FormData): string => {
        const structured = {
            BC_RESEARCH_INPUT: {
                selected_idea: selectedIdea || {},
                research_focus: data.research_focus?.split("\n").filter(Boolean) || [],
                depth: data.depth,
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

            let research: ResearchOutput | null = null;
            if (parsed?.BC_RESEARCH_OUTPUT) {
                research = parsed.BC_RESEARCH_OUTPUT as ResearchOutput;
            } else if (parsed?.sources || parsed?.research_summary || parsed?.idea_validation) {
                research = parsed as unknown as ResearchOutput;
            }

            if (!research) {
                setParseError("No research data found. Make sure the YAML follows the BC_RESEARCH_OUTPUT schema.");
                return;
            }

            setParsedResearch(research);
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

    const handleSaveProgress = () => {
        const values = getValues();
        const fullData = {
            selected_idea: selectedIdea,
            research_focus: values.research_focus?.split("\n").filter(Boolean) || [],
            depth: values.depth,
            ai_response_raw: aiResponse || undefined,
            research_output: parsedResearch,
            imported_from_markdown: importedFromMarkdown,
        };
        onSave(yaml.dump(fullData));
    };

    // Handle markdown import
    const handleMarkdownImport = (parsed: ParsedResearch) => {
        // Convert markdown parsed data to ResearchOutput format
        const research: Partial<ResearchOutput> = {
            idea_id: selectedIdea?.idea_id || "",
            research_summary: parsed.summary || "",
            sources: parsed.sources.map((s, idx) => ({
                source_id: `src-${idx + 1}`,
                title: s.title,
                url: s.url || "",
                type: "article" as const,
                credibility: "medium" as const,
                key_insight: "",
            })),
            statistics: [],
            expert_quotes: [],
            counterarguments: [],
            knowledge_gaps: [],
            idea_validation: {
                core_claim_verified: true,
                evidence_strength: "moderate" as const,
                confidence_score: 0.7,
                validation_notes: "Imported from markdown",
            },
            refined_angle: {
                should_pivot: false,
                updated_title: selectedIdea?.title || "",
                updated_hook: selectedIdea?.scroll_stopper || "",
                angle_notes: "",
                recommendation: "proceed" as const,
            },
        };

        setParsedResearch(research as ResearchOutput);
        setImportedFromMarkdown(true);
        setActiveTab("output");
    };

    const handleComplete = () => {
        if (!parsedResearch) {
            setParseError("Please complete the research before continuing.");
            return;
        }
        const values = getValues();
        const fullData = {
            selected_idea: selectedIdea,
            research_focus: values.research_focus?.split("\n").filter(Boolean) || [],
            depth: values.depth,
            research_output: parsedResearch,
            imported_from_markdown: importedFromMarkdown,
        };
        onComplete(yaml.dump(fullData));
    };

    // Fetch existing research for this idea
    const fetchExistingResearch = async () => {
        if (!selectedIdea?.idea_id) return;

        setLoadingExisting(true);
        try {
            const res = await fetch(`/api/research/by-idea/${encodeURIComponent(selectedIdea.idea_id)}`);
            if (res.ok) {
                const json = await res.json();
                setExistingResearch(json.data?.research || []);
            }
        } catch (err) {
            console.error("Failed to fetch existing research:", err);
        } finally {
            setLoadingExisting(false);
        }
    };

    // Load a specific research entry
    const loadExistingResearch = async (researchId: string) => {
        try {
            const res = await fetch(`/api/research/${researchId}`);
            if (res.ok) {
                const json = await res.json();
                const researchData = json.data?.research;
                if (researchData?.research_content) {
                    try {
                        const parsed = JSON.parse(researchData.research_content);
                        // Try to extract research output from various formats
                        if (parsed.research_output) {
                            setParsedResearch(parsed.research_output);
                        } else if (parsed.sources || parsed.idea_validation) {
                            // Legacy format: research output stored directly
                            setParsedResearch(parsed as ResearchOutput);
                        }
                        // Restore form inputs if saved with the library entry
                        if (parsed.research_focus) {
                            setValue("research_focus", Array.isArray(parsed.research_focus)
                                ? (parsed.research_focus as string[]).join("\n")
                                : String(parsed.research_focus));
                        }
                        if (parsed.depth) {
                            setValue("depth", parsed.depth as "quick" | "standard" | "deep");
                        }
                        setSavedResearchId(researchId);
                        setActiveTab("output");
                    } catch {
                        setParseError("Failed to parse saved research content");
                    }
                }
            }
        } catch (err) {
            console.error("Failed to load research:", err);
        }
    };

    // Save research to library
    const handleSaveToLibrary = async () => {
        if (!parsedResearch) return;

        setSavingToLibrary(true);
        try {
            const values = getValues();
            const contentToSave = {
                research_output: parsedResearch,
                research_focus: values.research_focus?.split("\n").filter(Boolean) || [],
                depth: values.depth,
            };
            const res = await fetch("/api/research", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: parsedResearch.refined_angle?.updated_title || selectedIdea?.title || "Research",
                    theme: selectedIdea?.primary_keyword?.term || "General",
                    research_content: JSON.stringify(contentToSave),
                    idea_id: selectedIdea?.idea_id,
                }),
            });

            if (res.ok) {
                const json = await res.json();
                const newResearchId = json.data?.id;
                setSavedResearchId(newResearchId);

                // Link project to research if projectId exists
                if (projectId && newResearchId) {
                    await fetch(`/api/projects/${projectId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ research_id: newResearchId }),
                    });
                }
            }
        } catch (err) {
            console.error("Failed to save to library:", err);
        } finally {
            setSavingToLibrary(false);
        }
    };

    // Download research as markdown
    const handleDownloadMarkdown = () => {
        if (!parsedResearch) return;

        const markdown = researchToMarkdown(parsedResearch, selectedIdea?.title);
        const blob = new Blob([markdown], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `research-${selectedIdea?.idea_id || "export"}-${new Date().toISOString().split("T")[0]}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Handle markdown import with overwrite check
    const handleMarkdownImportWithCheck = (parsed: ParsedResearch) => {
        if (parsedResearch) {
            setPendingImport(parsed);
            setShowOverwriteDialog(true);
        } else {
            handleMarkdownImport(parsed);
        }
    };

    // Confirm overwrite
    const confirmOverwrite = () => {
        if (pendingImport) {
            handleMarkdownImport(pendingImport);
            setPendingImport(null);
        }
        setShowOverwriteDialog(false);
    };

    return (
        <div className="space-y-6">
            {/* Overwrite Confirmation Dialog */}
            <AlertDialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Replace Current Research?</AlertDialogTitle>
                        <AlertDialogDescription>
                            You already have research data. Importing this markdown will replace your current research.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingImport(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmOverwrite}>Replace</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Agent Prompt Viewer */}
            <AgentPromptViewer stage="research" />

            {/* Fetch Existing Research */}
            {selectedIdea?.idea_id && (
                <Card className="border-blue-200 bg-blue-50/30">
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-medium text-sm">Existing Research</h3>
                                <p className="text-xs text-muted-foreground">
                                    Load previously saved research for this idea
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {existingResearch.length > 0 && (
                                    <Select onValueChange={loadExistingResearch}>
                                        <SelectTrigger className="w-[200px]">
                                            <SelectValue placeholder="Select research..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {existingResearch.map((r) => (
                                                <SelectItem key={r.id} value={r.id}>
                                                    {r.title} ({new Date(r.created_at).toLocaleDateString()})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchExistingResearch}
                                    disabled={loadingExisting}
                                    className="gap-1"
                                >
                                    <RefreshCw className={`h-3 w-3 ${loadingExisting ? "animate-spin" : ""}`} />
                                    {loadingExisting ? "Loading..." : existingResearch.length > 0 ? "Refresh" : "Check"}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Quick Import from Markdown */}
            <Card className="border-dashed">
                <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium text-sm">Import Existing Research</h3>
                            <p className="text-xs text-muted-foreground">
                                Skip AI generation by importing research from a markdown file
                            </p>
                        </div>
                        <MarkdownImport
                            type="research"
                            saveToLibrary={true}
                            onImport={(parsed) => handleMarkdownImportWithCheck(parsed as ParsedResearch)}
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
            {selectedIdea && (
                <Card className="border-blue-200 bg-info/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-900">
                            <BookOpen className="h-4 w-4 inline mr-2" />
                            Researching Idea
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <h3 className="font-semibold">{selectedIdea.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{selectedIdea.core_tension}</p>
                        <p className="text-sm text-blue-600 italic mt-2">"{selectedIdea.scroll_stopper}"</p>
                        <div className="flex gap-2 mt-3">
                            <Badge variant="outline" className="text-xs">
                                {selectedIdea.primary_keyword?.term || "No keyword"}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                                {selectedIdea.target_audience}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "input" | "output")}>
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="input">1. Research Setup</TabsTrigger>
                    <TabsTrigger value="output">
                        2. AI Research Results
                    </TabsTrigger>
                </TabsList>

                {/* INPUT TAB */}
                <TabsContent value="input" className="space-y-4 mt-4">
                    <form onSubmit={handleSubmit(handleGenerateYaml)} className="space-y-4">
                        <div>
                            <Label htmlFor="research_focus">Research Focus Areas (one per line)</Label>
                            <Textarea
                                id="research_focus"
                                {...register("research_focus")}
                                placeholder="Verify core claims about...&#10;Find statistics on...&#10;Expert opinions about..."
                                className="mt-1 min-h-[100px]"
                            />
                        </div>

                        <div>
                            <Label htmlFor="depth">Research Depth</Label>
                            <Select value={depth} onValueChange={(v) => setValue("depth", v as any)}>
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="quick">Quick (5-10 min)</SelectItem>
                                    <SelectItem value="standard">Standard (15-30 min)</SelectItem>
                                    <SelectItem value="deep">Deep Dive (1+ hour)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t">
                            <Button type="submit" className="gap-2">
                                <Search className="h-4 w-4" />
                                Generate Research YAML
                            </Button>
                        </div>
                    </form>
                </TabsContent>

                {/* OUTPUT TAB */}
                <TabsContent value="output" className="space-y-6 mt-4">
                    {/* Generated YAML to Copy */}
                    {generatedYaml && (
                        <Card className="border-green-200 bg-green-50/50">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-green-900">
                                        📋 Copy this to Research Agent
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
                                Paste AI Response (BC_RESEARCH_OUTPUT)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Textarea
                                value={aiResponse}
                                onChange={(e) => setAiResponse(e.target.value)}
                                placeholder="Paste the Research Agent's YAML response here..."
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
                                Parse Research
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Parsed Research Display */}
                    {parsedResearch && (
                        <div className="space-y-4">
                            {/* Idea Validation Banner */}
                            {parsedResearch.idea_validation && (
                                <Card className={`${parsedResearch.idea_validation.core_claim_verified ? "border-green-200 bg-green-50/50" : "border-orange-200 bg-orange-50/50"}`}>
                                    <CardContent className="py-4">
                                        <div className="flex items-start gap-3">
                                            {parsedResearch.idea_validation.core_claim_verified ? (
                                                <CheckCircle className="h-5 w-5 text-success mt-0.5" />
                                            ) : (
                                                <XCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                                            )}
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="font-medium">
                                                        {parsedResearch.idea_validation.core_claim_verified ? "Core Claim Verified" : "Claim Unverified"}
                                                    </h4>
                                                    <Badge variant="outline" className="text-xs">
                                                        Evidence: {parsedResearch.idea_validation.evidence_strength}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-xs">
                                                        Confidence: {Math.round(parsedResearch.idea_validation.confidence_score * 100)}%
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground">{parsedResearch.idea_validation.validation_notes}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Refined Angle */}
                            {parsedResearch.refined_angle && (
                                <Card className="border-blue-200 bg-info/5">
                                    <CardContent className="py-4">
                                        <div className="flex items-start gap-3">
                                            <Lightbulb className="h-5 w-5 text-blue-600 mt-0.5" />
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="font-medium text-blue-900">
                                                        Recommendation: {parsedResearch.refined_angle.recommendation.toUpperCase()}
                                                    </h4>
                                                    {parsedResearch.refined_angle.should_pivot && (
                                                        <Badge variant="outline" className="text-xs bg-yellow-50">
                                                            Pivot Suggested
                                                        </Badge>
                                                    )}
                                                </div>
                                                {parsedResearch.refined_angle.should_pivot && (
                                                    <div className="mt-2 text-sm">
                                                        <p><strong>Updated Title:</strong> {parsedResearch.refined_angle.updated_title}</p>
                                                        <p><strong>Updated Hook:</strong> {parsedResearch.refined_angle.updated_hook}</p>
                                                    </div>
                                                )}
                                                <p className="text-sm text-blue-700 mt-2">{parsedResearch.refined_angle.angle_notes}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Research Summary */}
                            {parsedResearch.research_summary && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">Research Summary</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-muted-foreground">{parsedResearch.research_summary}</p>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Sources */}
                            {parsedResearch.sources?.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">Sources ({parsedResearch.sources.length})</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            {parsedResearch.sources.map((source) => (
                                                <div key={source.source_id} className="text-sm p-3 bg-muted rounded-lg">
                                                    <div className="flex items-start justify-between">
                                                        <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                                                            {source.title}
                                                        </a>
                                                        <div className="flex gap-1">
                                                            <Badge variant="outline" className="text-xs">{source.type}</Badge>
                                                            <Badge variant="outline" className={`text-xs ${source.credibility === "high" ? "bg-green-50" :
                                                                source.credibility === "medium" ? "bg-yellow-50" : "bg-red-50"
                                                                }`}>
                                                                {source.credibility}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    {source.key_insight && (
                                                        <p className="text-xs text-muted-foreground mt-1">{source.key_insight}</p>
                                                    )}
                                                    {source.quote_excerpt && (
                                                        <p className="text-xs text-muted-foreground mt-1 italic">"{source.quote_excerpt}"</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Statistics */}
                            {parsedResearch.statistics?.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">Key Statistics ({parsedResearch.statistics.length})</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid gap-2">
                                            {parsedResearch.statistics.map((stat) => (
                                                <div key={stat.stat_id} className="text-sm p-2 bg-muted rounded">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-blue-600">{stat.figure}</span>
                                                        <span className="text-muted-foreground">—</span>
                                                        <span>{stat.claim}</span>
                                                    </div>
                                                    {stat.context && (
                                                        <p className="text-xs text-muted-foreground mt-1">{stat.context}</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Expert Quotes */}
                            {parsedResearch.expert_quotes?.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">Expert Quotes ({parsedResearch.expert_quotes.length})</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {parsedResearch.expert_quotes.map((q) => (
                                                <div key={q.quote_id} className="text-sm p-3 bg-muted rounded-lg border-l-4 border-info">
                                                    <p className="italic">"{q.quote}"</p>
                                                    <p className="text-xs text-muted-foreground mt-2">
                                                        — <strong>{q.author}</strong>, {q.credentials}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Counterarguments */}
                            {parsedResearch.counterarguments?.length > 0 && (
                                <Card className="border-orange-200">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-orange-800">Counterarguments ({parsedResearch.counterarguments.length})</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {parsedResearch.counterarguments.map((c) => (
                                                <div key={c.counter_id} className="text-sm p-3 bg-orange-50 rounded-lg">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-medium">{c.point}</span>
                                                        <Badge variant="outline" className={`text-xs ${c.strength === "strong" ? "bg-red-50" :
                                                            c.strength === "moderate" ? "bg-yellow-50" : "bg-green-50"
                                                            }`}>
                                                            {c.strength}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground"><strong>Rebuttal:</strong> {c.rebuttal}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Knowledge Gaps */}
                            {parsedResearch.knowledge_gaps?.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">Knowledge Gaps</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                            {parsedResearch.knowledge_gaps.map((gap, idx) => (
                                                <li key={idx}>{gap}</li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-between pt-4 border-t">
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={handleDownloadMarkdown}
                                disabled={!parsedResearch}
                                className="gap-2"
                            >
                                <Download className="h-4 w-4" />
                                Download Markdown
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleSaveToLibrary}
                                disabled={!parsedResearch || savingToLibrary}
                                className="gap-2"
                            >
                                <Library className="h-4 w-4" />
                                {savingToLibrary ? "Saving..." : savedResearchId ? "Saved ✓" : "Save to Library"}
                            </Button>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={handleSaveProgress} disabled={saving}>
                                {saving ? "Saving..." : "Save Progress"}
                            </Button>
                            <Button
                                onClick={handleComplete}
                                disabled={saving || !parsedResearch}
                                className="gap-2"
                            >
                                Complete & Continue to Production
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
