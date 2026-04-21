'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Rocket, BookOpen, Copy, Trash2, Users, Search, Lightbulb } from 'lucide-react';
import type { IdeaRow } from '@/app/[locale]/(app)/ideas/[id]/page.client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { InlineEditableText } from './InlineEditableText';
import { InlineEditableSelect } from './InlineEditableSelect';
import { parseIdea } from './parseIdea';

interface Props {
  idea: IdeaRow;
  onIdeaUpdated: (next: IdeaRow) => void;
  onPatchDiscovery: (partial: Record<string, unknown>) => Promise<IdeaRow>;
}

export function IdeaHeaderColumn({ idea, onIdeaUpdated, onPatchDiscovery }: Props) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function patchTopLevel(body: Record<string, unknown>) {
    const res = await fetch(`/api/ideas/library/${idea.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed');
    onIdeaUpdated(parseIdea(json.data.idea));
  }

  async function handleStartProject() {
    setBusyAction('start');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: idea.title,
          current_stage: 'brainstorm',
          status: 'active',
          auto_advance: true,
          winner: false,
          seed_idea_id: idea.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed to start project');
      router.push(`/en/projects/${json.data.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSendToResearch() {
    if (!idea.channel_id) return;
    setBusyAction('research');
    try {
      const res = await fetch('/api/research/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId: idea.id, channelId: idea.channel_id, mode: 'standalone' }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed to create research session');
      router.push(`/en/channels/${idea.channel_id}/research/new?session=${json.data.sessionId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDuplicate() {
    setBusyAction('duplicate');
    try {
      const res = await fetch('/api/ideas/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${idea.title} (copy)`,
          core_tension: idea.core_tension,
          target_audience: idea.target_audience,
          verdict: idea.verdict,
          discovery_data: idea.discovery_data,
          tags: idea.tags,
          channel_id: idea.channel_id,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed to duplicate');
      router.push(`/en/ideas/${json.data.idea.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete() {
    setBusyAction('delete');
    try {
      const res = await fetch(`/api/ideas/library/${idea.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed to delete');
      router.push('/en/ideas');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyAction(null);
    }
  }

  const disc = idea.discovery_data ?? {};
  const keyword = (disc as any).primary_keyword as { term?: string; difficulty?: string } | undefined;
  const searchIntent = (disc as any).search_intent as string | undefined;
  const verdictRationale = (disc as any).verdict_rationale as string | undefined;

  return (
    <aside className="w-full md:w-80 md:sticky md:top-4 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="font-mono text-xs">{idea.idea_id}</Badge>
          <InlineEditableSelect
            value={idea.verdict}
            options={[
              { value: 'viable', label: 'viable' },
              { value: 'experimental', label: 'experimental' },
              { value: 'weak', label: 'weak' },
            ]}
            onSave={async (v) => { await patchTopLevel({ verdict: v }); }}
            ariaLabel="Verdict"
            className="w-32"
          />
        </div>
        <div className="text-xl font-semibold leading-tight">
          <InlineEditableText
            value={idea.title}
            ariaLabel="Title"
            onSave={async (v) => { await patchTopLevel({ title: v }); }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {idea.project_id ? (
          <Button
            className="w-full justify-start"
            onClick={() => router.push(`/en/projects/${idea.project_id}`)}
          >
            <Rocket className="mr-2 h-4 w-4" /> Go to Project
          </Button>
        ) : (
          <Button className="w-full justify-start" onClick={handleStartProject} disabled={busyAction !== null}>
            <Rocket className="mr-2 h-4 w-4" /> {busyAction === 'start' ? 'Starting...' : 'Start Project'}
          </Button>
        )}
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleSendToResearch}
          disabled={busyAction !== null || !idea.channel_id}
          title={idea.channel_id ? undefined : 'Attach to a channel first'}
        >
          <BookOpen className="mr-2 h-4 w-4" /> Send to Research
        </Button>
      </div>

      <div className="space-y-3 text-sm">
        <Field icon={<Users className="h-3.5 w-3.5" />} label="Target Audience">
          <InlineEditableText
            value={idea.target_audience ?? ''}
            ariaLabel="Target audience"
            multiline
            onSave={async (v) => { await patchTopLevel({ target_audience: v }); }}
          />
        </Field>
        <Field icon={<Lightbulb className="h-3.5 w-3.5" />} label="Verdict Rationale">
          <InlineEditableText
            value={verdictRationale ?? ''}
            ariaLabel="Verdict rationale"
            multiline
            onSave={async (v) => {
              const next = await onPatchDiscovery({ verdict_rationale: v });
              onIdeaUpdated(next);
            }}
          />
        </Field>
        <Field icon={<Search className="h-3.5 w-3.5" />} label="Search Intent">
          <InlineEditableText
            value={searchIntent ?? ''}
            ariaLabel="Search intent"
            onSave={async (v) => {
              const next = await onPatchDiscovery({ search_intent: v });
              onIdeaUpdated(next);
            }}
          />
        </Field>
        {keyword && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Primary Keyword</div>
            <div className="text-sm font-medium">{keyword.term}</div>
            <div className="text-xs text-muted-foreground">Difficulty: {keyword.difficulty}</div>
          </div>
        )}
      </div>

      <div className="pt-5 border-t border-border/40 space-y-2">
        <Button variant="outline" className="w-full justify-start" onClick={handleDuplicate} disabled={busyAction !== null}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-destructive border-destructive/40">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this idea?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone. The idea will be removed from the library.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </aside>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {icon} {label}
      </div>
      {children}
    </div>
  );
}
