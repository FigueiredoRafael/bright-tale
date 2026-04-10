"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { VIDEO_TEMPLATES, type VideoStyleConfig } from "@/lib/schemas/videoStyle";

interface VideoStyleSelectorProps {
  value: VideoStyleConfig;
  onChange: (config: VideoStyleConfig) => void;
  disabled?: boolean;
}

const TEMPLATE_LABELS: Record<string, string> = {
  talking_head_standard: "Talking Head — Standard",
  talking_head_dynamic: "Talking Head — Dynamic",
  b_roll_documentary: "B-Roll Documentary",
  screen_record_tutorial: "Screen Record / Tutorial",
  hybrid: "Hybrid",
};

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  talking_head_standard: "Slow cuts, minimal B-roll, calm music. Best for educational, conversational content.",
  talking_head_dynamic: "Fast cuts, heavy text overlays, energetic music. Best for high-retention short-form style.",
  b_roll_documentary: "High B-roll density, narrative voiceover, cinematic music. Best for documentary-style content.",
  screen_record_tutorial: "Action-based cuts, screen annotations. Best for software tutorials and walkthroughs.",
  hybrid: "Mix and match settings manually. Full control over each parameter.",
};

export default function VideoStyleSelector({ value, onChange, disabled }: VideoStyleSelectorProps) {
  function update<K extends keyof VideoStyleConfig>(key: K, val: VideoStyleConfig[K]) {
    onChange({ ...value, [key]: val });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Video Production Style</CardTitle>
        <CardDescription className="text-xs">
          Defines how the video script is structured and formatted for this project.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Template */}
        <div className="space-y-1">
          <Label className="text-xs">Template</Label>
          <Select
            disabled={disabled}
            value={value.template}
            onValueChange={(v) => update("template", v as VideoStyleConfig["template"])}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_TEMPLATES.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {TEMPLATE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{TEMPLATE_DESCRIPTIONS[value.template]}</p>
        </div>

        {/* Cut frequency */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Cut Frequency</Label>
            <Select
              disabled={disabled}
              value={value.cut_frequency ?? "moderate"}
              onValueChange={(v) => update("cut_frequency", v as VideoStyleConfig["cut_frequency"])}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["slow", "moderate", "fast", "variable", "action_based"].map((v) => (
                  <SelectItem key={v} value={v} className="text-xs capitalize">
                    {v.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* B-roll density */}
          <div className="space-y-1">
            <Label className="text-xs">B-Roll Density</Label>
            <Select
              disabled={disabled}
              value={value.b_roll_density ?? "low"}
              onValueChange={(v) => update("b_roll_density", v as VideoStyleConfig["b_roll_density"])}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["low", "medium", "high"].map((v) => (
                  <SelectItem key={v} value={v} className="text-xs capitalize">
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Text overlays */}
          <div className="space-y-1">
            <Label className="text-xs">Text Overlays</Label>
            <Select
              disabled={disabled}
              value={value.text_overlays ?? "minimal"}
              onValueChange={(v) => update("text_overlays", v as VideoStyleConfig["text_overlays"])}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["none", "minimal", "moderate", "heavy"].map((v) => (
                  <SelectItem key={v} value={v} className="text-xs capitalize">
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Music style */}
          <div className="space-y-1">
            <Label className="text-xs">Music Style</Label>
            <Select
              disabled={disabled}
              value={value.music_style ?? "calm_ambient"}
              onValueChange={(v) => update("music_style", v as VideoStyleConfig["music_style"])}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["calm_ambient", "energetic", "cinematic", "background_only", "none"].map((v) => (
                  <SelectItem key={v} value={v} className="text-xs">
                    {v.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Toggle flags */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Presenter tone-of-voice cues</Label>
            <Switch
              disabled={disabled}
              checked={value.presenter_notes ?? false}
              onCheckedChange={(v) => update("presenter_notes", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Require B-roll per section</Label>
            <Switch
              disabled={disabled}
              checked={value.b_roll_required ?? false}
              onCheckedChange={(v) => update("b_roll_required", v)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
