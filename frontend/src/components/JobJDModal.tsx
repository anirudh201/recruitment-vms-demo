import { useEffect, useState } from 'react'
import { fetchJobJDFile, uploadJobJDFile, type Job } from '../api/client'

type SectionName =
  | 'overview'
  | 'details'
  | 'location'
  | 'responsibilities'
  | 'qualifications'
  | 'skills'
  | 'compensation'

type SectionLines = Record<SectionName, string[]>

// ---------------------------------------------------------------------------
// Parsing the extracted JD text into display sections
// ---------------------------------------------------------------------------

// A line that is ONLY one of these words/phrases starts a new section.
const HEADING_RULES: Array<{ pattern: RegExp; section: SectionName }> = [
  { pattern: /^(key\s+|core\s+|job\s+)?responsibilit(y|ies)$/i, section: 'responsibilities' },
  { pattern: /^roles?\s*(&|and)\s*responsibilit(y|ies)$/i, section: 'responsibilities' },
  { pattern: /^(key\s+)?duties$/i, section: 'responsibilities' },
  { pattern: /^((required|mandatory|preferred|technical|key|primary|secondary)\s+)?skills?(\s+required)?$/i, section: 'skills' },
  { pattern: /^(good|nice)[\s-]to[\s-]have(\s+skills)?$/i, section: 'skills' },
  { pattern: /^competencies$/i, section: 'skills' },
  { pattern: /^(qualifications?|education(\s+and\s+experience)?|experience\s+required|requirements?)$/i, section: 'qualifications' },
  { pattern: /^(location|working\s+location|work\s+location|work\s+mode|job\s+location)$/i, section: 'location' },
  { pattern: /^(role\s+overview|job\s+summary|summary|about\s+the\s+role|job\s+description|overview)$/i, section: 'overview' },
  { pattern: /^(compensation(\s+and\s+benefits)?|salary(\s+range)?|benefits|ctc)$/i, section: 'compensation' },
]

// "Label: value" lines that always belong to one specific section.
const META_RULES: Array<[RegExp, SectionName]> = [
  [/^employment\s*type\s*:/i, 'details'],
  [/^company(?:\s*name)?\s*:/i, 'details'],
  [/^(?:joining|joining\s*time|notice\s*period)\s*:/i, 'details'],
  [/^(?:working\s+|job\s+)?location\s*:/i, 'location'],
  [/^work\s*(?:mode|type|arrangement)\s*:/i, 'location'],
  [/^(?:no\.?\s*of\s*(?:positions|openings)|number\s+of\s+(?:positions|openings)|openings|vacancies)\s*:/i, 'compensation'],
  [/^experience\s*:/i, 'qualifications'],
  [/^(?:educational\s+)?qualification\s*:/i, 'qualifications'],
  [/^(?:ctc|salary|budget|compensation)\s*:/i, 'compensation'],
  [/^salary\s+(?:up\s*to|of|range|between)\b/i, 'compensation'],
]

// The title is already shown in the modal header.
const DROP_PATTERN = /^(?:job|position)\s*title\s*:/i

const LABEL_PREFIX =
  /^(?:qualification|education|experience|location|work\s*mode|work\s*type|ctc|salary|budget|openings|no\.?\s*of\s*(?:positions|openings))\s*:\s*/i

// Emoji and pictograms (📍 🏢 💰 ...) are decoration in designed JDs; they only add noise as text.
const PICTOGRAPHS = /\p{Extended_Pictographic}/gu
const INVISIBLE_JOINERS = /\u200d|\ufe0f|\u20e3/g

