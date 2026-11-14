
const API_BASE_URL = 'http://127.0.0.1:8000'

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
}

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
      throw new Error('This account is inactive.')
    }

    throw new Error(`Login failed (${response.status}).`)
  }

  return response.json() as Promise<LoginResponse>
}

export function getJobs(token: string) {
  return request<Job[]>('/jobs', token)
}


export function createJob(token: string, input: CreateJobInput) {
  return request<Job>('/jobs', token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
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
