"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Copy, ClipboardPaste, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ManualModePanelProps {
    /** Agent slug to load prompt from DB */
    agentSlug: string;
    /** Extra context to append to prompt (topic, settings, etc.) */
    inputContext: string;
    /** Placeholder text for paste area */
    pastePlaceholder?: string;
    /** Called with parsed JSON output */
    onImport: (parsed: unknown) => Promise<void>;
    /** Loading state from parent */
    loading?: boolean;
    /** Label for the import button */
    importLabel?: string;
}

export function ManualModePanel({
    agentSlug,
    inputContext,
    pastePlaceholder,
    onImport,
    loading = false,
    importLabel = "Import Output",
}: ManualModePanelProps) {
    const [agentPrompt, setAgentPrompt] = useState<string | null>(null);
    const [pastedOutput, setPastedOutput] = useState("");
    const [copied, setCopied] = useState(false);
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/agents");
                const json = await res.json();
                const agent = json.data?.agents?.find(
                    (a: { slug: string }) => a.slug === agentSlug,
                );
                if (agent?.instructions) setAgentPrompt(agent.instructions);
            } catch {
                /* silent */
            }
        })();
    }, [agentSlug]);

    const fullPrompt = [
        agentPrompt ?? `You are a ${agentSlug} agent.`,
        "",
        "## Input",
        inputContext,
        "",
        "## Output Format",
        "Respond ONLY with valid JSON (no markdown, no commentary).",
    ].join("\n");

    async function handleCopy() {
        await navigator.clipboard.writeText(fullPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success("Prompt copied! Paste into ChatGPT, Gemini, or Claude.");
    }

    async function handleImport() {
        if (!pastedOutput.trim()) {
            toast.error("Paste the AI output first");
            return;
        }
        setImporting(true);
        try {
            let text = pastedOutput.trim();
            // Strip markdown code blocks
            const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) text = codeBlockMatch[1].trim();

            const parsed = JSON.parse(text);
            await onImport(parsed);
            setPastedOutput("");
        } catch (err) {
            toast.error(
                `Failed to parse: ${err instanceof Error ? err.message : "Invalid JSON"}`,
            );
        } finally {
            setImporting(false);
        }
    }

    return (
        <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-sm font-medium">
                            Step 1: Copy prompt
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Paste into ChatGPT, Gemini, Claude, or any AI chat
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 shrink-0"
                        onClick={handleCopy}
                    >
                        {copied ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                            <Copy className="h-3.5 w-3.5" />
                        )}
                        {copied ? "Copied!" : "Copy Prompt"}
                    </Button>
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-sm font-medium">
                    Step 2: Paste AI output
                </Label>
                <Textarea
                    placeholder={
                        pastePlaceholder ??
                        "Paste the JSON response from your AI chat here..."
                    }
                    value={pastedOutput}
                    onChange={(e) => setPastedOutput(e.target.value)}
                    rows={8}
                    className="font-mono text-xs"
                />
            </div>

            <Button
                onClick={handleImport}
                disabled={importing || loading || !pastedOutput.trim()}
            >
                {importing || loading ? (
                    <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />{" "}
                        Processing...
                    </>
                ) : (
                    <>
                        <ClipboardPaste className="h-4 w-4 mr-2" />{" "}
                        {importLabel}
                    </>
                )}
            </Button>
        </div>
    );
}
