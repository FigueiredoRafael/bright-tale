"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { createSource, updateSource } from "@/lib/api/research";

interface SourceFormProps {
    researchId: string;
    source?: {
        id: string;
        url: string;
        title: string;
        author: string | null;
        date: string | null;
    };
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function SourceForm({
    researchId,
    source,
    open,
    onOpenChange,
    onSuccess,
}: SourceFormProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        url: source?.url || "",
        title: source?.title || "",
        author: source?.author || "",
        date: source?.date ? source.date.split("T")[0] : "",
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validateUrl = (url: string): boolean => {
        const urlPattern = /^https?:\/\/.+/i;
        return urlPattern.test(url);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors({});

        // Validation
        const newErrors: Record<string, string> = {};

        if (!formData.url.trim()) {
            newErrors.url = "URL is required";
        } else if (!validateUrl(formData.url)) {
            newErrors.url = "Please enter a valid URL (must start with http:// or https://)";
        }

        if (!formData.title.trim()) {
            newErrors.title = "Title is required";
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setLoading(true);

        try {
            const sourceData = {
                url: formData.url.trim(),
                title: formData.title.trim(),
                author: formData.author.trim() || undefined,
                date: formData.date ? `${formData.date}T00:00:00Z` : undefined,
            };

            if (source) {
                // Update existing source (DELETE + POST approach)
                await updateSource(researchId, source.id, sourceData);
            } else {
                // Create new source
                await createSource(researchId, sourceData);
            }

            toast({
                title: source ? "Source updated" : "Source added",
                description: `${formData.title} has been ${source ? "updated" : "added"} successfully.`,
            });

            onSuccess();
            onOpenChange(false);

            // Reset form
            setFormData({
                url: "",
                title: "",
                author: "",
                date: "",
            });
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to save source",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[525px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>{source ? "Edit Source" : "Add Source"}</DialogTitle>
                        <DialogDescription>
                            {source
                                ? "Update the source information below."
                                : "Add a new source to this research entry."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="url">
                                URL <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="url"
                                type="url"
                                placeholder="https://example.com/article"
                                value={formData.url}
                                onChange={(e) =>
                                    setFormData({ ...formData, url: e.target.value })
                                }
                                className={errors.url ? "border-destructive" : ""}
                            />
                            {errors.url && (
                                <p className="text-sm text-destructive">{errors.url}</p>
                            )}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="title">
                                Title <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="title"
                                placeholder="Source title"
                                value={formData.title}
                                onChange={(e) =>
                                    setFormData({ ...formData, title: e.target.value })
                                }
                                className={errors.title ? "border-destructive" : ""}
                            />
                            {errors.title && (
                                <p className="text-sm text-destructive">{errors.title}</p>
                            )}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="author">Author</Label>
                            <Input
                                id="author"
                                placeholder="Author name (optional)"
                                value={formData.author}
                                onChange={(e) =>
                                    setFormData({ ...formData, author: e.target.value })
                                }
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="date">Date</Label>
                            <Input
                                id="date"
                                type="date"
                                value={formData.date}
                                onChange={(e) =>
                                    setFormData({ ...formData, date: e.target.value })
                                }
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Saving..." : source ? "Update" : "Add"} Source
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
