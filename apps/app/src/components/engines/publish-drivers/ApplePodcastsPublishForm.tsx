'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { PublishTarget } from '@brighttale/shared';

const applePodcastsSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  audioUrl: z
    .string()
    .min(1, 'Audio URL is required')
    .url('Must be a valid URL')
    .refine((v) => v.startsWith('https://'), 'Audio URL must use https'),
  durationSec: z
    .number({ invalid_type_error: 'Duration must be a number' })
    .int('Duration must be a whole number')
    .min(1, 'Duration must be at least 1 second'),
  itunesAuthor: z.string().min(1, 'iTunes author is required'),
  itunesImageUrl: z
    .string()
    .min(1, 'iTunes image URL is required')
    .url('Must be a valid URL')
    .refine((v) => v.startsWith('https://'), 'iTunes image URL must use https'),
  itunesExplicit: z.boolean(),
});

export interface ApplePodcastsEpisodeInput {
  title: string;
  description: string;
  audioUrl: string;
  durationSec: number;
  itunesAuthor: string;
  itunesImageUrl: string;
  itunesExplicit: boolean;
}

interface ApplePodcastsPublishFormProps {
  /** Called when the user confirms and submits a valid episode. */
  onSubmit?: (values: ApplePodcastsEpisodeInput) => Promise<void>;
  defaultValues?: Partial<ApplePodcastsEpisodeInput>;
  isSubmitting?: boolean;
  /** Optional publish target — accepted for engine compatibility but not used internally. */
  publishTarget?: PublishTarget;
  /** Optional draft metadata — accepted for engine compatibility but not used internally. */
  draft?: Record<string, unknown>;
}

export function ApplePodcastsPublishForm({
  onSubmit,
  defaultValues,
  isSubmitting,
  publishTarget: _publishTarget,
  draft: _draft,
}: ApplePodcastsPublishFormProps) {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ApplePodcastsEpisodeInput>({
    resolver: zodResolver(applePodcastsSchema),
    defaultValues: {
      title: defaultValues?.title ?? '',
      description: defaultValues?.description ?? '',
      audioUrl: defaultValues?.audioUrl ?? '',
      durationSec: defaultValues?.durationSec ?? undefined,
      itunesAuthor: defaultValues?.itunesAuthor ?? '',
      itunesImageUrl: defaultValues?.itunesImageUrl ?? '',
      itunesExplicit: defaultValues?.itunesExplicit ?? false,
    },
  });

  const itunesExplicit = watch('itunesExplicit');

  async function onFormSubmit(values: ApplePodcastsEpisodeInput) {
    setSubmitted(true);
    if (onSubmit) {
      await onSubmit(values);
    }
    setSubmitted(false);
  }

  return (
    <section data-testid="driver-apple-podcasts" className="space-y-6 p-4">
      <h2 className="text-lg font-semibold">Publish to Apple Podcasts</h2>

      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="ap-title">Title</Label>
          <Input
            id="ap-title"
            data-testid="ap-title"
            placeholder="Episode title"
            {...register('title')}
          />
          {errors.title && (
            <p className="text-sm text-destructive" role="alert">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="ap-description">Description</Label>
          <Textarea
            id="ap-description"
            data-testid="ap-description"
            placeholder="Episode description"
            rows={4}
            {...register('description')}
          />
          {errors.description && (
            <p className="text-sm text-destructive" role="alert">{errors.description.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="ap-audio-url">Audio URL</Label>
          <Input
            id="ap-audio-url"
            data-testid="ap-audio-url"
            placeholder="https://storage.example.com/episode.mp3"
            type="url"
            {...register('audioUrl')}
          />
          {errors.audioUrl && (
            <p className="text-sm text-destructive" role="alert">{errors.audioUrl.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="ap-duration">Duration (seconds)</Label>
          <Input
            id="ap-duration"
            data-testid="ap-duration"
            placeholder="3600"
            type="number"
            min={1}
            {...register('durationSec', { valueAsNumber: true })}
          />
          {errors.durationSec && (
            <p className="text-sm text-destructive" role="alert">{errors.durationSec.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="ap-itunes-author">iTunes Author</Label>
          <Input
            id="ap-itunes-author"
            data-testid="ap-itunes-author"
            placeholder="Jane Doe"
            {...register('itunesAuthor')}
          />
          {errors.itunesAuthor && (
            <p className="text-sm text-destructive" role="alert">{errors.itunesAuthor.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="ap-itunes-image">iTunes Image URL</Label>
          <Input
            id="ap-itunes-image"
            data-testid="ap-itunes-image"
            placeholder="https://example.com/cover.jpg"
            type="url"
            {...register('itunesImageUrl')}
          />
          {errors.itunesImageUrl && (
            <p className="text-sm text-destructive" role="alert">{errors.itunesImageUrl.message}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="ap-itunes-explicit"
            data-testid="ap-itunes-explicit"
            checked={itunesExplicit}
            onCheckedChange={(checked) => setValue('itunesExplicit', checked === true)}
          />
          <Label htmlFor="ap-itunes-explicit">Explicit content</Label>
        </div>

        <Button
          type="submit"
          data-testid="ap-confirm-publish"
          disabled={isSubmitting ?? submitted}
          className="w-full"
        >
          {isSubmitting ?? submitted ? 'Publishing…' : 'Confirm & Publish'}
        </Button>
      </form>
    </section>
  );
}
