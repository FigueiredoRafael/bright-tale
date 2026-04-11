"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Video, MoreVertical, Eye, Trash2, Download, Clock, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

interface VideoDraft {
  id: string;
  title: string;
  title_options: string[];
  total_duration_estimate?: string;
  word_count: number;
  status: string;
  project_id?: string;
  idea_id?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-foreground/80",
  review: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  published: "bg-blue-100 text-blue-700",
};

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/videos?${params}`);
      const json = await res.json();
      if (!json.error) {
        setVideos(json.data.videos);
        setTotalPages(json.data.pagination.total_pages);
        setTotal(json.data.pagination.total);
      }
    } catch (err) {
      console.error("Failed to fetch videos:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  async function handleDelete() {
    if (!deleteId) return;
    await fetch(`/api/videos/${deleteId}`, { method: "DELETE" });
    setDeleteId(null);
    fetchVideos();
  }

  function exportVideo(id: string, format: string) {
    window.open(`/api/videos/${id}/export?format=${format}`, "_blank");
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Video Library</h1>
          <p className="text-muted-foreground">{total} video script{total !== 1 ? "s" : ""} currently in your library.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchVideos} className="h-9">
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button asChild className="h-9">
            <Link href="/projects">
              <Video className="h-4 w-4 mr-2" />New Script
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {["draft", "review", "approved", "published"].map((s) => (
          <Card key={s} className="shadow-sm border-muted/60">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s}</CardTitle>
              <div className={`h-2 w-2 rounded-full ${s === 'published' ? 'bg-info' : s === 'approved' ? 'bg-success' : s === 'review' ? 'bg-warning' : 'bg-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{videos.filter((v) => v.status === s).length}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-card p-4 rounded-xl border border-muted/60 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or topic..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-10 border-muted/60 focus:ring-primary/20"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-48 h-10 border-muted/60">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="review">Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="shadow-sm border-muted/60 overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              <TableHead className="py-4 font-semibold">Title</TableHead>
              <TableHead className="py-4 font-semibold">Duration</TableHead>
              <TableHead className="py-4 font-semibold">Words</TableHead>
              <TableHead className="py-4 font-semibold">Status</TableHead>
              <TableHead className="py-4 font-semibold">Updated</TableHead>
              <TableHead className="py-4 font-semibold w-12 text-center"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : videos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <Video className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No video scripts yet
                </TableCell>
              </TableRow>
            ) : (
              videos.map((video) => (
                <TableRow key={video.id}>
                  <TableCell>
                    <Link href={`/videos/${video.id}`} className="font-medium hover:underline">
                      {video.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {video.total_duration_estimate || "-"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {video.word_count.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[video.status] || ""} variant="secondary">
                      {video.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(video.updated_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/videos/${video.id}`} className="flex items-center gap-2">
                            <Eye className="h-4 w-4" />View
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => exportVideo(video.id, "markdown")} className="gap-2">
                          <Download className="h-4 w-4" />Script (.md)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportVideo(video.id, "html")} className="gap-2">
                          <Download className="h-4 w-4" />Script (.html)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportVideo(video.id, "teleprompter")} className="gap-2">
                          <Download className="h-4 w-4" />Teleprompter (.txt)
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteId(video.id)}
                          className="gap-2 text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Video Script?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
