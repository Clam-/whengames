import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

/**
 * Google OAuth callback.
 *
 * Flow:
 *   1. Frontend redirects user to Google with state = "nonce|redirectPath"
 *   2. Google authenticates and redirects here with ?code=…&state=…
 *   3. This endpoint exchanges the authorization code for a Google ID token
 *   4. Redirects the browser to the frontend callback page with the token in
 *      the URL fragment (fragments are never sent to intermediate servers):
 *
 *        {SITE_URL}/auth/callback#token=<jwt>&redirect=<nonce|path>
 *
 * The `state` parameter is passed through verbatim — it carries the CSRF
 * nonce that the frontend verifies in sessionStorage before accepting the
 * token (see AuthCallbackPage.tsx).
 */
http.route({
  path: "/auth/google/callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || "/";
    const error = url.searchParams.get("error");
    const siteUrl = process.env.SITE_URL!;

    // ── Handle user cancellation or Google errors ────────────────────────
    // Redirect back to the frontend callback so the nonce is consumed and
    // the user lands on the page they came from (no token is stored).
    if (error) {
      const redirectUrl = `${siteUrl}/auth/callback#redirect=${encodeURIComponent(state)}`;
      return new Response(null, {
        status: 302,
        headers: { Location: redirectUrl },
      });
    }

    if (!code) {
      return new Response("Missing authorization code", { status: 400 });
    }

    // ── Exchange the authorization code for tokens ───��───────────────────
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        redirect_uri: `${process.env.CONVEX_SITE_URL}/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", await tokenResponse.text());
      return new Response("Authentication failed", { status: 500 });
    }

    const tokens = (await tokenResponse.json()) as { id_token?: string };
    const idToken = tokens.id_token;

    if (!idToken) {
      return new Response("No ID token received from Google", { status: 500 });
    }

    // ── Redirect to frontend with token in fragment ──────────────────────
    // The URL fragment (#…) is never sent to any server, keeping the token
    // client-side only. The frontend callback page validates the token's
    // structure and CSRF nonce before storing it.
    const redirectUrl = `${siteUrl}/auth/callback#token=${encodeURIComponent(idToken)}&redirect=${encodeURIComponent(state)}`;

    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl },
    });
  }),
});

export default http;
