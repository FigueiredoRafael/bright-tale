"use client";

import { useState, useEffect } from "react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Bot, Copy, Check } from "lucide-react";

interface AgentPrompt {
    id: string;
    name: string;
    slug: string;
    stage: string;
    instructions: string;
    input_schema: string | null;
    output_schema: string | null;
}

interface AgentPromptViewerProps {
    stage: string;
    defaultOpen?: boolean;
}

export default function AgentPromptViewer({
    stage,
    defaultOpen = false,
}: AgentPromptViewerProps) {
    const [agent, setAgent] = useState<AgentPrompt | null>(null);
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [loading, setLoading] = useState(true);
    const [copiedSection, setCopiedSection] = useState<string | null>(null);

    useEffect(() => {
        fetchAgent();
    }, [stage]);

    const fetchAgent = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/agents/${stage}`);
            if (response.ok) {
                const json = await response.json();
                setAgent(json.data?.agent || null);
            }
        } catch (err) {
            console.error("Failed to load agent:", err);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = async (text: string, section: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedSection(section);
            setTimeout(() => setCopiedSection(null), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    if (loading) {
        return (
            <div className="p-3 border rounded-lg bg-muted/50 animate-pulse">
                <div className="h-4 w-32 bg-muted rounded" />
            </div>
        );
    }

    if (!agent) {
        return null;
    }

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div className="border rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30">
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="w-full justify-between p-4 h-auto hover:bg-transparent"
                    >
                        <div className="flex items-center gap-2">
                            <Bot className="h-5 w-5 text-purple-600" />
                            <span className="font-medium">{agent.name}</span>
                            <Badge variant="secondary" className="text-xs">
                                {agent.stage}
                            </Badge>
                        </div>
                        {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                        ) : (
                            <ChevronRight className="h-4 w-4" />
                        )}
                    </Button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-4">
                        {/* Instructions */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium text-muted-foreground">
                                    Instructions
                                </h4>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(agent.instructions, "instructions")}
                                >
                                    {copiedSection === "instructions" ? (
                                        <Check className="h-3 w-3 text-green-600" />
                                    ) : (
                                        <Copy className="h-3 w-3" />
                                    )}
                                </Button>
                            </div>
                            <pre className="text-xs bg-card p-3 rounded border overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                                {agent.instructions}
                            </pre>
                        </div>

                        {/* Input Schema */}
                        {agent.input_schema && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-medium text-muted-foreground">
                                        Input Schema (YAML)
                                    </h4>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                            copyToClipboard(agent.input_schema!, "input")
                                        }
                                    >
                                        {copiedSection === "input" ? (
                                            <Check className="h-3 w-3 text-green-600" />
                                        ) : (
                                            <Copy className="h-3 w-3" />
                                        )}
                                    </Button>
                                </div>
                                <pre className="text-xs bg-yellow-50 dark:bg-yellow-950/30 p-3 rounded border border-yellow-200 dark:border-yellow-800 overflow-x-auto font-mono">
                                    {agent.input_schema}
                                </pre>
                            </div>
                        )}

                        {/* Output Schema */}
                        {agent.output_schema && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-medium text-muted-foreground">
                                        Output Schema (YAML)
                                    </h4>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                            copyToClipboard(agent.output_schema!, "output")
                                        }
                                    >
                                        {copiedSection === "output" ? (
                                            <Check className="h-3 w-3 text-green-600" />
                                        ) : (
                                            <Copy className="h-3 w-3" />
                                        )}
                                    </Button>
                                </div>
                                <pre className="text-xs bg-green-50 dark:bg-green-950/30 p-3 rounded border border-green-200 dark:border-green-800 overflow-x-auto font-mono">
                                    {agent.output_schema}
                                </pre>
                            </div>
                        )}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}
