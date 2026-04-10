import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { marked } from "marked";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert markdown to HTML for WordPress Classic Editor
 * Uses marked library with GitHub Flavored Markdown support
 * @param markdown - The markdown content to convert
 * @returns HTML string (without document wrapper)
 */
export function markdownToHtml(markdown: string): string {
  // Configure marked for WordPress compatibility
  marked.setOptions({
    breaks: true, // GitHub-style line breaks
    gfm: true, // GitHub Flavored Markdown
  });

  // Convert markdown to HTML synchronously
  const html = marked.parse(markdown, { async: false }) as string;

  return html;
}

/**
 * Safety check: returns true if the current environment is production
 * Checks DATABASE_URL and NODE_ENV to prevent destructive actions
 */
export function isProduction(): boolean {
  const dbUrl = process.env.DATABASE_URL || "";
  const nodeEnv = process.env.NODE_ENV || "development";

  return (
    nodeEnv === "production" ||
    dbUrl.includes("production") ||
    dbUrl.includes("rds.amazonaws.com")
  );
}