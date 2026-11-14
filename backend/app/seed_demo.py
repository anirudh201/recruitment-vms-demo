"""Sample data for the hosted demo.

    python -m app.seed_demo --if-empty     fill a brand-new database (does nothing otherwise)
    python -m app.seed_demo --reset --yes  wipe EVERYTHING and refill the demo

Safety: only runs when DEMO_MODE=true. Demo passwords come from DEMO_PASSWORD (all demo
logins) and DEMO_ADMIN_PASSWORD (the Super Admin; defaults to DEMO_PASSWORD), never from code.
"""
import os
import random
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, text

from app.database import SessionLocal, engine
from app.models import (
    Base,
    Candidate,
    CandidateStatusHistory,
    CandidateSubmission,
    Client,
    ClientContact,
    Job,
    JobVendorAssignment,
    Organization,
    Role,
    User,
    Vendor,
)
from app.security import hash_password
from app.seed_roles import seed_roles_and_permissions

DOMAIN = "dmi-demo.com"
NOW = datetime.now(timezone.utc).replace(microsecond=0)

DESCRIPTIONS = {
    "Oracle PLM Consultant": "Implement and support Oracle Cloud PLM for a global manufacturing client.\nKey Responsibilities\nConfigure Product Data Hub and PLM modules\nWork with SCM stakeholders on requirements\nMandatory Skills\nOracle Cloud PLM, SQL, PL/SQL",
    "SAP EWM Lead": "Lead SAP EWM implementations for warehouse operations.\nKey Responsibilities\nDesign warehouse processes in S/4HANA EWM\nGuide a team of 4 consultants",
    "Java Full Stack Developer": "Build web applications for a banking client.\nKey Responsibilities\nDevelop Spring Boot APIs and React screens\nWrite automated tests",
    "Data Engineer": "Design data pipelines on Azure.\nKey Responsibilities\nBuild Spark and Databricks pipelines\nModel data for Power BI",
    "QA Automation Engineer": "Automate testing for web and mobile apps.\nKey Responsibilities\nSelenium and Cypress test suites\nCI/CD integration",
    "Python Developer": "Build backend services with FastAPI.\nKey Responsibilities\nDesign REST APIs\nWork with PostgreSQL",
    "Salesforce Developer": "Customise Salesforce Sales Cloud.\nKey Responsibilities\nApex and Lightning components",
    "DevOps Engineer": "Own CI/CD and cloud infrastructure.\nKey Responsibilities\nTerraform, Kubernetes, AWS",
}
FIRST = ["Asha", "Bala", "Chitra", "Deepak", "Esha", "Farhan", "Gita", "Harish", "Isha", "Jatin", "Kavya", "Lokesh", "Meena", "Nikhil",
         "Pooja", "Rahul", "Sana", "Tarun", "Usha", "Varun", "Yamini", "Zoya", "Arjun", "Divya", "Kiran", "Neha", "Pranav", "Ritu"]
LAST = ["Rao", "Kumar", "Sharma", "Reddy", "Iyer", "Khan", "Nair", "Patel", "Gupta", "Menon", "Joshi", "Verma"]
EMPLOYERS = ["Infosys", "TCS", "Wipro", "HCLTech", "Tech Mahindra", "Accenture", "Capgemini", "Cognizant", "LTIMindtree"]
CITIES = ["Hyderabad", "Bengaluru", "Pune", "Chennai", "Mumbai", "Noida"]


def _require_demo_mode() -> None:
    if os.getenv("DEMO_MODE", "").strip().lower() not in {"1", "true", "yes", "on"}:
        sys.exit("Refusing to run: set DEMO_MODE=true (this script is for the demo database only).")


def _passwords() -> tuple[str, str]:
    password = os.getenv("DEMO_PASSWORD", "")
    admin_password = os.getenv("DEMO_ADMIN_PASSWORD", "") or password
    if len(password) < 12 or len(admin_password) < 12:
        sys.exit("Set DEMO_PASSWORD (and optionally DEMO_ADMIN_PASSWORD), at least 12 characters each.")
    return password, admin_password


def wipe() -> None:
    """Delete every row from every table (keeps the schema and migration history)."""
    tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    with engine.begin() as connection:
        connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


