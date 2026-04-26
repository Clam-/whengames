import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAnonymousUser } from "../hooks/useAnonymousUser";
import { useTimezone } from "../hooks/useTimezone";

/**
 * Component that handles post-authentication profile merge.
 * Place this near the root of the app (inside ConvexAuthProvider).
 *
 * After Google sign-in completes, this:
 * 1. Checks if there was an anonymous profile
 * 2. Merges anonymous data into the authenticated profile
 * 3. Creates a new authenticated profile if needed
 */
export function AuthCallback() {
  const { isAuthenticated } = useConvexAuth();
  const { anonymousId, clearAnonymousUser } = useAnonymousUser();
  const { timezone } = useTimezone();
  const ensureProfile = useMutation(api.users.ensureAuthProfile);
  const hasRun = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !hasRun.current) {
      hasRun.current = true;

      // Merge anonymous profile into authenticated profile.
      // The server reads SSO user info (name, email, image) from
      // the Convex Auth users table automatically.
      ensureProfile({
        anonymousId: anonymousId || undefined,
        timezone,
      })
        .then(() => {
          // Merge succeeded — clear the anonymous identity from localStorage
          // so that logging out returns to a clean no-account state instead
          // of resurrecting the old cookie-based profile.
          clearAnonymousUser();
        })
        .catch((err) => {
          console.error("Failed to ensure auth profile:", err);
          hasRun.current = false; // Allow retry
        });
    }
  }, [isAuthenticated, anonymousId, timezone, ensureProfile, clearAnonymousUser]);

  return null;
}
