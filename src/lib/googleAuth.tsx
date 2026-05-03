import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const TOKEN_KEY = "whengames_google_token";

/** Decode a JWT payload without signature verification (client-side display only). */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64));
}

/** Returns true if the token has not yet expired. */
function isTokenValid(token: string): boolean {
  try {
    const payload = decodeJwtPayload(token);
    return (payload.exp as number) * 1000 > Date.now();
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
    if (stored && isTokenValid(stored)) return stored;
    if (stored) localStorage.removeItem(TOKEN_KEY);
    return null;
  });

  // Periodically check whether the stored token has expired
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (!isTokenValid(token)) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      }
    }, 60_000); // every 60 s
    return () => clearInterval(interval);
  }, [token]);

  const signIn = useCallback((redirectTo?: string) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
    const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string;
    const redirectUri = `${convexSiteUrl}/auth/google/callback`;
    const state =
      redirectTo ??
      window.location.pathname + window.location.search + window.location.hash;

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
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
      // Return the current token if it's still valid; otherwise null.
      if (token && isTokenValid(token)) return token;
      return null;
    },
    [token],
  );

  return useMemo(
    () => ({ isLoading, isAuthenticated, fetchAccessToken }),
    [isLoading, isAuthenticated, fetchAccessToken],
  );
}

// Re-export the TOKEN_KEY so the callback page can write to the same key
export { TOKEN_KEY };
