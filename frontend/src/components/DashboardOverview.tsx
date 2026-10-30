import { useMemo, useState } from 'react'
import type { CandidateSubmission, Client, Job } from '../api/client'
import { DROPPED_STATUSES, PERIOD_LABELS, PLACED_STATUSES, computeDashboard, getPeriodRange, niceTicks, type Period } from '../dashboardStats'
import RecruiterBoard from './RecruiterBoard'

type Props = {
  jobs: Job[]
  submissions: CandidateSubmission[]
  clients: Client[]
  activeVendors: number
  activeClients: number
  loading: boolean
  onRefresh: () => void
  onOpenJobs: (filter: 'all' | 'open') => void
  onOpenVendors: () => void
  onOpenClients: () => void
  onOpenCandidates?: () => void
  // Partner logins that may not see client names.
  hideClients?: boolean
  // Recruiter performance board (your team only)
  token?: string | null
  showRecruiters?: boolean
  onSelectJob: (job: Job) => void
  // Only used by tests, to pin "today".
  now?: Date
}

const PERIODS: Period[] = ['year', 'month', 'week']

function experienceText(job: Job): string | null {
  if (job.min_experience == null) return null
  return job.max_experience != null ? `${job.min_experience}-${job.max_experience} Years` : `${job.min_experience}+ Years`
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

// ---------------------------------------------------------------------------

function Kpi({
  label,
  value,
  loading,
  tone,
  note,
  onClick,
}: {
  label: string
  value: number
  loading: boolean
  tone: 'up' | 'down' | 'flat'
  note: string
  onClick?: () => void
}) {
  const body = (
    <>
      <span className="vx-kpi-label">{label}</span>
      <strong className="vx-kpi-value">{loading ? '—' : value.toLocaleString()}</strong>
      <span className={`vx-kpi-note vx-kpi-note-${tone}`}>
        <span aria-hidden="true">{tone === 'up' ? '↑' : tone === 'down' ? '—' : ''}</span> {loading ? '' : note}
      </span>
    </>
  )
  return onClick ? (
    <button type="button" className="vx-kpi vx-kpi-clickable" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="vx-kpi">{body}</div>
  )
}

function PipelineDonut({ inProcess, placed, dropped, total, pct }: { inProcess: number; placed: number; dropped: number; total: number; pct: number }) {
  const radius = 50
  const circumference = 2 * Math.PI * radius
  const segments = [
    { key: 'inprocess', count: inProcess, className: 'vx-seg-inprocess' },
    { key: 'placed', count: placed, className: 'vx-seg-placed' },
    { key: 'dropped', count: dropped, className: 'vx-seg-dropped' },
  ]
  const arcs = segments
    .filter((segment) => segment.count > 0)
    .reduce<Array<(typeof segments)[number] & { length: number; offset: number }>>((all, segment) => {
      const length = total > 0 ? (segment.count / total) * circumference : 0
      const offset = all.length === 0 ? 0 : all[all.length - 1].offset + all[all.length - 1].length
      return [...all, { ...segment, length, offset }]
    }, [])

  return (
    <section className="vx-card vx-donut-card" aria-label="Candidate pipeline">
      <svg className="vx-donut" viewBox="0 0 140 140" role="img" aria-label={`${pct}% of submissions are in process`}>
        <circle className="vx-donut-track" cx="70" cy="70" r={radius} />
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            className={`vx-donut-seg ${arc.className}`}
            cx="70"
            cy="70"
            r={radius}
            strokeDasharray={`${arc.length} ${circumference - arc.length}`}
            strokeDashoffset={-arc.offset}
            transform="rotate(-90 70 70)"
          />
        ))}
        <text className="vx-donut-center" x="70" y="76" textAnchor="middle">
          {pct}%
        </text>
      </svg>
      <dl className="vx-donut-legend">
        <div><dt><i className="vx-dot vx-seg-inprocess" />In Process:</dt><dd>{inProcess}</dd></div>
        <div><dt><i className="vx-dot vx-seg-placed" />Placed:</dt><dd>{placed}</dd></div>
        <div><dt><i className="vx-dot vx-seg-dropped" />Dropped:</dt><dd>{dropped}</dd></div>
        <div className="vx-donut-total"><dt>Total:</dt><dd>{total}</dd></div>
      </dl>
    </section>
  )
}

