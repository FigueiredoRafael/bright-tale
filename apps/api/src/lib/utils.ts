import { marked } from "marked";

/**
 * Convert markdown to HTML for WordPress Classic Editor
 * Uses marked library with GitHub Flavored Markdown support
 */
export function markdownToHtml(markdown: string): string {
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  const html = marked.parse(markdown, { async: false }) as string;

  return html;
}

/**
 * Safety check: returns true if the current environment is production
 */
export function isProduction(): boolean {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const nodeEnv = process.env.NODE_ENV || "development";

  return (
    nodeEnv === "production" ||
    supabaseUrl.includes("supabase.co") && !supabaseUrl.includes("localhost")
  );
}
