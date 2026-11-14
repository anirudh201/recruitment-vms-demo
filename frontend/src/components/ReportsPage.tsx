import { useEffect, useMemo, useState } from 'react'
import {
  downloadReportExcel,
  getReport,
  listReports,
  type Client,
  type ReportColumn,
  type ReportFilters,
  type ReportInfo,
  type ReportPage,
} from '../api/client'
import { formatDate } from '../dashboardStats'
import { formatCtc } from '../positionFormat'

const PAGE_SIZE = 100

// yyyy-mm-dd (from <input type="date">) -> local midnight
function localDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}
function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatCell(value: string | number | null | undefined, column: ReportColumn): string {
  if (value === null || value === undefined || value === '') return '—'
  switch (column.type) {
    case 'date':
      return formatDate(String(value))
    case 'money':
      return formatCtc(Number(value))
    case 'percent':
      return `${(Number(value) * 100).toFixed(1)}%`
    case 'number':
      return Number(value).toLocaleString('en-IN')
    default:
      return String(value)
  }
}

const PRESETS: Array<{ key: string; label: string; range: () => [string, string] }> = [
  { key: 'all', label: 'All time', range: () => ['', ''] },
  {
    key: 'month',
    label: 'This month',
    range: () => {
      const now = new Date()
      return [isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), isoDay(now)]
    },
  },
  {
    key: '30',
    label: 'Last 30 days',
    range: () => {
      const now = new Date()
      return [isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)), isoDay(now)]
    },
  },
  {
    key: 'year',
    label: 'This year',
    range: () => {
      const now = new Date()
      return [isoDay(new Date(now.getFullYear(), 0, 1)), isoDay(now)]
    },
  },
]

