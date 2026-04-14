"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { Search, Mic, MoreVertical, Eye, Trash2, Download, Clock, RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface PodcastDraft {
  id: string;
  episode_title: string;
  episode_description: string;
  duration_estimate?: string;
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

export default function PodcastsPage() {
  const [podcasts, setPodcasts] = useState<PodcastDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchPodcasts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/podcasts?${params}`);
      const json = await res.json();
      if (!json.error) {
        setPodcasts(json.data.podcasts);
        setTotalPages(json.data.pagination.total_pages);
        setTotal(json.data.pagination.total);
      }
    } catch (err) {
      console.error("Failed to fetch podcasts:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchPodcasts(); }, [fetchPodcasts]);

  async function handleDelete() {
    if (!deleteId) return;
    await fetch(`/api/podcasts/${deleteId}`, { method: "DELETE" });
    setDeleteId(null);
    fetchPodcasts();
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Podcast Library</h1>
          <p className="text-muted-foreground">{total} episode{total !== 1 ? "s" : ""} currently in your library.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchPodcasts} className="h-9">
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button asChild className="h-9">
            <Link href="/projects">
              <Mic className="h-4 w-4 mr-2" />New Episode
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-card p-4 rounded-xl border border-muted/60 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search episodes by title..."
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
              <TableHead className="py-4 font-semibold text-foreground">Episode Title</TableHead>
              <TableHead className="py-4 font-semibold text-foreground">Duration</TableHead>
              <TableHead className="py-4 font-semibold text-foreground">Status</TableHead>
              <TableHead className="py-4 font-semibold text-foreground">Updated</TableHead>
              <TableHead className="py-4 font-semibold w-12 text-center"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading episodes...
                  </div>
                </TableCell>
              </TableRow>
            ) : podcasts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                  <div className="space-y-3">
                    <Mic className="h-10 w-10 mx-auto opacity-20" />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">No podcast episodes yet</p>
                      <p className="text-sm">Create a new project to generate your first podcast episode outline.</p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              podcasts.map((podcast) => (
                <TableRow key={podcast.id} className="group cursor-pointer" onClick={() => window.location.href = `/podcasts/${podcast.id}`}>
                  <TableCell className="py-4">
                    <div className="space-y-1">
                      <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {podcast.episode_title}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 max-w-md font-medium">
                        {podcast.episode_description}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {podcast.duration_estimate || "TBD"}
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge className={`${STATUS_COLORS[podcast.status] || ""} border-none shadow-none px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider`} variant="secondary">
                      {podcast.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 text-sm text-muted-foreground font-medium">
                    {format(new Date(podcast.updated_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem asChild>
                          <Link href={`/podcasts/${podcast.id}`} className="flex items-center gap-2 font-medium">
                            <Eye className="h-4 w-4" />View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(`/api/podcasts/${podcast.id}/export?format=markdown`, "_blank")} className="gap-2 font-medium">
                          <Download className="h-4 w-4" />Export (.md)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(`/api/podcasts/${podcast.id}/export?format=html`, "_blank")} className="gap-2 font-medium">
                          <Download className="h-4 w-4" />Export (.html)
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => setDeleteId(podcast.id)} 
                          className="gap-2 text-red-600 focus:text-red-600 font-bold"
                        >
                          <Trash2 className="h-4 w-4" />Delete Episode
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
        <div className="flex items-center justify-between bg-muted/20 p-4 rounded-xl border border-muted/60 shadow-sm">
          <p className="text-sm text-muted-foreground font-medium">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="bg-background font-medium h-9" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>Previous</Button>
            <Button variant="outline" size="sm" className="bg-background font-medium h-9" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>Next</Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Podcast Episode?</AlertDialogTitle>
            <AlertDialogDescription className="font-medium text-muted-foreground">
              This will permanently remove the episode outline and talking points. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 font-semibold text-white">
              Delete Episode
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
