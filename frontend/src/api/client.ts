
const API_BASE_URL = 'https://recruitment-vms-demo-1.onrender.com'

export type LoginResponse = {
  access_token: string
  token_type: string
}

export type Job = {
  id: number
  title: string
  status: string
  openings: number
  client_id: number | null
  description?: string
  location?: string
  work_arrangement?: string | null
  responsibilities?: string | null
  qualification?: string | null
  min_experience?: number
  max_experience?: number | null
  mandatory_skills?: string | null
  preferred_skills?: string | null
  budget_min?: number | null
  budget_max?: number | null
  // Name of the original uploaded JD document (PDF/DOCX), if one is attached.
  jd_file_name?: string | null
  created_at?: string
  // Client company name (null for partner logins when clients are hidden from them).
  client_name?: string | null
  // false = deactivated (hidden from everyone except job managers; can be reactivated)
  is_active?: boolean
  recruiter_id?: number | null
  recruiter_name?: string | null
}

// One candidate submitted to one job (GET /candidates/submissions).
export type CandidateSubmission = {
  id: number
  candidate_id: number
  candidate_name: string
  // null for client logins when candidate contact details are hidden from clients
  candidate_email: string | null
  job_id: number
  job_title: string
  vendor_id: number | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
  // Provided by the API so a submission can be linked to its client and vendor
  // (and show the candidate profile) for every role.
  client_id?: number | null
  client_name?: string | null
  vendor_name?: string | null
  phone?: string | null
  total_experience?: number | null
  relevant_experience?: number | null
  current_employer?: string | null
  current_location?: string | null
  highest_qualification?: string | null
  primary_skills?: string | null
  resume_filename?: string | null
  // Original name of an uploaded resume file attached to this submission
  resume_file_name?: string | null
}

export type CandidatePermissions = {
  can_submit: boolean
  can_update_status: boolean
  is_vendor_user: boolean
  // False for channel-partner logins unless the backend allows partners to see clients.
  can_see_clients?: boolean
  is_client_user?: boolean
  can_client_review?: boolean
}

// An active channel-partner (vendor) assignment to a job requirement.
export type JobAssignment = {
  job_id: number
  vendor_id: number
  vendor_name: string
  assigned_at: string
}

export type SubmissionHistoryEntry = {
  id: number
  old_status: string | null
  new_status: string
  changed_by_user_id: number
  changed_by_email?: string | null
  note: string | null
  changed_at: string
}

export type SubmitCandidateInput = {
  job_id: number
  full_name: string
  email: string
  phone?: string | null
  total_experience?: number | null
  relevant_experience?: number | null
  current_employer?: string | null
  current_location?: string | null
  highest_qualification?: string | null
  primary_skills?: string | null
  resume_filename?: string | null
  notes?: string | null
}

export type CreateJobInput = {
  title: string
  client_id: number | null
  description: string
  mandatory_skills: string | null
  preferred_skills: string | null
  min_experience: number
  max_experience: number | null
  qualification: string | null
  location: string
  work_arrangement: string | null
  budget_min: number | null
  budget_max: number | null
  openings: number
  status: 'draft' | 'open' | 'closed'
  // The recruiter who owns this position
  recruiter_id?: number | null
}

export type ParsedJobDescription = Partial<Omit<CreateJobInput, 'client_id' | 'status'>> & { description: string }

export type Vendor = {
  id: number
  organization_id: number
  name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  is_active: boolean
}


export type ClientContact = {
  id: number
  contact_type: 'HR' | 'FINANCE' | 'OTHER'
  name: string
  email: string | null
  phone: string | null
  is_primary: boolean
  created_at: string
}

export type Client = {
  id: number
  organization_id: number
  company_name: string
  address: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  contacts: ClientContact[]
}



async function request<T>(
  path: string,
  token?: string,
  options?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  if (options?.body) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Your session has expired. Please sign in again.')
    }

    if (response.status === 403) {
      throw new Error(
        'Your account does not have permission to access this data.',
      )
    }

    throw new Error(`API request failed (${response.status}).`)
  }

  return response.json() as Promise<T>
}


export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid email or password.')
    }

    if (response.status === 403) {
      // e.g. "Your company's access has been deactivated…" for a partner/client whose company is paused
      const data = await response.json().catch(() => ({}))
      const detail = typeof data?.detail === 'string' ? data.detail : ''
      throw new Error(detail && detail !== 'User account is inactive' ? detail : 'This account is inactive.')
    }

    throw new Error(`Login failed (${response.status}).`)
  }

  return response.json() as Promise<LoginResponse>
}

