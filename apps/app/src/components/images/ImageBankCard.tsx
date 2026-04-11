"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
    Download,
    Trash2,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    FolderOpen,
} from "lucide-react";

export interface AssetRecord {
    id: string;
    project_id: string | null;
    asset_type: string;
    source: string;
    source_url: string | null;
    local_path: string | null;
    prompt: string | null;
    role: string | null;
    content_type: string | null;
    content_id: string | null;
    alt_text: string | null;
    created_at: string;
}

interface ImageBankCardProps {
    asset: AssetRecord;
    projectName?: string;
    selected?: boolean;
    onSelect?: (id: string, selected: boolean) => void;
    onDelete: (id: string) => void;
    onRegenerate: (id: string, prompt: string) => void;
}

const roleLabels: Record<string, string> = {
    featured: "Featured",
    thumbnail_option_1: "Thumbnail 1",
    thumbnail_option_2: "Thumbnail 2",
};

function getRoleLabel(role: string): string {
    if (roleLabels[role]) return roleLabels[role];
    const sectionMatch = role.match(/^section_(\d+)$/);
    if (sectionMatch) return `Section ${sectionMatch[1]}`;
    const chapterMatch = role.match(/^chapter_(\d+)$/);
    if (chapterMatch) return `Chapter ${chapterMatch[1]}`;
    return role;
}

const contentTypeColors: Record<string, string> = {
    blog: "bg-blue-100 text-blue-800",
    video: "bg-red-100 text-red-800",
    shorts: "bg-purple-100 text-purple-800",
    podcast: "bg-green-100 text-green-800",
};

export default function ImageBankCard({
    asset,
    projectName,
    selected = false,
    onSelect,
    onDelete,
    onRegenerate,
}: ImageBankCardProps) {
    const [promptExpanded, setPromptExpanded] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const imageUrl = asset.source_url ?? "";
    const promptText = asset.prompt ?? "";
    const shortPrompt = promptText.length > 100 ? promptText.slice(0, 100) + "…" : promptText;

    function handleDownload() {
        window.open(`/api/assets/${asset.id}/download`, "_blank");
    }

    function handleDelete() {
        if (!confirmDelete) {
            setConfirmDelete(true);
            setTimeout(() => setConfirmDelete(false), 3000);
            return;
        }
        onDelete(asset.id);
    }

    return (
        <Card className={`overflow-hidden group transition-all ${selected ? "ring-2 ring-primary" : ""}`}>
            {/* Selection checkbox overlay */}
            {onSelect && (
                <div className="absolute top-2 left-2 z-10">
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => onSelect(asset.id, e.target.checked)}
                        className="h-4 w-4 rounded border-border cursor-pointer"
                    />
                </div>
            )}

            {/* Image */}
            <div className="relative aspect-video bg-muted overflow-hidden">
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={asset.alt_text ?? promptText.slice(0, 50)}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        No preview
                    </div>
                )}
                {/* Hover action bar */}
                <div className="absolute bottom-0 inset-x-0 bg-black/60 p-2 flex gap-1 translate-y-full group-hover:translate-y-0 transition-transform">
                    <Button size="sm" variant="secondary" className="h-7 text-xs flex-1" onClick={handleDownload}>
                        <Download className="h-3 w-3 mr-1" />
                        Download
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs flex-1"
                        onClick={() => onRegenerate(asset.id, promptText)}
                        disabled={!promptText}
                    >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Regen
                    </Button>
                    <Button
                        size="sm"
                        variant={confirmDelete ? "destructive" : "secondary"}
                        className="h-7 text-xs"
                        onClick={handleDelete}
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            <CardContent className="p-3 space-y-2">
                {/* Badges */}
                <div className="flex flex-wrap gap-1">
                    {asset.content_type && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${contentTypeColors[asset.content_type] ?? "bg-muted text-foreground"}`}>
                            {asset.content_type}
                        </span>
                    )}
                    {asset.role && (
                        <Badge variant="outline" className="text-xs h-5">
                            {getRoleLabel(asset.role)}
                        </Badge>
                    )}
                    {!asset.project_id && (
                        <Badge variant="secondary" className="text-xs h-5">Standalone</Badge>
                    )}
                </div>

                {/* Project name */}
                {projectName && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <FolderOpen className="h-3 w-3 shrink-0" />
                        {projectName}
                    </p>
                )}

                {/* Prompt */}
                {promptText && (
                    <div>
                        <p className="text-xs text-muted-foreground">
                            {promptExpanded ? promptText : shortPrompt}
                        </p>
                        {promptText.length > 100 && (
                            <button
                                onClick={() => setPromptExpanded(!promptExpanded)}
                                className="text-xs text-primary flex items-center gap-0.5 mt-0.5"
                            >
                                {promptExpanded ? (
                                    <><ChevronUp className="h-3 w-3" /> Less</>
                                ) : (
                                    <><ChevronDown className="h-3 w-3" /> More</>
                                )}
                            </button>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
