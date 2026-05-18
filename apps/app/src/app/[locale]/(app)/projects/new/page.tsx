'use client'
import { useSearchParams } from 'next/navigation'
import { PipelineWizard } from '@/components/pipeline/PipelineWizard'

export default function NewProjectPage() {
  const searchParams = useSearchParams()
  const deepLinkChannelId = searchParams.get('channelId')

  return <PipelineWizard initialChannelId={deepLinkChannelId} />
}
