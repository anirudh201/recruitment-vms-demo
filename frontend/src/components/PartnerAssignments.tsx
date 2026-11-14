import { useEffect, useState } from 'react'
import {
  assignVendorToJob,
  unassignVendorFromJob,
  type CandidateSubmission,
  type Client,
  type Job,
  type JobAssignment,
  type Vendor,
} from '../api/client'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
}

function StatusPill({ status }: { status: string }) {
  return <span className={`pa-status pa-status-${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
}

// ---------------------------------------------------------------------------
// Jobs page -> "Manage partners" for one job
// ---------------------------------------------------------------------------

export function JobPartnersModal({
  token,
  job,
  vendors,
  assignments,
  submissions,
  clientName,
  onClose,
  onSaved,
}: {
  token: string | null
  job: Job
  vendors: Vendor[]
  assignments: JobAssignment[]
  submissions: CandidateSubmission[]
  clientName: string
  onClose: () => void
  // message = null keeps the dialog open (some changes failed)
  onSaved: (message: string | null) => Promise<void>
}) {
  useEscape(onClose)
  const assignedIds = new Set(assignments.filter((item) => item.job_id === job.id).map((item) => item.vendor_id))
  const [selected, setSelected] = useState<Set<number>>(() => new Set(assignedIds))
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submissionsBy = (vendorId: number) =>
    submissions.filter((item) => item.job_id === job.id && item.vendor_id === vendorId).length

  // Active partners can be assigned; an inactive one stays listed only if it is still assigned.
  const rows = vendors
    .filter((vendor) => vendor.is_active || assignedIds.has(vendor.id))
    .filter((vendor) => vendor.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Number(assignedIds.has(b.id)) - Number(assignedIds.has(a.id)) || a.name.localeCompare(b.name))

  const toAdd = [...selected].filter((id) => !assignedIds.has(id))
  const toRemove = [...assignedIds].filter((id) => !selected.has(id))
  const nameOf = (id: number) => vendors.find((vendor) => vendor.id === id)?.name ?? `Partner #${id}`
  const removingWithSubmissions = toRemove.filter((id) => submissionsBy(id) > 0)

  function toggle(vendorId: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(vendorId)) next.delete(vendorId)
      else next.add(vendorId)
      return next
    })
  }

  async function handleSave() {
    if (!token) return setError('Your session has expired. Please sign in again.')
    setSaving(true)
    setError(null)
    const failures: string[] = []
    for (const id of toAdd) {
      try {
        await assignVendorToJob(token, job.id, id)
      } catch (err) {
        failures.push(`${nameOf(id)}: ${err instanceof Error ? err.message : 'could not assign'}`)
      }
    }
    for (const id of toRemove) {
      try {
        await unassignVendorFromJob(token, job.id, id)
      } catch (err) {
        failures.push(`${nameOf(id)}: ${err instanceof Error ? err.message : 'could not remove'}`)
      }
    }
    const parts = [toAdd.length ? `${plural(toAdd.length, 'partner')} assigned` : '', toRemove.length ? `${plural(toRemove.length, 'partner')} removed` : '']
      .filter(Boolean)
      .join(', ')
    try {
      await onSaved(failures.length ? null : `${job.title}: ${parts}.`)
    } finally {
      setSaving(false)
    }
    if (failures.length) setError(`Some changes were not saved. ${failures.join(' · ')}`)
  }

  return (
    <div className="job-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="job-details-modal pa-modal" role="dialog" aria-modal="true" aria-labelledby="pa-job-title">
        <div className="cd-modal-head">
          <div>
            <h2 id="pa-job-title">Channel partners — {job.title}</h2>
            <p>{clientName} · {plural(assignedIds.size, 'partner')} assigned</p>
          </div>
          <button type="button" className="job-modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        {job.status !== 'open' && (
          <p className="pa-note">This job is <strong>{job.status}</strong>. Assigned partners can see it, but candidates can only be submitted while it is open.</p>
        )}

        {vendors.length === 0 ? (
          <p className="cd-empty-note">No channel partners yet. Add partners on the Vendors page first.</p>
        ) : (
          <>
            <input
              type="search"
              className="jobs-search-input pa-search"
              placeholder="Search partners…"
              aria-label="Search partners"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <ul className="pa-list">
              {rows.map((vendor) => {
                const count = submissionsBy(vendor.id)
                return (
                  <li key={vendor.id}>
                    <label className={selected.has(vendor.id) ? 'pa-row pa-row-on' : 'pa-row'}>
                      <input type="checkbox" checked={selected.has(vendor.id)} onChange={() => toggle(vendor.id)} />
                      <span className="pa-row-main">
                        <strong>{vendor.name}</strong>
                        <small>
                          {[vendor.contact_name, vendor.contact_email].filter(Boolean).join(' · ') || 'No contact details'}
                          {!vendor.is_active && ' · inactive'}
                        </small>
                      </span>
                      <span className="pa-row-count">{count > 0 ? plural(count, 'submission') : ''}</span>
                    </label>
                  </li>
                )
              })}
              {rows.length === 0 && <li className="cd-hint">No partners match “{search}”.</li>}
            </ul>
          </>
        )}

        {removingWithSubmissions.length > 0 && (
          <p className="pa-note">
            Removing {removingWithSubmissions.map(nameOf).join(', ')} stops new submissions for this job. Their existing candidates are kept.
          </p>
        )}
        {error && <p className="error-message" role="alert">{error}</p>}

        <div className="cd-modal-actions">
          <button type="button" className="cd-secondary" onClick={onClose}>Cancel</button>
          <button type="button" disabled={saving || (toAdd.length === 0 && toRemove.length === 0)} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vendors page -> one partner's assigned requirements, grouped by client
