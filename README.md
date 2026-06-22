# When?

When? is a real-time scheduling app for finding times that work across
people, timezones, and daylight-saving changes.

Use it to:

- Create one-off date polls or recurring weekly availability.
- Invite people with a link; participants can join anonymously.
- Sign in with Google to save profiles and availability templates.
- Optionally connect Google Calendar or an ICS feed to mark busy time.
- Lock final times and share schedule updates to Discord.

## Deploy Quickstart

You need a Convex deployment, a Google OAuth web client, and a frontend host.
For the full checklist, see `docs/deployment.md`.

1. Create a Convex project, then note both URLs:
   - Convex URL: `https://your-deployment.convex.cloud`
   - Convex Site URL: `https://your-deployment.convex.site`

2. Create one Google OAuth 2.0 web client with both redirect URIs:
   - `https://your-deployment.convex.site/auth/google/callback`
   - `https://your-deployment.convex.site/auth/google/calendar-callback`

   The first URI is for normal Google login. The second is for optional
   Google Calendar sync using the `calendar.readonly` scope.

3. Set Convex environment variables:

   ```bash
   npx convex env set AUTH_GOOGLE_ID your_google_client_id
   npx convex env set AUTH_GOOGLE_SECRET your_google_client_secret
   npx convex env set SITE_URL https://your-frontend-domain.com
   ```

4. Deploy Convex:

   ```bash
   npx convex deploy
   ```

5. Run the frontend with runtime config:

   ```bash
   docker run -d -p 3000:80 \
     -e CONVEX_URL=https://your-deployment.convex.cloud \
     -e CONVEX_SITE_URL=https://your-deployment.convex.site \
     -e GOOGLE_CLIENT_ID=your_google_client_id \
     ghcr.io/whenwhenwhenwhenwhen/when:latest
   ```

   The same values can be written to `dist/config.json` if serving static
   files without Docker.

## Local Development

Prerequisites: Node.js 22+ and pnpm.

```bash
pnpm install
npx convex dev
```

Add the Google values to `.env.local` after Convex creates it:

```env
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

Set the matching Convex env vars from the deploy quickstart, using
`SITE_URL=http://localhost:5173` for local development, then run:

```bash
pnpm dev
```

The app runs at `http://localhost:5173`.

## More Documentation

- `docs/deployment.md` covers full deployment, Google OAuth, static hosting,
  Docker, production checks, and optional Discord setup.
- `docs/development.md` covers architecture notes and contributor workflows.
