// PROTOTYPE — throwaway. Mock data shaped like a real video content_draft
// (mirrors keys observed on draft f31f0184: script.chapters, teleprompter_script,
// thumbnail, lower_thirds, title_options, video_description, etc.).

export const MOCK_VIDEO_DRAFT = {
  id: 'mock-video-draft',
  title: 'The China Copycat Trap: Why Entrepreneurs Keep Importing the Wrong Lessons',
  type: 'video' as const,
  status: 'approved',
  channel: {
    name: 'Bright Curios',
    handle: '@brightcurios',
    avatarUrl: '',
    subscribers: '128K',
  },
  estimatedDuration: '9:42',
  contentWarning: null as string | null,
  videoTitle: 'The China Copycat Trap: Why Most Founders Steal the Wrong Lesson',
  titleOptions: [
    'The China Copycat Trap: Why Most Founders Steal the Wrong Lesson',
    'Stop Copying China — You\'re Missing the Hidden Engine',
    'Why "Just Clone It" Fails 9 Out of 10 Small Businesses',
    'The Real Reason China Won (and Why Copying Won\'t Save You)',
  ],
  videoDescription: `Copying China sounds easy. It rarely is.

In this video we unpack the part of the China story founders usually skip — the scale, the speed, the commercialization machine — and what to copy instead if you're running a small business.

⏱ Chapters
0:00 Hook
0:42 Yes, copying was part of the story
2:30 The hidden engine you can't import
4:15 What small businesses should steal instead
6:50 Three traps to avoid
8:40 Outro

📚 Sources in the pinned comment.`,
  pinnedComment:
    '👋 Sources, links and the original research notes are here: brightcurios.com/china-copycat — drop your questions and I\'ll answer them this week.',
  tags: [
    'china business',
    'entrepreneurship',
    'small business',
    'startup lessons',
    'copycat strategy',
    'product market fit',
    'bright curios',
  ],
  category: 'Education',
  visibility: 'public' as 'public' | 'unlisted' | 'private',
  schedule: null as string | null,
  ageRestriction: false,
  madeForKids: false,
  language: 'en-US',
  thumbnail: {
    headline: 'COPY ≠ WIN',
    subhead: 'The lesson everyone misses',
    palette: ['#0f172a', '#ef4444', '#f8fafc'],
    facePromptHint: 'Host pointing at red strike-through over a copied product photo',
    aspectRatio: '16:9',
  },
  thumbnailIdeas: [
    {
      title: 'Strike-through Copy',
      brief: 'Bold "COPY" text with red diagonal strike over a generic product silhouette; host shocked face on right third.',
      mood: 'Punchy, contrarian',
    },
    {
      title: 'Hidden Engine',
      brief: 'Exploded view of a factory belt revealing gears labeled "scale" / "speed" / "capital" behind a thin "China" curtain.',
      mood: 'Investigative, technical',
    },
    {
      title: 'Two Founders',
      brief: 'Split frame — left: stressed founder cloning; right: calm founder building. Title: "Which one wins?"',
      mood: 'Comparative, human',
    },
  ],
  lowerThirds: [
    { at: '0:42', label: 'The setup: copying was real' },
    { at: '2:30', label: 'The hidden engine' },
    { at: '4:15', label: 'What to steal instead' },
    { at: '6:50', label: '3 traps to avoid' },
    { at: '8:40', label: 'Subscribe — weekly drops' },
  ],
  script: {
    hook: {
      content:
        'China did not win just because it copied. That story is too neat — and if you import only the visible part, you import the part most likely to fail.',
    },
    problem: {
      content:
        'A lot of founders hear one simplified idea: China copied what worked, so I should clone a proven product and cash in. On the surface that sounds rational. In practice it traps you at the part of the playbook with the lowest leverage.',
    },
    chapters: [
      {
        title: 'Yes, Copying Was Part of the Story',
        content:
          'Let\'s start with the part people usually oversimplify. [open hands] The "China copied first" reading is not invented out of thin air. There is evidence Chinese firms relied on outside technology at meaningful rates — in 2012, 18% of firms reported using technology from foreign businesses…',
        broll: ['archival factory footage', 'license-deal photos', 'graph: tech-transfer rates 2000-2015'],
        duration: '1:48',
      },
      {
        title: 'The Hidden Engine Nobody Imports',
        content:
          'Here\'s the part the copy-paste reading skips. [lean forward] Behind every visible imitation was a stack you can\'t copy with a screenshot: capex, supply density, distribution muscle, and a workforce that compounds month over month…',
        broll: ['shipping ports timelapse', 'factory worker close-up', 'graph: domestic capex'],
        duration: '1:45',
      },
      {
        title: 'What Small Businesses Should Steal Instead',
        content:
          'If you want one transferable lesson, it\'s not "clone the product." [pause] It\'s "compress your iteration loop." That\'s the lesson that actually transfers down to a five-person team without a billion-dollar belt behind it…',
        broll: ['small-team standup', 'sticky-note iteration board', 'product changelog screencap'],
        duration: '2:35',
      },
      {
        title: 'Three Traps That Will Burn You',
        content:
          'Quick list before we close. [count on fingers] Trap one: copying the surface and ignoring the moat. Trap two: assuming margin will follow market. Trap three: skipping localisation because "it worked over there"…',
        broll: ['warning icon overlay', 'rapid product-clone montage', 'cash-burn graph'],
        duration: '1:50',
      },
      {
        title: 'Outro and What To Do Next',
        content:
          'If you only take one thing from this: copy the loop, not the product. [direct to camera] If this rewired something for you, drop a comment with the trap you almost fell into — I read every one this week.',
        broll: ['host on-camera', 'channel CTA overlay'],
        duration: '0:55',
      },
    ],
    outro: {
      cta: 'Subscribe for the weekly small-business teardown. Next week: why "validated demand" is a lie 80% of the time.',
    },
  },
  teleprompterScript:
    'China did not win just because it copied. That story is too neat, too lazy, and too convenient for founders who want a shortcut. Yes, copying was part of the story. But if you import only that lesson, you are probably importing the part most likely to fail for a small business…',
};

export type MockVideoDraft = typeof MOCK_VIDEO_DRAFT;
