/**
 * Markdown Parser Utility
 * Structured parsing for importing markdown content into ideas/research/production
 */

export interface ParsedIdea {
  title: string;
  one_liner: string;
  sections: ParsedSection[];
  key_facts: string[];
  raw_content: string;
}

export interface ParsedSection {
  heading: string;
  level: number;
  content: string;
  bullets: string[];
}

export interface ParsedResearch {
  title: string;
  summary: string;
  sections: ParsedSection[];
  sources: ParsedSource[];
  key_findings: string[];
  raw_content: string;
}

export interface ParsedSource {
  title: string;
  url?: string;
}

export interface ParsedProduction {
  title: string;
  meta_description: string;
  sections: ParsedSection[];
  raw_content: string;
}

/**
 * Parse markdown into structured idea format
 * - H1 becomes title
 * - First paragraph becomes one_liner
 * - H2s become sections
 * - Bullet points extracted as key_facts
 */
export function parseMarkdownToIdea(markdown: string): ParsedIdea {
  const lines = markdown.split("\n");
  let title = "";
  let one_liner = "";
  const sections: ParsedSection[] = [];
  const key_facts: string[] = [];
  let currentSection: ParsedSection | null = null;
  let foundFirstParagraph = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // H1 = title
    if (trimmed.startsWith("# ") && !title) {
      title = trimmed.slice(2).trim();
      continue;
    }

    // H2 = new section
    if (trimmed.startsWith("## ")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        heading: trimmed.slice(3).trim(),
        level: 2,
        content: "",
        bullets: [],
      };
      continue;
    }

    // H3 = subsection (add to current section content)
    if (trimmed.startsWith("### ")) {
      if (currentSection) {
        currentSection.content += `\n### ${trimmed.slice(4).trim()}\n`;
      }
      continue;
    }

    // Bullet points
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const bullet = trimmed.slice(2).trim();
      key_facts.push(bullet);
      if (currentSection) {
        currentSection.bullets.push(bullet);
      }
      continue;
    }

    // Numbered lists
    if (/^\d+\.\s/.test(trimmed)) {
      const bullet = trimmed.replace(/^\d+\.\s/, "").trim();
      key_facts.push(bullet);
      if (currentSection) {
        currentSection.bullets.push(bullet);
      }
      continue;
    }

    // Regular paragraph
    if (trimmed.length > 0) {
      // First non-empty paragraph after title becomes one_liner
      if (!foundFirstParagraph && title) {
        one_liner = trimmed;
        foundFirstParagraph = true;
        continue;
      }

      // Add to current section content
      if (currentSection) {
        currentSection.content +=
          (currentSection.content ? "\n" : "") + trimmed;
      }
    }
  }

  // Push last section
  if (currentSection) {
    sections.push(currentSection);
  }

  // Fallbacks
  if (!title && lines.length > 0) {
    title = lines.find(l => l.trim().length > 0)?.trim() || "Untitled";
  }
  if (!one_liner && sections.length > 0 && sections[0].content) {
    one_liner = sections[0].content.split("\n")[0] || "";
  }

  return {
    title,
    one_liner,
    sections,
    key_facts,
    raw_content: markdown,
  };
}

/**
 * Parse markdown into structured research format
 * - H1 becomes title
 * - First paragraph becomes summary
 * - H2s become sections
 * - Links are extracted as sources
 * - Bullet points become key_findings
 */
export function parseMarkdownToResearch(markdown: string): ParsedResearch {
  const parsed = parseMarkdownToIdea(markdown);

  // Extract sources from links [text](url)
  const sources: ParsedSource[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(markdown)) !== null) {
    sources.push({
      title: match[1],
      url: match[2],
    });
  }

  return {
    title: parsed.title,
    summary: parsed.one_liner,
    sections: parsed.sections,
    sources,
    key_findings: parsed.key_facts,
    raw_content: markdown,
  };
}

/**
 * Parse markdown into structured production format
 * - H1 becomes title
 * - First paragraph becomes meta_description
 * - H2s become sections (for blog outline)
 */
export function parseMarkdownToProduction(markdown: string): ParsedProduction {
  const parsed = parseMarkdownToIdea(markdown);

  return {
    title: parsed.title,
    meta_description: parsed.one_liner.slice(0, 160), // SEO limit
    sections: parsed.sections,
    raw_content: markdown,
  };
}

/**
 * Convert parsed idea back to a clean markdown format
 */
export function ideaToMarkdown(idea: ParsedIdea): string {
  let md = `# ${idea.title}\n\n`;
  md += `${idea.one_liner}\n\n`;

  for (const section of idea.sections) {
    md += `## ${section.heading}\n\n`;
    if (section.content) {
      md += `${section.content}\n\n`;
    }
    for (const bullet of section.bullets) {
      md += `- ${bullet}\n`;
    }
    if (section.bullets.length > 0) {
      md += "\n";
    }
  }

  return md.trim();
}

/**
 * Extract a brief summary from markdown (first 2-3 sentences)
 */
