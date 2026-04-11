"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function TemplateManagerPage() {
    const [templates, setTemplates] = useState<any[]>([]);
    const [preview, setPreview] = useState<any | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        try {
            const res = await fetch("/api/templates");
            if (!res.ok) throw new Error("Failed to fetch templates");
            const json = await res.json();
            setTemplates(json.data || []);
        } catch (err) {
            toast({ title: "Failed to load templates", variant: "destructive" });
        }
    };

    const previewResolved = async (id: string) => {
        try {
            const res = await fetch(`/api/templates/${id}/resolved`);
            if (!res.ok) throw new Error("Failed to fetch resolved");
            const json = await res.json();
            setPreview(json.data?.resolvedTemplate ?? json.resolvedTemplate ?? null);
        } catch (err) {
            toast({ title: "Failed to fetch resolved template", variant: "destructive" });
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-semibold">Templates</h1>
                <div>
                    <Button>Create Template</Button>
                </div>
            </div>

            <div className="grid gap-4">
                {templates.map((t) => (
                    <Card key={t.id}>
                        <CardHeader className="flex items-center justify-between">
                            <CardTitle>{t.name}</CardTitle>
                            <div>
                                <Button variant="ghost" onClick={() => previewResolved(t.id)} size="sm">
                                    Resolved Preview
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <pre className="text-xs">{t.config_json}</pre>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {preview && (
                <div className="mt-6">
                    <h2 className="text-lg font-semibold">Resolved Preview</h2>
                    <pre className="rounded-md border p-3">{JSON.stringify(preview, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
