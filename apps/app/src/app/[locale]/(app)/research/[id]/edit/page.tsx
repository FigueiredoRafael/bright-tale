"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Save, AlertCircle, RefreshCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchResearchDetail, updateResearch } from "@/lib/api/research";

const THEMES = [
    "Psychology",
    "Productivity",
    "Health",
    "Science",
    "Technology",
    "Business",
    "Lifestyle",
    "Education",
    "Finance",
    "Personal Development",
];

interface ResearchData {
    id: string;
    title: string;
    theme: string | null;
    research_content: string;
}

export default function ResearchEditPage() {
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const id = params.id as string;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [research, setResearch] = useState<ResearchData | null>(null);

    // Form state
    const [title, setTitle] = useState("");
    const [theme, setTheme] = useState("");
    const [researchContent, setResearchContent] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        fetchResearch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const fetchResearch = async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await fetchResearchDetail(id);
            setResearch(data);

            // Pre-fill form
            setTitle(data.title || "");
            setTheme(data.theme || "");
            setResearchContent(data.research_content || "");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load research");
        } finally {
            setLoading(false);
        }
    };

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!title.trim()) {
            newErrors.title = "Title is required";
        } else if (title.trim().length < 3) {
            newErrors.title = "Title must be at least 3 characters";
        }

        if (!theme) {
            newErrors.theme = "Theme is required";
        }

        if (!researchContent.trim()) {
            newErrors.researchContent = "Research content is required";
        } else if (researchContent.trim().length < 10) {
            newErrors.researchContent = "Research content must be at least 10 characters";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        setSaving(true);

        try {
            await updateResearch(id, {
                title: title.trim(),
                theme: theme,
                research_content: researchContent.trim(),
            });

            toast({
                title: "Research updated",
                description: "Your changes have been saved successfully.",
            });

            router.push(`/research/${id}`);
        } catch (err) {
            toast({
                variant: "destructive",
                title: "Error",
                description: err instanceof Error ? err.message : "Failed to update research",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        router.push(`/research/${id}`);
    };

    // Loading State
    if (loading) {
        return (
            <div className="container mx-auto py-8 px-4 max-w-4xl">
                <Skeleton className="h-8 w-32 mb-6" />
                <Skeleton className="h-12 w-1/2 mb-4" />
                <Skeleton className="h-[600px] w-full" />
            </div>
        );
    }

    // 404 State
    if (error === "Research not found") {
        return (
            <div className="container mx-auto py-16 px-4">
                <div className="text-center">
                    <div className="text-6xl mb-4">🔍</div>
                    <h1 className="text-3xl font-bold mb-2">Research Not Found</h1>
                    <p className="text-muted-foreground mb-6">
                        The research entry you&apos;re trying to edit doesn&apos;t exist.
                    </p>
                    <Button onClick={() => router.push("/research")}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Library
                    </Button>
                </div>
            </div>
        );
    }

    // Error State
    if (error || !research) {
        return (
            <div className="container mx-auto py-8 px-4">
                <Alert variant="destructive" className="mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                        <span>{error || "Failed to load research"}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchResearch}
                            className="ml-4"
                        >
                            <RefreshCcw className="h-4 w-4 mr-2" />
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
                <Button variant="outline" onClick={() => router.push("/research")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Library
                </Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 px-4 max-w-4xl">
            {/* Header */}
            <div className="mb-8">
                <Button
                    variant="ghost"
                    onClick={() => router.push(`/research/${id}`)}
                    className="mb-4"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Details
                </Button>

                <h1 className="text-4xl font-bold">Edit Research</h1>
                <p className="text-muted-foreground mt-2">
                    Update the research information below
                </p>
            </div>

            {/* Edit Form */}
            <Card>
                <CardHeader>
                    <CardTitle>Research Information</CardTitle>
                    <CardDescription>
                        Make changes to your research entry
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Title Field */}
                        <div className="space-y-2">
                            <Label htmlFor="title">
                                Title <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="title"
                                placeholder="Enter research title"
                                value={title}
                                onChange={(e) => {
                                    setTitle(e.target.value);
                                    if (errors.title) {
                                        setErrors({ ...errors, title: "" });
                                    }
                                }}
                                className={errors.title ? "border-destructive" : ""}
                            />
                            {errors.title && (
                                <p className="text-sm text-destructive">{errors.title}</p>
                            )}
                        </div>

                        {/* Theme Field */}
                        <div className="space-y-2">
                            <Label htmlFor="theme">
                                Theme <span className="text-destructive">*</span>
                            </Label>
                            <Select
                                value={theme}
                                onValueChange={(value) => {
                                    setTheme(value);
                                    if (errors.theme) {
                                        setErrors({ ...errors, theme: "" });
                                    }
                                }}
                            >
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

                        {/* Research Content Field */}
                        <div className="space-y-2">
                            <Label htmlFor="content">
                                Research Content <span className="text-destructive">*</span>
                            </Label>
                            <Textarea
                                id="content"
                                placeholder="Enter your research content here..."
                                value={researchContent}
                                onChange={(e) => {
                                    setResearchContent(e.target.value);
                                    if (errors.researchContent) {
                                        setErrors({ ...errors, researchContent: "" });
                                    }
                                }}
                                className={`min-h-[400px] ${errors.researchContent ? "border-destructive" : ""}`}
                            />
                            {errors.researchContent && (
                                <p className="text-sm text-destructive">
                                    {errors.researchContent}
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Character count: {researchContent.length}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 pt-4">
                            <Button type="submit" disabled={saving}>
                                <Save className="h-4 w-4 mr-2" />
                                {saving ? "Saving..." : "Save Changes"}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleCancel}
                                disabled={saving}
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
