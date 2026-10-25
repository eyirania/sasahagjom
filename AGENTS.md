# AGENTS.md

Overview of this project for developers and AI agents working on this codebase.

## Project Overview

A grading-criteria reference and grade-tracking app for Sejong Academy of Science and Arts (세종과학예술영재학교), 1st-year 2nd-semester subjects. It publishes an editable table of assessment weightings (exams, quizzes, performance tasks) for 14 subjects, lets students log their own scores after signing in with their school Google account (`@sasa.hs.kr`), and gives the admin account a statistics view across all students.

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start |
| Frontend | React 19, TanStack Router v1 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 |
| Charts | Chart.js + react-chartjs-2 |
| Auth | Netlify Identity (Google OAuth), restricted to `@sasa.hs.kr` |
| Database | Netlify Database (Postgres) via Drizzle ORM |
| Deployment | Netlify |

## Directory Structure

```
db/
  schema.ts              # Drizzle schema: subjects, assessment_items, students, student_scores, student_subject_results
  index.ts                # Drizzle client (netlify-db adapter)
netlify/
  functions/
    identity-signup.ts    # Rejects signups outside @sasa.hs.kr; grants 'admin' role to eyirania@sasa.hs.kr
    identity-validate.ts  # Rejects logins outside @sasa.hs.kr on every token validation
  database/migrations/    # Auto-applied SQL migrations (schema + seed data)
src/
  components/
    NavBar.tsx             # Top nav, shows login state and admin link
    CallbackHandler.tsx     # Handles Netlify Identity OAuth redirect hashes
  lib/
    auth.ts                 # ADMIN_EMAIL constant, isAdmin() helper, getServerUser server fn
    identity-context.tsx     # React context wrapping @netlify/identity client state
  middleware/
    identity.ts              # requireAuthMiddleware / requireAdminMiddleware for server fns
  server/
    subjects.functions.ts    # CRUD for subjects + assessment items (admin-only writes)
    scores.functions.ts      # Student self-service score entry + admin aggregate stats
  routes/
    index.tsx                # Landing page
    login.tsx                 # Google OAuth login (school email only)
    subjects.tsx               # Grading-criteria table per subject, editable by admin
    grades.tsx                  # Student's own score entry form
    admin.tsx                    # Admin-only statistics dashboard (charts + tables)
    __root.tsx                    # Root layout: IdentityProvider, CallbackHandler, NavBar
drizzle.config.ts
netlify.toml
```

## Data Model

- **subjects** — the 14 fixed 1st-year 2nd-semester subjects (name, category, credits, `letter`/`pass_fail` grading type).
- **assessment_items** — evaluation components per subject (name, raw maximum `points` per occurrence, `weight` multiplier, `repeat_count`, `kind` = `written` (지필) or `performance` (수행), `exam_slot` = `midterm`/`final`/null, `needs_confirmation` flag). Unknown names are empty strings and unknown maxima are null, not invented names or zero-point assessments. Confirmed criteria are seeded through a new migration; admins edit these on `/subjects`. Art has one unnamed item with an unknown maximum, while subjects without criteria have no items.
- **students** — created lazily on first login from the Netlify Identity user (id/email/name).
- **student_scores** — one row per (student, assessment_item), holds the student's achieved score for that item (repeats are entered as one combined total, not per-occurrence).
- **student_subject_results** — one row per (student, subject), stores `P` or `F` for pass/fail subjects without numeric scores. Clearing a score or result removes the caller's corresponding row.

Shared calculations in `src/lib/grading.ts` multiply raw scores and maxima by each item's `weight`. Only confirmed maxima participate in totals; Korean totals 70 known points and English totals 30 known points, without automatic missing points or normalization to 100. Unnamed art scores can be stored but are excluded from calculations until their maximum is defined.

The "100점 만점 합계" check and the P/F vs. letter-grade distinction are computed on the fly from `assessment_items`/`subjects` rather than stored.

## Auth Model

Login is Google OAuth via Netlify Identity. Two webhook functions enforce the school-only requirement and role assignment:
- `identity-signup` rejects any email not ending in `@sasa.hs.kr`, and grants the `admin` app_metadata role only to `eyirania@sasa.hs.kr` (everyone else gets `student`).
- `identity-validate` re-checks the domain on every login as defense in depth.

`isAdmin()` in `src/lib/auth.ts` treats both the hardcoded admin email and the `admin` role as authoritative — check that helper rather than re-deriving admin status elsewhere.

**Note:** Netlify Identity does not work with `netlify dev` locally — auth only functions once deployed (see `.agents/skills/tanstack-start-identity/SKILL.md`).

## Development Commands

```bash
npm run dev      # Start dev server (via netlify dev)
npm run build    # Production build
```

## Conventions

- Server-only DB access goes through `src/server/*.functions.ts` (TanStack Start server functions), never imported directly into client components.
- Mutations that change subject/assessment data require `requireAdminMiddleware`; student score writes require `requireAuthMiddleware` and are scoped to the caller's own student record.
- Schema changes must go through `db/schema.ts` + `npx drizzle-kit generate --name ...` — never hand-edit files under `netlify/database/migrations/` once applied.
