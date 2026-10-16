
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

        <section className="welcome-card">
          <h2>Project setup successful!</h2>
          <p>
            Your React frontend is ready.
            Next, we will build the dashboard components.
          </p>
        </section>
      </main>
    </div>
  )
}

export default App
