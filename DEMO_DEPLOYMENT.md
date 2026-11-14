# Free demo site: Render + Neon

This puts a **demo copy** of Recruitment VMS online so your team can test it from home.
It is free, with sample data only (no real clients or candidates).

| Part | Service | Free plan limits |
|---|---|---|
| Website | Render static site | Always on |
| Backend API | Render web service | Sleeps after 15 min without visitors; the next visit waits ~1 minute while it wakes up |
| Database | Neon PostgreSQL | 0.5 GB storage, 100 compute-hours/month; sleeps after 5 min idle (wakes in a second) |

Uploaded JDs and resumes are stored **in the database** on the demo (`FILE_STORAGE=database`),
because Render's free server forgets its files on every restart.

Total time: about 45 minutes the first time.

---

## Step 1: Put the code on GitHub (private)

Render deploys from a GitHub repository.

1. Create a free account at <https://github.com> if you don't have one.
2. Click **New repository**, name it `recruitment-vms`, choose **Private**, and **don't** add a README.
3. In PowerShell, in the project folder (`recruitment-vms`, the folder that contains `backend`, `frontend` and `render.yaml`):

   ```powershell
   git status                      # check: no .env files or .venv folder are listed
   git add .
   git commit -m "Demo deployment"
   git branch -M main
   git remote add origin https://github.com/<your-username>/recruitment-vms.git
   git push -u origin main
   ```

   If `git status` lists any `.env` file, stop: it contains passwords. The included `.gitignore`
   already excludes them, so this should not happen.

## Step 2: Create the database on Neon

1. Sign up at <https://neon.com> (no credit card needed).
2. **Create project** → name `vms-demo` → region **AWS Asia Pacific (Singapore)** → PostgreSQL version: latest.
3. On the project dashboard click **Connect**.
4. **Turn "Connection pooling" OFF** (the app needs a direct connection), then copy the connection string.
   It looks like:

   ```
   postgresql://neondb_owner:abc123...@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

   Keep it private: it contains the database password.

## Step 3: Deploy on Render

1. Sign up at <https://render.com> with **"Sign in with GitHub"** (no credit card needed).
2. Click **New → Blueprint**, pick your `recruitment-vms` repository, then **Connect**.
   Render reads `render.yaml` and shows two services: **vms-demo-api** and **vms-demo**.
3. Fill in the values it asks for:

   | Setting | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string from step 2 |
   | `CORS_ORIGINS` | `https://vms-demo.onrender.com` |
   | `DEMO_PASSWORD` | a password for all team demo logins, 12+ characters (e.g. `Team-Demo-2026!`) |
   | `DEMO_ADMIN_PASSWORD` | a **different** password for the admin login, 12+ characters |
   | `VITE_API_URL` | `https://vms-demo-api.onrender.com` |

4. Click **Apply**. The first deploy takes 5–10 minutes. The backend's first start creates the
   database tables **and the sample data** automatically.

### Check the real addresses

Render uses the names above when they are free. If a name is taken it adds a suffix,
e.g. `https://vms-demo-x7k2.onrender.com`. Open each service in Render and look at the address
under its name:

- If the **website** address is different → backend **vms-demo-api → Environment** → set
  `CORS_ORIGINS` to the website's real address → **Save** (it redeploys by itself).
- If the **backend** address is different → website **vms-demo → Environment** → set
  `VITE_API_URL` to the backend's real address → **Save**, then **Manual Deploy → Clear build cache & deploy**
  (the website must be rebuilt to pick it up).

Addresses have **no trailing slash**.

## Step 4: Try it yourself

1. Open `https://vms-demo-api.onrender.com/health`. It should show `{"status":"ok",...}`.
   The first time after a pause it can take up to a minute.
2. Open the website and sign in on the **Team** tab as `admin@dmi-demo.com` with your `DEMO_ADMIN_PASSWORD`.
3. You should see the yellow **DEMO** banner, sample jobs, candidates and closures, and the
   **Feedback** button at the bottom right.

## Step 5: Share it with the team

Demo logins (all use `DEMO_PASSWORD`, except the admin):

