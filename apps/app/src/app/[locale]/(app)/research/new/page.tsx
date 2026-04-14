"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const THEMES = [
    "Psychology",
    "Productivity",
    "Science",
    "Technology",
    "Business",
    "Health",
    "Education",
    "Philosophy",
    "History",
    "Art",
];

export default function NewResearchPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState("");
    const [theme, setTheme] = useState("");
    const [researchContent, setResearchContent] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors({});

        // Validation
        const newErrors: Record<string, string> = {};

        if (!title.trim() || title.trim().length < 3) {
            newErrors.title = "Title must be at least 3 characters";
        }

        if (!theme) {
            newErrors.theme = "Theme is required";
        }

        if (!researchContent.trim() || researchContent.trim().length < 10) {
            newErrors.researchContent = "Content must be at least 10 characters";
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setLoading(true);

        try {
            const response = await fetch("/api/research", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title: title.trim(),
                    theme,
                    research_content: researchContent.trim(),
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || "Failed to create research");
            }

            const data = await response.json();

            toast({
                title: "Research created",
                description: "Your research entry has been created successfully.",
            });

            router.push(`/research/${data.id}`);
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error",
                description:
                    error instanceof Error ? error.message : "Failed to create research",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto py-8 px-4 max-w-4xl">
            <div className="mb-6">
                <Button
                    variant="outline"
                    onClick={() => router.push("/research")}
                    className="mb-4"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Library
                </Button>
                <h1 className="text-3xl font-bold">Create New Research</h1>
                <p className="text-muted-foreground mt-2">
                    Add a new research entry to your library
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Research Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Title */}
                        <div className="space-y-2">
                            <Label htmlFor="title">
                                Title <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Enter research title"
                                className={errors.title ? "border-destructive" : ""}
                            />
                            {errors.title && (
                                <p className="text-sm text-destructive">{errors.title}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                {title.length} characters
                            </p>
                        </div>

                        {/* Theme */}
                        <div className="space-y-2">
                            <Label htmlFor="theme">
                                Theme <span className="text-destructive">*</span>
                            </Label>
                            <Select value={theme} onValueChange={setTheme}>
                                <SelectTrigger
                                    className={errors.theme ? "border-destructive" : ""}
                                >
                                    <SelectValue placeholder="Select a theme" />
                                </SelectTrigger>
                                <SelectContent>
                                    {THEMES.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {t}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.theme && (
                                <p className="text-sm text-destructive">{errors.theme}</p>
                            )}
                        </div>

                        {/* Research Content */}
                        <div className="space-y-2">
                            <Label htmlFor="content">
                                Research Content <span className="text-destructive">*</span>
                            </Label>
                            <Textarea
                                id="content"
                                value={researchContent}
                                onChange={(e) => setResearchContent(e.target.value)}
                                placeholder="Enter your research content here..."
                                rows={12}
                                className={errors.researchContent ? "border-destructive" : ""}
                            />
                            {errors.researchContent && (
                                <p className="text-sm text-destructive">
                                    {errors.researchContent}
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                {researchContent.length} characters
                            </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => router.push("/research")}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading}>
                                <Save className="h-4 w-4 mr-2" />
                                {loading ? "Creating..." : "Create Research"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
