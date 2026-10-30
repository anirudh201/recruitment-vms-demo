import { useState } from 'react'
import type { CandidateSubmission, Job } from '../api/client'

type Props = {
  jobs: Job[]
  submissions: CandidateSubmission[]
  loading: boolean
  canSeeClients: boolean
  canSubmit: boolean
  loadError?: string | null
  onViewJD: (job: Job) => void
  onSubmitFor: (jobId: number) => void
  onViewSubmissions: (jobId: number) => void
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function experience(job: Job): string | null {
  if (job.min_experience == null) return null
  return job.max_experience != null ? `${job.min_experience}-${job.max_experience} yrs` : `${job.min_experience}+ yrs`
}

function RequirementCard({
  job,
  mine,
  canSubmit,
  onViewJD,
  onSubmitFor,
  onViewSubmissions,
}: {
  job: Job
  mine: number
  canSubmit: boolean
  onViewJD: (job: Job) => void
  onSubmitFor: (jobId: number) => void
  onViewSubmissions: (jobId: number) => void
}) {
  const isOpen = job.status === 'open'
  const meta = [job.location, experience(job), job.work_arrangement, plural(job.openings, 'opening')].filter(Boolean).join(' · ')
  return (
    <article className={`pr-card${isOpen ? '' : ' pr-card-closed'}`}>
      <div className="pr-card-main">
        <h3>{job.title}</h3>
        <p>{meta}</p>
        {job.mandatory_skills && <p className="pr-skills">Key skills: {job.mandatory_skills.split(/\n/).join(', ')}</p>}
      </div>
      <div className="pr-card-side">
        {mine > 0 ? (
          <button type="button" className="pr-count" onClick={() => onViewSubmissions(job.id)}>
            {plural(mine, 'submission')} from you
          </button>
        ) : (
          <span className="pr-count pr-count-none">No submissions yet</span>
        )}
        <div className="pr-actions">
          <button type="button" className="pr-secondary" onClick={() => onViewJD(job)}>View JD</button>
          {isOpen && canSubmit && (
            <button type="button" onClick={() => onSubmitFor(job.id)} aria-label={`Submit candidate for ${job.title}`}>
              Submit candidate
            </button>
          )}
        </div>
        {!isOpen && <span className="pr-closed-note">Not open for submissions</span>}
      </div>
    </article>
  )
}

export default function PartnerRequirementsPage({
  jobs,
  submissions,
  loading,
  canSeeClients,
  canSubmit,
  loadError,
  onViewJD,
  onSubmitFor,
  onViewSubmissions,
}: Props) {
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const matches = (job: Job) =>
    !query ||
    [job.title, job.location, job.mandatory_skills, canSeeClients ? job.client_name : null]
      .some((value) => String(value ?? '').toLowerCase().includes(query))

  const open = jobs.filter((job) => job.status === 'open' && matches(job))
  const others = jobs.filter((job) => job.status !== 'open' && matches(job))
  const mineOn = (jobId: number) => submissions.filter((item) => item.job_id === jobId).length

  // Group open requirements by client only when this partner may know the client.
  const groups = new Map<string, Job[]>()
  for (const job of open) {
    const key = canSeeClients ? job.client_name ?? 'Other requirements' : 'Open requirements'
    groups.set(key, [...(groups.get(key) ?? []), job])
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const card = (job: Job) => (
    <RequirementCard
      key={job.id}
      job={job}
      mine={mineOn(job.id)}
      canSubmit={canSubmit}
      onViewJD={onViewJD}
      onSubmitFor={onSubmitFor}
      onViewSubmissions={onViewSubmissions}
    />
  )

  return (
    <>
      <header className="page-header" id="jobs">
        <h1>Assigned Requirements</h1>
        <p>Requirements your company has been asked to source candidates for.</p>
      </header>

      {loadError && <p className="error-message" role="alert">{loadError}</p>}

      <section className="welcome-card jobs-card pr-page">
        <div className="jobs-heading">
          <div>
            <h2>Your Requirements</h2>
            <p>{loading ? 'Loading requirements…' : `${plural(jobs.filter((job) => job.status === 'open').length, 'open requirement')}${canSeeClients ? '' : ' · client details are shared by your account manager'}`}</p>
          </div>
        </div>

        <input
          type="search"
          className="jobs-search-input pr-search"
          placeholder={canSeeClients ? 'Search by title, client, location or skill…' : 'Search by title, location or skill…'}
          aria-label="Search requirements"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {!loading && jobs.length === 0 ? (
          <div className="cd-empty">
            <strong>No requirements are assigned to your company yet.</strong>
            <p>Your account manager will assign requirements to you here.</p>
          </div>
        ) : !loading && open.length === 0 && others.length === 0 ? (
          <div className="cd-empty"><strong>No requirements match “{search}”.</strong></div>
        ) : (
          <>
            {sortedGroups.map(([group, groupJobs]) => (
              <div className="pr-group" key={group}>
                <h3 className="pr-group-title">{group} <span>{plural(groupJobs.length, 'requirement')}</span></h3>
                {groupJobs.map(card)}
              </div>
            ))}
            {others.length > 0 && (
              <details className="pr-group pr-others">
                <summary>Closed or on hold ({others.length})</summary>
                {others.map(card)}
              </details>
            )}
          </>
        )}
      </section>
    </>
  )
}
