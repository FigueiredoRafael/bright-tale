"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, RefreshCw, Check, AlertCircle } from "lucide-react";

interface AgentPrompt {
    id: string;
    name: string;
    slug: string;
    stage: string;
    instructions: string;
    input_schema: string | null;
    output_schema: string | null;
    created_at: string;
    updated_at: string;
}

export default function AgentsSettingsPage() {
    const [agents, setAgents] = useState<AgentPrompt[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<AgentPrompt | null>(null);
    const [editedAgent, setEditedAgent] = useState<Partial<AgentPrompt>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchAgents();
    }, []);

    const fetchAgents = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch("/api/agents");
            const json = await response.json();

            if (json.data?.agents) {
                setAgents(json.data.agents);
                if (json.data.agents.length > 0 && !selectedAgent) {
                    setSelectedAgent(json.data.agents[0]);
                    setEditedAgent(json.data.agents[0]);
                }
            }
        } catch (err) {
            setError("Failed to load agents");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAgentSelect = (agent: AgentPrompt) => {
        setSelectedAgent(agent);
        setEditedAgent(agent);
        setSaveStatus("idle");
    };

    const handleFieldChange = (field: keyof AgentPrompt, value: string) => {
        setEditedAgent((prev) => ({ ...prev, [field]: value }));
        setSaveStatus("idle");
    };

    const handleSave = async () => {
        if (!selectedAgent) return;

        try {
            setSaving(true);
            setSaveStatus("idle");

            const response = await fetch(`/api/agents/${selectedAgent.slug}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: editedAgent.name,
                    instructions: editedAgent.instructions,
                    input_schema: editedAgent.input_schema,
                    output_schema: editedAgent.output_schema,
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to save agent");
            }

            const json = await response.json();
            if (json.data?.agent) {
                // Update the agent in the list
                setAgents((prev) =>
                    prev.map((a) =>
                        a.slug === selectedAgent.slug ? json.data.agent : a
                    )
                );
                setSelectedAgent(json.data.agent);
                setEditedAgent(json.data.agent);
                setSaveStatus("success");

                // Reset status after 3 seconds
                setTimeout(() => setSaveStatus("idle"), 3000);
            }
        } catch (err) {
            setSaveStatus("error");
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const getStageColor = (stage: string) => {
        const colors: Record<string, string> = {
            brainstorm: "bg-purple-500",
            research: "bg-info",
            production: "bg-success",
            review: "bg-warning",
            publish: "bg-destructive",
        };
        return colors[stage] || "bg-muted-foreground";
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <Card className="border-destructive/20 bg-destructive/5">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="h-5 w-5" />
                            <span>{error}</span>
                        </div>
                        <Button onClick={fetchAgents} variant="outline" className="mt-4">
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Try Again
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Agent Prompts</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage AI agent instructions and schemas for the 4-stage workflow
                    </p>
                </div>
                <Button onClick={fetchAgents} variant="outline" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Info Card */}
            <Card className="border-info/20 bg-info/5">
                <CardContent className="pt-4">
                    <div className="flex gap-3">
                        <div className="text-info">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <div className="space-y-1 text-sm">
                            <p className="font-medium text-foreground">
                                About Agent Prompts
                            </p>
                            <p className="text-info">
                                These prompts define how each AI agent behaves in the content creation workflow.
                                Changes take effect immediately for new content generation.
                            </p>
                            <div className="flex gap-4 mt-2 text-xs text-info">
                                <span><strong>Brainstorm:</strong> Generates ideas</span>
                                <span><strong>Research:</strong> Validates & sources</span>
                                <span><strong>Production:</strong> Creates content</span>
                                <span><strong>Review:</strong> Quality checks</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-12 gap-6">
                {/* Agent List */}
                <div className="col-span-3">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">Workflow Stages</CardTitle>
                            <CardDescription className="text-xs">
                                Select an agent to edit
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {agents.map((agent) => (
                                <button
                                    key={agent.id}
                                    onClick={() => handleAgentSelect(agent)}
                                    className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedAgent?.id === agent.id
                                        ? "border-primary bg-primary/5 shadow-sm"
                                        : "border-transparent hover:bg-muted"
                                        }`}
                                >
                                    <div className="font-medium text-sm">{agent.name}</div>
                                    <Badge
                                        variant="secondary"
                                        className={`${getStageColor(agent.stage)} text-white mt-1 text-xs`}
                                    >
                                        {agent.stage}
                                    </Badge>
                                </button>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* Agent Editor */}
                <div className="col-span-9">
                    {selectedAgent && (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>{editedAgent.name || selectedAgent.name}</CardTitle>
                                        <CardDescription>
                                            Stage: {selectedAgent.stage} • Slug: {selectedAgent.slug}
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {saveStatus === "success" && (
                                            <span className="text-success flex items-center gap-1 text-sm">
                                                <Check className="h-4 w-4" />
                                                Saved
                                            </span>
                                        )}
                                        {saveStatus === "error" && (
                                            <span className="text-destructive flex items-center gap-1 text-sm">
                                                <AlertCircle className="h-4 w-4" />
                                                Failed
                                            </span>
                                        )}
                                        <Button onClick={handleSave} disabled={saving}>
                                            {saving ? (
                                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            ) : (
                                                <Save className="h-4 w-4 mr-2" />
                                            )}
                                            Save Changes
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Tabs defaultValue="instructions" className="w-full">
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="instructions">Instructions</TabsTrigger>
                                        <TabsTrigger value="input">Input Schema</TabsTrigger>
                                        <TabsTrigger value="output">Output Schema</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="instructions" className="mt-4">
                                        <div className="space-y-4">
                                            <div>
                                                <Label htmlFor="name">Agent Name</Label>
                                                <Input
                                                    id="name"
                                                    value={editedAgent.name || ""}
                                                    onChange={(e) => handleFieldChange("name", e.target.value)}
                                                    className="mt-1"
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="instructions">
                                                    Agent Instructions
                                                    <span className="text-muted-foreground ml-2 font-normal">
                                                        (Markdown supported)
                                                    </span>
                                                </Label>
                                                <Textarea
                                                    id="instructions"
                                                    value={editedAgent.instructions || ""}
                                                    onChange={(e) =>
                                                        handleFieldChange("instructions", e.target.value)
                                                    }
                                                    className="mt-1 font-mono text-sm min-h-[400px]"
                                                    placeholder="Enter agent instructions..."
                                                />
                                            </div>
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="input" className="mt-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="input_schema">
                                                Input Schema (YAML)
                                                <span className="text-muted-foreground ml-2 font-normal">
                                                    Define the expected input format
                                                </span>
                                            </Label>
                                            <Textarea
                                                id="input_schema"
                                                value={editedAgent.input_schema || ""}
                                                onChange={(e) =>
                                                    handleFieldChange("input_schema", e.target.value)
                                                }
                                                className="font-mono text-sm min-h-[400px]"
                                                placeholder="BC_INPUT:\n  field: value"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                💡 This schema is passed to the AI as input. Use YAML format with clear field names.
                                            </p>
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="output" className="mt-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="output_schema">
                                                Output Schema (YAML)
                                                <span className="text-muted-foreground ml-2 font-normal">
                                                    Define the expected output format
                                                </span>
                                            </Label>
                                            <Textarea
                                                id="output_schema"
                                                value={editedAgent.output_schema || ""}
                                                onChange={(e) =>
                                                    handleFieldChange("output_schema", e.target.value)
                                                }
                                                className="font-mono text-sm min-h-[400px]"
                                                placeholder="BC_OUTPUT:\n  field: value"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                💡 The AI will structure its response according to this schema. Validated by Zod on the backend.
                                            </p>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
