"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Zap, MoreVertical, Trash2, Eye, Download, RefreshCw } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";

interface ShortsDraft {
  id: string;
  short_count: number;
  total_duration?: string;
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

export default function ShortsPage() {
  const [shorts, setShorts] = useState<ShortsDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchShorts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/shorts?${params}`);
      const json = await res.json();
      if (json.success) {
        setShorts(json.data.shorts);
        setTotalPages(json.data.pagination.total_pages);
        setTotal(json.data.pagination.total);
      }
    } catch (err) {
      console.error("Failed to fetch shorts:", err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchShorts(); }, [fetchShorts]);

  async function handleDelete() {
    if (!deleteId) return;
    await fetch(`/api/shorts/${deleteId}`, { method: "DELETE" });
    setDeleteId(null);
    fetchShorts();
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Shorts Library</h1>
          <p className="text-muted-foreground">{total} shorts set{total !== 1 ? "s" : ""} currently in your library.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40 h-9">
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
          <Button variant="outline" size="sm" onClick={fetchShorts} className="h-9">
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse shadow-sm border-muted/60">
              <div className="h-32 bg-muted/20" />
            </Card>
          ))}
        </div>
      ) : shorts.length === 0 ? (
        <Card className="border-dashed border-2 shadow-none bg-muted/10">
          <CardContent className="py-16 text-center space-y-3">
            <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center mx-auto">
              <Zap className="h-6 w-6 text-muted-foreground opacity-50" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-lg">No shorts sets yet</p>
              <p className="text-muted-foreground max-w-xs mx-auto">Generate engaging vertical video shorts from your projects in the Production workflow.</p>
            </div>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/projects">Go to Projects</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {shorts.map((s) => (
            <Card key={s.id} className="relative group hover:border-primary/40 transition-colors shadow-sm border-muted/60 overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary/10 group-hover:bg-primary transition-colors" />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      {s.short_count} Shorts Set
                    </CardTitle>
                    <p className="text-xs text-muted-foreground font-medium">
                      Updated {format(new Date(s.updated_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/shorts/${s.id}`} className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />View Details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => window.open(`/api/shorts/${s.id}/export?format=markdown`, "_blank")}
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />Export (.md)
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteId(s.id)}
                        className="gap-2 text-red-600 focus:text-red-600 font-medium"
                      >
                        <Trash2 className="h-4 w-4" />Delete Set
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-2 pb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`${STATUS_COLORS[s.status] || ""} border-none shadow-none px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider`} variant="secondary">
                    {s.status}
                  </Badge>
                  {s.total_duration && (
                    <Badge variant="outline" className="text-[10px] font-semibold border-muted/60">{s.total_duration} Total</Badge>
                  )}
                </div>
              </CardContent>
              <div className="px-6 pb-4">
                <Button asChild variant="secondary" size="sm" className="w-full bg-muted/50 hover:bg-primary hover:text-primary-foreground transition-all h-8 text-xs font-semibold">
                  <Link href={`/shorts/${s.id}`}>Open Production</Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-muted/20 p-4 rounded-xl border border-muted/60">
          <p className="text-sm text-muted-foreground font-medium">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="bg-background" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>Previous</Button>
            <Button variant="outline" size="sm" className="bg-background" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>Next</Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shorts Set?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this set of shorts? This action cannot be undone and you will lose all the generated script content for these {shorts.find(s => s.id === deleteId)?.short_count} shorts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete Set</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
