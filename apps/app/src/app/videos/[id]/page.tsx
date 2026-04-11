"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import VideoPreview from "@/components/production/VideoPreview";
import type { VideoOutput } from "@brighttale/shared/types/agents";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-foreground/80",
  review: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  published: "bg-blue-100 text-blue-700",
};

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [video, setVideo] = useState<(VideoOutput & { id: string; title: string; status: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("draft");
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/videos/${id}`);
      const json = await res.json();
      if (json.success) {
        setVideo(json.data.video);
        setStatus(json.data.video.status);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus);
    await fetch(`/api/videos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async function handleDelete() {
    await fetch(`/api/videos/${id}`, { method: "DELETE" });
    router.push("/videos");
  }

  function exportVideo(format: string) {
    window.open(`/api/videos/${id}/export?format=${format}`, "_blank");
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!video) return <div className="p-6 text-muted-foreground">Video not found.</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/videos">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />Videos
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">{video.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="review">Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => exportVideo("markdown")} className="gap-1">
            <Download className="h-4 w-4" />Script (.md)
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportVideo("html")} className="gap-1">
            <Download className="h-4 w-4" />Script (.html)
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportVideo("teleprompter")} className="gap-1">
            <Download className="h-4 w-4" />Teleprompter
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)} className="gap-1">
            <Trash2 className="h-4 w-4" />Delete
          </Button>
        </div>
      </div>

      <Badge className={STATUS_COLORS[status] || ""} variant="secondary">{status}</Badge>

      {/* VideoPreview */}
      <VideoPreview
        video={video}
        videoTitle={video.title}
        onExportMarkdown={() => exportVideo("markdown")}
        onExportHtml={() => exportVideo("html")}
        onExportTeleprompter={() => exportVideo("teleprompter")}
      />

      {/* Delete dialog */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
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
