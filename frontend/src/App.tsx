
import { useCallback, useEffect, useState } from 'react'
import DashboardOverview from './components/DashboardOverview'
import CandidatesPage, { type CandidateFilters } from './components/CandidatesPage'
import { JobPartnersModal, PartnerRequirementsModal } from './components/PartnerAssignments'
import PartnerRequirementsPage from './components/PartnerRequirementsPage'
import UsersPage from './components/UsersPage'
import ProfilePage from './components/ProfilePage'
import ReportsPage from './components/ReportsPage'
import FeedbackButton from './components/FeedbackButton'
import FeedbackPage from './components/FeedbackPage'
import LoginBrand from './components/LoginBrand'
import GuidedTour from './components/GuidedTour'
import { TOUR_STEPS, type TourPage } from './tourSteps'
import logo from './assets/dmi-logo.webp'
import sidebarLogo from './assets/dmi-logo-sidebar.webp'
import { initials } from './profileUtils'
import ClientPositionsModal from './components/ClientPositionsModal'
import { formatCtc } from './positionFormat'
import { ClientCandidatesPage, ClientJobsPage, ClientOverview, type ClientTab } from './components/ClientPortal'
import JobJDModal from './components/JobJDModal'
import {
  createClient,
  createVendor,
  createClientContact,
  getClients,
  getJobs,
  getSubmissions,
  getCandidatePermissions,
  getJobAssignments,
  getMe,
  listFeedback,
  IS_DEMO,
  setClientActive,
  setJobActive,
  getRecruiterPerformance,
  setJobRecruiter,
  setVendorActive,
  getJobPermissions,
  getVendors,
  login,
  requestPasswordReset,
  resetPassword,
  createJob,
  updateJob,
  parseJobDescription,
  uploadJobJDFile,
  updateClient,
  updateClientContact,
  type CandidatePermissions,
  type JobAssignment,
  type Me,
  type CandidateSubmission,
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

// Signed in for this browser tab only (sessionStorage), or on this computer
// until the token expires when "Remember me" is ticked (localStorage).
function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
function storeToken(token: string, remember: boolean) {
  try {
    forgetStoredToken()
    ;(remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
  } catch {
    // storage unavailable: the session still works until the page is reloaded
  }
}
function forgetStoredToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // nothing stored
  }
}

// Sign-in tabs. The account decides what someone can see; the tab makes sure each kind of
// user signs in through the right door (and lets you share links like …/#client).
type LoginRole = 'team' | 'partner' | 'client'
const LOGIN_ROLE_KEY = 'vms_login_role'
const LOGIN_TABS: Array<{ role: LoginRole; label: string; intro: string }> = [
  { role: 'team', label: 'Team', intro: 'Sign in to manage jobs, candidates, partners and clients.' },
  { role: 'partner', label: 'Partner', intro: 'Channel partners: sign in to see your assigned requirements and submit candidates.' },
  { role: 'client', label: 'Client', intro: 'Clients: sign in to review the candidates shortlisted for your positions.' },
]
const LOGIN_ROLE_OF: Record<string, LoginRole> = { super_admin: 'team', recruiter: 'team', staff: 'team', partner: 'partner', client: 'client' }

function initialLoginRole(): LoginRole {
  const fromLink = window.location.hash.replace('#', '').toLowerCase()
  if (fromLink === 'team' || fromLink === 'partner' || fromLink === 'client') return fromLink
  try {
    const saved = localStorage.getItem(LOGIN_ROLE_KEY)
    if (saved === 'team' || saved === 'partner' || saved === 'client') return saved
  } catch {
    // storage unavailable: fall back to the Team tab
  }
  return 'team'
}

const NO_CANDIDATE_PERMISSIONS: CandidatePermissions = { can_submit: false, can_update_status: false, is_vendor_user: false, can_see_clients: true }

type Page = 'dashboard' | 'jobs' | 'clients' | 'vendors' | 'candidates' | 'users' | 'profile' | 'reports' | 'feedback'
 
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


function StatusBadge({ status }: { status: string | null | undefined }) {
  const normalized = (status || 'unknown').trim().toLowerCase()
  const statusClass = ['open', 'draft', 'closed', 'active', 'inactive'].includes(normalized)
    ? normalized
    : 'unknown'
  const label = normalized === 'unknown'
    ? 'Unknown'
    : normalized.charAt(0).toUpperCase() + normalized.slice(1)

  return (
    <span className={`job-status job-status-${statusClass}`}>
      <span className="job-status-dot" aria-hidden="true" />
      {label}
    </span>
  )
}

