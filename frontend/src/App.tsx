
import { useCallback, useEffect, useState } from 'react'
import StatCard from './components/StatCard'
import {
  createClient,
  createVendor,
  createClientContact,
  getClients,
  getJobs,
  getVendors,
  login,
  createJob,
  updateClient,
  updateClientContact,
  type Client,
  type ClientContact,
  type CreateClientContactInput,
  type CreateVendorInput,
  type Job,
  type Vendor,
  type CreateJobInput,
} from './api/client'
import './App.css'

const TOKEN_KEY = 'vms_access_token'

type Page = 'dashboard' | 'jobs' | 'clients' | 'vendors'

type VendorForm = {
  name: string
  contact_name: string
  contact_email: string
  contact_phone: string
}

const emptyVendorForm: VendorForm = {
  name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
}

type ClientForm = {
  company_name: string
  address: string
  notes: string
  is_active: boolean
}

type ContactForm = {
  contact_type: 'HR' | 'FINANCE' | 'OTHER'
  name: string
  email: string
  phone: string
  is_primary: boolean
}

const emptyClientForm: ClientForm = {
  company_name: '',
  address: '',
  notes: '',
  is_active: true,
}

const emptyContactForm: ContactForm = {
  contact_type: 'HR',
  name: '',
  email: '',
  phone: '',
  is_primary: true,
}

function App() {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem(TOKEN_KEY),
  )

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [page, setPage] = useState<Page>('dashboard')
  const [jobFilter, setJobFilter] = useState<'all' | 'open'>('all')

  const [jobs, setJobs] = useState<Job[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorSearch, setVendorSearch] = useState('')
  const [vendorStatusFilter, setVendorStatusFilter] = useState('ALL')
  const [showVendorForm, setShowVendorForm] = useState(false)

  const [showJobForm, setShowJobForm] = useState(false)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)

  const [savingJob, setSavingJob] = useState(false)

  const [jobForm, setJobForm] = useState<CreateJobInput>({
          title: '',
          client_id: null,
          description: '',
          mandatory_skills: null,
          preferred_skills: null,
          min_experience: 0,
          max_experience: null,
          qualification: null,
          location: '',
          work_arrangement: null,
          budget_min: null,
          budget_max: null,
          openings: 1,
        })

  const [vendorForm, setVendorForm] =
  useState<VendorForm>(emptyVendorForm)
  const [clients, setClients] = useState<Client[]>([])

  const [clientSearch, setClientSearch] = useState('')
  const [clientStatusFilter, setClientStatusFilter] = useState('ALL')
  const [clientContactFilter, setClientContactFilter] = useState('ALL')

  const [loading, setLoading] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [showClientForm, setShowClientForm] = useState(false)
  const [editingClientId, setEditingClientId] = useState<number | null>(null)
  const [clientForm, setClientForm] =
    useState<ClientForm>(emptyClientForm)
  const [initialContact, setInitialContact] =
    useState<ContactForm>(emptyContactForm)

  const [editingContact, setEditingContact] = useState<{
    clientId: number
    contact: ClientContact
  } | null>(null)

  const [addingContactForClient, setAddingContactForClient] =
  useState<number | null>(null)

  const [contactForm, setContactForm] =
    useState<ContactForm>(emptyContactForm)

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setJobs([])
    setVendors([])
    setClients([])
    setPassword('')
    setPage('dashboard')
    setError(null)
    setSuccess(null)
    setShowClientForm(false)
    setEditingContact(null)
  }, [])

  const loadDashboard = useCallback(
    async (accessToken: string) => {
      setLoading(true)
      setError(null)

      try {
        const [jobData, vendorData, clientData] = await Promise.all([
          getJobs(accessToken),
          getVendors(accessToken),
          getClients(accessToken),
        ])

        setJobs(jobData)
        setVendors(vendorData)
        setClients(clientData)
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to load dashboard data.'

        if (message.includes('session has expired')) {
          logout()
        }

        setError(message)
      } finally {
        setLoading(false)
      }
    },
    [logout],
  )

  useEffect(() => {
    if (token) {
      void loadDashboard(token)
    }
  }, [token, loadDashboard])

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginLoading(true)
    setError(null)

    try {
      const result = await login(email.trim(), password)
      sessionStorage.setItem(TOKEN_KEY, result.access_token)
      setToken(result.access_token)
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.')
    } finally {
      setLoginLoading(false)
    }
  }

  function startAddClient() {
    setEditingClientId(null)
    setClientForm(emptyClientForm)
    setInitialContact(emptyContactForm)
    setShowClientForm(true)
    setEditingContact(null)
    setError(null)
    setSuccess(null)
  }

  function startEditClient(client: Client) {
    setEditingClientId(client.id)
    setClientForm({
      company_name: client.company_name,
      address: client.address ?? '',
      notes: client.notes ?? '',
      is_active: client.is_active,
    })
    setShowClientForm(true)
    setEditingContact(null)
    setError(null)
    setSuccess(null)
  }

  function cancelClientForm() {
    setShowClientForm(false)
    setEditingClientId(null)
    setClientForm(emptyClientForm)
    setInitialContact(emptyContactForm)
  }

  async function handleSaveClient(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!token) return

    const companyName = clientForm.company_name.trim()

    if (!companyName) {
      setError('Company name is required.')
      return
    }

    const hasInitialContact = initialContact.name.trim().length > 0

    if (!editingClientId && hasInitialContact && !initialContact.contact_type) {
      setError('Select a contact type.')
      return
    }

    if (
      !editingClientId &&
      !hasInitialContact &&
      (initialContact.email.trim() || initialContact.phone.trim())
    ) {
      setError('Enter a contact name or clear the optional contact details.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      if (editingClientId !== null) {
        await updateClient(token, editingClientId, {
          company_name: companyName,
          address: clientForm.address.trim() || null,
          notes: clientForm.notes.trim() || null,
          is_active: clientForm.is_active,
        })

        setSuccess('Client company updated successfully.')
      } else {
        const createdClient = await createClient(token, {
          company_name: companyName,
          address: clientForm.address.trim() || null,
          notes: clientForm.notes.trim() || null,
        })

        if (hasInitialContact) {
          const contactInput: CreateClientContactInput = {
            contact_type: initialContact.contact_type,
            name: initialContact.name.trim(),
            email: initialContact.email.trim() || null,
            phone: initialContact.phone.trim() || null,
            is_primary: initialContact.is_primary,
          }

          try {
            await createClientContact(
              token,
              createdClient.id,
              contactInput,
            )
            setSuccess('Client company and contact created successfully.')
          } catch {
            await loadDashboard(token)
            setShowClientForm(false)
            setError(
              'The client company was created, but its contact could not be saved. Please open the client and try adding the contact again.',
            )
            return
          }
        } else {
          setSuccess('Client company created successfully.')
        }
      }

      cancelClientForm()
      await loadDashboard(token)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to save the client.',
      )
    } finally {
      setSaving(false)
    }
  }


     async function handleSaveVendor(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!token) return

    const vendorName = vendorForm.name.trim()

    if (!vendorName) {
      setError('Vendor name is required.')
      return
    }

    const vendorInput: CreateVendorInput = {
      name: vendorName,
      contact_name: vendorForm.contact_name.trim() || null,
      contact_email: vendorForm.contact_email.trim() || null,
      contact_phone: vendorForm.contact_phone.trim() || null,
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await createVendor(token, vendorInput)

      setVendorForm(emptyVendorForm)
      setShowVendorForm(false)

      const updatedVendors = await getVendors(token)
      setVendors(updatedVendors)

      setSuccess('Vendor registered successfully.')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to register the vendor.',
      )
    } finally {
      setSaving(false)
    }
  }


  function cancelVendorForm() {
    setShowVendorForm(false)
    setVendorForm(emptyVendorForm)
  }

  function cancelJobForm() {
  setShowJobForm(false)
  setJobForm({
    title: '',
    client_id: null,
    description: '',
    mandatory_skills: null,
    preferred_skills: null,
    min_experience: 0,
    max_experience: null,
    qualification: null,
    location: '',
    work_arrangement: null,
    budget_min: null,
    budget_max: null,
    openings: 1,
  })
}


