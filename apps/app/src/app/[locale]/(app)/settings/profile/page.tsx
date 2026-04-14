"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Profile {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
}

export default function ProfilePage() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            const sb = createClient();
            const { data: auth } = await sb.auth.getUser();
            if (!auth.user) {
                setLoading(false);
                return;
            }
            try {
                const res = await fetch(`/api/users/${auth.user.id}`);
                const json = await res.json();
                if (json.data) {
                    setProfile(json.data);
                    setFirstName(json.data.first_name ?? "");
                    setLastName(json.data.last_name ?? "");
                }
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    async function handleSave() {
        if (!profile) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/users/${profile.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ firstName, lastName }),
            });
            const json = await res.json();
            if (json.error) {
                toast.error(json.error.message);
                return;
            }
            toast.success("Perfil atualizado");
        } catch {
            toast.error("Falha ao salvar");
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!profile) {
        return <div className="p-6 text-sm text-muted-foreground">Sessão não encontrada.</div>;
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Perfil</CardTitle>
                    <CardDescription>Suas informações pessoais.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Email</Label>
                        <Input value={profile.email} disabled />
                        <p className="text-xs text-muted-foreground">
                            Para alterar o email, contate o suporte.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Nome</Label>
                            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Sobrenome</Label>
                            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            Salvar
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
