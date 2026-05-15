'use client';

import type { PublishTarget } from '@brighttale/shared';

interface YouTubePublishFormProps {
  publishTarget: PublishTarget;
  draft: Record<string, unknown>;
}

export function YouTubePublishForm(_props: YouTubePublishFormProps) {
  return (
    <section data-testid="driver-youtube">
      Coming soon — implemented in T6.x
    </section>
  );
}
