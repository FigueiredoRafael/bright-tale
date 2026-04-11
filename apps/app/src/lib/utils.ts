import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { marked } from 'marked';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function markdownToHtml(markdown: string): string {
  marked.setOptions({ breaks: true, gfm: true });
  return marked.parse(markdown, { async: false }) as string;
}
