"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Download,
  Copy,
  Check,
  Clock,
  Film,
  Music,
  Volume2,
  ChevronDown,
} from "lucide-react";
import type { VideoOutput } from "@brighttale/shared/types/agents";

interface VideoPreviewProps {
  video: VideoOutput;
  videoTitle?: string;
  onSave?: () => void;
  onExportMarkdown?: () => void;
  onExportHtml?: () => void;
  onExportTeleprompter?: () => void;
}

function SoundBadge({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800">
      <Volume2 className="h-3 w-3 mt-0.5 shrink-0 text-orange-500" />
      <span><span className="font-semibold">SFX:</span> {text}</span>
    </div>
  );
}

function MusicBadge({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 mt-2 p-2 bg-purple-50 border border-purple-200 rounded text-xs text-purple-800">
      <Music className="h-3 w-3 mt-0.5 shrink-0 text-purple-500" />
      <span><span className="font-semibold">Music:</span> {text}</span>
    </div>
  );
}

function VisualNotesBadge({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700">
      <Film className="h-3 w-3 mt-0.5 shrink-0 text-gray-400" />
      <span><span className="font-semibold">Visual:</span> {text}</span>
    </div>
  );
}

function ScriptContent({ content }: { content: string }) {
  return (
    <p className="text-sm leading-relaxed whitespace-pre-line text-gray-800">
      {content}
    </p>
  );
}