export function extractSummary(markdown: string, maxLength = 200): string {
  // Remove headings and extract plain text
  const text = markdown
    .replace(/^#+\s+.+$/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();

  // Get first paragraph
  const firstPara = text.split(/\n\n/)[0] || text;

  if (firstPara.length <= maxLength) {
    return firstPara;
  }

  // Truncate at word boundary
  return firstPara.slice(0, maxLength).replace(/\s+\S*$/, "") + "...";
}

/**
 * Research output type for researchToMarkdown
 */
export interface ResearchOutputForMarkdown {
  idea_id?: string;
  research_summary?: string;
  sources?: Array<{
    source_id: string;
    title: string;
    url: string;
    type: string;
    credibility: string;
    key_insight?: string;
    quote_excerpt?: string;
  }>;
  statistics?: Array<{
    stat_id: string;
    figure: string;
    claim: string;
    context?: string;
  }>;
  expert_quotes?: Array<{
    quote_id: string;
    quote: string;
    author: string;
    credentials: string;
  }>;
  counterarguments?: Array<{
    counter_id: string;
    point: string;
    strength: string;
    rebuttal: string;
  }>;
  knowledge_gaps?: string[];
  idea_validation?: {
    core_claim_verified: boolean;
    evidence_strength: string;
    confidence_score: number;
    validation_notes: string;
  };
  refined_angle?: {
    should_pivot: boolean;
    updated_title: string;
    updated_hook: string;
    angle_notes: string;
    recommendation: string;
  };
}

/**
 * Convert research output to markdown format for export/download
 */
export function researchToMarkdown(
  research: ResearchOutputForMarkdown,
  ideaTitle?: string,
): string {
  let md = `# Research: ${ideaTitle || research.idea_id || "Untitled"}\n\n`;
  md += `*Generated on ${new Date().toISOString().split("T")[0]}*\n\n`;

  // Validation Summary
  if (research.idea_validation) {
    md += `## Validation Summary\n\n`;
    md += `- **Core Claim Verified:** ${research.idea_validation.core_claim_verified ? "Yes ✓" : "No ✗"}\n`;
    md += `- **Evidence Strength:** ${research.idea_validation.evidence_strength}\n`;
    md += `- **Confidence Score:** ${Math.round(research.idea_validation.confidence_score * 100)}%\n`;
    md += `- **Notes:** ${research.idea_validation.validation_notes}\n\n`;
  }

  // Research Summary
  if (research.research_summary) {
    md += `## Summary\n\n${research.research_summary}\n\n`;
  }

  // Refined Angle
  if (research.refined_angle) {
    md += `## Refined Angle\n\n`;
    md += `- **Recommendation:** ${research.refined_angle.recommendation}\n`;
    if (research.refined_angle.should_pivot) {
      md += `- **Pivot Suggested:** Yes\n`;
      md += `- **Updated Title:** ${research.refined_angle.updated_title}\n`;
      md += `- **Updated Hook:** ${research.refined_angle.updated_hook}\n`;
    }
    if (research.refined_angle.angle_notes) {
      md += `- **Notes:** ${research.refined_angle.angle_notes}\n`;
    }
    md += "\n";
  }

  // Sources
  if (research.sources && research.sources.length > 0) {
    md += `## Sources (${research.sources.length})\n\n`;
    for (const source of research.sources) {
      md += `### [${source.title}](${source.url})\n`;
      md += `- **Type:** ${source.type} | **Credibility:** ${source.credibility}\n`;
      if (source.key_insight) {
        md += `- **Key Insight:** ${source.key_insight}\n`;
      }
      if (source.quote_excerpt) {
        md += `- **Quote:** "${source.quote_excerpt}"\n`;
      }
      md += "\n";
    }
  }

  // Statistics
  if (research.statistics && research.statistics.length > 0) {
    md += `## Key Statistics\n\n`;
    for (const stat of research.statistics) {
      md += `- **${stat.figure}** — ${stat.claim}`;
      if (stat.context) {
        md += ` *(${stat.context})*`;
      }
      md += "\n";
    }
    md += "\n";
  }

  // Expert Quotes
  if (research.expert_quotes && research.expert_quotes.length > 0) {
    md += `## Expert Quotes\n\n`;
    for (const q of research.expert_quotes) {
      md += `> "${q.quote}"\n>\n> — **${q.author}**, ${q.credentials}\n\n`;
    }
  }

  // Counterarguments
  if (research.counterarguments && research.counterarguments.length > 0) {
    md += `## Counterarguments\n\n`;
    for (const c of research.counterarguments) {
      md += `### ${c.point}\n`;
      md += `- **Strength:** ${c.strength}\n`;
      md += `- **Rebuttal:** ${c.rebuttal}\n\n`;
    }
  }

  // Knowledge Gaps
  if (research.knowledge_gaps && research.knowledge_gaps.length > 0) {
    md += `## Knowledge Gaps\n\n`;
    for (const gap of research.knowledge_gaps) {
      md += `- ${gap}\n`;
    }
    md += "\n";
  }

  return md.trim();
}
