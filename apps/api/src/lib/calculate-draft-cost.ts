import type { CreditSettingsRecord } from './credit-settings.js'

const FORMAT_TO_FIELD: Record<string, keyof CreditSettingsRecord> = {
  blog:    'costBlog',
  video:   'costVideo',
  shorts:  'costShorts',
  podcast: 'costPodcast',
}

export function calculateDraftCost(type: string, settings: CreditSettingsRecord): number {
  const field = FORMAT_TO_FIELD[type]
  return field ? (settings[field] as number) : settings.costBlog
}
