import { inngest } from './client.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { searchVideos, getVideoDetails, parseDuration } from '../lib/youtube/client.js';

const ENGAGEMENT_THRESHOLD = 0.05;
const MIN_VIEWS = 10_000;

type StepRun = (name: string, fn: () => Promise<unknown>) => Promise<unknown>;

export const referenceCheck = inngest.createFunction(
  {
    id: 'reference-check-weekly',
    retries: 2,
    triggers: [{ cron: '0 6 * * 1' }],
  },
  async ({ step }: { step: { run: StepRun } }) => {
    const sb = createServiceClient();

    const refs = (await step.run('fetch-active-references', async () => {
      const { data } = await sb
        .from('channel_references')
        .select('id, channel_id, org_id, external_id, name, platform')
        .eq('platform', 'youtube')
        .not('external_id', 'is', null);
      return data ?? [];
    })) as Array<{
      id: string;
      channel_id: string;
      org_id: string;
      external_id: string | null;
      name: string | null;
      platform: string;
    }>;

    if (refs.length === 0) return { processed: 0, notifications: 0 };

    let totalNotifications = 0;

    for (const ref of refs) {
      const newVideos = (await step.run(`check-ref-${ref.id}`, async () => {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const searchResults = await searchVideos(`channel:${ref.external_id}`, {
          maxResults: 10,
          order: 'date',
          publishedAfter: oneWeekAgo,
        });

        if (searchResults.length === 0) return [];

        const videoIds = searchResults.map((v) => v.id.videoId);
        const details = await getVideoDetails(videoIds);

        const trending = details.filter((v) => {
          const views = parseInt(v.statistics.viewCount, 10);
          const likes = parseInt(v.statistics.likeCount, 10);
          const comments = parseInt(v.statistics.commentCount, 10);
          const engagement = views > 0 ? (likes + comments) / views : 0;
          return views >= MIN_VIEWS && engagement >= ENGAGEMENT_THRESHOLD;
        });

        for (const v of details) {
          await sb.from('reference_content').upsert(
            {
              reference_id: ref.id,
              external_id: v.id,
              title: v.snippet.title,
              url: `https://youtube.com/watch?v=${v.id}`,
              published_at: v.snippet.publishedAt,
              view_count: parseInt(v.statistics.viewCount, 10),
              like_count: parseInt(v.statistics.likeCount, 10),
              comment_count: parseInt(v.statistics.commentCount, 10),
              duration_seconds: parseDuration(v.contentDetails.duration),
              description: v.snippet.description,
              tags: v.snippet.tags ?? [],
              engagement_rate:
                parseInt(v.statistics.viewCount, 10) > 0
                  ? ((parseInt(v.statistics.likeCount, 10) + parseInt(v.statistics.commentCount, 10)) /
                      parseInt(v.statistics.viewCount, 10)) *
                    100
                  : 0,
            },
            { onConflict: 'id' },
          );
        }

        await sb
          .from('channel_references')
          .update({ analyzed_at: new Date().toISOString() })
          .eq('id', ref.id);

        return trending.map((v) => ({
          externalId: v.id,
          title: v.snippet.title,
          views: parseInt(v.statistics.viewCount, 10),
          likes: parseInt(v.statistics.likeCount, 10),
          comments: parseInt(v.statistics.commentCount, 10),
          engagement:
            parseInt(v.statistics.viewCount, 10) > 0
              ? ((parseInt(v.statistics.likeCount, 10) + parseInt(v.statistics.commentCount, 10)) /
                  parseInt(v.statistics.viewCount, 10)) *
                100
              : 0,
          tags: v.snippet.tags ?? [],
        }));
      })) as Array<{
        externalId: string;
        title: string;
        views: number;
        likes: number;
        comments: number;
        engagement: number;
        tags: string[];
      }>;

      if (newVideos.length > 0) {
        await step.run(`notify-ref-${ref.id}`, async () => {
          for (const video of newVideos) {
            const { data: content } = await sb
              .from('reference_content')
              .select('id')
              .eq('reference_id', ref.id)
              .eq('external_id', video.externalId)
              .limit(1)
              .single();

            await sb.from('reference_notifications').insert({
              org_id: ref.org_id,
              channel_id: ref.channel_id,
              reference_id: ref.id,
              content_id: content?.id ?? null,
              type: 'trending_video',
              title: `${ref.name} postou: "${video.title}"`,
              body: `${(video.views / 1000).toFixed(0)}K views · ${video.engagement.toFixed(1)}% engagement`,
              metadata_json: {
                video_external_id: video.externalId,
                views: video.views,
                likes: video.likes,
                comments: video.comments,
                engagement: video.engagement,
                tags: video.tags,
              },
            });
          }
          totalNotifications += newVideos.length;
        });
      }
    }

    return { processed: refs.length, notifications: totalNotifications };
  },
);
