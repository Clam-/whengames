"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import { useViewer } from "@/components/providers";

const timezones =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

export function SettingsPage() {
  const { user, refresh } = useViewer();
  const saveViewerSettings = useMutation(api.users.saveViewerSettings);

  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [weekStartsOn, setWeekStartsOn] = useState(0);
  const [dstNotifications, setDstNotifications] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }
    setDisplayName(user.displayName);
    setTimezone(user.timezone);
    setWeekStartsOn(user.weekStartsOn);
    setDstNotifications(user.dstNotifications);
  }, [user]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?._id) {
      return;
    }
    setIsSaving(true);
    try {
      await saveViewerSettings({
        userId: user._id as never,
        displayName,
        timezone,
        weekStartsOn,
        dstNotifications
      });
      await refresh();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="surface create-panel">
        <div className="section-header">
          <div>
            <div className="eyebrow">Account</div>
            <h1 className="display">Viewer settings</h1>
          </div>
          <a className="button" href="/">
            Back
          </a>
        </div>
        <form className="stack" onSubmit={handleSave}>
          <div>
            <label className="label">Display name</label>
            <input
              className="field"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="grid-two">
            <div>
              <label className="label">Timezone</label>
              <select
                className="select"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                {timezones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Week starts on</label>
              <select
                className="select"
                value={weekStartsOn}
                onChange={(event) => setWeekStartsOn(Number(event.target.value))}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
            </div>
          </div>
          <label className="toggle-row">
            <input
              checked={dstNotifications}
              onChange={(event) => setDstNotifications(event.target.checked)}
              type="checkbox"
            />
            <span>Send DST impact notices seven days before the change.</span>
          </label>
          {user?.kind !== "sso" ? (
            <p className="muted">
              Anonymous viewers can keep a display name here, but DST mail requires using the
              single “Log” SSO flow.
            </p>
          ) : null}
          <div className="button-row">
            <button className="button primary" disabled={isSaving || !user}>
              {isSaving ? "Saving..." : "Save"}
            </button>
            <a className="button" href="/api/logout">
              Log out
            </a>
          </div>
        </form>
      </section>
    </main>
  );
}
