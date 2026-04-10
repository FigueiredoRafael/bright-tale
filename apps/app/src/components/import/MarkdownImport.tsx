"use client";

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, FileText, Check, X, Eye, Loader2 } from "lucide-react";
import {
    parseMarkdownToIdea,
    parseMarkdownToResearch,
    parseMarkdownToProduction,
    type ParsedIdea,
    type ParsedResearch,
    type ParsedProduction,
} from "@/lib/parsers/markdown";

type ParseType = "idea" | "research" | "production";

interface MarkdownImportProps {
    type: ParseType;
    onImport: (parsed: ParsedIdea | ParsedResearch | ParsedProduction) => void;
    saveToLibrary?: boolean;
    trigger?: React.ReactNode;
}

export default function MarkdownImport({
    type,
    onImport,
    saveToLibrary = false,
    trigger,
}: MarkdownImportProps) {
    const [open, setOpen] = useState(false);
    const [markdown, setMarkdown] = useState("");
    const [preview, setPreview] = useState<ParsedIdea | ParsedResearch | ParsedProduction | null>(null);
    const [saving, setSaving] = useState(false);
    const [dragOver, setDragOver] = useState(false);

    const handleParse = useCallback(() => {
        if (!markdown.trim()) return;

        let parsed;
        switch (type) {
            case "idea":
                parsed = parseMarkdownToIdea(markdown);
                break;
            case "research":
                parsed = parseMarkdownToResearch(markdown);
                break;
            case "production":
                parsed = parseMarkdownToProduction(markdown);
                break;
        }
        setPreview(parsed);
    }, [markdown, type]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const text = await file.text();
        setMarkdown(text);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);

        const file = e.dataTransfer.files?.[0];
        if (!file) return;

        if (!file.name.endsWith(".md") && !file.type.includes("text")) {
            return;
        }

        const text = await file.text();
        setMarkdown(text);
    };

    const handleConfirm = async () => {
        if (!preview) return;

        if (saveToLibrary && type === "idea") {
            setSaving(true);
            try {
                const ideaPreview = preview as ParsedIdea;
                await fetch("/api/ideas/library", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: ideaPreview.title,
                        core_tension: ideaPreview.one_liner,
                        target_audience: "",
                        verdict: "experimental",
                        source_type: "import",
                        markdown_content: ideaPreview.raw_content,
                        discovery_data: "",
                    }),
                });
            } catch (err) {
                console.error("Failed to save to library:", err);
            } finally {
                setSaving(false);
            }
        }

        if (saveToLibrary && type === "research") {
            setSaving(true);
            try {
                const researchPreview = preview as ParsedResearch;
                await fetch("/api/research", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: researchPreview.title || "Imported Research",
                        theme: "Imported",
                        research_content: JSON.stringify({
                            summary: researchPreview.summary,
                            sources: researchPreview.sources,
                            key_findings: researchPreview.key_findings,
                            sections: researchPreview.sections,
                            imported_from_markdown: true,
                            imported_at: new Date().toISOString(),
                        }),
                    }),
                });
            } catch (err) {
                console.error("Failed to save research to library:", err);
            } finally {
                setSaving(false);
            }
        }

        onImport(preview);
        setOpen(false);
        setMarkdown("");
        setPreview(null);
    };

    const getTitle = () => {
        switch (type) {
            case "idea":
                return "Import Idea from Markdown";
            case "research":
                return "Import Research from Markdown";
            case "production":
                return "Import Content from Markdown";
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" className="gap-2">
                        <Upload className="h-4 w-4" />
                        Import Markdown
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        {getTitle()}
                    </DialogTitle>
                    <DialogDescription>
                        Paste markdown content or drag & drop a .md file. The content will be
                        parsed into structured data.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 py-4">
                    {/* Drop zone / Text input */}
                    <div
                        className={`border-2 border-dashed rounded-lg p-4 transition-colors ${dragOver
                            ? "border-primary bg-primary/5"
                            : "border-muted-foreground/25"
                            }`}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                    >
                        <div className="text-center mb-3">
                            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">
                                Drag & drop a .md file or paste content below
                            </p>
                            <input
                                type="file"
                                accept=".md,.txt,.markdown"
                                onChange={handleFileChange}
                                className="hidden"
                                id="markdown-file-input"
                            />
                            <Label
                                htmlFor="markdown-file-input"
                                className="text-primary text-sm cursor-pointer hover:underline"
                            >
                                Browse files
                            </Label>
                        </div>
                        <Textarea
                            value={markdown}
                            onChange={(e) => setMarkdown(e.target.value)}
                            placeholder="# Your Content Title&#10;&#10;First paragraph becomes the summary...&#10;&#10;## Section Heading&#10;&#10;Section content here..."
                            className="min-h-[200px] font-mono text-sm"
                        />
                    </div>

                    <Button onClick={handleParse} disabled={!markdown.trim()} className="gap-2">
                        <Eye className="h-4 w-4" />
                        Preview Parsed Content
                    </Button>

                    {/* Preview */}
                    {preview && (
                        <Card className="border-green-200 bg-green-50/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Check className="h-4 w-4 text-green-600" />
                                    Parsed Successfully
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div>
                                    <Label className="text-xs text-muted-foreground">Title</Label>
                                    <p className="font-semibold">{preview.title}</p>
                                </div>
                                {"one_liner" in preview && preview.one_liner && (
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Summary</Label>
                                        <p className="text-sm">{preview.one_liner}</p>
                                    </div>
                                )}
                                {"summary" in preview && preview.summary && (
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Summary</Label>
                                        <p className="text-sm">{preview.summary}</p>
                                    </div>
                                )}
                                {"meta_description" in preview && preview.meta_description && (
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Meta Description</Label>
                                        <p className="text-sm">{preview.meta_description}</p>
                                    </div>
                                )}
                                {preview.sections.length > 0 && (
                                    <div>
                                        <Label className="text-xs text-muted-foreground">
                                            Sections ({preview.sections.length})
                                        </Label>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {preview.sections.map((s, i) => (
                                                <Badge key={i} variant="secondary" className="text-xs">
                                                    {s.heading}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {"key_facts" in preview && preview.key_facts.length > 0 && (
                                    <div>
                                        <Label className="text-xs text-muted-foreground">
                                            Key Facts ({preview.key_facts.length})
                                        </Label>
                                        <ul className="text-xs list-disc list-inside mt-1 max-h-24 overflow-y-auto">
                                            {preview.key_facts.slice(0, 5).map((fact, i) => (
                                                <li key={i} className="truncate">{fact}</li>
                                            ))}
                                            {preview.key_facts.length > 5 && (
                                                <li className="text-muted-foreground">
                                                    +{preview.key_facts.length - 5} more...
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                )}
                                {"sources" in preview && preview.sources.length > 0 && (
                                    <div>
                                        <Label className="text-xs text-muted-foreground">
                                            Sources ({preview.sources.length})
                                        </Label>
                                        <ul className="text-xs list-disc list-inside mt-1">
                                            {preview.sources.slice(0, 3).map((src, i) => (
                                                <li key={i} className="truncate">{src.title}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} disabled={!preview || saving} className="gap-2">
                        {saving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Check className="h-4 w-4" />
                                Import{saveToLibrary ? " & Save to Library" : ""}
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