export default function ReportsPage({ token, clients }: { token: string | null; clients: Client[] }) {
  const [reports, setReports] = useState<ReportInfo[] | null>(null)
  const [activeKey, setActiveKey] = useState('submissions')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [clientId, setClientId] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<{ queryKey: string; data: ReportPage } | null>(null)
  const [error, setError] = useState<{ queryKey: string; message: string } | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const filters: ReportFilters = useMemo(() => {
    const start = localDate(fromDate)
    const to = localDate(toDate)
    const end = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1) : null   // "to" day is included
    return { start, end, clientId: clientId === 'all' ? null : Number(clientId), q }
  }, [fromDate, toDate, clientId, q])
  const queryKey = JSON.stringify({ activeKey, fromDate, toDate, clientId, q, page })

  useEffect(() => {
    if (!token) return
    let cancelled = false
    listReports(token)
      .then((list) => !cancelled && setReports(Array.isArray(list) ? list : []))
      .catch(() => !cancelled && setReports([]))
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getReport(token, activeKey, filters, page)
      .then((data) => !cancelled && setResult({ queryKey, data }))
      .catch((err) => !cancelled && setError({ queryKey, message: err instanceof Error ? err.message : 'The report could not be loaded.' }))
    return () => {
      cancelled = true
    }
  }, [token, activeKey, filters, page, queryKey])

  // search as you type, without a request per keystroke
  useEffect(() => {
    if (searchInput === q) return
    const timer = setTimeout(() => {
      setQ(searchInput)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput, q])

  const loading = result?.queryKey !== queryKey && error?.queryKey !== queryKey
  const failed = error?.queryKey === queryKey ? error.message : null
  const data = result?.data && result.data.key === activeKey ? result.data : null
  const activeInfo = reports?.find((report) => report.key === activeKey)
  const firstRow = data && data.total > 0 ? (data.page - 1) * data.page_size + 1 : 0
  const lastRow = data ? Math.min(data.page * data.page_size, data.total) : 0
  const filtersActive = Boolean(fromDate || toDate || clientId !== 'all' || q)
  const activePreset = PRESETS.find((preset) => {
    const [from, to] = preset.range()
    return from === fromDate && to === toDate
  })?.key

  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }
  const chooseReport = change(setActiveKey)

  async function download() {
    if (!token) return
    setDownloading(true)
    setDownloadError(null)
    try {
      const blob = await downloadReportExcel(token, activeKey, filters)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${activeKey}-report-${isoDay(new Date())}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'The Excel file could not be created.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <header className="page-header" id="reports">
        <h1>Reports</h1>
        <p>Positions, candidates, closures and performance. Up to 100 rows per page; Excel downloads include every matching row.</p>
      </header>

      <section className="welcome-card jobs-card cd-card rp-card">
        <div className="rp-tabs" role="tablist" aria-label="Report">
          {(reports ?? []).map((report) => (
            <button
              key={report.key}
              type="button"
              role="tab"
              aria-selected={activeKey === report.key}
              className={activeKey === report.key ? 'active' : ''}
              onClick={() => chooseReport(report.key)}
            >
              {report.title}
            </button>
          ))}
        </div>
        {activeInfo && <p className="rp-description">{activeInfo.description}</p>}

        <div className="rp-filters">
          <div className="rp-presets" role="group" aria-label="Period">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                className={activePreset === preset.key ? 'active' : ''}
                aria-pressed={activePreset === preset.key}
                onClick={() => {
                  const [from, to] = preset.range()
                  setFromDate(from)
                  setToDate(to)
                  setPage(1)
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="rp-field">
            <span>From</span>
            <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => change(setFromDate)(event.target.value)} />
          </label>
          <label className="rp-field">
            <span>To</span>
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => change(setToDate)(event.target.value)} />
          </label>
          <label className="rp-field">
            <span>Client</span>
            <select value={clientId} onChange={(event) => change(setClientId)(event.target.value)}>
              <option value="all">All clients</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}
            </select>
          </label>
          <label className="rp-field rp-search">
            <span>Search</span>
            <input type="search" value={searchInput} placeholder="Name, position, client…" onChange={(event) => setSearchInput(event.target.value)} />
          </label>
          {filtersActive && (
            <button
              type="button"
              className="jobs-search-clear rp-clear"
              onClick={() => {
                setFromDate('')
                setToDate('')
                setClientId('all')
                setSearchInput('')
                setQ('')
                setPage(1)
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="rp-bar">
          <p className="rp-count" aria-live="polite">
            {failed ? '' : data ? (data.total === 0 ? 'No rows match these filters.' : `Showing ${firstRow.toLocaleString('en-IN')}–${lastRow.toLocaleString('en-IN')} of ${data.total.toLocaleString('en-IN')} rows`) : 'Loading report…'}
          </p>
          <button type="button" className="rp-download" disabled={downloading || !data || data.total === 0} onClick={() => void download()}>
            {downloading ? 'Preparing Excel…' : `Download Excel${data && data.total > 0 ? ` (${data.total.toLocaleString('en-IN')} rows)` : ''}`}
          </button>
        </div>
        {downloadError && <p className="error-message" role="alert">{downloadError}</p>}
        {failed && <p className="error-message" role="alert">{failed}</p>}

        {data && data.total > 0 && (
          <div className={`jobs-table-wrapper rp-table-wrap${loading ? ' rp-loading' : ''}`}>
            <table className="jobs-table rp-table" aria-busy={loading}>
              <thead>
                <tr>
                  <th className="sno-col">S.No</th>
                  {data.columns.map((column) => (
                    <th key={column.key} className={column.type !== 'text' && column.type !== 'date' ? 'rp-num' : undefined}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => (
                  <tr key={index}>
                    <td className="sno-col">{(data.page - 1) * data.page_size + index + 1}</td>
                    {data.columns.map((column) => (
                      <td key={column.key} className={column.type !== 'text' && column.type !== 'date' ? 'rp-num' : undefined}>
                        {formatCell(row[column.key], column)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.pages > 1 && (
          <nav className="cd-pager rp-pager" aria-label="Report pages">
            <button type="button" disabled={page === 1} onClick={() => setPage(1)}>« First</button>
            <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>‹ Previous</button>
            <span>Page {data.page} of {data.pages} · {PAGE_SIZE} rows per page</span>
            <button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next ›</button>
            <button type="button" disabled={page >= data.pages} onClick={() => setPage(data.pages)}>Last »</button>
          </nav>
        )}
      </section>
    </>
  )
}
