"use client"

import type { PersonaTraits } from "@brighttale/shared/types/agents"
import { DEFAULT_PERSONA_TRAITS } from "@brighttale/shared/types/agents"

const LABELS: Record<keyof PersonaTraits, string> = {
  empatia:      "Empatia",
  profundidade: "Profundidade",
  provocacao:   "Provocação",
  singularidade: "Singularidade",
  narrativa:    "Narrativa",
  autoridade:   "Autoridade",
}

const KEYS = Object.keys(LABELS) as (keyof PersonaTraits)[]
const N    = KEYS.length
const SIZE = 220
const CX   = SIZE / 2
const CY   = SIZE / 2
const R    = 78
const RINGS = [2, 4, 6, 8, 10]

function angle(i: number) {
  return (i / N) * 2 * Math.PI - Math.PI / 2
}
function pt(r: number, i: number): [number, number] {
  const a = angle(i)
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}
function polyPoints(vals: number[]) {
  return vals.map((v, i) => pt((v / 10) * R, i).join(",")).join(" ")
}
function labelOffset(i: number): [number, number] {
  const a = angle(i)
  const pad = 18
  return [CX + (R + pad) * Math.cos(a), CY + (R + pad) * Math.sin(a)]
}

interface PersonaRadarProps {
  traits?: Partial<PersonaTraits>
  className?: string
}

export function PersonaRadar({ traits, className }: PersonaRadarProps) {
  const merged = { ...DEFAULT_PERSONA_TRAITS, ...traits }
  const vals   = KEYS.map(k => merged[k])

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[260px] mx-auto overflow-visible">
        {/* Grid rings */}
        {RINGS.map(ring => (
          <polygon
            key={ring}
            points={KEYS.map((_, i) => pt((ring / 10) * R, i).join(",")).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeOpacity={ring === 10 ? 0.2 : 0.1}
            strokeWidth={ring === 10 ? 1 : 0.75}
            className="text-foreground"
          />
        ))}

        {/* Axis lines */}
        {KEYS.map((_, i) => {
          const [x, y] = pt(R, i)
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.75} className="text-foreground" />
        })}

        {/* Data polygon */}
        <polygon
          points={polyPoints(vals)}
          fill="hsl(265 89% 70%)"
          fillOpacity={0.25}
          stroke="hsl(265 89% 70%)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Data dots */}
        {vals.map((v, i) => {
          const [x, y] = pt((v / 10) * R, i)
          return <circle key={i} cx={x} cy={y} r={3.5} fill="hsl(265 89% 70%)" />
        })}

        {/* Labels */}
        {KEYS.map((key, i) => {
          const [x, y] = labelOffset(i)
          const textAnchor = x < CX - 4 ? "end" : x > CX + 4 ? "start" : "middle"
          return (
            <text
              key={key}
              x={x} y={y}
              textAnchor={textAnchor}
              dominantBaseline="middle"
              fontSize={9.5}
              fontWeight={500}
              fill="currentColor"
              fillOpacity={0.75}
              className="text-foreground"
            >
              {LABELS[key]}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
