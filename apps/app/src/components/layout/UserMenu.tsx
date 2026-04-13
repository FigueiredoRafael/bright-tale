"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Settings, User as UserIcon, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initialsFromEmail(email: string | null): string {
    if (!email) return "U";
    const local = email.split("@")[0];
    const parts = local.split(/[._-]/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase();
}

export default function UserMenu() {
    const router = useRouter();
    const [email, setEmail] = useState<string | null>(null);
    const [signingOut, setSigningOut] = useState(false);

    useEffect(() => {
        const sb = createClient();
        sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    }, []);

    async function handleSignOut() {
        setSigningOut(true);
        const sb = createClient();
        await sb.auth.signOut();
        router.push("/auth/login");
        router.refresh();
    }

    const initials = initialsFromEmail(email);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="w-[34px] h-[34px] rounded-full bg-primary/10 border border-primary/15 flex items-center justify-center text-primary text-xs font-semibold hover:bg-primary/15 transition-colors"
                    aria-label="User menu"
                >
                    {initials}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground">Signed in as</span>
                        <span className="text-sm font-medium truncate">{email ?? "—"}</span>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/settings/profile" className="cursor-pointer">
                        <UserIcon className="h-4 w-4 mr-2" /> Perfil
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer">
                        <Settings className="h-4 w-4 mr-2" /> Settings
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="cursor-pointer text-destructive focus:text-destructive"
                >
                    {signingOut ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <LogOut className="h-4 w-4 mr-2" />
                    )}
                    Sair
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
