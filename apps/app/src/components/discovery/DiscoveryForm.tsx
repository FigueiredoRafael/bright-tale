"use client";

import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import yaml from "js-yaml";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// Simplified form schema (we transform to full schema on submit)
const formSchema = z.object({
    goal: z.enum(["growth", "engagement", "authority", "monetization"]),
    ideas_requested: z.number().min(1).max(20),
    theme_primary: z.string().min(1),
    theme_subthemes: z.string().optional(),
    evergreen: z.number().min(0).max(100),
    seasonal: z.number().min(0).max(100),
    trending: z.number().min(0).max(100),
    avoid: z.string().optional(),
    formats: z.string().optional(),
    winners: z.string().optional(),
    losers: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface DiscoveryFormProps {
    initialYaml?: string;
    onSave: (yamlContent: string) => void;
    onComplete: (yamlContent: string) => void;
    saving?: boolean;
}

export default function DiscoveryForm({ initialYaml, onSave, onComplete, saving }: DiscoveryFormProps) {
    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors, isDirty },
    } = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            goal: "growth",
            ideas_requested: 5,
            theme_primary: "",
            theme_subthemes: "",
            evergreen: 50,
            seasonal: 25,
            trending: 25,
            avoid: "",
            formats: "blog,video,shorts",
            winners: "",
            losers: "",
        },
    });

    // Parse initial YAML and populate form
    useEffect(() => {
        if (initialYaml) {
            try {
                const parsed = yaml.load(initialYaml) as any;
                if (parsed) {
                    if (parsed.goal) setValue("goal", parsed.goal);
                    if (parsed.output?.ideas_requested) setValue("ideas_requested", parsed.output.ideas_requested);
                    if (parsed.theme?.primary) setValue("theme_primary", parsed.theme.primary);
                    if (parsed.theme?.subthemes) setValue("theme_subthemes", parsed.theme.subthemes.join(", "));
                    if (parsed.temporal_mix?.evergreen) setValue("evergreen", parsed.temporal_mix.evergreen);
                    if (parsed.temporal_mix?.seasonal) setValue("seasonal", parsed.temporal_mix.seasonal);
                    if (parsed.temporal_mix?.trending) setValue("trending", parsed.temporal_mix.trending);
                    if (parsed.constraints?.avoid) setValue("avoid", parsed.constraints.avoid.join(", "));
                    if (parsed.constraints?.formats) setValue("formats", parsed.constraints.formats.join(", "));
                    if (parsed.performance_review?.winners) setValue("winners", parsed.performance_review.winners.join(", "));
                    if (parsed.performance_review?.losers) setValue("losers", parsed.performance_review.losers.join(", "));
                }
            } catch (e) {
                // Invalid YAML, ignore
            }
        }
    }, [initialYaml, setValue]);

    const formToYaml = (data: FormData): string => {
        const structured = {
            goal: data.goal,
            output: {
                ideas_requested: data.ideas_requested,
            },
            theme: {
                primary: data.theme_primary,
                subthemes: data.theme_subthemes?.split(",").map(s => s.trim()).filter(Boolean) || [],
            },
            temporal_mix: {
                evergreen: data.evergreen,
                seasonal: data.seasonal,
                trending: data.trending,
            },
            constraints: {
                avoid: data.avoid?.split(",").map(s => s.trim()).filter(Boolean) || [],
                formats: data.formats?.split(",").map(s => s.trim()).filter(Boolean) || ["blog", "video", "shorts"],
            },
            performance_review: {
                winners: data.winners?.split(",").map(s => s.trim()).filter(Boolean) || [],
                losers: data.losers?.split(",").map(s => s.trim()).filter(Boolean) || [],
            },
        };
        return yaml.dump(structured);
    };

    const handleSave = (data: FormData) => {
        const yamlContent = formToYaml(data);
        onSave(yamlContent);
    };

    const handleComplete = (data: FormData) => {
        const yamlContent = formToYaml(data);
        onComplete(yamlContent);
    };

    return (
        <form className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label>Goal *</Label>
                    <Select
                        defaultValue="growth"
                        onValueChange={(v) => setValue("goal", v as any)}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select goal" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="growth">Growth</SelectItem>
                            <SelectItem value="engagement">Engagement</SelectItem>
                            <SelectItem value="authority">Authority</SelectItem>
                            <SelectItem value="monetization">Monetization</SelectItem>
                        </SelectContent>
                    </Select>
                    {errors.goal && <p className="text-sm text-destructive mt-1">{errors.goal.message}</p>}
                </div>

                <div>
                    <Label>Number of Ideas (1-20) *</Label>
                    <Input
                        type="number"
                        min={1}
                        max={20}
                        {...register("ideas_requested", { valueAsNumber: true })}
                    />
                    {errors.ideas_requested && <p className="text-sm text-destructive mt-1">{errors.ideas_requested.message}</p>}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label>Primary Theme *</Label>
                    <Input {...register("theme_primary")} placeholder="e.g., Content Marketing" />
                    {errors.theme_primary && <p className="text-sm text-destructive mt-1">{errors.theme_primary.message}</p>}
                </div>

                <div>
                    <Label>Subthemes (comma-separated)</Label>
                    <Input {...register("theme_subthemes")} placeholder="e.g., SEO, Social Media" />
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div>
                    <Label>Evergreen %</Label>
                    <Input type="number" min={0} max={100} {...register("evergreen", { valueAsNumber: true })} />
                </div>
                <div>
                    <Label>Seasonal %</Label>
                    <Input type="number" min={0} max={100} {...register("seasonal", { valueAsNumber: true })} />
                </div>
                <div>
                    <Label>Trending %</Label>
                    <Input type="number" min={0} max={100} {...register("trending", { valueAsNumber: true })} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label>Topics to Avoid (comma-separated)</Label>
                    <Input {...register("avoid")} placeholder="e.g., politics, religion" />
                </div>
                <div>
                    <Label>Formats (comma-separated)</Label>
                    <Input {...register("formats")} placeholder="blog, video, shorts, podcast" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label>Past Winners (comma-separated)</Label>
                    <Textarea {...register("winners")} placeholder="Topics that performed well..." rows={2} />
                </div>
                <div>
                    <Label>Past Losers (comma-separated)</Label>
                    <Textarea {...register("losers")} placeholder="Topics that didn't work..." rows={2} />
                </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleSubmit(handleSave)}
                    disabled={saving}
                >
                    {saving ? "Saving..." : "Save Draft"}
                </Button>
                <Button
                    type="button"
                    onClick={handleSubmit(handleComplete)}
                    disabled={saving}
                >
                    Complete & Continue →
                </Button>
            </div>
        </form>
    );
}
