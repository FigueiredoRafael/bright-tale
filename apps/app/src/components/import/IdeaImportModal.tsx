"use client";

import React, { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Upload,
    FileJson,
    FileText,
    Check,
    X,
    AlertTriangle,
    Loader2,
    ChevronDown,
    ChevronUp,
} from "lucide-react";

interface ImportIdea {
    title: string;
    core_tension: string;
    target_audience: string;
    verdict: string;
    tags: string[];
    source_type: string;
}

interface ImportIssue {
    row: number;
    field: string;
    severity: "error" | "warning";
    message: string;
}

interface DryRunResult {
    valid: ImportIdea[];
    issues: ImportIssue[];
    skipped: number;
    total: number;
}

interface IdeaImportModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImport: (ideas: ImportIdea[]) => Promise<{ imported: number; failed: number }>;
}

const REQUIRED_FIELDS = ["title"];
const EXPECTED_FIELDS = ["title", "core_tension", "target_audience", "verdict", "tags", "source_type"];
const VALID_VERDICTS = ["viable", "experimental", "weak"];

function validateIdea(raw: Record<string, unknown>, index: number): { idea: ImportIdea | null; issues: ImportIssue[] } {
    const issues: ImportIssue[] = [];

    // Check required fields
    if (!raw.title || typeof raw.title !== "string" || !raw.title.trim()) {
        issues.push({ row: index + 1, field: "title", severity: "error", message: "Missing or empty title" });
        return { idea: null, issues };
    }

    // Check verdict
    const verdict = typeof raw.verdict === "string" ? raw.verdict.toLowerCase() : "experimental";
    if (!VALID_VERDICTS.includes(verdict)) {
        issues.push({
            row: index + 1,
            field: "verdict",
            severity: "warning",
            message: `Unknown verdict "${raw.verdict}" — will default to "experimental"`,
        });
    }

    // Check for missing optional fields
    if (!raw.core_tension) {
        issues.push({ row: index + 1, field: "core_tension", severity: "warning", message: "Missing core_tension — will be empty" });
    }
    if (!raw.target_audience) {
        issues.push({ row: index + 1, field: "target_audience", severity: "warning", message: "Missing target_audience — will be empty" });
    }

    // Check for unknown fields
    const knownFields = new Set([...EXPECTED_FIELDS, "id", "idea_id", "created_at", "updated_at", "org_id", "user_id", "channel_id",
        "brainstorm_session_id", "is_public", "usage_count", "markdown_content", "source_project_id", "discovery_data"]);
    for (const key of Object.keys(raw)) {
        if (!knownFields.has(key)) {
            issues.push({ row: index + 1, field: key, severity: "warning", message: `Unknown field "${key}" — will be ignored` });
        }
    }

    // Check tags
    let tags: string[] = [];
    if (Array.isArray(raw.tags)) {
        tags = raw.tags.filter((t): t is string => typeof t === "string");
    } else if (typeof raw.tags === "string") {
        tags = raw.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
        issues.push({ row: index + 1, field: "tags", severity: "warning", message: "Tags is a string, not array — auto-split by comma" });
    }

    return {
        idea: {
            title: String(raw.title).trim(),
            core_tension: typeof raw.core_tension === "string" ? raw.core_tension : "",
            target_audience: typeof raw.target_audience === "string" ? raw.target_audience : "",
            verdict: VALID_VERDICTS.includes(verdict) ? verdict : "experimental",
            tags,
            source_type: "import",
        },
        issues,
    };
}

function parseJsonContent(text: string): DryRunResult {
    const issues: ImportIssue[] = [];
    let parsed: unknown;

    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return { valid: [], issues: [{ row: 0, field: "file", severity: "error", message: `Invalid JSON: ${(e as Error).message}` }], skipped: 0, total: 0 };
    }

    const items = Array.isArray(parsed) ? parsed : [parsed];
    const valid: ImportIdea[] = [];
    let skipped = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || typeof item !== "object") {
            issues.push({ row: i + 1, field: "row", severity: "error", message: "Not an object — skipped" });
            skipped++;
            continue;
        }
        const result = validateIdea(item as Record<string, unknown>, i);
        issues.push(...result.issues);
        if (result.idea) {
            valid.push(result.idea);
        } else {
            skipped++;
        }
    }

    return { valid, issues, skipped, total: items.length };
}

