'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PublishTarget } from '@brighttale/shared';

interface YouTubePublishFormValues {
  title: string;
  description: string;
  tags: string;
  categoryId: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
}

interface YouTubePublishFormProps {
  publishTarget: PublishTarget;
  draft: Record<string, unknown>;
  /** Pre-filled from canonical core / track outcome — user may edit. */
  defaultValues?: Partial<YouTubePublishFormValues>;
  thumbnailUrl?: string;
  onConfirm?: (values: YouTubePublishFormValues) => void;
  isSubmitting?: boolean;
}

export function YouTubePublishForm({
  defaultValues,
  thumbnailUrl,
  onConfirm,
  isSubmitting,
}: YouTubePublishFormProps) {
  const [submitted, setSubmitted] = useState(false);

  const { register, handleSubmit, setValue, watch } = useForm<YouTubePublishFormValues>({
    defaultValues: {
      title: defaultValues?.title ?? '',
      description: defaultValues?.description ?? '',
      tags: defaultValues?.tags ?? '',
      categoryId: defaultValues?.categoryId ?? '22',
      privacyStatus: defaultValues?.privacyStatus ?? 'private',
    },
  });

  const privacyStatus = watch('privacyStatus');

  function onSubmit(values: YouTubePublishFormValues) {
    setSubmitted(true);
    onConfirm?.(values);
  }

  return (
    <section data-testid="driver-youtube" className="space-y-6 p-4">
      <h2 className="text-lg font-semibold">Publish to YouTube</h2>

      {thumbnailUrl && (
        <div className="overflow-hidden rounded-md border" data-testid="yt-thumbnail-preview">
          <img
            src={thumbnailUrl}
            alt="Video thumbnail preview"
            className="w-full object-cover"
          />
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="yt-title">Title</Label>
          <Input
            id="yt-title"
            data-testid="yt-title"
            placeholder="Video title"
            {...register('title', { required: true })}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="yt-description">Description</Label>
          <Textarea
            id="yt-description"
            data-testid="yt-description"
            placeholder="Video description"
            rows={4}
            {...register('description')}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="yt-tags">Tags (comma-separated)</Label>
          <Input
            id="yt-tags"
            data-testid="yt-tags"
            placeholder="tag1, tag2, tag3"
            {...register('tags')}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="yt-privacy">Privacy</Label>
          <Select
            value={privacyStatus}
            onValueChange={(v) => setValue('privacyStatus', v as 'private' | 'unlisted' | 'public')}
          >
            <SelectTrigger id="yt-privacy" data-testid="yt-privacy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="unlisted">Unlisted</SelectItem>
              <SelectItem value="public">Public</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          data-testid="yt-confirm-publish"
          disabled={isSubmitting ?? submitted}
          className="w-full"
        >
          {isSubmitting ?? submitted ? 'Publishing…' : 'Confirm & Publish'}
        </Button>
      </form>
    </section>
  );
}
