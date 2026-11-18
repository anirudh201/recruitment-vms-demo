import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addTalentProfile,
  bulkUploadTalent,
  fetchTalentResume,
  getTalentSummary,
  parseResume,
  reindexTalent,
  searchTalent,
  uploadTalentResume,
  type BulkResult,
  type TalentCard,
  type TalentSearch,
  type TalentSearchResult,
  type TalentSummary,
} from '../api/client'
import { initials } from '../profileUtils'
import ResumePreview from './ResumePreview'

// TalentVault: DM&I's own resume bank (like a job portal's resume search, for our own database).

const PAGE_SIZES = [20, 40, 80]
const ACTIVE_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 3 months' },
  { value: '180', label: 'Last 6 months' },
  { value: '365', label: 'Last 1 year' },
]

type Filters = Required<Pick<TalentSearch, 'q' | 'match' | 'location' | 'min_exp' | 'max_exp' | 'employer' | 'qualification' | 'active_days' | 'sort'>> & { has_cv: boolean }

const EMPTY_FILTERS: Filters = {
  q: '', match: 'all', location: '', min_exp: '', max_exp: '', employer: '', qualification: '', active_days: '', sort: 'recent', has_cv: false,
}

function terms(q: string): string[] {
  return q.split(/[,;]+/).map((t) => t.trim()).filter(Boolean)
}

function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return <>{text.split(pattern).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))}</>
}

