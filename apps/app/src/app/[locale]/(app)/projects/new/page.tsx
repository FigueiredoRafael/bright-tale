'use client'
import { useSearchParams } from 'next/navigation'
import { ProjectCreationWizard } from '@/components/projects/ProjectCreationWizard'

export default function NewProjectPage() {
  const searchParams = useSearchParams()
  const deepLinkChannelId = searchParams.get('channelId')

  return <ProjectCreationWizard initialChannelId={deepLinkChannelId} />
}
