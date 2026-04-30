"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Settings2 } from "lucide-react";
import type { PipelineSettings } from "@/components/engines/types";
import { DEFAULT_PIPELINE_SETTINGS } from "@/components/engines/types";
import { MODELS_BY_PROVIDER, type ProviderId } from "@/components/ai/ModelPicker";

const PROVIDERS = ["gemini", "openai", "anthropic", "ollama"] as const;
type ProviderValue = typeof PROVIDERS[number];

const STAGES = [
  { key: "brainstorm",    label: "Brainstorm" },
  { key: "research",      label: "Research" },
  { key: "canonicalCore", label: "Canonical Core" },
  { key: "draft",         label: "Draft" },
  { key: "review",        label: "Review" },
  { key: "assets",        label: "Assets" },
] as const;

function modelsForProvider(p: string): string[] {
  if (p in MODELS_BY_PROVIDER) {
    return MODELS_BY_PROVIDER[p as ProviderId].map((m) => m.id);
  }
  return [];
}

export default function PipelineSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<PipelineSettings>(DEFAULT_PIPELINE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, meRes] = await Promise.all([
          fetch("/api/admin/pipeline-settings"),
          fetch("/api/users/me"),
        ]);
        const settingsJson = await settingsRes.json();
        const meJson = await meRes.json();
        if (settingsJson?.data) setSettings(settingsJson.data as PipelineSettings);
        if (meJson?.data?.role === "admin") setIsAdmin(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/pipeline-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (json?.error) throw new Error(json.error.message);
      toast({ title: "Saved", description: "Pipeline settings updated." });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function setProvider(stage: string, value: string) {
    setSettings((s) => ({
      ...s,
      defaultProviders: { ...s.defaultProviders, [stage]: value },
      // Reset model when provider changes — old model ID won't be valid for new provider.
      defaultModels: { ...s.defaultModels, [stage]: "" },
    }));
  }

  function setModel(stage: string, value: string) {
    setSettings((s) => ({
      ...s,
      defaultModels: { ...s.defaultModels, [stage]: value },
    }));
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="h-6 w-6" />
            Pipeline Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-pilot behavior and default providers per stage.
          </p>
        </div>
        {!isAdmin && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            Read only
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auto-pilot Behavior</CardTitle>
          <CardDescription>Controls when auto-pilot pauses, approves, or revisits a draft.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Approval score</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={settings.reviewApproveScore}
                disabled={!isAdmin}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, reviewApproveScore: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-muted-foreground">Score ≥ value → approved</p>
            </div>
            <div className="space-y-1.5">
              <Label>Reject threshold</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={settings.reviewRejectThreshold}
                disabled={!isAdmin}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, reviewRejectThreshold: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-muted-foreground">Score below → pause</p>
            </div>
            <div className="space-y-1.5">
              <Label>Max iterations</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={settings.reviewMaxIterations}
                disabled={!isAdmin}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, reviewMaxIterations: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-muted-foreground">Iterations before pausing</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default provider &amp; model per stage</CardTitle>
          <CardDescription>
            Applied when a project uses &ldquo;Recommended&rdquo; and has no per-stage override. Leave model blank to use the router default for the selected provider.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {STAGES.map(({ key, label }) => {
            const currentProvider = (settings.defaultProviders[key] ?? "gemini") as ProviderValue;
            const currentModel = settings.defaultModels[key] ?? "";
            const modelOptions = modelsForProvider(currentProvider);

            return (
              <div key={key} className="space-y-2">
                <p className="text-sm font-medium">{label}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Provider</Label>
                    <Select
                      value={currentProvider}
                      disabled={!isAdmin}
                      onValueChange={(v) => setProvider(key, v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Model</Label>
                    <Select
                      value={currentModel || "__default__"}
                      disabled={!isAdmin}
                      onValueChange={(v) => setModel(key, v === "__default__" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Router default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">Router default</SelectItem>
                        {modelOptions.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
