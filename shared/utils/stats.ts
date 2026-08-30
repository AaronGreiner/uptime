import type { StatsRange } from '../types/stats'

export const STATS_RANGES: StatsRange[] = ['1h', '24h', '7d', '30d', '1y']

/** Duration of each range in seconds. */
export const STATS_RANGE_SECONDS: Record<StatsRange, number> = {
  '1h': 60 * 60,
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
  '1y': 365 * 24 * 60 * 60
}

/**
 * Ranges up to this length are answered from raw heartbeats, longer ones from
 * the hourly aggregates. Raw data is only retained for a few days anyway.
 */
export const RAW_HEARTBEAT_RANGE_LIMIT_SECONDS = STATS_RANGE_SECONDS['24h']

export function isStatsRange(value: unknown): value is StatsRange {
  return typeof value === 'string' && STATS_RANGES.includes(value as StatsRange)
}

/**
 * Bucket width used when charting a range, in seconds.
 *
 * Every range aims for a few hundred buckets, which is finer than the pixels of
 * any cell the chart is drawn in and therefore as much shape as the data can
 * carry. Two ceilings cut that aim short, and both are the source rather than a
 * choice: below 24 h the buckets are grouped from raw heartbeats, so a bucket
 * shorter than the check interval is empty rather than finer — 30 s is half the
 * default interval and covers the fastest monitors the bounds allow. Above 24 h
 * the source is the hourly rollup, which no bucket can undercut, and a year is
 * already past the aim at one bucket a day.
 */
export function statsBucketSeconds(range: StatsRange): number {
  switch (range) {
    case '1h': return 30
    case '24h': return 5 * 60
    case '7d': return 60 * 60
    case '30d': return 2 * 60 * 60
    case '1y': return 24 * 60 * 60
  }
}
