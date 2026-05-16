'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const mediaConfigSchema = z.object({
  wordCount: z.coerce.number().int().positive().optional(),
  durationSeconds: z.coerce.number().int().positive().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  maxReviewIterations: z.coerce.number().int().min(1).max(10).optional(),
  assetImageCount: z.coerce.number().int().min(0).max(20).optional(),
});

const formSchema = z.object({
  blog: mediaConfigSchema,
  video: mediaConfigSchema,
  shorts: mediaConfigSchema,
  podcast: mediaConfigSchema,
});

type FormValues = z.infer<typeof formSchema>;

type Medium = 'blog' | 'video' | 'shorts' | 'podcast';

interface MediumConfig {
  key: Medium;
  label: string;
  fields: Array<keyof z.infer<typeof mediaConfigSchema>>;
}

const MEDIUMS: MediumConfig[] = [
  {
    key: 'blog',
    label: 'Blog',
    fields: ['wordCount', 'provider', 'model', 'maxReviewIterations', 'assetImageCount'],
  },
  {
    key: 'video',
    label: 'Video',
    fields: ['durationSeconds', 'provider', 'model', 'maxReviewIterations', 'assetImageCount'],
  },
  {
    key: 'shorts',
    label: 'Shorts',
    fields: ['durationSeconds', 'provider', 'model', 'assetImageCount'],
  },
  {
    key: 'podcast',
    label: 'Podcast',
    fields: ['durationSeconds', 'provider', 'model', 'maxReviewIterations'],
  },
];

const FIELD_LABELS: Record<keyof z.infer<typeof mediaConfigSchema>, string> = {
  wordCount: 'Word Count',
  durationSeconds: 'Duration (seconds)',
  provider: 'Provider',
  model: 'Model',
  maxReviewIterations: 'Max Review Iterations',
  assetImageCount: 'Asset Image Count',
};

interface Props {
  channelId: string;
}

export function MediaDefaultsForm({ channelId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      blog: {},
      video: {},
      shorts: {},
      podcast: {},
    },
  });

  useEffect(() => {
    async function loadChannel() {
      try {
        const res = await fetch(`/api/channels/${channelId}`);
        const { data, error } = await res.json();
        if (error || !data) return;

        const config = data.defaultMediaConfigJson ?? {};
        const toNum = (v: unknown): number | undefined =>
          v !== undefined && v !== null && v !== '' ? Number(v) : undefined;
        const toStr = (v: unknown): string | undefined =>
          typeof v === 'string' && v !== '' ? v : undefined;

        form.reset({
          blog: {
            wordCount: toNum((config as Record<string, Record<string, unknown>>)['blog']?.['wordCount']),
            provider: toStr((config as Record<string, Record<string, unknown>>)['blog']?.['provider']),
            model: toStr((config as Record<string, Record<string, unknown>>)['blog']?.['model']),
            maxReviewIterations: toNum((config as Record<string, Record<string, unknown>>)['blog']?.['maxReviewIterations']),
            assetImageCount: toNum((config as Record<string, Record<string, unknown>>)['blog']?.['assetImageCount']),
          },
          video: {
            durationSeconds: toNum((config as Record<string, Record<string, unknown>>)['video']?.['durationSeconds']),
            provider: toStr((config as Record<string, Record<string, unknown>>)['video']?.['provider']),
            model: toStr((config as Record<string, Record<string, unknown>>)['video']?.['model']),
            maxReviewIterations: toNum((config as Record<string, Record<string, unknown>>)['video']?.['maxReviewIterations']),
            assetImageCount: toNum((config as Record<string, Record<string, unknown>>)['video']?.['assetImageCount']),
          },
          shorts: {
            durationSeconds: toNum((config as Record<string, Record<string, unknown>>)['shorts']?.['durationSeconds']),
            provider: toStr((config as Record<string, Record<string, unknown>>)['shorts']?.['provider']),
            model: toStr((config as Record<string, Record<string, unknown>>)['shorts']?.['model']),
            assetImageCount: toNum((config as Record<string, Record<string, unknown>>)['shorts']?.['assetImageCount']),
          },
          podcast: {
            durationSeconds: toNum((config as Record<string, Record<string, unknown>>)['podcast']?.['durationSeconds']),
            provider: toStr((config as Record<string, Record<string, unknown>>)['podcast']?.['provider']),
            model: toStr((config as Record<string, Record<string, unknown>>)['podcast']?.['model']),
            maxReviewIterations: toNum((config as Record<string, Record<string, unknown>>)['podcast']?.['maxReviewIterations']),
          },
        });
      } finally {
        setLoading(false);
      }
    }

    loadChannel();
  }, [channelId, form]);

  async function onSubmit(values: FormValues) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultMediaConfig: values }),
      });
      const { error } = await res.json();
      if (error) setSaveError(error.message ?? 'Failed to save');
    } catch {
      setSaveError('Network error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Accordion type="multiple" className="w-full">
          {MEDIUMS.map(({ key, label, fields }) => (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger>{label}</AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                  {fields.map((fieldKey) => (
                    <FormField
                      key={fieldKey}
                      control={form.control}
                      name={`${key}.${fieldKey}` as Parameters<typeof form.control.register>[0]}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor={`${key}-${fieldKey}`}>
                            {FIELD_LABELS[fieldKey]}
                          </FormLabel>
                          <FormControl>
                            <Input
                              id={`${key}-${fieldKey}`}
                              aria-label={FIELD_LABELS[fieldKey]}
                              type={
                                fieldKey === 'provider' || fieldKey === 'model'
                                  ? 'text'
                                  : 'number'
                              }
                              placeholder={
                                fieldKey === 'provider' || fieldKey === 'model' ? '' : '0'
                              }
                              {...field}
                              value={field.value !== undefined && field.value !== null ? String(field.value) : ''}
                              onChange={(e) => field.onChange(e.target.value)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {saveError && (
          <p className="text-sm text-destructive">{saveError}</p>
        )}

        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </Form>
  );
}
