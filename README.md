# When?

A real-time scheduling web app for coordinating availability between people. Supports anonymous and Google-authenticated users, one-off and recurring weekly schedules, timezone-aware DST handling, and live collaborative editing.

## Tech Stack

- **Frontend**: React 19.2, TypeScript, Tailwind CSS 4.2, Vite 8
- **Backend**: Convex (real-time BaaS)
- **Auth**: Google OAuth (authorization code flow via Convex HTTP endpoint + native JWT verification)
- **Timezone**: Luxon 3.7
- **Deploy**: Docker + nginx, or any static file server

## Backend Setup (required for all deployment methods)

Regardless of how you run the frontend, you need a Convex deployment and Google OAuth credentials. Complete these steps first.

### 1. Create a Convex deployment

Sign up at [convex.dev](https://convex.dev) and create a project. You can do this through the [dashboard](https://dashboard.convex.dev) or by running `npx convex dev` locally (which also generates types for development — see [Development](#development) below).

After creating a deployment, note your two URLs from the dashboard under Settings > URL & Deploy Key:

| URL | Looks like | Used for |
|---|---|---|
| **Convex URL** | `https://your-deployment.convex.cloud` | Frontend client connection |
| **Convex Site URL** | `https://your-deployment.convex.site` | OAuth callback endpoint |

### 2. Deploy the Convex backend

If you haven't already pushed the backend functions to your deployment:

```bash
npx convex deploy
```

### 3. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application type)
3. Add the authorized redirect URI:
   ```
   https://<your-convex-deployment>.convex.site/auth/google/callback
   ```
4. Set the required Convex server-side environment variables:

```bash
npx convex env set AUTH_GOOGLE_ID your_google_client_id
npx convex env set AUTH_GOOGLE_SECRET your_google_client_secret
npx convex env set SITE_URL https://your-frontend-domain.com
```

`SITE_URL` is where Google redirects users after login — set it to wherever you'll be serving the frontend (e.g. `http://localhost:5173` for development, `https://when.example.com` for production).

You can view these variables with `npx convex env list` or in the [Convex dashboard](https://dashboard.convex.dev) under Settings > Environment Variables.

### Environment variables summary

| Variable | Where | Description |
|---|---|---|
| `AUTH_GOOGLE_ID` | Convex server env | Google OAuth 2.0 Client ID |
| `AUTH_GOOGLE_SECRET` | Convex server env | Google OAuth 2.0 Client Secret |
| `SITE_URL` | Convex server env | Frontend URL for OAuth callback redirect |

The frontend also needs three values to connect to your backend. How you provide them depends on your deployment method — see below.

| Value | Description |
|---|---|
| **Convex URL** | Your `https://xxx.convex.cloud` URL |
| **Convex Site URL** | Your `https://xxx.convex.site` URL |
| **Google Client ID** | Same value as `AUTH_GOOGLE_ID` above (this is a public value) |

---

## Development

For contributors working on the codebase.

### Prerequisites

- Node.js 22+
- pnpm

### 1. Install dependencies

```bash
pnpm install
```

### 2. Initialize Convex

```bash
npx convex dev
```

This creates `.env.local` with your `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL`.

### 3. Configure frontend env vars

Add these to your `.env.local`:

```
VITE_CONVEX_SITE_URL=https://<your-convex-deployment>.convex.site
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

### 4. Run the dev server

```bash
pnpm dev
```

Or run Convex and Vite separately:

```bash
# Terminal 1 — Convex backend (watches for changes, syncs functions)
npx convex dev

# Terminal 2 — Vite frontend
npx vite
```

The app will be available at `http://localhost:5173`.

---

## Deployment

For users running a published build. Choose either Docker or static file serving.

### Option A: Docker

The Docker image is **generic** — built once with no configuration baked in. Configuration is injected at runtime via environment variables, which are written to `/config.json` when the container starts.

#### Building and publishing the image (maintainers)

```bash
docker build -t whengames:latest .

docker tag whengames:latest ghcr.io/yourorg/whengames:latest
docker push ghcr.io/yourorg/whengames:latest
```

#### Running the image

```bash
docker pull ghcr.io/yourorg/whengames:latest

docker run -d -p 3000:80 \
  -e CONVEX_URL=https://your-deployment.convex.cloud \
  -e CONVEX_SITE_URL=https://your-deployment.convex.site \
  -e GOOGLE_CLIENT_ID=your_google_client_id \
  ghcr.io/yourorg/whengames:latest
```

Or with docker-compose — create a `.env` file:

```env
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_SITE_URL=https://your-deployment.convex.site
GOOGLE_CLIENT_ID=your_google_client_id
```

```bash
docker compose up -d
```

The app will be available at `http://localhost:3000`.

#### Changing configuration

Update your environment variables and restart the container. No rebuild needed — the entrypoint regenerates `/config.json` on every start.

```bash
# docker run — stop the old container and start a new one with new -e values

# docker-compose — edit .env, then:
docker compose up -d
```

### Option B: Static file server (no Docker)

If you already have nginx, caddy, apache, or another web server, you can serve the built files directly.

#### 1. Build

```bash
pnpm install
pnpm run build
```

This produces a `dist/` directory.

#### 2. Generate config.json

Create `dist/config.json` with your values:

```bash
cat > dist/config.json <<EOF
{
  "CONVEX_URL": "https://your-deployment.convex.cloud",
  "CONVEX_SITE_URL": "https://your-deployment.convex.site",
  "GOOGLE_CLIENT_ID": "your_google_client_id"
}
EOF
```

#### 3. Serve

Point your web server at the `dist/` directory. The only requirement is an SPA fallback — all routes that don't match a real file must return `index.html` so React Router works.

**nginx** — add to your server block:

```nginx
root /path/to/dist;
index index.html;

location / {
    try_files $uri $uri/ /index.html;
}
```

**Caddy:**

```
your-domain.com {
    root * /path/to/dist
    try_files {path} /index.html
    file_server
}
```

#### 4. Changing configuration

Edit `dist/config.json` and reload the page. No rebuild needed.

### Production checklist

When going to production, make sure:

1. **`SITE_URL`** on Convex points to your production frontend URL:
   ```bash
   npx convex env set --prod SITE_URL https://your-production-domain.com
   ```

2. **Google OAuth redirect URI** in the Cloud Console includes your production callback:
   ```
   https://<your-prod-convex-deployment>.convex.site/auth/google/callback
   ```

3. **Convex backend** is deployed:
   ```bash
   npx convex deploy
   ```

## Architecture

### Authentication

Authentication uses a custom Google OAuth authorization code flow — no third-party auth library.

1. **Login click** → frontend redirects to Google's OAuth consent screen
2. **Google callback** → redirects to a Convex HTTP endpoint (`/auth/google/callback`) with an authorization code
3. **Token exchange** → the HTTP endpoint exchanges the code for a Google ID token (JWT) via Google's token endpoint
4. **Frontend callback** → the HTTP endpoint redirects the browser to `/auth/callback` with the JWT in the URL fragment
5. **Token storage** → the frontend stores the JWT in `localStorage` and reloads
6. **Convex verification** → `auth.config.ts` configures Convex to verify Google JWTs natively via Google's OIDC discovery endpoint (`https://accounts.google.com`)
7. **Backend auth** → all Convex functions use `ctx.auth.getUserIdentity()` to get the authenticated user's identity (name, email, picture, etc.) directly from the verified JWT

Google ID tokens expire after ~1 hour. When the token expires the user is signed out and can re-authenticate with a single click (Google remembers the session so no consent screen is shown on repeat logins).

### User System

- **Anonymous users**: Get a UUID stored in localStorage. Can participate in schedules after entering a display name.
- **Google-authenticated users**: Sign in via Google OAuth. If they had anonymous activity, it gets merged automatically.
- There is no separate "create account" flow - just a single "Login" button that triggers Google sign-in.

### Schedule Types

- **One-off**: Creator defines a date range. The grid shows those specific dates. Times are absolute (DST-adjusted).
- **Recurring (weekly)**: Grid shows a weekly pattern. Users select weekday + time slots as "wall clock" time in their timezone. Has pagination arrows to navigate weeks and create one-off exceptions.

### Grid Interaction

- **Select modes**: Auto (cycles through states), Can Do, Can't Do, Maybe
- **Click**: Toggles cell state
- **Click + drag**: Selection box appears (with dead zone). All touched cells get the same state.
- **Right-click / Esc**: Cancels drag selection
- **Profile icons**: Shows all users' selections grouped by state (green/red/yellow)

### Timezone Handling

- **One-off schedules**: All times stored as absolute references. Everyone sees the correct DST-adjusted time.
- **Recurring schedules**: Stored as wall-clock time + user timezone. The selected time never shifts for the user who set it, but may shift for others when DST transitions differ.
- **DST notifications**: Daily cron checks for upcoming DST transitions (within 7 days). Placeholder code logs who would be notified; actual email integration to be added later.

### Creator Controls

- **Allow/Disallow time**: Toggles cells to be disallowed/allow
- **Nominate time**: Shows your profile icon on nominated cells like non-creators
- **Lock in time**: Indicates the final time(s) (purple outline)

## Key Files

```
convex/
  schema.ts              - Database schema (userProfiles, schedules, selections, etc.)
  auth.config.ts         - Configures Convex to verify Google JWTs via OIDC
  http.ts                - HTTP endpoint for Google OAuth code→token exchange
  users.ts               - User CRUD, anonymous/auth merge, profile image caching
  schedules.ts           - Schedule CRUD, nominate/lock operations
  selections.ts          - Cell selection CRUD, batch operations
  savedAvailabilities.ts - Saved weekly availability templates
  profileImages.ts       - Background profile image download/storage
  crons.ts               - Daily DST check cron job
  dstNotifications.ts    - DST impact calculation (placeholder email)

src/
  config.ts              - Runtime configuration loader (fetches /config.json or falls back to env vars)
  lib/
    googleAuth.tsx       - Google auth context, provider, and hooks
    timezone.ts          - Timezone conversion utilities
    dst.ts               - DST detection utilities
  components/
    AuthCallbackPage.tsx - Handles OAuth redirect, stores token
    AuthProfileSync.tsx  - Creates/merges profile after sign-in
    WeeklyGrid.tsx       - Main grid with drag selection, profile icons, time indicator
    ScheduleView.tsx     - Schedule page with controls and grid
    Header.tsx           - Nav bar with auth state
  hooks/
    useAnonymousUser.ts     - localStorage-based anonymous identity
    useGridDragSelection.ts - Grid drag/select interaction logic
    useTimezone.ts          - Timezone detection/management
```
