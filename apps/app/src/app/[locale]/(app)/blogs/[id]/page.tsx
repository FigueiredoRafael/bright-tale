"use client";

import React, { useEffect, useState, use } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    ArrowLeft,
    Eye,
    Save,
    Trash2,
    Download,
    ExternalLink,
    RefreshCw,
} from "lucide-react";
import BlogEditor from "@/components/production/BlogEditor";
import BlogPreview from "@/components/production/BlogPreview";
import type { BlogOutput } from "@brighttale/shared/types/agents";

interface BlogDraftFull {
    id: string;
    title: string;
    slug: string;
    meta_description: string;
    full_draft: string;
    outline: Array<{ h2: string; key_points: string[]; word_count_target: number }>;
    primary_keyword: string;
    secondary_keywords: string[];
    affiliate_integration: {
        placement: "intro" | "middle" | "conclusion";
        copy: string;
        product_link_placeholder: string;
        rationale: string;
    };
    internal_links_suggested: Array<{ topic: string; anchor_text: string }>;
    word_count: number;
    status: "draft" | "review" | "approved" | "published";
    project_id: string | null;
    idea_id: string | null;
    wordpress_post_id: number | null;
    wordpress_url: string | null;
    published_at: string | null;
    created_at: string;
    updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
    draft: "bg-muted text-foreground",
    review: "bg-warning/10 text-warning",
    approved: "bg-success/10 text-success",
    published: "bg-info/10 text-info",
};

export default function BlogDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const router = useRouter();

    const [blog, setBlog] = useState<BlogDraftFull | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [showPreview, setShowPreview] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        const fetchBlog = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/blogs/${id}`);
                const json = await res.json();
                if (json.error) {
                    setError(json.error.message || "Failed to load blog");
                } else {
                    setBlog(json.data.blog);
                }
            } catch (err) {
                setError("Failed to load blog");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchBlog();
    }, [id]);

    const handleSave = async (blogOutput: BlogOutput) => {
        setSaving(true);
        try {
            const res = await fetch(`/api/blogs/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(blogOutput),
            });
            const json = await res.json();
            if (!json.error) {
                // Refresh blog data
                setBlog((prev) =>
                    prev
                        ? {
                            ...prev,
                            ...blogOutput,
                            updated_at: new Date().toISOString(),
                        }
                        : null
                );
            }
        } catch (err) {
            console.error("Failed to save blog:", err);
        } finally {
            setSaving(false);
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        try {
            const res = await fetch(`/api/blogs/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            const json = await res.json();
            if (!json.error && blog) {
                setBlog({ ...blog, status: newStatus as BlogDraftFull["status"] });
            }
        } catch (err) {
            console.error("Failed to update status:", err);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            const res = await fetch(`/api/blogs/${id}`, { method: "DELETE" });
            if (res.ok) {
                router.push("/blogs");
            }
        } catch (err) {
            console.error("Failed to delete blog:", err);
        } finally {
            setDeleting(false);
        }
    };

    const handleExport = async (format: "markdown" | "html" | "json") => {
        const res = await fetch(`/api/blogs/${id}/export?format=${format}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const ext = format === "markdown" ? "md" : format;
        a.download = `${blog?.slug || "blog"}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="container mx-auto py-12 text-center">
                <RefreshCw className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">Loading blog...</p>
            </div>
        );
    }

    if (error || !blog) {
        return (
            <div className="container mx-auto py-12 text-center">
                <Card className="max-w-md mx-auto">
                    <CardContent className="py-8">
                        <p className="text-destructive mb-4">{error || "Blog not found"}</p>
                        <Link href="/blogs">
                            <Button variant="outline">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back to Blog Library
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const blogOutput: BlogOutput = {
        title: blog.title,
        slug: blog.slug,
        meta_description: blog.meta_description,
        full_draft: blog.full_draft,
        outline: blog.outline,
        primary_keyword: blog.primary_keyword,
        secondary_keywords: blog.secondary_keywords,
        affiliate_integration: blog.affiliate_integration,
        internal_links_suggested: blog.internal_links_suggested,
        word_count: blog.word_count,
    };

    return (
        <div className="container mx-auto py-8 px-4 max-w-6xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Link href="/blogs">
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold line-clamp-1">{blog.title}</h1>
                        <p className="text-sm text-muted-foreground font-mono">/{blog.slug}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={blog.status} onValueChange={handleStatusChange}>
                        <SelectTrigger className="w-[130px]">
                            <Badge className={STATUS_COLORS[blog.status]}>{blog.status}</Badge>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="review">In Review</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="published">Published</SelectItem>
                        </SelectContent>
                    </Select>
                    {blog.wordpress_url && (
                        <a href={blog.wordpress_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="gap-2">
                                <ExternalLink className="h-4 w-4" />
                                View on WordPress
                            </Button>
                        </a>
                    )}
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => router.push(`/blogs/${id}/preview`)}
                        className="gap-2"
                    >
                        <Eye className="h-4 w-4" />
                        Preview
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => handleExport("markdown")}
                        className="gap-2"
                    >
                        <Download className="h-4 w-4" />
                        Export
                    </Button>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        className="text-destructive hover:text-destructive/80 gap-2"
                        onClick={() => setDeleteDialogOpen(true)}
                    >
                        <Trash2 className="h-4 w-4" />
                        Delete
                    </Button>
                </div>
            </div>

            {/* Blog Editor */}
            <BlogEditor
                initialBlog={blogOutput}
                onSave={handleSave}
                onPreview={() => setShowPreview(true)}
                saving={saving}
            />

            {/* Preview Dialog */}
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Blog Preview</DialogTitle>
                        <DialogDescription>
                            Preview how your blog will appear when published
                        </DialogDescription>
                    </DialogHeader>
                    <BlogPreview
                        blog={blogOutput}
                        onClose={() => setShowPreview(false)}
                        onExportMarkdown={() => handleExport("markdown")}
                        onExportHtml={() => handleExport("html")}
                    />
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Blog?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{blog.title}&quot;? This action
                            cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            {deleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