async function handleSaveJob(
  event: React.FormEvent<HTMLFormElement>,
) {
  event.preventDefault()

  if (!token) {
    setError('Your session has expired. Please sign in again.')
    return
  }

  if (!jobForm.title.trim()) {
    setError('Job title is required.')
    return
  }

  if (!jobForm.description.trim()) {
    setError('Job description is required.')
    return
  }

  if (!jobForm.location.trim()) {
    setError('Job location is required.')
    return
  }

  if (
    jobForm.max_experience !== null &&
    jobForm.max_experience < jobForm.min_experience
  ) {
    setError('Maximum experience cannot be less than minimum experience.')
    return
  }

  if (
    jobForm.budget_min !== null &&
    jobForm.budget_max !== null &&
    jobForm.budget_max < jobForm.budget_min
  ) {
    setError('Maximum budget cannot be less than minimum budget.')
    return
  }

  setSavingJob(true)
  setError(null)
  setSuccess(null)

  try {
    await createJob(token, {
      ...jobForm,
      title: jobForm.title.trim(),
      description: jobForm.description.trim(),
      location: jobForm.location.trim(),
    })

    await loadDashboard(token)
    cancelJobForm()
    setSuccess('Job requirement created successfully.')
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Unable to create the job requirement.',
    )
  } finally {
    setSavingJob(false)
  }
}


  function startEditContact(clientId: number, contact: ClientContact) {
    setEditingContact({ clientId, contact })
    setContactForm({
      contact_type: contact.contact_type,
      name: contact.name,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      is_primary: contact.is_primary,
    })
    setError(null)
    setSuccess(null)
  }

  function startAddContact(clientId: number) {
  setAddingContactForClient(clientId)
  setEditingContact(null)
  setContactForm(emptyContactForm)
  setError(null)
  setSuccess(null)
}

  function cancelContactForm() {
    setEditingContact(null)
    setContactForm(emptyContactForm)
  }

  async function handleSaveContact(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!token || !editingContact) return

    if (!contactForm.name.trim()) {
      setError('Contact name is required.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await updateClientContact(
        token,
        editingContact.clientId,
        editingContact.contact.id,
        {
          contact_type: contactForm.contact_type,
          name: contactForm.name.trim(),
          email: contactForm.email.trim() || null,
          phone: contactForm.phone.trim() || null,
          is_primary: contactForm.is_primary,
        },
      )

      cancelContactForm()
      await loadDashboard(token)
      setSuccess('Contact updated successfully.')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update the contact.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleAddContact(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault()

  if (!token || addingContactForClient === null) return

  if (!contactForm.name.trim()) {
    setError('Contact name is required.')
    return
  }

  setSaving(true)
  setError(null)
  setSuccess(null)

  try {
    await createClientContact(token, addingContactForClient, {
      contact_type: contactForm.contact_type,
      name: contactForm.name.trim(),
      email: contactForm.email.trim() || null,
      phone: contactForm.phone.trim() || null,
      is_primary: contactForm.is_primary,
    })

    setAddingContactForClient(null)
    setContactForm(emptyContactForm)
    setSuccess('Contact added successfully.')
    await loadDashboard(token)
  } catch (err) {
    setError(
      err instanceof Error ? err.message : 'Unable to add contact.',
    )
  } finally {
    setSaving(false)
  }
}

  if (!token) {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={handleLogin}>
          <h1>Recruitment VMS</h1>
          <p>Sign in to access your workspace.</p>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <button type="submit" disabled={loginLoading}>
            {loginLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </main>
    )
  }

  const activeJobs = jobs.filter((job) => job.status === 'open').length
  const activeVendors = vendors.filter((vendor) => vendor.is_active).length
  const activeClients = clients.filter((client) => client.is_active).length

 const filteredClients = clients.filter((client) => {
  const searchTerm = clientSearch.trim().toLowerCase()
  const companyName = (client.company_name || '').trim().toLowerCase()
  const matchesSearch = companyName.includes(searchTerm)

  const matchesStatus =
    clientStatusFilter === 'ALL' ||
    (clientStatusFilter === 'ACTIVE' && client.is_active) ||
    (clientStatusFilter === 'INACTIVE' && !client.is_active)

  const matchesContact =
    clientContactFilter === 'ALL' ||
    client.contacts.some(
      (contact) => contact.contact_type === clientContactFilter,
    )

  return matchesSearch && matchesStatus && matchesContact
})

  const filteredVendors = vendors.filter((vendor) => {
    const searchTerm = vendorSearch.trim().toLowerCase()
    const matchesSearch =
      vendor.name.toLowerCase().includes(searchTerm) ||
      (vendor.contact_name ?? '').toLowerCase().includes(searchTerm) ||
      (vendor.contact_email ?? '').toLowerCase().includes(searchTerm) ||
      (vendor.contact_phone ?? '').toLowerCase().includes(searchTerm)

    const matchesStatus =
      vendorStatusFilter === 'ALL' ||
      (vendorStatusFilter === 'ACTIVE' && vendor.is_active) ||
      (vendorStatusFilter === 'INACTIVE' && !vendor.is_active)

    return matchesSearch && matchesStatus
  })


  return (
    <div className="vms-app">
      <aside className="sidebar">
        <h2>Recruitment VMS</h2>

        <nav aria-label="Main navigation">
          <a
            href="#dashboard"
            className={page === 'dashboard' ? 'active' : ''}
            onClick={() => setPage('dashboard')}
          >
            Dashboard
          </a>

          <a
            href="#jobs"
            className={page === 'jobs' ? 'active' : ''}
            onClick={() => setPage('jobs')}
          >
            Jobs
          </a>

          <a
            href="#candidates"
            onClick={(event) => event.preventDefault()}
          >
            Candidates
          </a>

                      <a
              href="#vendors"
              className={page === 'vendors' ? 'active' : ''}
              onClick={() => setPage('vendors')}
            >
              Vendors
            </a>

          <a
            href="#clients"
            className={page === 'clients' ? 'active' : ''}
            onClick={() => setPage('clients')}
          >
            Clients
          </a>

          <a
            href="#reports"
            onClick={(event) => event.preventDefault()}
          >
            Reports
          </a>
        </nav>

        <button className="logout-button" onClick={logout}>
          Sign out
        </button>
      </aside>

      <main className="main-content">
        {page === 'dashboard' ? (
          <>
            <header className="page-header" id="dashboard">
              <h1>Dashboard</h1>
              <p>Recruitment operations overview</p>
            </header>

            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}

            {success && (
              <p className="success-message" role="status">
                {success}
              </p>
            )}

                        <section className="stats-grid" aria-label="Management statistics">
                            <StatCard
                  title="Open Jobs"
                  value={loading ? null : activeJobs}
                  description="Requirements currently open"
                  onClick={() => {
                    setJobFilter('open')
                    setPage('jobs')
                  }}
                />
                  <StatCard
                    title="Total Jobs"
                    value={loading ? null : jobs.length}
                    description="Jobs visible to your account"
                    onClick={() => {
                      setJobFilter('all')
                      setPage('jobs')
                    }}
                  />

              <StatCard
                title="Active Vendors"
                value={loading ? null : activeVendors}
                description="Active vendor records returned by the API"
                onClick={() => setPage('vendors')}
              />

              <StatCard
                title="Active Clients"
                value={loading ? null : activeClients}
                description="Active client records returned by the API"
                onClick={() => setPage('clients')}
              />
            </section>

            <section className="welcome-card">
              <h2>Recruitment Overview</h2>
              {loading ? (
                <p role="status">Loading data from the backend...</p>
              ) : (
                <p>
                  {error
                    ? 'Dashboard data could not be fully refreshed. Check the error above.'
                    : 'Dashboard data loaded from the recruitment API.'}
                </p>
              )}

              <button
                onClick={() => token && void loadDashboard(token)}
                disabled={loading}
              >
                Refresh dashboard
              </button>
            </section>
          </>
        ) : page === 'jobs' ? (
          <>
            <header className="page-header" id="jobs">
              <h1>Jobs</h1>
              <p>View recruitment requirements available to your account.</p>
            </header>

            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}

            {success && (
              <p className="success-message" role="status">
                {success}
              </p>
            )}

            <section className="welcome-card jobs-card">
              <div className="jobs-heading">
                <div>
                  <h2>Job Requirements</h2>
                  <p>
                    {loading
                      ? 'Loading job records...'
                      : `${jobs.filter((job) => jobFilter === 'all' || job.status === 'open').length} job record(s)`}
                  </p>
                </div>


                <div className="jobs-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setSuccess(null)
                        setShowJobForm(true)
                      }}
                    >
                      + Add Job Requirement
                    </button>

                    <button
                      type="button"
                      onClick={() => token && void loadDashboard(token)}
                      disabled={loading}
                    >
                      {loading ? 'Refreshing...' : 'Refresh jobs'}
                    </button>
                  </div>
              </div>

              {showJobForm && (
                <form className="job-form" onSubmit={handleSaveJob}>
                  <h3>Add Job Requirement</h3>

                  <div className="job-form-grid">
                  <label>
                    Job Title *
                    <input required value={jobForm.title} onChange={(event) => setJobForm((current) => ({ ...current, title: event.target.value }))} />
                  </label>

                  <label>
                    Client
                    <select value={jobForm.client_id ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, client_id: event.target.value ? Number(event.target.value) : null }))}>
                      <option value="">No client selected</option>
                      {clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}
                    </select>
                  </label>

                  <label>
                    Job Description *
                    <textarea required value={jobForm.description} onChange={(event) => setJobForm((current) => ({ ...current, description: event.target.value }))} />
                  </label>

                  <label>
                    Mandatory Skills
                    <textarea value={jobForm.mandatory_skills ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, mandatory_skills: event.target.value || null }))} />
                  </label>

                  <label>
                    Preferred Skills
                    <textarea value={jobForm.preferred_skills ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, preferred_skills: event.target.value || null }))} />
                  </label>

                  <label>Minimum Experience (years) *
                    <input type="number" min="0" required value={jobForm.min_experience} onChange={(event) => setJobForm((current) => ({ ...current, min_experience: Number(event.target.value) }))} />
                  </label>

                  <label>Maximum Experience (years)
                    <input type="number" min="0" value={jobForm.max_experience ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, max_experience: event.target.value === '' ? null : Number(event.target.value) }))} />
                  </label>

                  <label>Qualification
                    <input value={jobForm.qualification ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, qualification: event.target.value || null }))} />
                  </label>

                  <label>Location *
                    <input required value={jobForm.location} onChange={(event) => setJobForm((current) => ({ ...current, location: event.target.value }))} />
                  </label>

                  <label>Work Arrangement
                    <select value={jobForm.work_arrangement ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, work_arrangement: event.target.value || null }))}>
                      <option value="">Select arrangement</option><option value="On-site">On-site</option><option value="Hybrid">Hybrid</option><option value="Remote">Remote</option>
                    </select>
                  </label>

                  <label>Minimum Budget
                    <input type="number" min="0" value={jobForm.budget_min ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, budget_min: event.target.value === '' ? null : Number(event.target.value) }))} />
                  </label>

                  <label>Maximum Budget
                    <input type="number" min="0" value={jobForm.budget_max ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, budget_max: event.target.value === '' ? null : Number(event.target.value) }))} />
                  </label>

                  <label>Number of Openings *
                    <input type="number" min="1" required value={jobForm.openings} onChange={(event) => setJobForm((current) => ({ ...current, openings: Number(event.target.value) }))} />
                  </label>

                  </div>

                  <div className="form-actions job-form-actions">
                    <button type="submit" disabled={savingJob}>{savingJob ? 'Saving...' : 'Save Job'}</button>
                    <button type="button" onClick={cancelJobForm} disabled={savingJob}>Cancel</button>
                  </div>
                </form>
              )}

              {loading ? (
                <p role="status">Loading jobs from the backend...</p>
              ) : jobs.length === 0 ? (
                <p>No jobs were returned by the API.</p>
              ) : (
                <div className="jobs-table-wrapper">
                  <table className="jobs-table">
                    <thead>
                      <tr>
                        <th>Job title</th>
                        <th>Client ID</th>
                        <th>Location</th>
                        <th>Experience</th>
                        <th>Work arrangement</th>
                        <th>Openings</th>
                        <th>Status</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs
                        .filter((job) => jobFilter === 'all' || job.status === 'open')
                        .map((job) => {
                          const record = job as Job & Record<string, unknown>
                          const minExperience = record.min_experience
                          const maxExperience = record.max_experience
                          return (
                            <tr key={job.id}>
                              <td>
                                <strong>{job.title}</strong>
                                <span className="job-id">Job ID: {job.id}</span>
                              </td>
                              <td>{job.client_id ?? 'Not linked'}</td>
                              <td>{String(record.location ?? '—')}</td>
                              <td>
                                {minExperience != null || maxExperience != null
                                  ? `${minExperience ?? 0}–${maxExperience ?? 'Not specified'} years`
                                  : '—'}
                              </td>
                              <td>{String(record.work_arrangement ?? '—')}</td>
                              <td>{job.openings}</td>
                              <td><span className="job-status">{job.status || 'Unknown'}</span></td>
                              <td>
                                <button type="button" className="job-view-button" onClick={() => setSelectedJob(job)}>
                                  View details
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedJob && (() => {
                const details = selectedJob as Job & Record<string, unknown>
                const fields: Array<[string, unknown]> = [
                  ['Job ID', selectedJob.id],
                  ['Job Title', selectedJob.title],
                  ['Status', selectedJob.status],
                  ['Client ID', selectedJob.client_id ?? 'Not linked'],
                  ['Job Description', details.description],
                  ['Mandatory Skills', details.mandatory_skills],
                  ['Preferred Skills', details.preferred_skills],
                  ['Minimum Experience (years)', details.min_experience],
                  ['Maximum Experience (years)', details.max_experience],
                  ['Qualification', details.qualification],
                  ['Location', details.location],
                  ['Work Arrangement', details.work_arrangement],
                  ['Minimum Budget', details.budget_min],
                  ['Maximum Budget', details.budget_max],
                  ['Number of Openings', selectedJob.openings],
                ]
                return (
                  <div className="job-modal-backdrop" role="presentation" onClick={() => setSelectedJob(null)}>
                    <section className="job-details-modal" role="dialog" aria-modal="true" aria-labelledby="job-details-title" onClick={(event) => event.stopPropagation()}>
                      <div className="job-details-heading">
                        <div>
                          <h2 id="job-details-title">Job Requirement Details</h2>
                          <p>Review all information saved for this job.</p>
                        </div>
                        <button type="button" className="job-modal-close" onClick={() => setSelectedJob(null)} aria-label="Close job details">×</button>
                      </div>
                      <div className="job-details-grid">
                        {fields.map(([label, value]) => (
                          <div className={`job-detail-item ${label === 'Job Description' || label.includes('Skills') ? 'job-detail-wide' : ''}`} key={label}>
                            <span>{label}</span>
                            <p>{value === null || value === undefined || value === '' ? 'Not provided' : String(value)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="form-actions">
                        <button type="button" onClick={() => setSelectedJob(null)}>Close</button>
                      </div>
                    </section>
                  </div>
                )
              })()}
            </section>
          </>
        ) : page === 'vendors' ? (
          <>
            <header className="page-header" id="vendors">
              <h1>Vendors</h1>
              <p>Register vendors and manage their contact information.</p>
            </header>

            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}

            {success && (
              <p className="success-message" role="status">
                {success}
              </p>
            )}

            <section className="welcome-card jobs-card">
              <div className="jobs-heading">
                <div>
                  <h2>Vendor Directory</h2>
                  <p>
                    {loading
                      ? 'Loading vendor records...'
                      : `${filteredVendors.length} matching vendor record(s)`}
                  </p>
                </div>

                <div className="vendor-heading-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setShowVendorForm(true)
                      setVendorForm(emptyVendorForm)
                      setError(null)
                      setSuccess(null)
                    }}
                    disabled={saving}
                  >
                    + Add Vendor
                  </button>
                  <button
                    type="button"
                    onClick={() => token && void loadDashboard(token)}
                    disabled={loading}
                  >
                    {loading ? 'Refreshing...' : 'Refresh vendors'}
                  </button>
                </div>
              </div>

              <div className="client-filters">
                <input
                  type="text"
                  placeholder="Search name, contact, email or phone..."
                  value={vendorSearch}
                  onChange={(event) => setVendorSearch(event.target.value)}
                  aria-label="Search vendors"
                />

                <select
                  value={vendorStatusFilter}
                  onChange={(event) => setVendorStatusFilter(event.target.value)}
                  aria-label="Filter vendors by status"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setVendorSearch('')
                    setVendorStatusFilter('ALL')
                  }}
                >
                  Clear Filters
                </button>
              </div>

                      {showVendorForm && (

                      <form className="client-form" onSubmit={handleSaveVendor}>
                        <h3>Register Vendor</h3>

                        <label htmlFor="vendor-name">Vendor / Organization name *</label>
                        <input
                          id="vendor-name"
                          type="text"
                          maxLength={200}
                          required
                          value={vendorForm.name}
                          onChange={(event) =>
                            setVendorForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                        />

                        <label htmlFor="vendor-contact-name">Contact name</label>
                        <input
                          id="vendor-contact-name"
                          type="text"
                          maxLength={200}
                          value={vendorForm.contact_name}
                          onChange={(event) =>
                            setVendorForm((current) => ({
                              ...current,
                              contact_name: event.target.value,
                            }))
                          }
                        />

                        <label htmlFor="vendor-contact-email">Contact email</label>
                        <input
                          id="vendor-contact-email"
                          type="email"
                          value={vendorForm.contact_email}
                          onChange={(event) =>
                            setVendorForm((current) => ({
                              ...current,
                              contact_email: event.target.value,
                            }))
                          }
                        />

                        <label htmlFor="vendor-contact-phone">Contact phone</label>
                        <input
                          id="vendor-contact-phone"
                          type="tel"
                          maxLength={30}
                          value={vendorForm.contact_phone}
                          onChange={(event) =>
                            setVendorForm((current) => ({
                              ...current,
                              contact_phone: event.target.value,
                            }))
                          }
                        />

                        <div className="form-actions">
                          <button type="submit" disabled={saving}>
                            {saving ? 'Registering...' : 'Register Vendor'}
                          </button>

                          <button
                            type="button"
                            onClick={cancelVendorForm}
                            disabled={saving}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}



              {loading ? (
                <p role="status">Loading vendors from the backend...</p>
              ) : vendors.length === 0 ? (
                <p>No vendor records were returned by the API. Use “Add Vendor” to register the first vendor.</p>
              ) : filteredVendors.length === 0 ? (
                <p>No vendors match the current search and status filters.</p>
              ) : (
                <div className="jobs-table-wrapper">
                  <table className="jobs-table">
                    <thead>
                      <tr>
                        <th>Vendor</th>
                        <th>Contact name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVendors.map((vendor) => (
                        <tr key={vendor.id}>
                          <td>
                            <strong>{vendor.name}</strong>
                            <span className="job-id">Vendor ID: {vendor.id}</span>
                          </td>
                          <td>{vendor.contact_name || 'Not provided'}</td>
                          <td>{vendor.contact_email || 'Not provided'}</td>
                          <td>{vendor.contact_phone || 'Not provided'}</td>
                          <td>
                            <span className="job-status">
                              {vendor.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <header className="page-header" id="clients">
              <h1>Clients</h1>
              <p>Manage your client companies and contact information.</p>
            </header>

            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}

            {success && (
              <p className="success-message" role="status">
                {success}
              </p>
            )}

            <section className="welcome-card jobs-card">
              <div className="jobs-heading">
                <div>
                  <h2>Client Companies</h2>
                  <p>
                    {loading
                      ? 'Loading client records...'
                      : `${filteredClients.length} matching client record(s)`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={startAddClient}
                  disabled={saving}
                >
                  + Add Client
                </button>
              </div>

                            <div className="client-filters">
                <input
                  type="text"
                  placeholder="Search by company name..."
                  value={clientSearch}
                  onChange={(event) => setClientSearch(event.target.value)}
                  aria-label="Search clients by company name"
                />

                <select
                  value={clientStatusFilter}
                  onChange={(event) => setClientStatusFilter(event.target.value)}
                  aria-label="Filter clients by status"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>

                <select
                  value={clientContactFilter}
                  onChange={(event) => setClientContactFilter(event.target.value)}
                  aria-label="Filter clients by contact type"
                >
                  <option value="ALL">All Contact Types</option>
                  <option value="HR">HR</option>
                  <option value="FINANCE">Finance</option>
                  <option value="OTHER">Other</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setClientSearch('')
                    setClientStatusFilter('ALL')
                    setClientContactFilter('ALL')
                  }}
                >
                  Clear Filters
                </button>
              </div>
              {showClientForm && (
                <form className="client-form" onSubmit={handleSaveClient}>
  <h3>
    {editingClientId === null ? 'Add Client' : 'Edit Client'}
  </h3>

  <label htmlFor="company-name">Company name *</label>
  <input
    id="company-name"
    type="text"
    maxLength={200}
    required
    value={clientForm.company_name}
    onChange={(event) =>
      setClientForm((current) => ({
        ...current,
        company_name: event.target.value,
      }))
    }
  />

  <label htmlFor="client-address">Address</label>
  <textarea
    id="client-address"
    rows={2}
    value={clientForm.address}
    onChange={(event) =>
      setClientForm((current) => ({
        ...current,
        address: event.target.value,
      }))
    }
  />

  <label htmlFor="client-notes">Notes</label>
  <textarea
    id="client-notes"
    rows={3}
    value={clientForm.notes}
    onChange={(event) =>
      setClientForm((current) => ({
        ...current,
        notes: event.target.value,
      }))
    }
  />

  {editingClientId !== null && (
    <label className="checkbox-label">
      <input
        type="checkbox"
        checked={clientForm.is_active}
        onChange={(event) =>
          setClientForm((current) => ({
            ...current,
            is_active: event.target.checked,
          }))
        }
      />
      Active client
    </label>
  )}

  {editingClientId === null && (
    <fieldset className="contact-fieldset">
      <legend>Initial Contact (optional)</legend>

      <label htmlFor="initial-contact-type">Contact type</label>
      <select
        id="initial-contact-type"
        value={initialContact.contact_type}
        onChange={(event) =>
          setInitialContact((current) => ({
            ...current,
            contact_type: event.target.value as ContactForm['contact_type'],
          }))
        }
      >
        <option value="HR">HR</option>
        <option value="FINANCE">Finance</option>
        <option value="OTHER">Other</option>
      </select>

      <label htmlFor="initial-contact-name">Contact name</label>
      <input
        id="initial-contact-name"
        type="text"
        maxLength={200}
        value={initialContact.name}
        onChange={(event) =>
          setInitialContact((current) => ({
            ...current,
            name: event.target.value,
          }))
        }
      />

      <label htmlFor="initial-contact-email">Email address</label>
      <input
        id="initial-contact-email"
        type="email"
        value={initialContact.email}
        onChange={(event) =>
          setInitialContact((current) => ({
            ...current,
            email: event.target.value,
          }))
        }
      />

      <label htmlFor="initial-contact-phone">Phone number</label>
      <input
        id="initial-contact-phone"
        type="tel"
        maxLength={30}
        value={initialContact.phone}
        onChange={(event) =>
          setInitialContact((current) => ({
            ...current,
            phone: event.target.value,
          }))
        }
      />

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={initialContact.is_primary}
          onChange={(event) =>
            setInitialContact((current) => ({
              ...current,
              is_primary: event.target.checked,
            }))
          }
        />
        Primary contact
      </label>
    </fieldset>
  )}

  <div className="form-actions">
    <button type="submit" disabled={saving}>
      {saving
        ? 'Saving...'
        : editingClientId === null
          ? 'Create Client'
          : 'Save Changes'}
    </button>

    <button
      type="button"
      onClick={cancelClientForm}
      disabled={saving}
    >
      Cancel
    </button>
  </div>
</form>
              )}

              {editingContact && (
                <form className="client-form" onSubmit={handleSaveContact}>
                  <h3>Edit Contact</h3>

                  <label htmlFor="edit-contact-type">Contact type *</label>
                  <select
                    id="edit-contact-type"
                    required
                    value={contactForm.contact_type}
                    onChange={(event) =>
                      setContactForm((current) => ({
                        ...current,
                        contact_type: event.target.value as ContactForm['contact_type'],
                      }))
                    }
                  >
                    <option value="HR">HR</option>
                    <option value="FINANCE">Finance</option>
                    <option value="OTHER">Other</option>
                  </select>

                  <label htmlFor="edit-contact-name">Name *</label>
                  <input
                    id="edit-contact-name"
                    type="text"
                    maxLength={200}
                    required
                    value={contactForm.name}
                    onChange={(event) =>
                      setContactForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />

                  <label htmlFor="edit-contact-email">Email address</label>
                  <input
                    id="edit-contact-email"
                    type="email"
                    value={contactForm.email}
                    onChange={(event) =>
                      setContactForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />

                  <label htmlFor="edit-contact-phone">Phone number</label>
                  <input
                    id="edit-contact-phone"
                    type="tel"
                    maxLength={30}
                    value={contactForm.phone}
                    onChange={(event) =>
                      setContactForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                  />

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={contactForm.is_primary}
                      onChange={(event) =>
                        setContactForm((current) => ({
                          ...current,
                          is_primary: event.target.checked,
                        }))
                      }
                    />
                    Primary contact
                  </label>

                  <div className="form-actions">
                    <button type="submit" disabled={saving}>
                      {saving ? 'Saving...' : 'Save Contact'}
                    </button>

                    <button
                      type="button"
                      onClick={cancelContactForm}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

			  {addingContactForClient !== null && (
  <form className="client-form" onSubmit={handleAddContact}>
    <h3>Add Contact</h3>

    <label htmlFor="new-contact-type">Contact type *</label>
    <select
      id="new-contact-type"
      required
      value={contactForm.contact_type}
      onChange={(event) =>
        setContactForm((current) => ({
          ...current,
          contact_type: event.target.value as ContactForm['contact_type'],
        }))
      }
    >
      <option value="HR">HR</option>
      <option value="FINANCE">Finance</option>
      <option value="OTHER">Other</option>
    </select>

    <label htmlFor="new-contact-name">Contact name *</label>
    <input
      id="new-contact-name"
      required
      value={contactForm.name}
      onChange={(event) =>
        setContactForm((current) => ({
          ...current,
          name: event.target.value,
        }))
      }
    />

    <label htmlFor="new-contact-email">Email</label>
    <input
      id="new-contact-email"
      type="email"
      value={contactForm.email}
      onChange={(event) =>
        setContactForm((current) => ({
          ...current,
          email: event.target.value,
        }))
      }
    />

    <label htmlFor="new-contact-phone">Phone</label>
    <input
      id="new-contact-phone"
      value={contactForm.phone}
      onChange={(event) =>
        setContactForm((current) => ({
          ...current,
          phone: event.target.value,
        }))
      }
    />

    <label className="checkbox-label">
      <input
        type="checkbox"
        checked={contactForm.is_primary}
        onChange={(event) =>
          setContactForm((current) => ({
            ...current,
            is_primary: event.target.checked,
          }))
        }
      />
      Primary contact
    </label>

    <div className="form-actions">
      <button type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save Contact'}
      </button>

      <button
        type="button"
        disabled={saving}
        onClick={() => {
          setAddingContactForClient(null)
          setContactForm(emptyContactForm)
          setError(null)
        }}
      >
        Cancel
      </button>
    </div>
  </form>
)}

              {loading ? (
                <p role="status">Loading clients from the backend...</p>
              ) : clients.length === 0 ? (
                <p>No client records were returned by the API.</p>
              ) : (
                <div className="jobs-table-wrapper">
                  <table className="jobs-table">
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th>Status</th>
                        <th>Address</th>
                        <th>Contacts</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                       {filteredClients.map((client) => (
                        <tr key={client.id}>
                          <td>
                            <strong>{client.company_name}</strong>
                            <span className="job-id">
                              Client ID: {client.id}
                            </span>
                            {client.notes && (
                              <span className="client-notes">
                                Notes: {client.notes}
                              </span>
                            )}
                          </td>

                          <td>
                            <span className="job-status">
                              {client.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>

                          <td>{client.address || 'Not provided'}</td>

                                                    <td>
                            {client.contacts.length === 0 ? (
                              <span>No contacts</span>
                            ) : (
                              <ul className="client-contact-list">
                                     <button
                                              type="button"
                                      className="add-contact-button"
                                      onClick={() => startAddContact(client.id)}
                                      disabled={saving}
                                      >
                                      + Add Contact
                                    </button>
                                                               {client.contacts
                                   .filter(
                                    (contact) =>
                                   clientContactFilter === 'ALL' ||
                                 contact.contact_type === clientContactFilter,
                                          )
                                      .map((contact) => (
                                  <li
                                    className="client-contact-item"
                                    key={contact.id}
                                  >
                                    <div className="client-contact-details">
                                      <strong>
                                        {contact.name}
                                        {contact.is_primary && ' (Primary)'}
                                      </strong>
                                      <span>Type: {contact.contact_type}</span>
                                      <span>
                                        Email: {contact.email || 'Not provided'}
                                      </span>
                                      <span>
                                        Phone: {contact.phone || 'Not provided'}
                                      </span>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        startEditContact(client.id, contact)
                                      }
                                      disabled={saving}
                                    >
                                      Edit
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>

                          <td>
                            <button
                              type="button"
                              onClick={() => startEditClient(client)}
                              disabled={saving}
                            >
                              Edit Client
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export default App
