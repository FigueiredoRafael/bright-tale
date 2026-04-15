'use client';

import Link from 'next/link';
import { adminPath } from '@/lib/admin-path';

interface AgentNode {
  id: string;
  slug: string;
  name: string;
  stage: string;
}

// Layout: column-based tree.
// col 0: brainstorm
// col 1: research
// col 2: content-core
// col 3: blog | video | shorts | podcast | engagement (variants)
// col 4: review
const COLUMNS: { x: number; slugs: string[] }[] = [
  { x: 60, slugs: ['brainstorm'] },
  { x: 240, slugs: ['research'] },
  { x: 420, slugs: ['content-core'] },
  { x: 620, slugs: ['blog', 'video', 'shorts', 'podcast', 'engagement'] },
  { x: 820, slugs: ['review'] },
];

function nodePos(slug: string): { x: number; y: number } | null {
  for (const col of COLUMNS) {
    const idx = col.slugs.indexOf(slug);
    if (idx >= 0) {
      const total = col.slugs.length;
      const spacing = 80;
      const startY = 240 - ((total - 1) * spacing) / 2;
      return { x: col.x, y: startY + idx * spacing };
    }
  }
  return null;
}

const EDGES: [string, string][] = [
  ['brainstorm', 'research'],
  ['research', 'content-core'],
  ['content-core', 'blog'],
  ['content-core', 'video'],
  ['content-core', 'shorts'],
  ['content-core', 'podcast'],
  ['content-core', 'engagement'],
  ['blog', 'review'],
  ['video', 'review'],
  ['shorts', 'review'],
  ['podcast', 'review'],
];

const NODE_W = 140;
const NODE_H = 56;

export function PipelineGraph({ agents }: { agents: AgentNode[] }) {
  const bySlug = new Map(agents.map((a) => [a.slug, a]));
  const width = 980;
  const height = 480;

  return (
    <div className="rounded-lg border bg-card p-4 overflow-x-auto">
      <svg width={width} height={height} className="block">
        {/* arrow marker */}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--muted-foreground))" />
          </marker>
        </defs>

        {/* edges */}
        {EDGES.map(([from, to], i) => {
          const a = nodePos(from);
          const b = nodePos(to);
          if (!a || !b) return null;
          const x1 = a.x + NODE_W / 2;
          const y1 = a.y;
          const x2 = b.x - NODE_W / 2;
          const y2 = b.y;
          const midX = (x1 + x2) / 2;
          const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
          return (
            <path
              key={i}
              d={path}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="1.5"
              fill="none"
              opacity="0.5"
              markerEnd="url(#arrow)"
            />
          );
        })}

        {/* nodes */}
        {COLUMNS.flatMap((col) =>
          col.slugs.map((slug) => {
            const pos = nodePos(slug);
            if (!pos) return null;
            const agent = bySlug.get(slug);
            const isMissing = !agent;
            return (
              <g key={slug} transform={`translate(${pos.x - NODE_W / 2}, ${pos.y - NODE_H / 2})`}>
                <foreignObject width={NODE_W} height={NODE_H}>
                  <div
                    className={`w-full h-full rounded-md border-2 px-2 py-1.5 flex flex-col justify-center ${
                      isMissing
                        ? 'border-dashed border-muted-foreground/40 bg-muted/20'
                        : 'border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/60'
                    } transition-colors`}
                  >
                    {agent ? (
                      <Link href={adminPath(`/agents/${encodeURIComponent(agent.slug)}`)} className="block">
                        <div className="text-[11px] font-medium truncate">{agent.name}</div>
                        <div className="text-[10px] font-mono text-muted-foreground truncate">{agent.slug}</div>
                      </Link>
                    ) : (
                      <>
                        <div className="text-[11px] font-medium text-muted-foreground italic">não cadastrado</div>
                        <div className="text-[10px] font-mono text-muted-foreground truncate">{slug}</div>
                      </>
                    )}
                  </div>
                </foreignObject>
              </g>
            );
          }),
        )}

        {/* column labels */}
        {COLUMNS.map((col, i) => (
          <text
            key={i}
            x={col.x}
            y={20}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px] font-mono uppercase"
          >
            {['Brainstorm', 'Research', 'Core', 'Production', 'Review'][i]}
          </text>
        ))}
      </svg>
    </div>
  );
}