function splitLines(value?: string | null): string[] {
  return (value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(PICTOGRAPHS, '').replace(INVISIBLE_JOINERS, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

// Same text with or without a "Label:" prefix, bullet, or odd spacing counts as a duplicate.
function dedupeKey(line: string): string {
  return line
    .replace(/^[-*•\u2022]\s*/, '')
    .replace(LABEL_PREFIX, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function dedupe(lines: string[]): string[] {
  const seen = new Set<string>()
  return lines.filter((line) => {
    const key = dedupeKey(line)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Skills may be saved one per line in the job fields but comma-separated in the JD text,
// so a line counts as a duplicate when every skill in it has already been shown.
function dedupeSkills(lines: string[]): string[] {
  const seenLines = new Set<string>()
  const seenSkills = new Set<string>()
  return lines.filter((line) => {
    const key = dedupeKey(line)
    if (!key || seenLines.has(key)) return false
    seenLines.add(key)
    if (/:$/.test(line)) return true
    const skills = key.split(/[,;]/).map((skill) => skill.trim()).filter(Boolean)
    const isNew = skills.some((skill) => !seenSkills.has(skill))
    skills.forEach((skill) => seenSkills.add(skill))
    return isNew
  })
}

function normalizeHeading(line: string): string {
  return line
    .replace(/^#+\s*/, '')
    .replace(/^\*+|\*+$/g, '')
    .replace(/:$/, '')
    .trim()
}

function skillGroupLabel(heading: string): string | null {
  if (/^(mandatory|required|technical|key|primary)/i.test(heading)) return 'Mandatory skills:'
  if (/^(preferred|good|nice|secondary)/i.test(heading)) return 'Preferred skills:'
  return null
}

function parseStructuredJD(job: Job): Record<SectionName, string[]> {
  const result: SectionLines = {
    overview: [],
    details: [],
    location: [],
    responsibilities: [],
    qualifications: [],
    skills: [],
    compensation: [],
  }

  const lines = splitLines(job.description)
  // Skip a first line that only repeats the job title.
  if (lines.length > 0 && lines[0].toLowerCase() === (job.title ?? '').trim().toLowerCase()) {
    lines.shift()
  }

  let active: SectionName = 'overview'

  for (const originalLine of lines) {
    const line = originalLine.replace(/^[-*•\u2022]\s*/, '').trim()
    if (!line || DROP_PATTERN.test(line)) continue

    // 1. A bare heading line switches the active section and is not shown as content.
    const heading = normalizeHeading(line)
    const headingRule = heading.length <= 60 ? HEADING_RULES.find((rule) => rule.pattern.test(heading)) : undefined
    if (headingRule) {
      active = headingRule.section
      if (active === 'skills') {
        const label = skillGroupLabel(heading)
        if (label) result.skills.push(label)
      }
      continue
    }

    // 2. "Label: value" lines with a fixed home (location, experience, CTC...).
    const meta = META_RULES.find(([pattern]) => pattern.test(line))
    if (meta) {
      result[meta[1]].push(line)
      continue
    }

    // 3. Markdown-style inline heading: "## Key Responsibilities - Generate leads".
    const markdownInline = line.match(/^#+\s*([^:–-]{2,50})\s*[:–-]\s*(.+)$/)
    if (markdownInline) {
      const rule = HEADING_RULES.find((candidate) => candidate.pattern.test(normalizeHeading(markdownInline[1])))
      if (rule) {
        active = rule.section
        result[active].push(markdownInline[2].trim())
        continue
      }
    }

    // 4. Inline heading with content: "Mandatory Skills: Oracle PLM, SQL".
    const labelled = line.match(/^([^:]{2,40}):\s*(\S.*)$/)
    if (labelled) {
      const rule = HEADING_RULES.find((candidate) => candidate.pattern.test(normalizeHeading(labelled[1])))
      if (rule) {
        active = rule.section
        result[active].push(line)
        continue
      }
    }

    result[active].push(line)
  }

  // Values typed/extracted into the structured job fields come first.
  const mandatory = splitLines(job.mandatory_skills)
  const preferred = splitLines(job.preferred_skills)
  const experienceFromFields =
    job.min_experience != null
      ? `Experience: ${job.min_experience}${job.max_experience != null ? `–${job.max_experience}` : '+'} years`
      : ''

  const qualifications = dedupe([
    job.qualification?.trim() ? `Qualification: ${job.qualification.trim()}` : '',
    ...result.qualifications,
    experienceFromFields && !result.qualifications.some((l) => /^experience\s*:/i.test(l)) ? experienceFromFields : '',
  ])

  const skills = dedupeSkills([
    ...(mandatory.length ? ['Mandatory skills:', ...mandatory] : []),
    ...(preferred.length ? ['Preferred skills:', ...preferred] : []),
    ...result.skills,
  ]).filter((line, index, all) => {
    // Drop a group label that ended up with no lines under it.
    const isLabel = /^(mandatory|preferred) skills:$/i.test(line)
    return !isLabel || (index + 1 < all.length && !/^(mandatory|preferred) skills:$/i.test(all[index + 1]))
  })

  const location = dedupe([
    job.location?.trim() ? `Location: ${job.location.trim()}` : '',
    job.work_arrangement?.trim() ? `Work Mode: ${job.work_arrangement.trim()}` : '',
    ...result.location,
  ])

  const compensation = dedupe([
    job.budget_min != null || job.budget_max != null
      ? `Budget: ${job.budget_min ?? 'Not specified'} – ${job.budget_max ?? 'Not specified'}`
      : '',
    `Openings: ${job.openings}`,
    ...result.compensation,
  ])

  return {
    overview: dedupe(result.overview),
    details: dedupe(result.details),
    location,
    responsibilities: dedupe([...splitLines(job.responsibilities), ...result.responsibilities]),
    qualifications,
    skills,
    compensation,
  }
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

type Fact = { label: string; value: string }

const FACT_PATTERN = /^([A-Za-z][A-Za-z0-9 /&().+'-]{0,34}?):\s*(\S.*)$/

// "Label: value" lines become a fact grid; everything else stays as text.
function splitFacts(lines: string[]): { facts: Fact[]; rest: string[] } {
  const facts: Fact[] = []
  const rest: string[] = []
  for (const line of lines) {
    const match = line.match(FACT_PATTERN)
    if (match && match[1].trim().split(/\s+/).length <= 4) {
      facts.push({ label: match[1].trim(), value: match[2].trim() })
    } else {
      rest.push(line)
    }
  }
  return { facts, rest }
}

function uniqueFacts(facts: Fact[]): Fact[] {
  const seen = new Set<string>()
  return facts.filter((fact) => {
    const key = `${fact.label}|${fact.value}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// PDF lines are visual lines, not sentences: glue wrapped lines back into paragraphs.
function toParagraphs(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    const previous = out[out.length - 1]
    const continues = previous !== undefined && !/[.!?:;]$/.test(previous) && (/^[a-z(]/.test(line) || previous.length >= 60)
    if (continues) out[out.length - 1] = `${previous} ${line}`
    else out.push(line)
  }
  return out
}

// Bullet items: only a line that starts in lowercase continues the previous item.
function toBullets(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    if (out.length > 0 && /^[a-z]/.test(line)) out[out.length - 1] = `${out[out.length - 1]} ${line}`
    else out.push(line)
  }
  return out
}

type SkillGroup = { title: string | null; chips: string[]; notes: string[] }

const SKILL_GROUP_PATTERN =
  /^(mandatory|required|technical|key|primary|preferred|good[\s-]to[\s-]have|nice[\s-]to[\s-]have|secondary)\b[^:]{0,20}:\s*(.*)$/i

function parseSkillGroups(lines: string[]): SkillGroup[] {
  const groups: SkillGroup[] = []
  let current: SkillGroup | null = null
  const ensure = () => {
    if (!current) {
      current = { title: null, chips: [], notes: [] }
      groups.push(current)
    }
    return current
  }
  const addSkills = (text: string) => {
    for (const part of text.split(/[,;|•]/).map((item) => item.trim()).filter(Boolean)) {
      const group = ensure()
      if (part.length <= 50) group.chips.push(part)
      else group.notes.push(part)
    }
  }
  for (const line of lines) {
    const match = line.match(SKILL_GROUP_PATTERN)
    if (match) {
      current = { title: /^(preferred|good|nice|secondary)/i.test(match[1]) ? 'Preferred skills' : 'Mandatory skills', chips: [], notes: [] }
      groups.push(current)
      if (match[2]) addSkills(match[2])
    } else {
      addSkills(line)
    }
  }
  return groups.filter((group) => group.chips.length > 0 || group.notes.length > 0)
}

function FactsGrid({ facts }: { facts: Fact[] }) {
  if (facts.length === 0) return null
  return (
    <dl className="jd-pro-facts">
      {facts.map((fact, index) => (
        <div className="jd-pro-fact" key={`${fact.label}-${index}`}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <ul className="jd-pro-list">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

function Paragraphs({ lines }: { lines: string[] }) {
  const blocks = toParagraphs(lines)
  return (
    <>
      {blocks.map((block, index) => {
        // A short line without a full stop, followed by more text, reads as a sub-heading.
        const isSubheading =
          index < blocks.length - 1 && block.split(/\s+/).length <= 5 && !/[.!?:;,]$/.test(block) && /^[A-Z]/.test(block)
        return isSubheading ? (
          <h4 className="jd-pro-subheading" key={index}>{block}</h4>
        ) : (
          <p className="jd-pro-para" key={index}>{block}</p>
        )
      })}
    </>
  )
}

function FactsAndList({ lines }: { lines: string[] }) {
  const { facts, rest } = splitFacts(lines)
  return (
    <>
      <FactsGrid facts={facts} />
      <BulletList items={toBullets(rest)} />
    </>
  )
}

function SkillChips({ groups }: { groups: SkillGroup[] }) {
  return (
    <>
      {groups.map((group, index) => (
        <div key={index}>
          {group.title && groups.length > 0 && <div className="jd-chip-group-title">{group.title}</div>}
          <div className="jd-chips">
            {group.chips.map((chip, chipIndex) => (
              <span className={`jd-chip${group.title === 'Preferred skills' ? ' jd-chip-preferred' : ''}`} key={chipIndex}>
                {chip}
              </span>
            ))}
          </div>
          <BulletList items={group.notes} />
        </div>
      ))}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="jd-pro-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

// ---------------------------------------------------------------------------
// Original uploaded file: open / download / attach
// ---------------------------------------------------------------------------

function OriginalFileBar({
  job,
  token,
  canManage,
  onJobUpdated,
}: {
  job: Job
  token: string | null
  canManage: boolean
  onJobUpdated: (job: Job) => void
}) {
  const [busy, setBusy] = useState<'open' | 'download' | 'upload' | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileName = job.jd_file_name ?? ''
  const isPdf = fileName.toLowerCase().endsWith('.pdf')

  async function handleOpen(mode: 'open' | 'download') {
    if (!token) {
      setFileError('Your session has expired. Please sign in again.')
      return
    }
    setFileError(null)
    setBusy(mode)
    // A new tab must be opened synchronously inside the click, or popup blockers stop it.
    const tab = mode === 'open' && isPdf ? window.open('', '_blank') : null
    try {
      const blob = await fetchJobJDFile(token, job.id)
      if (tab) {
        const url = URL.createObjectURL(blob)
        tab.location.href = url
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      } else {
        // Word files cannot be previewed by browsers, so they download instead.
        triggerDownload(blob, fileName || 'job-description')
      }
    } catch (err) {
      tab?.close()
      setFileError(err instanceof Error ? err.message : 'Unable to open the JD file.')
    } finally {
      setBusy(null)
    }
  }

  async function handleAttach(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!token) {
      setFileError('Your session has expired. Please sign in again.')
      return
    }
    setFileError(null)
    setBusy('upload')
    try {
      onJobUpdated(await uploadJobJDFile(token, job.id, file))
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Unable to upload the JD file.')
    } finally {
      setBusy(null)
    }
  }

  const attachInput = (label: string) => (
    <label className="jd-file-button jd-file-button-secondary">
      {busy === 'upload' ? 'Uploading…' : label}
      <input
        type="file"
        hidden
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleAttach}
        disabled={busy !== null}
      />
    </label>
  )

  return (
    <div className="jd-file-bar">
      {fileName ? (
        <>
          <div className="jd-file-info">
            <span className="jd-file-label">Original JD file</span>
            <strong title={fileName}>{fileName}</strong>
          </div>
          <div className="jd-file-actions">
            <button type="button" className="jd-file-button" disabled={busy !== null} onClick={() => void handleOpen('open')}>
              {busy === 'open' ? 'Opening…' : isPdf ? 'Open original' : 'Open in Word'}
            </button>
            <button
              type="button"
              className="jd-file-button jd-file-button-secondary"
              disabled={busy !== null}
              onClick={() => void handleOpen('download')}
            >
              {busy === 'download' ? 'Downloading…' : 'Download'}
            </button>
            {canManage && attachInput('Replace file')}
          </div>
        </>
      ) : (
        <>
          <div className="jd-file-info">
            <span className="jd-file-label">Original JD file</span>
            <strong>No file attached to this job</strong>
          </div>
          {canManage && <div className="jd-file-actions">{attachInput('Attach JD (PDF/DOCX)')}</div>}
        </>
      )}
      {fileError && (
        <p className="jd-file-error" role="alert">
          {fileError}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline preview of the original PDF (looks exactly like the uploaded JD)
// ---------------------------------------------------------------------------

function OriginalPreview({ job, token }: { job: Job; token: string | null }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let objectUrl: string | null = null
    let cancelled = false
    fetchJobJDFile(token, job.id)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load the JD file.')
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [job.id, token])

  if (!token) return <p className="jd-original-message">Your session has expired. Please sign in again.</p>
  if (error) return <p className="jd-original-message jd-file-error" role="alert">{error}</p>
  if (!src) return <p className="jd-original-message">Loading original JD…</p>
  return <iframe className="jd-original-frame" title={`Original JD: ${job.jd_file_name ?? job.title}`} src={src} />
}

// ---------------------------------------------------------------------------
// The modal itself (render it ONCE, from App)
// ---------------------------------------------------------------------------

export default function JobJDModal({
  job,
  clientName,
  token,
  canManageJobs,
  hideClient = false,
  onClose,
  onJobUpdated,
}: {
  job: Job
  clientName?: string
  token: string | null
  canManageJobs: boolean
  // Partner logins that may not know the end client.
  hideClient?: boolean
  onClose: () => void
  onJobUpdated: (job: Job) => void
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const hasPdf = (job.jd_file_name ?? '').toLowerCase().endsWith('.pdf')
  const [view, setView] = useState<'original' | 'details'>(hasPdf ? 'original' : 'details')
  const showOriginal = hasPdf && view === 'original'

  function handleJobUpdated(updated: Job) {
    onJobUpdated(updated)
    // A PDF that was just attached is the best thing to show straight away.
    if ((updated.jd_file_name ?? '').toLowerCase().endsWith('.pdf')) setView('original')
  }

  const sections = parseStructuredJD(job)
  const overview = splitFacts(sections.overview)
  const details = splitFacts(sections.details)
  const detailFacts = uniqueFacts([...details.facts, ...overview.facts])
  const employmentType = detailFacts.find((fact) => /^employment\s*type$/i.test(fact.label))?.value
  const gridFacts = detailFacts.filter((fact) => !/^employment\s*type$/i.test(fact.label))
  const aboutLines = [...overview.rest, ...details.rest]
  const skillGroups = parseSkillGroups(sections.skills)
  const hasContent =
    gridFacts.length > 0 ||
    aboutLines.length > 0 ||
    [sections.responsibilities, sections.qualifications, sections.location, sections.compensation].some((lines) => lines.length > 0) ||
    skillGroups.length > 0
  const experience =
    job.min_experience != null
      ? `${job.min_experience}${job.max_experience != null ? `–${job.max_experience}` : '+'} years`
      : 'Not specified'
  const compensation =
    job.budget_min != null || job.budget_max != null
      ? `${job.budget_min ?? 'Not specified'} – ${job.budget_max ?? 'Not specified'}`
      : 'Not specified'
  const status = (job.status || 'draft').toLowerCase()
  const clientLabel = hideClient ? 'Client confidential' : clientName || (job.client_id ? `Client ID: ${job.client_id}` : 'Client not linked')

  return (
    <div
      className="job-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="job-details-modal jd-document jd-professional-layout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jd-professional-title"
      >
        <div className="jd-professional-topbar">
          <div className="jd-professional-title-wrap">
            <span className="jd-professional-eyebrow">JOB DETAILS</span>
            <h2 id="jd-professional-title">{job.title}</h2>
            <p>{clientLabel}</p>
          </div>
          <button type="button" className="job-modal-close" aria-label="Close JD" onClick={onClose}>
            ×
          </button>
        </div>

        <OriginalFileBar key={job.id} job={job} token={token} canManage={canManageJobs} onJobUpdated={handleJobUpdated} />

        <div className="jd-professional-grid">
          <main className="jd-professional-main">
            {hasPdf && (
              <div className="jd-view-tabs" role="tablist" aria-label="JD view">
                <button type="button" role="tab" aria-selected={view === 'original'} className={view === 'original' ? 'active' : ''} onClick={() => setView('original')}>
                  Original JD
                </button>
                <button type="button" role="tab" aria-selected={view === 'details'} className={view === 'details' ? 'active' : ''} onClick={() => setView('details')}>
                  Extracted details
                </button>
              </div>
            )}
            {showOriginal ? (
              <OriginalPreview key={`${job.id}-${job.jd_file_name}`} job={job} token={token} />
            ) : (
            <>
            <div className="jd-overview-cards">
              <div className="jd-overview-card"><span>Experience</span><strong>{experience}</strong></div>
              <div className="jd-overview-card"><span>Employment Type</span><strong title={employmentType}>{employmentType || 'Not specified'}</strong></div>
              <div className="jd-overview-card"><span>Work Type</span><strong>{job.work_arrangement || 'Not specified'}</strong></div>
              <div className="jd-overview-card"><span>Openings</span><strong>{job.openings}</strong></div>
            </div>

            {gridFacts.length > 0 && (
              <Section title="Key Details"><FactsGrid facts={gridFacts} /></Section>
            )}
            {aboutLines.length > 0 && (
              <Section title="Job Description"><Paragraphs lines={aboutLines} /></Section>
            )}
            {sections.responsibilities.length > 0 && (
              <Section title="Responsibilities"><BulletList items={toBullets(sections.responsibilities)} /></Section>
            )}
            {skillGroups.length > 0 && (
              <Section title="Skills Required"><SkillChips groups={skillGroups} /></Section>
            )}
            {sections.qualifications.length > 0 && (
              <Section title="Qualifications"><FactsAndList lines={sections.qualifications} /></Section>
            )}
            {sections.location.length > 0 && (
              <Section title="Location &amp; Work Mode"><FactsAndList lines={sections.location} /></Section>
            )}
            {sections.compensation.length > 0 && (
              <Section title="Compensation &amp; Benefits"><FactsAndList lines={sections.compensation} /></Section>
            )}
            {!hasContent && (
              <p className="jd-original-message">No structured details could be extracted. See the full JD text below.</p>
            )}

            {/* Safety net: the sections above are a best-effort split, so the complete text is always available. */}
            <details className="jd-fulltext" open={!hasContent}>
              <summary>Full JD text (exactly as saved)</summary>
              <pre>{job.description || 'No description saved for this job.'}</pre>
            </details>
            </>
            )}
          </main>

          <aside className="jd-posting-sidebar">
            <h3>Job Posting</h3>
            <div className="jd-sidebar-field">
              <span>Status</span>
              <strong className={`jd-status-pill jd-status-${status}`}>{job.status || 'Draft'}</strong>
            </div>
            <div className="jd-sidebar-field"><span>Job ID</span><strong>{job.id}</strong></div>
            <div className="jd-sidebar-field"><span>Client</span><strong>{hideClient ? 'Confidential' : clientName || (job.client_id ? `Client ID: ${job.client_id}` : 'Not linked')}</strong></div>
            <div className="jd-sidebar-field"><span>Location</span><strong>{job.location || 'Not specified'}</strong></div>
            <div className="jd-sidebar-field"><span>Compensation</span><strong>{compensation}</strong></div>
            <div className="jd-sidebar-field"><span>Openings</span><strong>{job.openings}</strong></div>
            <div className="jd-sidebar-field"><span>Work Mode</span><strong>{job.work_arrangement || 'Not specified'}</strong></div>
            <div className="jd-sidebar-actions">
              <button type="button" onClick={onClose}>Close</button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
