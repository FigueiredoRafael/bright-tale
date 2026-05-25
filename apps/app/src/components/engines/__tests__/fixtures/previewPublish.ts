export function makePreviewDraftRow(opts: { id?: string; title?: string } = {}) {
  return {
    id: opts.id ?? 'draft-preview-1',
    title: opts.title ?? 'Why deep-sea creatures glow without sunlight',
    type: 'blog',
    status: 'approved',
    draft_json: {
      blog: {
        full_draft:
          '# Why deep-sea creatures glow\n\nMarine bioluminescence is a survival adaptation.\n\n## Why it evolved\n\nLight in the deep ocean is rare; signaling pays off.\n\n## The biochemistry\n\nLuciferin and luciferase drive the reaction.',
        meta_title: 'Why deep-sea creatures glow without sunlight',
        meta_description: 'A survival adaptation, not decoration.',
      },
    },
    review_score: 92,
    review_verdict: 'approved',
    iteration_count: 1,
  };
}

export function makePreviewAssets() {
  return [
    {
      id: 'asset-feat',
      content_id: 'draft-preview-1',
      source_url: 'https://example.org/featured.jpg',
      webp_url: null,
      role: 'featured_image',
      alt_text: 'Bioluminescent jellyfish in dark water.',
      source: 'ai_generated' as const,
    },
    {
      id: 'asset-body-1',
      content_id: 'draft-preview-1',
      source_url: 'https://example.org/body-1.jpg',
      webp_url: null,
      role: 'body_1',
      alt_text: 'Phylogenetic tree diagram.',
      source: 'ai_generated' as const,
    },
  ];
}

export function makePublishedDraftRow(opts: {
  status?: 'approved' | 'published' | 'scheduled';
  publishedUrl?: string | null;
  wpPostId?: number | null;
} = {}) {
  return {
    id: 'draft-pub-1',
    title: 'Why deep-sea creatures glow without sunlight',
    status: opts.status ?? 'published',
    wordpress_post_id: opts.wpPostId === undefined ? 42 : opts.wpPostId,
    published_url:
      opts.publishedUrl === undefined ? 'https://brightcurios.com/why-deep-sea-creatures-glow' : opts.publishedUrl,
  };
}

export function makeUnpublishedDraftRow() {
  return {
    id: 'draft-pub-1',
    title: 'Why deep-sea creatures glow without sunlight',
    status: 'approved',
    wordpress_post_id: null,
    published_url: null,
  };
}
