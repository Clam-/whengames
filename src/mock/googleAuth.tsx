/**
 * Mock replacement for "src/lib/googleAuth.tsx".
 *
 * In design mode, the user is always anonymous (not authenticated).
 * All auth actions are no-ops.
 */

import { type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Constants & utilities re-exported for AuthCallbackPage
// ---------------------------------------------------------------------------

export const TOKEN_KEY = "whengames_google_token";
export const OAUTH_NONCE_KEY = "whengames_oauth_nonce";
export function validateGoogleJwt(_token: string) {
  return false;
}

// ---------------------------------------------------------------------------
// GoogleAuthProvider — renders children, no auth context needed
// ---------------------------------------------------------------------------

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// useGoogleAuth — always anonymous
// ---------------------------------------------------------------------------

export function useGoogleAuth() {
  return {
    isLoading: false,
    isAuthenticated: false,
    token: null as string | null,
    signIn: (_returnPath?: string) => {
      console.log("[mock] signIn called — no-op in design mode");
    },
    signOut: () => {
      console.log("[mock] signOut called — no-op in design mode");
    },
  };
}

// ---------------------------------------------------------------------------
// useConvexGoogleAuth — consumed by ConvexProviderWithAuth
// ---------------------------------------------------------------------------

export function useConvexGoogleAuth() {
  return {
    isLoading: false,
    isAuthenticated: false,
    fetchAccessToken: async () => null as string | null,
  };
}
