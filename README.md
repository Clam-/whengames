# When?

A real-time scheduling web app for coordinating availability between people. Supports anonymous and Google-authenticated users, one-off and recurring weekly schedules, timezone-aware DST handling, and live collaborative editing.

## Tech Stack

- **Frontend**: React 19.2, TypeScript, Tailwind CSS 4.2, Vite 8
- **Backend**: Convex (real-time BaaS)
- **Auth**: Google OAuth via `@convex-dev/auth`
- **Timezone**: Luxon 3.7
- **Deploy**: Docker + nginx

## Setup

### 1. Prerequisites

- Node.js 22+
- A [Convex](https://convex.dev) account
- A [Google Cloud Console](https://console.cloud.google.com) project with OAuth 2.0 credentials

### 2. Install dependencies

```bash
npm install
```

### 3. Initialize Convex

Run the Convex dev server to create/select a project and generate types:

```bash
npx convex dev
```

This creates `.env.local` with your `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL`. Leave this running or stop it for now (you'll start it again in step 6).

### 4. Set up `@convex-dev/auth`

Run the Convex Auth setup wizard. This generates JWT signing keys and sets the required server-side environment variables (`SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS`) on your Convex deployment:

```bash
npx @convex-dev/auth
```

The wizard will:
1. Set **`SITE_URL`** to `http://localhost:5173` (your Vite dev server URL)
2. Generate and set **`JWT_PRIVATE_KEY`** (RSA private key for signing session tokens)
3. Generate and set **`JWKS`** (the matching public key for verifying tokens)
4. Verify that `convex/auth.config.ts`, `convex/auth.ts`, and `convex/http.ts` are configured

For more details, see the [Convex Auth manual setup guide](https://labs.convex.dev/auth/setup/manual).

### 5. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application type)
3. Add the authorized redirect URI:
   ```
   https://<your-convex-deployment>.convex.site/api/auth/callback/google
   ```
   Find your HTTP Actions URL in the [Convex dashboard](https://dashboard.convex.dev) under Settings > URL & Deploy Key.
4. Set the Google credentials as Convex environment variables:

```bash
npx convex env set AUTH_GOOGLE_ID your_google_client_id
npx convex env set AUTH_GOOGLE_SECRET your_google_client_secret
```

### 6. Run development server

In one terminal, start the Convex backend:
```bash
npx convex dev
```

In another, start the Vite frontend:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### Environment variables summary

After setup, these environment variables should be configured:

| Variable | Where | Set by | Description |
|---|---|---|---|
| `CONVEX_DEPLOYMENT` | `.env.local` | `npx convex dev` | Convex deployment identifier |
| `VITE_CONVEX_URL` | `.env.local` | `npx convex dev` | Convex cloud URL for the frontend client |
| `SITE_URL` | Convex server env | `npx @convex-dev/auth` | Frontend URL for OAuth redirects (e.g. `http://localhost:5173`) |
| `JWT_PRIVATE_KEY` | Convex server env | `npx @convex-dev/auth` | RSA private key for signing session JWTs |
| `JWKS` | Convex server env | `npx @convex-dev/auth` | Public key (JWKS format) for verifying session JWTs |
| `AUTH_GOOGLE_ID` | Convex server env | Manual | Google OAuth 2.0 Client ID |
| `AUTH_GOOGLE_SECRET` | Convex server env | Manual | Google OAuth 2.0 Client Secret |

You can view the server-side variables with `npx convex env list` or in the [Convex dashboard](https://dashboard.convex.dev) under Settings > Environment Variables.

## Docker Deployment

### Build and run

```bash
# Set your Convex URL
export VITE_CONVEX_URL=https://your-deployment.convex.cloud

# Build and start
docker compose up -d --build
```

The app will be available at `http://localhost:3000`.

### Production deployment

When deploying to production, update `SITE_URL` to your production frontend URL:

```bash
npx convex env set --prod SITE_URL https://your-production-domain.com
```

Then build and deploy:

```bash
# Deploy Convex backend
npx convex deploy

# Build Docker image
docker build --build-arg VITE_CONVEX_URL=https://your-production.convex.cloud -t when .

# Run
docker run -p 80:80 when
```

## Architecture

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
  schema.ts          - Database schema (userProfiles, schedules, selections, dstCheckLog)
  auth.ts            - Convex Auth config with Google provider
  users.ts           - User CRUD, anonymous/auth merge logic
  schedules.ts       - Schedule CRUD, nominate/lock operations
  selections.ts      - Cell selection CRUD, batch operations
  crons.ts           - Daily DST check cron job
  dstNotifications.ts - DST impact calculation (placeholder email)

src/
  components/
    WeeklyGrid.tsx   - Main grid with drag selection, profile icons, time indicator
    ScheduleView.tsx - Schedule page with controls and grid
    Header.tsx       - Nav bar with auth state
  hooks/
    useAnonymousUser.ts     - localStorage-based anonymous identity
    useGridDragSelection.ts - Grid drag/select interaction logic
  lib/
    timezone.ts      - Timezone conversion utilities
    dst.ts           - DST detection utilities
```
