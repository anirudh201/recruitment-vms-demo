import { useEffect, useState } from 'react'
import type { Client, Job } from '../api/client'
import { experienceRange, offeredCtc } from '../positionFormat'

export default function ClientPositionsModal({
  client,
  jobs,
  canManageJobs,
  onClose,
  onViewJD,
  onAddJob,
}: {
  client: Client
  jobs: Job[]
  canManageJobs: boolean
  onClose: () => void
  onViewJD: (job: Job) => void
  onAddJob: (clientId: number) => void
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const clientJobs = jobs.filter((job) => job.client_id === client.id)
  const query = search.trim().toLowerCase()
  const visible = clientJobs
    .filter((job) => status === 'ALL' || job.status?.toLowerCase() === status)
    .filter((job) => !query || [job.title, String(job.id), job.qualification, job.location].some((value) => String(value ?? '').toLowerCase().includes(query)))

  return (
    <div className="job-modal-backdrop client-jd-list-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="job-details-modal client-jd-list-modal cpm-modal" role="dialog" aria-modal="true" aria-labelledby="client-jd-list-title">
        <div className="job-details-heading">
          <div>
            <p className="jd-document-kicker">CLIENT POSITIONS</p>
            <h2 id="client-jd-list-title">{client.company_name}</h2>
            <p>{clientJobs.length} position(s)</p>
          </div>
          <button type="button" className="job-modal-close" aria-label="Close client positions" onClick={onClose}>×</button>
        </div>

        <div className="client-jd-list-tools">
          <input aria-label="Search positions" placeholder="Search by position, qualification or job ID…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="Filter positions by status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="client-jd-list-table-wrap">
          <table className="client-jd-list-table cpm-table">
            <thead>
              <tr>
                <th className="cpm-sno">S.No</th>
                <th>Position</th>
                <th>Experience</th>
                <th>Qualification</th>
                <th>Offered CTC</th>
                <th>JD</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((job, index) => (
                <tr key={job.id}>
                  <td className="cpm-sno">{index + 1}</td>
                  <td>
                    <strong>{job.title}</strong>
                    <span className={`pa-status pa-status-${job.status} cpm-status`}>{job.status.charAt(0).toUpperCase() + job.status.slice(1)}</span>
                  </td>
                  <td>{experienceRange(job)}</td>
                  <td>{job.qualification || 'Not specified'}</td>
                  <td>{offeredCtc(job)}</td>
                  <td>
                    <button type="button" className="client-jd-view-button" aria-label={`View JD for ${job.title}`} onClick={() => onViewJD(job)}>
                      View JD
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="jobs-no-results">
                    {clientJobs.length === 0 ? 'No positions for this client yet.' : 'No positions match these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="jd-document-actions">
          {canManageJobs && <button type="button" onClick={() => onAddJob(client.id)}>+ Add Job Requirement</button>}
          <button type="button" className="client-jd-secondary-button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  )
}
