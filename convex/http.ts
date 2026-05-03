import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// Google OAuth callback: exchanges authorization code for ID token,
// then redirects the browser back to the frontend with the token.
http.route({
  path: "/auth/google/callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || "/";
    const error = url.searchParams.get("error");
    const siteUrl = process.env.SITE_URL!;

    // Handle user cancellation or Google errors
    if (error) {
      return new Response(null, {
        status: 302,
        headers: { Location: siteUrl + (state !== "/" ? state : "/") },
      });
    }

    if (!code) {
      return new Response("Missing authorization code", { status: 400 });
    }

    // Exchange the authorization code for tokens
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

    // Redirect to the frontend callback page with the ID token in the URL
    // fragment (fragments are not sent to the server, keeping the token
    // client-side only).
    const redirectUrl = `${siteUrl}/auth/callback#token=${encodeURIComponent(idToken)}&redirect=${encodeURIComponent(state)}`;

    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl },
    });
  }),
});

export default http;
