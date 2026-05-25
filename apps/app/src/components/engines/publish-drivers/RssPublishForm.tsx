'use client';

import type { PublishTarget } from '@brighttale/shared';

interface RssPublishFormProps {
  publishTarget: PublishTarget;
  draft: Record<string, unknown>;
}

export function RssPublishForm(_props: RssPublishFormProps) {
  return (
    <section data-testid="driver-rss">
      Coming soon — implemented in T6.x
    </section>
  );
}
