"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Save,
    Eye,
    Edit3,
    Plus,
    Trash2,
    ChevronDown,
    ChevronUp,
    GripVertical,
    Link2,
    Search,
    Image,
    BarChart2,
    Quote,
    AlertTriangle,
    FileText,
    Download,
    Copy,
    Check,
} from "lucide-react";
import type { BlogOutput } from "@brighttale/shared/types/agents";

// Blog section for the outline builder
interface OutlineSection {
    id: string;
    h2: string;
    key_points: string[];
    word_count_target: number;
    expanded: boolean;
}

// Internal link suggestion
interface InternalLink {
    topic: string;
    anchor_text: string;
    target_url?: string;
}

interface BlogEditorProps {
    initialBlog?: Partial<BlogOutput>;
    onSave: (blog: BlogOutput) => void;
    onPreview?: () => void;
    saving?: boolean;
    // Optional research context for AI assistance
    researchContext?: {
        key_statistics?: Array<{ claim: string; figure: string; context: string }>;
        expert_quotes?: Array<{ quote: string; author: string; credentials: string }>;
        key_sources?: Array<{ title: string; url: string; key_insight: string }>;
    };
}

export default function BlogEditor({
    initialBlog,
    onSave,
    onPreview,
    saving,
    researchContext,
}: BlogEditorProps) {
    const [activeTab, setActiveTab] = useState<"metadata" | "outline" | "draft" | "seo">("metadata");
    const [copied, setCopied] = useState(false);

    // Blog state
    const [title, setTitle] = useState(initialBlog?.title || "");
    const [slug, setSlug] = useState(initialBlog?.slug || "");
    const [metaDescription, setMetaDescription] = useState(initialBlog?.meta_description || "");
    const [primaryKeyword, setPrimaryKeyword] = useState(initialBlog?.primary_keyword || "");
    const [secondaryKeywords, setSecondaryKeywords] = useState<string[]>(
        initialBlog?.secondary_keywords || []
    );
    const [newKeyword, setNewKeyword] = useState("");

    // Outline state
    const [outlineSections, setOutlineSections] = useState<OutlineSection[]>(() => {
        if (initialBlog?.outline) {
            return initialBlog.outline.map((section, idx) => ({
                id: `section-${idx}`,
                h2: section.h2,
                key_points: section.key_points || [],
                word_count_target: section.word_count_target || 300,
                expanded: true,
            }));
        }
        return [];
    });

    // Draft state
    const [fullDraft, setFullDraft] = useState(initialBlog?.full_draft || "");

    // Affiliate state
    const [affiliatePlacement, setAffiliatePlacement] = useState<"intro" | "middle" | "conclusion">(
        (initialBlog?.affiliate_integration?.placement as "intro" | "middle" | "conclusion") || "middle"
    );
    const [affiliateCopy, setAffiliateCopy] = useState(initialBlog?.affiliate_integration?.copy || "");
    const [affiliateLink, setAffiliateLink] = useState(
        initialBlog?.affiliate_integration?.product_link_placeholder || "[AFFILIATE_LINK]"
    );
    const [affiliateRationale, setAffiliateRationale] = useState(
        initialBlog?.affiliate_integration?.rationale || ""
    );

    // Internal links
    const [internalLinks, setInternalLinks] = useState<InternalLink[]>(
        initialBlog?.internal_links_suggested || []
    );

    // Auto-generate slug from title
    useEffect(() => {
        if (title && !slug) {
            const generatedSlug = title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
            setSlug(generatedSlug);
        }
    }, [title, slug]);

    // Calculate word count
    const wordCount = fullDraft.split(/\s+/).filter(Boolean).length;

    // Calculate meta description character count
    const metaCharCount = metaDescription.length;
    const metaCharValid = metaCharCount >= 140 && metaCharCount <= 160;

    // Handle section operations
    const addSection = () => {
        const newSection: OutlineSection = {
            id: `section-${Date.now()}`,
            h2: "",
            key_points: [""],
            word_count_target: 300,
            expanded: true,
        };
        setOutlineSections([...outlineSections, newSection]);
    };

    const updateSection = (id: string, updates: Partial<OutlineSection>) => {
        setOutlineSections(sections =>
            sections.map(s => (s.id === id ? { ...s, ...updates } : s))
        );
    };

    const removeSection = (id: string) => {
        setOutlineSections(sections => sections.filter(s => s.id !== id));
    };

    const addKeyPoint = (sectionId: string) => {
        setOutlineSections(sections =>
            sections.map(s =>
                s.id === sectionId ? { ...s, key_points: [...s.key_points, ""] } : s
            )
        );
    };

    const updateKeyPoint = (sectionId: string, index: number, value: string) => {
        setOutlineSections(sections =>
            sections.map(s =>
                s.id === sectionId
                    ? {
                        ...s,
                        key_points: s.key_points.map((kp, i) => (i === index ? value : kp)),
                    }
                    : s
            )
        );
    };

    const removeKeyPoint = (sectionId: string, index: number) => {
        setOutlineSections(sections =>
            sections.map(s =>
                s.id === sectionId
                    ? { ...s, key_points: s.key_points.filter((_, i) => i !== index) }
                    : s
            )
        );
    };

    // Handle keywords
    const addKeyword = () => {
        if (newKeyword.trim() && !secondaryKeywords.includes(newKeyword.trim())) {
            setSecondaryKeywords([...secondaryKeywords, newKeyword.trim()]);
            setNewKeyword("");
        }
    };

    const removeKeyword = (keyword: string) => {
        setSecondaryKeywords(secondaryKeywords.filter(k => k !== keyword));
    };

    // Handle internal links
    const addInternalLink = () => {
        setInternalLinks([...internalLinks, { topic: "", anchor_text: "" }]);
    };

    const updateInternalLink = (index: number, updates: Partial<InternalLink>) => {
        setInternalLinks(links =>
            links.map((l, i) => (i === index ? { ...l, ...updates } : l))
        );
    };

    const removeInternalLink = (index: number) => {
        setInternalLinks(links => links.filter((_, i) => i !== index));
    };

    // Copy draft to clipboard
    const copyDraft = async () => {
        await navigator.clipboard.writeText(fullDraft);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Generate outline from sections
    const generateOutlineMarkdown = () => {
        let outline = "";
        outlineSections.forEach(section => {
            outline += `## ${section.h2}\n\n`;
            section.key_points.forEach(point => {
                if (point.trim()) outline += `- ${point}\n`;
            });
            outline += "\n";
        });
        return outline;
    };

    // Insert text at cursor in draft
    const insertAtCursor = (text: string) => {
        const textarea = document.getElementById("blog-draft") as HTMLTextAreaElement;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = fullDraft.substring(0, start) + text + fullDraft.substring(end);
        setFullDraft(newValue);

        // Reset cursor position
        setTimeout(() => {
            textarea.selectionStart = start + text.length;
            textarea.selectionEnd = start + text.length;
            textarea.focus();
        }, 0);
    };

    // Build and save blog output
    const handleSave = () => {
        const blog: BlogOutput = {
            title,
            slug,
            meta_description: metaDescription,
            primary_keyword: primaryKeyword,
            secondary_keywords: secondaryKeywords,
            outline: outlineSections.map(s => ({
                h2: s.h2,
                key_points: s.key_points.filter(Boolean),
                word_count_target: s.word_count_target,
            })),
            full_draft: fullDraft,
            affiliate_integration: {
                placement: affiliatePlacement,
                copy: affiliateCopy,
                product_link_placeholder: affiliateLink,
                rationale: affiliateRationale,
            },
            internal_links_suggested: internalLinks.filter(l => l.topic && l.anchor_text),
            word_count: wordCount,
        };
        onSave(blog);
    };

    return (
        <div className="space-y-6">
            {/* Header with actions */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Blog Post Editor</h2>
                    <p className="text-sm text-muted-foreground">
                        {wordCount} words • {outlineSections.length} sections
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {onPreview && (
                        <Button variant="outline" onClick={onPreview} className="gap-2">
                            <Eye className="h-4 w-4" />
                            Preview
                        </Button>
                    )}
                    <Button onClick={handleSave} disabled={saving} className="gap-2">
                        <Save className="h-4 w-4" />
                        {saving ? "Saving..." : "Save Blog"}
                    </Button>
                </div>
            </div>

            {/* Editor Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="metadata" className="gap-2">
                        <Edit3 className="h-4 w-4" />
                        Metadata
                    </TabsTrigger>
                    <TabsTrigger value="outline" className="gap-2">
                        <FileText className="h-4 w-4" />
                        Outline
                    </TabsTrigger>
                    <TabsTrigger value="draft" className="gap-2">
                        <Edit3 className="h-4 w-4" />
                        Draft
                    </TabsTrigger>
                    <TabsTrigger value="seo" className="gap-2">
                        <Search className="h-4 w-4" />
                        SEO & Links
                    </TabsTrigger>
                </TabsList>

                {/* METADATA TAB */}
                <TabsContent value="metadata" className="space-y-4 mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Basic Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="title">Blog Title</Label>
                                <Input
                                    id="title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Enter a compelling blog title..."
                                    className="mt-1"
                                />
                            </div>

                            <div>
                                <Label htmlFor="slug">
                                    URL Slug
                                    <span className="text-xs text-muted-foreground ml-2">
                                        /blog/{slug || "your-post-url"}
                                    </span>
                                </Label>
                                <Input
                                    id="slug"
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                                    placeholder="url-friendly-slug"
                                    className="mt-1 font-mono text-sm"
                                />
                            </div>

                            <div>
                                <Label htmlFor="meta">
                                    Meta Description
                                    <span className={`text-xs ml-2 ${metaCharValid ? "text-green-600" : "text-orange-600"}`}>
                                        {metaCharCount}/160 characters
                                    </span>
                                </Label>
                                <Textarea
                                    id="meta"
                                    value={metaDescription}
                                    onChange={(e) => setMetaDescription(e.target.value)}
                                    placeholder="A compelling description for search results (140-160 chars ideal)..."
                                    className="mt-1"
                                    maxLength={200}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Affiliate Integration</CardTitle>
                            <CardDescription className="text-xs">
                                Natural monetization placement
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label>Placement</Label>
                                <div className="flex gap-2 mt-1">
                                    {(["intro", "middle", "conclusion"] as const).map((p) => (
                                        <Button
                                            key={p}
                                            variant={affiliatePlacement === p ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setAffiliatePlacement(p)}
                                        >
                                            {p.charAt(0).toUpperCase() + p.slice(1)}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="affiliate-copy">Affiliate Copy</Label>
                                <Textarea
                                    id="affiliate-copy"
                                    value={affiliateCopy}
                                    onChange={(e) => setAffiliateCopy(e.target.value)}
                                    placeholder="The actual text mentioning the affiliate product..."
                                    className="mt-1"
                                />
                            </div>

                            <div>
                                <Label htmlFor="affiliate-link">Link Placeholder</Label>
                                <Input
                                    id="affiliate-link"
                                    value={affiliateLink}
                                    onChange={(e) => setAffiliateLink(e.target.value)}
                                    placeholder="[AFFILIATE_LINK]"
                                    className="mt-1 font-mono text-sm"
                                />
                            </div>

                            <div>
                                <Label htmlFor="affiliate-rationale">Why This Placement Works</Label>
                                <Input
                                    id="affiliate-rationale"
                                    value={affiliateRationale}
                                    onChange={(e) => setAffiliateRationale(e.target.value)}
                                    placeholder="Contextual fit and reader benefit..."
                                    className="mt-1"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* OUTLINE TAB */}
                <TabsContent value="outline" className="space-y-4 mt-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Build your blog structure. Each section becomes an H2.
                        </p>
                        <Button onClick={addSection} variant="outline" size="sm" className="gap-2">
                            <Plus className="h-4 w-4" />
                            Add Section
                        </Button>
                    </div>

                    {outlineSections.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="py-8 text-center text-muted-foreground">
                                <FileText className="h-8 w-8 mx-auto mb-2" />
                                <p>No sections yet. Add your first section to start building the outline.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {outlineSections.map((section, idx) => (
                                <Card key={section.id}>
                                    <Collapsible
                                        open={section.expanded}
                                        onOpenChange={(open) => updateSection(section.id, { expanded: open })}
                                    >
                                        <CardHeader className="py-3">
                                            <div className="flex items-center gap-2">
                                                <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                                                <CollapsibleTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="p-1">
                                                        {section.expanded ? (
                                                            <ChevronUp className="h-4 w-4" />
                                                        ) : (
                                                            <ChevronDown className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </CollapsibleTrigger>
                                                <Badge variant="outline" className="text-xs">
                                                    H2 #{idx + 1}
                                                </Badge>
                                                <Input
                                                    value={section.h2}
                                                    onChange={(e) => updateSection(section.id, { h2: e.target.value })}
                                                    placeholder="Section heading..."
                                                    className="flex-1"
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-600 hover:text-red-700"
                                                    onClick={() => removeSection(section.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        <CollapsibleContent>
                                            <CardContent className="pt-0 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <Label className="text-xs text-muted-foreground">Target:</Label>
                                                    <Input
                                                        type="number"
                                                        value={section.word_count_target}
                                                        onChange={(e) =>
                                                            updateSection(section.id, {
                                                                word_count_target: parseInt(e.target.value) || 0,
                                                            })
                                                        }
                                                        className="w-20 h-7 text-xs"
                                                    />
                                                    <span className="text-xs text-muted-foreground">words</span>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label className="text-xs text-muted-foreground">Key Points</Label>
                                                    {section.key_points.map((point, pointIdx) => (
                                                        <div key={pointIdx} className="flex items-center gap-2">
                                                            <span className="text-muted-foreground">•</span>
                                                            <Input
                                                                value={point}
                                                                onChange={(e) =>
                                                                    updateKeyPoint(section.id, pointIdx, e.target.value)
                                                                }
                                                                placeholder="Key point to cover..."
                                                                className="flex-1"
                                                            />
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => removeKeyPoint(section.id, pointIdx)}
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => addKeyPoint(section.id)}
                                                        className="text-xs"
                                                    >
                                                        <Plus className="h-3 w-3 mr-1" />
                                                        Add Point
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </CollapsibleContent>
                                    </Collapsible>
                                </Card>
                            ))}
                        </div>
                    )}

                    {outlineSections.length > 0 && (
                        <Card className="border-blue-200 bg-blue-50/50">
                            <CardContent className="py-3">
                                <p className="text-sm font-medium text-blue-900 mb-2">Outline Preview</p>
                                <pre className="text-xs font-mono whitespace-pre-wrap text-blue-800">
                                    {generateOutlineMarkdown() || "No sections defined yet."}
                                </pre>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* DRAFT TAB */}
                <TabsContent value="draft" className="space-y-4 mt-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">
                                Write your full blog post in Markdown.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={copyDraft} className="gap-2">
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                {copied ? "Copied!" : "Copy"}
                            </Button>
                        </div>
                    </div>

                    {/* Quick Insert Toolbar */}
                    {researchContext && (
                        <Card className="border-dashed">
                            <CardContent className="py-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-muted-foreground">Insert:</span>
                                    {researchContext.key_statistics?.slice(0, 3).map((stat, i) => (
                                        <Button
                                            key={i}
                                            variant="outline"
                                            size="sm"
                                            className="h-6 text-xs gap-1"
                                            onClick={() =>
                                                insertAtCursor(`\n\n> **${stat.figure}** — ${stat.claim}\n\n`)
                                            }
                                        >
                                            <BarChart2 className="h-3 w-3" />
                                            {stat.figure.substring(0, 15)}
                                        </Button>
                                    ))}
                                    {researchContext.expert_quotes?.slice(0, 2).map((q, i) => (
                                        <Button
                                            key={i}
                                            variant="outline"
                                            size="sm"
                                            className="h-6 text-xs gap-1"
                                            onClick={() =>
                                                insertAtCursor(
                                                    `\n\n> "${q.quote}"\n> — **${q.author}**, ${q.credentials}\n\n`
                                                )
                                            }
                                        >
                                            <Quote className="h-3 w-3" />
                                            {q.author.substring(0, 12)}
                                        </Button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Textarea
                        id="blog-draft"
                        value={fullDraft}
                        onChange={(e) => setFullDraft(e.target.value)}
                        placeholder={`# ${title || "Your Blog Title"}\n\nStart writing your blog post here...\n\n## Introduction\n\nHook your reader with an engaging opening...`}
                        className="min-h-[500px] font-mono text-sm"
                    />

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{wordCount} words</span>
                        <span>
                            Target:{" "}
                            {outlineSections.reduce((sum, s) => sum + s.word_count_target, 0)} words
                        </span>
                    </div>
                </TabsContent>

                {/* SEO & LINKS TAB */}
                <TabsContent value="seo" className="space-y-4 mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Keywords</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="primary-keyword">Primary Keyword</Label>
                                <Input
                                    id="primary-keyword"
                                    value={primaryKeyword}
                                    onChange={(e) => setPrimaryKeyword(e.target.value)}
                                    placeholder="Main keyword to target..."
                                    className="mt-1"
                                />
                            </div>

                            <div>
                                <Label>Secondary Keywords</Label>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {secondaryKeywords.map((kw) => (
                                        <Badge key={kw} variant="secondary" className="gap-1">
                                            {kw}
                                            <button
                                                onClick={() => removeKeyword(kw)}
                                                className="ml-1 hover:text-red-600"
                                            >
                                                ×
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <Input
                                        value={newKeyword}
                                        onChange={(e) => setNewKeyword(e.target.value)}
                                        placeholder="Add keyword..."
                                        onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                                    />
                                    <Button onClick={addKeyword} variant="outline" size="sm">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Internal Link Suggestions</CardTitle>
                            <CardDescription className="text-xs">
                                Link to related content on your site
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {internalLinks.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No internal links added yet.
                                </p>
                            ) : (
                                internalLinks.map((link, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <Input
                                            value={link.topic}
                                            onChange={(e) =>
                                                updateInternalLink(idx, { topic: e.target.value })
                                            }
                                            placeholder="Topic..."
                                            className="flex-1"
                                        />
                                        <Input
                                            value={link.anchor_text}
                                            onChange={(e) =>
                                                updateInternalLink(idx, { anchor_text: e.target.value })
                                            }
                                            placeholder="Anchor text..."
                                            className="flex-1"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeInternalLink(idx)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            )}
                            <Button
                                onClick={addInternalLink}
                                variant="outline"
                                size="sm"
                                className="gap-2"
                            >
                                <Link2 className="h-4 w-4" />
                                Add Internal Link
                            </Button>
                        </CardContent>
                    </Card>

                    {/* SEO Checklist */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">SEO Checklist</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2 text-sm">
                                <li className="flex items-center gap-2">
                                    {title.length >= 30 && title.length <= 60 ? (
                                        <Check className="h-4 w-4 text-green-600" />
                                    ) : (
                                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                                    )}
                                    Title length: {title.length} chars (ideal: 30-60)
                                </li>
                                <li className="flex items-center gap-2">
                                    {metaCharValid ? (
                                        <Check className="h-4 w-4 text-green-600" />
                                    ) : (
                                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                                    )}
                                    Meta description: {metaCharCount} chars (ideal: 140-160)
                                </li>
                                <li className="flex items-center gap-2">
                                    {primaryKeyword ? (
                                        <Check className="h-4 w-4 text-green-600" />
                                    ) : (
                                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                                    )}
                                    Primary keyword set
                                </li>
                                <li className="flex items-center gap-2">
                                    {title.toLowerCase().includes(primaryKeyword.toLowerCase()) && primaryKeyword ? (
                                        <Check className="h-4 w-4 text-green-600" />
                                    ) : (
                                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                                    )}
                                    Keyword in title
                                </li>
                                <li className="flex items-center gap-2">
                                    {wordCount >= 1500 ? (
                                        <Check className="h-4 w-4 text-green-600" />
                                    ) : (
                                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                                    )}
                                    Word count: {wordCount} (recommended: 1500+)
                                </li>
                                <li className="flex items-center gap-2">
                                    {outlineSections.length >= 3 ? (
                                        <Check className="h-4 w-4 text-green-600" />
                                    ) : (
                                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                                    )}
                                    Sections: {outlineSections.length} (recommended: 3+)
                                </li>
                                <li className="flex items-center gap-2">
                                    {internalLinks.length >= 2 ? (
                                        <Check className="h-4 w-4 text-green-600" />
                                    ) : (
                                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                                    )}
                                    Internal links: {internalLinks.length} (recommended: 2+)
                                </li>
                            </ul>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
