'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type {
  AffiliateContentSubmission, ContentSubmissionPlatform, ContentSubmissionType,
} from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError, type SubmitContentInput } from '@/lib/affiliate-api';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { strings } from './strings';

interface Props {
  submissions: AffiliateContentSubmission[];
  readOnly: boolean;
  onChange: () => Promise<void> | void;
}

const STATUS_CLASS: Record<string, string> = {
  approved: 'bg-green-50 text-green-700 border-green-200',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

const PLATFORMS: ContentSubmissionPlatform[] = [
  'youtube', 'instagram', 'tiktok', 'twitter', 'linkedin', 'web', 'other',
] as any;
const CONTENT_TYPES: ContentSubmissionType[] = [
  'video', 'post', 'story', 'reel', 'short', 'article',
] as any;

function isValidUrl(v: string): boolean {
  try { new URL(v); return true; } catch { return false; }
}

export function ContentSubmissions({ submissions, readOnly, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SubmitContentInput>({
    url: '', platform: 'youtube' as ContentSubmissionPlatform, contentType: 'video' as ContentSubmissionType,
  });
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!isValidUrl(form.url)) {
      setError(strings.content.invalid_url);
      return;
    }
    try {
      await affiliateApi.submitContent(form);
      (window as unknown as { posthog?: { capture: (ev: string, p: object) => void } }).posthog?.capture(
        'affiliate_content_submitted',
        { platform: form.platform, contentType: form.contentType },
      );
      setOpen(false);
      setForm({ url: '', platform: 'youtube' as ContentSubmissionPlatform, contentType: 'video' as ContentSubmissionType });
      toast.success(strings.content.submit_success);
      await onChange();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{strings.content.section_title}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={readOnly}>{strings.content.submit}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{strings.content.submit}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <label className="block text-sm">
                <span>URL</span>
                <input
                  className="mt-1 block w-full rounded border px-2 py-1"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  aria-label="URL"
                />
              </label>
              <label className="block text-sm">
                <span>Plataforma</span>
                <select
                  className="mt-1 block w-full rounded border px-2 py-1"
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value as ContentSubmissionPlatform })}
                  aria-label="Plataforma"
                >
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span>Tipo</span>
                <select
                  className="mt-1 block w-full rounded border px-2 py-1"
                  value={form.contentType}
                  onChange={(e) => setForm({ ...form, contentType: e.target.value as ContentSubmissionType })}
                  aria-label="Tipo"
                >
                  {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
              <Button onClick={submit}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {submissions.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th>Plataforma</th><th>Tipo</th><th>URL</th><th>Status</th></tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="py-2">{s.platform}</td>
                <td className="py-2">{s.contentType}</td>
                <td className="py-2 truncate max-w-xs">
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.url}</a>
                </td>
                <td className="py-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_CLASS[s.status] ?? ''}`}>
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
