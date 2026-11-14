import { useEffect, useState } from 'react'
import { getMyFeedback, sendFeedback, type FeedbackItem, type FeedbackKind } from '../api/client'
import { formatDateTime } from '../dashboardStats'
import { FEEDBACK_KIND_LABEL, FEEDBACK_STATUS_LABEL } from '../feedbackLabels'


const PLACEHOLDER: Record<FeedbackKind, string> = {
  bug: 'What did you do, what happened, and what did you expect to happen?',
  feature: 'What would you like the app to do, and how would it help your work?',
  other: 'Tell us anything else.',
}

function browserInfo(): string {
  return `${navigator.userAgent} | screen ${window.innerWidth}x${window.innerHeight}`.slice(0, 300)
}

function FeedbackDialog({ token, pageLabel, onClose }: { token: string; pageLabel: string; onClose: () => void }) {
  const [tab, setTab] = useState<'send' | 'mine'>('send')
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [mine, setMine] = useState<FeedbackItem[] | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    getMyFeedback(token)
      .then((items) => !cancelled && setMine(Array.isArray(items) ? items : []))
      .catch(() => !cancelled && setMine([]))
    return () => {
      cancelled = true
    }
  }, [token, version])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setNotice(null)
    if (title.trim().length < 3) return setNotice({ kind: 'error', text: 'Please add a short title (at least 3 characters).' })
    if (!details.trim()) return setNotice({ kind: 'error', text: 'Please describe it in a few words.' })
    setSending(true)
    try {
      const item = await sendFeedback(token, { kind, title: title.trim(), details: details.trim(), page: pageLabel, browser: browserInfo() })
      setTitle('')
      setDetails('')
      setNotice({ kind: 'success', text: `Thank you! Your ${FEEDBACK_KIND_LABEL[item.kind].toLowerCase()} was sent as report #${item.id}.` })
      setVersion((value) => value + 1)
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Your feedback could not be sent.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="job-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="job-details-modal fb-modal" role="dialog" aria-modal="true" aria-labelledby="fb-title">
        <div className="cd-modal-head">
          <div>
            <h2 id="fb-title">Feedback</h2>
            <p>Report a bug or suggest a feature. Your team lead sees every report.</p>
          </div>
          <button type="button" className="job-modal-close" aria-label="Close feedback" onClick={onClose}>×</button>
        </div>

        <div className="fb-tabs" role="tablist" aria-label="Feedback">
          <button type="button" role="tab" aria-selected={tab === 'send'} className={tab === 'send' ? 'active' : ''} onClick={() => setTab('send')}>Send feedback</button>
          <button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
            My reports{mine && mine.length > 0 ? ` (${mine.length})` : ''}
          </button>
        </div>

        {tab === 'send' ? (
          <form onSubmit={submit} className="fb-form" aria-label="Send feedback">
            <div className="fb-kinds" role="radiogroup" aria-label="Type">
              {(Object.keys(FEEDBACK_KIND_LABEL) as FeedbackKind[]).map((value) => (
                <label key={value} className={`fb-kind${kind === value ? ' active' : ''}`}>
                  <input type="radio" name="fb-kind" value={value} checked={kind === value} onChange={() => setKind(value)} />
                  {FEEDBACK_KIND_LABEL[value]}
                </label>
              ))}
            </div>
            <label className="cd-field">
              <span>Title *</span>
              <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder={kind === 'bug' ? 'e.g. Save button does nothing on the Jobs page' : 'e.g. Filter candidates by notice period'} />
            </label>
            <label className="cd-field">
              <span>Details *</span>
              <textarea rows={6} value={details} maxLength={5000} onChange={(event) => setDetails(event.target.value)} placeholder={PLACEHOLDER[kind]} />
            </label>
            <p className="cd-hint">We’ll also include the page you’re on (<strong>{pageLabel}</strong>) and your browser, to help us reproduce it.</p>
            {notice && <p className={notice.kind === 'success' ? 'success-message' : 'error-message'} role={notice.kind === 'success' ? 'status' : 'alert'}>{notice.text}</p>}
            <div className="cd-modal-actions">
              <button type="button" className="cd-secondary" onClick={onClose}>Close</button>
              <button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send'}</button>
            </div>
          </form>
        ) : (
          <div className="fb-mine">
            {mine === null ? (
              <p className="cd-hint">Loading…</p>
            ) : mine.length === 0 ? (
              <p className="cd-empty-note">You haven’t sent any feedback yet.</p>
            ) : (
              <ul className="fb-list">
                {mine.map((item) => (
                  <li key={item.id}>
                    <div className="fb-list-head">
                      <strong>#{item.id} {item.title}</strong>
                      <span className={`fb-status fb-status-${item.status}`}>{FEEDBACK_STATUS_LABEL[item.status]}</span>
                    </div>
                    <small>{FEEDBACK_KIND_LABEL[item.kind]} · sent {formatDateTime(item.created_at)}</small>
                    {item.admin_note && <p className="fb-note"><strong>Reply:</strong> {item.admin_note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

export default function FeedbackButton({ token, pageLabel }: { token: string; pageLabel: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="fb-fab" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Feedback
      </button>
      {open && <FeedbackDialog token={token} pageLabel={pageLabel} onClose={() => setOpen(false)} />}
    </>
  )
}
