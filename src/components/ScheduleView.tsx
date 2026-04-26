import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Header } from "./Header";
import { WeeklyGrid } from "./WeeklyGrid";
import { DisplayNamePrompt } from "./DisplayNamePrompt";
import { useAnonymousUser } from "../hooks/useAnonymousUser";
import { useTimezone } from "../hooks/useTimezone";
import { detectTimezone, getWeekDates } from "../lib/timezone";
import { DateTime } from "luxon";

type SelectMode = "auto" | "can-do" | "cant-do" | "maybe";
type AllowMode = "auto" | "allow" | "dont-allow";
type CreatorMode = "limit" | "nominate" | "lock" | null;

export function ScheduleView() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useConvexAuth();
  const { anonymousId, displayName, setDisplayName, hasInteracted } =
    useAnonymousUser();

  const profile = useQuery(api.users.currentUserProfile, {
    anonymousId: isAuthenticated ? undefined : anonymousId || undefined,
  });

  const schedule = useQuery(api.schedules.get, {
    scheduleId: id as Id<"schedules">,
  });

  const { timezone } = useTimezone(profile?.timezone);

  const getOrCreateProfile = useMutation(api.users.getOrCreateAnonymousProfile);
  const setSelectionMut = useMutation(api.selections.set);
  const removeSelectionMut = useMutation(api.selections.remove);
  const batchSetMut = useMutation(api.selections.batchSet);
  const setDisallowedSlots = useMutation(api.schedules.setDisallowedSlots);
  const setLockedSlots = useMutation(api.schedules.setLockedSlots);

  const [selectMode, setSelectMode] = useState<SelectMode>("auto");
  const [allowMode, setAllowMode] = useState<AllowMode>("auto");
  const [creatorMode, setCreatorMode] = useState<CreatorMode>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [hasName, setHasName] = useState(false);

  // Check if current user is the creator
  const isCreator = profile && schedule
    ? schedule.creatorProfileId === profile._id
    : false;

  // Default to "limit" mode for creators
  useEffect(() => {
    if (isCreator && creatorMode === null) {
      setCreatorMode("limit");
    }
  }, [isCreator, creatorMode]);

  // Determine if user can interact with the grid
  const canInteract =
    (isAuthenticated && !!profile) || (hasInteracted && !!profile) || hasName;

  // The reference date for the current week view
  const referenceDate = DateTime.now()
    .setZone(timezone)
    .plus({ weeks: weekOffset });

  useEffect(() => {
    if (hasInteracted || isAuthenticated) {
      setHasName(true);
    } else {
      // Reset when user logs out (isAuthenticated becomes false and
      // anonymous identity was already cleared during the auth flow)
      setHasName(false);
    }
  }, [hasInteracted, isAuthenticated]);

  const handleDisplayNameSubmit = useCallback(
    async (name: string) => {
      setDisplayName(name);
      setHasName(true);

      // Create anonymous profile in Convex
      if (!profile) {
        await getOrCreateProfile({
          anonymousId,
          displayName: name,
          timezone: timezone || detectTimezone(),
        });
      }
    },
    [anonymousId, getOrCreateProfile, profile, setDisplayName, timezone]
  );

  const handleCellChange = useCallback(
    async (
      dayKey: string,
      timeSlot: string,
      state: "can-do" | "cant-do" | "maybe" | "blank",
      isException?: boolean,
      exceptionDate?: string
    ) => {
      if (!profile) return;

      if (state === "blank") {
        await removeSelectionMut({
          scheduleId: id as Id<"schedules">,
          profileId: profile._id,
          dayKey,
          timeSlot,
          isException,
          exceptionDate,
        });
      } else {
        await setSelectionMut({
          scheduleId: id as Id<"schedules">,
          profileId: profile._id,
          dayKey,
          timeSlot,
          timezone,
          state,
          isException,
          exceptionDate,
        });
      }
    },
    [id, profile, timezone, setSelectionMut, removeSelectionMut]
  );

  const handleBatchChange = useCallback(
    async (
      cells: {
        dayKey: string;
        timeSlot: string;
        state: "can-do" | "cant-do" | "maybe" | "blank";
        isException?: boolean;
        exceptionDate?: string;
      }[]
    ) => {
      if (!profile) return;

      await batchSetMut({
        scheduleId: id as Id<"schedules">,
        profileId: profile._id,
        timezone,
        selections: cells,
      });
    },
    [id, profile, timezone, batchSetMut]
  );

  const handleCreatorSlotChange = useCallback(
    async (slots: { dayKey: string; timeSlot: string }[]) => {
      if (!isCreator || !schedule) return;

      if (creatorMode === "limit") {
        await setDisallowedSlots({
          scheduleId: schedule._id,
          slots,
        });
      } else if (creatorMode === "lock") {
        await setLockedSlots({
          scheduleId: schedule._id,
          slots,
        });
      }
      // nominate mode: handled through regular cell changes
    },
    [isCreator, schedule, creatorMode, setDisallowedSlots, setLockedSlots]
  );

  if (!schedule) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="text-center py-12 text-gray-400">
          {schedule === null ? "Schedule not found." : "Loading..."}
        </div>
      </div>
    );
  }

  const weekStartDay = profile?.weekStartDay ?? 0;

  // Determine navigation boundaries based on schedule type
  const getNavigationBoundaries = () => {
    if (schedule.type === "one-off") {
      const startDate = schedule.dateRangeStart
        ? DateTime.fromISO(schedule.dateRangeStart)
        : null;
      const endDate = schedule.dateRangeEnd
        ? DateTime.fromISO(schedule.dateRangeEnd)
        : null;
      return { minDate: startDate, maxDate: endDate };
    } else {
      const startDate = schedule.recurringStartDate
        ? DateTime.fromISO(schedule.recurringStartDate)
        : null;
      return { minDate: startDate, maxDate: null };
    }
  };

  const boundaries = getNavigationBoundaries();

  // Check if we can navigate backward (prev week has any overlap with date range)
  const canGoBack = () => {
    if (!boundaries.minDate) return true;
    const prevWeekDates = getWeekDates(referenceDate.minus({ weeks: 1 }), weekStartDay);
    const prevWeekEnd = prevWeekDates[6]; // Last day of previous week
    return prevWeekEnd.toISODate()! >= boundaries.minDate.toISODate()!;
  };

  // Check if we can navigate forward (next week has any overlap with date range)
  const canGoForward = () => {
    if (!boundaries.maxDate) return true;
    const nextWeekDates = getWeekDates(referenceDate.plus({ weeks: 1 }), weekStartDay);
    const nextWeekStart = nextWeekDates[0]; // First day of next week
    return nextWeekStart.toISODate()! <= boundaries.maxDate.toISODate()!;
  };

  const handleWeekBack = () => {
    if (canGoBack()) {
      setWeekOffset((w) => w - 1);
    }
  };

  const handleWeekForward = () => {
    if (canGoForward()) {
      setWeekOffset((w) => w + 1);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-4">
        {/* Schedule Header */}
        <div className="mb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {schedule.title}
              </h1>
              {schedule.description && (
                <p className="text-sm text-gray-500 mt-1">
                  {schedule.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    schedule.type === "one-off"
                      ? "bg-green-100 text-green-700"
                      : "bg-purple-100 text-purple-700"
                  }`}
                >
                  {schedule.type === "one-off" ? "One-off" : "Recurring"}
                </span>
                <span className="text-xs text-gray-400">
                  by {schedule.creatorName}
                </span>
                <span className="text-xs text-gray-400">
                  TZ: {timezone}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Anonymous user prompt */}
        {!canInteract && !isAuthenticated && (
          <DisplayNamePrompt
            currentName={displayName}
            onSubmit={handleDisplayNameSubmit}
          />
        )}

        {/* Controls bar */}
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          {/* Apply mode / Select mode */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600">Apply:</label>
            {isCreator && creatorMode === "limit" ? (
              <select
                value={allowMode}
                onChange={(e) => setAllowMode(e.target.value as AllowMode)}
                className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="auto">Auto</option>
                <option value="allow">Allow</option>
                <option value="dont-allow">Don&apos;t Allow</option>
              </select>
            ) : (
              <select
                value={selectMode}
                onChange={(e) => setSelectMode(e.target.value as SelectMode)}
                className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="auto">Auto</option>
                <option value="can-do">Can Do</option>
                <option value="cant-do">Can&apos;t Do</option>
                <option value="maybe">Maybe</option>
              </select>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-can-do-bg border border-can-do inline-block"></span>
              Can Do
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-cant-do-bg border border-cant-do inline-block"></span>
              Can&apos;t Do
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-maybe-bg border border-maybe inline-block"></span>
              Maybe
            </span>
          </div>

          {/* Creator mode buttons (radio-style) */}
          {isCreator && (
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setCreatorMode("limit")}
                className={`text-xs px-2 py-1 rounded ${
                  creatorMode === "limit"
                    ? "bg-green-100 text-green-700 font-medium"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                Allow/Disallow Time
              </button>
              <button
                onClick={() => setCreatorMode("nominate")}
                className={`text-xs px-2 py-1 rounded ${
                  creatorMode === "nominate"
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                Nominate Time
              </button>
              <button
                onClick={() => setCreatorMode("lock")}
                className={`text-xs px-2 py-1 rounded ${
                  creatorMode === "lock"
                    ? "bg-purple-100 text-purple-700 font-medium"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                Lock In Time
              </button>
            </div>
          )}

          {/* Week navigation */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleWeekBack}
              disabled={!canGoBack()}
              className="text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-gray-100 text-sm"
              title="Previous week"
            >
              &larr;
            </button>
            <span className="text-xs text-gray-500 min-w-[120px] text-center">
              {(() => {
                const weekDates = getWeekDates(referenceDate, weekStartDay);
                return `${weekDates[0].toFormat("MMM d")} – ${weekDates[6].toFormat("MMM d, yyyy")}`;
              })()}
            </span>
            <button
              onClick={handleWeekForward}
              disabled={!canGoForward()}
              className="text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-gray-100 text-sm"
              title="Next week"
            >
              &rarr;
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {/* The Grid */}
        <WeeklyGrid
          schedule={schedule}
          profileId={profile?._id ?? null}
          userTimezone={timezone}
          weekStartDay={weekStartDay}
          selectMode={selectMode}
          allowMode={allowMode}
          weekOffset={weekOffset}
          canInteract={canInteract}
          isCreator={!!isCreator}
          creatorMode={creatorMode}
          onCellChange={handleCellChange}
          onBatchChange={handleBatchChange}
          onCreatorSlotChange={handleCreatorSlotChange}
        />
      </main>
    </div>
  );
}
