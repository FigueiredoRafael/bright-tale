'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useActiveChannel } from '@/hooks/use-active-channel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronsUpDown, Plus, Check, Radio } from 'lucide-react';
import { ChannelLogo } from '@/components/channels/ChannelLogo';

export function ChannelSwitcher() {
  const router = useRouter();
  const { channels, activeChannel, setActiveChannelId, loading } = useActiveChannel();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="mx-3 mb-3 h-11 rounded-lg bg-muted/40 animate-pulse" />
    );
  }

  // No channels — show "Create channel" CTA
  if (channels.length === 0) {
    return (
      <button
        onClick={() => router.push('/onboarding')}
        className="mx-3 mb-3 flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-dashed border-primary/30 text-left hover:border-primary/60 hover:bg-primary/[0.02] transition-all group"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Plus className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-xs font-medium text-foreground">Create content channel</div>
            <div className="text-[10px] text-muted-foreground">Get started</div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="mx-3 mb-3">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-border hover:border-primary/30 hover:bg-white/[0.02] transition-all text-left">
            <div className="flex items-center gap-2 min-w-0">
              <ChannelLogo logoUrl={activeChannel?.logo_url} name={activeChannel?.name ?? '?'} size="sm" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground truncate">
                  {activeChannel?.name ?? 'Select content channel'}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {activeChannel?.niche ?? activeChannel?.channel_type ?? '—'}
                </div>
              </div>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56" sideOffset={4}>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Your Content Channels
          </div>
          {channels.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onClick={() => {
                setActiveChannelId(c.id);
                setOpen(false);
              }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <ChannelLogo logoUrl={c.logo_url} name={c.name} size="xs" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{c.name}</div>
                <div className="text-[10px] text-muted-foreground">{c.niche ?? c.channel_type}</div>
              </div>
              {c.id === activeChannel?.id && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push('/onboarding')} className="cursor-pointer">
            <Plus className="h-3.5 w-3.5 mr-2" />
            <span className="text-xs">Create new content channel</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/channels')} className="cursor-pointer">
            <Radio className="h-3.5 w-3.5 mr-2" />
            <span className="text-xs">Manage channels</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
