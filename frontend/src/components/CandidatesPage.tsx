import { useEffect, useMemo, useState } from 'react'
import {
  fetchSubmissionResume,
  getSubmissionHistory,
  parseResume,
  uploadSubmissionResume,
  type ResumeFields,
  submitCandidate,
  updateSubmissionStatus,
  type CandidatePermissions,
  type CandidateSubmission,
  type Client,
  type Job,
  type SubmissionHistoryEntry,
} from '../api/client'
import {
  DROPPED_STATUSES,
  IN_PROCESS_STATUSES,
  PLACED_STATUSES,
  STAGE_ORDER,
  formatDate,
  formatDateTime,
} from '../dashboardStats'

// Filters other pages can pre-set (e.g. "Candidates (3)" on a client, vendor or job row).
export type CandidateFilters = {
  clientId?: number | null
  vendorId?: number | 'internal' | null
  jobId?: number | null
  status?: string
  // Open the submit form straight away (e.g. "Submit candidate" on a requirement).
  openSubmit?: boolean
}

type Props = {
  token: string | null
  submissions: CandidateSubmission[]
  jobs: Job[]
  clients: Client[]
  loading: boolean
  permissions: CandidatePermissions
  initialFilters?: CandidateFilters
  loadError?: string | null
  onReload: () => Promise<void>
  onOpenJob: (jobId: number) => void
}

type Banner = { kind: 'success' | 'error'; text: string } | null

const PAGE_SIZE = 12

function groupOf(status: string): 'inprocess' | 'placed' | 'dropped' {
  if (PLACED_STATUSES.includes(status)) return 'placed'
  if (DROPPED_STATUSES.includes(status)) return 'dropped'
  return 'inprocess'
}

function matchesStatus(status: string, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'group:inprocess') return IN_PROCESS_STATUSES.includes(status)
  if (filter === 'group:placed') return PLACED_STATUSES.includes(status)
  if (filter === 'group:dropped') return DROPPED_STATUSES.includes(status)
  return status === filter
}

function CandidateStatusBadge({ status }: { status: string }) {
  return <span className={`cd-badge cd-badge-${groupOf(status)}`}>{status}</span>
}

const isLink = (value: string) => /^https?:\/\//i.test(value)

// ---------------------------------------------------------------------------
// Submit candidate
// ---------------------------------------------------------------------------

type SubmitForm = {
  job_id: string
  full_name: string
  email: string
  phone: string
  total_experience: string
  relevant_experience: string
  current_employer: string
  current_location: string
  highest_qualification: string
  primary_skills: string
  resume_filename: string
  notes: string
}

const RESUME_FIELDS: Array<keyof ResumeFields & keyof SubmitForm> = [
  'full_name', 'email', 'phone', 'total_experience', 'relevant_experience',
  'current_employer', 'current_location', 'highest_qualification', 'primary_skills',
]

function numberOrNull(value: string): number | null | 'invalid' {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 'invalid'
}