function experience(value: number | null): string {
  if (value === null || value === undefined) return 'Experience not given'
  if (value === 0) return 'Fresher'
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${value === 1 ? 'year' : 'years'}`
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days < 1) return 'today'
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? '' : 's'} ago`
  return `${Math.floor(days / 365)} year${days < 730 ? '' : 's'} ago`
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

const Icon = {
  bag: <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3Zm2-1v1h2V4H9Z" fill="currentColor" /></svg>,
  pin: <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5a6 6 0 0 1 6 6c0 4.4-6 11-6 11s-6-6.6-6-11a6 6 0 0 1 6-6Zm0 3.7a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6Z" fill="currentColor" /></svg>,
  clip: <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13.5 6.5 7.8 12.2a1.5 1.5 0 0 0 2.1 2.1l6-6a3 3 0 0 0-4.2-4.2l-6.4 6.4a4.5 4.5 0 0 0 6.4 6.4l5.3-5.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  phone: <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.6 2.5 8 5a1.5 1.5 0 0 1 0 2L6.9 8.2a10 10 0 0 0 4.9 4.9L13 12a1.5 1.5 0 0 1 2 0l2.5 2.4a1.5 1.5 0 0 1 0 2.1l-1.2 1.2c-.8.8-2 1-3 .6A16 16 0 0 1 1.7 6.7c-.4-1 0-2.2.6-3l1.2-1.2a1.5 1.5 0 0 1 2.1 0Z" fill="currentColor" /></svg>,
}

export default function TalentVaultPage({ token, canAdd }: { token: string; canAdd: boolean }) {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [result, setResult] = useState<TalentSearchResult | null>(null)
  const [summary, setSummary] = useState<TalentSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [shownPhones, setShownPhones] = useState<Set<number>>(new Set())
  const [modal, setModal] = useState<'add' | 'bulk' | null>(null)
  const [viewingCv, setViewingCv] = useState<TalentCard | null>(null)

  const words = useMemo(() => terms(filters.q), [filters.q])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    searchTalent(token, { ...filters, page, page_size: pageSize })
      .then((data) => {
        setResult(data)
        setSelected(new Set())
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to search TalentVault.'))
      .finally(() => setLoading(false))
    getTalentSummary(token).then(setSummary).catch(() => undefined)
  }, [token, filters, page, pageSize])

  useEffect(() => { load() }, [load])

  function runSearch(event?: React.FormEvent) {
    event?.preventDefault()
    setPage(1)
    setFilters({ ...draft })
  }

  function clearSearch() {
    setDraft(EMPTY_FILTERS)
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  const setField = (key: keyof Filters) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = event.target as HTMLInputElement
    setDraft((current) => ({ ...current, [key]: target.type === 'checkbox' ? target.checked : target.value }))
  }

  async function openResume(card: TalentCard) {
    if (!card.cv_kind || !card.cv_id) return
    const isPdf = (card.cv_name ?? '').toLowerCase().endsWith('.pdf')
    const tab = isPdf ? window.open('', '_blank') : null
    try {
      const blob = await fetchTalentResume(token, card)
      const url = URL.createObjectURL(blob)
      if (tab) tab.location.href = url
      else {
        const link = document.createElement('a')
        link.href = url
        link.download = card.cv_name ?? 'resume'
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

  const items = result?.items ?? []
  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id))

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))
  }
  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  async function copyEmails() {
    const emails = items.filter((item) => selected.has(item.id)).map((item) => item.email).join(', ')
    try {
      await navigator.clipboard.writeText(emails)
      setNotice(`Copied ${selected.size} email address${selected.size === 1 ? '' : 'es'}.`)
    } catch {
      setNotice(emails)
    }
  }
  async function reindex() {
    setNotice('Reading older resumes…')
    try {
      const done = await reindexTalent(token)
      setNotice(`${done.indexed} older resume${done.indexed === 1 ? ' is' : 's are'} now searchable.`)
      load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to read older resumes.')
    }
  }

  const pages = result?.pages ?? 1
  const unindexed = summary ? summary.profiles - summary.with_resume_text : 0

  return (
    <>
      <div className="page-header">
        <h1>TalentVault</h1>
        <p>DM&amp;I’s resume bank: every candidate you have submitted or added, searchable by skills, resume text, location and experience.</p>
      </div>

      <section className="welcome-card tv-card">
        <div className="tv-head">
          <div className="tv-tabs" role="tablist" aria-label="TalentVault">
            <span role="tab" aria-selected="true" className="tv-tab active">
              Profiles {summary ? summary.profiles.toLocaleString('en-IN') : ''}
            </span>
            {summary && summary.added_last_30_days > 0 && (
              <span className="tv-tab-note">{summary.added_last_30_days.toLocaleString('en-IN')} added in the last 30 days</span>
            )}
          </div>
          {canAdd && (
            <div className="tv-head-actions">
              <button type="button" onClick={() => setModal('add')}>+ Add resume</button>
              <button type="button" className="tv-secondary" onClick={() => setModal('bulk')}>Bulk upload</button>
            </div>
          )}
        </div>

        <form className="tv-search" onSubmit={runSearch} aria-label="Search TalentVault">
          <label className="tv-field tv-field-keywords">
            <span>Keywords</span>
            <input value={draft.q} onChange={setField('q')} placeholder="Skills, designation, company or anything in the resume. Separate with commas." />
          </label>
          <label className="tv-field">
            <span>Match</span>
            <select value={draft.match} onChange={setField('match')}>
              <option value="all">All keywords</option>
              <option value="any">Any keyword</option>
            </select>
          </label>
          <label className="tv-field"><span>Location</span><input value={draft.location} onChange={setField('location')} placeholder="e.g. Mumbai" /></label>
          <div className="tv-field tv-exp">
            <span>Experience (years)</span>
            <div>
              <input type="number" min="0" max="60" step="0.5" value={draft.min_exp} onChange={setField('min_exp')} placeholder="Min" aria-label="Minimum experience" />
              <em>to</em>
              <input type="number" min="0" max="60" step="0.5" value={draft.max_exp} onChange={setField('max_exp')} placeholder="Max" aria-label="Maximum experience" />
            </div>
          </div>
          <label className="tv-field"><span>Current employer</span><input value={draft.employer} onChange={setField('employer')} placeholder="e.g. Infosys" /></label>
          <label className="tv-field"><span>Qualification</span><input value={draft.qualification} onChange={setField('qualification')} placeholder="e.g. B.Tech, MBA" /></label>
          <label className="tv-field">
            <span>Active</span>
            <select value={draft.active_days} onChange={setField('active_days')}>
              {ACTIVE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="tv-field">
            <span>Sort by</span>
            <select value={draft.sort} onChange={setField('sort')}>
              <option value="recent">Recently updated</option>
              <option value="experience">Most experience</option>
              <option value="name">Name (A–Z)</option>
            </select>
          </label>
          <label className="tv-check"><input type="checkbox" checked={draft.has_cv} onChange={setField('has_cv')} /> Only with a resume file</label>
          <div className="tv-search-actions">
            <button type="submit">Search</button>
            <button type="button" className="tv-secondary" onClick={clearSearch}>Clear</button>
          </div>
        </form>

        {notice && <p className="tv-notice" role="status">{notice}</p>}
        {canAdd && unindexed > 0 && summary && summary.with_resume_text === 0 && (
          <p className="tv-notice">Older resumes are not searchable by their text yet. <button type="button" className="tv-link" onClick={() => void reindex()}>Make them searchable</button></p>
        )}

        <div className="tv-pager-row">
          <span className="tv-count">
            {loading ? 'Searching…' : result ? `${result.total.toLocaleString('en-IN')} profile${result.total === 1 ? '' : 's'} found` : ''}
          </span>
          <div className="tv-pager">
            <label>Show
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <button type="button" aria-label="First page" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
            <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
            <span className="tv-page">Page {result?.page ?? page} of {pages}</span>
            <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
            <button type="button" aria-label="Last page" disabled={page >= pages} onClick={() => setPage(pages)}>»</button>
          </div>
        </div>

        <div className="tv-toolbar">
          <label className="tv-check"><input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!items.length} /> Select all</label>
          <button type="button" className="tv-tool" disabled={!selected.size} onClick={() => void copyEmails()}>Copy emails{selected.size ? ` (${selected.size})` : ''}</button>
        </div>

        {error && <p className="error-message" role="alert">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="tv-empty">No profiles match this search. Try fewer keywords, choose “Any keyword”, or clear the filters.</p>
        )}

        <ol className="tv-list" aria-busy={loading}>
          {items.map((card) => (
            <li key={card.id}>
              <article className={`tv-profile${selected.has(card.id) ? ' tv-selected' : ''}`} aria-label={card.full_name}>
                <div className="tv-main">
                  <div className="tv-name-row">
                    <input type="checkbox" checked={selected.has(card.id)} onChange={() => toggle(card.id)} aria-label={`Select ${card.full_name}`} />
                    <h2><Highlight text={card.full_name} words={words} /></h2>
                  </div>
                  <p className="tv-meta">
                    <span>{Icon.bag}{experience(card.total_experience)}</span>
                    {card.current_location && <span>{Icon.pin}<Highlight text={card.current_location} words={words} /></span>}
                  </p>
                  <dl className="tv-rows">
                    {card.current_employer && <><dt>Current</dt><dd><Highlight text={card.current_employer} words={words} /></dd></>}
                    {card.highest_qualification && <><dt>Education</dt><dd><Highlight text={card.highest_qualification} words={words} /></dd></>}
                    {card.skills.length > 0 && (
                      <><dt>Key skills</dt><dd className="tv-skills">{card.skills.map((skill, i) => <span key={i}><Highlight text={skill} words={words} /></span>)}</dd></>
                    )}
                    {card.last_job_title && (
                      <><dt>Last submitted</dt><dd>{card.last_job_title} · <strong>{card.last_status}</strong> · {formatDate(card.last_submitted_at)}{card.submissions > 1 ? ` (${card.submissions} jobs)` : ''}</dd></>
                    )}
                    {card.resume_match && <><dt>In resume</dt><dd className="tv-match"><Highlight text={card.resume_match} words={words} /></dd></>}
                  </dl>
                </div>

                <aside className="tv-side">
                  <span className="tv-avatar" aria-hidden="true">{initials(card.full_name, card.email)}</span>
                  <p className="tv-side-line">{card.submissions ? `Submitted to ${card.submissions} job${card.submissions === 1 ? '' : 's'}` : 'Not submitted to a job yet'}</p>
                  {card.phone ? (
                    shownPhones.has(card.id) ? (
                      <a className="tv-btn tv-btn-strong" href={`tel:${card.phone}`}>{Icon.phone}{card.phone}</a>
                    ) : (
                      <button type="button" className="tv-btn" onClick={() => setShownPhones((s) => new Set(s).add(card.id))}>View phone number</button>
                    )
                  ) : <span className="tv-btn tv-btn-off">No phone on file</span>}
                  <a className="tv-btn" href={`mailto:${card.email}`}>Email candidate</a>
                  <small className="tv-email">{card.email}</small>
                </aside>
              </article>
              <footer className="tv-foot">
                {card.cv_kind ? (
                  <button type="button" className="tv-cv" onClick={() => setViewingCv(card)} title={card.cv_name ?? 'Resume'}>{Icon.clip} View CV</button>
                ) : <span className="tv-cv tv-cv-off">{Icon.clip} No CV</span>}
                <span>{card.source}{card.added_by ? ` by ${card.added_by}` : ''}</span>
                <span>Added {formatDate(card.created_at)}</span>
                <span>Updated {ago(card.updated_at ?? card.created_at)}</span>
              </footer>
            </li>
          ))}
        </ol>

        {pages > 1 && (
          <div className="tv-pager tv-pager-bottom">
            <button type="button" disabled={page <= 1} onClick={() => { setPage(page - 1); window.scrollTo({ top: 0 }) }}>‹ Previous</button>
            <span className="tv-page">Page {result?.page ?? page} of {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => { setPage(page + 1); window.scrollTo({ top: 0 }) }}>Next ›</button>
          </div>
        )}
      </section>

      {viewingCv && viewingCv.cv_kind && (
        <div className="job-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setViewingCv(null)}>
          <section className="job-details-modal tv-modal tv-cv-modal" role="dialog" aria-modal="true" aria-labelledby="tv-cv-title">
            <div className="cd-modal-head">
              <div><h2 id="tv-cv-title">{viewingCv.full_name}</h2><p>{viewingCv.cv_name}</p></div>
              <button type="button" className="job-modal-close" aria-label="Close" onClick={() => setViewingCv(null)}>×</button>
            </div>
            <ResumePreview key={`${viewingCv.cv_kind}-${viewingCv.cv_id}`} fileName={viewingCv.cv_name ?? 'resume.pdf'} load={() => fetchTalentResume(token, viewingCv)} height={620} />
            <div className="cd-modal-actions">
              <button type="button" className="tv-secondary" onClick={() => void openResume(viewingCv)}>Download</button>
              <button type="button" onClick={() => setViewingCv(null)}>Close</button>
            </div>
          </section>
        </div>
      )}
      {modal === 'add' && (
        <AddResumeModal token={token} onClose={() => setModal(null)} onSaved={(message) => { setModal(null); setNotice(message); load() }} />
      )}
      {modal === 'bulk' && (
        <BulkUploadModal token={token} onClose={() => setModal(null)} onDone={() => load()} />
      )}
    </>
  )
}

