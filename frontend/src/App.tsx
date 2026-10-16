
import StatCard from './components/StatCard'
import './App.css'

function App() {
  return (
    <div className="vms-app">
      <aside className="sidebar">
        <h2>Recruitment VMS</h2>

        <nav aria-label="Main navigation">
          <a href="#dashboard">Dashboard</a>
          <a href="#jobs">Jobs</a>
          <a href="#candidates">Candidates</a>
          <a href="#vendors">Vendors</a>
          <a href="#reports">Reports</a>
        </nav>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="page-header">
          <h1>Dashboard</h1>
          <p>Welcome to your Recruitment VMS</p>
        </header>

        <section
          className="stats-grid"
          aria-label="Recruitment statistics"
        >
          <StatCard
            title="Active Jobs"
            value={null}
            description="Currently open requirements"
          />

          <StatCard
            title="Candidates Submitted"
            value={null}
            description="Applications received"
          />

          <StatCard
            title="Awaiting Review"
            value={null}
            description="Pending recruiter evaluation"
          />

          <StatCard
            title="Shortlisted"
            value={null}
            description="Shortlisted candidates"
          />
        </section>

        <section className="welcome-card">
          <h2>Recruitment Overview</h2>
          <p>
            Your dashboard foundation is ready.
            Recruitment statistics will appear here
            once we connect the backend database.
          </p>
        </section>
      </main>
    </div>
  )
}

export default App
