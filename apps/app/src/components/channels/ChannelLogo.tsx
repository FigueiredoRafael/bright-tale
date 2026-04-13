'use client';

import { Radio } from 'lucide-react';

interface ChannelLogoProps {
  logoUrl: string | null | undefined;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<string, string> = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-lg',
};

const ICON_SIZES: Record<string, string> = {
  xs: 'h-3 w-3',
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-7 w-7',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Renders the channel logo or a fallback (initials + radio icon).
 */
export function ChannelLogo({ logoUrl, name, size = 'sm', className = '' }: ChannelLogoProps) {
  const sizeClass = SIZE_CLASSES[size];

  if (logoUrl) {
    return (
      <div className={`${sizeClass} rounded-md overflow-hidden shrink-0 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name} className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div className={`${sizeClass} rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold ${className}`}>
      {name ? (
        <span>{getInitials(name)}</span>
      ) : (
        <Radio className={ICON_SIZES[size]} />
      )}
    </div>
  );
}
