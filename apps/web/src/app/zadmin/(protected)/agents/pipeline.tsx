'use client';

import Link from 'next/link';
import { adminPath } from '@/lib/admin-path';
import {
  Lightbulb, Search, FileText, Clapperboard, MessageSquare, Mic, Zap, CheckCircle, ArrowRight,
} from 'lucide-react';

interface AgentNode {
  id: string;
  slug: string;
  name: string;
  stage: string;
}

const STAGES: {
  slug: string;
  label: string;
  icon: typeof Lightbulb;
  col: 'brainstorm' | 'research' | 'core' | 'production' | 'review';
}[] = [
  { slug: 'brainstorm', label: 'Brainstorm', icon: Lightbulb, col: 'brainstorm' },
  { slug: 'research', label: 'Research', icon: Search, col: 'research' },
  { slug: 'content-core', label: 'Content Core', icon: FileText, col: 'core' },
  { slug: 'blog', label: 'Blog', icon: FileText, col: 'production' },
  { slug: 'video', label: 'Video', icon: Clapperboard, col: 'production' },
  { slug: 'shorts', label: 'Shorts', icon: Zap, col: 'production' },
  { slug: 'podcast', label: 'Podcast', icon: Mic, col: 'production' },
  { slug: 'engagement', label: 'Engagement', icon: MessageSquare, col: 'production' },
  { slug: 'review', label: 'Review', icon: CheckCircle, col: 'review' },
];

const COL_ORDER = ['brainstorm', 'research', 'core', 'production', 'review'] as const;
const COL_LABELS: Record<string, string> = {
  brainstorm: 'Brainstorm',
  research: 'Research',
  core: 'Core',
  production: 'Production',
  review: 'Review',
};

export function PipelineGraph({ agents }: { agents: AgentNode[] }) {
  const bySlug = new Map(agents.map((a) => [a.slug, a]));

  const columns = COL_ORDER.map((col) => ({
    key: col,
    label: COL_LABELS[col],
    stages: STAGES.filter((s) => s.col === col),
  }));

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <div className="flex items-stretch min-w-[700px]">
          {columns.map((col, ci) => (
            <div key={col.key} className="flex items-center">
              {ci > 0 && (
                <div className="flex items-center px-1 text-muted-foreground/40">
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
              <div className="flex flex-col gap-2 p-4 min-w-[140px]">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                  {col.label}
                </p>
                {col.stages.map((stage) => {
                  const agent = bySlug.get(stage.slug);
                  const Icon = stage.icon;
                  return (
                    <AgentCard
                      key={stage.slug}
                      slug={stage.slug}
                      label={stage.label}
                      icon={<Icon className="w-3.5 h-3.5" />}
                      agent={agent}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentCard({
  slug,
  label,
  icon,
  agent,
}: {
  slug: string;
  label: string;
  icon: React.ReactNode;
  agent?: AgentNode;
}) {
  const inner = (
    <div
      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
        agent
          ? 'border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40'
          : 'border-dashed border-border bg-muted/30'
      }`}
    >
      <span className={agent ? 'text-primary' : 'text-muted-foreground/50'}>{icon}</span>
      <div className="min-w-0">
        <p className={`text-xs font-medium truncate ${agent ? 'text-foreground' : 'text-muted-foreground italic'}`}>
          {agent ? agent.name : label}
        </p>
        <p className="text-[10px] font-mono text-muted-foreground truncate">{slug}</p>
      </div>
    </div>
  );

  if (agent) {
    return (
      <Link href={adminPath(`/agents/${encodeURIComponent(agent.slug)}`)} className="block">
        {inner}
      </Link>
    );
  }

  return inner;
}
