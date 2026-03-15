"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { APP_NAME } from "@/lib/constants";
import { instantRangeForDates } from "@/lib/time";
import type { ScheduleSummary } from "@/lib/types";
import { useViewer } from "@/components/providers";

const timezones =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

export function HomePage() {
  const router = useRouter();
  const { isLoading, user } = useViewer();
  const schedules = useQuery(api.schedules.listPublicSchedules, {}) as ScheduleSummary[] | undefined;
  const createSchedule = useMutation(api.schedules.createSchedule);

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"oneOff" | "weekly">("weekly");
  const [timezone, setTimezone] = useState("UTC");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(resolved || "UTC");
  }, []);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?._id || !title.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      const range =
        kind === "oneOff" && startDate && endDate
          ? instantRangeForDates(startDate, endDate, timezone)
          : undefined;
      const schedule = await createSchedule({
        creatorUserId: user._id as never,
        title,
        description,
        kind,
        timezone,
        dateRangeStartMs: range?.startMs,
        dateRangeEndMs: range?.endMs
      });
      startTransition(() => {
        router.push(`/schedules/${schedule.slug}`);
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="hero surface">
        <div className="hero-copy">
          <div className="eyebrow">Public Scheduling</div>
          <h1 className="display hero-title">{APP_NAME}</h1>
          <p className="hero-text">
            Build shared weekly or one-off schedules, keep anonymous contributors frictionless, and
            let timezone shifts stay explicit instead of surprising people the week of a game.
          </p>
          <div className="button-row">
            <button className="button primary" onClick={() => setShowCreate((value) => !value)}>
              {showCreate ? "Close create" : "Create schedule"}
            </button>
            <a className="button" href="/api/auth/workos/login?returnTo=/">
              Log
            </a>
            <Link className="button ghost" href="/settings">
              Account
            </Link>
          </div>
        </div>
        <div className="hero-card">
          <div className="eyebrow">Viewer</div>
          <div className="hero-user">
            <strong>{isLoading ? "Loading..." : user?.displayName ?? "Anonymous player"}</strong>
            <span className="muted">
              {user?.kind === "sso" ? user.email ?? "SSO account" : "Anonymous cookie session"}
            </span>
            <span className="muted">{user?.timezone ?? "Detecting timezone"}</span>
          </div>
        </div>
      </section>

      {showCreate ? (
        <section className="surface create-panel">
          <div className="section-header">
            <div>
              <div className="eyebrow">Create</div>
              <h2 className="display">New schedule</h2>
            </div>
          </div>
          <form className="stack" onSubmit={handleCreate}>
            <div>
              <label className="label">Title</label>
              <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="textarea"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="grid-two">
              <div>
                <label className="label">Schedule type</label>
                <select
                  className="select"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as "oneOff" | "weekly")}
                >
                  <option value="weekly">Recurring weekly</option>
                  <option value="oneOff">One-off</option>
                </select>
              </div>
              <div>
                <label className="label">Canonical timezone</label>
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
            </div>
            {kind === "oneOff" ? (
              <div className="grid-two">
                <div>
                  <label className="label">Visible start date</label>
                  <input
                    className="field"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Visible end date</label>
                  <input
                    className="field"
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </div>
              </div>
            ) : null}
            <div className="button-row">
              <button className="button primary" disabled={isSubmitting || !user?._id}>
                {isSubmitting ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="surface schedules-panel">
        <div className="section-header">
          <div>
            <div className="eyebrow">Public schedules</div>
            <h2 className="display">Open rooms</h2>
          </div>
        </div>
        <div className="schedule-list">
          {schedules?.length ? (
            schedules.map((schedule) => (
              <Link className="schedule-card" key={schedule._id} href={`/schedules/${schedule.slug}`}>
                <div className="schedule-meta">
                  <span>{schedule.kind === "weekly" ? "Weekly" : "One-off"}</span>
                  <span>{schedule.timezone}</span>
                </div>
                <h3>{schedule.title}</h3>
                <p className="muted">{schedule.description || "No description yet."}</p>
              </Link>
            ))
          ) : (
            <div className="empty-state muted">No schedules yet.</div>
          )}
        </div>
      </section>
    </main>
  );
}
