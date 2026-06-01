import { useState, useMemo } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useGoogleAuth } from "../lib/googleAuth";
import { getCommonTimezones } from "../lib/timezone";
import { Id } from "../../convex/_generated/dataModel";
import { CalendarSyncSettings } from "./CalendarSyncSettings";
import { useToast } from "../hooks/useToast";

interface Profile {
  _id: Id<"userProfiles">;
  displayName: string;
  timezone: string;
  weekStartDay: number;
  dstNotifications: boolean;
  authUserId?: string;
  email?: string;
  profileImageUrl?: string;
  isAuthenticated: boolean;
  authType: "sso" | "anonymous";
  ssoName?: string;
  ssoEmail?: string;
  ssoImage?: string;
}

interface Props {
  profile: Profile;
  onClose: () => void;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const ANON_ID_KEY = "whengames_anonymous_id";
const ANON_NAME_KEY = "whengames_anonymous_name";

function formatTzLabel(tz: string): string {
  // "America/New_York" -> "New York (America)"
  const parts = tz.split("/");
  if (parts.length === 1) return tz;
  const city = parts[parts.length - 1].replace(/_/g, " ");
  const region = parts.slice(0, -1).join("/");
  return `${city} (${region})`;
}

function TimezoneSearchSelect({
  value,
  onChange,
  search,
  onSearchChange,
}: {
  value: string;
  onChange: (tz: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const allTimezones = useMemo(() => getCommonTimezones(), []);

  const filtered = useMemo(() => {
    if (!search.trim()) return allTimezones;
    const q = search.toLowerCase();
    return allTimezones.filter(
      (tz) =>
        tz.toLowerCase().includes(q) ||
        formatTzLabel(tz).toLowerCase().includes(q)
    );
  }, [allTimezones, search]);

  return (
    <div className="relative">
      <input
        type="text"
        value={isOpen ? search : value}
        onChange={(e) => {
          onSearchChange(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={() => {
          setIsOpen(true);
          onSearchChange("");
        }}
        onBlur={() => {
          // Delay to allow click on option
          setTimeout(() => setIsOpen(false), 200);
        }}
        placeholder="Search timezones..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400"
      />
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto dark:bg-slate-800 dark:border-slate-600">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400 dark:text-slate-500">
              No matching timezones
            </div>
          ) : (
            filtered.map((tz) => (
              <button
                key={tz}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 ${
                  tz === value
                    ? "bg-blue-100 text-blue-700 font-medium dark:bg-blue-900/50 dark:text-blue-400"
                    : "text-gray-700 dark:text-slate-300"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent blur
                  onChange(tz);
                  onSearchChange("");
                  setIsOpen(false);
                }}
              >
                {formatTzLabel(tz)}
                <span className="text-xs text-gray-400 ml-1 dark:text-slate-500">({tz})</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function UserSettingsModal({ profile, onClose }: Props) {
  const updateProfile = useMutation(api.users.updateProfile);
  const unlinkSso = useMutation(api.users.unlinkSso);
  const triggerSync = useAction(api.calendarSync.triggerSyncForProfile);
  const { signOut } = useGoogleAuth();
  const { showToast, updateToast } = useToast();

  const calendarSources = useQuery(
    api.calendarSources.getForProfile,
    profile.authType === "sso" && profile._id ? { profileId: profile._id } : "skip",
  );
  const hasCalendarSources = (calendarSources ?? []).some((s: { enabled: boolean }) => s.enabled);

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [weekStartDay, setWeekStartDay] = useState(profile.weekStartDay);
  const [dstNotifications, setDstNotifications] = useState(
    profile.dstNotifications
  );
  const [saving, setSaving] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState("");

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      // Generate a new anonymous ID
      const newAnonymousId = crypto.randomUUID();

      const result = await unlinkSso({
        profileId: profile._id,
        newAnonymousId,
      });

      // Store the new anonymous identity in localStorage
      localStorage.setItem(ANON_ID_KEY, newAnonymousId);
      localStorage.setItem(ANON_NAME_KEY, result.displayName);

      // Sign out (clear Google token)
      signOut();
      setShowUnlinkConfirm(false);
      onClose();
      window.location.reload();
    } catch (err) {
      console.error("Failed to unlink SSO:", err);
    } finally {
      setUnlinking(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        profileId: profile._id,
        displayName,
        timezone,
        weekStartDay,
        dstNotifications,
      });
      onClose();

      if (hasCalendarSources && profile._id) {
        const toastId = showToast("Calendar sync in progress...", "info", 0);
        try {
          await triggerSync({ profileId: profile._id });
          updateToast(toastId, { message: "Calendar sync complete!", type: "success", duration: 4000 });
        } catch {
          updateToast(toastId, { message: "Calendar sync failed. Will retry automatically.", type: "error", duration: 6000 });
        }
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 dark:bg-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-slate-100">User Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none dark:hover:text-slate-300"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 dark:bg-blue-900/30 dark:border-blue-800">
            <div className="flex items-start gap-3">
              {profile.authType === "sso" && profile.ssoImage && (
                <img
                  src={profile.ssoImage}
                  alt=""
                  className="w-10 h-10 rounded-full mt-0.5"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <div className="flex-1">
                <p className="text-xs font-medium text-blue-900 mb-1 dark:text-blue-300">
                  Account Type
                </p>
                {profile.authType === "sso" ? (
                  <div className="text-xs text-blue-800 space-y-0.5 dark:text-blue-300">
                    <p className="font-medium">SSO (Google Account)</p>
                    {profile.ssoName && (
                      <p className="text-blue-700 dark:text-blue-400">{profile.ssoName}</p>
                    )}
                    {profile.ssoEmail && (
                      <p className="text-blue-700 dark:text-blue-400">{profile.ssoEmail}</p>
                    )}
                    {!showUnlinkConfirm ? (
                      <button
                        onClick={() => setShowUnlinkConfirm(true)}
                        className="mt-2 text-xs text-red-600 hover:text-red-700 underline dark:text-rose-400 dark:hover:text-rose-300"
                      >
                        Unlink SSO &amp; convert to cookie account
                      </button>
                    ) : (
                      <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 dark:bg-rose-900/40 dark:border-rose-800">
                        <p className="text-xs text-red-700 mb-2 dark:text-rose-400">
                          This will disconnect your Google account. Your data
                          will be stored only in this browser. Are you sure?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleUnlink}
                            disabled={unlinking}
                            className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50"
                          >
                            {unlinking ? "Unlinking..." : "Yes, unlink"}
                          </button>
                          <button
                            onClick={() => setShowUnlinkConfirm(false)}
                            className="text-xs text-gray-600 px-2 py-1 rounded hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-blue-800 dark:text-blue-300">
                    <p className="font-medium">Cookie User</p>
                    <p className="text-blue-600 mt-0.5 dark:text-blue-400">
                      Your identity is stored in this browser only. Link a
                      Google account to access your data from any device.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
              Timezone
            </label>
            <TimezoneSearchSelect
              value={timezone}
              onChange={setTimezone}
              search={timezoneSearch}
              onSearchChange={setTimezoneSearch}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
              Week Starts On
            </label>
            <select
              value={weekStartDay}
              onChange={(e) => setWeekStartDay(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            >
              {DAY_NAMES.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dst-notifications"
              checked={dstNotifications}
              onChange={(e) => setDstNotifications(e.target.checked)}
              className="rounded text-blue-600"
            />
            <label
              htmlFor="dst-notifications"
              className="text-sm text-gray-700 dark:text-slate-300"
            >
              DST change notifications
            </label>
          </div>

          {profile.authType === "sso" && profile._id && (
            <CalendarSyncSettings
              profileId={profile._id}
              userEmail={profile.ssoEmail}
            />
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
