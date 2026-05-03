import { useEffect } from "react";
import { TOKEN_KEY } from "../lib/googleAuth";

/**
 * Route component mounted at /auth/callback.
 *
 * After the Convex HTTP endpoint exchanges the Google authorization code for
 * an ID token, it redirects the browser here with the token in the URL
 * fragment: /auth/callback#token=<jwt>&redirect=<path>
 *
 * This component reads the fragment, stores the token, and navigates to the
 * original page via a full page load so the GoogleAuthProvider re-initialises
 * with the fresh token.
 */
export function AuthCallbackPage() {
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get("token");
    const redirect = params.get("redirect") || "/";

    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    }

    // Full navigation (not pushState) so every provider re-reads localStorage
    window.location.replace(redirect);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
      <span className="text-gray-500 dark:text-slate-400">Signing in...</span>
    </div>
  );
}
