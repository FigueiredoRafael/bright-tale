"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TemplateForm({ template, onSubmit }: any) {
    const [name, setName] = useState(template?.name ?? "");
    const [config, setConfig] = useState(template?.config_json ?? "{}");

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit?.({ name, config_json: config });
            }}
            className="grid gap-2"
        >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <textarea value={config} onChange={(e) => setConfig(e.target.value)} className="min-h-[120px] rounded-md border p-2" />
            <div className="flex gap-2">
                <Button type="submit">Save</Button>
            </div>
        </form>
    );
}
