"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Download, Trash2, Music, Volume2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ShortOutput } from "@brighttale/shared/types/agents";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-foreground/80",
  review: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  published: "bg-blue-100 text-blue-700",
};

interface ShortsDetail {
  id: string;
  shorts: ShortOutput[];
  short_count: number;
  total_duration?: string;
  status: string;
}

export default function ShortsDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<ShortsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("draft");
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/shorts/${id}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data.shorts);
        setStatus(json.data.shorts.status);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus);
    await fetch(`/api/shorts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async function handleDelete() {
    await fetch(`/api/shorts/${id}`, { method: "DELETE" });
    router.push("/shorts");
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!data) return <div className="p-6 text-muted-foreground">Shorts not found.</div>;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/shorts">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />Shorts
            </Button>
          </Link>
          <h1 className="text-xl font-bold">{data.short_count} Shorts Set</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="review">Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/shorts/${id}/export?format=markdown`, "_blank")} className="gap-1">
            <Download className="h-4 w-4" />Export (.md)
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/shorts/${id}/export?format=html`, "_blank")} className="gap-1">
            <Download className="h-4 w-4" />Export (.html)
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)} className="gap-1">
            <Trash2 className="h-4 w-4" />Delete
          </Button>
        </div>
      </div>

      <Badge className={STATUS_COLORS[status] || ""} variant="secondary">{status}</Badge>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.shorts.map((short) => (
          <Card key={short.short_number} className="bg-gradient-to-b from-purple-50 to-white">
            <CardHeader className="pb-2">
              <p className="text-xs text-muted-foreground">Short #{short.short_number}</p>
              <CardTitle className="text-sm">{short.title}</CardTitle>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-xs">{short.duration}</Badge>
                <Badge variant="secondary" className="text-xs">{short.visual_style}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Hook (0:00-0:02)</p>
                <p className="text-sm font-medium">{short.hook}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Script</p>
                <p className="text-sm leading-relaxed whitespace-pre-line">{short.script}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">CTA</p>
                <p className="text-sm text-blue-700 font-medium">{short.cta}</p>
              </div>
              {short.sound_effects && (
                <div className="flex items-start gap-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800">
                  <Volume2 className="h-3 w-3 mt-0.5 shrink-0 text-orange-500" />
                  <span><span className="font-semibold">SFX:</span> {short.sound_effects}</span>
                </div>
              )}
              {short.background_music && (
                <div className="flex items-start gap-2 p-2 bg-purple-50 border border-purple-200 rounded text-xs text-purple-800">
                  <Music className="h-3 w-3 mt-0.5 shrink-0 text-purple-500" />
                  <span><span className="font-semibold">Music:</span> {short.background_music}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shorts Set?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
