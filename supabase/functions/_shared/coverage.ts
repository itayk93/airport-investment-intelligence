// How the project describes its own congestion coverage, in one place.
//
// Deliberately separate from db.ts: that module opens a Postgres connection at import
// time, which would make this pure formatting logic untestable without a live database.
//
// This exists because refresh is scheduled (.github/workflows/refresh-daily.yml). The
// period used to be hardcoded as "twelve months, June 2025 through May 2026" in both the
// system prompt and the UI's caveat list. The first cron run added a month and made both
// statements false while the agent went on asserting the old one confidently. Facts about
// the data are now read from the data.

export type CoverageRow = {
  data_scope: string;
  first_period: number;
  last_period: number;
  months: number;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 202506 → "June 2025". Periods are stored as year * 100 + month. */
function periodLabel(period: number): string {
  return `${MONTH_NAMES[(period % 100) - 1]} ${Math.floor(period / 100)}`;
}

/**
 * "13 months of congestion data (June 2025 - June 2026)", built from what the database
 * actually holds.
 *
 * `months` is a distinct count rather than a span, so a gap in ingestion under-reports
 * instead of quietly claiming continuous coverage.
 */
export function describeCongestionCoverage(rows: CoverageRow[]): string {
  const r = rows.find((row) => row.data_scope === 'domestic_ontime');
  if (!r?.months) return 'Congestion coverage is unavailable';
  const span = r.first_period === r.last_period
    ? periodLabel(r.first_period)
    : `${periodLabel(r.first_period)} - ${periodLabel(r.last_period)}`;
  return `${r.months} month${r.months === 1 ? '' : 's'} of congestion data (${span})`;
}
