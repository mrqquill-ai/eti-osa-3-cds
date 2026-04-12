# Eti-Osa 3 Special CDS — Clearance Queue

A queue and registration app for the **Eti-Osa 3 Special CDS** group's NYSC clearance days in Lagos. Built to replace the paper-tag system that let corps members swap numbers with friends — every registration is bound to a unique state code, and corps members track their own status by scanning a QR code with their phone.

**Stack:** React (Vite) · Tailwind CSS · Supabase (Postgres + Realtime) · `qrcode.react` · Vercel-ready.

---

## Screens

| Route | Purpose | Used by |
|---|---|---|
| `/manager` | Register corps members at the entrance, generate queue # + QR. | Executives on tablets/phones at the gate. |
| `/status/:stateCode` | Live status page that auto-updates via Supabase Realtime. | Corps members on their own phones. |
| `/dashboard` | Live counts, sortable table, "Call next batch", close registration, reset day. | Executive in charge. |

There is no auth in v1 — physical control of the device is the security boundary.

---

## Setup

### 1. Create the Supabase project

1. Go to <https://supabase.com> and create a new project. Pick a region close to Lagos (e.g. `eu-west-2`).
2. In the project dashboard, open **SQL editor** and paste the contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), then **Run**.
   - This creates the `registrations`, `session_settings`, and `registrations_archive` tables, the `register_corps_member` and `reset_day` functions, and enables Realtime + permissive RLS for the anon key.
3. In **Project Settings → API**, copy the **Project URL** and **anon public key**.

### 2. Configure the app locally

```bash
cp .env.example .env.local
# edit .env.local and paste your URL + anon key
npm install
npm run dev
```

Open <http://localhost:5173>. You'll land on `/manager`.

### 3. End-to-end smoke test

1. On `/dashboard`, click **Start session** and pick a small batch size (e.g. 20) so you can see batches roll over quickly.
2. On `/manager`, register a couple of corps members (e.g. `LA/24A/1234`, `LA/24A/5678`).
3. Scan the QR with your phone — or open `/status/LA%2F24A%2F1234` in another tab. You should see the queue number and "Waiting".
4. Back on `/dashboard`, click **Call next batch**. The status page should flip to "🔔 Your batch is now being served" without a refresh.
5. Click **Mark served** on a row. The status page should flip to "✅ Cleared".
6. Try to re-register the same state code — the manager screen should show "This state code has already registered today."

### 4. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

When prompted:

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Add the two env vars in the Vercel project settings:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

`vercel.json` already rewrites all routes to `index.html` so React Router deep links (`/status/...`) work on refresh.

---

## How the queue stays consistent across devices

Every registration goes through the Postgres function `register_corps_member`, which:

1. Locks the single row in `session_settings` (`SELECT … FOR UPDATE`).
2. Rejects the insert if registration is closed.
3. Rejects the insert if the same `state_code` already exists with `voided = false`.
4. Computes `queue_number = max(queue_number) + 1` and `batch_number = ceil(queue_number / batch_size)`.
5. Inserts the row.

Because step 1 serializes everyone on the settings row, two manager devices submitting at the same instant cannot collide. There is also a unique partial index on `state_code WHERE voided = false` as a database-level backstop against duplicates.

Batch numbers are stamped at insert time and are **never** recomputed. Changing the batch size mid-day does not retroactively re-batch anyone — it only affects new entries.

## Reset day

`Reset day` calls the `reset_day(p_batch_size)` function, which copies all current `registrations` rows into `registrations_archive` and then truncates the live table. Settings are reset (`current_batch = 1`, `registration_open = true`).

## State code format

`^[A-Z]{2}/\d{2}[A-Z]/\d{4}$` — e.g. `LA/24A/1234`. The manager screen normalises input (uppercases, strips spaces) before validating.

## File layout

```
src/
  App.jsx              shell + nav
  main.jsx             router entry
  lib/supabase.js      client + helpers (device id, regex)
  pages/
    Manager.jsx
    Status.jsx
    Dashboard.jsx
supabase/
  migrations/0001_init.sql
```

## Out of scope (v1)

No auth, no SMS, no email, no selfie, no geofence, no multi-day scheduling, no analytics beyond live counts.