export function getJobs(token: string) {
  return request<Job[]>('/jobs', token)
}

export type JobPermissions = {
  can_change_status: boolean
  can_manage_jobs?: boolean
}

export function getJobPermissions(token: string) {
  return request<JobPermissions>('/jobs/permissions', token)
}


export function createJob(token: string, input: CreateJobInput) {
  return request<Job>('/jobs', token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateJob(token: string, jobId: number, input: { status: 'draft' | 'open' | 'closed' }) {
  return request<Job>(`/jobs/${jobId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function getSubmissions(token: string): Promise<CandidateSubmission[]> {
  return request<CandidateSubmission[]>('/candidates/submissions', token)
}

export function getCandidatePermissions(token: string): Promise<CandidatePermissions> {
  return request<CandidatePermissions>('/candidates/permissions', token)
}

export function getSubmissionHistory(token: string, submissionId: number): Promise<SubmissionHistoryEntry[]> {
  return request<SubmissionHistoryEntry[]>(`/candidates/submissions/${submissionId}/history`, token)
}

// Like request(), but keeps the server's own message (e.g. "already submitted for this
// job") so the form can show exactly what went wrong.
async function sendCandidateRequest<T>(path: string, token: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.ok) return (await response.json()) as T
  if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')

  const data = await response.json().catch(() => ({}))
  const detail = data?.detail
  if (typeof detail === 'string') throw new Error(detail)
  if (Array.isArray(detail) && detail.length > 0) {
    // FastAPI validation errors: [{ loc: ['body', 'email'], msg: '...' }]
    throw new Error(
      detail
        .map((item: { loc?: Array<string | number>; msg?: string }) => `${String(item.loc?.[item.loc.length - 1] ?? 'field')}: ${item.msg ?? 'invalid value'}`)
        .join('; '),
    )
  }
  throw new Error(`Request failed (${response.status}).`)
}

export function submitCandidate(token: string, input: SubmitCandidateInput): Promise<CandidateSubmission> {
  return sendCandidateRequest<CandidateSubmission>('/candidates/submissions', token, 'POST', input)
}

export function updateSubmissionStatus(
  token: string,
  submissionId: number,
  status: string,
  note?: string | null,
): Promise<CandidateSubmission> {
  return sendCandidateRequest<CandidateSubmission>(`/candidates/submissions/${submissionId}/status`, token, 'PATCH', {
    status,
    note: note || null,
  })
}

// Attach (or replace) the original JD document on an existing job.
export async function uploadJobJDFile(token: string, jobId: number, file: File): Promise<Job> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/jd-file`, {
    method: 'POST',
    // Do not set Content-Type: the browser adds the multipart boundary itself.
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: formData,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || `JD file upload failed (${response.status}).`)
  return data as Job
}

// Download the original JD document. The API needs the Authorization header, so a
// plain <a href> cannot be used; the caller turns the Blob into an object URL.
export async function fetchJobJDFile(token: string, jobId: number): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/jd-file`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.detail || `Unable to open the JD file (${response.status}).`)
  }
  return response.blob()
}

export async function parseJobDescription(token: string, file: File): Promise<ParsedJobDescription> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${API_BASE_URL}/jobs/parse-jd`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: formData,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || `JD parsing failed (${response.status}).`)
  return data as ParsedJobDescription
}


export function getVendors(token: string) {
  return request<Vendor[]>('/vendors', token)
}

export function createVendor(
  token: string,
  input: CreateVendorInput,
) {
  return sendRequest<Vendor>('/vendors', token, 'POST', input)
}

export type CreateVendorInput = {
  name: string
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
}

export type CreateClientInput = {
  company_name: string
  address?: string | null
  notes?: string | null
  is_active?: boolean
}

export type UpdateClientInput = Partial<CreateClientInput>

export type CreateClientContactInput = {
  contact_type: 'HR' | 'FINANCE' | 'OTHER'
  name: string
  email?: string | null
  phone?: string | null
  is_primary?: boolean
}

async function sendRequest<T>(
  path: string,
  token: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Your session has expired. Please sign in again.')
    }

    if (response.status === 403) {
      throw new Error('You do not have permission to perform this action.')
    }

    const responseText = await response.text()
    throw new Error(
      responseText || `API request failed (${response.status}).`,
    )
  }

  return response.json() as Promise<T>
}

