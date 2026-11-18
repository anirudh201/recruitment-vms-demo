import { useEffect, useState } from 'react'
import { Skeleton } from './Loading'
import { getRevenue, type RevenueSummary } from '../api/client'

const rupees = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function label(key: string, bucket: 'day' | 'month') {
  const [, month, day] = key.split('-').map(Number)
  return bucket === 'month' ? MONTHS[month - 1] : String(day)
}

function Bars({ data, bucket }: { data: RevenueSummary['buckets']; bucket: 'day' | 'month' }) {
  const width = 640
  const height = 170
  const max = Math.max(...data.map((slot) => slot.revenue), 1)
  const step = width / Math.max(data.length, 1)
  const every = data.length > 16 ? 5 : 1                         // label every 5th day in a month
  return (
    <svg className="rv-chart" viewBox={`0 0 ${width} ${height + 24}`} role="img" aria-label={`Revenue by ${bucket}`}>
      <line x1="0" y1={height} x2={width} y2={height} stroke="var(--vx-border, #e5e7eb)" />
      {data.map((slot, index) => {
        const barHeight = slot.revenue > 0 ? Math.max((slot.revenue / max) * (height - 8), 3) : 0
        const x = index * step + step * 0.18
        return (
          <g key={slot.key}>
            {barHeight > 0 && (
              <rect x={x} y={height - barHeight} width={step * 0.64} height={barHeight} rx="3" fill="var(--brand-navy, #0b2a5b)">
                <title>{`${slot.key}: ${rupees(slot.revenue)} from ${slot.joins} join${slot.joins === 1 ? '' : 's'}`}</title>
              </rect>
            )}
            {(index % every === 0 || index === data.length - 1) && (
              <text x={x + step * 0.32} y={height + 16} textAnchor="middle" fontSize="11" fill="#6b7280">{label(slot.key, bucket)}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function RevenueCard({
  token,
  range,
  bucket,
  periodLabel,
}: {
  token: string | null
  range: { start: Date; end: Date }
  bucket: 'day' | 'month'
  periodLabel: string
}) {
  const [data, setData] = useState<RevenueSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const startIso = range.start.toISOString()
  const endIso = range.end.toISOString()

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getRevenue(token, { start: new Date(startIso), end: new Date(endIso) }, bucket)
      .then((result) => !cancelled && setData(result && Array.isArray(result.buckets) ? result : null))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Revenue could not be loaded.'))
    return () => {
      cancelled = true
    }
  }, [token, startIso, endIso, bucket])

  return (
    <section className="vx-card rv-card" aria-label="Revenue">
      <div className="vx-card-head">
        <h2>Revenue</h2>
        <span className="vx-card-sub">{periodLabel}</span>
      </div>
      {error ? (
        <p className="vx-empty">{error}</p>
      ) : !data ? (
        <div className="rv-loading" role="status" aria-label="Loading revenue…"><Skeleton width={150} height={34} /><Skeleton width="100%" height={110} /><Skeleton width="70%" height={12} /></div>
      ) : (
        <>
          <div className="rv-total">
            <strong>{rupees(data.total)}</strong>
            <span>from {data.joins} join{data.joins === 1 ? '' : 's'}</span>
          </div>
          <Bars data={data.buckets} bucket={bucket} />
          {data.clients.length > 0 && (
            <ul className="rv-clients" aria-label="Revenue by client">
              {data.clients.slice(0, 3).map((client) => (
                <li key={client.client_name}>
                  <span>{client.client_name}</span>
                  <strong>{rupees(client.revenue)}</strong>
                </li>
              ))}
            </ul>
          )}
          {data.missing_ctc > 0 && (
            <p className="rv-warning">
              {data.missing_ctc} join{data.missing_ctc === 1 ? ' has' : 's have'} no CTC recorded, so {data.missing_ctc === 1 ? 'it counts' : 'they count'} as ₹0. Add the CTC in the candidate’s details.
            </p>
          )}
          <p className="rv-note">Fee of {data.default_fee_percent}% of annual CTC per hire, unless a client has its own fee. Counted on the joining date.</p>
        </>
      )}
    </section>
  )
}
