"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Pencil, Globe } from "lucide-react"

interface PersonaCardProps {
    id: string
    name: string
    avatarUrl: string | null
    bioShort: string
    primaryDomain: string
    isActive: boolean
}

export function PersonaCard({ id, name, avatarUrl, bioShort, primaryDomain, isActive }: PersonaCardProps) {
    const params = useParams()
    const locale = params.locale as string

    return (
        <Card className={`transition-opacity ${!isActive ? "opacity-50" : ""}`}>
            <CardContent className="flex items-start gap-4 p-4">
                <Avatar className="h-14 w-14 rounded-lg shrink-0">
                    <AvatarImage src={avatarUrl ?? undefined} alt={name} />
                    <AvatarFallback className="rounded-lg text-lg font-semibold">
                        {name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-sm truncate">{name}</p>
                        {!isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{bioShort}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        {primaryDomain}
                    </div>
                </div>
                <Button size="sm" variant="ghost" asChild>
                    <Link href={`/${locale}/personas/${id}/edit`}>
                        <Pencil className="h-4 w-4" />
                    </Link>
                </Button>
            </CardContent>
        </Card>
    )
}
