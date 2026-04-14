/**
 * F2-039 — Google Trends wrapper.
 * Free (no API key). Returns 12-month interest + related queries for a topic.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — google-trends-api has no types
import googleTrends from 'google-trends-api';

export interface TrendPoint {
  time: string;         // ISO-8601 day
  value: number;        // 0-100 (relative to peak)
}

export interface TrendsResult {
  topic: string;
  geo: string;
  points: TrendPoint[];
  trend: 'rising' | 'stable' | 'falling';
  relatedQueries: string[];
  peakValue: number;
  averageValue: number;
}

/** Compute linear trend slope of the last half vs first half of the series. */
function classifyTrend(points: TrendPoint[]): 'rising' | 'stable' | 'falling' {
  if (points.length < 4) return 'stable';
  const mid = Math.floor(points.length / 2);
  const firstAvg = points.slice(0, mid).reduce((s, p) => s + p.value, 0) / mid;
  const lastAvg = points.slice(mid).reduce((s, p) => s + p.value, 0) / (points.length - mid);
  const delta = lastAvg - firstAvg;
  if (delta > 10) return 'rising';
  if (delta < -10) return 'falling';
  return 'stable';
}

export async function fetchTrends(topic: string, geo = 'BR'): Promise<TrendsResult> {
  const startTime = new Date();
  startTime.setFullYear(startTime.getFullYear() - 1);

  const interestPromise = googleTrends.interestOverTime({ keyword: topic, startTime, geo });
  const relatedPromise = googleTrends
    .relatedQueries({ keyword: topic, startTime, geo })
    .catch(() => null); // related queries often fail quietly for niche topics

  const [interestRaw, relatedRaw] = await Promise.all([interestPromise, relatedPromise]);

  interface TimelinePoint { formattedAxisTime: string; value?: number[] }
  const parsed = JSON.parse(interestRaw as string) as {
    default?: { timelineData?: TimelinePoint[] };
  };
  const timeline: TimelinePoint[] = parsed.default?.timelineData ?? [];

  const points: TrendPoint[] = timeline.map((p) => ({
    time: p.formattedAxisTime,
    value: p.value?.[0] ?? 0,
  }));

  let relatedQueries: string[] = [];
  if (relatedRaw) {
    try {
      interface RelatedItem { query: string }
      const rel = JSON.parse(relatedRaw as string) as {
        default?: { rankedList?: Array<{ rankedKeyword?: RelatedItem[] }> };
      };
      const list = rel.default?.rankedList?.[0]?.rankedKeyword ?? [];
      relatedQueries = list.slice(0, 8).map((x) => x.query).filter(Boolean);
    } catch {
      // ignore
    }
  }

  const peakValue = points.reduce((m, p) => Math.max(m, p.value), 0);
  const averageValue = points.length
    ? points.reduce((s, p) => s + p.value, 0) / points.length
    : 0;

  return {
    topic,
    geo,
    points,
    trend: classifyTrend(points),
    relatedQueries,
    peakValue,
    averageValue: Math.round(averageValue),
  };
}