export default function VideoPreview({
  video,
  videoTitle,
  onSave,
  onExportMarkdown,
  onExportHtml,
  onExportTeleprompter,
}: VideoPreviewProps) {
  const [copied, setCopied] = useState(false);

  const displayTitle = videoTitle || video.title_options?.[0] || "Video Script";

  // Calculate spoken word count
  const wordCount = React.useMemo(() => {
    if (!video.script) return 0;
    const { hook, problem, teaser, chapters, affiliate_segment, outro } = video.script;
    const texts = [
      hook?.content,
      problem?.content,
      teaser?.content,
      ...(chapters?.map((c) => c.content) ?? []),
      affiliate_segment?.script,
      outro?.recap,
      outro?.cta,
    ].filter(Boolean);
    return texts.join(" ").split(/\s+/).filter((w) => w.length > 0).length;
  }, [video]);

  const speakingMinutes = Math.round(wordCount / 130); // ~130 wpm for video

  function copyScript() {
    if (!video.script) return;
    const { hook, problem, teaser, chapters, affiliate_segment, outro } = video.script;
    const parts = [
      hook?.content,
      problem?.content,
      teaser?.content,
      ...(chapters?.map((c) => c.content) ?? []),
      affiliate_segment?.script,
      outro?.recap,
      outro?.cta,
    ].filter(Boolean);
    navigator.clipboard.writeText(parts.join("\n\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {video.total_duration_estimate || "TBD"}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            ~{wordCount.toLocaleString()} spoken words
          </Badge>
          <Badge variant="outline">~{speakingMinutes} min speaking</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={copyScript}>
            {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? "Copied" : "Copy Script"}
          </Button>
          {onExportMarkdown && (
            <Button variant="outline" size="sm" onClick={onExportMarkdown}>
              <Download className="h-4 w-4 mr-1" />
              Script (.md)
            </Button>
          )}
          {onExportHtml && (
            <Button variant="outline" size="sm" onClick={onExportHtml}>
              <Download className="h-4 w-4 mr-1" />
              Script (.html)
            </Button>
          )}
          {onExportTeleprompter && (
            <Button variant="outline" size="sm" onClick={onExportTeleprompter}>
              <Download className="h-4 w-4 mr-1" />
              Teleprompter
            </Button>
          )}
          {onSave && (
            <Button size="sm" onClick={onSave}>
              Save to Library
            </Button>
          )}
        </div>
      </div>

      {/* Title Options */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Title Options
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-1">
            {video.title_options?.map((t, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-muted-foreground font-mono text-xs mt-0.5">{i + 1}.</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Thumbnail */}
      {video.thumbnail && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Thumbnail Concept
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm font-semibold">{video.thumbnail.text_overlay}</p>
            <p className="text-sm text-muted-foreground">{video.thumbnail.visual_concept}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="capitalize">{video.thumbnail.emotion}</Badge>
            </div>
            <p className="text-xs text-muted-foreground italic">{video.thumbnail.why_it_works}</p>
          </CardContent>
        </Card>
      )}

      {/* Script Sections */}
      {video.script && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Script
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Accordion type="multiple" defaultValue={["hook", "problem", "teaser"]} className="w-full">

              {/* Hook */}
              {video.script.hook && (
                <AccordionItem value="hook" className="border-l-4 border-blue-400">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="text-blue-600">🎬 HOOK</span>
                      <Badge variant="outline" className="font-mono text-xs">{video.script.hook.duration}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <ScriptContent content={video.script.hook.content} />
                    {video.script.hook.visual_notes && <VisualNotesBadge text={video.script.hook.visual_notes} />}
                    {video.script.hook.sound_effects && <SoundBadge text={video.script.hook.sound_effects} />}
                    {video.script.hook.background_music && <MusicBadge text={video.script.hook.background_music} />}
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* Problem */}
              {video.script.problem && (
                <AccordionItem value="problem" className="border-l-4 border-red-400">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="text-red-600">⚡ PROBLEM</span>
                      <Badge variant="outline" className="font-mono text-xs">{video.script.problem.duration}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <ScriptContent content={video.script.problem.content} />
                    {video.script.problem.visual_notes && <VisualNotesBadge text={video.script.problem.visual_notes} />}
                    {video.script.problem.sound_effects && <SoundBadge text={video.script.problem.sound_effects} />}
                    {video.script.problem.background_music && <MusicBadge text={video.script.problem.background_music} />}
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* Teaser */}
              {video.script.teaser && (
                <AccordionItem value="teaser" className="border-l-4 border-yellow-400">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="text-yellow-600">🔮 TEASER</span>
                      <Badge variant="outline" className="font-mono text-xs">{video.script.teaser.duration}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <ScriptContent content={video.script.teaser.content} />
                    {video.script.teaser.visual_notes && <VisualNotesBadge text={video.script.teaser.visual_notes} />}
                    {video.script.teaser.sound_effects && <SoundBadge text={video.script.teaser.sound_effects} />}
                    {video.script.teaser.background_music && <MusicBadge text={video.script.teaser.background_music} />}
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* Chapters */}
              {video.script.chapters?.map((ch) => (
                <AccordionItem key={ch.chapter_number} value={`chapter-${ch.chapter_number}`} className="border-l-4 border-gray-300">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="text-gray-700">Ch. {ch.chapter_number}: {ch.title}</span>
                      <Badge variant="outline" className="font-mono text-xs">{ch.duration}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 space-y-3">
                    <ScriptContent content={ch.content} />

                    {ch.b_roll_suggestions?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">B-Roll Suggestions</p>
                        <div className="flex flex-wrap gap-1">
                          {ch.b_roll_suggestions.map((b, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              <Film className="h-2.5 w-2.5 mr-1" />
                              {b}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {ch.key_stat_or_quote && (
                      <blockquote className="border-l-4 border-blue-300 pl-3 text-sm italic text-gray-700 bg-blue-50/50 py-2 pr-2 rounded-r">
                        {ch.key_stat_or_quote}
                      </blockquote>
                    )}

                    {ch.sound_effects && <SoundBadge text={ch.sound_effects} />}
                    {ch.background_music && <MusicBadge text={ch.background_music} />}
                  </AccordionContent>
                </AccordionItem>
              ))}

              {/* Affiliate Segment */}
              {video.script.affiliate_segment && (
                <AccordionItem value="affiliate" className="border-l-4 border-green-400">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="text-green-700">💰 AFFILIATE SEGMENT</span>
                      <Badge variant="outline" className="font-mono text-xs">{video.script.affiliate_segment.timestamp}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 space-y-2">
                    {video.script.affiliate_segment.transition_in && (
                      <div className="p-2 bg-green-50 border border-green-200 rounded text-xs">
                        <span className="font-semibold text-green-800">Transition In: </span>
                        <span className="text-green-700">{video.script.affiliate_segment.transition_in}</span>
                      </div>
                    )}
                    <ScriptContent content={video.script.affiliate_segment.script} />
                    {video.script.affiliate_segment.transition_out && (
                      <div className="p-2 bg-green-50 border border-green-200 rounded text-xs">
                        <span className="font-semibold text-green-800">Transition Out: </span>
                        <span className="text-green-700">{video.script.affiliate_segment.transition_out}</span>
                      </div>
                    )}
                    {video.script.affiliate_segment.visual_notes && (
                      <VisualNotesBadge text={video.script.affiliate_segment.visual_notes} />
                    )}
                    {video.script.affiliate_segment.sound_effects && (
                      <SoundBadge text={video.script.affiliate_segment.sound_effects} />
                    )}
                    {video.script.affiliate_segment.background_music && (
                      <MusicBadge text={video.script.affiliate_segment.background_music} />
                    )}
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* Outro */}
              {video.script.outro && (
                <AccordionItem value="outro" className="border-l-4 border-purple-400">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="text-purple-700">🎤 OUTRO</span>
                      <Badge variant="outline" className="font-mono text-xs">{video.script.outro.duration}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 space-y-3">
                    {video.script.outro.recap && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Recap</p>
                        <ScriptContent content={video.script.outro.recap} />
                      </div>
                    )}
                    {video.script.outro.cta && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">CTA</p>
                        <p className="text-sm font-medium text-purple-700">{video.script.outro.cta}</p>
                      </div>
                    )}
                    {video.script.outro.end_screen_prompt && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">End Screen</p>
                        <p className="text-sm text-gray-700">{video.script.outro.end_screen_prompt}</p>
                      </div>
                    )}
                    {video.script.outro.sound_effects && <SoundBadge text={video.script.outro.sound_effects} />}
                    {video.script.outro.background_music && <MusicBadge text={video.script.outro.background_music} />}
                  </AccordionContent>
                </AccordionItem>
              )}

            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <span>Total: {video.total_duration_estimate || "TBD"}</span>
        <span>{video.script?.chapters?.length ?? 0} chapters</span>
      </div>
    </div>
  );
}