type AddForm = {
  full_name: string; email: string; phone: string; pan_number: string; current_location: string; total_experience: string
  relevant_experience: string; current_employer: string; highest_qualification: string; primary_skills: string
}
const EMPTY_ADD: AddForm = {
  full_name: '', email: '', phone: '', pan_number: '', current_location: '', total_experience: '',
  relevant_experience: '', current_employer: '', highest_qualification: '', primary_skills: '',
}

function AddResumeModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: (message: string) => void }) {
  const [form, setForm] = useState<AddForm>(EMPTY_ADD)
  const [file, setFile] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const set = (key: keyof AddForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: event.target.value }))

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (!chosen) return
    setFile(chosen)
    setReading(true)
    setError(null)
    try {
      const { fields } = await parseResume(token, chosen)
      setForm((current) => {
        const next = { ...current }
        for (const key of Object.keys(EMPTY_ADD) as Array<keyof AddForm>) {
          const value = (fields as Record<string, unknown>)[key]
          if (value !== null && value !== undefined && value !== '' && !current[key]) next[key] = String(value)
        }
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this resume; fill in the details below.')
    } finally {
      setReading(false)
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!form.full_name.trim()) return setError('Enter the candidate’s full name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('Enter a valid email address.')
    const num = (value: string) => (value.trim() === '' ? null : Number(value))
    const total = num(form.total_experience)
    const relevant = num(form.relevant_experience)
    if ((total !== null && (!Number.isFinite(total) || total < 0)) || (relevant !== null && (!Number.isFinite(relevant) || relevant < 0))) {
      return setError('Experience must be a number of years (0 or more).')
    }
    const pan = form.pan_number.replace(/[\s-]/g, '').toUpperCase()
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return setError('PAN must be 10 characters: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).')
    const text = (value: string) => (value.trim() === '' ? null : value.trim())
    setSaving(true)
    try {
      const card = await addTalentProfile(token, {
        full_name: form.full_name.trim(), email: form.email.trim(), phone: text(form.phone), pan_number: pan || null,
        total_experience: total, relevant_experience: relevant, current_employer: text(form.current_employer),
        current_location: text(form.current_location), highest_qualification: text(form.highest_qualification),
        primary_skills: text(form.primary_skills),
      })
      let message = `${card.full_name} was added to TalentVault.`
      if (file) {
        try {
          await uploadTalentResume(token, card.id, file)
        } catch (err) {
          message += ` The resume file could not be attached: ${err instanceof Error ? err.message : 'unknown error'}`
        }
      }
      onSaved(message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add this profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="job-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="job-details-modal tv-modal" role="dialog" aria-modal="true" aria-labelledby="tv-add-title">
        <div className="cd-modal-head">
          <div><h2 id="tv-add-title">Add resume to TalentVault</h2><p>Saved to the database without submitting to a job.</p></div>
          <button type="button" className="job-modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={save}>
          <div className="tv-upload">
            <div>
              <strong>{file ? file.name : 'Resume'}</strong>
              <small>{reading ? 'Reading the resume…' : 'PDF or DOCX, up to 10 MB. Details below are filled in from it.'}</small>
            </div>
            <input ref={fileInput} type="file" accept=".pdf,.docx" hidden onChange={(event) => void pick(event)} />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={reading}>{file ? 'Choose another' : 'Upload resume'}</button>
          </div>
          <div className="cd-form-grid">
            <label className="cd-field"><span>Full name *</span><input value={form.full_name} onChange={set('full_name')} maxLength={200} required /></label>
            <label className="cd-field"><span>Email *</span><input type="email" value={form.email} onChange={set('email')} maxLength={320} required /></label>
            <label className="cd-field"><span>Phone</span><input value={form.phone} onChange={set('phone')} maxLength={30} /></label>
            <label className="cd-field"><span>PAN number</span><input className="cd-pan" value={form.pan_number} onChange={set('pan_number')} maxLength={10} placeholder="ABCDE1234F" autoComplete="off" /></label>
            <label className="cd-field"><span>Current location</span><input value={form.current_location} onChange={set('current_location')} maxLength={200} /></label>
            <label className="cd-field"><span>Total experience (years)</span><input type="number" min="0" step="0.1" value={form.total_experience} onChange={set('total_experience')} placeholder="0 for a fresher" /></label>
            <label className="cd-field"><span>Relevant experience (years)</span><input type="number" min="0" step="0.1" value={form.relevant_experience} onChange={set('relevant_experience')} /></label>
            <label className="cd-field"><span>Current employer</span><input value={form.current_employer} onChange={set('current_employer')} maxLength={200} /></label>
            <label className="cd-field cd-field-wide"><span>Highest qualification</span><input value={form.highest_qualification} onChange={set('highest_qualification')} maxLength={300} /></label>
            <label className="cd-field cd-field-wide"><span>Key skills</span><textarea rows={2} value={form.primary_skills} onChange={set('primary_skills')} placeholder="e.g. Oracle PLM, SQL, Python" /></label>
          </div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="cd-modal-actions">
            <button type="button" className="tv-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving || reading}>{saving ? 'Saving…' : 'Add to TalentVault'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function BulkUploadModal({ token, onClose, onDone }: { token: string; onClose: () => void; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload() {
    if (!files.length) return
    setBusy(true)
    setError(null)
    try {
      const data = await bulkUploadTalent(token, files)
      setResult(data)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="job-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="job-details-modal tv-modal" role="dialog" aria-modal="true" aria-labelledby="tv-bulk-title">
        <div className="cd-modal-head">
          <div><h2 id="tv-bulk-title">Bulk upload resumes</h2><p>Up to 25 PDF or DOCX files at a time. Each resume with an email address becomes a profile.</p></div>
          <button type="button" className="job-modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        {!result ? (
          <>
            <label className="tv-drop">
              <input type="file" accept=".pdf,.docx" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 25))} />
              <strong>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} chosen` : 'Choose resume files'}</strong>
              <small>{files.length ? files.map((f) => f.name).join(', ') : 'Hold Ctrl to pick several files.'}</small>
            </label>
            {error && <p className="error-message" role="alert">{error}</p>}
            <div className="cd-modal-actions">
              <button type="button" className="tv-secondary" onClick={onClose}>Cancel</button>
              <button type="button" onClick={() => void upload()} disabled={busy || !files.length}>{busy ? 'Uploading and reading…' : 'Upload'}</button>
            </div>
          </>
        ) : (
          <>
            <p className="tv-bulk-summary">
              <strong>{result.added}</strong> added · <strong>{result.updated}</strong> updated · <strong>{result.skipped}</strong> already in TalentVault · <strong>{result.error}</strong> need attention
            </p>
            <ul className="tv-bulk-list">
              {result.results.map((row, i) => (
                <li key={i} className={`tv-bulk-${row.status}`}><span>{row.file}</span><em>{row.message}</em></li>
              ))}
            </ul>
            <div className="cd-modal-actions"><button type="button" onClick={onClose}>Done</button></div>
          </>
        )}
      </section>
    </div>
  )
}
