import { useEffect, useState } from 'react'
import { formatDateTime } from '../dashboardStats'
import { initials } from '../profileUtils'
import {
  createUser,
  listRoles,
  listUsers,
  setUserActive,
  setUserProfile,
  type Client,
  type Me,
  type RoleOption,
  type UserAccount,
  type Vendor,
} from '../api/client'

const ROLE_HELP: Record<string, string> = {
  'Super Admin': 'Full control: jobs, partners, clients, users and every decision.',
  Recruiter: 'Screens candidates and moves them through the pipeline. Views clients and partners.',
  Vendor: 'Channel-partner login. Sees only assigned requirements and its own candidates.',
  Client: 'Client-company login. Reviews only candidates your team sends to that company.',
}
const ROLE_LABEL: Record<string, string> = { Vendor: 'Channel partner', Client: 'Client' }

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
  const values = new Uint32Array(16)
  crypto.getRandomValues(values)
  return Array.from(values, (value) => chars[value % chars.length]).join('')
}

type Created = { email: string; password: string; role: string }

function UserProfileDrawer({
  token,
  user,
  isSelf,
  busy,
  onToggleActive,
  onSaved,
  onClose,
}: {
  token: string | null
  user: UserAccount
  isSelf: boolean
  busy: boolean
  onToggleActive: (user: UserAccount) => void
  onSaved: () => void
  onClose: () => void
}) {
  const [fields, setFields] = useState({ full_name: user.full_name ?? '', job_title: user.job_title ?? '', phone: user.phone ?? '' })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const changed =
    fields.full_name.trim() !== (user.full_name ?? '') || fields.job_title.trim() !== (user.job_title ?? '') || fields.phone.trim() !== (user.phone ?? '')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!token) return
    setSaving(true)
    setNotice(null)
    try {
      await setUserProfile(token, user.id, {
        full_name: fields.full_name.trim() || null,
        job_title: fields.job_title.trim() || null,
        phone: fields.phone.trim() || null,
      })
      setNotice({ kind: 'success', text: 'Profile saved.' })
      onSaved()
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'The profile could not be saved.' })
    } finally {
      setSaving(false)
    }
  }

  const company = user.vendor_name ?? user.client_name
  return (
    <div className="cd-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="cd-drawer" role="dialog" aria-modal="true" aria-labelledby="us-profile-title">
        <div className="cd-drawer-head">
          <div className="us-drawer-who">
            <span className="pf-avatar pf-avatar-lg" aria-hidden="true">{initials(user.full_name, user.email)}</span>
            <div>
              <h2 id="us-profile-title">{user.full_name || user.email}</h2>
              <p>{user.job_title || 'No designation yet'}</p>
            </div>
          </div>
          <button type="button" className="job-modal-close" aria-label="Close profile" onClick={onClose}>×</button>
        </div>

        <section className="cd-drawer-section">
          <h3>Account</h3>
          <dl className="cd-facts">
            <div className="cd-fact"><dt>Email (username)</dt><dd>{user.email}</dd></div>
            <div className="cd-fact"><dt>Role</dt><dd>{user.roles.map((role) => ROLE_LABEL[role] ?? role).join(', ')}</dd></div>
            <div className="cd-fact"><dt>Belongs to</dt><dd>{company ?? 'Your company'}</dd></div>
            <div className="cd-fact"><dt>Status</dt><dd className={user.is_active ? 'us-active' : 'us-inactive'}>{user.is_active ? 'Active' : 'Deactivated'}</dd></div>
            <div className="cd-fact"><dt>Member since</dt><dd>{user.created_at ? formatDateTime(user.created_at) : '—'}</dd></div>
            <div className="cd-fact"><dt>Last sign-in</dt><dd>{user.last_login_at ? formatDateTime(user.last_login_at) : 'Never signed in'}</dd></div>
          </dl>
        </section>

        <section className="cd-drawer-section">
          <h3>Details</h3>
          <form className="us-profile-form" onSubmit={save}>
            <label className="cd-field"><span>Full name</span><input aria-label="Full name" maxLength={200} value={fields.full_name} onChange={(event) => setFields({ ...fields, full_name: event.target.value })} /></label>
            <label className="cd-field"><span>Designation</span><input aria-label="Designation" maxLength={120} value={fields.job_title} onChange={(event) => setFields({ ...fields, job_title: event.target.value })} /></label>
            <label className="cd-field"><span>Phone</span><input aria-label="Phone" type="tel" maxLength={30} value={fields.phone} onChange={(event) => setFields({ ...fields, phone: event.target.value })} /></label>
            {notice && <p className={notice.kind === 'success' ? 'success-message' : 'error-message'} role={notice.kind === 'success' ? 'status' : 'alert'}>{notice.text}</p>}
            <div className="cd-modal-actions">
              {!isSelf && (
                <button type="button" className={user.is_active ? 'us-drawer-deactivate' : 'us-drawer-activate'} disabled={busy} onClick={() => onToggleActive(user)}>
                  {user.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
              <button type="submit" disabled={!changed || saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </section>
      </aside>
    </div>
  )
}

export default function UsersPage({
  token,
  me,
  vendors,
  clients,
}: {
  token: string | null
  me: Me
  vendors: Vendor[]
  clients: Client[]
}) {
  const [users, setUsers] = useState<UserAccount[] | null>(null)
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ fullName: '', jobTitle: '', email: '', password: '', roleId: '', vendorId: '', clientId: '' })
  const [profileId, setProfileId] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)
  const [busyUser, setBusyUser] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    Promise.all([listUsers(token), listRoles(token)])
      .then(([userData, roleData]) => {
        if (cancelled) return
        setUsers(userData)
        setRoles(roleData)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Unable to load users.')
      })
    return () => {
      cancelled = true
    }
  }, [token, version])

  const selectedRole = roles.find((role) => String(role.id) === form.roleId)
  const roleName = selectedRole?.name ?? ''
  const mine = (users ?? []).filter((user) => user.organization_id === me.organization_id)
  const query = search.trim().toLowerCase()
  const visible = mine
    .filter((user) => roleFilter === 'all' || user.roles.includes(roleFilter))
    .filter((user) => !query || [user.full_name, user.job_title, user.email, user.vendor_name, user.client_name, ...user.roles].some((value) => String(value ?? '').toLowerCase().includes(query)))
  const countFor = (name: string) => mine.filter((user) => user.roles.includes(name)).length

  function openForm() {
    setForm({ fullName: '', jobTitle: '', email: '', password: generatePassword(), roleId: '', vendorId: '', clientId: '' })
    setFormError(null)
    setCreated(null)
    setShowForm(true)
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    if (!token) return setFormError('Your session has expired. Please sign in again.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setFormError('Enter a valid email address.')
    if (!selectedRole) return setFormError('Choose a role.')
    if (form.password.length < 12) return setFormError('The temporary password must be at least 12 characters.')
    if (roleName === 'Vendor' && !form.vendorId) return setFormError('Choose which channel partner this login belongs to.')
    if (roleName === 'Client' && !form.clientId) return setFormError('Choose which client company this login belongs to.')
    setSaving(true)
    try {
      await createUser(token, {
        email: form.email.trim(),
        password: form.password,
        organization_id: me.organization_id,
        role_ids: [selectedRole.id],
        vendor_id: roleName === 'Vendor' ? Number(form.vendorId) : null,
        client_id: roleName === 'Client' ? Number(form.clientId) : null,
        full_name: form.fullName.trim() || null,
        job_title: form.jobTitle.trim() || null,
      })
      setCreated({ email: form.email.trim().toLowerCase(), password: form.password, role: roleName })
      setShowForm(false)
      setVersion((value) => value + 1)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create the user.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(user: UserAccount) {
    if (!token) return
    setBusyUser(user.id)
    setActionError(null)
    try {
      await setUserActive(token, user.id, !user.is_active)
      setVersion((value) => value + 1)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to change this account.')
    } finally {
      setBusyUser(null)
    }
  }

  const tabs = ['all', 'Super Admin', 'Recruiter', 'Vendor', 'Client']

  return (
    <>
      <header className="page-header" id="users">
        <h1>Users</h1>
        <p>Create and manage logins for your team, channel partners and clients.</p>
      </header>

      {loadError && <p className="error-message" role="alert">{loadError}</p>}
      {actionError && <p className="error-message" role="alert">{actionError}</p>}
      {created && (
        <div className="us-created" role="status">
          <strong>Login created for {created.email} ({ROLE_LABEL[created.role] ?? created.role}).</strong>
          <p>
            Temporary password: <code>{created.password}</code>
          </p>
          <p>Share it securely (not in the same email as the username). They can set their own password with “Forgot password”.</p>
          <button type="button" className="cd-secondary us-dismiss" onClick={() => setCreated(null)}>Done</button>
        </div>
      )}

      <section className="welcome-card jobs-card cd-card us-card">
        <div className="jobs-heading">
          <div>
            <h2>Accounts</h2>
            <p>{users === null ? 'Loading users…' : `${mine.length} account(s) in your organization`}</p>
          </div>
          <div className="jobs-actions">
            <button type="button" onClick={openForm}>+ Add User</button>
          </div>
        </div>

        <div className="cd-tiles us-tabs" role="group" aria-label="Filter by role">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`cd-tile${roleFilter === tab ? ' active' : ''}`}
              aria-pressed={roleFilter === tab}
              onClick={() => setRoleFilter(tab)}
            >
              <span>{tab === 'all' ? 'All users' : ROLE_LABEL[tab] ?? tab}</span>
              <strong>{tab === 'all' ? mine.length : countFor(tab)}</strong>
            </button>
          ))}
        </div>

        <input
          type="search"
          className="jobs-search-input us-search"
          placeholder="Search by email, role or company…"
          aria-label="Search users"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {users !== null && visible.length === 0 ? (
          <div className="cd-empty"><strong>No users match.</strong></div>
        ) : (
          <div className="jobs-table-wrapper">
            <table className="jobs-table us-table">
              <thead>
                <tr><th className="sno-col">S.No</th><th>User</th><th>Role</th><th>Belongs to</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {visible.map((user, index) => (
                  <tr key={user.id}>
                    <td className="sno-col">{index + 1}</td>
                    <td>
                      <span className="us-person">
                        <span className="pf-avatar" aria-hidden="true">{initials(user.full_name, user.email)}</span>
                        <span className="us-person-text">
                          <strong>{user.full_name || user.email}</strong>
                          {user.job_title && <span className="us-title">{user.job_title}</span>}
                          {user.full_name && <span className="job-id">{user.email}</span>}
                          {user.id === me.id && <span className="job-id">You</span>}
                          <button type="button" className="cd-link us-name-link" aria-label={`View profile for ${user.email}`} onClick={() => setProfileId(user.id)}>
                            View profile
                          </button>
                        </span>
                      </span>
                    </td>
                    <td>{user.roles.map((role) => <span key={role} className={`us-role us-role-${role.replace(/\s+/g, '-').toLowerCase()}`}>{ROLE_LABEL[role] ?? role}</span>)}</td>
                    <td>{user.vendor_name ?? user.client_name ?? <span className="cd-muted">Your company</span>}</td>
                    <td><span className={user.is_active ? 'us-active' : 'us-inactive'}>{user.is_active ? 'Active' : 'Deactivated'}</span></td>
                    <td>
                      {user.id !== me.id && (
                        <button
                          type="button"
                          className={user.is_active ? 'us-deactivate' : 'us-activate'}
                          disabled={busyUser !== null}
                          aria-label={`${user.is_active ? 'Deactivate' : 'Activate'} ${user.email}`}
                          onClick={() => void toggleActive(user)}
                        >
                          {busyUser === user.id ? 'Saving…' : user.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {profileId !== null && users?.some((user) => user.id === profileId) && (
        <UserProfileDrawer
          token={token}
          user={users.find((user) => user.id === profileId) as UserAccount}
          isSelf={profileId === me.id}
          busy={busyUser !== null}
          onToggleActive={(user) => void toggleActive(user)}
          onSaved={() => setVersion((value) => value + 1)}
          onClose={() => setProfileId(null)}
        />
      )}

      {showForm && (
        <div className="job-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowForm(false)}>
          <form className="job-details-modal cd-submit-modal" role="dialog" aria-modal="true" aria-labelledby="us-form-title" onSubmit={handleCreate}>
            <div className="cd-modal-head">
              <div>
                <h2 id="us-form-title">Add User</h2>
                <p>The person signs in with this email and the temporary password.</p>
              </div>
              <button type="button" className="job-modal-close" aria-label="Close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="cd-form-grid">
              <label className="cd-field cd-field-wide">
                <span>Full name</span>
                <input value={form.fullName} maxLength={200} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="e.g. Anil Kumar" />
              </label>
              <label className="cd-field cd-field-wide">
                <span>Designation</span>
                <input value={form.jobTitle} maxLength={120} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} placeholder="e.g. Senior Recruiter, HR Manager" />
              </label>
              <label className="cd-field cd-field-wide">
                <span>Email *</span>
                <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
              </label>
              <label className="cd-field cd-field-wide">
                <span>Role *</span>
                <select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value, vendorId: '', clientId: '' })} required>
                  <option value="">Choose a role…</option>
                  {roles.map((role) => <option key={role.id} value={role.id}>{ROLE_LABEL[role.name] ?? role.name}</option>)}
                </select>
                {roleName && <small>{ROLE_HELP[roleName] ?? selectedRole?.description}</small>}
              </label>
              {roleName === 'Vendor' && (
                <label className="cd-field cd-field-wide">
                  <span>Channel partner *</span>
                  <select value={form.vendorId} onChange={(event) => setForm({ ...form, vendorId: event.target.value })}>
                    <option value="">Choose the partner company…</option>
                    {vendors.filter((vendor) => vendor.is_active).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                  </select>
                </label>
              )}
              {roleName === 'Client' && (
                <label className="cd-field cd-field-wide">
                  <span>Client company *</span>
                  <select value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })}>
                    <option value="">Choose the client company…</option>
                    {clients.filter((client) => client.is_active).map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}
                  </select>
                </label>
              )}
              <label className="cd-field cd-field-wide">
                <span>Temporary password * (min. 12 characters)</span>
                <div className="us-password">
                  <input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={12} required />
                  <button type="button" className="cd-secondary" onClick={() => setForm({ ...form, password: generatePassword() })}>Generate</button>
                </div>
              </label>
            </div>
            {formError && <p className="error-message" role="alert">{formError}</p>}
            <div className="cd-modal-actions">
              <button type="button" className="cd-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create login'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
