# When?

A real-time scheduling web app for coordinating availability between people. Supports anonymous and Google-authenticated users, one-off and recurring weekly schedules, timezone-aware DST handling, and live collaborative editing.

## Tech Stack

- **Frontend**: React 19.2, TypeScript, Tailwind CSS 4.2, Vite 8
- **Backend**: Convex (real-time BaaS)
- **Auth**: Google OAuth (authorization code flow via Convex HTTP endpoint + native JWT verification)
- **Timezone**: Luxon 3.7
- **Deploy**: Docker + nginx

## Setup

### 1. Prerequisites

- Node.js 22+
- A [Convex](https://convex.dev) account
- A [Google Cloud Console](https://console.cloud.google.com) project with OAuth 2.0 credentials

### 2. Install dependencies

```bash
pnpm install
```

### 3. Initialize Convex

Run the Convex dev server to create/select a project and generate types:

```bash
npx convex dev
```

This creates `.env.local` with your `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL`. Leave this running or stop it for now (you'll start it again in step 6).

### 4. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application type)
3. Add the authorized redirect URI:
   ```
   https://<your-convex-deployment>.convex.site/auth/google/callback
   ```
   Find your HTTP Actions URL in the [Convex dashboard](https://dashboard.convex.dev) under Settings > URL & Deploy Key.
4. Set the Google credentials as Convex environment variables:

```bash
npx convex env set AUTH_GOOGLE_ID your_google_client_id
npx convex env set AUTH_GOOGLE_SECRET your_google_client_secret
npx convex env set SITE_URL http://localhost:5173
```

5. Add the Google Client ID to your `.env.local` for the frontend:

```
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_CONVEX_SITE_URL=https://<your-convex-deployment>.convex.site
```

### 5. Run development server

Start both the Convex backend and Vite frontend concurrently:

```bash
pnpm dev
```

Or run them separately:

```bash
# Terminal 1 — Convex backend
npx convex dev

# Terminal 2 — Vite frontend
npx vite
```

The app will be available at `http://localhost:5173`.

### Environment variables summary

After setup, these environment variables should be configured:

| Variable | Where | Set by | Description |
|---|---|---|---|
| `CONVEX_DEPLOYMENT` | `.env.local` | `npx convex dev` | Convex deployment identifier |
| `VITE_CONVEX_URL` | `.env.local` | `npx convex dev` | Convex cloud URL for the frontend client |
| `VITE_CONVEX_SITE_URL` | `.env.local` | Manual | Convex HTTP actions URL (e.g. `https://xxx.convex.site`) |
| `VITE_GOOGLE_CLIENT_ID` | `.env.local` | Manual | Google OAuth Client ID (public, embedded in frontend) |
| `SITE_URL` | Convex server env | Manual | Frontend URL for OAuth callback redirect (e.g. `http://localhost:5173`) |
| `AUTH_GOOGLE_ID` | Convex server env | Manual | Google OAuth 2.0 Client ID |
| `AUTH_GOOGLE_SECRET` | Convex server env | Manual | Google OAuth 2.0 Client Secret |

You can view the server-side variables with `npx convex env list` or in the [Convex dashboard](https://dashboard.convex.dev) under Settings > Environment Variables.

## Docker Deployment

### Build and run

```bash
# Set your Convex URL
export VITE_CONVEX_URL=https://your-deployment.convex.cloud
export VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
export VITE_GOOGLE_CLIENT_ID=your_google_client_id

# Build and start
docker compose up -d --build
```

The app will be available at `http://localhost:3000`.

### Production deployment

When deploying to production, update `SITE_URL` to your production frontend URL:

```bash
npx convex env set --prod SITE_URL https://your-production-domain.com
```

And update the Google OAuth redirect URI in the Cloud Console to:
```
https://<your-prod-convex-deployment>.convex.site/auth/google/callback
```

Then build and deploy:

```bash
# Deploy Convex backend
npx convex deploy

# Build Docker image
docker build \
  --build-arg VITE_CONVEX_URL=https://your-production.convex.cloud \
  --build-arg VITE_CONVEX_SITE_URL=https://your-production.convex.site \
  --build-arg VITE_GOOGLE_CLIENT_ID=your_google_client_id \
  -t when .

# Run
docker run -p 80:80 when
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