function App() {
  const [token, setToken] = useState<string | null>(
    () => readStoredToken(),
  )

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const initialResetToken = new URLSearchParams(window.location.search).get('reset_token') || ''
  const [authView, setAuthView] = useState<'login' | 'forgot' | 'reset'>(initialResetToken ? 'reset' : 'login')
  const [resetToken, setResetToken] = useState(initialResetToken)
  const [resetEmail, setResetEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [page, setPage] = useState<Page>('dashboard')
  const [jobFilter, setJobFilter] = useState<'all' | 'open'>('all')
  const [jobSearch, setJobSearch] = useState('')
  const [showInactiveJobs, setShowInactiveJobs] = useState(false)
  const [loginRole, setLoginRole] = useState<LoginRole>(initialLoginRole)
  const [loginNotice, setLoginNotice] = useState<string | null>(null)
  const [feedbackNew, setFeedbackNew] = useState<number | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const tourNavigate = useCallback((target: TourPage) => setPage(target), [])
  const closeTour = useCallback(() => setTourOpen(false), [])
  // Active recruiters (for assigning positions); empty for partner/client logins.
  const [recruiterOptions, setRecruiterOptions] = useState<Array<{ id: number; name: string }>>([])
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [jobs, setJobs] = useState<Job[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorSearch, setVendorSearch] = useState('')
  const [vendorStatusFilter, setVendorStatusFilter] = useState('ACTIVE')
  const [showVendorForm, setShowVendorForm] = useState(false)
  
  const [showJobForm, setShowJobForm] = useState(false)
  const [viewingJobJD, setViewingJobJD] = useState<Job | null>(null)
  const [viewingClientJDsId, setViewingClientJDsId] = useState<number | null>(null)
  const [expandedClientContacts, setExpandedClientContacts] = useState<number[]>([])

  const [savingJob, setSavingJob] = useState(false)
  const [parsingJD, setParsingJD] = useState(false)
  const [canChangeJobStatus, setCanChangeJobStatus] = useState(false)
  const [canManageJobs, setCanManageJobs] = useState(false)
  const [submissions, setSubmissions] = useState<CandidateSubmission[]>([])
  const [candidatePermissions, setCandidatePermissions] = useState<CandidatePermissions>(NO_CANDIDATE_PERMISSIONS)
  // Filters pre-set by "Candidates (n)" links on other pages; the key re-applies them on each click.
  const [candidateFilters, setCandidateFilters] = useState<CandidateFilters>({})
  const [candidatesNavKey, setCandidatesNavKey] = useState(0)
  // Channel-partner assignments (job <-> vendor); only Super Admin can load them.
  const [assignments, setAssignments] = useState<JobAssignment[]>([])
  const [managingPartnersJobId, setManagingPartnersJobId] = useState<number | null>(null)
  const [viewingPartnerId, setViewingPartnerId] = useState<number | null>(null)
  // Who is signed in: roles + permissions decide which pages and buttons are shown.
  const [me, setMe] = useState<Me | null>(null)
  const [clientTab, setClientTab] = useState<ClientTab>('review')
  const [clientJobFilter, setClientJobFilter] = useState<number | null>(null)
  const [clientNavKey, setClientNavKey] = useState(0)
  // Original JD document chosen in the Add Job form; uploaded after the job is saved.
  const [jdFile, setJdFile] = useState<File | null>(null)

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
          status: 'draft',
        })

  const [vendorForm, setVendorForm] =
  useState<VendorForm>(emptyVendorForm)
  const [clients, setClients] = useState<Client[]>([])
 
  const [clientSearch, setClientSearch] = useState('')
  const [clientStatusFilter, setClientStatusFilter] = useState('ACTIVE')
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
    forgetStoredToken()
    setToken(null)
    setJobs([])
    setCanChangeJobStatus(false)
    setCanManageJobs(false)
    setSubmissions([])
    setCandidatePermissions(NO_CANDIDATE_PERMISSIONS)
    setAssignments([])
    setMe(null)
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
        const [jobData, vendorData, clientData, jobPermissions, submissionData, candidatePerms, assignmentData, meData, recruiterData] = await Promise.all([
          getJobs(accessToken),
          // Only Super Admin may list vendors/clients (403 for Recruiter and Vendor roles);
          // those roles still get names for candidates from the submissions themselves.
          getVendors(accessToken).catch((): Vendor[] => []),
          getClients(accessToken).catch((): Client[] => []),
          getJobPermissions(accessToken),
          // Roles without candidate access (or an older backend) just see zero submissions.
          getSubmissions(accessToken).catch((): CandidateSubmission[] => []),
          getCandidatePermissions(accessToken).catch(() => NO_CANDIDATE_PERMISSIONS),
          getJobAssignments(accessToken).catch((): JobAssignment[] => []),
          getMe(accessToken).catch((): Me | null => null),
          getRecruiterPerformance(accessToken).catch(() => null),
        ])

        setRecruiterOptions(Array.isArray(recruiterData?.recruiters) ? recruiterData.recruiters.map((recruiter) => ({ id: recruiter.id, name: recruiter.name })) : [])

        // An older backend's /auth/me has no roles/permissions; then keep the previous behaviour.
        setMe(meData && Array.isArray(meData.permissions) && typeof meData.user_type === 'string' ? meData : null)
        if (meData && Array.isArray(meData.permissions) && meData.permissions.includes('users.manage')) {
          listFeedback(accessToken, { status: 'new' })
            .then((items) => setFeedbackNew(Array.isArray(items) ? items.length : null))
            .catch(() => setFeedbackNew(null))
        }

        setAssignments(Array.isArray(assignmentData) ? assignmentData : [])

        setCandidatePermissions(candidatePerms)

        setSubmissions(Array.isArray(submissionData) ? submissionData : [])
        setJobs(jobData)
        setVendors(vendorData)
        setClients(clientData)
        setCanChangeJobStatus(jobPermissions.can_change_status)
        setCanManageJobs(jobPermissions.can_manage_jobs ?? jobPermissions.can_change_status)
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

  function chooseLoginRole(role: LoginRole) {
    setLoginRole(role)
    try {
      localStorage.setItem(LOGIN_ROLE_KEY, role)
    } catch {
      // not remembered; fine
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginLoading(true)
    setError(null)

    setLoginNotice(null)

    try {
      const result = await login(email.trim(), password)
      // Make sure the account belongs behind the tab that was used.
      const who = await getMe(result.access_token).catch(() => null)
      const accountRole = who && typeof who.user_type === 'string' ? LOGIN_ROLE_OF[who.user_type] : undefined
      if (accountRole && accountRole !== loginRole) {
        const label = LOGIN_TABS.find((tab) => tab.role === accountRole)?.label ?? 'other'
        chooseLoginRole(accountRole)
        setLoginNotice(`This is a ${label.toLowerCase()} account, so we switched to the ${label} tab. Select Sign in to continue.`)
        return
      }
      storeToken(result.access_token, rememberMe)
      setToken(result.access_token)
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleForgotPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthBusy(true)
    setError(null)
    setAuthMessage(null)
    try {
      const result = await requestPasswordReset(resetEmail.trim())
      setAuthMessage(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request a password reset.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setAuthMessage(null)
    if (newPassword.length < 12) {
      setError('Use at least 12 characters for your new password.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }
    setAuthBusy(true)
    try {
      const result = await resetPassword(resetToken, newPassword)
      setAuthMessage(result.message)
      setNewPassword('')
      setConfirmPassword('')
      window.history.replaceState({}, document.title, window.location.pathname)
      setResetToken('')
      setAuthView('login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password.')
    } finally {
      setAuthBusy(false)
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
  setJdFile(null)
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
    status: 'draft',
  })
}


async function handleJDFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!token) {
    setError('Your session has expired. Please sign in again.')
    return
  }
  setParsingJD(true)
  setError(null)
  setSuccess(null)
  try {
    const parsed = await parseJobDescription(token, file)
    setJobForm((current) => ({
      ...current,
      title: parsed.title?.trim() || current.title,
      description: parsed.description || current.description,
      mandatory_skills: parsed.mandatory_skills ?? current.mandatory_skills,
      preferred_skills: parsed.preferred_skills ?? current.preferred_skills,
      min_experience: parsed.min_experience ?? current.min_experience,
      max_experience: parsed.max_experience ?? current.max_experience,
      qualification: parsed.qualification ?? current.qualification,
      location: parsed.location ?? current.location,
      work_arrangement: parsed.work_arrangement ?? current.work_arrangement,
      budget_min: parsed.budget_min ?? current.budget_min,
      budget_max: parsed.budget_max ?? current.budget_max,
      openings: parsed.openings ?? current.openings,
    }))
    setJdFile(file)
    setSuccess('JD text extracted. Please review the populated fields before saving.')
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unable to extract text from this JD.')
  } finally {
    setParsingJD(false)
  }
}

async function handleJobStatusChange(jobId: number, status: 'draft' | 'open' | 'closed') {
  if (!canChangeJobStatus) {
    setError('Only Super Admin can change job status.')
    return
  }
  if (!token) {
    setError('Your session has expired. Please sign in again.')
    return
  }
  setError(null)
  setSuccess(null)
  try {
    await updateJob(token, jobId, { status })
    setJobs((current) => current.map((job) => job.id === jobId ? { ...job, status } : job))
    setSuccess('Job status updated successfully.')
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unable to update job status.')
  }
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
    const createdJob = await createJob(token, {
      ...jobForm,
      title: jobForm.title.trim(),
      description: jobForm.description.trim(),
      location: jobForm.location.trim(),
    })

    // Keep the original PDF/DOCX so "View JD" can open it later.
    let attachError: string | null = null
    if (jdFile) {
      try {
        await uploadJobJDFile(token, createdJob.id, jdFile)
      } catch (err) {
        attachError = err instanceof Error ? err.message : 'Unable to upload the JD file.'
      }
    }

    await loadDashboard(token)
    cancelJobForm()
    if (attachError) {
      setError(`Job saved, but the original JD file was not attached: ${attachError} You can attach it from View JD.`)
    } else {
      setSuccess('Job requirement created successfully.')
    }
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
      <main className="login-page lp-page">
        <LoginBrand />

        <section className="lp-side">
          <div className="lp-card">
            {IS_DEMO && (
              <p className="demo-banner lp-demo" role="note">
                <strong>DEMO</strong> Test environment with sample data. Use the login details your team lead shared.
              </p>
            )}
            <img className="lp-logo" src={logo} alt="DM&I Technologies" width={178} height={192} />
            <h1>{authView === 'login' ? 'Welcome Back' : authView === 'forgot' ? 'Forgot your password?' : 'Set a new password'}</h1>
            <p className="lp-subtitle">
              {authView === 'login'
                ? 'Please enter your details to sign in'
                : authView === 'forgot'
                  ? 'Enter your email address and we’ll send you a reset link.'
                  : 'Choose a new password for your account (at least 12 characters).'}
            </p>

            {authView === 'login' && (
            <div className="login-tabs" role="tablist" aria-label="Sign in as">
              {LOGIN_TABS.map((tab) => (
                <button
                  key={tab.role}
                  type="button"
                  role="tab"
                  id={`login-tab-${tab.role}`}
                  aria-selected={loginRole === tab.role}
                  aria-controls="login-panel"
                  className={loginRole === tab.role ? 'active' : ''}
                  onClick={() => {
                    chooseLoginRole(tab.role)
                    setLoginNotice(null)
                    setError(null)
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

            {authView === 'login' && (
              <p className="lp-intro">{LOGIN_TABS.find((tab) => tab.role === loginRole)?.intro}</p>
            )}
            {authView === 'login' && loginNotice && (
              <p className="login-notice" role="status">{loginNotice}</p>
            )}
            {error && (
              <p className="error-message" role="alert">{error}</p>
            )}
            {authMessage && (
              <p className="success-message" role="status">{authMessage}</p>
            )}

            {authView === 'login' && (
              <form onSubmit={handleLogin} className="auth-form" id="login-panel" role="tabpanel" aria-labelledby={`login-tab-${loginRole}`}>
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="Email address"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <label htmlFor="password">Password</label>
                <div className="lp-password">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="lp-eye"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                      <circle cx="12" cy="12" r="3" />
                      {!showPassword && <path d="M3 3l18 18" />}
                    </svg>
                  </button>
                </div>
                <div className="lp-row">
                  <button
                    type="button"
                    className="lp-link"
                    onClick={() => {
                      setAuthView('forgot')
                      setError(null)
                      setAuthMessage(null)
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <button type="submit" className="lp-primary" disabled={loginLoading}>
                  {loginLoading ? 'Signing in…' : 'Sign in'}
                </button>
                <label className="lp-remember">
                  <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
                  Remember me
                </label>
                <p className="lp-account">Don’t have an account? <span>Ask your administrator to create one for you.</span></p>
              </form>
            )}
              {authView === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="auth-form">
                <label htmlFor="reset-email">Email address</label>
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                />
                <button type="submit" className="lp-primary" disabled={authBusy}>
                  {authBusy ? 'Sending…' : 'Send reset link'}
                </button>
                <button type="button" className="lp-link lp-back" onClick={() => { setAuthView('login'); setError(null); setAuthMessage(null) }}>
                  ← Back to sign in
                </button>
              </form>
          )}

          {authView === 'reset' && (
            <form onSubmit={handleResetPassword} className="auth-form">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              <button type="submit" className="lp-primary" disabled={authBusy}>
                {authBusy ? 'Resetting…' : 'Reset password'}
              </button>
              <button type="button" className="lp-link lp-back" onClick={() => { setAuthView('login'); setError(null); setAuthMessage(null) }}>
                ← Back to sign in
              </button>
            </form>
          )}
          </div>
        </section>
      </main>
    )
  }

  const openCandidates = (filters: CandidateFilters = {}) => {
    setCandidateFilters(filters)
    setCandidatesNavKey((key) => key + 1)
    setError(null)
    setSuccess(null)
    setPage('candidates')
  }

  const refreshSubmissions = async () => {
    if (!token) return
    try {
      const data = await getSubmissions(token)
      setSubmissions(Array.isArray(data) ? data : [])
    } catch (err) {
      if (err instanceof Error && err.message.includes('session has expired')) logout()
      throw err
    }
  }

  const candidateCount = (match: (item: CandidateSubmission) => boolean) => submissions.filter(match).length

  // Deactivated jobs are only listed on the Jobs page (when "Show deactivated" is on).
  const visibleJobs = jobs.filter((job) => job.is_active !== false)
  const jobListed = (job: Job) => showInactiveJobs || job.is_active !== false

  async function assignRecruiter(job: Job, recruiterId: number | null) {
    if (!token) return
    setTogglingId(`rec-${job.id}`)
    setError(null)
    setSuccess(null)
    try {
      const updated = await setJobRecruiter(token, job.id, recruiterId)
      setJobs((current) => current.map((item) => (item.id === job.id ? { ...item, ...updated } : item)))
      setSuccess(recruiterId === null ? `${job.title} no longer has a recruiter.` : `${job.title} is now owned by ${updated.recruiter_name ?? 'the selected recruiter'}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The recruiter could not be assigned.')
    } finally {
      setTogglingId(null)
    }
  }

  // Deactivate / activate. Nothing is deleted; the record keeps its history.
  async function toggleActive(kind: 'job' | 'client' | 'vendor', id: number, name: string, makeActive: boolean) {
    if (!token) return
    setTogglingId(`${kind}-${id}`)
    setError(null)
    setSuccess(null)
    try {
      if (kind === 'job') {
        const updated = await setJobActive(token, id, makeActive)
        setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...updated } : job)))
      } else if (kind === 'client') {
        const updated = await setClientActive(token, id, makeActive)
        setClients((current) => current.map((client) => (client.id === id ? { ...client, ...updated } : client)))
      } else {
        const updated = await setVendorActive(token, id, makeActive)
        setVendors((current) => current.map((vendor) => (vendor.id === id ? { ...vendor, ...updated } : vendor)))
      }
      setSuccess(`${name} ${makeActive ? 'activated' : 'deactivated'}.${makeActive ? '' : ' You can activate it again at any time.'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be saved.')
    } finally {
      setTogglingId(null)
    }
  }

  const refreshAssignments = async () => {
    if (!token) return
    const data = await getJobAssignments(token)
    setAssignments(Array.isArray(data) ? data : [])
  }

  // Role-based access. Without /auth/me (older backend) fall back to the previous behaviour.
  const can = (code: string) => (me ? me.permissions.includes(code) : true)
  const isClient = me?.user_type === 'client' || candidatePermissions.is_client_user === true
  const canManageClients = can('clients.manage')
  const canViewClients = canManageClients || can('clients.view')
  const canManageVendors = can('vendors.manage')
  const canViewVendors = canManageVendors || can('vendors.view')
  const canManageUsers = me ? me.permissions.includes('users.manage') : false
  const roleLabel = !me ? '' : me.user_type === 'super_admin' ? 'Super Admin' : me.user_type === 'recruiter' ? 'Recruiter'
    : me.user_type === 'partner' ? `Channel partner${me.vendor_name ? ` · ${me.vendor_name}` : ''}`
      : me.user_type === 'client' ? `Client${me.client_name ? ` · ${me.client_name}` : ''}` : me.roles.join(', ')
  const openClientCandidates = (tab: ClientTab, jobId: number | null = null) => {
    setClientTab(tab)
    setClientJobFilter(jobId)
    setClientNavKey((key) => key + 1)
    setPage('candidates')
  }

  // Channel-partner (vendor) logins get their own views, and may not be allowed to see clients.
  const partnerView = candidatePermissions.is_vendor_user
  const hideClientsInUI = partnerView && candidatePermissions.can_see_clients === false
  const clientNameFor = (job: Job) =>
    job.client_name ?? (job.client_id == null ? 'No client linked' : clients.find((client) => client.id === job.client_id)?.company_name ?? `Client #${job.client_id}`)
  const partnersOf = (jobId: number) => assignments.filter((item) => item.job_id === jobId)

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
        <h2 className="sidebar-brand">
          <img src={sidebarLogo} alt="DM&I Technologies" width={167} height={156} />
          <span className="sr-only">Recruitment VMS</span>
        </h2>

        <nav aria-label="Main navigation">
          <a
            href="#dashboard"
            className={page === 'dashboard' ? 'active' : ''}
            onClick={() => setPage('dashboard')}
          >
            {isClient ? 'Overview' : 'Dashboard'}
          </a>

          <a
            href="#jobs"
            className={page === 'jobs' ? 'active' : ''}
            onClick={() => setPage('jobs')}
          >
            {isClient ? 'Our Jobs' : partnerView ? 'Requirements' : 'Jobs'}
          </a>

          <a
            href="#candidates"
            className={page === 'candidates' ? 'active' : ''}
            onClick={() => (isClient ? openClientCandidates('review') : openCandidates())}
          >
            Candidates
          </a>

          {!partnerView && !isClient && canViewVendors && (
            <a
              href="#vendors"
              className={page === 'vendors' ? 'active' : ''}
              onClick={() => setPage('vendors')}
            >
              Vendors
            </a>
          )}

          {!partnerView && !isClient && canViewClients && (
            <a
              href="#clients"
              className={page === 'clients' ? 'active' : ''}
              onClick={() => setPage('clients')}
            >
              Clients
            </a>
          )}

          {canManageUsers && (
            <a
              href="#users"
              className={page === 'users' ? 'active' : ''}
              onClick={() => setPage('users')}
            >
              Users
            </a>
          )}

          {canManageUsers && (
            <a
              href="#feedback"
              className={page === 'feedback' ? 'active' : ''}
              onClick={(event) => {
                event.preventDefault()
                setPage('feedback')
              }}
            >
              Feedback{feedbackNew ? <span className="nav-badge" aria-label={`${feedbackNew} new`}>{feedbackNew}</span> : null}
            </a>
          )}

          {!partnerView && !isClient && (
            <a
              href="#reports"
              className={page === 'reports' ? 'active' : ''}
              onClick={(event) => {
                event.preventDefault()
                setPage('reports')
              }}
            >
              Reports
            </a>
          )}
        </nav>

        {me && (
          <button
            type="button"
            className={`sidebar-identity${page === 'profile' ? ' active' : ''}`}
            aria-label="Signed in user"
            title="Open my profile"
            onClick={() => setPage('profile')}
          >
            <span className="pf-avatar" aria-hidden="true">{initials(me.full_name, me.email)}</span>
            <span className="sidebar-identity-text">
              <strong title={me.email}>{me.full_name || me.email}</strong>
              {me.full_name && <small className="sidebar-email">{me.email}</small>}
              <small>{roleLabel}</small>
              <small className="sidebar-profile-link">My profile</small>
            </span>
          </button>
        )}

        <button className="logout-button" onClick={logout}>
          Sign out
        </button>
      </aside>

      <main className="main-content">
        {IS_DEMO && (
          <p className="demo-banner" role="note">
            <strong>DEMO</strong> Test environment with sample data, not real clients or candidates. Found a bug or have an idea? Use <strong>Feedback</strong> at the bottom right.
          </p>
        )}
        {page === 'profile' && me ? (
          <ProfilePage key={me.id} token={token} me={me} onUpdated={setMe} />
        ) : isClient && me && page === 'dashboard' ? (
          <ClientOverview me={me} jobs={visibleJobs} submissions={submissions} loading={loading} onOpenCandidates={(tab) => openClientCandidates(tab)} />
        ) : isClient && page === 'jobs' ? (
          <ClientJobsPage
            jobs={visibleJobs}
            submissions={submissions}
            loading={loading}
            onViewJD={setViewingJobJD}
            onOpenCandidates={(tab, jobId) => openClientCandidates(tab, jobId ?? null)}
          />
        ) : isClient && page === 'candidates' ? (
          <ClientCandidatesPage
            key={clientNavKey}
            token={token}
            jobs={visibleJobs}
            submissions={submissions}
            loading={loading}
            initialTab={clientTab}
            initialJobId={clientJobFilter}
            onReload={refreshSubmissions}
            onViewJD={(jobId) => {
              const job = jobs.find((item) => item.id === jobId)
              if (job) setViewingJobJD(job)
            }}
          />
        ) : page === 'feedback' && canManageUsers && token ? (
          <FeedbackPage token={token} onCountChange={setFeedbackNew} />
        ) : page === 'reports' && !partnerView && !isClient ? (
          <ReportsPage token={token} clients={clients} />
        ) : page === 'users' && canManageUsers && me ? (
          <UsersPage token={token} me={me} vendors={vendors} clients={clients} />
        ) : page === 'dashboard' ? (
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

            <DashboardOverview
              jobs={visibleJobs}
              submissions={submissions}
              clients={clients}
              activeVendors={activeVendors}
              activeClients={activeClients}
              loading={loading}
              onRefresh={() => token && void loadDashboard(token)}
              onOpenJobs={(filter) => {
                setJobFilter(filter)
                setPage('jobs')
              }}
              onOpenVendors={() => setPage('vendors')}
              onOpenCandidates={() => openCandidates()}
              hideClients={hideClientsInUI}
              token={token}
              showRecruiters={!partnerView && !isClient}
              onOpenClients={() => setPage('clients')}
              onSelectJob={setViewingJobJD}
            />
          </>
        ) : page === 'jobs' && partnerView ? (
          <PartnerRequirementsPage
            jobs={visibleJobs}
            submissions={submissions}
            loading={loading}
            canSeeClients={!hideClientsInUI}
            canSubmit={candidatePermissions.can_submit}
            loadError={error}
            onViewJD={setViewingJobJD}
            onSubmitFor={(jobId) => openCandidates({ jobId, openSubmit: true })}
            onViewSubmissions={(jobId) => openCandidates({ jobId })}
          />
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
                      : `${jobs.filter((job) => ((jobFilter === 'all' || job.status === 'open') && jobListed(job)) && (!jobSearch.trim() || [job.title, String(job.id), job.status, String(job.client_id ?? ''), job.location, job.description].some((value) => String(value ?? '').toLowerCase().includes(jobSearch.trim().toLowerCase())))).length} job record(s)`}
                  </p>
                </div>

                                
                <div className="jobs-actions">
                    {canManageJobs && (
                    <button data-tour="add-job"
                      type="button"
                      onClick={() => {
                        setError(null)
                        setSuccess(null)
                        setShowJobForm(true)
                      }}
                    >
                      + Add Job Requirement
                    </button>
                    )}

                    <button
                      type="button"
                      onClick={() => token && void loadDashboard(token)}
                      disabled={loading}
                    >
                      {loading ? 'Refreshing...' : 'Refresh jobs'}
                    </button>
                  </div>
              </div>

              <div className="jobs-search-row">
                <label className="jobs-search-label" htmlFor="jobs-search">Search jobs</label>
                <input
                  id="jobs-search"
                  type="search"
                  className="jobs-search-input"
                  placeholder="Search by job title, job ID, status, client ID, location, or description..."
                  value={jobSearch}
                  onChange={(event) => setJobSearch(event.target.value)}
                  aria-label="Search jobs"
                />
                {jobSearch && (
                  <button type="button" className="jobs-search-clear" onClick={() => setJobSearch('')}>Clear</button>
                )}
                {canManageJobs && jobs.some((job) => job.is_active === false) && (
                  <label className="da-toggle">
                    <input type="checkbox" checked={showInactiveJobs} onChange={(event) => setShowInactiveJobs(event.target.checked)} />
                    Show deactivated ({jobs.filter((job) => job.is_active === false).length})
                  </label>
                )}
              </div>

              {showJobForm && (
                <form className="job-form" onSubmit={handleSaveJob}>
                  <h3>Add Job Requirement</h3>

                  <div className="jd-upload-row">
                    <label htmlFor="job-jd-upload">Upload JD (PDF or DOCX)</label>
                    <input id="job-jd-upload" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleJDFileSelected} disabled={parsingJD || savingJob} />
                    <span>{parsingJD ? 'Extracting JD text…' : jdFile ? `Original file “${jdFile.name}” will be saved with this job.` : 'Text will be extracted into the job fields for review.'}</span>
                  </div>

                  <div className="vf-sections">
                    <fieldset className="vf-section">
                      <legend>Role</legend>
                      <div className="vf-grid">
                      <label className="vf-field vf-span-2">
                        <span className="vf-label">Job title<span className="vf-req" aria-hidden="true"> *</span></span>
                        <input required value={jobForm.title} onChange={(event) => setJobForm((current) => ({ ...current, title: event.target.value }))} />
                      </label>
                      <label className="vf-field">
                        <span className="vf-label">Client</span>
                        <select value={jobForm.client_id ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, client_id: event.target.value ? Number(event.target.value) : null }))}>
                      <option value="">No client selected</option>
                      {clients.filter((client) => client.is_active || client.id === jobForm.client_id).map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}
                    </select>
                      </label>
                      {canManageJobs && (
                      <label className="vf-field">
                        <span className="vf-label">Recruiter</span>
                        <select value={jobForm.recruiter_id ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, recruiter_id: event.target.value ? Number(event.target.value) : null }))}>
                          <option value="">Unassigned</option>
                          {recruiterOptions.map((recruiter) => <option key={recruiter.id} value={recruiter.id}>{recruiter.name}</option>)}
                        </select>
                        <small className="vf-hint">Owns this position; their closures are counted from it.</small>
                      </label>
                      )}
                      {canChangeJobStatus && (
                      <label className="vf-field">
                        <span className="vf-label">Status</span>
                        <select value={jobForm.status} onChange={(event) => setJobForm((current) => ({ ...current, status: event.target.value as 'draft' | 'open' | 'closed' }))}>
                        <option value="draft">Draft</option>
                        <option value="open">Open</option>
                        <option value="closed">Close</option>
                      </select>
                      </label>
                      )}
                      <label className="vf-field">
                        <span className="vf-label">Location<span className="vf-req" aria-hidden="true"> *</span></span>
                        <input required value={jobForm.location} onChange={(event) => setJobForm((current) => ({ ...current, location: event.target.value }))} />
                      </label>
                      <label className="vf-field">
                        <span className="vf-label">Work arrangement</span>
                        <select value={jobForm.work_arrangement ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, work_arrangement: event.target.value || null }))}>
                      <option value="">Select arrangement</option><option value="On-site">On-site</option><option value="Hybrid">Hybrid</option><option value="Remote">Remote</option>
                    </select>
                      </label>
                      <label className="vf-field">
                        <span className="vf-label">Number of openings<span className="vf-req" aria-hidden="true"> *</span></span>
                        <input type="number" min="1" required value={jobForm.openings} onChange={(event) => setJobForm((current) => ({ ...current, openings: Number(event.target.value) }))} />
                      </label>
                      </div>
                    </fieldset>

                    <fieldset className="vf-section">
                      <legend>Description and skills</legend>
                      <div className="vf-grid vf-grid-2">
                      <label className="vf-field vf-span-all">
                        <span className="vf-label">Job description<span className="vf-req" aria-hidden="true"> *</span></span>
                        <textarea className="vf-tall" required value={jobForm.description} onChange={(event) => setJobForm((current) => ({ ...current, description: event.target.value }))} />
                      </label>
                      <label className="vf-field">
                        <span className="vf-label">Mandatory skills</span>
                        <textarea value={jobForm.mandatory_skills ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, mandatory_skills: event.target.value || null }))} />
                        <small className="vf-hint">Separate skills with commas or new lines.</small>
                      </label>
                      <label className="vf-field">
                        <span className="vf-label">Preferred skills</span>
                        <textarea value={jobForm.preferred_skills ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, preferred_skills: event.target.value || null }))} />
                        <small className="vf-hint">Nice to have, not required.</small>
                      </label>
                      </div>
                    </fieldset>

                    <fieldset className="vf-section">
                      <legend>Experience and qualification</legend>
                      <div className="vf-grid">
                      <label className="vf-field">
                        <span className="vf-label">Minimum experience (years)<span className="vf-req" aria-hidden="true"> *</span></span>
                        <input type="number" min="0" required value={jobForm.min_experience} onChange={(event) => setJobForm((current) => ({ ...current, min_experience: Number(event.target.value) }))} />
                      </label>
                      <label className="vf-field">
                        <span className="vf-label">Maximum experience (years)</span>
                        <input type="number" min="0" value={jobForm.max_experience ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, max_experience: event.target.value === '' ? null : Number(event.target.value) }))} />
                      </label>
                      <label className="vf-field">
                        <span className="vf-label">Qualification</span>
                        <input value={jobForm.qualification ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, qualification: event.target.value || null }))} />
                        <small className="vf-hint">e.g. B.Tech / MCA</small>
                      </label>
                      </div>
                    </fieldset>

                    <fieldset className="vf-section">
                      <legend>Compensation</legend>
                      <div className="vf-grid">
                      <label className="vf-field">
                        <span className="vf-label">Minimum budget</span>
                        <input type="number" min="0" value={jobForm.budget_min ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, budget_min: event.target.value === '' ? null : Number(event.target.value) }))} />
                        <small className="vf-hint">{jobForm.budget_min ? `= ${formatCtc(Number(jobForm.budget_min))}` : 'Yearly CTC in rupees, e.g. 1200000 = 12 LPA'}</small>
                      </label>
                      <label className="vf-field">
                        <span className="vf-label">Maximum budget</span>
                        <input type="number" min="0" value={jobForm.budget_max ?? ''} onChange={(event) => setJobForm((current) => ({ ...current, budget_max: event.target.value === '' ? null : Number(event.target.value) }))} />
                        <small className="vf-hint">{jobForm.budget_max ? `= ${formatCtc(Number(jobForm.budget_max))}` : 'Yearly CTC in rupees, e.g. 1200000 = 12 LPA'}</small>
                      </label>
                      </div>
                    </fieldset>
                  </div>

                  <div className="form-actions job-form-actions">
                    <button type="button" onClick={cancelJobForm} disabled={savingJob}>Cancel</button>
                    <button type="submit" disabled={savingJob}>{savingJob ? 'Saving…' : 'Save job'}</button>
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
                        <th className="sno-col">S.No</th>
                        <th>Job title</th>
                        <th>Status</th>
                        <th>Openings</th>
                        <th>Client</th>
                        <th>Recruiter</th>
                        <th>Candidates</th>
                        {canManageJobs && <th>Partners</th>}
                        <th>JD</th>
                        {canManageJobs && <th>Active</th>}
                      </tr>
                    </thead>

                    <tbody>
                        {jobs
                      .filter((job) => (jobFilter === 'all' || job.status === 'open') && jobListed(job))
                      .filter((job) => !jobSearch.trim() || [job.title, String(job.id), job.status, String(job.client_id ?? ''), job.location, job.description].some((value) => String(value ?? '').toLowerCase().includes(jobSearch.trim().toLowerCase())))
                      .map((job, index) => (
                        <tr key={job.id} className={job.is_active === false ? 'da-row-inactive' : undefined}>
                          <td className="sno-col">{index + 1}</td>
                          <td>
                            <strong>{job.title}</strong>
                            <span className="job-id">Job ID: {job.id}</span>
                          </td>
                          <td>
                            <div className="job-status-control">
                              <StatusBadge status={job.status} />
                              {canChangeJobStatus && (
                                <select aria-label={`Change status for ${job.title}`} value={['draft', 'open', 'closed'].includes(job.status) ? job.status : 'draft'} onChange={(event) => void handleJobStatusChange(job.id, event.target.value as 'draft' | 'open' | 'closed')}>
                                  <option value="draft">Draft</option>
                                  <option value="open">Open</option>
                                  <option value="closed">Close</option>
                                </select>
                              )}
                            </div>
                          </td>
                          <td>{job.openings}</td>
                          <td>{job.client_id == null ? 'Not linked' : clients.find((client) => client.id === job.client_id)?.company_name ?? `Client #${job.client_id}`}</td>
                          <td>
                            {canManageJobs ? (
                              <select
                                className="rb-assign"
                                aria-label={`Recruiter for ${job.title}`}
                                value={job.recruiter_id ?? ''}
                                disabled={togglingId !== null}
                                onChange={(event) => void assignRecruiter(job, event.target.value ? Number(event.target.value) : null)}
                              >
                                <option value="">Unassigned</option>
                                {recruiterOptions.map((recruiter) => <option key={recruiter.id} value={recruiter.id}>{recruiter.name}</option>)}
                                {job.recruiter_id != null && !recruiterOptions.some((recruiter) => recruiter.id === job.recruiter_id) && (
                                  <option value={job.recruiter_id}>{job.recruiter_name ?? 'Former recruiter'} (inactive)</option>
                                )}
                              </select>
                            ) : (
                              job.recruiter_name ?? <span className="no-assigned-jd">Unassigned</span>
                            )}
                          </td>
                          <td>
                            {candidateCount((item) => item.job_id === job.id) === 0 ? (
                              <span className="no-assigned-jd">None yet</span>
                            ) : (
                              <button
                                type="button"
                                className="client-jd-button"
                                aria-label={`View candidates for ${job.title}`}
                                onClick={() => openCandidates({ jobId: job.id })}
                              >
                                Candidates ({candidateCount((item) => item.job_id === job.id)})
                              </button>
                            )}
                          </td>
                          {canManageJobs && (
                            <td>
                              <div className="pa-cell">
                                {partnersOf(job.id).length === 0 ? (
                                  <span className="no-assigned-jd">None assigned</span>
                                ) : (
                                  <span className="pa-names" title={partnersOf(job.id).map((item) => item.vendor_name).join(', ')}>
                                    {partnersOf(job.id).slice(0, 2).map((item) => item.vendor_name).join(', ')}
                                    {partnersOf(job.id).length > 2 && ` +${partnersOf(job.id).length - 2}`}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="pa-manage"
                                  aria-label={`Manage partners for ${job.title}`}
                                  onClick={() => setManagingPartnersJobId(job.id)}
                                >
                                  Manage
                                </button>
                              </div>
                            </td>
                          )}
                          <td>
                            <button
                              type="button"
                              className="job-view-button"
                              aria-label={`View JD for ${job.title}`}
                              onClick={() => setViewingJobJD(job)}
                            >
                              {`${job.title}_JD`}
                            </button>
                          </td>
                          {canManageJobs && (
                            <td>
                              <button
                                type="button"
                                className={job.is_active === false ? 'da-activate' : 'da-deactivate'}
                                disabled={togglingId !== null}
                                aria-label={`${job.is_active === false ? 'Activate' : 'Deactivate'} job ${job.title}`}
                                onClick={() => void toggleActive('job', job.id, job.title, job.is_active === false)}
                              >
                                {togglingId === `job-${job.id}` ? 'Saving…' : job.is_active === false ? 'Activate' : 'Deactivate'}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {jobs.filter((job) => (jobFilter === 'all' || job.status === 'open') && jobListed(job)).filter((job) => !jobSearch.trim() || [job.title, String(job.id), job.status, String(job.client_id ?? ''), job.location, job.description].some((value) => String(value ?? '').toLowerCase().includes(jobSearch.trim().toLowerCase()))).length === 0 && (
                        <tr><td colSpan={20} className="jobs-no-results">No jobs match “{jobSearch}”. Try a different search.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}


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
                  {canManageVendors && (
                  <button data-tour="add-vendor"
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
                  )}
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
                    setVendorStatusFilter('ACTIVE')
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
                        <th className="sno-col">S.No</th>
                        <th>Vendor</th>
                        <th>Contact name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th>Candidates</th>
                        <th>Requirements</th>
                        {canManageVendors && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVendors.map((vendor, index) => (
                        <tr key={vendor.id}>
                          <td className="sno-col">{index + 1}</td>
                          <td>
                            <strong>{vendor.name}</strong>
                            <span className="job-id">Vendor ID: {vendor.id}</span>
                          </td>
                          <td>{vendor.contact_name || 'Not provided'}</td>
                          <td>{vendor.contact_email || 'Not provided'}</td>
                          <td>{vendor.contact_phone || 'Not provided'}</td>
                          <td>
                            <StatusBadge status={vendor.is_active ? 'active' : 'inactive'} />
                          </td>
                          <td>
                            {candidateCount((item) => item.vendor_id === vendor.id) === 0 ? (
                              <span className="no-assigned-jd">None yet</span>
                            ) : (
                              <button
                                type="button"
                                className="client-jd-button"
                                aria-label={`View candidates submitted by ${vendor.name}`}
                                onClick={() => openCandidates({ vendorId: vendor.id })}
                              >
                                Candidates ({candidateCount((item) => item.vendor_id === vendor.id)})
                              </button>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="client-jd-button"
                              aria-label={`Assigned requirements for ${vendor.name}`}
                              onClick={() => setViewingPartnerId(vendor.id)}
                            >
                              {assignments.filter((item) => item.vendor_id === vendor.id).length === 0
                                ? 'Assign'
                                : `${assignments.filter((item) => item.vendor_id === vendor.id).length} assigned`}
                            </button>
                          </td>
                          {canManageVendors && (
                            <td>
                              <button
                                type="button"
                                className={vendor.is_active ? 'da-deactivate' : 'da-activate'}
                                disabled={togglingId !== null}
                                aria-label={`${vendor.is_active ? 'Deactivate' : 'Activate'} partner ${vendor.name}`}
                                onClick={() => void toggleActive('vendor', vendor.id, vendor.name, !vendor.is_active)}
                              >
                                {togglingId === `vendor-${vendor.id}` ? 'Saving…' : vendor.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : page === 'candidates' ? (
          <CandidatesPage
            key={candidatesNavKey}
            token={token}
            submissions={submissions}
            jobs={visibleJobs}
            clients={clients}
            loading={loading}
            permissions={candidatePermissions}
            initialFilters={candidateFilters}
            loadError={error}
            onReload={refreshSubmissions}
            onOpenJob={(jobId) => {
              const job = jobs.find((item) => item.id === jobId)
              if (job) setViewingJobJD(job)
            }}
          />
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

                {canManageClients && (
                <button data-tour="add-client"
                  type="button"
                  onClick={startAddClient}
                  disabled={saving}
                >
                  + Add Client
                </button>
                )}
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
                    setClientStatusFilter('ACTIVE')
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
                        <th className="sno-col">S.No</th>
                        <th>Company</th>
                        <th>Status</th>
                        <th>Address</th>
                        <th>SPOC</th>
                        <th>JD</th>
                        <th>Candidates</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                       {filteredClients.map((client, index) => (
                        <tr key={client.id}>
                          <td className="sno-col">{index + 1}</td>
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
                            <StatusBadge status={client.is_active ? 'active' : 'inactive'} />
                          </td>

                          <td>{client.address || 'Not provided'}</td>

                                                    <td>
                            <div className="assigned-contact-cell">
                              <button
                                type="button"
                                className="assigned-contact-toggle"
                                aria-expanded={expandedClientContacts.includes(client.id)}
                                onClick={() => setExpandedClientContacts((current) =>
                                  current.includes(client.id)
                                    ? current.filter((id) => id !== client.id)
                                    : [...current, client.id],
                                )}
                              >
                                SPOC ({client.contacts.length})
                              </button>
                              {expandedClientContacts.includes(client.id) && (
                                <div className="assigned-contact-panel">
                                  {canManageClients && (<button type="button" className="add-contact-button"
                                    onClick={() => startAddContact(client.id)} disabled={saving}>
                                    + Add Contact
                                  </button>)}
                                  {client.contacts.length === 0 ? (
                                    <p className="no-client-contacts">No contacts added yet.</p>
                                  ) : (
                                    <ul className="client-contact-list">
                                      {client.contacts.filter((contact) =>
                                        clientContactFilter === 'ALL' || contact.contact_type === clientContactFilter,
                                      ).map((contact) => (
                                        <li className="client-contact-item" key={contact.id}>
                                          <div className="client-contact-details">
                                            <strong>{contact.name}{contact.is_primary && ' (Primary)'}</strong>
                                            <span>Type: {contact.contact_type}</span>
                                            <span>Email: {contact.email || 'Not provided'}</span>
                                            <span>Phone: {contact.phone || 'Not provided'}</span>
                                          </div>
                                          {canManageClients && <button type="button" onClick={() => startEditContact(client.id, contact)} disabled={saving}>Edit</button>}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>

                          <td>
                            <div className="client-assigned-jd-cell">
                              {visibleJobs.filter((job) => job.client_id === client.id).length === 0 ? (
                                <span className="no-assigned-jd">No assigned JD</span>
                              ) : (
                                <button
                                  type="button"
                                  className="client-jd-button"
                                  onClick={() => {
                                    setViewingClientJDsId(client.id)


                                  }}
                                  aria-label={`View ${visibleJobs.filter((job) => job.client_id === client.id).length} JDs assigned to ${client.company_name}`}
                                >
                                  View JDs ({visibleJobs.filter((job) => job.client_id === client.id).length})
                                </button>
                              )}
                            </div>
                          </td>

                          <td>
                            {candidateCount((item) => item.client_id === client.id) === 0 ? (
                              <span className="no-assigned-jd">None yet</span>
                            ) : (
                              <button
                                type="button"
                                className="client-jd-button"
                                aria-label={`View candidates for ${client.company_name}`}
                                onClick={() => openCandidates({ clientId: client.id })}
                              >
                                Candidates ({candidateCount((item) => item.client_id === client.id)})
                              </button>
                            )}
                          </td>

                          <td>
                            <div className="client-action-buttons">
                              {canManageJobs && (
                              <button
                                type="button"
                                onClick={() => {
                                  setJobForm((current) => ({ ...current, client_id: client.id }))
                                  setPage('jobs')
                                  setError(null)
                                  setSuccess(null)
                                  setShowJobForm(true)
                                }}
                                disabled={saving || savingJob}
                              >
                                + Add Job Requirement
                              </button>
                              )}
                              {canManageClients && (
                              <button
                                type="button"
                                onClick={() => startEditClient(client)}
                                disabled={saving}
                              >
                                Edit Client
                              </button>
                              )}
                              {canManageClients && (
                                <button
                                  type="button"
                                  className={client.is_active ? 'da-deactivate' : 'da-activate'}
                                  disabled={togglingId !== null}
                                  aria-label={`${client.is_active ? 'Deactivate' : 'Activate'} client ${client.company_name}`}
                                  onClick={() => void toggleActive('client', client.id, client.company_name, !client.is_active)}
                                >
                                  {togglingId === `client-${client.id}` ? 'Saving…' : client.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                              )}
                              {!canManageJobs && !canManageClients && <span className="cd-muted">View only</span>}
                            </div>
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
      {viewingClientJDsId !== null && clients.some((client) => client.id === viewingClientJDsId) && (
        <ClientPositionsModal
          client={clients.find((client) => client.id === viewingClientJDsId) as Client}
          jobs={visibleJobs}
          canManageJobs={canManageJobs}
          onClose={() => setViewingClientJDsId(null)}
          onViewJD={(job) => {
            setViewingClientJDsId(null)
            setViewingJobJD(job)
          }}
          onAddJob={(clientId) => {
            setJobForm((current) => ({ ...current, client_id: clientId }))
            setPage('jobs')
            setError(null)
            setSuccess(null)
            setShowJobForm(true)
            setViewingClientJDsId(null)
          }}
        />
      )}

      {managingPartnersJobId != null && jobs.some((job) => job.id === managingPartnersJobId) && (
        <JobPartnersModal
          token={token}
          job={jobs.find((job) => job.id === managingPartnersJobId) as Job}
          vendors={vendors}
          assignments={assignments}
          submissions={submissions}
          clientName={clientNameFor(jobs.find((job) => job.id === managingPartnersJobId) as Job)}
          onClose={() => setManagingPartnersJobId(null)}
          onSaved={async (message) => {
            await refreshAssignments().catch(() => undefined)
            if (message) {
              setManagingPartnersJobId(null)
              setError(null)
              setSuccess(message)
            }
          }}
        />
      )}

      {viewingPartnerId != null && vendors.some((vendor) => vendor.id === viewingPartnerId) && (
        <PartnerRequirementsModal
          token={token}
          vendor={vendors.find((vendor) => vendor.id === viewingPartnerId) as Vendor}
          jobs={visibleJobs}
          clients={clients}
          assignments={assignments}
          submissions={submissions}
          onClose={() => setViewingPartnerId(null)}
          onChanged={refreshAssignments}
        />
      )}

      {viewingJobJD && (
        <JobJDModal
          job={viewingJobJD}
          clientName={viewingJobJD.client_name ?? clients.find((client) => client.id === viewingJobJD.client_id)?.company_name}
          hideClient={hideClientsInUI}
          token={token}
          canManageJobs={canManageJobs}
          onClose={() => setViewingJobJD(null)}
          onJobUpdated={(updated) => {
            setJobs((current) => current.map((job) => (job.id === updated.id ? { ...job, ...updated } : job)))
            setViewingJobJD((current) => (current && current.id === updated.id ? { ...current, ...updated } : current))
          }}
        />
      )}
        {me?.user_type === 'super_admin' && (
          <button
            type="button"
            data-tour="help"
            className="help-button"
            aria-label="Help: start the guided tour"
            onClick={() => {
              setPage('dashboard')
              setTourOpen(true)
            }}
          >
            <span aria-hidden="true">?</span> Help
          </button>
        )}
        {tourOpen && <GuidedTour steps={TOUR_STEPS} currentPage={page} onNavigate={tourNavigate} onClose={closeTour} />}
        {token && me && (
          <FeedbackButton
            token={token}
            pageLabel={
              ({
                dashboard: isClient ? 'Overview' : 'Dashboard',
                jobs: isClient ? 'Our Jobs' : partnerView ? 'Requirements' : 'Jobs',
                candidates: 'Candidates',
                vendors: 'Vendors',
                clients: 'Clients',
                users: 'Users',
                profile: 'My profile',
                reports: 'Reports',
                feedback: 'Feedback',
              } as Record<Page, string>)[page]
            }
          />
        )}
      </main>
    </div>
  )
}

export default App