| Login | Role | Sees |
|---|---|---|
| `admin@dmi-demo.com` | Super Admin | everything (**keep this one for yourself**) |
| `recruiter1@dmi-demo.com` | Recruiter (Anil Kumar) | team view |
| `recruiter2@dmi-demo.com` | Recruiter (Beena Rao) | team view |
| `partner1@dmi-demo.com` | Channel partner (TalentBridge Staffing) | partner view |
| `partner2@dmi-demo.com` | Channel partner (HireWorks Consulting) | partner view |
| `client1@dmi-demo.com` | Client (Acme Technologies) | client portal |
| `client2@dmi-demo.com` | Client (Globex Solutions) | client portal |

Testers can share logins. To give each person their own login, sign in as admin →
**Users → + Add User**.

Message you can send (share the password separately, e.g. by phone):

> Hi team, please test our Recruitment VMS demo: **https://vms-demo.onrender.com**
> - Team view: sign in on the **Team** tab as recruiter1@dmi-demo.com
> - Partner view: open https://vms-demo.onrender.com/#partner and sign in as partner1@dmi-demo.com
> - Client view: open https://vms-demo.onrender.com/#client and sign in as client1@dmi-demo.com
>
> If the first page takes up to a minute to load, the demo server is waking up. That's normal.
> Please report every bug or idea with the **Feedback** button (bottom right). It records the page
> and your browser automatically.

You'll see everything under **Feedback** in the sidebar (admin only), with a count of new items.
Set each one to *In progress / Done / Won't fix* and add a reply. The sender sees it under
**Feedback → My reports**. Use **Download Excel** for a full list.

---

## Day-to-day

**Updating the demo:** commit and push to GitHub. Render redeploys both services automatically
and applies any database changes (`alembic upgrade head` runs on every start).

**Resetting the sample data** (wipes everything on the demo, including feedback, and refills it).
Download the feedback to Excel first if you need it. In PowerShell on your PC:

```powershell
cd recruitment-vms\backend
.\.venv\Scripts\Activate.ps1
$env:DATABASE_URL = "<the Neon connection string>"
$env:DEMO_MODE = "true"
$env:DEMO_PASSWORD = "<same as on Render>"
$env:DEMO_ADMIN_PASSWORD = "<same as on Render>"
python -m app.seed_demo --reset --yes
```

Then **close that PowerShell window**, so `DATABASE_URL` isn't used by accident when you next run
the app locally. The script refuses to run unless `DEMO_MODE=true` is set, so it can't wipe your
local database by accident.

**Changing the demo passwords:** change `DEMO_PASSWORD` / `DEMO_ADMIN_PASSWORD` on Render
*and* run the reset above with the new values (passwords are only applied when the data is created).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| The website shows "Failed to fetch" or can't sign in | Backend asleep: wait a minute and retry. Otherwise check `VITE_API_URL` (website) and `CORS_ORIGINS` (backend) match the real addresses exactly, with `https://` and no trailing slash. |
| Backend deploy fails at `alembic upgrade head` | `DATABASE_URL` is wrong, or connection pooling was on. Copy the **direct** string from Neon again. |
| "Refusing to run: set DEMO_MODE=true" in the logs | `DEMO_MODE` must be `true` on the backend service. |
| "Set DEMO_PASSWORD…" in the logs | Add `DEMO_PASSWORD` (12+ characters) on the backend service. |
| Sign-in says "Invalid email or password" | Passwords are set when the data is first created. If you changed them later, run the reset. |
| Database suspended (Neon) | The 100 free compute-hours ran out this month (rare for a demo). It resumes next month, or upgrade. |
| Pages other than the home page show "Not found" | The website's rewrite rule is missing. Check `routes` in `render.yaml`. |

## Keep in mind

- **Demo only.** Don't upload real resumes or client data. Anyone with the link and a password can sign in.
- Free plans can change their limits. Check Render's and Neon's pricing pages if something stops working.
- Password-reset emails are not set up on the demo. Change passwords via **My profile**, or the admin can reset the data.
- For the real system later, use paid plans (no sleeping), keep files on a persistent disk or object storage, and use a separate database from the demo.
