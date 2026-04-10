"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import yaml from "js-yaml";
import { discoveryInputSchema, DiscoveryInput, validateDiscoveryInput } from "@/lib/schemas/discovery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface DiscoveryFormBuilderProps {
    onSubmit?: (data: DiscoveryInput) => void;
}

export default function DiscoveryFormBuilder({ onSubmit }: DiscoveryFormBuilderProps) {
    const { toast } = useToast();
    const [mode, setMode] = useState<"form" | "yaml">("form");
    const [yamlText, setYamlText] = useState<string>("# Paste discovery input YAML here\n");

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<DiscoveryInput>({ resolver: zodResolver(discoveryInputSchema) as any });

    const handleYamlValidate = () => {
        try {
            const parsed = yaml.load(yamlText);
            const result = validateDiscoveryInput(parsed);
            if (!result.success) {
                toast({ title: "Validation error", description: "YAML does not match schema", variant: "destructive" });
                console.error(result.error.issues);
                return;
            }
            toast({ title: "YAML valid", description: "Parsed YAML matches discovery input schema" });
            if (onSubmit) onSubmit(result.data);
        } catch (err: any) {
            toast({ title: "Invalid YAML", description: err.message, variant: "destructive" });
        }
    };

    const onFormSubmit = (data: any) => {
        // Transform form data to match schema
        const transformedData: DiscoveryInput = {
            ...data,
            output: {
                ideas_requested: Number(data.output?.ideas_requested) || 5,
            },
            constraints: {
                ...data.constraints,
                avoid: typeof data.constraints?.avoid === 'string'
                    ? data.constraints.avoid.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : data.constraints?.avoid || [],
            },
            theme: {
                primary: data.theme?.primary || '',
                subthemes: typeof data.theme?.subthemes === 'string'
                    ? data.theme.subthemes.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : data.theme?.subthemes || [],
            },
            temporal_mix: {
                evergreen: Number(data.temporal_mix?.evergreen) || 50,
                seasonal: Number(data.temporal_mix?.seasonal) || 25,
                trending: Number(data.temporal_mix?.trending) || 25,
            },
            performance_review: {
                winners: typeof data.performance_review?.winners === 'string'
                    ? data.performance_review.winners.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : data.performance_review?.winners || [],
                losers: typeof data.performance_review?.losers === 'string'
                    ? data.performance_review.losers.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : data.performance_review?.losers || [],
            },
        };

        toast({ title: "Form valid", description: "Discovery input is valid" });
        if (onSubmit) onSubmit(transformedData);
    };

    return (
        <div className="p-4 border rounded-md">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Discovery Input</h3>
                <div className="flex gap-2">
                    <Button variant={mode === "form" ? "secondary" : "ghost"} size="sm" onClick={() => setMode("form")}>Form</Button>
                    <Button variant={mode === "yaml" ? "secondary" : "ghost"} size="sm" onClick={() => setMode("yaml")}>YAML</Button>
                </div>
            </div>

            {mode === "form" ? (
                <form onSubmit={handleSubmit(onFormSubmit)} className="grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Goal</Label>
                            <Input {...register("goal" as any)} placeholder="growth|engagement|authority|monetization" />
                            {errors.goal && <p className="text-sm text-destructive">{errors.goal?.message?.toString()}</p>}
                        </div>

                        <div>
                            <Label>Idea Count (output.ideas_requested)</Label>
                            <Input type="number" {...register("output.ideas_requested" as any, { valueAsNumber: true })} defaultValue={5} />
                            {errors.output?.ideas_requested && <p className="text-sm text-destructive">{errors.output.ideas_requested?.message?.toString()}</p>}
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label>Theme Primary</Label>
                        <Input {...register("theme.primary" as any)} placeholder="Primary theme" />
                        {errors.theme?.primary && <p className="text-sm text-destructive">{errors.theme?.primary?.message?.toString()}</p>}
                    </div>

                    <div className="grid gap-2">
                        <Label>Constraints - Avoid (comma separated)</Label>
                        <Input {...register("constraints.avoid" as any)} placeholder="comma separated list" />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={() => toast({ title: "Cancelled", description: "No action taken" })}>Cancel</Button>
                        <Button type="submit">Validate</Button>
                    </div>
                </form>
            ) : (
                <div className="grid gap-3">
                    <Label>Discovery Input YAML</Label>
                    <Textarea value={yamlText} onChange={(e) => setYamlText(e.target.value)} rows={12} />
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setYamlText("# Example\n")}>Reset</Button>
                        <Button onClick={handleYamlValidate}>Validate YAML</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
