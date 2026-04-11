"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { markdownToHtml as convertMarkdownToHtml } from "@/lib/utils";
import {
    ArrowLeft,
    Download,
    Copy,
    Check,
    ExternalLink,
    Share2,
    Link2,
    Tag,
    Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { BlogOutput } from "@brighttale/shared/types/agents";

interface BlogDraft {
    id: string;
    idea_id: string;
    title: string;
    slug: string;
    meta_description: string;
    primary_keyword: string;
    secondary_keywords: string[];
    full_draft: string;
    word_count: number;
    affiliate_integration: {
        placement: string;
        copy: string;
        product_link_placeholder: string;
        rationale: string;
    } | null;
    internal_links_suggested: Array<{
        topic: string;
        anchor_text: string;
    }>;
    created_at: string;
    updated_at: string;
    status: string;
}

// Convert markdown to HTML with Tailwind classes for preview styling
function markdownToHtml(markdown: string): string {
    if (!markdown) return "";

    // Use the shared utility to convert markdown to HTML
    let html = convertMarkdownToHtml(markdown);

    // Add Tailwind classes for preview styling
    html = html
        .replace(/<h1>/g, '<h1 class="text-2xl font-bold mt-4 mb-4 text-foreground">')
        .replace(/<h2>/g, '<h2 class="text-xl font-semibold mt-8 mb-3 text-foreground">')
        .replace(/<h3>/g, '<h3 class="text-lg font-semibold mt-6 mb-2">')
        .replace(/<h4>/g, '<h4 class="text-base font-semibold mt-4 mb-2">')
        .replace(/<p>/g, '<p class="my-4 text-foreground leading-relaxed">')
        .replace(/<ul>/g, '<ul class="list-disc list-inside my-4 space-y-1">')
        .replace(/<ol>/g, '<ol class="list-decimal list-inside my-4 space-y-1">')
        .replace(/<li>/g, '<li class="ml-4">')
        .replace(/<blockquote>/g, '<blockquote class="border-l-4 border-blue-500 pl-4 italic my-4 text-foreground/80">')
        .replace(/<code>/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">')
        .replace(/<pre>/g, '<pre class="bg-muted p-3 rounded-md overflow-x-auto text-sm my-4">')
        .replace(/<a /g, '<a class="text-info hover:underline" target="_blank" rel="noopener noreferrer" ')
        .replace(/<hr>/g, '<hr class="my-6 border-border">');

    return html;
}

function calculateReadingTime(wordCount: number): string {
    const wpm = 200;
    const minutes = Math.ceil(wordCount / wpm);
    return `${minutes} min read`;
}

export default function BlogPreviewPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const resolvedParams = use(params);
    const router = useRouter();
    const { toast } = useToast();
    const [blog, setBlog] = useState<BlogDraft | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        async function fetchBlog() {
            try {
                const res = await fetch(`/api/blogs/${resolvedParams.id}`);
                if (!res.ok) throw new Error("Failed to fetch blog");
                const data = await res.json();
                console.log("API response:", data);
                setBlog(data.data.blog);
            } catch (error) {
                console.error("Error fetching blog:", error);
                toast({
                    title: "Error",
                    description: "Failed to load blog preview",
                    variant: "destructive",
                });
                router.push("/blogs");
            } finally {
                setLoading(false);
            }
        }

        fetchBlog();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedParams.id]);

    const copyToClipboard = async () => {
        if (!blog) return;
        await navigator.clipboard.writeText(blog.full_draft);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({
            title: "Copied!",
            description: "Markdown copied to clipboard",
        });
    };

    const exportMarkdown = () => {
        if (!blog) return;
        const blob = new Blob([blog.full_draft], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${blog.slug}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({
            title: "Exported",
            description: "Markdown file downloaded",
        });
    };

    const exportHtml = () => {
        if (!blog) return;
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${blog.meta_description}">
    <meta name="keywords" content="${blog.primary_keyword}, ${blog.secondary_keywords.join(", ")}">
    <title>${blog.title}</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
        h1 { font-size: 2em; margin-bottom: 0.5em; }
        h2 { font-size: 1.5em; margin-top: 1.5em; margin-bottom: 0.5em; }
        h3 { font-size: 1.2em; margin-top: 1em; margin-bottom: 0.5em; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
        pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
        blockquote { border-left: 4px solid #3b82f6; padding-left: 15px; margin-left: 0; color: #555; }
        a { color: #3b82f6; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <article>
        ${markdownToHtml(blog.full_draft)}
    </article>
</body>
</html>`;

        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${blog.slug}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({
            title: "Exported",
            description: "HTML file downloaded",
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading preview...</p>
                </div>
            </div>
        );
    }

    if (!blog) {
        return null;
    }

    const htmlContent = markdownToHtml(blog.full_draft);
    const readingTime = calculateReadingTime(blog.word_count);

    return (
        <div className="min-h-screen bg-background">
            {/* Fixed Header */}
            <div className="sticky top-0 z-50 bg-background border-b">
                <div className="container mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.back()}
                                className="gap-2"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back
                            </Button>
                            <Separator orientation="vertical" className="h-6" />
                            <div className="flex items-center gap-2">
                                <Badge variant="outline">Preview Mode</Badge>
                                <span className="text-sm text-muted-foreground">
                                    {blog.word_count} words • {readingTime}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={copyToClipboard}
                                className="gap-2"
                            >
                                {copied ? (
                                    <Check className="h-4 w-4" />
                                ) : (
                                    <Copy className="h-4 w-4" />
                                )}
                                {copied ? "Copied!" : "Copy Markdown"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={exportMarkdown}
                                className="gap-2"
                            >
                                <Download className="h-4 w-4" />
                                Export .md
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={exportHtml}
                                className="gap-2"
                            >
                                <Download className="h-4 w-4" />
                                Export HTML
                            </Button>
                            <Separator orientation="vertical" className="h-6" />
                            <Button
                                variant="default"
                                size="sm"
                                onClick={() => router.push(`/blogs/${blog.id}`)}
                                className="gap-2"
                            >
                                Edit Post
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="container mx-auto px-4 py-8 max-w-4xl">
                {/* Meta Information Card */}
                <Card className="mb-6">
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground flex items-center gap-1 mb-1">
                                    <Link2 className="h-3 w-3" />
                                    URL Slug
                                </p>
                                <p className="font-mono text-xs bg-muted px-2 py-1 rounded truncate">
                                    /blog/{blog.slug}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground flex items-center gap-1 mb-1">
                                    <Tag className="h-3 w-3" />
                                    Primary Keyword
                                </p>
                                <p className="truncate font-medium">{blog.primary_keyword || "Not set"}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground flex items-center gap-1 mb-1">
                                    <Clock className="h-3 w-3" />
                                    Reading Time
                                </p>
                                <p className="font-medium">{readingTime}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground mb-1">Word Count</p>
                                <p className="font-medium">{(blog.word_count || 0).toLocaleString()}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Search Result Preview */}
                <Card className="mb-6 border-success/20 bg-success/5">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-success flex items-center gap-2">
                            <ExternalLink className="h-4 w-4" />
                            Search Result Preview
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-1">
                            <p className="text-info hover:underline cursor-pointer text-lg font-medium">
                                {blog.title}
                            </p>
                            <p className="text-success text-sm font-mono">
                                brightcurios.com › blog › {blog.slug}
                            </p>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {blog.meta_description || "No meta description set."}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Secondary Keywords */}
                {blog.secondary_keywords && blog.secondary_keywords.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                        <span className="text-sm text-muted-foreground">Keywords:</span>
                        {blog.secondary_keywords.map((kw, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                                {kw}
                            </Badge>
                        ))}
                    </div>
                )}

                <Separator className="my-6" />

                {/* Blog Content */}
                <article className="prose prose-gray max-w-none">
                    <div
                        dangerouslySetInnerHTML={{ __html: htmlContent }}
                        className="blog-content"
                    />
                </article>

                <Separator className="my-8" />

                {/* Affiliate Integration */}
                {blog.affiliate_integration && blog.affiliate_integration.copy && (
                    <Card className="mb-6 border-warning/20 bg-warning/5">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm text-warning">
                                Affiliate Integration
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="capitalize">
                                    {blog.affiliate_integration.placement}
                                </Badge>
                                <span className="text-muted-foreground">placement</span>
                            </div>
                            <div className="bg-card p-3 rounded border">
                                <p>{blog.affiliate_integration.copy}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                <strong>Link Placeholder:</strong>{" "}
                                <code className="bg-muted px-1 py-0.5 rounded">
                                    {blog.affiliate_integration.product_link_placeholder}
                                </code>
                            </p>
                            {blog.affiliate_integration.rationale && (
                                <p className="text-xs text-muted-foreground italic">
                                    {blog.affiliate_integration.rationale}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Internal Links */}
                {blog.internal_links_suggested && blog.internal_links_suggested.length > 0 && (
                    <Card className="mb-6">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm">Suggested Internal Links</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2">
                                {blog.internal_links_suggested.map((link, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm">
                                        <Link2 className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                                        <div>
                                            <p className="font-medium">{link.topic}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Anchor: "{link.anchor_text}"
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
