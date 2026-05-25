import type { ImageScope } from '@brighttale/shared'

export function getScopedSlots<T extends { slot: string }>(
  slots: T[],
  scope: ImageScope | undefined,
): T[] {
  if (!scope || scope === 'all') return slots
  if (scope === 'featured_only') return slots.filter((s) => s.slot === 'featured')
  return slots.filter((s) => s.slot === 'featured' || s.slot === 'conclusion')
}
