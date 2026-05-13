export interface AssetSlot {
  slot: string;
  sectionTitle: string;
  promptBrief: string;
  styleRationale: string;
  aspectRatio: string;
  altText: string;
}

export interface VisualDirectionFixture {
  style: string;
  colorPalette: string[];
  mood: string;
  constraints: string[];
}

export interface ExistingAsset {
  id: string;
  source_url: string;
  webp_url: string | null;
  role: string;
  alt_text: string;
  source: 'ai_generated' | 'upload';
}

export function makeAssetSlots(): AssetSlot[] {
  return [
    {
      slot: 'featured',
      sectionTitle: 'Featured image',
      promptBrief:
        'A pitch-black ocean with a single bioluminescent jellyfish glowing in the center.',
      styleRationale: 'Establishes the contrast between darkness and light.',
      aspectRatio: '16:9',
      altText: 'A bioluminescent jellyfish glowing in deep dark water.',
    },
    {
      slot: '1',
      sectionTitle: 'Why it evolved',
      promptBrief: 'Phylogenetic tree highlighting bioluminescent branches.',
      styleRationale: 'Conveys evolutionary independence.',
      aspectRatio: '1:1',
      altText: 'Phylogenetic tree diagram with highlighted branches.',
    },
    {
      slot: '2',
      sectionTitle: 'Biochemistry',
      promptBrief: 'Molecular reaction diagram of luciferin and luciferase.',
      styleRationale: 'Shows the chemistry behind the light.',
      aspectRatio: '4:3',
      altText: 'Chemical reaction diagram with luciferin reacting.',
    },
  ];
}

export function makeVisualDirection(): VisualDirectionFixture {
  return {
    style: 'Documentary photography with hyperreal lighting',
    colorPalette: ['#001a33', '#00e6cc', '#fff8a8'],
    mood: 'Mysterious, awe-inspiring',
    constraints: ['No human figures', 'No text in the image'],
  };
}

export function makeAssetsDraftRow(opts: {
  id?: string;
  slots?: AssetSlot[] | null;
  visualDirection?: VisualDirectionFixture | null;
} = {}) {
  const slots = opts.slots === undefined ? makeAssetSlots() : opts.slots;
  const visualDirection =
    opts.visualDirection === undefined ? makeVisualDirection() : opts.visualDirection;

  const asset_briefs =
    slots && slots.length > 0
      ? { visualDirection, slots }
      : undefined;

  return {
    id: opts.id ?? 'draft-assets-1',
    title: 'Why deep-sea creatures glow without sunlight',
    type: 'blog',
    status: 'approved',
    draft_json: {
      blog: { full_draft: '# Body' },
      ...(asset_briefs ? { asset_briefs } : {}),
    },
  };
}

export function makeExistingAssets(slots: AssetSlot[] = makeAssetSlots()): ExistingAsset[] {
  return slots.map((s, i) => ({
    id: `asset-${i + 1}`,
    source_url: `https://example.org/asset-${i + 1}.jpg`,
    webp_url: null,
    role: s.slot === 'featured' ? 'featured_image' : `body_${s.slot}`,
    alt_text: s.altText,
    source: 'ai_generated' as const,
  }));
}
