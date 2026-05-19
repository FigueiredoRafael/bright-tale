"use client"

import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Pencil, Globe } from "lucide-react"
import type { PersonaTraits } from "@brighttale/shared/types/agents"
import { DEFAULT_PERSONA_TRAITS } from "@brighttale/shared/types/agents"

interface PersonaCardProps {
  id: string
  name: string
  avatarUrl: string | null
  bioShort: string
  primaryDomain: string
  domainLens?: string
  approvedCategories?: string[]
  traitsJson?: Partial<PersonaTraits>
  isActive: boolean
}

const TRAIT_LABELS: Partial<Record<keyof PersonaTraits, string>> = {
  empatia: "Empatia",
  profundidade: "Profundidade",
  autoridade: "Autoridade",
}

export function PersonaCard({
  id, name, avatarUrl, bioShort, primaryDomain,
  approvedCategories = [], traitsJson, isActive,
}: PersonaCardProps) {
  const params = useParams()
  const locale = params.locale as string
  const traits = { ...DEFAULT_PERSONA_TRAITS, ...traitsJson }

  const domain = primaryDomain.length > 32 ? primaryDomain.slice(0, 32) + "…" : primaryDomain

  return (
    <div className={`group relative rounded-2xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow ${!isActive ? "opacity-50" : ""}`}>
      {/* Edit button — top-right overlay */}
      <Link
        href={`/${locale}/personas/${id}`}
        aria-label={`Editar ${name}`}
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm rounded-full p-1.5 hover:bg-background shadow-sm"
        onClick={e => e.stopPropagation()}
      >
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
      </Link>

      {/* The whole card is a link */}
      <Link href={`/${locale}/personas/${id}`} className="block">
        {/* Avatar */}
        <div className="relative w-full aspect-[4/3] bg-muted overflow-hidden">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={name}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover object-top transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-5xl font-bold text-muted-foreground/40 select-none">
                {name.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Name + domain */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-base leading-tight">{name}</h3>
              {!isActive && <Badge variant="secondary" className="text-[10px] shrink-0">Inativo</Badge>}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Globe className="h-3 w-3 text-primary shrink-0" />
              <span className="text-[11px] text-primary font-medium truncate">{domain}</span>
            </div>
          </div>

          {/* Bio */}
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{bioShort}</p>

          {/* Categories */}
          {approvedCategories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {approvedCategories.slice(0, 3).map(c => (
                <Badge key={c} variant="secondary" className="text-[10px] px-1.5 py-0">{c}</Badge>
              ))}
              {approvedCategories.length > 3 && (
                <span className="text-[10px] text-muted-foreground self-center">+{approvedCategories.length - 3}</span>
              )}
            </div>
          )}

          {/* Trait bars — 3 key traits */}
          <div className="pt-2 border-t space-y-1.5">
            {(Object.keys(TRAIT_LABELS) as (keyof PersonaTraits)[]).map(key => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-16 shrink-0">{TRAIT_LABELS[key]}</span>
                <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(traits[key] / 10) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium tabular-nums w-4 text-right">{traits[key]}</span>
              </div>
            ))}
          </div>
        </div>
      </Link>
    </div>
  )
}
