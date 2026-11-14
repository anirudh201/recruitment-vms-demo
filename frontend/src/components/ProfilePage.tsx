import { useState } from 'react'
import { changeMyPassword, updateMyProfile, type Me } from '../api/client'
import { formatDateTime } from '../dashboardStats'
import { ROLE_NAMES, initials } from '../profileUtils'

type Notice = { kind: 'success' | 'error'; text: string } | null

export default function ProfilePage({ token, me, onUpdated }: { token: string | null; me: Me; onUpdated: (me: Me) => void }) {
  const [details, setDetails] = useState({ full_name: me.full_name ?? '', job_title: me.job_title ?? '', phone: me.phone ?? '' })
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsNotice, setDetailsNotice] = useState<Notice>(null)

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [showPasswords, setShowPasswords] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null)

  const company = me.vendor_name ?? me.client_name
  const role = ROLE_NAMES[me.user_type] ?? me.roles.join(', ')
  const changed =
    details.full_name.trim() !== (me.full_name ?? '') ||
    details.job_title.trim() !== (me.job_title ?? '') ||
    details.phone.trim() !== (me.phone ?? '')

  async function saveDetails(event: React.FormEvent) {
    event.preventDefault()
    if (!token) return
    setSavingDetails(true)
    setDetailsNotice(null)
    try {
      const updated = await updateMyProfile(token, {
        full_name: details.full_name.trim() || null,
        job_title: details.job_title.trim() || null,
        phone: details.phone.trim() || null,
      })
      onUpdated({ ...me, ...updated })
      setDetails({ full_name: updated.full_name ?? '', job_title: updated.job_title ?? '', phone: updated.phone ?? '' })
      setDetailsNotice({ kind: 'success', text: 'Your details have been saved.' })
    } catch (err) {
      setDetailsNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Your details could not be saved.' })
    } finally {
      setSavingDetails(false)
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault()
    if (!token) return
    setPasswordNotice(null)
    if (passwords.next.length < 12) return setPasswordNotice({ kind: 'error', text: 'The new password must be at least 12 characters.' })
    if (passwords.next !== passwords.confirm) return setPasswordNotice({ kind: 'error', text: 'The new passwords do not match.' })
    if (passwords.next === passwords.current) return setPasswordNotice({ kind: 'error', text: 'Choose a new password that is different from the current one.' })
    setSavingPassword(true)
    try {
      await changeMyPassword(token, passwords.current, passwords.next)
      setPasswords({ current: '', next: '', confirm: '' })
      setPasswordNotice({ kind: 'success', text: 'Your password has been changed. Use it next time you sign in.' })
    } catch (err) {
      setPasswordNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Your password could not be changed.' })
    } finally {
      setSavingPassword(false)
    }
  }

  const notice = (value: Notice) =>
    value && (
      <p className={value.kind === 'success' ? 'success-message' : 'error-message'} role={value.kind === 'success' ? 'status' : 'alert'}>
        {value.text}
      </p>
    )

  return (
    <>
      <header className="page-header" id="profile">
        <h1>My profile</h1>
        <p>Your details and sign-in settings.</p>
      </header>

      <section className="pf-hero" aria-label="Your profile">
        <span className="pf-avatar pf-avatar-lg" aria-hidden="true">{initials(me.full_name, me.email)}</span>
        <div className="pf-hero-text">
          <h2>{me.full_name || me.email}</h2>
          <p>{me.job_title || (me.full_name ? 'Add your designation below' : 'Add your name and designation below')}</p>
          <span className="pf-role">{role}{company ? ` · ${company}` : ''}</span>
        </div>
      </section>

      <div className="pf-grid">
        <form className="client-form pf-section" onSubmit={saveDetails} aria-label="Your details">
          <h3>Your details</h3>
          <label htmlFor="pf-name">Full name</label>
          <input id="pf-name" maxLength={200} value={details.full_name} onChange={(event) => setDetails({ ...details, full_name: event.target.value })} placeholder="e.g. Anil Kumar" />
          <label htmlFor="pf-title">Designation</label>
          <input id="pf-title" maxLength={120} value={details.job_title} onChange={(event) => setDetails({ ...details, job_title: event.target.value })} placeholder="e.g. Senior Recruiter" />
          <label htmlFor="pf-phone">Phone</label>
          <input id="pf-phone" type="tel" maxLength={30} value={details.phone} onChange={(event) => setDetails({ ...details, phone: event.target.value })} placeholder="e.g. +91 98765 43210" />
          <label htmlFor="pf-email">Email (your username)</label>
          <input id="pf-email" value={me.email} disabled readOnly />
          <small className="vf-hint">Your email and role can only be changed by your administrator.</small>
          {notice(detailsNotice)}
          <div className="form-actions">
            <button
              type="button"
              disabled={!changed || savingDetails}
              onClick={() => {
                setDetails({ full_name: me.full_name ?? '', job_title: me.job_title ?? '', phone: me.phone ?? '' })
                setDetailsNotice(null)
              }}
            >
              Undo changes
            </button>
            <button type="submit" disabled={!changed || savingDetails}>{savingDetails ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>

        <div className="pf-side">
          <section className="client-form pf-section" aria-label="Account">
            <h3>Account</h3>
            <dl className="pf-facts">
              <div><dt>Role</dt><dd>{role}</dd></div>
              {company && <div><dt>{me.vendor_name ? 'Partner company' : 'Client company'}</dt><dd>{company}</dd></div>}
              <div><dt>Member since</dt><dd>{me.created_at ? formatDateTime(me.created_at) : '—'}</dd></div>
              <div><dt>Last sign-in</dt><dd>{me.last_login_at ? formatDateTime(me.last_login_at) : '—'}</dd></div>
            </dl>
          </section>

          <form className="client-form pf-section" onSubmit={savePassword} aria-label="Change password">
            <h3>Change password</h3>
            <label htmlFor="pf-current">Current password</label>
            <input id="pf-current" type={showPasswords ? 'text' : 'password'} autoComplete="current-password" required value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} />
            <label htmlFor="pf-new">New password</label>
            <input id="pf-new" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" required minLength={12} value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} />
            <small className="vf-hint">At least 12 characters.{passwords.next ? ` ${passwords.next.length}/12` : ''}</small>
            <label htmlFor="pf-confirm">Confirm new password</label>
            <input id="pf-confirm" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" required value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} />
            <label className="checkbox-label">
              <input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} />
              Show passwords
            </label>
            {notice(passwordNotice)}
            <div className="form-actions">
              <button type="submit" disabled={savingPassword}>{savingPassword ? 'Changing…' : 'Change password'}</button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
