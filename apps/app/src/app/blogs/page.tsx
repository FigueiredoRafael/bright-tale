"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    Search,
    FileText,
    MoreVertical,
    Eye,
    Edit,
    Trash2,
    Download,
    ExternalLink,
    Calendar,
    Clock,
    Tag,
    Filter,
    RefreshCw,
    Plus,
} from "lucide-react";
import { format } from "date-fns";

interface BlogDraft {
    id: string;
    title: string;
    slug: string;
    meta_description: string;
    word_count: number;
    status: "draft" | "review" | "approved" | "published";
    primary_keyword: string | null;
    project_id: string | null;
    idea_id: string | null;
    wordpress_post_id: number | null;
    wordpress_url: string | null;
    published_at: string | null;
    created_at: string;
    updated_at: string;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
}

const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    review: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    published: "bg-blue-100 text-blue-800",
};

export default function BlogsPage() {
    const [blogs, setBlogs] = useState<BlogDraft[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [page, setPage] = useState(1);

    // Delete dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [blogToDelete, setBlogToDelete] = useState<BlogDraft | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchBlogs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            params.set("page", page.toString());
            params.set("limit", "20");
            if (search) params.set("search", search);
            if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);

            const res = await fetch(`/api/blogs?${params.toString()}`);
            const json = await res.json();

            if (json.success) {
                setBlogs(json.data.blogs);
                setPagination(json.data.pagination);
            } else {
                setError(json.error?.message || "Failed to fetch blogs");
            }
        } catch (err) {
            setError("Failed to fetch blogs");
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter]);

    useEffect(() => {
        fetchBlogs();
    }, [fetchBlogs]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1); // Reset to page 1 on search
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const handleDelete = async () => {
        if (!blogToDelete) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/blogs/${blogToDelete.id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                fetchBlogs();
            }
        } catch (err) {
            console.error("Failed to delete blog:", err);
        } finally {
            setDeleting(false);
            setDeleteDialogOpen(false);
            setBlogToDelete(null);
        }
    };

    const handleExport = async (blogId: string, format: "markdown" | "html" | "json") => {
        const res = await fetch(`/api/blogs/${blogId}/export?format=${format}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const ext = format === "markdown" ? "md" : format;
        a.download = `blog-${blogId}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getReadingTime = (wordCount: number) => {
        const minutes = Math.ceil(wordCount / 200);
        return `${minutes} min`;
    };

    return (
        <div className="container mx-auto py-8 px-4 max-w-7xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Blog Library</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage your blog drafts and published posts
                    </p>
                </div>
                <Link href="/projects">
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Create New Blog
                    </Button>
                </Link>
            </div>

            {/* Filters */}
            <Card className="mb-6">
                <CardContent className="py-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search blogs by title, slug, or keyword..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[150px]">
                                    <Filter className="h-4 w-4 mr-2" />
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="review">In Review</SelectItem>
                                    <SelectItem value="approved">Approved</SelectItem>
                                    <SelectItem value="published">Published</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={fetchBlogs} className="gap-2">
                                <RefreshCw className="h-4 w-4" />
                                Refresh
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stats */}
            {pagination && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-2xl font-bold">{pagination.total}</div>
                            <div className="text-sm text-muted-foreground">Total Blogs</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-2xl font-bold">
                                {blogs.filter((b) => b.status === "draft").length}
                            </div>
                            <div className="text-sm text-muted-foreground">Drafts</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-2xl font-bold">
                                {blogs.filter((b) => b.status === "published").length}
                            </div>
                            <div className="text-sm text-muted-foreground">Published</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-2xl font-bold">
                                {blogs.reduce((sum, b) => sum + b.word_count, 0).toLocaleString()}
                            </div>
                            <div className="text-sm text-muted-foreground">Total Words</div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Error */}
            {error && (
                <Card className="mb-6 border-red-200 bg-red-50">
                    <CardContent className="py-4 text-red-800">{error}</CardContent>
                </Card>
            )}

            {/* Blog Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Blog Posts</CardTitle>
                    <CardDescription>
                        {pagination
                            ? `Showing ${(pagination.page - 1) * pagination.limit + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total}`
                            : "Loading..."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-12 text-center text-muted-foreground">
                            <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin" />
                            Loading blogs...
                        </div>
                    ) : blogs.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground">
                            <FileText className="h-12 w-12 mx-auto mb-4" />
                            <h3 className="font-semibold mb-2">No blogs found</h3>
                            <p className="text-sm">
                                {search || statusFilter !== "all"
                                    ? "Try adjusting your filters"
                                    : "Create your first blog from a project"}
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[40%]">Title</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Word Count</TableHead>
                                    <TableHead>Updated</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {blogs.map((blog) => (
                                    <TableRow key={blog.id}>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium line-clamp-1">{blog.title}</p>
                                                <p className="text-xs text-muted-foreground font-mono">
                                                    /{blog.slug}
                                                </p>
                                                {blog.primary_keyword && (
                                                    <div className="flex items-center gap-1 mt-1">
                                                        <Tag className="h-3 w-3 text-muted-foreground" />
                                                        <span className="text-xs text-muted-foreground">
                                                            {blog.primary_keyword}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={STATUS_COLORS[blog.status]}>
                                                {blog.status}
                                            </Badge>
                                            {blog.wordpress_url && (
                                                <a
                                                    href={blog.wordpress_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-2"
                                                >
                                                    <ExternalLink className="h-3 w-3 inline text-blue-600" />
                                                </a>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span>{blog.word_count.toLocaleString()}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    ({getReadingTime(blog.word_count)})
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                                <Calendar className="h-3 w-3" />
                                                {format(new Date(blog.updated_at), "MMM d, yyyy")}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem asChild>
                                                        <Link href={`/blogs/${blog.id}`}>
                                                            <Eye className="h-4 w-4 mr-2" />
                                                            View / Edit
                                                        </Link>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={() => handleExport(blog.id, "markdown")}
                                                    >
                                                        <Download className="h-4 w-4 mr-2" />
                                                        Export Markdown
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleExport(blog.id, "html")}
                                                    >
                                                        <Download className="h-4 w-4 mr-2" />
                                                        Export HTML
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleExport(blog.id, "json")}
                                                    >
                                                        <Download className="h-4 w-4 mr-2" />
                                                        Export JSON
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className="text-red-600"
                                                        onClick={() => {
                                                            setBlogToDelete(blog);
                                                            setDeleteDialogOpen(true);
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}

                    {/* Pagination */}
                    {pagination && pagination.total_pages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                            <div className="text-sm text-muted-foreground">
                                Page {pagination.page} of {pagination.total_pages}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={pagination.page <= 1}
                                    onClick={() => setPage((p) => p - 1)}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={pagination.page >= pagination.total_pages}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Delete Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Blog?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{blogToDelete?.title}&quot;? This
                            action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {deleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
