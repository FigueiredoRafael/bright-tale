'use client';

import ReactMarkdown from 'react-markdown';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  if (!content) {
    return (
      <div className={`text-sm text-muted-foreground italic ${className}`}>
        No content to preview
      </div>
    );
  }

  return (
    <article
      className={`
        prose prose-sm dark:prose-invert max-w-none
        prose-headings:font-bold prose-headings:tracking-tight
        prose-h1:text-2xl prose-h1:mt-6 prose-h1:mb-4 prose-h1:pb-2 prose-h1:border-b prose-h1:border-border
        prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3
        prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2
        prose-p:leading-7 prose-p:mb-4 prose-p:text-foreground/90
        prose-strong:text-foreground prose-strong:font-semibold
        prose-em:text-foreground/80
        prose-a:text-primary prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-primary/80
        prose-blockquote:border-l-primary prose-blockquote:bg-muted/30 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-md prose-blockquote:not-italic
        prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border prose-pre:rounded-lg
        prose-ul:my-4 prose-ol:my-4
        prose-li:my-1 prose-li:leading-7
        prose-hr:border-border prose-hr:my-8
        prose-img:rounded-lg prose-img:shadow-md
        ${className}
      `}
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </article>
  );
}