function parseMarkdownContent(text: string): DryRunResult {
    const issues: ImportIssue[] = [];
    const lines = text.split("\n");
    const ideas: ImportIdea[] = [];

    // Try to parse headings as idea titles
    let currentIdea: Partial<ImportIdea> = {};
    let lineNum = 0;

    for (const line of lines) {
        lineNum++;
        const trimmed = line.trim();

        if (trimmed.startsWith("# ") || trimmed.startsWith("## ")) {
            // Save previous idea if exists
            if (currentIdea.title) {
                ideas.push({
                    title: currentIdea.title,
                    core_tension: currentIdea.core_tension || "",
                    target_audience: currentIdea.target_audience || "",
                    verdict: currentIdea.verdict || "experimental",
                    tags: currentIdea.tags || [],
                    source_type: "import",
                });
            }
            currentIdea = { title: trimmed.replace(/^#{1,2}\s+/, "") };
        } else if (trimmed.toLowerCase().startsWith("audience:") || trimmed.toLowerCase().startsWith("target:")) {
            currentIdea.target_audience = trimmed.split(":").slice(1).join(":").trim();
        } else if (trimmed.toLowerCase().startsWith("verdict:")) {
            const v = trimmed.split(":")[1]?.trim().toLowerCase();
            currentIdea.verdict = VALID_VERDICTS.includes(v ?? "") ? v : "experimental";
        } else if (trimmed.toLowerCase().startsWith("tags:")) {
            currentIdea.tags = trimmed.split(":").slice(1).join(":").split(",").map(t => t.trim()).filter(Boolean);
        } else if (trimmed && !currentIdea.core_tension && currentIdea.title) {
            // First non-empty line after title = core tension
            currentIdea.core_tension = trimmed;
        }
    }

    // Save last idea
    if (currentIdea.title) {
        ideas.push({
            title: currentIdea.title,
            core_tension: currentIdea.core_tension || "",
            target_audience: currentIdea.target_audience || "",
            verdict: currentIdea.verdict || "experimental",
            tags: currentIdea.tags || [],
            source_type: "import",
        });
    }

    if (ideas.length === 0) {
        issues.push({ row: 0, field: "file", severity: "error", message: "No ideas found. Use '# Title' or '## Title' headings for each idea." });
    }

    for (let i = 0; i < ideas.length; i++) {
        if (!ideas[i].core_tension) {
            issues.push({ row: i + 1, field: "core_tension", severity: "warning", message: `"${ideas[i].title}" — no description found after heading` });
        }
    }

    return { valid: ideas, issues, skipped: 0, total: ideas.length };
}

export function IdeaImportModal({ open, onOpenChange, onImport }: IdeaImportModalProps) {
    const [tab, setTab] = useState<"json" | "markdown">("json");
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>("");
    const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);
    const [showAllIssues, setShowAllIssues] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setFileContent(null);
        setFileName("");
        setDryRun(null);
        setResult(null);
        setShowAllIssues(false);
        if (fileRef.current) fileRef.current.value = "";
    };

    const handleFile = useCallback((file: File) => {
        setResult(null);
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            setFileContent(text);

            // Auto-detect format
            const isJson = file.name.endsWith(".json") || text.trim().startsWith("[") || text.trim().startsWith("{");
            const format = isJson ? "json" : "markdown";
            setTab(format as "json" | "markdown");

            // Run dry-run
            const parsed = format === "json" ? parseJsonContent(text) : parseMarkdownContent(text);
            setDryRun(parsed);
        };
        reader.readAsText(file);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleConfirmImport = async () => {
        if (!dryRun || dryRun.valid.length === 0) return;
        setImporting(true);
        const res = await onImport(dryRun.valid);
        setResult(res);
        setImporting(false);
    };

    const errors = dryRun?.issues.filter((i) => i.severity === "error") ?? [];
    const warnings = dryRun?.issues.filter((i) => i.severity === "warning") ?? [];
    const displayIssues = showAllIssues ? (dryRun?.issues ?? []) : (dryRun?.issues ?? []).slice(0, 8);

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
                <DialogHeader>
                    <DialogTitle>Import Ideas</DialogTitle>
                    <DialogDescription>
                        Upload a JSON or Markdown file. We&apos;ll validate before importing.
                    </DialogDescription>
                </DialogHeader>

                {/* Format tabs */}
                <Tabs value={tab} onValueChange={(v) => setTab(v as "json" | "markdown")}>
                    <TabsList className="mb-3">
                        <TabsTrigger value="json" className="gap-1.5">
                            <FileJson className="h-3.5 w-3.5" /> JSON
                        </TabsTrigger>
                        <TabsTrigger value="markdown" className="gap-1.5">
                            <FileText className="h-3.5 w-3.5" /> Markdown
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="json">
                        <p className="text-xs text-muted-foreground mb-2">
                            JSON array of objects. Required: <code>title</code>. Optional: <code>core_tension</code>, <code>target_audience</code>, <code>verdict</code>, <code>tags</code>.
                        </p>
                    </TabsContent>
                    <TabsContent value="markdown">
                        <p className="text-xs text-muted-foreground mb-2">
                            Use <code># Title</code> or <code>## Title</code> for each idea. First paragraph after heading = core tension. Optional lines: <code>Audience: ...</code>, <code>Verdict: viable|experimental|weak</code>, <code>Tags: a, b, c</code>.
                        </p>
                    </TabsContent>
                </Tabs>

                {/* Drop zone */}
                {!result && (
                    <div
                        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => fileRef.current?.click()}
                    >
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        {fileName ? (
                            <p className="text-sm font-medium">{fileName}</p>
                        ) : (
                            <>
                                <p className="text-sm font-medium">Drop file here or click to browse</p>
                                <p className="text-xs text-muted-foreground mt-1">.json or .md files</p>
                            </>
                        )}
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".json,.md,.txt,.markdown"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFile(f);
                            }}
                        />
                    </div>
                )}

                {/* Dry-run results */}
                {dryRun && !result && (
                    <div className="space-y-3 mt-2">
                        {/* Summary */}
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                            <Badge variant="outline" className="gap-1">
                                <Check className="h-3 w-3 text-green-500" />
                                {dryRun.valid.length} valid
                            </Badge>
                            {errors.length > 0 && (
                                <Badge variant="outline" className="gap-1 text-red-500 border-red-200">
                                    <X className="h-3 w-3" />
                                    {errors.length} errors
                                </Badge>
                            )}
                            {warnings.length > 0 && (
                                <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-200">
                                    <AlertTriangle className="h-3 w-3" />
                                    {warnings.length} warnings
                                </Badge>
                            )}
                            {dryRun.skipped > 0 && (
                                <span className="text-muted-foreground">{dryRun.skipped} skipped</span>
                            )}
                            <span className="text-muted-foreground ml-auto">{dryRun.total} total</span>
                        </div>

                        {/* Issues list */}
                        {dryRun.issues.length > 0 && (
                            <div className="border rounded-md divide-y max-h-48 overflow-y-auto text-xs">
                                {displayIssues.map((issue, i) => (
                                    <div key={i} className={`flex items-start gap-2 px-3 py-2 ${issue.severity === "error" ? "bg-red-50 dark:bg-red-950/20" : "bg-yellow-50 dark:bg-yellow-950/20"}`}>
                                        {issue.severity === "error" ? (
                                            <X className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                                        ) : (
                                            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
                                        )}
                                        <div>
                                            {issue.row > 0 && <span className="font-mono text-muted-foreground">Row {issue.row} </span>}
                                            <span className="font-medium">{issue.field}:</span>{" "}
                                            {issue.message}
                                        </div>
                                    </div>
                                ))}
                                {(dryRun.issues.length > 8) && (
                                    <button
                                        className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 flex items-center justify-center gap-1"
                                        onClick={() => setShowAllIssues(!showAllIssues)}
                                    >
                                        {showAllIssues ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                        {showAllIssues ? "Show less" : `Show all ${dryRun.issues.length} issues`}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Preview table */}
                        {dryRun.valid.length > 0 && (
                            <div className="border rounded-md max-h-52 overflow-y-auto overflow-x-hidden">
                                <table className="w-full text-xs table-fixed">
                                    <thead className="bg-muted/30 sticky top-0">
                                        <tr>
                                            <th className="text-left px-3 py-1.5 font-medium truncate">Title</th>
                                            <th className="text-left px-3 py-1.5 font-medium w-20">Verdict</th>
                                            <th className="text-left px-3 py-1.5 font-medium w-28 hidden md:table-cell">Audience</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {dryRun.valid.slice(0, 20).map((idea, i) => (
                                            <tr key={i} className="hover:bg-muted/10">
                                                <td className="px-3 py-1.5 truncate">{idea.title}</td>
                                                <td className="px-3 py-1.5 w-20">
                                                    <Badge variant="outline" className="text-[10px]">{idea.verdict}</Badge>
                                                </td>
                                                <td className="px-3 py-1.5 truncate text-muted-foreground w-28 hidden md:table-cell">
                                                    {idea.target_audience || "—"}
                                                </td>
                                            </tr>
                                        ))}
                                        {dryRun.valid.length > 20 && (
                                            <tr><td colSpan={3} className="px-3 py-1.5 text-muted-foreground text-center">...and {dryRun.valid.length - 20} more</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" size="sm" onClick={reset}>
                                Choose Different File
                            </Button>
                            <Button
                                size="sm"
                                disabled={dryRun.valid.length === 0 || importing}
                                onClick={handleConfirmImport}
                            >
                                {importing ? (
                                    <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Importing...</>
                                ) : (
                                    <>Import {dryRun.valid.length} ideas</>
                                )}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Import result */}
                {result && (
                    <div className="space-y-3 mt-2">
                        <div className="rounded-lg border p-4 text-center">
                            <Check className="h-8 w-8 mx-auto text-green-500 mb-2" />
                            <p className="font-medium">{result.imported} ideas imported</p>
                            {result.failed > 0 && (
                                <p className="text-sm text-red-500 mt-1">{result.failed} failed</p>
                            )}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={reset}>
                                Import More
                            </Button>
                            <Button size="sm" onClick={() => onOpenChange(false)}>
                                Done
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