function TrendChart({ points, periodLabel }: { points: Array<{ label: string; value: number }>; periodLabel: string }) {
  const width = 640
  const height = 290
  const pad = { left: 40, right: 16, top: 14, bottom: 62 }
  const innerWidth = width - pad.left - pad.right
  const innerHeight = height - pad.top - pad.bottom
  const ticks = niceTicks(Math.max(0, ...points.map((point) => point.value)))
  const top = ticks[ticks.length - 1]
  const x = (index: number) => (points.length <= 1 ? pad.left + innerWidth / 2 : pad.left + (innerWidth * index) / (points.length - 1))
  const y = (value: number) => pad.top + innerHeight * (1 - value / top)
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ')
  const total = points.reduce((sum, point) => sum + point.value, 0)

  return (
    <svg
      className="vx-trend"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Submission trend for ${periodLabel.toLowerCase()}: ${plural(total, 'submission')}`}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="vx-grid" x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
          <text className="vx-axis-text" x={pad.left - 8} y={y(tick) + 3.5} textAnchor="end">
            {tick}
          </text>
        </g>
      ))}
      {points.length > 1 && <path className="vx-trend-line" d={line} />}
      {points.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          <circle className="vx-trend-dot" cx={x(index)} cy={y(point.value)} r="3.6">
            <title>{`${point.label}: ${plural(point.value, 'submission')}`}</title>
          </circle>
          <text
            className="vx-axis-text"
            textAnchor="end"
            transform={`translate(${x(index) + 3} ${height - pad.bottom + 16}) rotate(-45)`}
          >
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------

export default function DashboardOverview({
  jobs,
  submissions,
  clients,
  activeVendors,
  activeClients,
  loading,
  onRefresh,
  onOpenJobs,
  onOpenVendors,
  onOpenClients,
  onOpenCandidates,
  hideClients = false,
  token = null,
  showRecruiters = false,
  onSelectJob,
  now,
}: Props) {
  const [period, setPeriod] = useState<Period>('month')
  const periodLabel = PERIOD_LABELS[period]
  const periodRange = useMemo(() => {
    const range = getPeriodRange(period, now ?? new Date())
    return { start: range.start, end: range.end }
  }, [period, now])
  const stats = useMemo(() => computeDashboard(jobs, submissions, period, now), [jobs, submissions, period, now])
  const clientNames = useMemo(() => new Map(clients.map((client) => [client.id, client.company_name])), [clients])
  const maxStage = Math.max(1, ...stats.stages.map((stage) => stage.count))
  const visibleStages = stats.stages.filter((stage) => stage.count > 0)

  return (
    <div className="vx-dash">
      <div className="vx-toolbar">
        <button type="button" className="vx-pill" onClick={onOpenVendors}>
          Active Vendors <strong>{loading ? '—' : activeVendors}</strong>
        </button>
        <button type="button" className="vx-pill" onClick={onOpenClients}>
          Active Clients <strong>{loading ? '—' : activeClients}</strong>
        </button>
        <button type="button" className="vx-pill vx-pill-action" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="vx-top-row">
        <section className="vx-card vx-kpi-card" aria-label="Job statistics">
          <Kpi
            label="Your Jobs"
            value={stats.totalJobs}
            loading={loading}
            tone="flat"
            note={`${plural(stats.openPositions, 'open position')}`}
            onClick={() => onOpenJobs('all')}
          />
          <Kpi
            label="Active"
            value={stats.activeJobs}
            loading={loading}
            tone="up"
            note={`${stats.activePct}%`}
            onClick={() => onOpenJobs('open')}
          />
          <Kpi
            label="Position Closed"
            value={stats.closedJobs}
            loading={loading}
            tone="down"
            note={`${stats.closedPct}%`}
            onClick={() => onOpenJobs('all')}
          />
          <Kpi
            label="Candidate Submitted"
            value={stats.submitted}
            loading={loading}
            tone={stats.submitted > 0 ? 'up' : 'flat'}
            note={`${stats.perActiveJob} per active job`}
            onClick={onOpenCandidates}
          />
        </section>

        <PipelineDonut
          inProcess={stats.pipeline.inProcess}
          placed={stats.pipeline.placed}
          dropped={stats.pipeline.dropped}
          total={stats.pipeline.total}
          pct={stats.pipeline.inProcessPct}
        />
      </div>

      <div className="vx-period" role="group" aria-label="Period for submissions">
        {PERIODS.map((key) => (
          <button
            key={key}
            type="button"
            className={period === key ? 'active' : ''}
            aria-pressed={period === key}
            onClick={() => setPeriod(key)}
          >
            {PERIOD_LABELS[key]}
          </button>
        ))}
      </div>

      <div className={`vx-bottom-row${showRecruiters ? ' vx-bottom-3' : ''}`}>
        <section className="vx-card" aria-label="Top active jobs">
          <div className="vx-card-head">
            <h2>Top 5 Active Jobs (High Submissions)</h2>
            <button type="button" className="vx-green-button" onClick={() => onOpenJobs('open')}>
              View All
            </button>
          </div>
          {stats.topJobs.length === 0 ? (
            <p className="vx-empty">No active jobs yet. Jobs with the status “open” appear here.</p>
          ) : (
            <ol className="vx-job-list">
              {stats.topJobs.map(({ job, submissions: count }) => {
                const meta = [hideClients ? null : job.client_name ?? clientNames.get(job.client_id ?? -1) ?? 'No client linked', experienceText(job)].filter(Boolean).join(' • ')
                return (
                  <li key={job.id}>
                    <button type="button" className="vx-job-row" onClick={() => onSelectJob(job)} aria-label={`Open ${job.title}`}>
                      <span className="vx-job-main">
                        <strong>{job.title}</strong>
                        <span>{meta}</span>
                      </span>
                      <span className={`vx-job-count${count === 0 ? ' vx-job-count-zero' : ''}`}>{plural(count, 'submission')}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        {showRecruiters && (
          <RecruiterBoard key={period} token={token} range={periodRange} periodLabel={periodLabel} onOpenJobs={() => onOpenJobs('all')} />
        )}

        <div className="vx-right-stack">
          <section className="vx-card" aria-label="Submission trends">
            <div className="vx-card-head">
              <h2>Submission Trends</h2>
              <span className="vx-card-sub">{periodLabel}</span>
            </div>
            <TrendChart points={stats.trend} periodLabel={periodLabel} />
          </section>

          <section className="vx-card" aria-label="Submissions by stage">
            <div className="vx-card-head">
              <h2>Submissions by Stage</h2>
              <span className="vx-card-sub">{periodLabel}</span>
            </div>
            {visibleStages.length === 0 ? (
              <p className="vx-empty">No submissions in this period.</p>
            ) : (
              <ul className="vx-stage-list">
                {visibleStages.map((stage) => (
                  <li key={stage.status}>
                    <span>{stage.status}</span>
                    <span className="vx-stage-bar">
                      <i
                        className={PLACED_STATUSES.includes(stage.status) ? 'vx-bar-placed' : DROPPED_STATUSES.includes(stage.status) ? 'vx-bar-dropped' : ''}
                        style={{ width: `${(stage.count / maxStage) * 100}%` }}
                      />
                    </span>
                    <strong>{stage.count}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
