/**
 * Tests for Zod schemas
 * Run with: npx tsx src/lib/schemas/__tests__/schemas.test.ts
 */

import {
  validateDiscoveryInput,
  validateDiscoveryOutput,
  validateProductionInput,
  validateProductionOutput,
  validateReviewOutput,
} from "../index";

// Sample Discovery Input
const sampleDiscoveryInput = {
  performance_review: {
    winners: ["BC-IDEA-001", "BC-IDEA-005"],
    losers: ["BC-IDEA-003"],
  },
  theme: {
    primary: "psychology",
    subthemes: ["productivity", "decision-making"],
  },
  goal: "growth",
  temporal_mix: {
    evergreen: 70,
    seasonal: 20,
    trending: 10,
  },
  constraints: {
    avoid: ["politics", "religion"],
    formats: ["blog", "video", "shorts", "podcast"],
  },
  output: {
    ideas_requested: 5,
  },
};

// Sample Discovery Output
const sampleDiscoveryOutput = {
  ideas: [
    {
      idea_id: "BC-IDEA-001",
      title: "Why Your Brain Tricks You Into Bad Decisions",
      core_tension:
        "We think we're rational, but cognitive biases hijack our choices daily",
      target_audience:
        "Knowledge workers, entrepreneurs, anyone making important decisions",
      search_intent: "informational",
      primary_keyword: {
        keyword: "cognitive biases decision making",
        difficulty: "medium",
        basis: "High search volume, medium competition, educational intent",
      },
      mrbeast_hook: "I tested every cognitive bias on myself for 30 days",
      monetization: {
        affiliate_angle:
          "Books on behavioral psychology, decision-making tools",
      },
      why_it_wins:
        "Evergreen topic, high engagement, multiple repurpose angles",
      repurpose_map: {
        blog: "Complete guide with examples and countermeasures",
        video: "8-10 min explainer with visual demonstrations",
        shorts: [
          "Confirmation bias quick test",
          "Anchoring effect demonstration",
          "Dunning-Kruger explained",
        ],
        podcast: "Deep dive interview format with examples",
      },
      risk_flags: ["May require fact-checking", "Competitors exist"],
      verdict: "viable",
    },
  ],
  pick_recommendation: {
    best_choice: "BC-IDEA-001",
    why: "Strongest tension, clearest monetization path, highest repurpose potential",
  },
};

// Sample Production Input
const sampleProductionInput = {
  selected_idea: {
    idea_id: "BC-IDEA-001",
    title: "Why Your Brain Tricks You Into Bad Decisions",
    core_tension:
      "We think we're rational, but cognitive biases hijack our choices daily",
    target_audience: "Knowledge workers, entrepreneurs, decision makers",
    primary_keyword: "cognitive biases decision making",
    mrbeast_hook: "I tested every cognitive bias on myself for 30 days",
    monetization: {
      affiliate_angle: "Books on behavioral psychology, decision-making tools",
    },
  },
  production_settings: {
    goal: "growth",
    tone: "curious",
    blog_words: "1400-2200",
    video_minutes: "8-10",
    affiliate_policy: {
      include: true,
      placement: "around 60% mark",
    },
  },
};

