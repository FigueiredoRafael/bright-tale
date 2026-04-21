'use client';

import { useState } from 'react';
import { Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SectionEditPanel } from './SectionEditPanel';

export interface RepurposePotential {
  blog_angle?: string;
  video_angle?: string;
  shorts_hooks?: string[];
  podcast_angle?: string;
}

interface Props {
  value?: RepurposePotential;
  onSave: (payload: RepurposePotential) => Promise<void>;
}

export function RepurposePotentialCard({ value, onSave }: Props) {
  const hasAny = !!(value?.blog_angle || value?.video_angle || value?.podcast_angle || (value?.shorts_hooks && value.shorts_hooks.length > 0));
  if (!hasAny) return null;

  return (
    <SectionEditPanel<RepurposePotential>
      title="Repurpose Potential"
      icon={<Repeat className="h-3.5 w-3.5" />}
      onSave={onSave}
      renderIdle={() => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {value?.blog_angle && <SubCard label="Blog">{value.blog_angle}</SubCard>}
          {value?.video_angle && <SubCard label="Video">{value.video_angle}</SubCard>}
          {value?.podcast_angle && <SubCard label="Podcast">{value.podcast_angle}</SubCard>}
          {value?.shorts_hooks && value.shorts_hooks.length > 0 && (
            <SubCard label="Shorts">
              <ul className="list-disc pl-4 space-y-1">
                {value.shorts_hooks.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            </SubCard>
          )}
        </div>
      )}
      renderForm={({ onSave: save, onCancel }) => (
        <RepurposeForm initial={value ?? {}} onSave={save} onCancel={onCancel} />
      )}
    />
  );
}

function SubCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded border bg-background/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function RepurposeForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: RepurposePotential;
  onSave: (payload: RepurposePotential) => Promise<void>;
  onCancel: () => void;
}) {
  const [blog, setBlog] = useState(initial.blog_angle ?? '');
  const [video, setVideo] = useState(initial.video_angle ?? '');
  const [podcast, setPodcast] = useState(initial.podcast_angle ?? '');
  const [shorts, setShorts] = useState((initial.shorts_hooks ?? []).join('\n'));
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSave({
        blog_angle: blog.trim() || undefined,
        video_angle: video.trim() || undefined,
        podcast_angle: podcast.trim() || undefined,
        shorts_hooks: shorts.split('\n').map((s) => s.trim()).filter(Boolean),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div><Label className="text-xs">Blog</Label><Input value={blog} onChange={(e) => setBlog(e.target.value)} disabled={saving} /></div>
      <div><Label className="text-xs">Video</Label><Input value={video} onChange={(e) => setVideo(e.target.value)} disabled={saving} /></div>
      <div><Label className="text-xs">Podcast</Label><Input value={podcast} onChange={(e) => setPodcast(e.target.value)} disabled={saving} /></div>
      <div>
        <Label className="text-xs">Shorts (one per line)</Label>
        <Textarea rows={4} value={shorts} onChange={(e) => setShorts(e.target.value)} disabled={saving} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}
