'use client'
import { useMemo } from 'react'

interface ChannelInput { id: string; name: string }
export interface PinnedChannel extends ChannelInput { recent: boolean }

const RECENT_CAP = 3
const KEY_PREFIX = 'lastVisitedChannelAt:'

export function usePinnedChannels(channels: ChannelInput[]): PinnedChannel[] {
  return useMemo(() => {
    const visits: Map<string, number> = new Map()
    for (const c of channels) {
      const v = typeof window !== 'undefined' ? localStorage.getItem(`${KEY_PREFIX}${c.id}`) : null
      if (v) visits.set(c.id, Date.parse(v))
    }
    const visited = channels.filter((c) => visits.has(c.id))
    visited.sort((a, b) => (visits.get(b.id) as number) - (visits.get(a.id) as number))
    const recent = visited.slice(0, RECENT_CAP).map((c) => ({ ...c, recent: true }))
    const recentIds = new Set(recent.map((c) => c.id))
    const rest = channels
      .filter((c) => !recentIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name))
    return [...recent, ...rest.map((c) => ({ ...c, recent: false }))]
  }, [channels])
}

export function recordChannelVisit(channelId: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${KEY_PREFIX}${channelId}`, new Date().toISOString())
  }
}
