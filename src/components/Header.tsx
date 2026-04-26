import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useLocation } from "react-router";
import { api } from "../../convex/_generated/api";
import { useAnonymousUser } from "../hooks/useAnonymousUser";
import { UserSettingsModal } from "./UserSettingsModal";

export function Header() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const { anonymousId, hasInteracted } = useAnonymousUser();
  const location = useLocation();
  const [showSettings, setShowSettings] = useState(false);

  // Always pass anonymousId so the query can find the profile during the
  // transition window between SSO completion and profile linking.
  const profile = useQuery(api.users.currentUserProfile, {
    anonymousId: anonymousId || undefined,
  });

  const handleLogin = () => {
    // Redirect back to the current page after OAuth sign-in
    const currentPath = location.pathname + location.search + location.hash;
    void signIn("google", { redirectTo: currentPath });
  };

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <>
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 no-underline">
            <span className="text-xl font-bold text-gray-900">
              When games?
            </span>
          </a>

          <div className="flex items-center gap-3">
            {isLoading ? (
              <span className="text-sm text-gray-400">Loading...</span>
            ) : isAuthenticated || profile?.isAuthenticated ? (
              <>
                <div className="flex items-center gap-2">
                  {(profile?.ssoImage || profile?.profileImageUrl) && (
                    <img
                      src={profile.ssoImage || profile.profileImageUrl}
                      alt=""
                      className="w-7 h-7 rounded-full"
                    />
                  )}
                  <span className="text-sm text-gray-700">
                    {profile?.displayName ||
                      profile?.ssoName ||
                      profile?.ssoEmail ||
                      "User"}
                  </span>
                </div>
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                >
                  Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                {hasInteracted && profile && (
                  <span className="text-sm text-gray-500">
                    {profile.displayName}
                  </span>
                )}
                <button
                  onClick={handleLogin}
                  className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition-colors"
                >
                  {hasInteracted ? "Link Login" : "Login"}
                </button>
                {profile && (
                  <button
                    onClick={() => setShowSettings(true)}
                    className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                  >
                    Settings
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {showSettings && profile && (
        <UserSettingsModal
          profile={profile}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}