export function getClients(token: string) {
  return request<Client[]>('/clients', token)
}

export function createClient(
  token: string,
  input: CreateClientInput,
) {
  return sendRequest<Client>('/clients', token, 'POST', input)
}

export function updateClient(
  token: string,
  clientId: number,
  input: UpdateClientInput,
) {
  return sendRequest<Client>(
    `/clients/${clientId}`,
    token,
    'PATCH',
    input,
  )
}

export function createClientContact(
  token: string,
  clientId: number,
  input: CreateClientContactInput,
) {
  return sendRequest<ClientContact>(
    `/clients/${clientId}/contacts`,
    token,
    'POST',
    input,
  )
}

export function updateClientContact(
  token: string,
  clientId: number,
  contactId: number,
  input: Partial<CreateClientContactInput>,
) {
  return sendRequest<ClientContact>(
    `/clients/${clientId}/contacts/${contactId}`,
    token,
    'PATCH',
    input,
  )
}


export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status}).`)
  return data as { message: string }
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status}).`)
  return data as { message: string }
}

export function getJobAssignments(token: string): Promise<JobAssignment[]> {
  return request<JobAssignment[]>('/jobs/assignments', token)
}

export function assignVendorToJob(token: string, jobId: number, vendorId: number) {
  return sendCandidateRequest<{ message: string }>(`/jobs/${jobId}/assign-vendor/${vendorId}`, token, 'POST')
}

export function unassignVendorFromJob(token: string, jobId: number, vendorId: number) {
  return sendCandidateRequest<{ message: string }>(`/jobs/${jobId}/assign-vendor/${vendorId}`, token, 'DELETE')
}

// ---------------------------------------------------------------------------
// Who is signed in (drives which screens and buttons each role gets)
// ---------------------------------------------------------------------------

export type UserType = 'super_admin' | 'recruiter' | 'partner' | 'client' | 'staff'

export type Me = {
  id: number
  email: string
  full_name?: string | null
  phone?: string | null
  job_title?: string | null
  created_at?: string | null
  last_login_at?: string | null
  is_active: boolean
  organization_id: number
  roles: string[]
  permissions: string[]
  user_type: UserType
  vendor_id: number | null
  vendor_name: string | null
  client_id: number | null
  client_name: string | null
}

export function getMe(token: string): Promise<Me> {
  return request<Me>('/auth/me', token)
}

// ---------------------------------------------------------------------------
// User management (Super Admin)
// ---------------------------------------------------------------------------

export type UserAccount = {
  id: number
  email: string
  full_name?: string | null
  phone?: string | null
  job_title?: string | null
  created_at?: string | null
  last_login_at?: string | null
  organization_id: number
  is_active: boolean
  roles: string[]
  vendor_id: number | null
  vendor_name: string | null
  client_id: number | null
  client_name: string | null
}

export type RoleOption = { id: number; name: string; description: string | null }

export type CreateUserInput = {
  email: string
  password: string
  organization_id: number
  role_ids: number[]
  vendor_id?: number | null
  client_id?: number | null
  full_name?: string | null
  phone?: string | null
  job_title?: string | null
}

export function listUsers(token: string): Promise<UserAccount[]> {
  return request<UserAccount[]>('/users', token)
}

export function listRoles(token: string): Promise<RoleOption[]> {
  return request<RoleOption[]>('/users/roles', token)
}

export function createUser(token: string, input: CreateUserInput): Promise<UserAccount> {
  return sendCandidateRequest<UserAccount>('/users', token, 'POST', input)
}

export function setUserActive(token: string, userId: number, isActive: boolean): Promise<UserAccount> {
  return sendCandidateRequest<UserAccount>(`/users/${userId}/status`, token, 'PATCH', { is_active: isActive })
}

// ---------------------------------------------------------------------------
// Client portal
// ---------------------------------------------------------------------------

export type ClientDecisionValue = 'Interview Scheduled' | 'Selected' | 'Rejected'

export function recordClientDecision(
  token: string,
  submissionId: number,
  decision: ClientDecisionValue,
  note?: string | null,
): Promise<CandidateSubmission> {
  return sendCandidateRequest<CandidateSubmission>(`/candidates/submissions/${submissionId}/client-decision`, token, 'POST', {
    decision,
    note: note || null,
  })
}

