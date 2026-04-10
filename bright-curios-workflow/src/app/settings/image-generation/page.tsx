"use client";

/**
 * Image Generation Provider Settings Page
 * Manage Gemini Imagen configuration for AI image generation.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, CheckCircle2, XCircle, ImageIcon } from "lucide-react";

interface ImageGenConfig {
    id: string;
    provider: "gemini";
    model: string;
    is_active: boolean;
    config_json: string | null;
    created_at: string;
    updated_at: string;
    has_api_key: boolean;
}

const providerLabels: Record<string, string> = {
    gemini: "Google Gemini Imagen",
};

const modelLabels: Record<string, string> = {
    "gemini-2.5-flash-image": "Gemini 2.5 Flash Image (Recommended)",
    "imagen-3.0-generate-002": "Imagen 3 (High Quality)",
};

export default function ImageGenerationSettingsPage() {
    const { toast } = useToast();
    const [configs, setConfigs] = useState<ImageGenConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [testing, setTesting] = useState<string | null>(null);

    // Form state
    const [provider] = useState<"gemini">("gemini");
    const [model, setModel] = useState<string>("gemini-2.5-flash-image");
    const [apiKey, setApiKey] = useState("");
    const [configJson, setConfigJson] = useState("");
    const [isActive, setIsActive] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchConfigs();
    }, []);

    async function fetchConfigs() {
        try {
            const res = await fetch("/api/image-generation/config");
            if (!res.ok) throw new Error("Failed to fetch configs");
            const data = await res.json();
            setConfigs(data);
        } catch (error: unknown) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to fetch configs",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }

    async function handleCreate() {
        if (!apiKey.trim()) {
            toast({ title: "Validation Error", description: "API key is required", variant: "destructive" });
            return;
        }

        setSaving(true);
        try {
            const res = await fetch("/api/image-generation/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider,
                    model,
                    api_key: apiKey,
                    is_active: isActive,
                    config_json: configJson || undefined,
                }),
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || "Failed to create config");
            }

            toast({ title: "Success", description: "Image generator configured successfully" });
            setShowForm(false);
            setApiKey("");
            setConfigJson("");
            setIsActive(false);
            fetchConfigs();
        } catch (error: unknown) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to create config",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Delete this image generator config?")) return;

        try {
            const res = await fetch(`/api/image-generation/config/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete config");
            toast({ title: "Success", description: "Config deleted" });
            fetchConfigs();
        } catch (error: unknown) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Delete failed",
                variant: "destructive",
            });
        }
    }

    async function handleToggleActive(id: string, currentActive: boolean) {
        try {
            const res = await fetch(`/api/image-generation/config/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: !currentActive }),
            });
            if (!res.ok) throw new Error("Failed to update config");
            toast({
                title: "Success",
                description: currentActive ? "Config deactivated" : "Config activated",
            });
            fetchConfigs();
        } catch (error: unknown) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Update failed",
                variant: "destructive",
            });
        }
    }

    async function handleTest(config: ImageGenConfig) {
        setTesting(config.id);
        try {
            const res = await fetch("/api/image-generation/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: config.id }),
            });
            const result = await res.json();

            if (result.success) {
                toast({ title: "Connection Successful", description: result.message });
            } else {
                toast({ title: "Connection Failed", description: result.error, variant: "destructive" });
            }
        } catch (error: unknown) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Test failed",
                variant: "destructive",
            });
        } finally {
            setTesting(null);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 px-4 max-w-6xl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <ImageIcon className="h-8 w-8 text-primary" />
                        Image Generation Settings
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Configure AI image generation providers for blog and video assets
                    </p>
                </div>
                <Button onClick={() => setShowForm(!showForm)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Provider
                </Button>
            </div>

            {/* Create Form */}
            {showForm && (
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Add Image Generator</CardTitle>
                        <CardDescription>
                            Configure Google Gemini Imagen for AI-powered image generation
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="provider">Provider</Label>
                            <Select value="gemini" disabled>
                                <SelectTrigger id="provider">
                                    <SelectValue>Google Gemini Imagen</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="gemini">Google Gemini Imagen</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label htmlFor="model">Model</Label>
                            <Select value={model} onValueChange={setModel}>
                                <SelectTrigger id="model">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="gemini-2.5-flash-image">
                                        Gemini 2.5 Flash Image (Recommended)
                                    </SelectItem>
                                    <SelectItem value="imagen-3.0-generate-002">
                                        Imagen 3 (High Quality)
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label htmlFor="apiKey">Gemini API Key</Label>
                            <Input
                                id="apiKey"
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="AIza..."
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Encrypted with AES-256-GCM. Get your key from{" "}
                                <span className="font-mono">aistudio.google.com</span>
                            </p>
                        </div>

                        <div>
                            <Label htmlFor="configJson">Advanced Configuration (Optional JSON)</Label>
                            <Textarea
                                id="configJson"
                                value={configJson}
                                onChange={(e) => setConfigJson(e.target.value)}
                                placeholder='{"numberOfImages": 1, "aspectRatio": "16:9"}'
                                rows={3}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="isActive"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                                className="rounded"
                            />
                            <Label htmlFor="isActive" className="cursor-pointer">
                                Set as active provider
                            </Label>
                        </div>

                        <div className="flex gap-2">
                            <Button onClick={handleCreate} disabled={saving}>
                                {saving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    "Save Config"
                                )}
                            </Button>
                            <Button variant="outline" onClick={() => setShowForm(false)}>
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Configs List */}
            <div className="space-y-4">
                {configs.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <ImageIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-muted-foreground">No image generator configured yet</p>
                            <Button onClick={() => setShowForm(true)} className="mt-4">
                                <Plus className="h-4 w-4 mr-2" />
                                Add Gemini Imagen
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    configs.map((config) => (
                        <Card key={config.id}>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div>
                                            <CardTitle className="text-lg">
                                                {providerLabels[config.provider] ?? config.provider}
                                            </CardTitle>
                                            <p className="text-sm text-muted-foreground">
                                                {modelLabels[config.model] ?? config.model}
                                            </p>
                                        </div>
                                        {config.is_active ? (
                                            <Badge variant="default" className="gap-1">
                                                <CheckCircle2 className="h-3 w-3" />
                                                Active
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="gap-1">
                                                <XCircle className="h-3 w-3" />
                                                Inactive
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleToggleActive(config.id, config.is_active)}
                                        >
                                            {config.is_active ? "Deactivate" : "Activate"}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleTest(config)}
                                            disabled={testing === config.id}
                                        >
                                            {testing === config.id ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    Testing...
                                                </>
                                            ) : (
                                                "Test Connection"
                                            )}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => handleDelete(config.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                <CardDescription>
                                    {config.has_api_key ? (
                                        <span className="flex items-center gap-1 text-green-600">
                                            <CheckCircle2 className="h-3 w-3" />
                                            API key configured (encrypted)
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-amber-600">
                                            <XCircle className="h-3 w-3" />
                                            No API key configured
                                        </span>
                                    )}
                                </CardDescription>
                            </CardHeader>
                            {config.config_json && (
                                <CardContent>
                                    <Label className="text-xs text-muted-foreground">Configuration:</Label>
                                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
                                        {JSON.stringify(JSON.parse(config.config_json), null, 2)}
                                    </pre>
                                </CardContent>
                            )}
                        </Card>
                    ))
                )}
            </div>

            {/* Info Card */}
            <Card className="mt-6 border-blue-200 bg-blue-50/50">
                <CardHeader>
                    <CardTitle className="text-sm">How Image Generation Works</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2 text-muted-foreground">
                    <p>Only one provider can be <strong>active</strong> at a time.</p>
                    <p>
                        The active provider is used in the Production stage to generate blog featured images,
                        section images, video thumbnails, and chapter illustrations.
                    </p>
                    <p>API keys are encrypted with AES-256-GCM before storage.</p>
                    <p>
                        Generated images are stored locally under{" "}
                        <code className="bg-blue-100 px-1 py-0.5 rounded text-xs">public/generated-images/</code>{" "}
                        and accessible from the global Image Bank.
                    </p>
                    <p>
                        You can also set <code className="bg-blue-100 px-1 py-0.5 rounded text-xs">IMAGE_PROVIDER=gemini</code>{" "}
                        and <code className="bg-blue-100 px-1 py-0.5 rounded text-xs">GEMINI_API_KEY</code>{" "}
                        in your environment to bypass database configuration.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
