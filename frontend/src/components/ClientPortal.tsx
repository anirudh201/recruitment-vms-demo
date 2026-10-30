import { useEffect, useState } from 'react'
import {
  fetchSubmissionResume,
  getSubmissionHistory,
  recordClientDecision,
  type CandidateSubmission,
  type ClientDecisionValue,
  type Job,
  type Me,
  type SubmissionHistoryEntry,
} from '../api/client'
import { formatDate, formatDateTime } from '../dashboardStats'

// Where a candidate is, from the client's point of view.
export type ClientTab = 'review' | 'interview' | 'selected' | 'closed' | 'all'
const TAB_STATUSES: Record<Exclude<ClientTab, 'all'>, string[]> = {
  review: ['Sent to Client'],
  interview: ['Interview Scheduled'],
  selected: ['Selected', 'Offer Accepted', 'Joined'],
  closed: ['Rejected', 'Withdrawn', 'Offer Declined'],
}
const TAB_LABEL: Record<ClientTab, string> = {
  review: 'Awaiting your review',
  interview: 'Interviewing',
  selected: 'Selected',
  closed: 'Not selected',
  all: 'All candidates',
}
// Mirrors the backend rule: what the client may decide from each status.
const DECISIONS: Record<string, ClientDecisionValue[]> = {
  'Sent to Client': ['Interview Scheduled', 'Selected', 'Rejected'],
  'Interview Scheduled': ['Selected', 'Rejected'],
}
const DECISION_LABEL: Record<ClientDecisionValue, string> = {
  'Interview Scheduled': 'Request interview',
  Selected: 'Select',
  Rejected: 'Reject',
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
const tabOf = (status: string): ClientTab =>
  (Object.keys(TAB_STATUSES) as Array<Exclude<ClientTab, 'all'>>).find((tab) => TAB_STATUSES[tab].includes(status)) ?? 'all'
const experience = (job: Job) =>
  job.min_experience == null ? null : job.max_experience != null ? `${job.min_experience}-${job.max_experience} yrs` : `${job.min_experience}+ yrs`

function StatusTag({ status }: { status: string }) {
  return <span className={`cp-tag cp-tag-${tabOf(status)}`}>{status === 'Sent to Client' ? 'Awaiting review' : status}</span>
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function ClientOverview({
  me,
  jobs,
  submissions,
  loading,
  onOpenCandidates,
}: {
  me: Me
  jobs: Job[]
  submissions: CandidateSubmission[]
  loading: boolean
  onOpenCandidates: (tab: ClientTab) => void
}) {
  const count = (tab: Exclude<ClientTab, 'all'>) => submissions.filter((item) => TAB_STATUSES[tab].includes(item.status)).length
  const awaiting = submissions.filter((item) => item.status === 'Sent to Client')
  const tiles: Array<{ tab: ClientTab; label: string; value: number }> = [
    { tab: 'review', label: 'Awaiting your review', value: count('review') },
    { tab: 'interview', label: 'Interviewing', value: count('interview') },
    { tab: 'selected', label: 'Selected', value: count('selected') },
  ]
  return (
    <>
      <header className="page-header" id="dashboard">
        <h1>Welcome{me.client_name ? `, ${me.client_name}` : ''}</h1>
        <p>Candidates shortlisted for your open positions by your recruitment partner.</p>
      </header>
      <section className="welcome-card jobs-card cd-card cp-card pr-page">
        <div className="cp-tiles">
          <div className="cp-tile cp-tile-static">
            <span>Open positions</span>
            <strong>{loading ? '—' : jobs.filter((job) => job.status === 'open').length}</strong>
          </div>
          {tiles.map((tile) => (
            <button key={tile.tab} type="button" className={`cp-tile cp-tile-${tile.tab}`} onClick={() => onOpenCandidates(tile.tab)}>
              <span>{tile.label}</span>
              <strong>{loading ? '—' : tile.value}</strong>
            </button>
          ))}
        </div>

        <h2 className="cp-section-title">Awaiting your review</h2>
        {!loading && awaiting.length === 0 ? (
          <p className="cd-empty-note">Nothing is waiting for you right now. New candidates will appear here when they are sent to you.</p>
        ) : (
          <ul className="cp-mini-list">
            {awaiting.slice(0, 5).map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.candidate_name}</strong>
                  <small>{item.job_title} · sent {formatDate(item.updated_at)}</small>
                </span>
                <button type="button" onClick={() => onOpenCandidates('review')}>Review</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Our jobs
// ---------------------------------------------------------------------------

export function ClientJobsPage({
  jobs,
  submissions,
  loading,
  onViewJD,
  onOpenCandidates,
}: {
  jobs: Job[]
  submissions: CandidateSubmission[]
  loading: boolean
  onViewJD: (job: Job) => void
  onOpenCandidates: (tab: ClientTab, jobId?: number) => void
}) {
  const ordered = [...jobs].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || a.title.localeCompare(b.title))
  return (
    <>
      <header className="page-header" id="jobs">
        <h1>Our Jobs</h1>
        <p>Your company’s positions and the candidates sent for each.</p>
      </header>
      <section className="welcome-card jobs-card cd-card cp-card pr-page">
        {!loading && jobs.length === 0 ? (
          <div className="cd-empty"><strong>No positions yet.</strong><p>Your recruitment partner will add your requirements here.</p></div>
        ) : (
          ordered.map((job) => {
            const sent = submissions.filter((item) => item.job_id === job.id)
            const waiting = sent.filter((item) => item.status === 'Sent to Client').length
            return (
              <article className={`pr-card${job.status === 'open' ? '' : ' pr-card-closed'}`} key={job.id}>
                <div className="pr-card-main">
                  <h3>{job.title} <span className={`pa-status pa-status-${job.status}`}>{job.status === 'open' ? 'Open' : 'Closed'}</span></h3>
                  <p>{[job.location, experience(job), job.work_arrangement, plural(job.openings, 'opening')].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="pr-card-side">
                  {sent.length > 0 ? (
                    <button type="button" className="pr-count" onClick={() => onOpenCandidates('all', job.id)}>
                      {plural(sent.length, 'candidate')} sent{waiting ? ` · ${waiting} awaiting you` : ''}
                    </button>
                  ) : (
                    <span className="pr-count pr-count-none">No candidates yet</span>
                  )}
                  <div className="pr-actions">
                    <button type="button" className="pr-secondary" onClick={() => onViewJD(job)}>View JD</button>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Candidates for review
// ---------------------------------------------------------------------------

function ActivityLog({ token, submissionId, version }: { token: string | null; submissionId: number; version: string }) {
  const [entries, setEntries] = useState<SubmissionHistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!token) return
    let cancelled = false
    getSubmissionHistory(token, submissionId)
      .then((data) => !cancelled && setEntries(data))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Unable to load activity.'))
    return () => {
      cancelled = true
    }
  }, [token, submissionId, version])
  if (error) return <p className="error-message">{error}</p>
  if (!entries) return <p className="cd-hint">Loading activity…</p>
  return (
    <ol className="cd-timeline cp-timeline">
      {entries.map((entry) => (
        <li key={entry.id}>
          <div className="cd-timeline-title">{entry.new_status === 'Sent to Client' ? 'Sent to you for review' : <strong>{entry.new_status}</strong>}</div>
          <div className="cd-timeline-meta">{formatDateTime(entry.changed_at)} · {entry.changed_by_email}</div>
          {entry.note && <div className="cd-timeline-note">{entry.note}</div>}
        </li>
      ))}
    </ol>
  )
}

function CandidateCard({
  token,
  item,
  onDecided,
  onViewJD,
}: {
  token: string | null
  item: CandidateSubmission
  onDecided: (message: string) => Promise<void>
  onViewJD: () => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<ClientDecisionValue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showActivity, setShowActivity] = useState(false)
  const options = DECISIONS[item.status] ?? []
  const skills = (item.primary_skills ?? '').split(/[,;\n]/).map((skill) => skill.trim()).filter(Boolean)
  const facts = [
    item.total_experience != null ? `${item.total_experience} yrs total` : null,
    item.relevant_experience != null ? `${item.relevant_experience} yrs relevant` : null,
    item.current_employer,
    item.current_location,
    item.highest_qualification,
  ].filter(Boolean)

  async function openResume() {
    if (!token || !item.resume_file_name) return
    const isPdf = item.resume_file_name.toLowerCase().endsWith('.pdf')
    const tab = isPdf ? window.open('', '_blank') : null
    try {
      const url = URL.createObjectURL(await fetchSubmissionResume(token, item.id))
      if (tab) tab.location.href = url
      else {
        const link = document.createElement('a')
        link.href = url
        link.download = item.resume_file_name
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      tab?.close()
      setError(err instanceof Error ? err.message : 'Unable to open the resume.')
    }
  }

  async function decide(decision: ClientDecisionValue) {
    if (!token) return setError('Your session has expired. Please sign in again.')
    if (decision === 'Rejected' && !note.trim()) return setError('Please add a short reason so we can send better-matched candidates.')
    setBusy(decision)
    setError(null)
    try {
      await recordClientDecision(token, item.id, decision, note.trim() || null)
      setNote('')
      await onDecided(
        decision === 'Rejected' ? `${item.candidate_name} was marked as not selected.`
          : decision === 'Selected' ? `${item.candidate_name} was selected. Your recruitment partner will be in touch.`
            : `Interview requested for ${item.candidate_name}. Your recruitment partner will arrange it.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save your decision.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="cp-candidate" aria-label={`Candidate ${item.candidate_name}`}>
      <div className="cp-candidate-head">
        <div>
          <h3>{item.candidate_name}</h3>
          <p>
            For <button type="button" className="cd-link" onClick={onViewJD}>{item.job_title}</button> · sent {formatDate(item.updated_at)}
          </p>
        </div>
        <StatusTag status={item.status} />
      </div>
      {facts.length > 0 && <p className="cp-facts">{facts.join(' · ')}</p>}
      {skills.length > 0 && <div className="cd-skills">{skills.map((skill, index) => <span key={`${skill}-${index}`} className="jd-chip">{skill}</span>)}</div>}
      {item.resume_file_name && (
        <p className="cp-resume">
          <button type="button" className="cd-link" onClick={() => void openResume()}>Open resume</button>
          <span>{item.resume_file_name}</span>
        </p>
      )}
      <p className="cp-contact">
        {item.candidate_email ? (
          <>Contact: <a href={`mailto:${item.candidate_email}`}>{item.candidate_email}</a>{item.phone ? ` · ${item.phone}` : ''}{item.resume_filename && /^https?:\/\//i.test(item.resume_filename) ? <> · <a href={item.resume_filename} target="_blank" rel="noopener noreferrer">Resume</a></> : null}</>
        ) : (
          'Contact details and resume are shared by your recruitment partner.'
        )}
      </p>

      {options.length > 0 && (
        <div className="cp-decide">
          <label className="cd-field">
            <span>Feedback {options.includes('Rejected') ? '(required to reject)' : '(optional)'}</span>
            <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Available Tuesday 3 pm, or why this profile is not a fit" />
          </label>
          <div className="cp-decide-buttons">
            {options.map((decision) => (
              <button
                key={decision}
                type="button"
                className={`cp-btn cp-btn-${decision === 'Rejected' ? 'reject' : decision === 'Selected' ? 'select' : 'interview'}`}
                disabled={busy !== null}
                onClick={() => void decide(decision)}
              >
                {busy === decision ? 'Saving…' : DECISION_LABEL[decision]}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}

      <button type="button" className="cd-link cp-activity-toggle" onClick={() => setShowActivity((value) => !value)}>
        {showActivity ? 'Hide activity' : 'Show activity'}
      </button>
      {showActivity && <ActivityLog token={token} submissionId={item.id} version={`${item.status}-${item.updated_at}`} />}
    </article>
  )
}

export function ClientCandidatesPage({
  token,
  jobs,
  submissions,
  loading,
  initialTab = 'review',
  initialJobId = null,
  onReload,
  onViewJD,
}: {
  token: string | null
  jobs: Job[]
  submissions: CandidateSubmission[]
  loading: boolean
  initialTab?: ClientTab
  initialJobId?: number | null
  onReload: () => Promise<void>
  onViewJD: (jobId: number) => void
}) {
  const [tab, setTab] = useState<ClientTab>(initialTab)
  const [jobId, setJobId] = useState<string>(initialJobId != null ? String(initialJobId) : 'all')
  const [banner, setBanner] = useState<string | null>(null)

  const forJob = submissions.filter((item) => jobId === 'all' || String(item.job_id) === jobId)
  const inTab = (key: ClientTab) => (key === 'all' ? forJob : forJob.filter((item) => TAB_STATUSES[key].includes(item.status)))
  const visible = inTab(tab)
  const jobOptions = jobs.filter((job) => submissions.some((item) => item.job_id === job.id))

  return (
    <>
      <header className="page-header" id="candidates">
        <h1>Candidates</h1>
        <p>Review the candidates sent to you and tell us how to proceed.</p>
      </header>
      {banner && <p className="success-message" role="status">{banner}</p>}
      <section className="welcome-card jobs-card cd-card cp-card pr-page">
        <div className="cp-toolbar">
          <div className="cp-tabs" role="tablist" aria-label="Candidate status">
            {(['review', 'interview', 'selected', 'closed', 'all'] as ClientTab[]).map((key) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
                {TAB_LABEL[key]} <span>{inTab(key).length}</span>
              </button>
            ))}
          </div>
          <select aria-label="Filter by position" value={jobId} onChange={(event) => setJobId(event.target.value)}>
            <option value="all">All positions</option>
            {jobOptions.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
          </select>
        </div>

        {!loading && visible.length === 0 ? (
          <div className="cd-empty">
            <strong>{tab === 'review' ? 'Nothing is waiting for your review.' : 'No candidates here.'}</strong>
            <p>{submissions.length === 0 ? 'Candidates appear here once your recruitment partner sends them to you.' : 'Try another tab or position.'}</p>
          </div>
        ) : (
          visible.map((item) => (
            <CandidateCard
              key={item.id}
              token={token}
              item={item}
              onViewJD={() => onViewJD(item.job_id)}
              onDecided={async (message) => {
                await onReload()
                setBanner(message)
              }}
            />
          ))
        )}
      </section>
    </>
  )
}