// Sample Production Output
const sampleProductionOutput = {
  blog: {
    title: "Why Your Brain Tricks You Into Bad Decisions (And How to Stop It)",
    slug: "cognitive-biases-bad-decisions",
    meta_description:
      "Discover the hidden cognitive biases that sabotage your decision-making daily. Learn science-backed strategies to overcome them.",
    primary_keyword: "cognitive biases decision making",
    outline: [
      {
        h2: "What Are Cognitive Biases?",
        bullets: [
          "Definition and origins",
          "How they evolved",
          "Why they matter today",
        ],
      },
      {
        h2: "The Most Common Biases Ruining Your Decisions",
        bullets: [
          "Confirmation bias",
          "Anchoring effect",
          "Dunning-Kruger effect",
        ],
      },
      {
        h2: "How to Overcome Cognitive Biases",
        bullets: [
          "Self-awareness techniques",
          "Decision-making frameworks",
          "Tools and resources",
        ],
      },
    ],
    full_draft: `Your brain is an incredible pattern-matching machine that has evolved over millions of years to help you survive. But in today's complex world, these same mental shortcuts—called cognitive biases—often lead us astray. In this comprehensive guide, we'll explore the most common cognitive biases that affect your daily decisions and provide practical strategies to overcome them.

## What Are Cognitive Biases?

Cognitive biases are systematic patterns of deviation from norm or rationality in judgment. They occur because our brains use shortcuts, called heuristics, to process information quickly. While these shortcuts were useful for our ancestors facing immediate survival threats, they can lead to poor decisions in modern contexts.

## The Most Common Biases Ruining Your Decisions

### Confirmation Bias
We naturally seek out information that confirms our existing beliefs while ignoring contradictory evidence. This can lead to echo chambers and poor decision-making based on incomplete information.

### Anchoring Effect
The first piece of information we receive heavily influences our subsequent judgments. Retailers exploit this by showing inflated original prices before discounts.

### Dunning-Kruger Effect
People with low ability at a task overestimate their competence, while experts often underestimate theirs. This can lead to overconfidence in areas where we lack expertise.

## How to Overcome Cognitive Biases

The first step is awareness. Once you recognize these patterns, you can implement decision-making frameworks, seek diverse perspectives, and use tools to make more rational choices. Remember, the goal isn't to eliminate biases entirely—that's impossible—but to minimize their negative impact on your most important decisions.`,
    affiliate_insert: {
      location: "After section 2, around 60% mark",
      copy: 'If you want to dive deeper into how your mind works, I highly recommend "Thinking, Fast and Slow" by Daniel Kahneman...',
      rationale:
        "Natural fit after explaining biases, provides value before solutions",
    },
  },
  video: {
    title_options: [
      "Why Your Brain is Lying to You (And How to Fix It)",
      "I Tested Every Cognitive Bias on Myself for 30 Days",
      "The Psychology Trick That's Ruining Your Decisions",
    ],
    thumbnail_best_bet: {
      visual: "Split face: half rational businessman, half confused person",
      overlay_text: "YOUR BRAIN IS LYING",
    },
    script: {
      hook_0_10s:
        "Your brain is lying to you right now, and it's costing you money, time, and opportunities. You think you're making rational decisions, but cognitive biases are sabotaging you every single day.",
      context_0_10_0_45:
        "Every day, we make hundreds of decisions. But here's the thing - most of them are wrong. Our brains evolved to make quick decisions based on incomplete information, which was great for survival but terrible for modern decision-making. Let me show you exactly how this works and why it matters.",
      teaser_0_45_1_00:
        "By the end of this video, you'll know exactly which mental shortcuts are sabotaging you...",
      chapters: [
        {
          time_range: "1:00-3:30",
          chapter_title: "What Are Cognitive Biases?",
          content:
            "Let me show you an example. Imagine you're shopping online and see a product marked down from $200 to $100. Your brain immediately thinks \"great deal!\" But here's the catch - that original price might have been artificially inflated just to make the discount look better. This is the anchoring effect in action, and it happens to all of us, all the time.",
          b_roll: [
            "Brain scan imagery",
            "Decision-making graphics",
            "Historical context visuals",
          ],
        },
      ],
      affiliate_60_percent: {
        time_range: "6:00-6:30",
        content: "If you want to learn more about this, I highly recommend...",
        b_roll: ["Book cover", "Product shot", "Reading setup"],
      },
      ending_takeaway:
        "Remember: awareness is the first step to better decision-making. You can't eliminate cognitive biases entirely, but you can learn to recognize them and minimize their impact on your most important choices.",
      cta: "If you found this helpful, check out my video on decision-making frameworks next",
    },
  },
  shorts: [
    {
      title: "This Bias is Ruining Your Decisions",
      script:
        "Confirmation bias: you only see what confirms what you already believe...",
      shots: [
        'Hook: text overlay "Your brain is lying"',
        "Demonstration with examples",
        "CTA: Follow for more psychology tips",
      ],
    },
    {
      title: "The Dunning-Kruger Effect Explained",
      script: "Ever notice how the worst drivers think they're the best?",
      shots: [
        "Hook with relatable example",
        "Graph showing competence vs confidence",
        "Practical takeaway",
      ],
    },
    {
      title: "Anchoring Bias Will Drain Your Wallet",
      script: 'That "sale" price? It\'s manipulating your brain...',
      shots: [
        "Shopping scenario hook",
        "Price comparison visual",
        "How to avoid it tip",
      ],
    },
  ],
  engagement: {
    pinned_comments: [
      "Which cognitive bias surprises you the most? Drop it in the comments 👇",
      "I spent 3 months researching this - what should I cover next?",
      "If you struggle with decision fatigue, you need to see this: [link]",
    ],
  },
  visuals: {
    thumbnails: [
      {
        visual: "Split brain: logical vs emotional side",
        overlay_text: "YOUR BRAIN LIES",
        background_style: "High contrast, blue and red color split",
        why_it_works: "Visual metaphor, creates curiosity, contrasts well",
      },
      {
        visual: "Person with thought bubbles showing wrong decisions",
        overlay_text: "STOP BAD CHOICES",
        background_style: "Clean white background, red accents",
        why_it_works: "Problem-focused, actionable language, clean design",
      },
      {
        visual: "Brain with glitching effect",
        overlay_text: "BRAIN HACKS EXPOSED",
        background_style: "Dark tech aesthetic, neon accents",
        why_it_works: "Modern, trendy, implies insider knowledge",
      },
    ],
  },
};

