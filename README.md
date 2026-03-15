# When games?

Timezone-aware public scheduling built with TypeScript, Next.js, Convex, and WorkOS AuthKit.

## Features

- Public home page listing schedules plus `Create schedule`, `Login`, and `Account` actions
- Cookie-backed anonymous viewers with required display name entry before editing
- WorkOS AuthKit login flow with anonymous availability merged into the logged-in user
- One-off schedules with a bounded visible date range
- Weekly schedules with a compact half-hour grid, week pagination, and future one-off exceptions
- Quad-state availability cells: blank, can do, maybe, can't do
- Click to cycle state, drag to paint state, realtime sync through Convex
- Creator-only selected-time marking for weekly base slots or one-off exception weeks
- User timezone preferences, configurable week start, and DST notification preferences
- Daily Convex cron for DST notice checks with OAuth-capable SMTP delivery via Nodemailer
- Dockerfile and `docker-compose.yml` for the Next.js app

## Setup

1. Copy `.env.example` to `.env.local`.
2. Configure a Convex deployment and set `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOYMENT`.
3. Configure WorkOS AuthKit and set:
   - `WORKOS_API_KEY`
   - `WORKOS_CLIENT_ID`
   - `WORKOS_REDIRECT_URI`
   - `WORKOS_COOKIE_SECRET`
   - Enable the social and email providers you want in the WorkOS AuthKit dashboard, such as
     Google login.
   - `WORKOS_COOKIE_SECRET` should be a long random string because the app uses it for both its
     own session cookie signing and WorkOS sealed session storage.
4. Configure mailer env vars if you want DST email notices enabled.
5. Install and run:

```bash
npm install
npm run dev
```

## Build

```bash
npm run typecheck
npm run build
docker compose build
```

## Notes

- The checked-in `convex/_generated/*` files are lightweight local shims so the app can build before a Convex deployment is connected.
- For production, you should run normal Convex codegen against your configured deployment.
