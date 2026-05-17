/**
 * Google OAuth authentication for Convex.
 *
 * ## Security model
 *
 * **Authenticated users (Google)**
 * The credential is a Google-issued ID token (JWT, RS256). It is signed by
 * Google's private RSA key and verified in two places:
 *
 * 1. **Server-side (authoritative)** — Convex fetches Google's JWKS via OIDC
 *    discovery (`https://accounts.google.com/.well-known/openid-configuration`)
 *    and cryptographically verifies the signature on every request. This is
 *    configured in `convex/auth.config.ts`. Forging a token requires Google's
 *    private key, which is cryptographically infeasible.
 *
 * 2. **Client-side (defense-in-depth)** — Before storing a token we validate
 *    its structure, algorithm (`RS256`), issuer (`accounts.google.com`),
 *    audience (our Google Client ID), and expiry. This prevents storing
 *    garbage, expired, or misrouted tokens — but is NOT a substitute for
 *    server-side verification.
 *
 * The token is stored in `localStorage`. This is the standard approach for
 * SPAs that use `ConvexProviderWithAuth` (the token must be available to JS
 * for the `fetchAccessToken` callback). The main risk is XSS exfiltration,
 * mitigated by:
 *   - Short token lifetime (~1 hour, set by Google)
 *   - No refresh tokens stored client-side
 *   - CSP headers in production (recommended)
 *
 * **CSRF protection**
 * The OAuth `state` parameter carries a random nonce alongside the redirect
 * path. The nonce is stored in `sessionStorage` (per-tab, same-origin) before
 * redirecting to Google, and verified in `AuthCallbackPage` before accepting
 * the token. This prevents session-fixation attacks where an attacker tricks
 * a user into authenticating with the attacker's credentials.
 *
 * **Anonymous users**
 * Identified by a `crypto.randomUUID()` stored in `localStorage`. The UUID
 * has 122 bits of entropy and is practically unguessable. It is NOT signed
 * or verified — this is inherent to anonymous identity. The server never
 * grants elevated privileges based on an anonymous ID alone; features like
 * saved availabilities require Google authentication.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getConfig } from "../config";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_KEY = "whengames_google_token";
const OAUTH_NONCE_KEY = "whengames_oauth_nonce";

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

/** Base64url → string (handles the URL-safe alphabet used by JWTs). */
function decodeBase64Url(str: string): string {
  return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
}

/** Decode a JWT payload without signature verification. */
function decodeJwtPart(part: string): Record<string, unknown> {
  return JSON.parse(decodeBase64Url(part));
}

/**
 * Client-side validation of a Google ID token's structure and claims.
 *
 * This is defense-in-depth. The authoritative verification happens server-side
 * in Convex using Google's public JWKS keys. This function catches obviously
 * invalid, expired, or misrouted tokens before they reach localStorage.
 */
function validateGoogleJwt(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const header = decodeJwtPart(parts[0]);
    const payload = decodeJwtPart(parts[1]);

    // Google signs ID tokens with RS256
    if (header.alg !== "RS256") return false;

    // Issuer must be Google
    if (
      payload.iss !== "https://accounts.google.com" &&
      payload.iss !== "accounts.google.com"
    ) {
      return false;
    }

    // Audience must match our Google Client ID
    if (payload.aud !== getConfig().GOOGLE_CLIENT_ID) return false;

    // Token must not be expired
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
      return false;
    }

    // Subject (Google user ID) must be present
    if (typeof payload.sub !== "string" || !payload.sub) return false;

    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface GoogleAuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  signIn: (redirectTo?: string) => void;
  signOut: () => void;
}

const GoogleAuthContext = createContext<GoogleAuthContextType>({
  isLoading: true,
  isAuthenticated: false,
  token: null,
  signIn: () => {},
  signOut: () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function GoogleAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && validateGoogleJwt(stored)) return stored;
    // Purge invalid / expired tokens on startup
    if (stored) localStorage.removeItem(TOKEN_KEY);
    return null;
  });

  // Periodically check whether the stored token has expired or been tampered
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (!validateGoogleJwt(token)) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      }
    }, 60_000); // every 60 s
    return () => clearInterval(interval);
  }, [token]);

  const signIn = useCallback((redirectTo?: string) => {
    const redirectUri = `${getConfig().CONVEX_SITE_URL}/auth/google/callback`;
    const path =
      redirectTo ??
      window.location.pathname + window.location.search + window.location.hash;

    // CSRF protection: embed a random nonce in the OAuth state parameter and
    // store it in sessionStorage. The callback page verifies the nonce before
    // accepting the token, preventing session-fixation attacks.
    const nonce = crypto.randomUUID();
    sessionStorage.setItem(OAUTH_NONCE_KEY, nonce);
    const state = `${nonce}|${path}`;

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", getConfig().GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid profile email");
    authUrl.searchParams.set("state", state);

    window.location.href = authUrl.toString();
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  const value = useMemo<GoogleAuthContextType>(
    () => ({
      isLoading: false, // no async script to load
      isAuthenticated: !!token,
      token,
      signIn,
      signOut,
    }),
    [token, signIn, signOut],
  );

  return (
    <GoogleAuthContext.Provider value={value}>
      {children}
    </GoogleAuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** General-purpose hook for components that need auth state & actions. */
export function useGoogleAuth() {
  return useContext(GoogleAuthContext);
}

/**
 * Hook consumed by `ConvexProviderWithAuth`.
 * Returns `{ isLoading, isAuthenticated, fetchAccessToken }`.
 */
export function useConvexGoogleAuth() {
  const { isLoading, isAuthenticated, token } = useGoogleAuth();

  const fetchAccessToken = useCallback(
    async ({
      forceRefreshToken: _forceRefreshToken,
    }: {
      forceRefreshToken: boolean;
    }) => {
      // We cannot silently refresh Google ID tokens client-side.
      // Return the current token if it still passes validation; otherwise null
      // (Convex will surface isAuthenticated: false and the user re-logs in).
      if (token && validateGoogleJwt(token)) return token;
      return null;
    },
    [token],
  );

  return useMemo(
    () => ({ isLoading, isAuthenticated, fetchAccessToken }),
    [isLoading, isAuthenticated, fetchAccessToken],
  );
}

// Re-export constants so the callback page can use the same keys
export { TOKEN_KEY, OAUTH_NONCE_KEY, validateGoogleJwt };
