"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, AlertCircle, CheckCircle } from "lucide-react";
import {
  scoreCanonicalCore,
  canonicalCoreSchema,
  type CanonicalCore,
  type CanonicalCoreInput,
} from "@brighttale/shared/schemas/canonicalCore";

interface CanonicalCoreEditorProps {
  value: CanonicalCoreInput;
  onChange: (core: CanonicalCoreInput) => void;
  onSave?: (core: CanonicalCore) => Promise<void>;
  saving?: boolean;
  disabled?: boolean;
}

export default function CanonicalCoreEditor({
  value,
  onChange,
  onSave,
  saving,
  disabled,
}: CanonicalCoreEditorProps) {
  const [saveError, setSaveError] = useState<string | null>(null);

  // Parse for completeness scoring (only if structurally valid)
  const parsed = canonicalCoreSchema.safeParse(value);
  const score = parsed.success ? scoreCanonicalCore(parsed.data) : null;

  function updateField<K extends keyof CanonicalCoreInput>(
    key: K,
    val: CanonicalCoreInput[K],
  ) {
    onChange({ ...value, [key]: val });
  }

  function addArgumentStep() {
    const chain = value.argument_chain ?? [];
    onChange({
      ...value,
      argument_chain: [
        ...chain,
        { step: chain.length + 1, claim: "", evidence: "", source_ids: [] },
      ],
    });
  }

  function removeArgumentStep(index: number) {
    const chain = (value.argument_chain ?? []).filter((_, i) => i !== index);
    onChange({ ...value, argument_chain: chain.map((s, i) => ({ ...s, step: i + 1 })) });
  }

  function updateArgumentStep(
    index: number,
    field: "claim" | "evidence",
    val: string,
  ) {
    const chain = [...(value.argument_chain ?? [])];
    chain[index] = { ...chain[index], [field]: val };
    onChange({ ...value, argument_chain: chain });
  }

  function addStat() {
    onChange({
      ...value,
      key_stats: [...(value.key_stats ?? []), { stat: "", figure: "", source_id: "" }],
    });
  }

  function removeStat(index: number) {
    onChange({
      ...value,
      key_stats: (value.key_stats ?? []).filter((_, i) => i !== index),
    });
  }

  async function handleSave() {
    if (!onSave) return;
    const result = canonicalCoreSchema.safeParse(value);
    if (!result.success) {
      setSaveError(
        "Fix validation errors before saving: " +
          result.error.issues.map((i) => i.message).join(", "),
      );
      return;
    }
    setSaveError(null);
    await onSave(result.data);
  }

  return (
    <div className="space-y-4">
      {/* Completeness score */}
      {score && (
        <div
          className={`flex items-center gap-2 text-xs px-3 py-2 rounded-md border ${
            score.score === 100
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-yellow-50 border-yellow-200 text-yellow-700"
          }`}
        >
          {score.score === 100 ? (
            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          <span>
            Completeness: <strong>{score.score}/100</strong>
            {score.warnings.length > 0 && (
              <span className="ml-1">— {score.warnings[0]}</span>
            )}
          </span>
        </div>
      )}

      {saveError && (
        <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {saveError}
        </p>
      )}

      {/* Thesis */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">
          Thesis <span className="text-muted-foreground font-normal">(1–2 sentences)</span>
        </Label>
        <Textarea
          disabled={disabled}
          rows={2}
          placeholder="The central claim this content proves."
          value={value.thesis ?? ""}
          onChange={(e) => updateField("thesis", e.target.value)}
          className="text-xs resize-none"
        />
      </div>

      {/* Emotional arc */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs font-medium">Emotional Arc</CardTitle>
          <CardDescription className="text-[11px]">
            The audience&apos;s emotional journey across all formats.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 pb-3 grid grid-cols-3 gap-2">
          {(["opening_emotion", "turning_point", "closing_emotion"] as const).map(
            (field) => (
              <div key={field} className="space-y-1">
                <Label className="text-[11px] capitalize text-muted-foreground">
                  {field.replace(/_/g, " ")}
                </Label>
                <Input
                  disabled={disabled}
                  placeholder={
                    field === "opening_emotion"
                      ? "e.g. confusion"
                      : field === "turning_point"
                        ? "e.g. clarity"
                        : "e.g. confidence"
                  }
                  value={value.emotional_arc?.[field] ?? ""}
                  onChange={(e) =>
                    updateField("emotional_arc", {
                      ...value.emotional_arc,
                      opening_emotion: value.emotional_arc?.opening_emotion ?? "",
                      turning_point: value.emotional_arc?.turning_point ?? "",
                      closing_emotion: value.emotional_arc?.closing_emotion ?? "",
                      [field]: e.target.value,
                    })
                  }
                  className="h-7 text-xs"
                />
              </div>
            ),
          )}
        </CardContent>
      </Card>

      {/* Argument chain */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Argument Chain</Label>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[11px] px-2"
            disabled={disabled}
            onClick={addArgumentStep}
          >
            <Plus className="h-3 w-3 mr-1" /> Add step
          </Button>
        </div>
        {(value.argument_chain ?? []).map((step, i) => (
          <Card key={i} className="border-dashed">
            <CardContent className="px-3 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px] h-4">
                  Step {step.step}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={disabled}
                  onClick={() => removeArgumentStep(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Claim</Label>
                <Textarea
                  disabled={disabled}
                  rows={2}
                  placeholder="The logical assertion..."
                  value={step.claim}
                  onChange={(e) => updateArgumentStep(i, "claim", e.target.value)}
                  className="text-xs resize-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Evidence</Label>
                <Textarea
                  disabled={disabled}
                  rows={2}
                  placeholder="The specific data or study that proves this..."
                  value={step.evidence}
                  onChange={(e) => updateArgumentStep(i, "evidence", e.target.value)}
                  className="text-xs resize-none"
                />
              </div>
            </CardContent>
          </Card>
        ))}
        {(value.argument_chain ?? []).length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-3 border border-dashed rounded-md">
            No steps yet — add at least 2.
          </p>
        )}
      </div>

      {/* Key stats */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Key Statistics</Label>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[11px] px-2"
            disabled={disabled}
            onClick={addStat}
          >
            <Plus className="h-3 w-3 mr-1" /> Add stat
          </Button>
        </div>
        {(value.key_stats ?? []).map((stat, i) => (
          <div key={i} className="flex gap-2 items-start">
            <Input
              disabled={disabled}
              placeholder="Stat description"
              value={stat.stat}
              onChange={(e) => {
                const stats = [...(value.key_stats ?? [])];
                stats[i] = { ...stats[i], stat: e.target.value };
                updateField("key_stats", stats);
              }}
              className="h-7 text-xs flex-1"
            />
            <Input
              disabled={disabled}
              placeholder="Figure (e.g. 40%)"
              value={stat.figure}
              onChange={(e) => {
                const stats = [...(value.key_stats ?? [])];
                stats[i] = { ...stats[i], figure: e.target.value };
                updateField("key_stats", stats);
              }}
              className="h-7 text-xs w-28"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              disabled={disabled}
              onClick={() => removeStat(i)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div className="grid grid-cols-1 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Subscribe CTA</Label>
          <Input
            disabled={disabled}
            placeholder="Subscribe for weekly..."
            value={value.cta_subscribe ?? ""}
            onChange={(e) => updateField("cta_subscribe", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Comment Prompt</Label>
          <Input
            disabled={disabled}
            placeholder="Are you renting or buying? Tell us..."
            value={value.cta_comment_prompt ?? ""}
            onChange={(e) => updateField("cta_comment_prompt", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      </div>

      {onSave && (
        <Button
          className="w-full"
          onClick={handleSave}
          disabled={disabled || saving}
        >
          {saving ? "Saving..." : "Save Canonical Core"}
        </Button>
      )}
    </div>
  );
}
