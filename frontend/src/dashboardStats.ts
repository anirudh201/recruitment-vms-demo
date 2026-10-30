import type { CandidateSubmission, Job } from './api/client'

export type Period = 'year' | 'month' | 'week'

export const PERIOD_LABELS: Record<Period, string> = {
  year: 'This Year',
  month: 'This Month',
  week: 'This Week',
}

// Submission statuses grouped the way a recruiter reads the pipeline.
export const IN_PROCESS_STATUSES = ['Submitted', 'Screening', 'Shortlisted', 'Sent to Client', 'Interview Scheduled']
export const PLACED_STATUSES = ['Selected', 'Offer Accepted', 'Joined']
export const DROPPED_STATUSES = ['Rejected', 'Withdrawn', 'Offer Declined']
export const STAGE_ORDER = [...IN_PROCESS_STATUSES, ...PLACED_STATUSES, ...DROPPED_STATUSES]

export type Bucket = { label: string; start: Date; end: Date }
export type PeriodRange = { start: Date; end: Date; buckets: Bucket[] }

export type DashboardStats = {
  totalJobs: number
  activeJobs: number
  closedJobs: number
  openPositions: number
  activePct: number
  closedPct: number
  submitted: number
  perActiveJob: number
  pipeline: { inProcess: number; placed: number; dropped: number; total: number; inProcessPct: number }
  stages: Array<{ status: string; count: number }>
  topJobs: Array<{ job: Job; submissions: number }>
  trend: Array<{ label: string; value: number }>
}

// The API returns UTC timestamps. If a value arrives without a zone, treat it as UTC too.
export function parseApiDate(value?: string | null): Date | null {
  if (!value) return null
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value)
  const date = new Date(hasZone ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
// Fixed names: locale data differs between browsers (e.g. "Sept" vs "Sep").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabel = (date: Date) => `${date.getDate()} ${MONTHS[date.getMonth()]}`
const monthLabel = (date: Date) => MONTHS[date.getMonth()]

// Year -> one bucket per month so far, Month/Week -> one bucket per day up to today.
// The week starts on Monday.
export function getPeriodRange(period: Period, now: Date): PeriodRange {
  const today = startOfDay(now)

  if (period === 'year') {
    const year = now.getFullYear()
    const buckets: Bucket[] = []
    for (let month = 0; month <= now.getMonth(); month += 1) {
      const start = new Date(year, month, 1)
      buckets.push({ label: monthLabel(start), start, end: new Date(year, month + 1, 1) })
    }
    return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1), buckets }
  }

  const start = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : addDays(today, -((today.getDay() + 6) % 7))
  const end = period === 'month' ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : addDays(start, 7)
  const buckets: Bucket[] = []
  for (let day = start; day <= today; day = addDays(day, 1)) {
    buckets.push({ label: dayLabel(day), start: day, end: addDays(day, 1) })
  }
  return { start, end, buckets }
}

const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10)

export function computeDashboard(
  jobs: Job[],
  submissions: CandidateSubmission[],
  period: Period,
  now: Date = new Date(),
): DashboardStats {
  const range = getPeriodRange(period, now)

  const dated = submissions.flatMap((submission) => {
    const date = parseApiDate(submission.created_at)
    return date ? [{ submission, time: date.getTime() }] : []
  })
  const inRange = dated.filter(({ time }) => time >= range.start.getTime() && time < range.end.getTime())

  const openJobs = jobs.filter((job) => job.status === 'open')
  const closedJobs = jobs.filter((job) => job.status === 'closed')

  const pipelineCount = (statuses: string[]) => inRange.filter(({ submission }) => statuses.includes(submission.status)).length
  const inProcess = pipelineCount(IN_PROCESS_STATUSES)
  const placed = pipelineCount(PLACED_STATUSES)
  const dropped = pipelineCount(DROPPED_STATUSES)

  const perJob = new Map<number, number>()
  for (const { submission } of inRange) perJob.set(submission.job_id, (perJob.get(submission.job_id) ?? 0) + 1)

  const createdTime = (job: Job) => parseApiDate(job.created_at)?.getTime() ?? 0
  const topJobs = openJobs
    .map((job) => ({ job, submissions: perJob.get(job.id) ?? 0 }))
    .sort((a, b) => b.submissions - a.submissions || createdTime(b.job) - createdTime(a.job) || b.job.id - a.job.id)
    .slice(0, 5)

  return {
    totalJobs: jobs.length,
    activeJobs: openJobs.length,
    closedJobs: closedJobs.length,
    openPositions: openJobs.reduce((sum, job) => sum + (job.openings || 0), 0),
    activePct: percent(openJobs.length, jobs.length),
    closedPct: percent(closedJobs.length, jobs.length),
    submitted: inRange.length,
    perActiveJob: openJobs.length === 0 ? 0 : Math.round((inRange.length / openJobs.length) * 10) / 10,
    pipeline: { inProcess, placed, dropped, total: inRange.length, inProcessPct: Math.round(percent(inProcess, inRange.length)) },
    stages: STAGE_ORDER.map((status) => ({
      status,
      count: inRange.filter(({ submission }) => submission.status === status).length,
    })),
    topJobs,
    trend: range.buckets.map((bucket) => ({
      label: bucket.label,
      value: inRange.filter(({ time }) => time >= bucket.start.getTime() && time < bucket.end.getTime()).length,
    })),
  }
}

// Whole-number y-axis ticks, e.g. [0,1] for an empty chart or [0,2,4,6,8,10] for larger ones.
export function niceTicks(maxValue: number): number[] {
  const max = Math.max(1, Math.ceil(maxValue))
  if (max <= 5) return Array.from({ length: max + 1 }, (_, index) => index)
  const rough = max / 5
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough) ?? rough
  const top = Math.ceil(max / step) * step
  return Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step)
}

export function formatDate(value?: string | null): string {
  const date = parseApiDate(value)
  return date ? `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}` : '—'
}

export function formatDateTime(value?: string | null): string {
  const date = parseApiDate(value)
  if (!date) return '—'
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${formatDate(value)}, ${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`
}
