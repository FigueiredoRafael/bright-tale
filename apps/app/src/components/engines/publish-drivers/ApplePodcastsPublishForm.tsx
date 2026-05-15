'use client';

import type { PublishTarget } from '@brighttale/shared';

interface ApplePodcastsPublishFormProps {
  publishTarget: PublishTarget;
  draft: Record<string, unknown>;
}

export function ApplePodcastsPublishForm(_props: ApplePodcastsPublishFormProps) {
  return (
    <section data-testid="driver-apple-podcasts">
      Coming soon — implemented in T6.x
    </section>
  );
}
