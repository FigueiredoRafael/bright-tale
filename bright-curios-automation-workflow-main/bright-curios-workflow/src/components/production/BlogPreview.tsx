"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { markdownToHtml as convertMarkdownToHtml } from "@/lib/utils";
import {
    Download,
    Copy,
    Check,
    ExternalLink,
    Calendar,
    Clock,
    User,
    Tag,
    Link2,
} from "lucide-react";
import type { BlogOutput } from "@/types/agents";

interface BlogPreviewProps {
    blog: BlogOutput;
    onClose?: () => void;
    onExportMarkdown?: () => void;
    onExportHtml?: () => void;
}

// Convert markdown to HTML with Tailwind classes for preview styling
function markdownToHtml(markdown: string): string {
    if (!markdown) return "";

    // Use the shared utility to convert markdown to HTML
    let html = convertMarkdownToHtml(markdown);

    // Add Tailwind classes for preview styling
    html = html
        .replace(/<h1>/g, '<h1 class="text-2xl font-bold mt-4 mb-4 text-gray-900">')
        .replace(/<h2>/g, '<h2 class="text-xl font-semibold mt-8 mb-3 text-gray-900">')
        .replace(/<h3>/g, '<h3 class="text-lg font-semibold mt-6 mb-2">')
        .replace(/<h4>/g, '<h4 class="text-base font-semibold mt-4 mb-2">')
        .replace(/<p>/g, '<p class="my-4 text-gray-800 leading-relaxed">')
        .replace(/<ul>/g, '<ul class="list-disc list-inside my-4 space-y-1">')
        .replace(/<ol>/g, '<ol class="list-decimal list-inside my-4 space-y-1">')
        .replace(/<li>/g, '<li class="ml-4">')
        .replace(/<blockquote>/g, '<blockquote class="border-l-4 border-blue-500 pl-4 italic my-4 text-gray-700">')
        .replace(/<code>/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm">')
        .replace(/<pre>/g, '<pre class="bg-gray-100 p-3 rounded-md overflow-x-auto text-sm my-4">')
        .replace(/<a /g, '<a class="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer" ')
        .replace(/<hr>/g, '<hr class="my-6 border-gray-300">');

    return html;
}

// Calculate reading time
function calculateReadingTime(wordCount: number): string {
    const wpm = 200; // average reading speed
    const minutes = Math.ceil(wordCount / wpm);
    return `${minutes} min read`;
}

export default function BlogPreview({
    blog,
    onClose,
    onExportMarkdown,
    onExportHtml,
}: BlogPreviewProps) {
    const [copied, setCopied] = React.useState(false);

    const htmlContent = markdownToHtml(blog.full_draft);
    const readingTime = calculateReadingTime(blog.word_count);

    const copyToClipboard = async () => {
        await navigator.clipboard.writeText(blog.full_draft);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="w-full mx-auto">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-background py-3 border-b">
                <div className="flex items-center gap-2">
                    <Badge variant="outline">Preview Mode</Badge>
                    <span className="text-sm text-muted-foreground">
                        {blog.word_count} words • {readingTime}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-2">
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? "Copied!" : "Copy Markdown"}
                    </Button>
                    {onExportMarkdown && (
                        <Button variant="outline" size="sm" onClick={onExportMarkdown} className="gap-2">
                            <Download className="h-4 w-4" />
                            Export .md
                        </Button>
                    )}
                    {onExportHtml && (
                        <Button variant="outline" size="sm" onClick={onExportHtml} className="gap-2">
                            <Download className="h-4 w-4" />
                            Export HTML
                        </Button>
                    )}
                    {onClose && (
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            Close
                        </Button>
                    )}
                </div>
            </div>

            {/* Meta Information Card */}
            <Card className="mb-6">
                <CardContent className="pt-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <p className="text-muted-foreground flex items-center gap-1">
                                <Link2 className="h-3 w-3" />
                                URL Slug
                            </p>
                            <p className="font-mono text-xs truncate">/blog/{blog.slug}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                Primary Keyword
                            </p>
                            <p className="truncate">{blog.primary_keyword || "Not set"}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Reading Time
                            </p>
                            <p>{readingTime}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Word Count</p>
                            <p>{blog.word_count}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Meta Description Preview (Search Result) */}
            <Card className="mb-6 border-green-200 bg-green-50/30">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-green-800">Search Result Preview</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-1">
                        <p className="text-blue-700 hover:underline cursor-pointer text-lg">
                            {blog.title}
                        </p>
                        <p className="text-green-700 text-sm">
                            brightcurios.com › blog › {blog.slug}
                        </p>
                        <p className="text-sm text-gray-600">
                            {blog.meta_description || "No meta description set."}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Secondary Keywords */}
            {blog.secondary_keywords && blog.secondary_keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4">
                    {blog.secondary_keywords.map((kw, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                            {kw}
                        </Badge>
                    ))}
                </div>
            )}

            <Separator className="my-6" />

            {/* Blog Content Preview */}
            <article className="prose prose-gray max-w-none">
                <div
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                    className="blog-content"
                />
            </article>

            <Separator className="my-8" />

            {/* Affiliate Integration Info */}
            {blog.affiliate_integration && blog.affiliate_integration.copy && (
                <Card className="mb-6 border-yellow-200 bg-yellow-50/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-yellow-800">Affiliate Integration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize">
                                {blog.affiliate_integration.placement}
                            </Badge>
                            <span className="text-muted-foreground">placement</span>
                        </div>
                        <p className="bg-white p-2 rounded border">
                            {blog.affiliate_integration.copy}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            <strong>Link Placeholder:</strong>{" "}
                            <code className="bg-gray-100 px-1">{blog.affiliate_integration.product_link_placeholder}</code>
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
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Suggested Internal Links</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {blog.internal_links_suggested.map((link, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm">
                                    <Link2 className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-muted-foreground">{link.topic}:</span>
                                    <span className="text-blue-600 cursor-pointer hover:underline">
                                        {link.anchor_text}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {/* Outline Summary */}
            {blog.outline && blog.outline.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Content Outline</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ol className="space-y-2">
                            {blog.outline.map((section, i) => (
                                <li key={i} className="text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">
                                            {i + 1}. {section.h2}
                                        </span>
                                        <Badge variant="outline" className="text-xs">
                                            ~{section.word_count_target} words
                                        </Badge>
                                    </div>
                                    {section.key_points && section.key_points.length > 0 && (
                                        <ul className="mt-1 ml-4 text-muted-foreground">
                                            {section.key_points.map((point, j) => (
                                                <li key={j} className="text-xs">• {point}</li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            ))}
                        </ol>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
