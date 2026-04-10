"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AssetRecord } from "./ImageBankCard";

interface RegenerateDialogProps {
    asset: AssetRecord;
    onClose: () => void;
    onRegenerated: (asset: AssetRecord) => void;
}

export default function RegenerateDialog({ asset, onClose, onRegenerated }: RegenerateDialogProps) {
    const { toast } = useToast();
    const [prompt, setPrompt] = useState(asset.prompt ?? "");
    const [aspectRatio, setAspectRatio] = useState("16:9");
    const [generating, setGenerating] = useState(false);

    async function handleGenerate() {
        if (!prompt.trim()) {
            toast({ title: "Prompt required", variant: "destructive" });
            return;
        }

        setGenerating(true);
        try {
            const res = await fetch("/api/assets/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    project_id: asset.project_id ?? undefined,
                    content_type: asset.content_type ?? undefined,
                    content_id: asset.content_id ?? undefined,
                    role: asset.role ?? undefined,
                    numImages: 1,
                    aspectRatio,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error ?? "Generation failed");
            }

            const newAsset: AssetRecord = await res.json();
            onRegenerated(newAsset);
        } catch (error: unknown) {
            toast({
                title: "Generation failed",
                description: error instanceof Error ? error.message : "Unknown error",
                variant: "destructive",
            });
        } finally {
            setGenerating(false);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <RefreshCw className="h-5 w-5" />
                        Regenerate Image
                    </DialogTitle>
                    <DialogDescription>
                        Edit the prompt and generate a new version. The original image is kept in the bank.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                    {/* Current image preview */}
                    {asset.source_url && (
                        <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                            <img
                                src={asset.source_url}
                                alt="Current image"
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}

                    <div>
                        <Label htmlFor="regen-prompt" className="text-sm">Prompt</Label>
                        <Textarea
                            id="regen-prompt"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={4}
                            className="mt-1 text-sm"
                            placeholder="Describe the image..."
                        />
                        <p className="text-xs text-muted-foreground mt-1">{prompt.length}/500</p>
                    </div>

                    <div>
                        <Label className="text-sm">Aspect Ratio</Label>
                        <Select value={aspectRatio} onValueChange={setAspectRatio}>
                            <SelectTrigger className="mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                                <SelectItem value="1:1">1:1 (Square)</SelectItem>
                                <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                                <SelectItem value="4:3">4:3</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex gap-2">
                        <Button onClick={handleGenerate} disabled={generating} className="flex-1">
                            {generating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Generate New Version
                                </>
                            )}
                        </Button>
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