function SubmitCandidateModal({
  token,
  jobs,
  showClients,
  clientNameOf,
  submittingAs,
  defaultJobId,
  onClose,
  onSubmitted,
}: {
  token: string | null
  jobs: Job[]
  showClients: boolean
  clientNameOf: (clientId: number | null | undefined) => string
  submittingAs: string
  defaultJobId: number | null
  onClose: () => void
  // warning = the candidate was submitted but the resume file could not be attached
  onSubmitted: (created: CandidateSubmission, warning: string | null) => Promise<void>
}) {
  const [form, setForm] = useState<SubmitForm>({
    job_id: defaultJobId && jobs.some((job) => job.id === defaultJobId) ? String(defaultJobId) : '',
    full_name: '',
    email: '',
    phone: '',
    total_experience: '',
    relevant_experience: '',
    current_employer: '',
    current_location: '',
    highest_qualification: '',
    primary_skills: '',
    resume_filename: '',
    notes: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const [autoFilled, setAutoFilled] = useState<Set<keyof SubmitForm>>(new Set())
  const [resumeNote, setResumeNote] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null)

  const selectedJob = jobs.find((job) => String(job.id) === form.job_id)
  const set = (key: keyof SubmitForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.target.value
    setForm((current) => ({ ...current, [key]: value }))
    // once edited by hand, a value is no longer "from resume"
    setAutoFilled((current) => {
      if (!current.has(key)) return current
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }
  const fromResume = (key: keyof SubmitForm) => (autoFilled.has(key) ? <em className="rs-tag">from resume</em> : null)

  async function handleResume(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!token) return setResumeNote({ kind: 'error', text: 'Your session has expired. Please sign in again.' })
    setResumeNote(null)
    setReading(true)
    try {
      const result = await parseResume(token, file)
      const next = { ...form }
      const filled = new Set<keyof SubmitForm>()
      for (const key of RESUME_FIELDS) {
        const value = result.fields[key]
        const typedByHand = form[key].trim() !== '' && !autoFilled.has(key)
        if (value === null || value === undefined || value === '' || typedByHand) {
          // a value left over from an earlier resume is cleared rather than kept
          if (autoFilled.has(key)) next[key] = ''
          continue
        }
        next[key] = String(value)
        filled.add(key)
      }
      setForm(next)
      setAutoFilled(filled)
      setResumeFile(file)
      setResumeNote(
        filled.size > 0
          ? { kind: 'ok', text: `Filled ${filled.size} field${filled.size === 1 ? '' : 's'} from ${file.name}. Please check them before submitting.` }
          : { kind: 'warn', text: `No details could be read from ${file.name}. Fill in the form below; the resume will still be attached.` },
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to read this resume.'
      if (message.startsWith('Unable to read text')) {
        // a valid file we could not read (e.g. a scan): still attach it
        setResumeFile(file)
        setResumeNote({ kind: 'warn', text: `${message}` })
      } else {
        setResumeNote({ kind: 'error', text: message })
      }
    } finally {
      setReading(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!token) return setError('Your session has expired. Please sign in again.')
    if (!form.job_id) return setError('Choose the job this candidate is being submitted for.')
    if (!form.full_name.trim()) return setError('Enter the candidate’s full name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('Enter a valid email address.')
    const total = numberOrNull(form.total_experience)
    const relevant = numberOrNull(form.relevant_experience)
    if (total === 'invalid' || relevant === 'invalid') return setError('Experience must be a number of years (0 or more).')

    const text = (value: string) => (value.trim() === '' ? null : value.trim())
    setSaving(true)
    try {
      const created = await submitCandidate(token, {
        job_id: Number(form.job_id),
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: text(form.phone),
        total_experience: total,
        relevant_experience: relevant,
        current_employer: text(form.current_employer),
        current_location: text(form.current_location),
        highest_qualification: text(form.highest_qualification),
        primary_skills: text(form.primary_skills),
        resume_filename: text(form.resume_filename),
        notes: text(form.notes),
      })
      let warning: string | null = null
      if (resumeFile) {
        try {
          await uploadSubmissionResume(token, created.id, resumeFile)
        } catch (err) {
          warning = err instanceof Error ? err.message : 'The resume could not be attached.'
        }
      }
      await onSubmitted(created, warning)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit the candidate.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="job-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="job-details-modal cd-submit-modal" role="dialog" aria-modal="true" aria-labelledby="cd-submit-title" onSubmit={handleSubmit}>
        <div className="cd-modal-head">
          <div>
            <h2 id="cd-submit-title">Submit Candidate</h2>
            <p>{submittingAs}</p>
          </div>
          <button type="button" className="job-modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        {jobs.length === 0 ? (
          <p className="cd-empty-note">
            There are no open jobs available to you yet. Candidates can only be submitted to open jobs
            that are assigned to you.
          </p>
        ) : (
          <>
            <div className="cd-form-grid">
              <div className="cd-field-wide rs-upload">
                <div className="rs-upload-text">
                  <strong>Resume</strong>
                  <small>{resumeFile ? resumeFile.name : 'PDF or DOCX, up to 10 MB. Details below are filled in from it.'}</small>
                </div>
                <div className="rs-upload-actions">
                  {resumeFile && !reading && (
                    <button type="button" className="rs-remove" onClick={() => { setResumeFile(null); setResumeNote(null) }}>Remove</button>
                  )}
                  <label className={`rs-pick${reading ? ' rs-busy' : ''}`}>
                    {reading ? 'Reading resume…' : resumeFile ? 'Replace' : 'Upload resume'}
                    <input
                      type="file"
                      hidden
                      aria-label="Upload resume"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(event) => void handleResume(event)}
                      disabled={reading || saving}
                    />
                  </label>
                </div>
                {resumeNote && <p className={`rs-note rs-note-${resumeNote.kind}`} role={resumeNote.kind === 'error' ? 'alert' : 'status'}>{resumeNote.text}</p>}
              </div>

              <label className="cd-field cd-field-wide">
                <span>Job *</span>
                <select value={form.job_id} onChange={set('job_id')} required>
                  <option value="">Select a job…</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {showClients ? `${job.title} — ${clientNameOf(job.client_id)}` : job.title}
                    </option>
                  ))}
                </select>
                {selectedJob && showClients && <small>Client: <strong>{clientNameOf(selectedJob.client_id)}</strong></small>}
              </label>

              <label className="cd-field"><span>Full name *{fromResume('full_name')}</span><input value={form.full_name} onChange={set('full_name')} className={autoFilled.has('full_name') ? 'rs-filled' : undefined} maxLength={200} required /></label>
              <label className="cd-field"><span>Email *{fromResume('email')}</span><input type="email" value={form.email} onChange={set('email')} className={autoFilled.has('email') ? 'rs-filled' : undefined} maxLength={320} required /></label>
              <label className="cd-field"><span>Phone{fromResume('phone')}</span><input value={form.phone} onChange={set('phone')} className={autoFilled.has('phone') ? 'rs-filled' : undefined} maxLength={30} /></label>
              <label className="cd-field"><span>Current location{fromResume('current_location')}</span><input value={form.current_location} onChange={set('current_location')} className={autoFilled.has('current_location') ? 'rs-filled' : undefined} maxLength={200} /></label>
              <label className="cd-field"><span>Total experience (years){fromResume('total_experience')}</span><input type="number" min="0" step="0.1" value={form.total_experience} onChange={set('total_experience')} className={autoFilled.has('total_experience') ? 'rs-filled' : undefined} /></label>
              <label className="cd-field"><span>Relevant experience (years){fromResume('relevant_experience')}</span><input type="number" min="0" step="0.1" value={form.relevant_experience} onChange={set('relevant_experience')} className={autoFilled.has('relevant_experience') ? 'rs-filled' : undefined} /></label>
              <label className="cd-field"><span>Current employer{fromResume('current_employer')}</span><input value={form.current_employer} onChange={set('current_employer')} className={autoFilled.has('current_employer') ? 'rs-filled' : undefined} maxLength={200} /></label>
              <label className="cd-field"><span>Highest qualification{fromResume('highest_qualification')}</span><input value={form.highest_qualification} onChange={set('highest_qualification')} className={autoFilled.has('highest_qualification') ? 'rs-filled' : undefined} maxLength={300} /></label>
              <label className="cd-field cd-field-wide"><span>Primary skills{fromResume('primary_skills')}</span><textarea rows={2} value={form.primary_skills} onChange={set('primary_skills')} className={autoFilled.has('primary_skills') ? 'rs-filled' : undefined} placeholder="e.g. Oracle PLM, SQL, Python" /></label>
              {!resumeFile && (
                <label className="cd-field cd-field-wide">
                  <span>Resume link (optional)</span>
                  <input value={form.resume_filename} onChange={set('resume_filename')} maxLength={500} placeholder="https://…" />
                  <small>No file? Paste a shared link to the resume instead.</small>
                </label>
              )}
              <label className="cd-field cd-field-wide"><span>Notes for the recruiter</span><textarea rows={2} value={form.notes} onChange={set('notes')} /></label>
            </div>
            <p className="cd-hint">If this email already exists, the existing candidate profile is reused. A candidate can only be submitted once per job.</p>
          </>
        )}

        {error && <p className="error-message" role="alert">{error}</p>}

        <div className="cd-modal-actions">
          <button type="button" className="cd-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving || jobs.length === 0}>{saving ? 'Submitting…' : 'Submit candidate'}</button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail drawer
// ---------------------------------------------------------------------------

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cd-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function ResumeFact({
  token,
  submission,
  canAttach,
  onChanged,
}: {
  token: string | null
  submission: CandidateSubmission
  canAttach: boolean
  onChanged: (message: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileName = submission.resume_file_name

  async function openFile(download: boolean) {
    if (!token || !fileName) return
    setError(null)
    const isPdf = fileName.toLowerCase().endsWith('.pdf')
    const tab = !download && isPdf ? window.open('', '_blank') : null   // open now so popup blockers allow it
    try {
      const blob = await fetchSubmissionResume(token, submission.id)
      const url = URL.createObjectURL(blob)
      if (tab) {
        tab.location.href = url
      } else {
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
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

  async function attach(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !token) return
    setBusy(true)
    setError(null)
    try {
      await uploadSubmissionResume(token, submission.id, file)
      await onChanged(`Resume attached for ${submission.candidate_name}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to attach the resume.')
    } finally {
      setBusy(false)
    }
  }

  const picker = (label: string) => (
    <label className="cd-link rs-inline-pick">
      {busy ? 'Uploading…' : label}
      <input type="file" hidden aria-label={label} accept=".pdf,.docx" onChange={(event) => void attach(event)} disabled={busy} />
    </label>
  )

  return (
    <>
      {fileName ? (
        <>
          <span className="rs-file-name" title={fileName}>{fileName}</span>
          <span className="rs-actions">
            <button type="button" className="cd-link" onClick={() => void openFile(false)}>Open</button>
            <button type="button" className="cd-link" onClick={() => void openFile(true)}>Download</button>
            {canAttach && picker('Replace')}
          </span>
        </>
      ) : (
        <>
          {!submission.resume_filename ? 'No file attached' : isLink(submission.resume_filename) ? (
            <a href={submission.resume_filename} target="_blank" rel="noopener noreferrer">Open resume link</a>
          ) : submission.resume_filename}
          {canAttach && <span className="rs-actions">{picker('Attach resume file')}</span>}
        </>
      )}
      {error && <small className="rs-error" role="alert">{error}</small>}
    </>
  )
}

function SubmissionDrawer({
  token,
  submission,
  permissions,
  showClients,
  onClose,
  onOpenJob,
  onFilterClient,
  onFilterVendor,
  onChanged,
}: {
  token: string | null
  submission: CandidateSubmission
  permissions: CandidatePermissions
  showClients: boolean
  onClose: () => void
  onOpenJob: (jobId: number) => void
  onFilterClient: (clientId: number) => void
  onFilterVendor: (vendorId: number | 'internal') => void
  onChanged: (message: string) => Promise<void>
}) {
  const [history, setHistory] = useState<SubmissionHistoryEntry[] | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [newStatus, setNewStatus] = useState(submission.status)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getSubmissionHistory(token, submission.id)
      .then((entries) => {
        if (!cancelled) setHistory(entries)
      })
      .catch((err) => {
        if (!cancelled) setHistoryError(err instanceof Error ? err.message : 'Unable to load the status history.')
      })
    return () => {
      cancelled = true
    }
  }, [token, submission.id, historyVersion])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleStatusUpdate(event: React.FormEvent) {
    event.preventDefault()
    if (!token || newStatus === submission.status) return
    setError(null)
    setSaving(true)
    try {
      await updateSubmissionStatus(token, submission.id, newStatus, note.trim() || null)
      setNote('')
      setHistory(null)
      setHistoryVersion((version) => version + 1)
      await onChanged(`${submission.candidate_name} moved to “${newStatus}”.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the status.')
    } finally {
      setSaving(false)
    }
  }

  const skills = (submission.primary_skills ?? '').split(/[,;\n]/).map((skill) => skill.trim()).filter(Boolean)
  const experience = (value?: number | null) => (value == null ? 'Not provided' : `${value} yrs`)

  return (
    <div className="cd-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="cd-drawer" role="dialog" aria-modal="true" aria-labelledby="cd-drawer-title">
        <div className="cd-drawer-head">
          <div>
            <h2 id="cd-drawer-title">{submission.candidate_name}</h2>
            <a href={`mailto:${submission.candidate_email}`}>{submission.candidate_email}</a>
          </div>
          <button type="button" className="job-modal-close" aria-label="Close candidate details" onClick={onClose}>×</button>
        </div>

        <div className="cd-drawer-status"><CandidateStatusBadge status={submission.status} /></div>

        <section className="cd-drawer-section">
          <h3>Submission</h3>
          <dl className="cd-facts">
            <Fact label="Job">
              <button type="button" className="cd-link" onClick={() => onOpenJob(submission.job_id)}>{submission.job_title}</button>
            </Fact>
            {showClients && <Fact label="Client">
              {submission.client_id != null ? (
                <button type="button" className="cd-link" onClick={() => onFilterClient(submission.client_id as number)}>
                  {submission.client_name ?? `Client #${submission.client_id}`}
                </button>
              ) : 'Not linked'}
            </Fact>}
            <Fact label="Vendor">
              {permissions.is_vendor_user ? (
                submission.vendor_name ?? 'Your vendor'
              ) : (
                <button type="button" className="cd-link" onClick={() => onFilterVendor(submission.vendor_id ?? 'internal')}>
                  {submission.vendor_id == null ? 'Internal (direct)' : submission.vendor_name ?? `Vendor #${submission.vendor_id}`}
                </button>
              )}
            </Fact>
            <Fact label="Submitted">{formatDate(submission.created_at)}</Fact>
            <Fact label="Last updated">{formatDate(submission.updated_at)}</Fact>
          </dl>
          {submission.notes && <p className="cd-notes"><strong>Notes:</strong> {submission.notes}</p>}
        </section>

        <section className="cd-drawer-section">
          <h3>Candidate profile</h3>
          <dl className="cd-facts">
            <Fact label="Phone">{submission.phone ? <a href={`tel:${submission.phone}`}>{submission.phone}</a> : 'Not provided'}</Fact>
            <Fact label="Current location">{submission.current_location || 'Not provided'}</Fact>
            <Fact label="Total experience">{experience(submission.total_experience)}</Fact>
            <Fact label="Relevant experience">{experience(submission.relevant_experience)}</Fact>
            <Fact label="Current employer">{submission.current_employer || 'Not provided'}</Fact>
            <Fact label="Qualification">{submission.highest_qualification || 'Not provided'}</Fact>
            <Fact label="Resume">
              <ResumeFact token={token} submission={submission} canAttach={permissions.can_submit} onChanged={onChanged} />
            </Fact>
          </dl>
          {skills.length > 0 && (
            <div className="cd-skills" aria-label="Primary skills">
              {skills.map((skill, index) => <span key={`${skill}-${index}`} className="jd-chip">{skill}</span>)}
            </div>
          )}
        </section>

        <section className="cd-drawer-section">
          <h3>Status</h3>
          {permissions.can_update_status ? (
            <form className="cd-status-form" onSubmit={handleStatusUpdate}>
              <label className="cd-field">
                <span>Move to</span>
                <select value={newStatus} onChange={(event) => setNewStatus(event.target.value)}>
                  {STAGE_ORDER.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label className="cd-field">
                <span>Note (optional)</span>
                <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Client liked the profile" />
              </label>
              <button type="submit" disabled={saving || newStatus === submission.status}>{saving ? 'Updating…' : 'Update status'}</button>
              {error && <p className="error-message" role="alert">{error}</p>}
            </form>
          ) : (
            <p className="cd-hint">Only the recruitment team can change a submission’s status.</p>
          )}
        </section>

        <section className="cd-drawer-section">
          <h3>Status history</h3>
          {historyError ? (
            <p className="error-message" role="alert">{historyError}</p>
          ) : history === null ? (
            <p className="cd-hint">Loading history…</p>
          ) : (
            <ol className="cd-timeline">
              {history.map((entry) => (
                <li key={entry.id}>
                  <div className="cd-timeline-title">
                    {entry.old_status ? <>{entry.old_status} → <strong>{entry.new_status}</strong></> : <strong>{entry.new_status}</strong>}
                  </div>
                  <div className="cd-timeline-meta">
                    {formatDateTime(entry.changed_at)} · {entry.changed_by_email ?? `User #${entry.changed_by_user_id}`}
                  </div>
                  {entry.note && <div className="cd-timeline-note">{entry.note}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export default function CandidatesPage({
  token,
  submissions,
  jobs,
  clients,
  loading,
  permissions,
  initialFilters,
  loadError,
  onReload,
  onOpenJob,
}: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(initialFilters?.status ?? 'all')
  const [clientFilter, setClientFilter] = useState(initialFilters?.clientId != null ? String(initialFilters.clientId) : 'all')
  const [vendorFilter, setVendorFilter] = useState(initialFilters?.vendorId != null ? String(initialFilters.vendorId) : 'all')
  const [jobFilter, setJobFilter] = useState(initialFilters?.jobId != null ? String(initialFilters.jobId) : 'all')
  const [pageNumber, setPageNumber] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showSubmit, setShowSubmit] = useState(Boolean(initialFilters?.openSubmit && permissions.can_submit))
  // Partners may not be allowed to know which client a job is for.
  const showClients = !permissions.is_vendor_user || permissions.can_see_clients !== false
  const [banner, setBanner] = useState<Banner>(null)

  const clientNameOf = (clientId: number | null | undefined): string => {
    if (clientId == null) return 'No client linked'
    return (
      clients.find((client) => client.id === clientId)?.company_name ??
      jobs.find((job) => job.client_id === clientId && job.client_name)?.client_name ??
      submissions.find((item) => item.client_id === clientId && item.client_name)?.client_name ??
      `Client #${clientId}`
    )
  }

  // Filter choices come from the data itself, so they work for every role
  // (vendors and recruiters cannot list all clients/vendors).
  const clientOptions = useMemo(() => {
    const seen = new Map<number, string>()
    for (const item of submissions) if (item.client_id != null) seen.set(item.client_id, item.client_name ?? `Client #${item.client_id}`)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [submissions])
  const vendorOptions = useMemo(() => {
    const seen = new Map<number, string>()
    for (const item of submissions) if (item.vendor_id != null) seen.set(item.vendor_id, item.vendor_name ?? `Vendor #${item.vendor_id}`)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [submissions])
  const hasInternal = submissions.some((item) => item.vendor_id == null)
  const jobOptions = useMemo(() => {
    const seen = new Map<number, string>()
    for (const item of submissions) seen.set(item.job_id, item.job_title)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [submissions])

  const query = search.trim().toLowerCase()
  const beforeStatus = submissions.filter((item) => {
    if (clientFilter !== 'all' && String(item.client_id) !== clientFilter) return false
    if (vendorFilter === 'internal' ? item.vendor_id != null : vendorFilter !== 'all' && String(item.vendor_id) !== vendorFilter) return false
    if (jobFilter !== 'all' && String(item.job_id) !== jobFilter) return false
    if (!query) return true
    return [item.candidate_name, item.candidate_email, item.job_title, item.client_name, item.vendor_name, item.primary_skills, item.current_employer, item.current_location]
      .some((value) => String(value ?? '').toLowerCase().includes(query))
  })
  const filtered = beforeStatus.filter((item) => matchesStatus(item.status, statusFilter))

  const counts = {
    all: beforeStatus.length,
    inprocess: beforeStatus.filter((item) => IN_PROCESS_STATUSES.includes(item.status)).length,
    placed: beforeStatus.filter((item) => PLACED_STATUSES.includes(item.status)).length,
    dropped: beforeStatus.filter((item) => DROPPED_STATUSES.includes(item.status)).length,
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(pageNumber, totalPages)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const filtersActive = Boolean(query) || statusFilter !== 'all' || clientFilter !== 'all' || vendorFilter !== 'all' || jobFilter !== 'all'

  const selected = submissions.find((item) => item.id === selectedId) ?? null
  const openJobs = jobs.filter((job) => job.status === 'open')
  const vendorName = submissions.find((item) => item.vendor_name)?.vendor_name
  const submittingAs = permissions.is_vendor_user
    ? `Submitting as ${vendorName ?? 'your vendor'} (set by your account)`
    : 'Internal submission — not linked to a vendor'

  function changeFilter<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPageNumber(1)
    }
  }
  const setStatus = changeFilter(setStatusFilter)
  const setClient = changeFilter(setClientFilter)
  const setVendor = changeFilter(setVendorFilter)
  const setJob = changeFilter(setJobFilter)

  function clearFilters() {
    setSearch('')
    setStatusFilter('all')
    setClientFilter('all')
    setVendorFilter('all')
    setJobFilter('all')
    setPageNumber(1)
  }

  async function handleReload() {
    setBanner(null)
    try {
      await onReload()
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Unable to refresh candidates.' })
    }
  }

  const tiles: Array<{ key: string; label: string; value: number; filter: string }> = [
    { key: 'all', label: 'Total submissions', value: counts.all, filter: 'all' },
    { key: 'inprocess', label: 'In process', value: counts.inprocess, filter: 'group:inprocess' },
    { key: 'placed', label: 'Placed', value: counts.placed, filter: 'group:placed' },
    { key: 'dropped', label: 'Dropped', value: counts.dropped, filter: 'group:dropped' },
  ]

  return (
    <>
      <header className="page-header" id="candidates">
        <h1>{permissions.is_vendor_user ? 'My Submissions' : 'Candidates'}</h1>
        <p>
          {permissions.is_vendor_user
            ? 'Candidates your vendor has submitted, and where they stand.'
            : 'Candidate submissions across jobs, clients and vendors.'}
        </p>
      </header>

      {loadError && !banner && <p className="error-message" role="alert">{loadError}</p>}

      {banner && (
        <p className={banner.kind === 'error' ? 'error-message' : 'success-message'} role={banner.kind === 'error' ? 'alert' : 'status'}>
          {banner.text}
        </p>
      )}

      <section className="welcome-card jobs-card cd-card">
        <div className="jobs-heading">
          <div>
            <h2>Candidate Submissions</h2>
            <p>{loading ? 'Loading candidates…' : `${filtered.length} of ${submissions.length} submission(s)`}</p>
          </div>
          <div className="jobs-actions">
            {permissions.can_submit && (
              <button type="button" onClick={() => { setBanner(null); setShowSubmit(true) }}>+ Submit Candidate</button>
            )}
            <button type="button" onClick={() => void handleReload()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </div>

        <div className="cd-tiles" role="group" aria-label="Filter by pipeline stage">
          {tiles.map((tile) => (
            <button
              key={tile.key}
              type="button"
              className={`cd-tile cd-tile-${tile.key}${statusFilter === tile.filter ? ' active' : ''}`}
              aria-pressed={statusFilter === tile.filter}
              onClick={() => setStatus(tile.filter)}
            >
              <span>{tile.label}</span>
              <strong>{tile.value}</strong>
            </button>
          ))}
        </div>

        <div className="cd-filters">
          <input
            type="search"
            className="jobs-search-input"
            placeholder={showClients ? 'Search candidate, email, job, client, vendor or skill…' : 'Search candidate, email, job or skill…'}
            aria-label="Search candidates"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPageNumber(1) }}
          />
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="group:inprocess">In process (all)</option>
            <option value="group:placed">Placed (all)</option>
            <option value="group:dropped">Dropped (all)</option>
            {STAGE_ORDER.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          {showClients && (
            <select aria-label="Filter by client" value={clientFilter} onChange={(event) => setClient(event.target.value)}>
              <option value="all">All clients</option>
              {clientOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          {!permissions.is_vendor_user && (
            <select aria-label="Filter by vendor" value={vendorFilter} onChange={(event) => setVendor(event.target.value)}>
              <option value="all">All vendors</option>
              {hasInternal && <option value="internal">Internal (direct)</option>}
              {vendorOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          <select aria-label="Filter by job" value={jobFilter} onChange={(event) => setJob(event.target.value)}>
            <option value="all">All jobs</option>
            {jobOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
          {filtersActive && <button type="button" className="jobs-search-clear" onClick={clearFilters}>Clear filters</button>}
        </div>

        {!loading && submissions.length === 0 ? (
          <div className="cd-empty">
            <strong>{permissions.is_vendor_user ? 'You haven’t submitted any candidates yet.' : 'No candidates have been submitted yet.'}</strong>
            <p>{permissions.can_submit ? 'Use “Submit Candidate” to add the first one.' : 'Submissions from vendors will appear here.'}</p>
          </div>
        ) : !loading && filtered.length === 0 ? (
          <div className="cd-empty">
            <strong>No candidates match these filters.</strong>
            <button type="button" className="jobs-search-clear" onClick={clearFilters}>Clear filters</button>
          </div>
        ) : (
          <div className="jobs-table-wrapper">
            <table className="jobs-table cd-table">
              <thead>
                <tr>
                  <th className="sno-col">S.No</th>
                  <th>Candidate</th>
                  <th>Job</th>
                  {showClients && <th>Client</th>}
                  {!permissions.is_vendor_user && <th>Vendor</th>}
                  <th>Status</th>
                  <th>Submitted</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item, index) => (
                  <tr key={item.id}>
                    <td className="sno-col">{(currentPage - 1) * PAGE_SIZE + index + 1}</td>
                    <td>
                      <strong>{item.candidate_name}</strong>
                      <span className="job-id">{item.candidate_email}</span>
                    </td>
                    <td>
                      <button type="button" className="cd-link" onClick={() => onOpenJob(item.job_id)} aria-label={`View JD for ${item.job_title}`}>
                        {item.job_title}
                      </button>
                    </td>
                    {showClients && <td>
                      {item.client_id != null ? (
                        <button type="button" className="cd-link" onClick={() => setClient(String(item.client_id))} title="Show only this client’s candidates">
                          {item.client_name ?? `Client #${item.client_id}`}
                        </button>
                      ) : <span className="cd-muted">Not linked</span>}
                    </td>}
                    {!permissions.is_vendor_user && (
                      <td>
                        <button type="button" className="cd-link" onClick={() => setVendor(item.vendor_id == null ? 'internal' : String(item.vendor_id))} title="Show only this vendor’s candidates">
                          {item.vendor_id == null ? 'Internal (direct)' : item.vendor_name ?? `Vendor #${item.vendor_id}`}
                        </button>
                      </td>
                    )}
                    <td><CandidateStatusBadge status={item.status} /></td>
                    <td>{formatDate(item.created_at)}</td>
                    <td>
                      <button type="button" className="cd-view" onClick={() => setSelectedId(item.id)} aria-label={`View details for ${item.candidate_name}`}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav className="cd-pager" aria-label="Candidate pages">
            <button type="button" disabled={currentPage === 1} onClick={() => setPageNumber(currentPage - 1)}>‹ Previous</button>
            <span>Page {currentPage} of {totalPages}</span>
            <button type="button" disabled={currentPage === totalPages} onClick={() => setPageNumber(currentPage + 1)}>Next ›</button>
          </nav>
        )}
      </section>

      {selected && (
        <SubmissionDrawer
          key={selected.id}
          token={token}
          submission={selected}
          permissions={permissions}
          showClients={showClients}
          onClose={() => setSelectedId(null)}
          onOpenJob={onOpenJob}
          onFilterClient={(clientId) => { setClient(String(clientId)); setSelectedId(null) }}
          onFilterVendor={(vendorId) => { setVendor(String(vendorId)); setSelectedId(null) }}
          onChanged={async (message) => {
            await onReload()
            setBanner({ kind: 'success', text: message })
          }}
        />
      )}

      {showSubmit && (
        <SubmitCandidateModal
          token={token}
          jobs={openJobs}
          showClients={showClients}
          clientNameOf={clientNameOf}
          submittingAs={submittingAs}
          defaultJobId={jobFilter !== 'all' ? Number(jobFilter) : null}
          onClose={() => setShowSubmit(false)}
          onSubmitted={async (created, warning) => {
            setShowSubmit(false)
            await onReload()
            setBanner(
              warning
                ? { kind: 'error', text: `${created.candidate_name} was submitted for ${created.job_title}, but the resume was not attached: ${warning} Open the candidate to attach it again.` }
                : { kind: 'success', text: `${created.candidate_name} was submitted for ${created.job_title}.` },
            )
          }}
        />
      )}
    </>
  )
}
