'use client';

import type { PublishTarget } from '@brighttale/shared';
import { PublishPanel } from '@/components/preview/PublishPanel';

interface PublishPanelPassthrough {
  draftId: string;
  channelId: string;
  draftStatus: string;
  hasAssets: boolean;
  wordpressPostId: number | null;
  publishedUrl: string | null;
  onPublish?: (params: { mode: string; scheduledDate?: string }) => void;
  isPublishing?: boolean;
  previewData?: {
    categories: string[];
    tags: string[];
    seo: { title: string; slug: string; metaDescription: string };
    featuredImageUrl?: string;
    imageCount: number;
    suggestedDate?: string;
  };
}

interface WordPressPublishFormProps {
  publishTarget: PublishTarget;
  panelProps: PublishPanelPassthrough;
}

export function WordPressPublishForm({ panelProps }: WordPressPublishFormProps) {
  return (
    <section data-testid="driver-wordpress">
      <PublishPanel {...panelProps} />
    </section>
  );
}
