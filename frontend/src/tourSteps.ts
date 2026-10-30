// The Super Admin's guided tour. Each step highlights one part of a page.
// Edit the wording here; "target" is a CSS selector for the part to highlight.

export type TourPage = 'dashboard' | 'jobs' | 'candidates' | 'vendors' | 'clients' | 'users' | 'feedback' | 'reports'

export type TourStep = { page: TourPage; section: string; target: string; title: string; body: string }

export const TOUR_STEPS: TourStep[] = [
  { page: 'dashboard', section: 'Dashboard', target: 'nav[aria-label="Main navigation"]', title: 'Main menu',
    body: 'Every part of the VMS is one click away here. This tour visits each section in order. You can leave at any time with End tour or the Esc key.' },
  { page: 'dashboard', section: 'Dashboard', target: '[aria-label="Job statistics"]', title: 'Job statistics',
    body: 'Your jobs, how many are active or closed, and how many candidates were submitted, with the change for the selected period. Click "Candidate Submitted" to jump to the candidates.' },
  { page: 'dashboard', section: 'Dashboard', target: '[aria-label="Candidate pipeline"]', title: 'Candidate pipeline',
    body: 'How many candidates are still in process, placed (Selected, Offer Accepted or Joined) or dropped.' },
  { page: 'dashboard', section: 'Dashboard', target: '[aria-label="Period for submissions"]', title: 'Choose the period',
    body: 'Switch between This Year, This Month and This Week. The statistics, trends and recruiter ranking all follow this choice.' },
  { page: 'dashboard', section: 'Dashboard', target: '[aria-label="Top active jobs"]', title: 'Top 5 active jobs',
    body: 'The open positions with the most submissions. Click a job to read its JD, or View All to open the Jobs page.' },
  { page: 'dashboard', section: 'Dashboard', target: '[aria-label="Recruiter performance"]', title: 'Recruiter performance',
    body: 'Recruiters ranked by closures for the selected period. Click a recruiter to see their positions, clients, partners and every closure.' },
  { page: 'dashboard', section: 'Dashboard', target: '[aria-label="Submission trends"]', title: 'Submission trends',
    body: 'Submissions over time, so you can spot busy and quiet periods at a glance.' },

  { page: 'jobs', section: 'Jobs', target: '[data-tour="add-job"]', title: 'Add a job requirement',
    body: 'Create a new position. Upload the client’s JD (PDF or DOCX) and the form fills itself in. Then choose the client, the recruiter who owns it, experience and budget.' },
  { page: 'jobs', section: 'Jobs', target: '.jobs-search-row', title: 'Find a job',
    body: 'Search by title, job ID, client, location or description. Tick "Show deactivated" to bring back jobs you have hidden.' },
  { page: 'jobs', section: 'Jobs', target: 'main .jobs-table', title: 'Manage each job',
    body: 'Change a job’s status, pick its Recruiter, use Manage to choose which partners may submit candidates, open the JD, and Deactivate or Activate it.' },

  { page: 'candidates', section: 'Candidates', target: '[data-tour="submit-candidate"]', title: 'Submit a candidate',
    body: 'Add a candidate to a job. Upload their resume and the details are filled in for you (marked "from resume" so you can check them).' },
  { page: 'candidates', section: 'Candidates', target: '.cd-tiles', title: 'Pipeline at a glance',
    body: 'Counts for each stage. Click a tile to show only those candidates.' },
  { page: 'candidates', section: 'Candidates', target: '.cd-filters', title: 'Filter candidates',
    body: 'Narrow the list by job, client, partner or status, or search by name.' },
  { page: 'candidates', section: 'Candidates', target: 'main .cd-table', title: 'Work on a candidate',
    body: 'Click View to open a candidate: move them through the stages (Screening, Shortlisted, Sent to Client and so on), download their resume and see the full history.' },

  { page: 'vendors', section: 'Vendors', target: '[data-tour="add-vendor"]', title: 'Channel partners',
    body: 'Register the staffing partners who send you candidates. Give them a login on the Users page so they can submit.' },
  { page: 'vendors', section: 'Vendors', target: 'main .jobs-table', title: 'Partner list',
    body: 'Use Requirements to assign jobs to a partner, Candidates to see what they submitted, and Deactivate to pause a partner (their login stops working).' },

  { page: 'clients', section: 'Clients', target: 'main .jobs-table', title: 'Clients',
    body: 'Each client company with its SPOC contacts and positions. View JDs shows all their positions with CTC, Add Job Requirement creates one, and Edit or Deactivate manage the client.' },

  { page: 'users', section: 'Users', target: '[data-tour="add-user"]', title: 'Add logins',
    body: 'Create logins for recruiters, partners and clients. Choose the role (and company for partners and clients); the temporary password is shown once, so copy it.' },
  { page: 'users', section: 'Users', target: 'main .us-table', title: 'Manage users',
    body: 'View profile shows a person’s details and last sign-in, lets you edit their name and designation, and deactivate their login.' },

  { page: 'feedback', section: 'Feedback', target: '.fbp-card', title: 'Feedback from everyone',
    body: 'Bug reports and ideas sent with the Feedback button. Set each one to In progress, Done or Won’t fix, reply to the sender, and download the list to Excel.' },

  { page: 'reports', section: 'Reports', target: '.rp-tabs', title: 'Reports',
    body: 'Six reports: submissions, closures, positions, and partner, recruiter and client performance.' },
  { page: 'reports', section: 'Reports', target: '.rp-filters', title: 'Filter a report',
    body: 'Pick a period, a client or search. Up to 100 rows show per page, with page controls below the table.' },
  { page: 'reports', section: 'Reports', target: '.rp-download', title: 'Download Excel',
    body: 'Downloads every row that matches your filters (all pages), ready to sort, filter and share.' },

  { page: 'reports', section: 'Your account', target: 'button.sidebar-identity', title: 'Your profile',
    body: 'Your name, designation and phone, and where you change your password.' },
  { page: 'reports', section: 'Help', target: '[data-tour="help"]', title: 'Help is always here',
    body: 'That’s the tour! Click Help whenever you want to see it again.' },
]
