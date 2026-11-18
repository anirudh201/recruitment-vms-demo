import { useEffect, useState } from 'react'

// Shows a resume inside the page: PDFs in the browser's own viewer, Word (DOCX) files
// converted to a clean, read-only page. The Word converter loads only when needed.

type State =
  | { kind: 'loading' }
  | { kind: 'pdf'; url: string }
  | { kind: 'html'; html: string; warnings: number }
  | { kind: 'error'; message: string }

export default function ResumePreview({
  fileName,
  load,
  height = 640,
}: {
  fileName: string
  load: () => Promise<Blob>
  height?: number
}) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const lower = fileName.toLowerCase()

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    setState({ kind: 'loading' })
    load()
      .then(async (blob) => {
        if (lower.endsWith('.pdf') || blob.type === 'application/pdf') {
          url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
          if (!cancelled) setState({ kind: 'pdf', url })
          return
        }
        if (lower.endsWith('.docx')) {
          const [{ default: mammoth }, { default: DOMPurify }] = await Promise.all([
            import('mammoth/mammoth.browser.js'),
            import('dompurify'),
          ])
          const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })
          const html = DOMPurify.sanitize(result.value, { FORBID_TAGS: ['style', 'form', 'input', 'button'], FORBID_ATTR: ['style'] })
          if (!cancelled) setState({ kind: 'html', html, warnings: result.messages.length })
          return
        }
        if (!cancelled) setState({ kind: 'error', message: 'This file type cannot be shown here. Use Download to open it.' })
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unable to show the resume.' })
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName])

  if (state.kind === 'loading') return <div className="rp-preview rp-preview-msg" style={{ minHeight: 120 }}>Loading the resume…</div>
  if (state.kind === 'error') return <div className="rp-preview rp-preview-msg rp-preview-error" role="alert">{state.message}</div>
  if (state.kind === 'pdf') {
    return <iframe className="rp-preview rp-preview-pdf" style={{ height }} title={`Resume: ${fileName}`} src={state.url} />
  }
  return (
    <div className="rp-preview rp-preview-doc" style={{ maxHeight: height }}>
      <div className="rp-doc-page" dangerouslySetInnerHTML={{ __html: state.html }} />
      <p className="rp-doc-note">Shown from the Word file; some formatting (columns, fonts, headers) may look different. Use Download for the original.</p>
    </div>
  )
}
