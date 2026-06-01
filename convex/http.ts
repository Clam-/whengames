import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// ---------------------------------------------------------------------------
// Session token security helpers
//
// Session tokens sent to the client are HMAC-signed: "uuid.signature".
// The DB stores only the raw UUID. On refresh the server:
//   1. Splits the client token into uuid + signature
//   2. Looks up the session by uuid
//   3. Verifies HMAC(uuid|googleUserId) matches the signature
//      (timing-safe via crypto.subtle.verify)
//
// The signing key is derived from AUTH_GOOGLE_SECRET via HMAC with a
// fixed context string (domain separation).
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

async function getSigningKey(): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(process.env.AUTH_GOOGLE_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derived = await crypto.subtle.sign(
    "HMAC",
    baseKey,
    enc.encode("whengames-session-signing-v1"),
  );
  return crypto.subtle.importKey(
    "raw",
    derived,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function base64UrlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function signSessionToken(
  uuid: string,
  googleUserId: string,
): Promise<string> {
  const key = await getSigningKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${uuid}|${googleUserId}`),
  );
  return `${uuid}.${base64UrlEncode(sig)}`;
}

async function verifyAndParseSessionToken(
  signedToken: string,
  googleUserId: string,
): Promise<string | null> {
  const dotIdx = signedToken.indexOf(".");
  if (dotIdx < 0) return null;

  const uuid = signedToken.substring(0, dotIdx);
  const sig = base64UrlDecode(signedToken.substring(dotIdx + 1));

  const key = await getSigningKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig.buffer as ArrayBuffer,
    enc.encode(`${uuid}|${googleUserId}`),
  );
  return valid ? uuid : null;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
}

// ---------------------------------------------------------------------------
// Google OAuth callback
// ---------------------------------------------------------------------------

http.route({
  path: "/auth/google/callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || "/";
    const error = url.searchParams.get("error");
    const siteUrl = process.env.SITE_URL!;

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

    const tokens = (await tokenResponse.json()) as {
      id_token?: string;
      refresh_token?: string;
    };
    const idToken = tokens.id_token;

    if (!idToken) {
      return new Response("No ID token received from Google", { status: 500 });
    }

    const payload = decodeJwtPayload(idToken);
    const googleUserId = payload.sub as string;

    // Use Google's new refresh token, or reuse one stored from a prior login
    let refreshToken = tokens.refresh_token ?? null;
    if (!refreshToken) {
      const existing = await ctx.runQuery(
        internal.authSessions.getRefreshTokenByGoogleUser,
        { googleUserId },
      );
      refreshToken = existing?.refreshToken ?? null;
    }

    // Create a server-side session. The client receives an HMAC-signed
    // session token; the refresh token never leaves the backend.
    let signedSessionToken: string | undefined;
    if (refreshToken) {
      const uuid = crypto.randomUUID();

      await ctx.runMutation(internal.authSessions.createSession, {
        sessionToken: uuid,
        refreshToken,
        googleUserId,
      });

      signedSessionToken = await signSessionToken(uuid, googleUserId);
    }

    let fragment = `token=${encodeURIComponent(idToken)}&redirect=${encodeURIComponent(state)}`;
    if (signedSessionToken) {
      fragment += `&session=${encodeURIComponent(signedSessionToken)}`;
    }

    return new Response(null, {
      status: 302,
      headers: { Location: `${siteUrl}/auth/callback#${fragment}` },
    });
  }),
});

// ---------------------------------------------------------------------------
// Token refresh
//
// Accepts the HMAC-signed session token, verifies the HMAC signature
// (proves the token wasn't forged), then uses the server-side refresh
// token to get a fresh ID token from Google. The refresh token is never
// included in any response.
// ---------------------------------------------------------------------------

http.route({
  path: "/auth/refresh",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const origin = process.env.SITE_URL!;
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    const body = (await req.json()) as { sessionToken?: string };
    const signedToken = body.sessionToken;

    if (!signedToken || typeof signedToken !== "string") {
      return new Response(JSON.stringify({ error: "Missing session token" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Extract the raw UUID (before HMAC verification — we need the DB
    // record to get the googleUserId for signature verification)
    const dotIdx = signedToken.indexOf(".");
    if (dotIdx < 0) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const uuid = signedToken.substring(0, dotIdx);

    const session = await ctx.runQuery(
      internal.authSessions.getBySessionToken,
      { sessionToken: uuid },
    );

    if (!session) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Verify HMAC signature (timing-safe)
    const verifiedUuid = await verifyAndParseSessionToken(
      signedToken,
      session.googleUserId,
    );
    if (!verifiedUuid) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // HMAC verified — use the stored refresh token to get a new ID token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        refresh_token: session.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenResponse.ok) {
      console.error("Token refresh failed:", await tokenResponse.text());
      await ctx.runMutation(internal.authSessions.deleteBySessionToken, {
        sessionToken: uuid,
      });
      return new Response(JSON.stringify({ error: "Refresh failed" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const newTokens = (await tokenResponse.json()) as { id_token?: string };

    if (!newTokens.id_token) {
      return new Response(
        JSON.stringify({ error: "No ID token returned" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    return new Response(JSON.stringify({ idToken: newTokens.id_token }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }),
});

// ---------------------------------------------------------------------------
// Google Calendar OAuth callback (incremental scope for calendar.readonly)
// ---------------------------------------------------------------------------

http.route({
  path: "/auth/google/calendar-callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || "/";
    const error = url.searchParams.get("error");
    const siteUrl = process.env.SITE_URL!;

    if (error || !code) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${siteUrl}/auth/calendar-callback#error=${encodeURIComponent(error || "no_code")}&state=${encodeURIComponent(state)}`,
        },
      });
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        redirect_uri: `${process.env.CONVEX_SITE_URL}/auth/google/calendar-callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      console.error("Calendar token exchange failed:", await tokenResponse.text());
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${siteUrl}/auth/calendar-callback#error=token_exchange_failed&state=${encodeURIComponent(state)}`,
        },
      });
    }

    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
    };

    if (!tokens.refresh_token || !tokens.access_token) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${siteUrl}/auth/calendar-callback#error=no_refresh_token&state=${encodeURIComponent(state)}`,
        },
      });
    }

    let googleUserId = "";
    if (tokens.id_token) {
      const payload = decodeJwtPayload(tokens.id_token);
      googleUserId = payload.sub as string;
    }

    // Fetch the user's calendar list using the access token
    let availableCalendars: { id: string; summary: string }[] = [];
    try {
      const calListRes = await fetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      if (calListRes.ok) {
        const calListData = (await calListRes.json()) as {
          items?: Array<{ id: string; summary: string }>;
        };
        availableCalendars = (calListData.items ?? []).map((c) => ({
          id: c.id,
          summary: c.summary,
        }));
      }
    } catch {
      // Calendar list fetch is best-effort; sync will retry later
    }

    await ctx.runMutation(internal.calendarSources.storeGoogleCalendarToken, {
      googleUserId,
      calendarRefreshToken: tokens.refresh_token,
      availableCalendars,
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${siteUrl}/auth/calendar-callback#success=true&state=${encodeURIComponent(state)}`,
      },
    });
  }),
});

// CORS preflight for the refresh endpoint
http.route({
  path: "/auth/refresh",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": process.env.SITE_URL!,
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

export default http;