// ---------------------------------------------------------------------------

export function PartnerRequirementsModal({
  token,
  vendor,
  jobs,
  clients,
  assignments,
  submissions,
  onClose,
  onChanged,
}: {
  token: string | null
  vendor: Vendor
  jobs: Job[]
  clients: Client[]
  assignments: JobAssignment[]
  submissions: CandidateSubmission[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  useEscape(onClose)
  const [jobToAdd, setJobToAdd] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const assignedJobIds = new Set(assignments.filter((item) => item.vendor_id === vendor.id).map((item) => item.job_id))
  const assignedJobs = jobs.filter((job) => assignedJobIds.has(job.id))
  const clientNameOf = (clientId: number | null | undefined) =>
    clientId == null ? 'No client linked' : clients.find((client) => client.id === clientId)?.company_name ?? `Client #${clientId}`
  const groups = new Map<string, Job[]>()
  for (const job of assignedJobs) {
    const name = clientNameOf(job.client_id)
    groups.set(name, [...(groups.get(name) ?? []), job])
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const available = jobs.filter((job) => job.status === 'open' && !assignedJobIds.has(job.id))
  const submissionsOn = (jobId: number) => submissions.filter((item) => item.vendor_id === vendor.id && item.job_id === jobId).length

  async function run(key: string, action: () => Promise<unknown>) {
    if (!token) return setError('Your session has expired. Please sign in again.')
    setBusy(key)
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be saved.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="job-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="job-details-modal pa-modal" role="dialog" aria-modal="true" aria-labelledby="pa-vendor-title">
        <div className="cd-modal-head">
          <div>
            <h2 id="pa-vendor-title">Assigned requirements — {vendor.name}</h2>
            <p>{plural(assignedJobs.length, 'requirement')} across {plural(groups.size, 'client')}</p>
          </div>
          <button type="button" className="job-modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        {vendor.is_active ? (
          <div className="pa-add">
            <select aria-label="Requirement to assign" value={jobToAdd} onChange={(event) => setJobToAdd(event.target.value)} disabled={available.length === 0}>
              <option value="">{available.length === 0 ? 'All open requirements are already assigned' : 'Assign an open requirement…'}</option>
              {available.map((job) => (
                <option key={job.id} value={job.id}>{job.title} — {clientNameOf(job.client_id)}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!jobToAdd || busy !== null}
              onClick={() => void run('add', async () => {
                await assignVendorToJob(token as string, Number(jobToAdd), vendor.id)
                setJobToAdd('')
              })}
            >
              {busy === 'add' ? 'Assigning…' : 'Assign'}
            </button>
          </div>
        ) : (
          <p className="pa-note">This partner is inactive, so no new requirements can be assigned.</p>
        )}

        {error && <p className="error-message" role="alert">{error}</p>}

        {assignedJobs.length === 0 ? (
          <p className="cd-empty-note">No requirements assigned yet.</p>
        ) : (
          sortedGroups.map(([client, clientJobs]) => (
            <div className="pa-group" key={client}>
              <h3>{client} <span>{plural(clientJobs.length, 'requirement')}</span></h3>
              <ul className="pa-req-list">
                {clientJobs.map((job) => (
                  <li key={job.id}>
                    <span className="pa-row-main">
                      <strong>{job.title}</strong>
                      <small>Job ID {job.id} · {plural(submissionsOn(job.id), 'submission')} from this partner</small>
                    </span>
                    <StatusPill status={job.status} />
                    <button
                      type="button"
                      className="pa-remove"
                      aria-label={`Remove ${vendor.name} from ${job.title}`}
                      disabled={busy !== null}
                      onClick={() => void run(`remove-${job.id}`, () => unassignVendorFromJob(token as string, job.id, vendor.id))}
                    >
                      {busy === `remove-${job.id}` ? 'Removing…' : 'Remove'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}

        <div className="cd-modal-actions">
          <button type="button" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  )
}
