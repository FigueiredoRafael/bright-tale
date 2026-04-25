'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ChevronRight, Link2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link } from '@/i18n/navigation';

interface Channel {
  id: string;
  name: string;
}

interface Props {
  channels: Channel[];
  selectedChannelId: string;
  onChannelChange: (id: string) => void;
  onConnect: () => void;
  onBack: () => void;
  connecting: boolean;
}

const easeOutExpo = [0.22, 1, 0.36, 1] as const;

export function ConnectChannelEmptyState({
  channels,
  selectedChannelId,
  onChannelChange,
  onConnect,
  onBack,
  connecting,
}: Props) {
  const reduce = useReducedMotion();

  return (
    <div className="flex flex-col items-center pt-6 pb-16">
      {/* Back link — in-flow, aligned with card */}
      <div className="w-full max-w-md mb-5">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          Back to projects
        </button>
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: easeOutExpo }}
        className="relative w-full max-w-md"
      >
        {/* Contained glow — lives inside the card's stacking context, not page-level */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-2xl overflow-hidden"
        >
          <div className="absolute -top-16 -left-16 h-48 w-48 rounded-full bg-primary/20 blur-[60px]" />
          <div className="absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-accent/15 blur-[60px]" />
        </div>

        <div className="relative rounded-2xl border border-border bg-card shadow-md overflow-hidden">
          {/* Thin top highlight */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
          />

          <div className="relative p-7 space-y-6">
            {/* Icon badge */}
            <motion.div
              animate={reduce ? undefined : { y: [0, -3, 0] }}
              transition={reduce ? undefined : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="relative inline-flex items-center justify-center"
            >
              <div className="absolute inset-0 rounded-2xl bg-primary/15 blur-lg" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-inset ring-primary/20">
                <Link2 className="h-7 w-7 text-primary" strokeWidth={1.75} />
              </div>
            </motion.div>

            {/* Eyebrow + title + subtitle */}
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/80">
                <Sparkles className="h-3 w-3" />
                Step 1 of 6 · Setup
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Connect a Channel
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Pick the content channel this project belongs to. It defines voice, audience,
                and where your finished posts get published on WordPress.
              </p>
            </div>

            {/* Select */}
            <Select value={selectedChannelId} onValueChange={onChannelChange}>
              <SelectTrigger className="h-10 transition-colors hover:border-primary/40 focus:ring-1 focus:ring-primary/40">
                <SelectValue placeholder="Select a channel..." />
              </SelectTrigger>
              <SelectContent>
                {channels.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No channels yet.
                  </div>
                ) : (
                  channels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {/* CTA */}
            <Button
              onClick={onConnect}
              disabled={!selectedChannelId || connecting}
              className="group relative w-full h-10 overflow-hidden bg-gradient-to-r from-primary to-emerald-500 hover:opacity-90 text-primary-foreground shadow-sm shadow-primary/20 transition-opacity"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
              />
              <span className="relative inline-flex items-center justify-center gap-2 font-medium">
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                )}
                {connecting ? 'Connecting…' : 'Connect Channel'}
              </span>
            </Button>

            {/* Helper link */}
            <div className="text-center">
              <Link
                href="/channels"
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Don&apos;t have a channel yet? Create one →
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
