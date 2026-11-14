// What kinds of JD files can be uploaded, and how each is shown.
export const JD_ACCEPT = '.pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,image/png,image/jpeg,image/webp'

export type JdKind = 'pdf' | 'image' | 'word' | 'text' | 'other'

export function jdKind(fileName: string | null | undefined): JdKind {
  const name = (fileName ?? '').toLowerCase()
  if (name.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpe?g|webp)$/.test(name)) return 'image'
  if (/\.docx?$/.test(name)) return 'word'
  if (name.endsWith('.txt')) return 'text'
  return 'other'
}

// PDFs and images can be shown right inside the JD viewer.
export const canPreviewJd = (fileName: string | null | undefined) => ['pdf', 'image'].includes(jdKind(fileName))
