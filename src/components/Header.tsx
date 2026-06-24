import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useLocation, useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";
import { useGoogleAuth } from "../lib/googleAuth";
import { useAnonymousUser } from "../hooks/useAnonymousUser";
import { UserSettingsModal } from "./UserSettingsModal";
import { AnimatedTitle } from "./AnimatedTitle";

const CALENDAR_REOPEN_SETTINGS_KEY =
  "whengames_reopen_settings_after_calendar_oauth";

export function Header() {
  const { isAuthenticated, isLoading, signIn, signOut } = useGoogleAuth();
  const { anonymousId, hasInteracted, clearAnonymousUser } = useAnonymousUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const settingsRequested =
    new URLSearchParams(location.search).get("settings") === "calendar";

  useEffect(() => {
    const reopenAfterCalendarOAuth =
      sessionStorage.getItem(CALENDAR_REOPEN_SETTINGS_KEY) === "true";
    if (reopenAfterCalendarOAuth) {
      sessionStorage.removeItem(CALENDAR_REOPEN_SETTINGS_KEY);
    }

    if (settingsRequested || reopenAfterCalendarOAuth) {
      setShowSettings(true);
    }
  }, [settingsRequested]);

  // Always pass anonymousId so the query can find the profile during the
  // transition window between SSO completion and profile linking.
  const profile = useQuery(api.users.currentUserProfile, {
    anonymousId: anonymousId || undefined,
  });

  // Refresh cached profile image on each app access (throttled to once/24h server-side)
  const refreshProfileImage = useMutation(
    api.users.refreshProfileImageIfNeeded
  );
  const hasRefreshed = useRef(false);
  useEffect(() => {
    if (isAuthenticated && !isLoading && !hasRefreshed.current) {
      hasRefreshed.current = true;
      refreshProfileImage().catch(() => {});
    }
  }, [isAuthenticated, isLoading, refreshProfileImage]);

  const handleLogin = () => {
    // Redirect back to the current page after OAuth sign-in
    const currentPath = location.pathname + location.search + location.hash;
    signIn(currentPath);
  };

  const handleLogout = () => {
    signOut();
  };

  const handleCloseSettings = () => {
    setShowSettings(false);
    if (!settingsRequested) return;

    const params = new URLSearchParams(location.search);
    params.delete("settings");
    const search = params.toString();
    navigate(
      `${location.pathname}${search ? `?${search}` : ""}${location.hash}`,
      { replace: true },
    );
  };

  return (
    <>
      <header className="bg-white border-b border-gray-200 shadow-sm dark:bg-slate-800 dark:border-slate-700">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 no-underline">
            <AnimatedTitle />
          </a>

          <div className="flex items-center gap-3">
            {isLoading ? (
              <span className="text-sm text-gray-400 dark:text-slate-500">Loading...</span>
            ) : isAuthenticated || profile?.isAuthenticated ? (
              <>
                <div className="flex items-center gap-2">
                  {(profile?.ssoImage || profile?.profileImageUrl) ? (
                    <img
                      src={profile.ssoImage || profile.profileImageUrl}
                      alt=""
                      className="w-7 h-7 rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : null}
                  <span className="text-sm text-gray-700 dark:text-slate-300">
                    {profile?.displayName ||
                      profile?.ssoName ||
                      profile?.ssoEmail ||
                      "User"}
                  </span>
                </div>
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
                >
                  Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                {hasInteracted && profile && (
                  <span className="text-sm text-gray-500 dark:text-slate-400">
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
                    className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Settings
                  </button>
                )}
                {hasInteracted && profile && (
                  <button
                    onClick={() => {
                      clearAnonymousUser();
                      window.location.reload();
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Logout
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
          anonymousId={anonymousId || undefined}
          onClose={handleCloseSettings}
        />
      )}
    </>
  );
}