// Sample Review Input
const sampleReviewInput = {
  stage: "blog",
  goals: {
    primary: "growth",
  },
  asset: {
    type: "blog",
    content: `Your brain is an incredible pattern-matching machine that has evolved over millions of years to help you survive. But in today's complex world, these same mental shortcuts—called cognitive biases—often lead us astray. In this comprehensive guide, we'll explore the most common cognitive biases that affect your daily decisions.`,
  },
};

// Sample Review Output - Blog Stage
const sampleReviewOutputBlog = {
  stage: "blog",
  verdict: "revision_required",
  issues: {
    critical: [
      "Missing internal links to related content",
      "Meta description exceeds 160 characters",
    ],
    minor: [
      "Some sentences could be shorter for readability",
      "Consider adding a callout box for key takeaways",
    ],
  },
  required_changes: [
    "Add 2-3 internal links to related psychology posts",
    "Trim meta description to 155 characters",
    "Break up the paragraph in section 2 (currently 6 sentences)",
  ],
  gate: {
    approved_for_next_stage: false,
  },
};

// Sample Review Output - Publication Stage
const sampleReviewOutputPublication = {
  stage: "publication",
  publish_plan: {
    blog: {
      date: "2026-02-15",
      seo: {
        title_variant:
          "Why Your Brain Tricks You Into Bad Decisions (And How to Stop It)",
        meta_description:
          "Discover the hidden cognitive biases that sabotage your decision-making daily. Learn science-backed strategies to overcome them.",
        internal_links: [
          "/psychology/decision-making-frameworks",
          "/productivity/overcome-decision-fatigue",
          "/self-growth/thinking-fast-and-slow-summary",
        ],
      },
    },
    youtube: {
      date: "2026-02-17",
      title_final: "Why Your Brain is Lying to You (And How to Fix It)",
      description_outline: [
        "Introduction to cognitive biases",
        "Chapter timestamps",
        "Resources and links",
        "CTA to related videos",
      ],
      tags: [
        "cognitive biases",
        "decision making",
        "psychology",
        "self improvement",
        "productivity",
        "behavioral psychology",
        "thinking better",
      ],
      pinned_comment_choice:
        "Which cognitive bias surprises you the most? Drop it in the comments 👇",
    },
    shorts: {
      schedule: [
        { date: "2026-02-18", short_number: 1 },
        { date: "2026-02-20", short_number: 2 },
        { date: "2026-02-22", short_number: 3 },
      ],
    },
  },
  packaging_tests: [
    "Test thumbnail 1 vs 2 for first 48 hours",
    "Monitor CTR and adjust title if below 8%",
    "A/B test pinned comments after 24 hours",
  ],
  ready_to_publish: true,
};

import { describe, it, expect } from "vitest";

describe("Zod Schemas", () => {
  it("discovery input and output validate", () => {
    const discoveryInputResult = validateDiscoveryInput(sampleDiscoveryInput);
    expect(discoveryInputResult.success).toBe(true);

    const discoveryOutputResult = validateDiscoveryOutput(
      sampleDiscoveryOutput,
    );
    expect(discoveryOutputResult.success).toBe(true);
  });

  it("production input and output validate", () => {
    const productionInputResult = validateProductionInput(
      sampleProductionInput,
    );
    expect(productionInputResult.success).toBe(true);

    const productionOutputResult = validateProductionOutput(
      sampleProductionOutput,
    );
    expect(productionOutputResult.success).toBe(true);
  });
});
