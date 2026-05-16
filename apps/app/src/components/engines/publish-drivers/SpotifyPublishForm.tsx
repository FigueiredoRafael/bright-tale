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

const spotifyEpisodeSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  audioUrl: z.string().url('Audio URL must be a valid URL'),
  durationSec: z
    .number({ invalid_type_error: 'Duration must be a number' })
    .min(1, 'Duration must be at least 1 second'),
  thumbnailUrl: z
    .string()
    .url('Thumbnail URL must be a valid URL')
    .optional()
    .or(z.literal('')),
  itunesExplicit: z.boolean(),
});

export type SpotifyEpisodeInput = z.infer<typeof spotifyEpisodeSchema>;

interface SpotifyPublishFormProps {
  publishTarget: PublishTarget;
  draft: Record<string, unknown>;
  defaultValues?: Partial<SpotifyEpisodeInput>;
  onSubmit?: (values: SpotifyEpisodeInput) => Promise<void>;
  isSubmitting?: boolean;
}

export function SpotifyPublishForm({
  defaultValues,
  onSubmit,
  isSubmitting,
}: SpotifyPublishFormProps) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SpotifyEpisodeInput>({
    resolver: zodResolver(spotifyEpisodeSchema),
    defaultValues: {
      title: defaultValues?.title ?? '',
      description: defaultValues?.description ?? '',
      audioUrl: defaultValues?.audioUrl ?? '',
      durationSec: defaultValues?.durationSec ?? undefined,
      thumbnailUrl: defaultValues?.thumbnailUrl ?? '',
      itunesExplicit: defaultValues?.itunesExplicit ?? false,
    },
  });

  const itunesExplicit = watch('itunesExplicit');

  async function onFormSubmit(values: SpotifyEpisodeInput) {
    setSubmitting(true);
    try {
      await onSubmit?.(values);
    } finally {
      setSubmitting(false);
    }
  }

  const isDisabled = isSubmitting ?? submitting;

  return (
    <section data-testid="driver-spotify" className="space-y-6 p-4">
      <h2 className="text-lg font-semibold">Publish to Spotify</h2>

      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1">
          <Label htmlFor="sp-title">Title</Label>
          <Input
            id="sp-title"
            data-testid="sp-title"
            placeholder="Episode title"
            {...register('title')}
          />
          {errors.title && (
            <p data-testid="sp-title-error" className="text-sm text-destructive">
              {errors.title.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="sp-description">Description</Label>
          <Textarea
            id="sp-description"
            data-testid="sp-description"
            placeholder="Episode description"
            rows={4}
            {...register('description')}
          />
          {errors.description && (
            <p data-testid="sp-description-error" className="text-sm text-destructive">
              {errors.description.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="sp-audio-url">Audio File URL</Label>
          <Input
            id="sp-audio-url"
            data-testid="sp-audio-url"
            type="url"
            placeholder="https://cdn.example.com/episode.mp3"
            {...register('audioUrl')}
          />
          {errors.audioUrl && (
            <p data-testid="sp-audio-url-error" className="text-sm text-destructive">
              {errors.audioUrl.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="sp-duration">Duration (seconds)</Label>
          <Input
            id="sp-duration"
            data-testid="sp-duration"
            type="number"
            min={1}
            placeholder="3600"
            {...register('durationSec', { valueAsNumber: true })}
          />
          {errors.durationSec && (
            <p data-testid="sp-duration-error" className="text-sm text-destructive">
              {errors.durationSec.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="sp-thumbnail-url">Thumbnail URL (optional)</Label>
          <Input
            id="sp-thumbnail-url"
            data-testid="sp-thumbnail-url"
            type="url"
            placeholder="https://cdn.example.com/cover.jpg"
            {...register('thumbnailUrl')}
          />
          {errors.thumbnailUrl && (
            <p data-testid="sp-thumbnail-url-error" className="text-sm text-destructive">
              {errors.thumbnailUrl.message}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="sp-explicit"
            data-testid="sp-explicit"
            checked={itunesExplicit}
            onCheckedChange={(checked) => setValue('itunesExplicit', checked === true)}
          />
          <Label htmlFor="sp-explicit">Explicit content</Label>
        </div>

        <Button
          type="submit"
          data-testid="sp-confirm-publish"
          disabled={isDisabled}
          className="w-full"
        >
          {isDisabled ? 'Publishing…' : 'Confirm & Publish'}
        </Button>
      </form>
    </section>
  );
}
