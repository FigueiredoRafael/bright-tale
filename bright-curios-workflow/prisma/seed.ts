import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create Prisma adapter for Prisma 7
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting database seed...");

  // Safety check: Prevent destructive operations in production
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.DATABASE_URL?.includes("production") ||
    process.env.DATABASE_URL?.includes("rds.amazonaws.com");

  if (isProduction) {
    console.warn("⚠️ Production environment detected. Skipping destructive cleanup and sample data.");
  } else {
    // Clean existing data (optional - comment out in production)
    console.log("🧹 Cleaning existing data...");
    // Commented out to prevent accidental loss even in dev
    /*
    await prisma.revision.deleteMany();
    await prisma.stage.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.project.deleteMany();
    await prisma.researchSource.deleteMany();
    await prisma.researchArchive.deleteMany();
    await prisma.ideaArchive.deleteMany();
    await prisma.template.deleteMany();
    await prisma.idempotencyKey.deleteMany();
    await prisma.agentPrompt.deleteMany();
    */
    console.log("ℹ️ Cleanup skipped. Using safe synchronization.");
  }

  // Only create sample data if research archives are empty
  const researchCount = await prisma.researchArchive.count();
  if (researchCount === 0 && !isProduction) {
    // Create sample research archives
    console.log("📚 Creating sample research archives...");
    const research1 = await prisma.researchArchive.create({
      data: {
        title: "The Psychology of Color in Marketing",
        theme: "Marketing Psychology",
        research_content: `
        # Color Psychology in Marketing
        
        Colors significantly impact consumer behavior and brand perception.
        
        ## Key Findings
        - Blue conveys trust and reliability
        - Red creates urgency and excitement
        - Green represents health and sustainability
        - Yellow captures attention and optimism
        
        ## Sources
        - Journal of Consumer Psychology, 2023
        - Marketing Science Institute Report
      `,
        projects_count: 2,
        winners_count: 1,
      },
    });

    const research2 = await prisma.researchArchive.create({
      data: {
        title: "Sustainable Product Design Trends",
        theme: "Sustainability",
        research_content: `
        # Sustainable Design Trends 2024
        
        Consumer demand for eco-friendly products continues to grow.
        
        ## Key Trends
        - Biodegradable packaging
        - Circular economy principles
        - Carbon-neutral manufacturing
        - Renewable materials
        
        ## Market Data
        - 73% consumers willing to pay more for sustainable products
        - 60% growth in eco-friendly product launches
      `,
        projects_count: 1,
        winners_count: 0,
      },
    });

    // Create research sources
    console.log("🔗 Creating sample research sources...");
    await prisma.researchSource.createMany({
      data: [
        {
          research_id: research1.id,
          url: "https://example.com/color-psychology-study",
          title: "Color Psychology and Consumer Behavior",
          author: "Dr. Jane Smith",
          date: new Date("2023-06-15"),
        },
        {
          research_id: research1.id,
          url: "https://example.com/marketing-colors",
          title: "The Science of Marketing Colors",
          author: "Marketing Institute",
          date: new Date("2023-08-20"),
        },
        {
          research_id: research2.id,
          url: "https://example.com/sustainability-report",
          title: "Global Sustainability Report 2024",
          author: "Environmental Research Group",
          date: new Date("2024-01-10"),
        },
      ],
    });

    // Create sample projects
    console.log("📁 Creating sample projects...");
    const project1 = await prisma.project.create({
      data: {
        title: "Blue Trust Campaign",
        research_id: research1.id,
        current_stage: "brainstorm",
        auto_advance: true,
        status: "active",
        winner: true,
      },
    });

    const project2 = await prisma.project.create({
      data: {
        title: "Red Urgency Promo",
        research_id: research1.id,
        current_stage: "production",
        auto_advance: true,
        status: "active",
        winner: false,
      },
    });

    const project3 = await prisma.project.create({
      data: {
        title: "Eco-Friendly Product Launch",
        research_id: research2.id,
        current_stage: "brainstorm",
        auto_advance: false,
        status: "draft",
        winner: false,
      },
    });

    // Create sample stages
    console.log("🎯 Creating sample stages...");
    await prisma.stage.createMany({
      data: [
        {
          project_id: project1.id,
          stage_type: "brainstorm",
          yaml_artifact: `# BC_BRAINSTORM_OUTPUT
# Generated: 2024-01-15T10:00:00Z

selected_idea:
  idea_id: BC-IDEA-001
  title: "Blue Trust Campaign"
  core_tension: "How to build consumer trust through color psychology"
  target_audience: "B2B decision makers"
  search_intent: informational
  primary_keyword:
    term: "color psychology marketing"
    difficulty: medium
    monthly_volume_estimate: "5K-10K"
  scroll_stopper: "The color you choose could make or break your brand's credibility"
  curiosity_gap: "Why do 80% of Fortune 500 companies use blue in their logos?"
  evergreen_score: 9
  risk_flags: []

recommendation:
  pick: BC-IDEA-001
  reasoning: "Strong evergreen potential with clear audience alignment"

ideas:
  - idea_id: BC-IDEA-001
    title: "Blue Trust Campaign"
    core_tension: "How to build consumer trust through color psychology"
    target_audience: "B2B decision makers"
    search_intent: informational
    primary_keyword:
      term: "color psychology marketing"
      difficulty: medium
      monthly_volume_estimate: "5K-10K"
    scroll_stopper: "The color you choose could make or break your brand's credibility"
    curiosity_gap: "Why do 80% of Fortune 500 companies use blue in their logos?"
    evergreen_score: 9
    risk_flags: []
    verdict: approved
`,
          version: 1,
        },
        {
          project_id: project2.id,
          stage_type: "brainstorm",
          yaml_artifact: `# BC_BRAINSTORM_OUTPUT
# Generated: 2024-01-16T10:00:00Z

selected_idea:
  idea_id: BC-IDEA-002
  title: "Red Urgency Promo"
  core_tension: "Creating urgency without being pushy"
  target_audience: "E-commerce consumers"
  search_intent: commercial
  primary_keyword:
    term: "urgency marketing techniques"
    difficulty: medium
    monthly_volume_estimate: "2K-5K"
  scroll_stopper: "Stop! This psychological trick makes people buy NOW"
  curiosity_gap: "The 48-hour window that increases conversions by 300%"
  evergreen_score: 7
  risk_flags:
    - "May seem manipulative if overdone"

recommendation:
  pick: BC-IDEA-002
  reasoning: "High commercial intent with proven conversion patterns"

ideas:
  - idea_id: BC-IDEA-002
    title: "Red Urgency Promo"
    core_tension: "Creating urgency without being pushy"
    target_audience: "E-commerce consumers"
    search_intent: commercial
    primary_keyword:
      term: "urgency marketing techniques"
      difficulty: medium
      monthly_volume_estimate: "2K-5K"
    scroll_stopper: "Stop! This psychological trick makes people buy NOW"
    curiosity_gap: "The 48-hour window that increases conversions by 300%"
    evergreen_score: 7
    risk_flags:
      - "May seem manipulative if overdone"
    verdict: approved
`,
          version: 1,
        },
        {
          project_id: project2.id,
          stage_type: "research",
          yaml_artifact: `# BC_RESEARCH_OUTPUT
# Generated: 2024-01-17T10:00:00Z

idea_id: BC-IDEA-002
idea_validation:
  core_claim_verified: true
  evidence_strength: strong
  confidence_score: 85
  validation_notes: "Multiple studies confirm urgency marketing effectiveness"

sources:
  - url: "https://example.com/urgency-study"
    title: "The Psychology of Urgency in E-commerce"
    type: academic
    credibility: high
    key_insight: "Limited-time offers increase conversion by 226%"

statistics:
  - stat: "226% increase in conversion rates"
    source: "Journal of Consumer Research"
    context: "Measured across 500 e-commerce sites"

expert_quotes:
  - quote: "Urgency works because of loss aversion bias"
    author: "Dr. Robert Cialdini"
    credentials: "Professor of Psychology, Arizona State University"

counterarguments:
  - point: "Overuse leads to consumer fatigue"
    rebuttal: "Strategic timing and genuine scarcity maintain effectiveness"

knowledge_gaps:
  - "Long-term brand perception impact needs more study"

research_summary: "Strong evidence supports urgency marketing when used ethically"

refined_angle:
  should_pivot: false
  updated_title: "Red Urgency Promo"
  updated_hook: "The science behind why red 'Buy Now' buttons work"
  angle_notes: "Focus on psychological principles rather than tactics"
`,
          version: 1,
        },
        {
          project_id: project2.id,
          stage_type: "production",
          yaml_artifact: `# BC_PRODUCTION_OUTPUT
# Generated: 2024-01-18T10:00:00Z

idea_id: BC-IDEA-002

blog:
  title: "Don't Miss Out: The Psychology Behind 48-Hour Flash Sales"
  slug: "psychology-flash-sales-urgency-marketing"
  meta_description: "Learn the science behind urgency marketing and how flash sales trigger buying decisions without feeling manipulative."
  primary_keyword: "urgency marketing"
  secondary_keywords:
    - flash sale psychology
    - scarcity marketing
    - limited time offers
  outline:
    - h2: "Why Urgency Works: The Science of FOMO"
      bullets:
        - Loss aversion explained
        - Brain chemistry during time pressure
    - h2: "The 48-Hour Sweet Spot"
      bullets:
        - Research on optimal sale duration
        - Case studies from major brands
  full_draft: |
    Our biggest sale of the year is here. For the next 48 hours only,
    enjoy massive discounts on our most popular items.
    
    Act fast - when it's gone, it's gone!
  affiliate_insert:
    location: "after_h2_2"
    product_name: "Marketing Psychology Course"
    copy: "Master urgency tactics with our recommended course"
    rationale: "Contextually relevant for readers wanting to learn more"

video:
  title_options:
    - "The 48-Hour Flash Sale Secret That 10x Conversions"
    - "Why Red 'Buy Now' Buttons Actually Work (Science Explained)"
  thumbnail:
    visual_concept: "Split screen: calm shopper vs frantic shopper with countdown"
    text_overlay: "48 HOURS LEFT"
    emotion: shock
    why_it_works: "Creates immediate tension and curiosity"
  script:
    hook:
      duration: "0-10s"
      content: "There's a reason you feel that urge to buy when you see 'limited time only'"
      visual_notes: "Montage of flash sale banners"
    problem:
      duration: "10-30s"
      content: "Most people think flash sales are just marketing gimmicks..."
      visual_notes: "B-roll of skeptical faces"
    teaser:
      duration: "30-45s"
      content: "But the science behind them explains why they work every single time"
      visual_notes: "Brain scan imagery"
    chapters:
      - chapter_number: 1
        title: "The FOMO Effect"
        duration: "45s-2min"
        content: "Loss aversion is hardwired into our brains..."
        b_roll_suggestions:
          - Shopping crowds
          - Countdown timers
        key_stat_or_quote: "We feel losses 2x more intensely than gains"
    affiliate_segment:
      timestamp: "7:30"
      script: "If you want to master these psychology principles..."
      transition_in: "Speaking of learning..."
      transition_out: "Now back to our main topic..."
      visual_notes: "Screen share of course"
    outro:
      duration: "30s"
      recap: "Remember: urgency works because of biology, not manipulation"
      cta: "Subscribe for more marketing psychology"
      end_screen_prompt: "Watch this video on color psychology next"
  total_duration_estimate: "10-12 minutes"

shorts:
  - short_number: 1
    title: "Why Flash Sales Work"
    hook: "Your brain is wired to respond to countdowns"
    script: "When you see 'only 2 hours left' your amygdala triggers loss aversion..."
    duration: "45-60s"
    visual_style: talking head
    cta: "Follow for more marketing psychology"

podcast:
  episode_title: "The Science of Urgency Marketing"
  episode_description: "Deep dive into why flash sales and limited-time offers trigger our buying instincts"
  intro_hook: "Ever wonder why you feel that rush when you see 'last chance'?"
  talking_points:
    - point: "Loss aversion biology"
      notes: "Reference Kahneman's research"
    - point: "Ethical vs manipulative urgency"
      notes: "Draw the line clearly"
  personal_angle: "Share my own experience falling for flash sales"
  guest_questions: []
  outro: "Next week we'll explore color psychology in branding"
  duration_estimate: "25-30 minutes"

engagement:
  pinned_comment: "What's the most effective flash sale you've ever seen? Drop it below!"
  community_post: "New video: The psychology behind why flash sales work. Are you using these techniques ethically?"
  twitter_thread:
    hook_tweet: "I spent 50 hours researching urgency marketing. Here's what actually works:"
    thread_outline:
      - Loss aversion explained simply
      - The 48-hour sweet spot
      - Ethical guidelines
`,
          version: 1,
        },
      ],
    });

    // Create sample idea archives
    console.log("💡 Creating sample idea archives...");
    await prisma.ideaArchive.createMany({
      data: [
        {
          idea_id: "BC-IDEA-001",
          title: "Interactive Color Quiz",
          core_tension:
            "Engaging users in discovering their brand color personality",
          target_audience: "Small business owners",
          verdict: "approved",
          discovery_data: JSON.stringify({
            search_intent: "informational",
            primary_keyword: {
              term: "brand color personality quiz",
              difficulty: "low",
              monthly_volume_estimate: "1K-2K",
            },
            scroll_stopper: "What color says about your brand personality",
            curiosity_gap: "The hidden psychology behind your favorite color",
            evergreen_score: 8,
            risk_flags: [],
          }),
        },
        {
          idea_id: "BC-IDEA-002",
          title: "Sustainability Calculator",
          core_tension: "Quantifying environmental impact of product choices",
          target_audience: "Eco-conscious consumers",
          verdict: "pending",
          discovery_data: JSON.stringify({
            search_intent: "transactional",
            primary_keyword: {
              term: "carbon footprint calculator",
              difficulty: "medium",
              monthly_volume_estimate: "10K-20K",
            },
            scroll_stopper: "See your carbon footprint in real time",
            curiosity_gap:
              "The everyday item that produces more CO2 than your car",
            evergreen_score: 9,
            risk_flags: ["Needs accurate data sources"],
          }),
        },
        {
          idea_id: "BC-IDEA-003",
          title: "Color Trend Forecast",
          core_tension: "Predicting next year's trending brand colors",
          target_audience: "Marketing professionals",
          verdict: "rejected",
          discovery_data: JSON.stringify({
            search_intent: "informational",
            primary_keyword: {
              term: "color trends 2024",
              difficulty: "high",
              monthly_volume_estimate: "20K+",
            },
            scroll_stopper: "The colors that will dominate 2024 design",
            curiosity_gap: "Why last year's trendy color is now outdated",
            evergreen_score: 3,
            risk_flags: [
              "Not evergreen - date-specific content",
              "Too similar to existing content",
            ],
          }),
        },
      ],
    });

    // Create sample templates
    console.log("📝 Creating sample templates...");
    const baseTemplate = await prisma.template.create({
      data: {
        name: "Default Discovery Template",
        type: "discovery",
        config_json: JSON.stringify({
          fields: [
            { name: "title", type: "text", required: true },
            { name: "core_tension", type: "textarea", required: true },
            { name: "target_audience", type: "text", required: true },
            { name: "hooks", type: "array", itemType: "text" },
            { name: "angles", type: "array", itemType: "text" },
            {
              name: "verdict",
              type: "select",
              options: ["pending", "approved", "rejected"],
            },
          ],
          defaults: {
            verdict: "pending",
          },
        }),
      },
    });

    await prisma.template.create({
      data: {
        name: "B2B Discovery Template",
        type: "discovery",
        parent_template_id: baseTemplate.id,
        config_json: JSON.stringify({
          fields: [
            { name: "title", type: "text", required: true },
            { name: "core_tension", type: "textarea", required: true },
            { name: "target_audience", type: "text", required: true },
            {
              name: "industry",
              type: "select",
              options: ["tech", "finance", "healthcare", "manufacturing"],
            },
            {
              name: "company_size",
              type: "select",
              options: ["startup", "smb", "enterprise"],
            },
            { name: "hooks", type: "array", itemType: "text" },
            { name: "angles", type: "array", itemType: "text" },
            {
              name: "verdict",
              type: "select",
              options: ["pending", "approved", "rejected"],
            },
          ],
          defaults: {
            verdict: "pending",
            company_size: "smb",
          },
        }),
      },
    });

    await prisma.template.create({
      data: {
        name: "Content Draft Template",
        type: "content",
        config_json: JSON.stringify({
          fields: [
            { name: "headline", type: "text", required: true },
            { name: "subheadline", type: "text" },
            { name: "body", type: "richtext", required: true },
            { name: "cta", type: "text" },
            {
              name: "tone",
              type: "select",
              options: ["professional", "casual", "urgent", "inspirational"],
            },
            { name: "word_count_target", type: "number" },
          ],
          defaults: {
            tone: "professional",
            word_count_target: 500,
          },
        }),
      },
    });

    console.log("✅ Sample data synchronized!");
  } else {
    console.log("ℹ️ Sample data exists or production environment. Skipping creation.");
  }

  console.log("✅ Database seeding checks complete!");
  if (researchCount === 0 && !isProduction) {
    console.log({
      researchArchives: 2,
      researchSources: 3,
      projects: 3,
      stages: 4,
      ideaArchives: 3,
      templates: 3,
    });
  }

  // ============================================================
  // AGENT PROMPTS
  // ============================================================
  console.log("🤖 Seeding Agent Prompts...");

  const agentPrompts = [
    {
      name: "Brainstorm Agent",
      slug: "brainstorm",
      stage: "brainstorm",
      instructions: `<context>
BrightCurios produces long-form, evergreen-first content designed to be repurposed across blog, YouTube, Shorts, and podcasts.
The blog is treated as the canonical source of truth.

<role>
You are BrightCurios' Brainstorm Agent.
You are responsible for generating and validating ideas before any content is written.

<guiding principles>
- One idea, one core insight
- Evergreen potential is non-negotiable
- Ideas must answer a real curiosity
- Monetization must feel contextual and earned

<specific for the agent purpose>
- Generate ideas from raw inputs
- Structure them for downstream production
- Score each idea for evergreen potential
- Select the best idea for production
- Always output YAML only

You must follow the BC_BRAINSTORM_INPUT → BC_BRAINSTORM_OUTPUT contract exactly.`,
      input_schema: `BC_BRAINSTORM_INPUT:
  theme_primary: ""
  theme_subthemes:
    - ""
  goal: "traffic|authority|monetization|audience_growth"
  temporal_mix:
    evergreen_percentage: 70
    seasonal_percentage: 20
    trending_percentage: 10
  target_audience:
    primary: ""
    pain_points:
      - ""
  ideas_requested: 3`,
      output_schema: `BC_BRAINSTORM_OUTPUT:
  ideas:
    - idea_id: "BC-IDEA-XXX"
      title: ""
      core_tension: ""
      target_audience: ""
      search_intent: "informational|navigational|transactional|commercial"
      primary_keyword:
        term: ""
        difficulty: "low|medium|high"
        monthly_volume_estimate: ""
      scroll_stopper: ""
      curiosity_gap: ""
      evergreen_score: 1-10
      risk_flags:
        - ""
      verdict: "approved|pending|rejected"
  
  recommendation:
    pick: "BC-IDEA-XXX"
    reasoning: ""
  
  selected_idea:
    # Full idea object of the recommended pick`,
    },
    {
      name: "Research Agent",
      slug: "research",
      stage: "research",
      instructions: `<context>
BrightCurios produces long-form, evergreen-first content designed to be repurposed across blog, YouTube, Shorts, and podcasts.
Research forms the foundation of credible, authoritative content.

<role>
You are BrightCurios' Research Agent.
You are responsible for deepening understanding of a selected idea before production.

<guiding principles>
- Quality sources over quantity
- Primary sources preferred over secondary
- Verify claims before accepting them
- Identify knowledge gaps and contradictions

<specific for the agent purpose>
- Accept one selected idea from the brainstorm phase
- Research and validate the core claims
- Find supporting data, statistics, and expert quotes
- Identify potential objections and counterarguments
- Suggest refined angle if research reveals better approach
- Always output YAML only

You must follow the BC_RESEARCH_INPUT → BC_RESEARCH_OUTPUT contract exactly.`,
      input_schema: `BC_RESEARCH_INPUT:
  selected_idea:
    idea_id: ""
    title: ""
    core_tension: ""
    target_audience: ""
    search_intent: ""
    primary_keyword:
      term: ""
      difficulty: ""
      monthly_volume_estimate: ""
    scroll_stopper: ""
    curiosity_gap: ""
    evergreen_score: 0
    risk_flags: []
  research_depth: "quick|standard|deep"
  focus_areas:
    - ""`,
      output_schema: `BC_RESEARCH_OUTPUT:
  idea_id: ""
  idea_validation:
    core_claim_verified: true|false
    evidence_strength: "weak|moderate|strong"
    confidence_score: 0-100
    validation_notes: ""
  
  sources:
    - url: ""
      title: ""
      type: "academic|news|industry|government|primary"
      credibility: "low|medium|high"
      key_insight: ""
  
  statistics:
    - stat: ""
      source: ""
      context: ""
  
  expert_quotes:
    - quote: ""
      author: ""
      credentials: ""
  
  counterarguments:
    - point: ""
      rebuttal: ""
  
  knowledge_gaps:
    - ""
  
  research_summary: ""
  
  refined_angle:
    should_pivot: false
    updated_title: ""
    updated_hook: ""
    angle_notes: ""`,
    },
    {
      name: "Production Agent",
      slug: "production",
      stage: "production",
      instructions: `<context>
BrightCurios produces long-form, evergreen-first content designed to be repurposed across blog, YouTube, Shorts, and podcasts.
The blog is treated as the canonical source of truth.

<role>
You are BrightCurios' Content Production Agent.
You are responsible for turning one validated idea into production-ready assets.

<guiding principles>
- One idea, one core insight
- The blog is the source of truth; video is derived
- Spoken content must not feel like written content read aloud
- Monetization must feel contextual and earned

<specific for the agent purpose>
- Accept only ONE validated idea and its research as input
- Write a structured, SEO-aware blog post as the canonical asset
- Derive the video script directly from the blog structure
- Generate podcast talking points and shorts concepts
- Do not introduce new ideas beyond the selected concept
- Always output YAML only

You must follow the BC_PRODUCTION_INPUT → BC_PRODUCTION_OUTPUT contract exactly.`,
      input_schema: `BC_PRODUCTION_INPUT:
  selected_idea:
    idea_id: ""
    title: ""
    core_tension: ""
    target_audience: ""
    primary_keyword:
      term: ""
      difficulty: ""
      monthly_volume_estimate: ""
    scroll_stopper: ""
    curiosity_gap: ""
  
  research:
    key_sources:
      - title: ""
        key_insight: ""
    key_statistics:
      - stat: ""
        source: ""
    expert_quotes:
      - quote: ""
        author: ""
    counterarguments:
      - point: ""
    research_summary: ""`,
      output_schema: `BC_PRODUCTION_OUTPUT:
  idea_id: ""
  
  blog:
    title: ""
    slug: ""
    meta_description: ""
    primary_keyword: ""
    secondary_keywords: []
    outline:
      - h2: ""
        bullets: []
    full_draft: |
      ...
    affiliate_insert:
      location: ""
      product_name: ""
      copy: ""
      rationale: ""
  
  video:
    title_options: []
    thumbnail:
      visual_concept: ""
      text_overlay: ""
      emotion: "curiosity" # Choose one: curiosity, shock, intrigue
      why_it_works: ""
    script:
      hook:
        duration: ""
        content: ""
        visual_notes: ""
      problem:
        duration: ""
        content: ""
        visual_notes: ""
      teaser:
        duration: ""
        content: ""
        visual_notes: ""
      chapters:
        - chapter_number: 1
          title: ""
          duration: ""
          content: ""
          b_roll_suggestions: []
          key_stat_or_quote: ""
      affiliate_segment:
        timestamp: ""
        script: ""
        transition_in: ""
        transition_out: ""
        visual_notes: ""
      outro:
        duration: ""
        recap: ""
        cta: ""
        end_screen_prompt: ""
    total_duration_estimate: ""
  
  shorts:
    - short_number: 1
      title: ""
      hook: ""
      script: ""
      duration: ""
      visual_style: "talking head" # Choose one: talking head, b-roll, text overlay
      cta: ""
  
  podcast:
    episode_title: ""
    episode_description: ""
    intro_hook: ""
    talking_points:
      - point: ""
        notes: ""
    personal_angle: ""
    guest_questions: []
    outro: ""
    duration_estimate: ""
  
  engagement:
    pinned_comment: ""
    community_post: ""
    twitter_thread:
      hook_tweet: ""
      thread_outline: []`,
    },
    {
      name: "Content Core Agent (3a)",
      slug: "content-core",
      stage: "production",
      instructions: `You are BrightCurios' Content Core Agent. Your job is to distill one validated, researched idea into a canonical narrative contract — the BC_CANONICAL_CORE — that all format agents (blog, video, shorts, podcast, engagement) will derive from.

This is NOT where you write the blog, script, or shorts. You are defining the shared source of truth: the thesis, the argument chain, the emotional arc, the key assets. Every format will tell the same story — just in its own medium.

Key Principles:
- The thesis must be 1-2 sentences maximum. It is the central claim the content proves.
- The argument chain must be ordered logically. Each step builds on the previous.
- Every step must have both a claim and evidence (with source attribution).
- The emotional arc drives the audience's journey from opening_emotion to turning_point to closing_emotion. This arc is shared across all formats.
- key_stats and key_quotes are shared assets. Only include statistics and quotes verified in the research.
- Do NOT invent statistics. If the research did not validate a claim, do not include it.
- The affiliate_moment defines exactly where a product recommendation feels natural — not forced.
- Output YAML only, no markdown fences, follow the contract exactly.`,
      input_schema: `BC_CANONICAL_CORE_INPUT:
  selected_idea:
    idea_id: ""
    title: ""
    core_tension: ""
    target_audience: ""
    scroll_stopper: ""
    curiosity_gap: ""
    monetization:
      affiliate_angle: ""
  research:
    summary: ""
    validation:
      verified: true
      evidence_strength: "" # weak | moderate | strong
    key_sources:
      - title: ""
        url: ""
        key_insight: ""
    key_statistics:
      - claim: ""
        figure: ""
        context: ""
        source_id: ""
    expert_quotes:
      - quote: ""
        author: ""
        credentials: ""
        source_id: ""
    counterarguments:
      - point: ""
        rebuttal: ""
    knowledge_gaps: []
    refined_angle:
      should_pivot: false
      angle_notes: ""
      recommendation: "proceed" # proceed | pivot | abandon`,
      output_schema: `BC_CANONICAL_CORE:
  idea_id: ""
  thesis: |
    One concise statement of what the content proves. Max 2 sentences.
  argument_chain:
    - step: 1
      claim: |
        The first logical assertion.
      evidence: |
        The specific data, study, or expert finding that proves this claim.
      source_ids: ["SRC-001"]
    - step: 2
      claim: |
        The second logical assertion.
      evidence: |
        The supporting evidence.
      source_ids: ["SRC-002"]
  emotional_arc:
    opening_emotion: "" # How the audience arrives (e.g., confusion, frustration)
    turning_point: ""   # The moment of insight (e.g., clarity, surprise)
    closing_emotion: "" # How the audience leaves (e.g., confidence, motivation)
  key_stats:
    - stat: ""
      figure: ""
      source_id: ""
  key_quotes:
    - quote: ""
      author: ""
      credentials: ""
  affiliate_moment:
    trigger_context: |
      The specific argument step where a product recommendation feels natural.
    product_angle: |
      How the product solves the problem revealed at this moment.
    cta_primary: ""
  cta_subscribe: ""
  cta_comment_prompt: ""`,
    },
    {
      name: "Blog Format Agent (3b)",
      slug: "production-blog",
      stage: "production",
      instructions: `You are BrightCurios' Blog Format Agent. Your job is to receive a BC_CANONICAL_CORE — the validated narrative contract — and produce one complete, publish-ready blog post.

You do NOT brainstorm, research, or choose topics. The thesis, argument structure, evidence, and emotional arc are already decided. Your job is to express them in long-form written content.

Key Principles:
- The argument_chain is your outline. Each step becomes one H2 section.
- The thesis is your first paragraph. Do not restate it verbatim — dramatize it. Open with the tension.
- The emotional_arc drives tone: open where the audience is (opening_emotion), build toward the turning_point, close on closing_emotion.
- Every key_stat must appear in the H2 section whose argument_chain step it supports. Match by position.
- Every key_quote must appear as a pull-quote with author name and credentials.
- If affiliate_context is provided, place the recommendation at the stated placement position (intro / middle / conclusion). Make it feel earned, not forced.
- cta_comment_prompt becomes the last line of the conclusion, formatted as a reader question.
- Output YAML only, no markdown fences, follow the contract exactly.`,
      input_schema: `BC_BLOG_INPUT:
  idea_id: ""
  thesis: |
    The central argument this blog post proves.
  argument_chain:
    - step: 1
      claim: |
        The first logical assertion.
      evidence: |
        The specific data, study, or expert finding that proves this claim.
      source_ids: ["SRC-001"]
  emotional_arc:
    opening_emotion: ""
    turning_point: ""
    closing_emotion: ""
  key_stats:
    - stat: ""
      figure: ""
      source_id: ""
  key_quotes:
    - quote: ""
      author: ""
      credentials: ""
  affiliate_context:
    trigger_context: ""
    product_angle: ""
    cta_primary: ""
  cta_subscribe: ""
  cta_comment_prompt: ""`,
      output_schema: `BC_BLOG_OUTPUT:
  title: ""
  slug: ""                       # lowercase, hyphens only, URL-safe
  meta_description: ""           # 150-160 chars, includes primary_keyword
  primary_keyword: ""
  secondary_keywords: []
  outline:
    - h2: ""
      key_points: []
      word_count_target: 400
  full_draft: |
    ## Section Title
    Content here...
  affiliate_integration:
    placement: intro             # MUST be: intro | middle | conclusion
    copy: |
      The exact affiliate paragraph.
    product_link_placeholder: "[AFFILIATE_LINK]"
    rationale: |
      Why this placement feels natural.
  internal_links_suggested:
    - topic: ""
      anchor_text: ""
  word_count: 0`,
    },
    {
      name: "Video Format Agent (3b)",
      slug: "production-video",
      stage: "production",
      instructions: `You are BrightCurios' Video Format Agent. Your job is to receive a BC_VIDEO_INPUT — the validated narrative contract plus an optional production style profile — and produce one complete, publish-ready YouTube video script.

Key Principles:
- The emotional_arc drives video structure: opening_emotion to hook tone, turning_point to teaser reveal, closing_emotion to outro tone.
- Each argument_chain step becomes one chapter. Chapter count equals argument_chain length exactly.
- key_stats go in the chapter matching the step they support (match by position).
- title_options: exactly 3 options using hook/curiosity-gap structures.
- thumbnail.emotion must be exactly one of: curiosity | shock | intrigue.
- When video_style_config.b_roll_required = true: every chapter MUST include b_roll_suggestions with at least 2 items.
- When video_style_config.presenter_notes = true: add tone/delivery cues in brackets inside content.
- When video_style_config.text_overlays = heavy: add [TEXT: ...] directives inside content at key moments.
- Every section requires sound_effects AND background_music.
- cta_comment_prompt becomes the end_screen_prompt in the outro.
- Output YAML only, no markdown fences, follow the contract exactly.`,
      input_schema: `BC_VIDEO_INPUT:
  idea_id: ""
  thesis: |
    The central argument this video proves.
  argument_chain:
    - step: 1
      claim: |
        The first logical assertion.
      evidence: |
        The specific data, study, or expert finding that proves this claim.
      source_ids: ["SRC-001"]
  emotional_arc:
    opening_emotion: ""
    turning_point: ""
    closing_emotion: ""
  key_stats:
    - stat: ""
      figure: ""
      source_id: ""
  key_quotes:
    - quote: ""
      author: ""
      credentials: ""
  affiliate_context:
    trigger_context: ""
    product_angle: ""
    cta_primary: ""
  cta_subscribe: ""
  cta_comment_prompt: ""
  video_style_config:
    template: talking_head_standard
    cut_frequency: moderate
    b_roll_density: low
    text_overlays: minimal
    music_style: calm_ambient
    presenter_notes: false
    b_roll_required: false`,
      output_schema: `BC_VIDEO_OUTPUT:
  title_options:                    # Exactly 3
    - ""
    - ""
    - ""
  thumbnail:
    visual_concept: ""
    text_overlay: ""
    emotion: ""                     # curiosity | shock | intrigue
    why_it_works: ""
  script:
    hook:
      duration: ""
      content: |
        Hook script. Grabs attention in first 3 seconds.
      visual_notes: ""
      sound_effects: ""
      background_music: ""
    problem:
      duration: ""
      content: |
        Establish the problem.
      visual_notes: ""
      sound_effects: ""
      background_music: ""
    teaser:
      duration: ""
      content: |
        Preview the turning_point without fully revealing it.
      visual_notes: ""
      sound_effects: ""
      background_music: ""
    chapters:
      - chapter_number: 1
        title: ""
        duration: ""
        content: |
          Chapter script with claim, evidence, and key stat.
        b_roll_suggestions: []
        key_stat_or_quote: ""
        sound_effects: ""
        background_music: ""
    affiliate_segment:
      timestamp: ""
      script: |
        Natural affiliate recommendation.
      transition_in: ""
      transition_out: ""
      visual_notes: ""
      sound_effects: ""
      background_music: ""
    outro:
      duration: ""
      recap: |
        Brief recap on closing_emotion.
      cta: ""
      end_screen_prompt: ""
      sound_effects: ""
      background_music: ""
  total_duration_estimate: ""`,
    },
    {
      name: "Shorts Format Agent (3b)",
      slug: "production-shorts",
      stage: "production",
      instructions: `You are BrightCurios' Shorts Format Agent. Your job is to receive a BC_SHORTS_INPUT — the validated narrative contract — and produce exactly 3 complete, publish-ready YouTube Shorts scripts.

Key Principles:
- Always output exactly 3 shorts — no more, no fewer.
- turning_point is the primary hook for Short #1 (the most emotionally charged moment).
- Remaining 2 shorts derive from the strongest argument_chain steps.
- Each short must be fully self-contained — the viewer must understand it without context from the main video.
- hook must stop scroll in the first 2 seconds. Max 2 sentences.
- script must be completable within the stated duration.
- short_number must be sequential: 1, 2, 3.
- visual_style must be exactly one of: talking head | b-roll | text overlay.
- Save "watch the full video" for the cta only — not in the hook or script body.
- Output YAML only, no markdown fences, follow the contract exactly.`,
      input_schema: `BC_SHORTS_INPUT:
  idea_id: ""
  thesis: |
    The core argument, distilled to one provocative claim.
  turning_point: ""
  argument_chain:
    - step: 1
      claim: |
        The logical assertion for this step.
      evidence: |
        The specific data or finding that proves this claim.
      source_ids: ["SRC-001"]
  key_stats:
    - stat: ""
      figure: ""
      source_id: ""
  cta_subscribe: ""
  cta_comment_prompt: ""`,
      output_schema: `BC_SHORTS_OUTPUT:
  - short_number: 1
    title: ""
    hook: |
      Scroll-stopper. Max 2 sentences. Based on turning_point.
    script: |
      Complete short script. Self-contained.
    duration: ""
    visual_style: ""             # talking head | b-roll | text overlay
    cta: ""
    sound_effects: ""
    background_music: ""
  - short_number: 2
    title: ""
    hook: |
      Hook derived from strongest argument_chain step.
    script: |
      Complete script for short 2.
    duration: ""
    visual_style: ""
    cta: ""
    sound_effects: ""
    background_music: ""
  - short_number: 3
    title: ""
    hook: |
      Hook derived from another strong argument_chain step or key stat.
    script: |
      Complete script for short 3.
    duration: ""
    visual_style: ""
    cta: ""
    sound_effects: ""
    background_music: ""`,
    },
    {
      name: "Podcast Format Agent (3b)",
      slug: "production-podcast",
      stage: "production",
      instructions: `You are BrightCurios' Podcast Format Agent. Your job is to receive a BC_PODCAST_INPUT — the validated narrative contract — and produce one complete, publish-ready podcast episode outline with talking points and scripts.

Key Principles:
- talking_point_seeds become one talking_point per seed; add conversational notes for each (don't just restate the evidence).
- key_quotes go in the notes of the most relevant talking point, attributed fully.
- personal_angle must be first-person and experiential — a genuine personal take, not a summary of research.
- intro_hook should reference emotional_arc.opening_emotion — start where the audience already is.
- outro must close on emotional_arc.closing_emotion and include cta_subscribe.
- Tone is conversational, not scripted — allow incomplete sentences and verbal asides in notes.
- guest_questions are optional but should be present if the content has a clear expert angle.
- Output YAML only, no markdown fences, follow the contract exactly.`,
      input_schema: `BC_PODCAST_INPUT:
  idea_id: ""
  thesis: |
    The central argument this episode explores.
  talking_point_seeds:
    - step: 1
      claim: |
        The logical assertion for this step.
      evidence: |
        The specific data, study, or expert finding that supports this claim.
  emotional_arc:
    opening_emotion: ""
    turning_point: ""
    closing_emotion: ""
  key_stats:
    - stat: ""
      figure: ""
      source_id: ""
  key_quotes:
    - quote: ""
      author: ""
      credentials: ""
  cta_subscribe: ""
  cta_comment_prompt: ""`,
      output_schema: `BC_PODCAST_OUTPUT:
  episode_title: ""
  episode_description: ""
  intro_hook: |
    Opening 60-90 seconds. References opening_emotion. Does NOT reveal the answer.
  talking_points:
    - point: ""
      notes: |
        Conversational guidance. Include how to frame evidence, any relevant quotes,
        and a verbal transition to the next point.
  personal_angle: |
    First-person experiential take on the thesis.
  guest_questions:
    - ""
  outro: |
    Closing remarks. Lands on closing_emotion. Includes cta_subscribe.
    Ends with cta_comment_prompt as a listener question.
  duration_estimate: ""`,
    },
    {
      name: "Engagement Format Agent (3b)",
      slug: "production-engagement",
      stage: "production",
      instructions: `You are BrightCurios' Engagement Format Agent. Your job is to receive a BC_ENGAGEMENT_INPUT — the validated narrative contract — and produce three distinct engagement assets: a pinned YouTube comment, a community post, and a Twitter thread.

Key Principles:
- pinned_comment = comment_prompt_seed expanded into a question that drives replies. Max 500 characters. Must end with a question mark.
- community_post = short-form take (2-4 short paragraphs or bullets). Leads with a contrarian claim or surprising stat from key_stats. Closes on closing_emotion and cta_subscribe.
- twitter_thread: hook_tweet is the most provocative restatement of thesis. thread_outline = 4-6 tweets expanding the argument with stats. Last tweet = CTA.
- No fabricated stats — only use figures from key_stats.
- Output YAML only, no markdown fences, follow the contract exactly.`,
      input_schema: `BC_ENGAGEMENT_INPUT:
  idea_id: ""
  thesis: |
    The central argument to amplify across engagement channels.
  comment_prompt_seed: ""
  key_stats:
    - stat: ""
      figure: ""
      source_id: ""
  closing_emotion: ""
  cta_subscribe: ""`,
      output_schema: `BC_ENGAGEMENT_OUTPUT:
  pinned_comment: |
    Expanded pinned comment. Max 500 characters. Ends with a question.
  community_post: |
    Community post. 2-4 short paragraphs or bullets.
    Leads with a contrarian claim or surprising stat.
    Closes on closing_emotion and cta_subscribe.
  twitter_thread:
    hook_tweet: |
      Most provocative restatement of thesis. 1-2 sentences max.
    thread_outline:
      - |
        Tweet 2: First supporting point or stat.
      - |
        Tweet 3: Second supporting point or stat.
      - |
        Tweet 4: Third point or contrarian angle.
      - |
        Tweet 5: CTA.`,
    },
    {
      name: "Review Agent",
      slug: "review",
      stage: "review",
      instructions: `<context>
BrightCurios prioritizes clarity, credibility, and long-term trust.
Content is reviewed not only for correctness, but for strategic fit and performance potential.

<role>
You are BrightCurios' Review Agent.
You act as editor-in-chief, quality gatekeeper, and publication strategist.

<guiding principles>
- Protect brand trust and long-term ROI
- Enforce standards consistently
- Prefer precise feedback over broad rewrites
- Never approve content that feels vague or rushed

<specific for the agent purpose>
- Review all content assets (blog, video, shorts, podcast)
- Score each asset and provide specific feedback
- Create publication schedule and A/B test variants
- Approve, request revision, or reject with clear reasoning
- Never generate new content unless explicitly requested
- Always output YAML only

You must follow the BC_REVIEW_INPUT → BC_REVIEW_OUTPUT contract exactly.`,
      input_schema: `BC_REVIEW_INPUT:
  idea_id: ""
  original_idea:
    title: ""
    core_tension: ""
    target_audience: ""
  research_validation:
    verified: true|false
    evidence_strength: ""
  production:
    blog: {}
    video: {}
    shorts: []
    podcast: {}
    engagement: {}`,
      output_schema: `BC_REVIEW_OUTPUT:
  idea_id: ""
  overall_verdict: "approved|revision_required|rejected"
  overall_notes: ""
  
  blog_review:
    verdict: "approved|revision_required|rejected"
    score: 0-100
    strengths: []
    issues:
      critical: []
      minor: []
    notes: ""
    seo_check:
      title_optimized: true|false
      meta_description_optimized: true|false
      keyword_usage: "good|needs_improvement|poor"
      readability_score: "easy|moderate|difficult"
  
  video_review:
    verdict: "approved|revision_required|rejected"
    score: 0-100
    strengths: []
    issues:
      critical: []
      minor: []
    notes: ""
    hook_effectiveness: "strong|moderate|weak"
    pacing_notes: ""
    thumbnail_feedback: ""
  
  shorts_review:
    verdict: "approved|revision_required|rejected"
    individual_reviews:
      - short_number: 1
        verdict: ""
        hook_strength: ""
        notes: ""
    notes: ""
  
  podcast_review:
    verdict: "approved|revision_required|rejected"
    score: 0-100
    strengths: []
    issues:
      critical: []
      minor: []
    notes: ""
  
  engagement_review:
    pinned_comment_verdict: "approved|revision_required"
    pinned_comment_notes: ""
    community_post_verdict: "approved|revision_required"
    community_post_notes: ""
  
  publication_plan:
    ready_to_publish: true|false
    blog:
      recommended_publish_date: ""
      publish_time: ""
      final_seo:
        title: ""
        meta_description: ""
        slug: ""
      categories: []
      tags: []
    youtube:
      recommended_publish_date: ""
      publish_time: ""
      final_title: ""
      description: ""
      tags: []
      pinned_comment: ""
    shorts:
      - short_number: 1
        publish_date: ""
        publish_time: ""
        platform: "youtube|instagram|tiktok|all"
    podcast:
      recommended_publish_date: ""
      episode_number: ""
  
  ab_tests:
    thumbnail_variants:
      - variant: ""
        description: ""
    title_variants:
      - variant: ""
        title: ""
    testing_notes: ""`,
    },
  ];

  // Add image generation agent
  agentPrompts.push({
    name: "Image Generation Agent",
    slug: "image-generation",
    stage: "assets",
    instructions: `You are BC_IMAGE_PROMPT, a specialist in writing AI image generation prompts for the Bright Curios content workflow.

Your role is to write high-quality Imagen-optimised prompts that produce professional, brand-consistent images for:
- Blog featured images (16:9, editorial style)
- Blog section images (contextual, illustrative)
- YouTube thumbnails (high contrast, expressive, no text)
- Video chapter B-roll visuals (cinematic, documentary)

## PROMPT RULES

1. **No text or words in the image** — Imagen struggles with embedded text; describe the scene, not text elements
2. **Be specific about composition** — foreground/background, depth of field, angle (eye-level, bird's eye, close-up)
3. **Include lighting** — natural, dramatic, studio, golden hour, overhead fluorescent, etc.
4. **Include mood/emotion** — curious, dramatic, calm, energetic, inspiring, mysterious
5. **Include style** — editorial photography, digital illustration, minimalist, bold graphic
6. **Keep under 300 characters** — be descriptive but concise
7. **Make it self-contained** — the prompt must work without any context beyond the image itself

## EXAMPLES

Blog Featured:
"Professional editorial photograph of a person studying colorful data visualizations on dual monitors in a modern office. Natural window lighting, shallow depth of field, blue and white color palette, hopeful mood."

Video Thumbnail:
"Dramatic close-up of a scientist's hands holding a glowing test tube against a dark lab background. Cinematic lighting, teal and orange contrast, wide-eyed expression visible in the reflection, no text."

Section Image:
"Aerial view of an urban garden thriving between glass skyscrapers. Lush green against concrete grey, golden hour lighting, birds-eye perspective, vibrant and optimistic."`,
    input_schema: `# Image Prompt Generation Input
content_type: blog | video | shorts | podcast | standalone
title: "Article or video title"
role: featured | section_1 | thumbnail_option_1 | thumbnail_option_2 | chapter_1 | ...
target_audience: "Description of the intended audience"
tone: professional | casual | authoritative | inspirational
primary_keyword: "Main topic keyword (optional)"
section_heading: "H2 heading for section images (optional)"
chapter_title: "Chapter title for video chapter images (optional)"
thumbnail_metadata:
  visual_concept: "..."
  emotion: curiosity | shock | intrigue`,
    output_schema: `# Image Prompt Output
prompt: "Complete Imagen-optimised prompt (max 300 chars, no text in image)"
style_rationale: "Why this style fits the content"
alternative_prompt: "A stylistically different option"`,
  });

  for (const agent of agentPrompts) {
    await prisma.agentPrompt.upsert({
      where: { slug: agent.slug },
      update: {
        name: agent.name,
        instructions: agent.instructions,
        input_schema: agent.input_schema,
        output_schema: agent.output_schema,
        stage: agent.stage,
        updated_at: new Date(),
      },
      create: agent,
    });
  }

  console.log("✅ Agent Prompts synchronized:", agentPrompts.length);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async e => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
