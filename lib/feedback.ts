import type { DistrictFeedback } from './types.ts';

/** Keep the newest member feedback first, regardless of proxy response ordering. */
export function newestFeedbackFirst<T extends Pick<DistrictFeedback, 'createdAt'>>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}
