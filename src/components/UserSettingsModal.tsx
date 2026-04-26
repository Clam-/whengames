import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getCommonTimezones } from "../lib/timezone";
import { Id } from "../../convex/_generated/dataModel";

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

export function UserSettingsModal({ profile, onClose }: Props) {
  const updateProfile = useMutation(api.users.updateProfile);

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [weekStartDay, setWeekStartDay] = useState(profile.weekStartDay);
  const [dstNotifications, setDstNotifications] = useState(
    profile.dstNotifications
  );
  const [saving, setSaving] = useState(false);

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
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">User Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <div className="flex items-start gap-3">
              {profile.authType === "sso" && profile.ssoImage && (
                <img
                  src={profile.ssoImage}
                  alt=""
                  className="w-10 h-10 rounded-full mt-0.5"
                />
              )}
              <div className="flex-1">
                <p className="text-xs font-medium text-blue-900 mb-1">
                  Account Type
                </p>
                {profile.authType === "sso" ? (
                  <div className="text-xs text-blue-800 space-y-0.5">
                    <p className="font-medium">SSO (Google Account)</p>
                    {profile.ssoName && (
                      <p className="text-blue-700">{profile.ssoName}</p>
                    )}
                    {profile.ssoEmail && (
                      <p className="text-blue-700">{profile.ssoEmail}</p>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-blue-800">
                    <p className="font-medium">Cookie User</p>
                    <p className="text-blue-600 mt-0.5">
                      Your identity is stored in this browser only. Link a
                      Google account to access your data from any device.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {getCommonTimezones().map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Week Starts On
            </label>
            <select
              value={weekStartDay}
              onChange={(e) => setWeekStartDay(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="text-sm text-gray-700"
            >
              DST change notifications
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
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
