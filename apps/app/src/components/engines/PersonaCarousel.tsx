'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Sparkles, Quote, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Persona } from '@brighttale/shared/types/agents';
import { getPersonaTheme } from './utils/personaTheme';
import type { RankedPersona } from './utils/personaScoring';

interface Props {
  rankedPersonas: RankedPersona[];
  selectedPersonaId: string | null;
  onSelect: (id: string) => void;
}

export function PersonaCarousel({ rankedPersonas, selectedPersonaId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const n = rankedPersonas.length;

  const selectedIdx = useMemo(() => {
    const idx = rankedPersonas.findIndex((r) => r.persona.id === selectedPersonaId);
    return idx >= 0 ? idx : 0;
  }, [rankedPersonas, selectedPersonaId]);

  // Keyboard nav scoped to the carousel container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const direction = e.key === 'ArrowLeft' ? -1 : 1;
      const newIdx = (selectedIdx + direction + n) % n;
      onSelect(rankedPersonas[newIdx].persona.id);
    }
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [selectedIdx, n, rankedPersonas, onSelect]);

  if (n === 0) return null;

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        role="listbox"
        aria-label="Author persona carousel"
        tabIndex={0}
        className="relative h-[460px] sm:h-[480px] outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-3xl"
        style={{ perspective: '1600px' }}
      >
        {rankedPersonas.map(({ persona, isRecommended }, i) => {
          const rawOffset = (i - selectedIdx + n) % n;
          const offset = rawOffset > n / 2 ? rawOffset - n : rawOffset;
          const isCenter = offset === 0;
          return (
            <PersonaCard
              key={persona.id}
              persona={persona}
              isRecommended={isRecommended}
              isCenter={isCenter}
              offset={offset}
              onClick={() => onSelect(persona.id)}
            />
          );
        })}
      </div>

      {/* Nav controls */}
      {n > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onSelect(rankedPersonas[(selectedIdx - 1 + n) % n].persona.id)}
            className="p-2 rounded-full border border-border hover:border-primary/50 hover:bg-muted/40 transition-colors"
            aria-label="Previous persona"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5">
            {rankedPersonas.map(({ persona }, i) => {
              const theme = getPersonaTheme(persona.slug);
              const active = i === selectedIdx;
              return (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => onSelect(persona.id)}
                  className="rounded-full transition-all"
                  style={{
                    width: active ? '24px' : '8px',
                    height: '8px',
                    background: active ? theme.accent : 'rgba(120, 120, 130, 0.35)',
                    boxShadow: active ? `0 0 12px rgba(${theme.glow}, 0.6)` : undefined,
                  }}
                  aria-label={`Select ${persona.name}`}
                />
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onSelect(rankedPersonas[(selectedIdx + 1) % n].persona.id)}
            className="p-2 rounded-full border border-border hover:border-primary/50 hover:bg-muted/40 transition-colors"
            aria-label="Next persona"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

interface CardProps {
  persona: Persona;
  isRecommended: boolean;
  isCenter: boolean;
  offset: number;
  onClick: () => void;
}

function PersonaCard({ persona, isRecommended, isCenter, offset, onClick }: CardProps) {
  const theme = getPersonaTheme(persona.slug);
  const direction = offset === 0 ? 0 : offset > 0 ? 1 : -1;

  // Compose the carousel transform on top of the centering translate
  const carouselTransform = isCenter
    ? 'translateZ(0) rotateY(0deg) scale(1)'
    : `translateX(${direction * 78}%) translateZ(-180px) rotateY(${-direction * 28}deg) scale(0.8)`;

  const signaturePhrase = persona.writingVoiceJson.signaturePhrases[0] ?? '';
  const humorTagline = persona.soulJson.humorStyle.split(/[,.]/)[0] || 'Author';
  const opinions = persona.soulJson.strongOpinions.slice(0, 2);

  return (
    <div
      onClick={onClick}
      role="option"
      aria-selected={isCenter}
      tabIndex={isCenter ? 0 : -1}
      className="absolute left-1/2 top-1/2 w-[88%] max-w-md cursor-pointer"
      style={{
        transform: `translate(-50%, -50%) ${carouselTransform}`,
        transition: 'transform 550ms cubic-bezier(0.4, 0, 0.2, 1), opacity 350ms, filter 350ms',
        opacity: isCenter ? 1 : 0.42,
        filter: isCenter ? 'none' : 'blur(3px)',
        zIndex: isCenter ? 20 : 10,
        pointerEvents: isCenter ? 'auto' : 'auto',
        transformStyle: 'preserve-3d',
      }}
    >
      <div
        className="relative overflow-hidden rounded-3xl border-2 p-6 sm:p-7 backdrop-blur-md"
        style={{
          background: `linear-gradient(160deg, rgba(${theme.glow}, 0.14) 0%, rgba(${theme.glow}, 0.04) 45%, rgba(20, 20, 30, 0.55) 100%)`,
          borderColor: isCenter ? theme.accent : `rgba(${theme.glow}, 0.25)`,
          boxShadow: isCenter
            ? `0 0 0 1px rgba(${theme.glow}, 0.4), 0 20px 60px -10px rgba(${theme.glow}, 0.45), 0 8px 30px rgba(0, 0, 0, 0.45)`
            : '0 8px 24px rgba(0, 0, 0, 0.35)',
        }}
      >
        {/* Decorative bloom */}
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-50"
          style={{
            background: `radial-gradient(circle, rgba(${theme.glow}, 0.55), transparent 70%)`,
          }}
        />
        <div
          className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full opacity-30"
          style={{
            background: `radial-gradient(circle, rgba(${theme.glow}, 0.45), transparent 70%)`,
          }}
        />

        {/* AI Pick ribbon */}
        {isRecommended && (
          <div
            className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest backdrop-blur-md"
            style={{
              color: theme.accent,
              borderColor: `rgba(${theme.glow}, 0.5)`,
              background: `rgba(${theme.glow}, 0.12)`,
            }}
          >
            <Sparkles className="h-3 w-3" />
            <span>AI Pick</span>
          </div>
        )}

        {/* Header */}
        <div className="relative mb-5 flex items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white"
            style={{
              background: theme.gradient,
              boxShadow: `0 8px 24px -4px rgba(${theme.glow}, 0.55)`,
            }}
          >
            {persona.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <h3
              className="truncate text-3xl leading-none tracking-tight"
              style={{ fontFamily: 'var(--font-instrument-serif)', fontStyle: 'italic' }}
            >
              {persona.name}
            </h3>
            <p
              className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/80"
            >
              {humorTagline}
            </p>
          </div>
        </div>

        {/* Pull quote */}
        {signaturePhrase && (
          <div className="relative mb-5 pl-7">
            <Quote
              className="absolute left-0 top-0 h-5 w-5 -scale-x-100 opacity-60"
              style={{ color: theme.accent }}
            />
            <blockquote
              className="text-lg leading-snug text-foreground/95"
              style={{ fontFamily: 'var(--font-instrument-serif)', fontStyle: 'italic' }}
            >
              {signaturePhrase}
            </blockquote>
          </div>
        )}

        {/* Opinion chips */}
        {opinions.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {opinions.map((opinion, k) => (
              <span
                key={k}
                title={opinion}
                className="inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] leading-tight"
                style={{
                  color: theme.accent,
                  borderColor: `rgba(${theme.glow}, 0.35)`,
                  background: `rgba(${theme.glow}, 0.08)`,
                }}
              >
                <span className="line-clamp-1">{opinion}</span>
              </span>
            ))}
          </div>
        )}

        {/* Footer: primary domain */}
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {persona.primaryDomain}
        </p>
      </div>
    </div>
  );
}
