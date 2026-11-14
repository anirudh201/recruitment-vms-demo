// Shared helpers for showing people (avatars, role names).

export function initials(name: string | null | undefined, email: string): string {
  const source = (name || '').trim() || email.split('@')[0].replace(/[._-]+/g, ' ')
  const parts = source.split(/\s+/).filter(Boolean)
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

export const ROLE_NAMES: Record<string, string> = {
  super_admin: 'Super Admin',
  recruiter: 'Recruiter',
  partner: 'Channel partner',
  client: 'Client',
  staff: 'Team member',
  'Super Admin': 'Super Admin',
  Recruiter: 'Recruiter',
  Vendor: 'Channel partner',
  Client: 'Client',
}
