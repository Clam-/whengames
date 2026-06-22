import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { getConfig } from "../config";

const CALENDAR_NONCE_KEY = "whengames_calendar_oauth_nonce";
const CALENDAR_CONNECTED_KEY = "whengames_calendar_just_connected";

interface CalendarSource {
  _id: Id<"calendarSources">;
  type: "google" | "ics";
  availableCalendars?: { id: string; summary: string }[];
  selectedCalendarIds?: string[];
  hasIcsUrl?: boolean;
  lastSyncAt?: number;
  lastSyncStatus?: "success" | "error";
  lastSyncError?: string;
  enabled: boolean;
}

interface Props {
  profileId: Id<"userProfiles">;
  userEmail?: string;
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function CalendarSyncSettings({ profileId, userEmail }: Props) {
  const sources = useQuery(api.calendarSources.getForProfile, { profileId });
  const updateSelectedCalendars = useMutation(api.calendarSources.updateSelectedCalendars);
  const saveIcsUrlMut = useMutation(api.calendarSources.saveIcsUrl);
  const removeSourceMut = useMutation(api.calendarSources.removeSource);

  const [icsUrl, setIcsUrl] = useState("");

  const googleSource = (sources as CalendarSource[] | undefined)?.find((s: CalendarSource) => s.type === "google");
  const icsSource = (sources as CalendarSource[] | undefined)?.find((s: CalendarSource) => s.type === "ics");

  useEffect(() => {
    const flag = sessionStorage.getItem(CALENDAR_CONNECTED_KEY);
    if (flag) {
      sessionStorage.removeItem(CALENDAR_CONNECTED_KEY);
    }
  }, []);

  const handleConnectGoogle = useCallback(() => {
    const config = getConfig();
    const nonce = crypto.randomUUID();
    sessionStorage.setItem(CALENDAR_NONCE_KEY, nonce);
    const currentPath = window.location.pathname + window.location.search + window.location.hash;
    const state = `${nonce}|${currentPath}`;

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", config.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", `${config.CONVEX_SITE_URL}/auth/google/calendar-callback`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.readonly");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);
    if (userEmail) authUrl.searchParams.set("login_hint", userEmail);

    window.location.href = authUrl.toString();
  }, [userEmail]);

  const handleCalendarToggle = useCallback(
    async (calendarId: string, checked: boolean) => {
      if (!googleSource) return;
      const current = googleSource.selectedCalendarIds ?? [];
      const updated = checked
        ? [...current, calendarId]
        : current.filter((id: string) => id !== calendarId);
      await updateSelectedCalendars({ profileId, selectedCalendarIds: updated });
    },
    [googleSource, profileId, updateSelectedCalendars],
  );

  const handleDisconnectGoogle = useCallback(async () => {
    if (!googleSource) return;
    await removeSourceMut({ sourceId: googleSource._id });
  }, [googleSource, removeSourceMut]);

  const handleSaveIcsUrl = useCallback(async () => {
    const trimmed = icsUrl.trim();
    if (!trimmed) return;
    const normalized = trimmed.replace(/^webcal:\/\//, "https://");
    await saveIcsUrlMut({ profileId, icsUrl: normalized });
    setIcsUrl("");
  }, [icsUrl, profileId, saveIcsUrlMut]);

  const handleRemoveIcs = useCallback(async () => {
    if (!icsSource) return;
    await removeSourceMut({ sourceId: icsSource._id });
    setIcsUrl("");
  }, [icsSource, removeSourceMut]);

  const isValidUrl = (url: string) => {
    const trimmed = url.trim();
    return trimmed === "" || /^(https?:\/\/|webcal:\/\/)/.test(trimmed);
  };

  return (
    <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-slate-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
        Calendar Sync
      </h3>

      {/* Google Calendar */}
      <div className="bg-gray-50 rounded-lg p-3 dark:bg-slate-700/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600 dark:text-slate-400">
            Google Calendar
          </span>
          {googleSource && (
            <button
              onClick={handleDisconnectGoogle}
              className="text-xs text-red-500 hover:text-red-600 dark:text-rose-400 dark:hover:text-rose-300"
            >
              Disconnect
            </button>
          )}
        </div>

        {!googleSource ? (
          <button
            onClick={handleConnectGoogle}
            className="w-full bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Connect Google Calendar
          </button>
        ) : (
          <div className="space-y-2">
            {googleSource.availableCalendars && googleSource.availableCalendars.length > 0 ? (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {googleSource.availableCalendars.map((cal: { id: string; summary: string }) => (
                  <label key={cal.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(googleSource.selectedCalendarIds ?? []).includes(cal.id)}
                      onChange={(e) => handleCalendarToggle(cal.id, e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="truncate">{cal.summary}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-slate-500">
                No calendars found. Try disconnecting and reconnecting.
              </p>
            )}

            {googleSource.lastSyncAt && (
              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
                <span>Last sync: {formatRelativeTime(googleSource.lastSyncAt)}</span>
                {googleSource.lastSyncStatus === "error" && (
                  <span className="text-red-500 dark:text-rose-400" title={googleSource.lastSyncError}>
                    (error)
                  </span>
                )}
                {googleSource.lastSyncStatus === "success" && (
                  <span className="text-green-500 dark:text-emerald-400">
                    (ok)
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ICS URL */}
      <div className="bg-gray-50 rounded-lg p-3 dark:bg-slate-700/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600 dark:text-slate-400">
            ICS Calendar URL
          </span>
          {icsSource && (
            <button
              onClick={handleRemoveIcs}
              className="text-xs text-red-500 hover:text-red-600 dark:text-rose-400 dark:hover:text-rose-300"
            >
              Remove
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={icsUrl}
            onChange={(e) => setIcsUrl(e.target.value)}
            placeholder={
              icsSource?.hasIcsUrl
                ? "Paste new URL to replace current calendar"
                : "https://example.com/calendar.ics"
            }
            className={`flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400 ${
              !isValidUrl(icsUrl) ? "border-red-300" : "border-gray-300"
            }`}
          />
          <button
            onClick={handleSaveIcsUrl}
            disabled={!icsUrl.trim() || !isValidUrl(icsUrl)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {icsSource?.hasIcsUrl ? "Replace" : "Save"}
          </button>
        </div>
        {icsSource?.hasIcsUrl && (
          <p className="text-xs text-gray-400 mt-1 dark:text-slate-500">
            ICS calendar connected.
          </p>
        )}
        {!isValidUrl(icsUrl) && (
          <p className="text-xs text-red-500 mt-1 dark:text-rose-400">
            URL must start with https:// or webcal://
          </p>
        )}
        {icsSource?.lastSyncAt && (
          <div className="flex items-center gap-2 text-xs text-gray-400 mt-2 dark:text-slate-500">
            <span>Last sync: {formatRelativeTime(icsSource.lastSyncAt)}</span>
            {icsSource.lastSyncStatus === "error" && (
              <span className="text-red-500 dark:text-rose-400" title={icsSource.lastSyncError}>
                (error)
              </span>
            )}
            {icsSource.lastSyncStatus === "success" && (
              <span className="text-green-500 dark:text-emerald-400">
                (ok)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
