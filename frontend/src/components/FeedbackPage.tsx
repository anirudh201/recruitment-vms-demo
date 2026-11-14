import { useEffect, useState } from 'react'
import { downloadFeedbackExcel, listFeedback, updateFeedback, type FeedbackItem, type FeedbackStatus } from '../api/client'
import { formatDateTime } from '../dashboardStats'
import { FEEDBACK_KIND_LABEL, FEEDBACK_STATUS_LABEL } from '../feedbackLabels'

const STATUSES: FeedbackStatus[] = ['new', 'in_progress', 'done', 'wont_fix']

function FeedbackRow({ token, item, number, onChanged }: { token: string; item: FeedbackItem; number: number; onChanged: (item: FeedbackItem) => void }) {
  const [note, setNote] = useState(item.admin_note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function save(changes: { status?: FeedbackStatus; admin_note?: string | null }) {
    setBusy(true)
    setError(null)
    try {
      onChanged(await updateFeedback(token, item.id, changes))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={`fbp-item fbp-kind-${item.kind}`} aria-label={`Feedback ${item.id}`}>
      <div className="fbp-main">
        <div className="fbp-head">
          <span className="fbp-no">{number}</span>
          <span className={`fbp-kind fbp-kind-tag-${item.kind}`}>{FEEDBACK_KIND_LABEL[item.kind]}</span>
          <strong>#{item.id} {item.title}</strong>
        </div>
        <p className="fbp-meta">
          {item.user_name ?? 'Deleted user'}
          {item.user_role ? ` · ${item.user_role}` : ''}
          {item.user_company ? ` · ${item.user_company}` : ''}
          {item.page ? ` · page: ${item.page}` : ''} · {formatDateTime(item.created_at)}
        </p>
        <p className="fbp-details">{item.details}</p>
        <button type="button" className="cd-link fbp-more" onClick={() => setOpen((value) => !value)}>{open ? 'Hide reply and browser' : item.admin_note ? 'View reply and browser' : 'Reply and browser'}</button>
        {open && (
          <div className="fbp-extra">
            <label className="cd-field">
              <span>Reply to the sender (they see it under “My reports”)</span>
              <textarea rows={2} value={note} maxLength={5000} onChange={(event) => setNote(event.target.value)} />
            </label>
            <button type="button" className="fbp-save" disabled={busy || note === (item.admin_note ?? '')} onClick={() => void save({ admin_note: note.trim() || null })}>
              {busy ? 'Saving…' : 'Save reply'}
            </button>
            {item.browser && <p className="fbp-browser"><strong>Browser:</strong> {item.browser}</p>}
          </div>
        )}
        {error && <p className="error-message" role="alert">{error}</p>}
      </div>
      <label className="fbp-status">
        <span className="sr-only">Status of #{item.id}</span>
        <select aria-label={`Status of feedback ${item.id}`} value={item.status} disabled={busy} onChange={(event) => void save({ status: event.target.value as FeedbackStatus })} className={`fb-status-select fb-status-${item.status}`}>
          {STATUSES.map((status) => <option key={status} value={status}>{FEEDBACK_STATUS_LABEL[status]}</option>)}
        </select>
      </label>
    </li>
  )
}

export default function FeedbackPage({ token, onCountChange }: { token: string; onCountChange?: (newCount: number) => void }) {
  const [items, setItems] = useState<FeedbackItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    listFeedback(token)
      .then((data) => !cancelled && setItems(Array.isArray(data) ? data : []))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Feedback could not be loaded.'))
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (items && onCountChange) onCountChange(items.filter((item) => item.status === 'new').length)
  }, [items, onCountChange])

  const all = items ?? []
  const visible = all.filter((item) => (!status || item.status === status) && (!kind || item.kind === kind))
  const count = (value: string) => all.filter((item) => item.status === value).length

  async function download() {
    setDownloading(true)
    try {
      const url = URL.createObjectURL(await downloadFeedbackExcel(token, { status: status || undefined, kind: kind || undefined }))
      const link = document.createElement('a')
      link.href = url
      link.download = `feedback-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The Excel file could not be created.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <header className="page-header" id="feedback">
        <h1>Feedback</h1>
        <p>Bugs and feature ideas from everyone using the app.</p>
      </header>
      {error && <p className="error-message" role="alert">{error}</p>}
      <section className="welcome-card jobs-card cd-card fbp-card">
        <div className="cd-tiles fbp-tiles" role="group" aria-label="Filter by status">
          {['', ...STATUSES].map((value) => (
            <button key={value || 'all'} type="button" className={`cd-tile${status === value ? ' active' : ''}`} aria-pressed={status === value} onClick={() => setStatus(value)}>
              <span>{value ? FEEDBACK_STATUS_LABEL[value] : 'All'}</span>
              <strong>{value ? count(value) : all.length}</strong>
            </button>
          ))}
        </div>
        <div className="fbp-bar">
          <select aria-label="Filter by type" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="">All types</option>
            <option value="bug">Bugs</option>
            <option value="feature">Feature ideas</option>
            <option value="other">Other</option>
          </select>
          <button type="button" className="rp-download" disabled={downloading || visible.length === 0} onClick={() => void download()}>
            {downloading ? 'Preparing Excel…' : `Download Excel (${visible.length})`}
          </button>
        </div>
        {items === null && !error ? (
          <p className="cd-hint">Loading feedback…</p>
        ) : visible.length === 0 ? (
          <div className="cd-empty"><strong>{all.length === 0 ? 'No feedback yet.' : 'Nothing matches these filters.'}</strong><p>Everyone can send feedback with the Feedback button at the bottom right.</p></div>
        ) : (
          <ol className="fbp-list">
            {visible.map((item, index) => (
              <FeedbackRow key={item.id} token={token} item={item} number={index + 1} onChanged={(updated) => setItems((current) => (current ?? []).map((entry) => (entry.id === updated.id ? updated : entry)))} />
            ))}
          </ol>
        )}
      </section>
    </>
  )
}