// ---------------------------------------------------------------------------
// Deactivate / reactivate (Super Admin). Nothing is deleted.
// ---------------------------------------------------------------------------

export function setJobActive(token: string, jobId: number, isActive: boolean): Promise<Job> {
  return sendCandidateRequest<Job>(`/jobs/${jobId}`, token, 'PATCH', { is_active: isActive })
}

export function setClientActive(token: string, clientId: number, isActive: boolean): Promise<Client> {
  return sendCandidateRequest<Client>(`/clients/${clientId}`, token, 'PATCH', { is_active: isActive })
}

export function setVendorActive(token: string, vendorId: number, isActive: boolean): Promise<Vendor> {
  return sendCandidateRequest<Vendor>(`/vendors/${vendorId}`, token, 'PATCH', { is_active: isActive })
}

// ---------------------------------------------------------------------------
// Resumes
// ---------------------------------------------------------------------------

export type ResumeFields = {
  full_name: string | null
  email: string | null
  phone: string | null
  total_experience: number | null
  relevant_experience: number | null
  current_employer: string | null
  current_location: string | null
  highest_qualification: string | null
  primary_skills: string | null
}

async function sendFile<T>(path: string, token: string, file: File): Promise<T> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: formData,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')
    throw new Error(typeof data.detail === 'string' ? data.detail : `Upload failed (${response.status}).`)
  }
  return data as T
}

// Suggest form values from a resume (nothing is stored).
export function parseResume(token: string, file: File): Promise<{ fields: ResumeFields; filled: string[] }> {
  return sendFile('/candidates/parse-resume', token, file)
}

export function uploadSubmissionResume(token: string, submissionId: number, file: File): Promise<CandidateSubmission> {
  return sendFile(`/candidates/submissions/${submissionId}/resume`, token, file)
}

export async function fetchSubmissionResume(token: string, submissionId: number): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/candidates/submissions/${submissionId}/resume`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(typeof data.detail === 'string' ? data.detail : `Unable to open the resume (${response.status}).`)
  }
  return response.blob()
}

export function setUserName(token: string, userId: number, fullName: string | null): Promise<UserAccount> {
  return sendCandidateRequest<UserAccount>(`/users/${userId}/profile`, token, 'PATCH', { full_name: fullName })
}

// ---------------------------------------------------------------------------
// Recruiter performance
// ---------------------------------------------------------------------------

export type RecruiterPerformance = {
  id: number
  name: string
  email: string
  totals: {
    positions: number
    open_positions: number
    clients: number
    vendors: number
    submissions: number
    in_process: number
    closures: number
    closures_in_period: number
    joined: number
  }
  positions: Array<{ id: number; title: string; status: string; client_id: number | null; client_name: string | null; openings: number; submissions: number; closures: number }>
  clients: Array<{ id: number; name: string; positions: number; closures: number }>
  vendors: Array<{ id: number; name: string; positions: number; submissions: number; closures: number }>
  closures: Array<{ submission_id: number; candidate_name: string; job_id: number; job_title: string; client_name: string | null; vendor_name: string | null; status: string; closed_at: string | null; in_period: boolean }>
}

export function getRecruiterPerformance(
  token: string,
  range?: { start: Date; end: Date },
): Promise<{ recruiters: RecruiterPerformance[]; unassigned_open_positions: number }> {
  const query = range ? `?start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}` : ''
  return request(`/recruiters/performance${query}`, token)
}

export function setJobRecruiter(token: string, jobId: number, recruiterId: number | null): Promise<Job> {
  return sendCandidateRequest<Job>(`/jobs/${jobId}`, token, 'PATCH', { recruiter_id: recruiterId })
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export type ProfileFields = { full_name?: string | null; phone?: string | null; job_title?: string | null }

// Your own profile (any signed-in user). Email and role cannot be changed here.
export function updateMyProfile(token: string, fields: ProfileFields): Promise<Me> {
  return sendCandidateRequest<Me>('/auth/me', token, 'PATCH', fields)
}

export function changeMyPassword(token: string, currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return sendCandidateRequest('/auth/change-password', token, 'POST', { current_password: currentPassword, new_password: newPassword })
}

// Super Admin: edit someone else's profile.
export function setUserProfile(token: string, userId: number, fields: ProfileFields): Promise<UserAccount> {
  return sendCandidateRequest<UserAccount>(`/users/${userId}/profile`, token, 'PATCH', fields)
}