def seed() -> dict:
    password, admin_password = _passwords()
    seed_roles_and_permissions()
    rng = random.Random(2026)
    with SessionLocal() as s:
        roles = {role.name: role for role in s.scalars(select(Role)).all()}
        org = Organization(name="DM&I Technologies (Demo)")
        s.add(org)
        s.flush()

        clients = {
            "Acme Technologies": Client(organization_id=org.id, company_name="Acme Technologies", address="HITEC City, Hyderabad", is_active=True),
            "Globex Solutions": Client(organization_id=org.id, company_name="Globex Solutions", address="Whitefield, Bengaluru", is_active=True),
            "Initech Systems": Client(organization_id=org.id, company_name="Initech Systems", address="Hinjewadi, Pune", is_active=True),
        }
        vendors = {
            "TalentBridge Staffing": Vendor(organization_id=org.id, name="TalentBridge Staffing", contact_name="Ravi Teja", contact_email=f"ravi@talentbridge.{DOMAIN}", is_active=True),
            "HireWorks Consulting": Vendor(organization_id=org.id, name="HireWorks Consulting", contact_name="Sneha Pillai", contact_email=f"sneha@hireworks.{DOMAIN}", is_active=True),
            "PeopleFirst HR": Vendor(organization_id=org.id, name="PeopleFirst HR", contact_name="Imran Ali", is_active=True),
        }
        s.add_all(list(clients.values()) + list(vendors.values()))
        s.flush()
        for client, (name, email, kind) in zip(clients.values(), [("Meera Shah", "meera", "HR"), ("Karthik Raman", "karthik", "HR"), ("Leena George", "leena", "HR")]):
            s.add(ClientContact(client_id=client.id, contact_type=kind, name=name, email=f"{email}@{client.company_name.split()[0].lower()}.{DOMAIN}", is_primary=True))

        def user(email, role, name, title, pw=password, **extra):
            account = User(organization_id=org.id, email=f"{email}@{DOMAIN}", password_hash=hash_password(pw), roles=[roles[role]],
                           full_name=name, job_title=title, is_active=True, **extra)
            s.add(account)
            return account

        admin = user("admin", "Super Admin", "Demo Admin", "Director", admin_password)
        anil = user("recruiter1", "Recruiter", "Anil Kumar", "Senior Recruiter")
        beena = user("recruiter2", "Recruiter", "Beena Rao", "Recruiter")
        partner1 = user("partner1", "Vendor", "Ravi Teja", "Delivery Lead", vendor_id=vendors["TalentBridge Staffing"].id)
        partner2 = user("partner2", "Vendor", "Sneha Pillai", "Account Manager", vendor_id=vendors["HireWorks Consulting"].id)
        client1 = user("client1", "Client", "Meera Shah", "HR Manager", client_id=clients["Acme Technologies"].id)
        client2 = user("client2", "Client", "Karthik Raman", "Talent Acquisition Lead", client_id=clients["Globex Solutions"].id)
        s.flush()

        plan = [  # title, client, recruiter, status, openings, exp, qualification, budget (lakhs), partners
            ("Oracle PLM Consultant", "Acme Technologies", anil, "open", 2, (6, 10), "B.Tech / MCA", (18, 24), ["TalentBridge Staffing", "HireWorks Consulting"]),
            ("SAP EWM Lead", "Globex Solutions", anil, "open", 1, (8, 12), "B.E. / B.Tech", (24, 30), ["TalentBridge Staffing"]),
            ("Java Full Stack Developer", "Acme Technologies", beena, "open", 4, (3, 6), "B.Tech (Computer Science)", (10, 16), ["TalentBridge Staffing", "HireWorks Consulting", "PeopleFirst HR"]),
            ("Data Engineer", "Globex Solutions", beena, "open", 2, (4, 8), "B.Tech / M.Tech", (14, 20), ["HireWorks Consulting"]),
            ("QA Automation Engineer", "Initech Systems", anil, "open", 3, (2, 5), "Any graduate", (6, 10), ["PeopleFirst HR", "TalentBridge Staffing"]),
            ("Python Developer", "Initech Systems", None, "open", 2, (2, 6), "B.Tech / MCA", (8, 14), ["HireWorks Consulting"]),
            ("Salesforce Developer", "Acme Technologies", beena, "draft", 1, (3, 7), "Any graduate", (12, 18), []),
            ("DevOps Engineer", "Globex Solutions", anil, "closed", 1, (5, 9), "B.E. / B.Tech", (16, 22), ["TalentBridge Staffing"]),
        ]
        jobs = []
        for index, (title, client, recruiter, status, openings, (lo, hi), qual, (bmin, bmax), partners) in enumerate(plan):
            created = NOW - timedelta(days=55 - index * 6)
            job = Job(organization_id=org.id, created_by_user_id=admin.id, client_id=clients[client].id, title=title,
                      description=DESCRIPTIONS[title], mandatory_skills=DESCRIPTIONS[title].split("\n")[-1] if "Mandatory" in DESCRIPTIONS[title] else None,
                      min_experience=lo, max_experience=hi, qualification=qual, location=rng.choice(CITIES), work_arrangement=rng.choice(["Hybrid", "Onsite", "Remote"]),
                      budget_min=bmin * 100000, budget_max=bmax * 100000, openings=openings, status=status,
                      recruiter_id=recruiter.id if recruiter else None, created_at=created, updated_at=created)
            s.add(job)
            s.flush()
            for name in partners:
                s.add(JobVendorAssignment(job_id=job.id, vendor_id=vendors[name].id, is_active=True))
            jobs.append((job, partners, client))
        s.flush()

        paths = [
            ["Submitted"], ["Submitted", "Screening"], ["Submitted", "Screening", "Shortlisted"],
            ["Submitted", "Screening", "Shortlisted", "Sent to Client"],
            ["Submitted", "Screening", "Shortlisted", "Sent to Client", "Interview Scheduled"],
            ["Submitted", "Screening", "Shortlisted", "Sent to Client", "Interview Scheduled", "Selected"],
            ["Submitted", "Screening", "Shortlisted", "Sent to Client", "Interview Scheduled", "Selected", "Offer Accepted", "Joined"],
            ["Submitted", "Screening", "Rejected"], ["Submitted", "Screening", "Shortlisted", "Sent to Client", "Rejected"],
        ]
        partner_users = {"TalentBridge Staffing": partner1, "HireWorks Consulting": partner2}
        client_users = {"Acme Technologies": client1, "Globex Solutions": client2}
        count = 0
        for job, partners, client in jobs:
            if not partners or job.status == "draft":
                continue
            for _ in range(rng.randint(4, 8)):
                count += 1
                first, last = rng.choice(FIRST), rng.choice(LAST)
                partner_name = rng.choice(partners)
                path = rng.choice(paths)
                when = job.created_at + timedelta(days=rng.randint(1, 20), hours=rng.randint(9, 18))
                if when > NOW:
                    when = NOW - timedelta(hours=rng.randint(2, 48))
                total = round(rng.uniform(job.min_experience, (job.max_experience or job.min_experience + 3) + 1), 1)
                candidate = Candidate(organization_id=org.id, full_name=f"{first} {last}", email=f"{first.lower()}.{last.lower()}{count}@mail.{DOMAIN}",
                                      phone=f"+91 9{rng.randint(100000000, 999999999)}", total_experience=total, relevant_experience=round(max(1, total - rng.uniform(0.5, 2)), 1),
                                      current_employer=rng.choice(EMPLOYERS), current_location=rng.choice(CITIES), highest_qualification=job.qualification,
                                      primary_skills=DESCRIPTIONS[job.title].split("\n")[-1].replace("Mandatory Skills", "").strip() or "Communication, SQL")
                s.add(candidate)
                s.flush()
                submitter = partner_users.get(partner_name, admin)
                sub = CandidateSubmission(organization_id=org.id, candidate_id=candidate.id, job_id=job.id, vendor_id=vendors[partner_name].id,
                                          submitted_by_user_id=submitter.id, status=path[-1], notes="Available to join in 30 days" if rng.random() < .4 else None,
                                          created_at=when, updated_at=when + timedelta(days=len(path) - 1))
                s.add(sub)
                s.flush()
                for step, status in enumerate(path):
                    after_sent = "Sent to Client" in path[:step]
                    by = submitter if step == 0 else client_users.get(client, admin) if after_sent and status in ("Interview Scheduled", "Selected", "Rejected") and client in client_users else (job.recruiter or admin)
                    s.add(CandidateStatusHistory(submission_id=sub.id, old_status=path[step - 1] if step else None, new_status=status,
                                                 changed_by_user_id=by.id, note=None, changed_at=when + timedelta(days=step)))
        s.commit()
        return {"organization": org.name, "submissions": count, "logins": sorted(
            account.email for account in (admin, anil, beena, partner1, partner2, client1, client2))}


def main(argv: list[str]) -> None:
    _require_demo_mode()
    if "--reset" in argv:
        if "--yes" not in argv:
            sys.exit("This deletes ALL data in the database. Run again with --reset --yes to confirm.")
        wipe()
        result = seed()
        print(f"Demo reset: {result['submissions']} sample submissions.")
    elif "--if-empty" in argv:
        with SessionLocal() as s:
            if s.scalar(select(func.count()).select_from(Organization)):
                print("Demo data already present; nothing to do.")
                return
        result = seed()
        print(f"Demo data created: {result['submissions']} sample submissions.")
    else:
        sys.exit(__doc__)
    print("Demo logins:\n  " + "\n  ".join(result["logins"]))


if __name__ == "__main__":
    main(sys.argv[1:])
