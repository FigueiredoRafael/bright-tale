'use client';

import type { PublishTarget } from '@brighttale/shared';

interface SpotifyPublishFormProps {
  publishTarget: PublishTarget;
  draft: Record<string, unknown>;
}

export function SpotifyPublishForm(_props: SpotifyPublishFormProps) {
  return (
    <section data-testid="driver-spotify">
      Coming soon — implemented in T6.x
    </section>
  );
}
