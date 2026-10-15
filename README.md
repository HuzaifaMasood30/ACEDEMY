# Wisdom Academy — Academy Management ERP + LMS

A full-stack academy management system covering admissions, academics, attendance,
timetabling, examinations, fees, progress reporting and parent communication, with
four separate role-based portals and a public website.

Everything in this repository runs against a real PostgreSQL database through
Prisma. There are no mock data arrays behind the portal screens.

---

## 1. Status at a glance

| Area | State |
| --- | --- |
| Public website (7 pages) | Implemented |
| Admin portal (26 sections) | Implemented |
| Teacher portal (13 sections) | Implemented |
| Student portal (11 sections) | Implemented |
| Parent portal (11 sections) | Implemented |
| Authentication + RBAC | Implemented, server-enforced |
| Attendance + absence alerts | Implemented, duplicate-safe |
| Fees, invoices, payments, late fees | Implemented |
| Examinations, marks, grading, publication | Implemented |
| WhatsApp Cloud API integration | Implemented, adapter-based; runs in `mock` mode without credentials |
| Background worker + scheduler | Implemented |
| Automated tests | 73 passing (Vitest) |
| Type checking (`tsc --noEmit`) | Clean |
| Linting (`eslint .`) | 0 errors, 45 warnings (all unused-variable) |
| Production build (`next build`) | Clean |
| PDF documents (report cards, receipts) | **Not implemented** — see [Known limitations](#11-known-limitations) |
| Browser end-to-end tests | **Not implemented** — see [Known limitations](#11-known-limitations) |
| QR-coded ID cards | **Not implemented** — see [Known limitations](#11-known-limitations) |

Counts above were taken from the working tree: 34 API route handlers, 74 pages,
and 5 test files.

### Known gaps in the admin portal

Two directories exist but are empty, so those sections are not built:

- `src/app/admin/whatsapp/` — the WhatsApp configuration UI is missing. The
  adapter, queue and delivery tracking are implemented and can be driven from
  **Admin → Notifications**, but there is no dedicated configuration or
  test-message screen.
- `src/app/admin/templates/` — the message-template editor is missing. Templates
  are resolved in code from `src/server/notifications/templates.ts`.

Neither appears in the production build output, and neither is reachable from
the admin navigation.

---

## 2. Technology

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) with TypeScript |
| Database | PostgreSQL |
| ORM / migrations | Prisma 6 |
| Auth | NextAuth v5 (beta) with JWT sessions |
| Styling | Tailwind CSS v4 with a shared component layer |
| Charts | Recharts |
| Validation | Zod |
| Password hashing | bcryptjs |
| Background jobs | A durable `NotificationJob` outbox table drained by a worker process |
| Tests | Vitest |

---

## 3. Prerequisites

- Node.js 20 or newer
- PostgreSQL 14 or newer, reachable and empty (or disposable)
- `npm`

---

## 3a. Run it in GitHub Codespaces

The quickest way to see the app running, with no local setup. A codespace is
a full Linux machine in the cloud, so unlike GitHub Pages it can run the
server and a database.

1. Open <https://github.com/HuzaifaMasood30/ACEDEMY> and click **Code** then
the **Codespaces** tab, then **Create codespace on main**.
2. Wait for the build. `.devcontainer/setup.sh` writes a development `.env`,
installs dependencies, starts PostgreSQL, applies migrations and seeds the
demo data. This takes a few minutes the first time.
3. The dev server starts on port 3000 and the preview opens automatically.

To get a shareable link, open the **PORTS** tab in the terminal panel,
right-click port 3000, choose **Port Visibility → Public**, then copy the
address. It looks like
`https://<codespace-name>-3000.app.github.dev`.

Notes:

- Every page queries the database, including the public site, so the app
  cannot be run without PostgreSQL.
- Codespaces is a development environment, not production hosting. The
  forwarded URL is temporary and stops when the codespace is deleted.
- Free personal accounts include 120 core hours and 15 GB of storage per
  month; verified students get 180 core hours. A codespace keeps consuming
  hours while it is running, so stop it when you are finished.

---

## 4. Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
# Then edit .env and set at minimum DATABASE_URL and AUTH_SECRET.
# Generate a secret with:
#   openssl rand -base64 48

# 3. Apply the database schema
npm run db:migrate

# 4. Load development data (70 students, 6 classes, exams, invoices, attendance)
npm run db:seed

# 5. Start the application
npm run dev
```

The application listens on <http://localhost:3000>.

### Do not set NODE_ENV yourself

Next.js sets `NODE_ENV` itself — `development` for `next dev`, `production` for
`next build` and `next start`. It is therefore deliberately absent from
`.env.example`.

If something in your environment (a container image, a CI variable, a shell
profile) exports `NODE_ENV=development`, the production build fails with a
misleading `<Html> should not be imported outside of pages/_document` error
during static generation. The real cause is that Next.js thinks it is building
in development mode. Clear the variable for the build:

```bash
env -u NODE_ENV npm run build
```

This is worth knowing because the failure message points at your code rather
than at the environment.

### Background processes

The application works without these, but absence alerts, fee reminders and
overdue detection only advance when the worker and scheduler run.

```bash
npm run worker      # drains the notification outbox; run as a long-lived process
npm run scheduler   # hourly housekeeping: overdue fees, reminders, alert refresh
```

For a one-shot drain instead of a loop, use `npm run worker:once`.

---

## 5. Demo accounts

Every seeded account uses the password from `SEED_DEFAULT_PASSWORD`
(`Academy@123` by default). **These are development credentials. Change or
delete them before exposing this system to anyone.**

| Role | Email |
| --- | --- |
| Administrator (owner) | `owner@wisdom-academy.example` |
| Administrator (registrar) | `registrar@wisdom-academy.example` |
| Teacher | `ayesha.siddiqui@wisdom-academy.example` |
| Teacher | `fatima.noor@wisdom-academy.example` |
| Student | `hamza.hashmi1@student.wisdom-academy.example` |
| Parent | `tariq.mahmood1@parent.wisdom-academy.example` |

Seed email patterns are `<first>.<last><n>@student.wisdom-academy.example` for
students and `<first>.<last><n>@parent.wisdom-academy.example` for guardians, so
the remaining accounts follow the same shape.

---

## 6. Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (`eslint .`) |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run verify` | Typecheck, lint, test and build in sequence |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:migrate:dev` | Create and apply a migration during development |
| `npm run db:seed` | Load development data |
| `npm run db:reset` | Drop, recreate and reseed the database |
| `npm run db:studio` | Prisma Studio |
| `npm run worker` | Notification worker loop |
| `npm run worker:once` | Drain one batch and exit |
| `npm run scheduler` | Hourly housekeeping tasks |

Operational helpers in `scripts/` (not npm scripts):

| Script | Purpose |
| --- | --- |
| `scripts/worker.ts` | Notification worker (`npm run worker`) |
| `scripts/scheduler.ts` | Housekeeping (`npm run scheduler`) |
| `scripts/probe-portals-auth.sh` | Sign in per role and check portal isolation |
| `scripts/probe-portals.sh` | Probe which APIs each role can reach |
| `scripts/audit-scope.py` | Audit record-scoping logic |
| `scripts/test-cross-teacher.sh` | Check one teacher cannot read another's classes |

> `npm run test:e2e` is declared but there is no Playwright config or spec, so it
> will fail. See [Known limitations](#11-known-limitations).

---

## 7. Architecture

```
src/
  app/
    (public)/          Public website: home, about, courses, faculty,
                       admissions, notices, contact
    admin/             Owner portal (26 sections)
    teacher/           Teacher portal (13 sections)
    student/           Student portal (11 sections)
    parent/            Parent portal (11 sections)
    api/               34 route handlers
    login/             Sign-in
  components/          Shared UI, layout and chart components
  lib/                 Cross-cutting utilities: rbac, env, validation,
                       rate-limit, audit, formatting, prisma client
  server/
    auth-guard.ts      Server-side authorization predicates
    page-guard.ts      Portal context and page permission gates
    services/          Domain logic: attendance, fees, exams, timetable,
                       assignments, progress, students, dashboard
    notifications/     Outbox queue, templates, worker, scheduler
    whatsapp/adapter.ts  Cloud API and mock delivery adapters
    storage.ts         Upload storage (local filesystem or S3-compatible)
  middleware.ts        Edge routing gate (signed-in + role prefix only)
prisma/
  schema.prisma        Data model
  migrations/          Applied migrations
  seed.ts              Development data
scripts/               Worker, scheduler and operational helpers
tests/                 Vitest suites
```

### Authorization model

Permissions are string keys of the form `<resource>:<action>`, for example
`invoice:view` or `attendance:mark`. `ROLE_PERMISSIONS` in `src/lib/rbac.ts`
defines each role's defaults. Per-user grants are **additive only** — there is no
deny flag — and support an optional `expiresAt`, so a grant can lapse without
manual cleanup. `effectivePermissions(role, grants)` returns the union of the
role defaults and the active grants.

Enforcement happens on the server. Middleware performs a coarse check only (is
the caller signed in, and does the URL prefix match their role), because a
middleware check cannot be the sole gate on a data read. Every route and page
re-runs a fine-grained check:

- `assertSubjectAccess`, `assertStudentAccess`, `getTeacherScope` and `isAdmin`
  in `src/server/auth-guard.ts` scope individual records to the caller.
- `requirePagePermission` with `buildPortalContext(role)` gates each portal page.

Hiding a control in the UI is never treated as enforcement.

### Data model

`prisma/schema.prisma` defines 64 models and 26 enums. The main groups:

| Group | Models |
| --- | --- |
| Identity and access | `User`, `Session`, `PasswordResetToken`, `PermissionGrant`, `AuditLog`, `DeviceToken`, `Setting` |
| Academic structure | `Campus`, `AcademicSession`, `Term`, `Holiday`, `Course`, `Subject`, `CourseSubject`, `ClassSection`, `Batch`, `ClassSubject`, `Room` |
| People | `Student`, `GuardianLink`, `TeacherProfile`, `TeacherSubject`, `StudentStatusHistory`, `AdmissionApplication`, `Enrollment` |
| Scheduling | `TimetableSlot`, `LeaveRequest`, `ExamInvigilation` |
| Attendance | `AttendanceSession`, `AttendanceRecord`, `AttendanceCorrectionRequest`, `StaffAttendance`, `StudentCheckIn` |
| Teaching and learning | `Assignment`, `AssignmentSubmission`, `LearningResource`, `Document` |
| Assessment | `GradeScale`, `GradeBand`, `Exam`, `ExamSubject`, `ExamResult`, `ExamResultAudit`, `RecheckRequest`, `Certificate` |
| Finance | `FeeStructure`, `FeeStructureItem`, `StudentFeePlan`, `Invoice`, `InvoiceItem`, `FeeAdjustment`, `Payment` |
| Communication | `MessageTemplate`, `NotificationPreference`, `NotificationJob`, `NotificationLog`, `Announcement`, `AnnouncementRead`, `WhatsAppAccount` |
| Progress and ops | `ProgressNote`, `WarningRule`, `StudentAlert`, `BackgroundJobRun`, `SystemEvent` |

Notable design points:

- `Enrollment` is unique on `(studentId, classSectionId, academicSessionId)`, so a
  student cannot be enrolled in the same class twice in one session.
- `NotificationJob.dedupeKey` carries a unique constraint. This, rather than
  application logic, is what makes duplicate alerts impossible.
- `PermissionGrant` is additive and carries an optional `expiresAt`.
- `Campus` is related throughout but the portals assume one campus.

### API

34 route handlers under `src/app/api/`. They follow a consistent shape:
Zod-validated input, a server-side authorization check before any read or write,
and a uniform JSON error envelope. Route handlers live at:

```
/api/account                        /api/admin/admissions
/api/admin/alerts                   /api/admin/analytics
/api/admin/announcements            /api/admin/attendance
/api/admin/audit                    /api/admin/classes
/api/admin/courses                  /api/admin/exams
/api/admin/exams/manage             /api/admin/fees
/api/admin/fees/structures          /api/admin/grading
/api/admin/notifications            /api/admin/parents
/api/admin/progress                 /api/admin/reports
/api/admin/sessions                 /api/admin/settings
/api/admin/students                 /api/admin/subjects
/api/admin/system                   /api/admin/teachers
/api/admin/timetable                /api/admin/users
/api/assignments                    /api/auth/[...nextauth]
/api/leave                          /api/notification-preferences
/api/notifications                  /api/portal
/api/public/admissions              /api/resources
```

Authorization is not implied by the `/api/admin/` prefix alone; each handler
re-checks the caller's permissions and record scope.

### Attendance and absence alerts

`markAttendance` writes the register and its records inside one transaction, then
queues notifications *after* the commit, so a messaging outage can never roll
back a correctly recorded register.

Deduplication is enforced by a unique constraint on `NotificationJob.dedupeKey`,
and the key for an absence alert is
`attendance:absence:<sessionId>:<studentId>:<guardianId>`. It deliberately does
not use the attendance record id: re-saving a register replaces its records
wholesale, so record ids are ephemeral. Keying on one would send a fresh message
every time a teacher corrected the register, or toggled a student
absent → present → absent. The session, student and guardian together identify
one event that a guardian should hear about exactly once, while still giving each
guardian of the same student their own message.

### Fees

Invoices are created with server-computed totals; the client cannot understate a
charge. `recordPayment` locks the invoice row with `SELECT … FOR UPDATE` inside a
transaction, so two concurrent payments cannot both draw down the same balance.
Overpayment, zero and negative amounts, and payments against cancelled or
refunded invoices are all rejected. A late fee is applied when the due date plus
the configured grace period has elapsed.

### WhatsApp

`src/server/whatsapp/adapter.ts` exposes one interface with two implementations.
`cloud` calls the official WhatsApp Business Platform (Cloud API). `mock` never
leaves the process and is flagged `isMock: true` wherever it is recorded, so a
simulated message can never be mistaken for a delivered one.

Live mode requires all three of `WHATSAPP_MODE=cloud`, a non-empty
`WHATSAPP_ACCESS_TOKEN`, and a non-empty `WHATSAPP_PHONE_NUMBER_ID`. Anything
less falls back to mock.

To enable real delivery:

1. Set `WHATSAPP_MODE="cloud"`.
2. Set `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` and
   `WHATSAPP_ACCESS_TOKEN` from your Meta app.
3. Set `WHATSAPP_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
4. Register and get approval for your message templates with Meta. The template
   names used by the code live in `src/server/notifications/templates.ts`.
5. Verify delivery end to end before enabling bulk sending. There is currently
   no admin screen for a test send (see
   [Known gaps in the admin portal](#known-gaps-in-the-admin-portal)), so drive a
   single message through the queue and inspect the recorded provider response in
   **Admin → Notifications**.

> The adapter implements `verifyWebhook` and `verifySignature`, but no route
> currently calls them. Meta's delivery-status callbacks will not be received
> until a webhook route is added and pointed at from the Meta app. Delivery
> status in the UI therefore reflects what the send call returned, not
> asynchronous provider callbacks.

---

## 8. Testing

```bash
npm test
```

Result on the current tree: **73 tests passing across 5 files.**

Linting is separate: `npm run lint` reports **0 errors and 45 warnings**. Every
warning is `@typescript-eslint/no-unused-vars` — imported components and helpers
that are no longer referenced. They are harmless but should be pruned. The two
`react-hooks/exhaustive-deps` warnings that did indicate real re-render churn
have been fixed.

| File | Scope |
| --- | --- |
| `tests/grading.test.ts` | Grade boundaries, percentage/GPA/rank arithmetic (11 tests, pure functions) |
| `tests/rbac.test.ts` | Role permission boundaries: what each role may and may not do (21 tests) |
| `tests/fees.integration.test.ts` | Invoices, discounts, late fees, partial payments, overpayment rejection, concurrent-payment serialization, summaries (18 tests, real database) |
| `tests/attendance.integration.test.ts` | Register save and re-save, status counting, date windows, consecutive absences, absence-alert queueing and dedupe (11 tests, real database) |
| `tests/notifications.integration.test.ts` | Outbox dedupe under concurrent enqueue, opt-out and category switches, template rendering (12 tests, real database) |

The integration suites run against the real database rather than mocks, and
create their fixtures under a `VITEST-` prefix that they delete afterwards. They
sweep stale fixtures at startup, so a run interrupted mid-suite cleans up on the
next run. Run them against a development database, not production.

The fee and attendance suites must use dates that respect the application's own
rules, which is why fixtures are anchored relative to the current date: attendance
cannot be recorded for a future date, and an invoice whose due date has passed
correctly attracts the configured late fee.

### What has not been verified

- No browser end-to-end test drives a real login and click-through. Authentication
  and cross-portal isolation were checked at the HTTP level with
  `scripts/probe-portals-auth.sh`, which signs in one account per role and
  confirms each portal returns 200 while the other portals return 307. That
  proves the gates hold, but it does not prove every page renders its data
  correctly, so treat per-page rendering as smoke-tested rather than tested.
- No load or concurrency testing beyond the two-payment race in the fee suite.
- WhatsApp delivery has not been verified against Meta, because no business
  account or approved templates were available. The `cloud` adapter is
  unexercised; only `mock` mode has been run.
- No test covers the background worker or scheduler as processes. Their
  underlying functions are covered indirectly through the notification queue
  tests.

### Portal access probe

With the dev server running:

```bash
bash scripts/probe-portals-auth.sh
```

It signs in as one account per role and reports the HTTP status of that role's
own pages plus a cross-portal request. Verified result:

| Role | Own portal | Cross-portal |
| --- | --- | --- |
| ADMIN | 200 | `/teacher` → 307 |
| TEACHER | 200 | `/admin` → 307 |
| STUDENT | 200 | `/admin` → 307 |
| PARENT | 200 | `/admin` → 307 |

---

## 9. Database

```bash
npm run db:migrate        # apply migrations
npm run db:seed           # load development data
npm run db:reset          # drop, recreate, reseed
```

Migrations live in `prisma/migrations/` and are applied in order. `db:seed`
clears the demo data it manages and recreates it, so do not point it at a
database holding real records.

### Backup and restore

```bash
# Backup (custom format, compressed)
pg_dump --format=custom --file=academy-$(date +%F).dump "$DATABASE_URL"

# Restore into an empty database
pg_restore --clean --if-exists --dbname="$DATABASE_URL" academy-YYYY-MM-DD.dump
```

Uploaded files live outside the database, in `STORAGE_LOCAL_DIR`
(`./storage/uploads` by default), or in your S3 bucket when
`STORAGE_DRIVER="s3"`. Back that location up alongside the database, or a
restored record will point at a document that no longer exists.

Schedule the dump nightly and verify a restore into a scratch database at least
once per term. A backup that has never been restored is not a backup.

---

## 10. Production deployment

1. Provision PostgreSQL and a Node.js 20+ host.
2. Set every variable from `.env.example` in the host's environment. Never ship
   the `.env` file itself. Set a real `APP_URL` and a fresh `AUTH_SECRET`. Leave
   `NODE_ENV` to Next.js.
3. Install and build:

   ```bash
   npm ci
   npm run db:migrate
   env -u NODE_ENV npm run build   # see "Do not set NODE_ENV yourself"
   npm start
   ```

4. Run `npm run worker` as a supervised service alongside the web process.
5. Run `npm run scheduler` from cron, hourly.
6. Terminate TLS at your proxy. In production the session cookie is issued as
   `__Secure-authjs.session-token`, so the site must be served over HTTPS.
7. Do not run `npm run db:seed` in production.

---

## 11. Known limitations

These are real gaps, not caveats:

1. **PDF generation is not implemented.** `pdfkit` and `qrcode` are declared in
   `package.json` but never imported anywhere in `src/`. Report cards, receipts,
   invoices, ID cards and attendance registers are therefore **not** downloadable
   as PDFs. CSV export does work. A browser print stylesheet exists on the admin
   results screen only.
2. **No browser end-to-end tests.** `@playwright/test` is installed and
   `test:e2e` is declared, but there is no config and no spec, so the script
   fails. Portal pages were verified to return HTTP 200, which does not prove the
   underlying flows work.
3. **WhatsApp `cloud` mode is unverified.** The adapter is written against the
   Cloud API but has never sent a real message, because no business account or
   approved templates were available. Treat live delivery as untested.
4. **Fee structures and some reporting screens have thinner test coverage** than
   the payment path, which is the most heavily tested.
5. **Localization is partial.** The schema and templates carry a `locale` field
   and an `ur` value exists in configuration, but there is no Urdu translation
   catalogue and no right-to-left layout switch.
6. **No multi-campus UI.** The data model has a `Campus` relation, but the
   portals assume a single campus.
7. **No PWA support.** No service worker or web app manifest is present.
8. **Salary and payroll are not implemented.** Staff records cover employment,
   assignment, leave and workload only.

---

## 12. Security notes

- Passwords are hashed with bcryptjs.
- Authorization is enforced server-side on every route and page, never only in
  the UI.
- Login is rate limited, with `LOGIN_MAX_ATTEMPTS` and `LOGIN_LOCKOUT_MINUTES`
  controlling the window.
- All secrets come from environment variables. `.env` is git-ignored; only
  `.env.example` is committed, and it contains no real values.
- Financial writes run in transactions with row locking.
- Uploaded documents are size- and type-validated and served through an
  authorization check rather than a public path.
- Card details are never stored; no payment gateway is integrated, so online
  payment is not currently possible.

Report a suspected vulnerability privately rather than opening a public issue.
