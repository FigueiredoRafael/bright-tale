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
import { ArrowLeft, Download, Trash2, Clock } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PodcastOutput } from "@/types/agents";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  review: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  published: "bg-blue-100 text-blue-700",
};

interface PodcastDetail extends PodcastOutput {
  id: string;
  word_count: number;
  status: string;
}

export default function PodcastDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<PodcastDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("draft");
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/podcasts/${id}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data.podcast);
        setStatus(json.data.podcast.status);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus);
    await fetch(`/api/podcasts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async function handleDelete() {
    await fetch(`/api/podcasts/${id}`, { method: "DELETE" });
    router.push("/podcasts");
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!data) return <div className="p-6 text-muted-foreground">Episode not found.</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/podcasts">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />Podcasts
            </Button>
          </Link>
          <h1 className="text-xl font-bold">{data.episode_title}</h1>
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
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/podcasts/${id}/export?format=markdown`, "_blank")} className="gap-1">
            <Download className="h-4 w-4" />Export (.md)
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/podcasts/${id}/export?format=html`, "_blank")} className="gap-1">
            <Download className="h-4 w-4" />Export (.html)
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)} className="gap-1">
            <Trash2 className="h-4 w-4" />Delete
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={STATUS_COLORS[status] || ""} variant="secondary">{status}</Badge>
        {data.duration_estimate && (
          <Badge variant="outline" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />{data.duration_estimate}
          </Badge>
        )}
        <Badge variant="outline">{data.word_count.toLocaleString()} words</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{data.episode_description}</p>
        </CardContent>
      </Card>

      <Card className="border-green-200 bg-green-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Intro Hook</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-line">{data.intro_hook}</p>
        </CardContent>
      </Card>

      {data.talking_points?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Talking Points</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {data.talking_points.map((tp, i) => (
                <li key={i} className="border-l-4 border-gray-200 pl-3">
                  <p className="font-medium text-sm">{tp.point}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{tp.notes}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {data.personal_angle && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Personal Angle</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-line">{data.personal_angle}</p>
          </CardContent>
        </Card>
      )}

      {data.guest_questions?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Guest Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {data.guest_questions.map((q, i) => (
                <li key={i} className="text-sm">{i + 1}. {q}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Card className="border-blue-200 bg-blue-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Outro</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-line">{data.outro}</p>
        </CardContent>
      </Card>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Episode?</AlertDialogTitle>
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
