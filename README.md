# Geofence Admin Dashboard

Admin dashboard for a geofencing system used together with a **Flutter mobile app**.

- **Flutter app** (users):
  - Logs users in
  - Sends live location + zone status
  - Triggers geofence alerts
- **Next.js dashboard** (admins):
  - Manages users
  - Assigns / edits geofence zones on a map
  - Monitors ENTER / EXIT alerts
  - Exports logs to CSV

> ⚠️ Designed for **internal / trusted use**. There is no server-side auth middleware in this version.

---

## Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript
- **Styling:** Tailwind CSS + custom dark theme tokens
- **Maps:** Leaflet + OpenStreetMap tiles
- **Backend:** Next.js API routes (Node.js runtime)
- **Database:** MySQL / MariaDB (`mysql2/promise`)
- **Auth model:**
  - Admin login via `/api/login`
  - Frontend-only flag: `localStorage("adminAuth") === "true"`

---

## Features

### Admin Dashboard (`/dashboard`)

- Admin-only access (role = `admin`)
- Users list (non-admin):
  - Search by username
  - Pagination
  - Zone status, last location, inside/outside zone
- Per-user actions:
  - **Assign Zone**
    - Interactive Leaflet map
    - Search by place name (OpenStreetMap Nominatim)
    - Click to set center, slider for radius (meters)
    - Saves into `users.zone_center_lat`, `zone_center_lng`, `zone_radius_m`
  - **Track**
    - Read-only map
    - Last known location from `user_locations`
    - Geofence circle if configured
  - **Logs**
    - `/dashboard/logs?userId=<id>`
    - Shows ENTER / EXIT alerts for that user
    - Per-user CSV export

### Alerts & Logs

- Alerts created when:
  - `/api/user-location` detects a zone status change (`insideZone`: true/false)
  - Or Flutter calls `/api/alerts` directly (ENTER / EXIT)
- Dashboard can:
  - Show recent alerts in a bell dropdown
  - **Persistently clear** alerts:
    - Stores timestamp in `localStorage("alerts-cleared-until")`
    - Future fetches ignore older alerts
  - Download CSV:
    - Per user: from logs page
    - All alerts: from main dashboard

### Flutter Integration

Typical mobile flows:

- **User login:** `POST /api/user-login`
- **Fetch zone config:** `GET /api/users/:id`
- **Send location + zone status:** `POST /api/user-location`
- **(Optional) Send explicit alert:** `POST /api/alerts`

---

## Getting Started

### 1. Prerequisites

- **Node.js** (LTS recommended)
- **MySQL / MariaDB** (e.g. via XAMPP)
- Database created, for example:

```sql
CREATE DATABASE admin_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

> Make sure required tables (`users`, `alerts`, `user_locations`, …) are created and migrated.

---

### 2. Environment Variables

Create `.env.local` at the project root:

```bash
admin-dashboard/
  ├─ .env.local
  └─ ...
```

`.env.local`:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=""
DB_NAME=admin_dashboard
```

- `DB_HOST` – MySQL host (usually `localhost`)
- `DB_USER` – MySQL user (XAMPP default: `root`)
- `DB_PASSWORD` – MySQL password (empty string if none)
- `DB_NAME` – Existing database name

> After editing `.env.local`, restart `npm run dev`.

---

### 3. Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

---

### 4. Run the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open:

- `http://localhost:3000` → **Admin login**
- `http://localhost:3000/dashboard` → **Dashboard** (requires `localStorage("adminAuth") = "true"`)

---

## Admin Auth Flow

1. Admin opens `/`.
2. Enters **username** + **password**.
3. `POST /api/login`:

   - Finds a user with `role = 'admin'` in `users`.
   - Accepts:

     - Legacy plain-text `password_hash`
     - Bcrypt hash (automatically migrates legacy plain-text to bcrypt)

4. On success:

   - Sets `localStorage("adminAuth") = "true"`.
   - Redirects to `/dashboard` (or `?from=...` if provided).

5. `/dashboard` and `/dashboard/logs`:

   - Check `localStorage("adminAuth")` on mount.
   - Redirect back to `/` if missing or invalid.

> No cookies / sessions / middleware auth are used in this version.

---

## API Endpoints

All routes use **Node.js runtime** to support `mysql2` and `bcrypt`.

### Auth

- `POST /api/login`
  Admin login for the dashboard (role = `admin`).

- `POST /api/logout`
  Returns `{ success: true }`.
  Frontend is responsible for clearing `localStorage("adminAuth")`.

- `POST /api/user-login`
  Login for **mobile users** (role = `user`) with migration from plain-text to bcrypt.

---

### Users

- `GET /api/users`
  List non-admin users with:

  - Zone center + radius
  - Last location (`user_locations`)
  - `inside_zone` status
  - `last_seen` timestamp

- `POST /api/users`
  Create a new normal user (role = `"user"`), password hashed with bcrypt.

- `GET /api/users/:id`
  Return user + zone info (used by Flutter).

- `PUT /api/users/:id`
  Update only zone fields:

  - `zone_center_lat`
  - `zone_center_lng`
  - `zone_radius_m`

- `DELETE /api/users/:id`
  Delete a user.

---

### Alerts & Location

- `GET /api/alerts`
  Alerts (JOIN with users) for dashboard use.
  Query params:

  - `userId` → filter by user
  - `format=csv` → CSV export, otherwise JSON

- `POST /api/alerts`
  Create an ENTER / EXIT alert explicitly (e.g. from Flutter).

- `POST /api/user-location`
  Called on each location update from the mobile app:

  - Upserts latest location in `user_locations`.
  - If `insideZone` changes (0 ↔ 1), automatically inserts an alert into `alerts`.

---

## Scripts

Common scripts:

- `npm run dev` – Start dev server
- `npm run build` – Build for production
- `npm run start` – Run production build
- `npm run lint` – Run ESLint

---

## Notes & Limitations

- **Security**

  - Intended for **internal environments**.
  - If deployed publicly, you should:

    - Add proper auth (sessions, JWT, middleware).
    - Restrict access to API routes.
    - Use HTTPS and secure DB credentials.

- **Mobile App**

  - The Flutter app is **not** part of this repo.
  - Expected to:

    - Use `/api/user-login` for auth
    - Call `/api/user-location` while tracking
    - Optionally call `/api/users/:id` and `/api/alerts`

---

## License

Internal project – no public license specified.

```
::contentReference[oaicite:0]{index=0}
```
