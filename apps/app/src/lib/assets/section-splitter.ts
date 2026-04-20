/**
 * Splits a markdown draft into an intro block + an ordered list of H2 sections.
 * Used by the Assets engine "no-briefs" flow so the user can read the actual
 * section body when picking an image.
 */
export interface DraftSection {
  heading: string;
  body: string;
}

export interface SplitDraft {
  intro: string;
  sections: DraftSection[];
}

export function splitDraftBySections(markdown: string): SplitDraft {
  if (!markdown || !markdown.trim()) {
    return { intro: '', sections: [] };
  }

  const lines = markdown.split(/\r?\n/);
  let intro = '';
  const sections: DraftSection[] = [];

  let current: DraftSection | null = null;
  const introBuf: string[] = [];

  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      if (current) sections.push(current);
      else intro = introBuf.join('\n').trim();
      current = { heading: match[1].trim(), body: '' };
      continue;
    }
    if (current) {
      current.body += (current.body ? '\n' : '') + line;
    } else {
      introBuf.push(line);
    }
  }

  if (current) sections.push(current);
  else intro = introBuf.join('\n').trim();

  for (const s of sections) {
    s.body = s.body.trim();
  }

  return { intro, sections };
}
