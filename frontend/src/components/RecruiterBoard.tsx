import { useEffect, useState } from 'react'
import { getRecruiterPerformance, type RecruiterPerformance } from '../api/client'
import { formatDate } from '../dashboardStats'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function RecruiterDetail({
  recruiter,
  periodLabel,
  onClose,
}: {
  recruiter: RecruiterPerformance
  periodLabel: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const t = recruiter.totals
  const stats: Array<[string, number]> = [
    [`Closures ${periodLabel.toLowerCase()}`, t.closures_in_period],
    ['Closures (all time)', t.closures],
    ['Joined', t.joined],
    ['Positions', t.positions],
    ['Submissions', t.submissions],
    ['In process', t.in_process],
  ]

  return (
    <div className="job-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="job-details-modal rb-modal" role="dialog" aria-modal="true" aria-labelledby="rb-detail-title">
        <div className="cd-modal-head">
          <div>
            <h2 id="rb-detail-title">{recruiter.name}</h2>
            <p>{recruiter.email}</p>
          </div>
          <button type="button" className="job-modal-close" aria-label="Close recruiter details" onClick={onClose}>×</button>
        </div>

        <div className="rb-stats">
          {stats.map(([label, value]) => (
            <div key={label} className="rb-stat">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <section className="rb-section" aria-label="Assigned positions">
          <h3>Assigned positions <span>{t.positions}</span></h3>
          {recruiter.positions.length === 0 ? (
            <p className="rb-empty">No positions assigned yet. Assign them on the Jobs page.</p>
          ) : (
            <div className="rb-table-wrap">
              <table className="rb-table">
                <thead><tr><th className="sno-col">S.No</th><th>Position</th><th>Client</th><th>Status</th><th>Openings</th><th>Submissions</th><th>Closures</th></tr></thead>
                <tbody>
                  {recruiter.positions.map((position, index) => (
                    <tr key={position.id}>
                      <td className="sno-col">{index + 1}</td>
                      <td><strong>{position.title}</strong></td>
                      <td>{position.client_name ?? 'No client'}</td>
                      <td><span className={`pa-status pa-status-${position.status}`}>{position.status.charAt(0).toUpperCase() + position.status.slice(1)}</span></td>
                      <td>{position.openings}</td>
                      <td>{position.submissions}</td>
                      <td><strong>{position.closures}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="rb-two">
          <section className="rb-section" aria-label="Clients">
            <h3>Clients <span>{recruiter.clients.length}</span></h3>
            {recruiter.clients.length === 0 ? (
              <p className="rb-empty">No clients yet.</p>
            ) : (
              <ul className="rb-list">
                {recruiter.clients.map((client) => (
                  <li key={client.id}>
                    <strong>{client.name}</strong>
                    <span>{plural(client.positions, 'position')} · {plural(client.closures, 'closure')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rb-section" aria-label="Partners">
            <h3>Partners (vendors) <span>{recruiter.vendors.length}</span></h3>
            {recruiter.vendors.length === 0 ? (
              <p className="rb-empty">No partners on these positions yet.</p>
            ) : (
              <ul className="rb-list">
                {recruiter.vendors.map((vendor) => (
                  <li key={vendor.id}>
                    <strong>{vendor.name}</strong>
                    <span>{plural(vendor.submissions, 'submission')} · {plural(vendor.closures, 'closure')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="rb-section" aria-label="Closures">
          <h3>Closures <span>{t.closures}</span></h3>
          {recruiter.closures.length === 0 ? (
            <p className="rb-empty">No closures yet.</p>
          ) : (
            <div className="rb-table-wrap">
              <table className="rb-table">
                <thead><tr><th className="sno-col">S.No</th><th>Candidate</th><th>Position</th><th>Client</th><th>Partner</th><th>Stage</th><th>Closed on</th></tr></thead>
                <tbody>
                  {recruiter.closures.map((closure, index) => (
                    <tr key={closure.submission_id}>
                      <td className="sno-col">{index + 1}</td>
                      <td><strong>{closure.candidate_name}</strong></td>
                      <td>{closure.job_title}</td>
                      <td>{closure.client_name ?? 'No client'}</td>
                      <td>{closure.vendor_name ?? 'Internal'}</td>
                      <td><span className={`cd-badge ${closure.status === 'Joined' ? 'cd-badge-inprocess' : 'cd-badge-placed'}`}>{closure.status}</span></td>
                      <td>
                        {formatDate(closure.closed_at)}
                        {closure.in_period && <span className="rb-period-tag">{periodLabel}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </div>
  )
}

export default function RecruiterBoard({
  token,
  range,
  periodLabel,
  onOpenJobs,
}: {
  token: string | null
  range: { start: Date; end: Date }
  periodLabel: string
  onOpenJobs?: () => void
}) {
  const [data, setData] = useState<{ recruiters: RecruiterPerformance[]; unassigned_open_positions: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const startIso = range.start.toISOString()
  const endIso = range.end.toISOString()

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getRecruiterPerformance(token, { start: new Date(startIso), end: new Date(endIso) })
      .then((result) => {
        if (cancelled) return
        // tolerate an unexpected/older response instead of breaking the dashboard
        setData({
          recruiters: Array.isArray(result?.recruiters) ? result.recruiters : [],
          unassigned_open_positions: Number(result?.unassigned_open_positions) || 0,
        })
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Unable to load recruiters.'))
    return () => {
      cancelled = true
    }
  }, [token, startIso, endIso])

  const selected = data?.recruiters.find((recruiter) => recruiter.id === selectedId) ?? null

  return (
    <section className="vx-card rb-card" aria-label="Recruiter performance">
      <div className="vx-card-head">
        <h2>Recruiter Performance</h2>
        <span className="vx-card-sub">{periodLabel}</span>
      </div>
      <p className="rb-caption">Ranked by closures (Selected, Offer Accepted or Joined).</p>

      {error ? (
        <p className="vx-empty">{error}</p>
      ) : data === null ? (
        <p className="vx-empty">Loading recruiters…</p>
      ) : data.recruiters.length === 0 ? (
        <p className="vx-empty">No recruiter logins yet. Add recruiters on the Users page, then assign them positions on the Jobs page.</p>
      ) : (
        <ol className="rb-cards">
          {data.recruiters.map((recruiter, index) => (
            <li key={recruiter.id}>
              <button type="button" className="rb-recruiter" onClick={() => setSelectedId(recruiter.id)} aria-label={`Open details for ${recruiter.name}`}>
                <span className={`rb-rank${index === 0 && recruiter.totals.closures_in_period > 0 ? ' rb-rank-top' : ''}`}>{index + 1}</span>
                <span className="rb-who">
                  <strong>{recruiter.name}</strong>
                  <small>
                    {plural(recruiter.totals.positions, 'position')} · {plural(recruiter.totals.clients, 'client')} · {plural(recruiter.totals.vendors, 'partner')}
                  </small>
                </span>
                <span className="rb-closures">
                  <strong>{recruiter.totals.closures_in_period}</strong>
                  <small>{recruiter.totals.closures_in_period === 1 ? 'closure' : 'closures'}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {data !== null && data.unassigned_open_positions > 0 && (
        <p className="rb-unassigned">
          {plural(data.unassigned_open_positions, 'open position')} {data.unassigned_open_positions === 1 ? 'has' : 'have'} no recruiter.
          {onOpenJobs && <button type="button" className="cd-link" onClick={onOpenJobs}>Assign on the Jobs page</button>}
        </p>
      )}

      {selected && <RecruiterDetail recruiter={selected} periodLabel={periodLabel} onClose={() => setSelectedId(null)} />}
    </section>
  )
}
