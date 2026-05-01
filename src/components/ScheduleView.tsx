import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Header } from "./Header";
import { WeeklyGrid } from "./WeeklyGrid";
import { DisplayNamePrompt } from "./DisplayNamePrompt";
import { ClearConfirmModal } from "./ClearConfirmModal";
import { AvailabilitiesMenu } from "./AvailabilitiesMenu";
import { ApplyAvailabilityModal } from "./ApplyAvailabilityModal";
import { SaveAvailabilityModal } from "./SaveAvailabilityModal";
import { ManageSavedAvailabilitiesModal } from "./ManageSavedAvailabilitiesModal";
import { EditScheduleModal } from "./EditScheduleModal";
import { ParticipantsMenu } from "./ParticipantsMenu";
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
  const clearDisallowedSlots = useMutation(api.schedules.clearDisallowedSlots);
  const clearLockedSlots = useMutation(api.schedules.clearLockedSlots);
  const clearSelections = useMutation(api.selections.clearForProfile);
  const setAcceptParticipation = useMutation(api.schedules.setAcceptParticipation);
  const removeParticipant = useMutation(api.schedules.removeParticipant);
  const blockParticipant = useMutation(api.schedules.blockParticipant);

  const [selectMode, setSelectMode] = useState<SelectMode>("auto");
  const [allowMode, setAllowMode] = useState<AllowMode>("auto");
  const [creatorMode, setCreatorMode] = useState<CreatorMode>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [hasName, setHasName] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showSaveNewModal, setShowSaveNewModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<Id<"userProfiles"> | null>(null);

  // Saved availabilities (only for SSO users)
  const isSsoUser = profile?.authType === "sso";
  const savedAvailabilities = useQuery(
    api.savedAvailabilities.listForProfile,
    isSsoUser && profile?._id ? { profileId: profile._id } : "skip"
  );

  // Availability link mutations
  const applyToScheduleMut = useMutation(api.savedAvailabilities.applyToSchedule);
  const saveNewAndLinkMut = useMutation(api.savedAvailabilities.saveNewAndLink);
  const saveOverwriteDefaultMut = useMutation(api.savedAvailabilities.saveOverwriteDefaultAndLink);
  const unlinkFromScheduleMut = useMutation(api.savedAvailabilities.unlinkFromSchedule);

  // Derive current link from schedule data
  const profileIdStr = profile?._id ? String(profile._id) : null;
  const currentLink = schedule?.availabilityLinks?.find(
    (l: any) => String(l.profileId) === profileIdStr
  ) ?? null;

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

  // Check if user is blocked from this schedule
  const isBlocked = !isCreator && profile && schedule?.blockedProfileIds?.includes(profile._id as string);

  // Check if participation is closed for non-creators
  const isParticipationClosed = !isCreator && schedule?.acceptParticipation === false;

  // Determine if user can interact with the grid
  const canInteract =
    ((isAuthenticated && !!profile) || (hasInteracted && !!profile) || hasName)
    && !isBlocked
    && !isParticipationClosed;

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

  // The effective profile for selections: either the user being edited or the current user
  const effectiveProfileId = editingProfileId ?? profile?._id ?? null;

  const handleCellChange = useCallback(
    async (
      dayKey: string,
      timeSlot: string,
      state: "can-do" | "cant-do" | "maybe" | "blank",
      isException?: boolean,
      exceptionDate?: string
    ) => {
      if (!effectiveProfileId) return;

      // When creator edits another user, pass callerProfileId for auth bypass
      const callerProfileId = editingProfileId && profile ? profile._id : undefined;

      if (state === "blank") {
        await removeSelectionMut({
          scheduleId: id as Id<"schedules">,
          profileId: effectiveProfileId,
          dayKey,
          timeSlot,
          isException,
          exceptionDate,
          callerProfileId,
        });
      } else {
        await setSelectionMut({
          scheduleId: id as Id<"schedules">,
          profileId: effectiveProfileId,
          dayKey,
          timeSlot,
          timezone,
          state,
          isException,
          exceptionDate,
          callerProfileId,
        });
      }
    },
    [id, effectiveProfileId, editingProfileId, profile, timezone, setSelectionMut, removeSelectionMut]
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
      if (!effectiveProfileId) return;

      // When creator edits another user, pass callerProfileId for auth bypass
      const callerProfileId = editingProfileId && profile ? profile._id : undefined;

      await batchSetMut({
        scheduleId: id as Id<"schedules">,
        profileId: effectiveProfileId,
        timezone,
        selections: cells,
        callerProfileId,
      });
    },
    [id, effectiveProfileId, editingProfileId, profile, timezone, batchSetMut]
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

  // Availability handlers
  const handleApply = useCallback(
    async (savedAvailabilityId: Id<"savedAvailabilities">) => {
      if (!savedAvailabilityId) {
        // Signal to open the modal (multiple availabilities)
        setShowApplyModal(true);
        return;
      }
      if (!profile || !schedule) return;
      await applyToScheduleMut({
        savedAvailabilityId,
        scheduleId: schedule._id,
        profileId: profile._id,
      });
    },
    [profile, schedule, applyToScheduleMut]
  );

  const handleApplyFromModal = useCallback(
    async (savedAvailabilityId: Id<"savedAvailabilities">) => {
      if (!profile || !schedule) return;
      await applyToScheduleMut({
        savedAvailabilityId,
        scheduleId: schedule._id,
        profileId: profile._id,
      });
    },
    [profile, schedule, applyToScheduleMut]
  );

  const handleSaveOverwriteDefault = useCallback(async () => {
    if (!profile || !schedule) return;
    await saveOverwriteDefaultMut({
      scheduleId: schedule._id,
      profileId: profile._id,
      timezone,
    });
  }, [profile, schedule, timezone, saveOverwriteDefaultMut]);

  const handleSaveNew = useCallback(
    async (name: string) => {
      if (!profile || !schedule) return;
      await saveNewAndLinkMut({
        scheduleId: schedule._id,
        profileId: profile._id,
        name,
        timezone,
      });
    },
    [profile, schedule, timezone, saveNewAndLinkMut]
  );

  const handleUnlink = useCallback(async () => {
    if (!profile || !schedule) return;
    await unlinkFromScheduleMut({
      scheduleId: schedule._id,
      profileId: profile._id,
    });
  }, [profile, schedule, unlinkFromScheduleMut]);

  // Participant management handlers (creator only)
  const handleToggleAcceptParticipation = useCallback(
    async (accept: boolean) => {
      if (!schedule) return;
      await setAcceptParticipation({
        scheduleId: schedule._id,
        acceptParticipation: accept,
      });
    },
    [schedule, setAcceptParticipation]
  );

  const handleDeleteParticipant = useCallback(
    async (profileId: Id<"userProfiles">) => {
      if (!schedule) return;
      // If we're currently editing this user, stop
      if (editingProfileId === profileId) {
        setEditingProfileId(null);
      }
      await removeParticipant({
        scheduleId: schedule._id,
        profileId,
      });
    },
    [schedule, editingProfileId, removeParticipant]
  );

  const handleBlockParticipant = useCallback(
    async (profileId: Id<"userProfiles">) => {
      if (!schedule) return;
      // If we're currently editing this user, stop
      if (editingProfileId === profileId) {
        setEditingProfileId(null);
      }
      await blockParticipant({
        scheduleId: schedule._id,
        profileId,
      });
    },
    [schedule, editingProfileId, blockParticipant]
  );

  const handleEditParticipant = useCallback(
    (profileId: Id<"userProfiles">) => {
      setEditingProfileId(profileId);
      // Switch to nominate mode so the creator can make selections
      setCreatorMode("nominate");
    },
    []
  );

  const handleStopEditingParticipant = useCallback(() => {
    setEditingProfileId(null);
  }, []);

  // Clear modal content based on role and creator mode
  const getClearModalContent = () => {
    if (!isCreator) {
      return {
        title: "Clear Nominations",
        message:
          "Are you sure you want to clear all your nominations for this schedule? This cannot be undone.",
      };
    }
    switch (creatorMode) {
      case "limit":
        return {
          title: "Clear Allow/Disallow Settings",
          message:
            "Are you sure you want to clear all allow/disallow time settings? All time slots will become allowed again.",
        };
      case "nominate":
        return {
          title: "Clear Nominations",
          message:
            "Are you sure you want to clear all your nominations for this schedule? This cannot be undone.",
        };
      case "lock":
        return {
          title: "Clear Locked Times",
          message:
            "Are you sure you want to clear all locked-in times? The schedule will be unlocked.",
        };
      default:
        return {
          title: "Clear",
          message: "Are you sure you want to clear?",
        };
    }
  };

  const handleClear = useCallback(async () => {
    if (!profile || !schedule) return;

    if (!isCreator) {
      // Non-creator: clear their own nominations
      await clearSelections({
        scheduleId: schedule._id,
        profileId: profile._id,
      });
    } else {
      // Creator: clear based on current mode
      switch (creatorMode) {
        case "limit":
          await clearDisallowedSlots({ scheduleId: schedule._id });
          break;
        case "nominate":
          await clearSelections({
            scheduleId: schedule._id,
            profileId: profile._id,
          });
          break;
        case "lock":
          await clearLockedSlots({ scheduleId: schedule._id });
          break;
      }
    }
  }, [
    profile,
    schedule,
    isCreator,
    creatorMode,
    clearSelections,
    clearDisallowedSlots,
    clearLockedSlots,
  ]);

  if (!schedule) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
        <Header />
        <div className="text-center py-12 text-gray-400 dark:text-slate-500">
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
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-4">
        {/* Schedule Header */}
        <div className="mb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                {schedule.title}
              </h1>
              {schedule.description && (
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                  {schedule.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    schedule.type === "one-off"
                      ? "bg-green-100 text-green-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                      : "bg-purple-100 text-purple-700 dark:bg-violet-900/40 dark:text-violet-400"
                  }`}
                >
                  {schedule.type === "one-off" ? "One-off" : "Recurring"}
                </span>
                <span className="text-xs text-gray-400 dark:text-slate-500">
                  by {schedule.creatorName}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className="text-xs text-gray-400 dark:text-slate-500">
                My timezone: {timezone}
              </span>
              {isCreator && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:border-slate-500"
                >
                  Edit Schedule
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Editing another user banner */}
        {editingProfileId && (() => {
          const editingUser = (schedule.profiles || []).find(
            (p: any) => p._id === editingProfileId
          );
          return editingUser ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 dark:bg-amber-900/30 dark:border-amber-700">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                You are editing <span className="font-semibold">{editingUser.displayName}</span>&apos;s availability.{" "}
                <button
                  onClick={handleStopEditingParticipant}
                  className="text-amber-900 font-medium underline hover:text-amber-700 dark:text-amber-200 dark:hover:text-amber-100"
                >
                  Stop editing
                </button>
              </p>
            </div>
          ) : null;
        })()}

        {/* Participation closed banner (non-creators) */}
        {!isCreator && schedule.acceptParticipation === false && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 dark:bg-rose-900/30 dark:border-rose-700">
            <p className="text-sm text-red-700 dark:text-rose-300">
              The creator has closed participation for this schedule. You cannot make changes to your availability.
            </p>
          </div>
        )}

        {/* Blocked user banner */}
        {!isCreator && profile && schedule.blockedProfileIds?.includes(profile._id as string) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 dark:bg-rose-900/30 dark:border-rose-700">
            <p className="text-sm text-red-700 dark:text-rose-300">
              You have been blocked from participating in this schedule.
            </p>
          </div>
        )}

        {/* Non-current week banner for recurring schedules */}
        {schedule.type === "recurring" && weekOffset !== 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 dark:bg-amber-900/30 dark:border-amber-700">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Nomination changes made on non-current weeks are one-off exceptions.{" "}
              <button
                onClick={() => setWeekOffset(0)}
                className="text-amber-900 font-medium underline hover:text-amber-700 dark:text-amber-200 dark:hover:text-amber-100"
              >
                Click 'Today'
              </button>{" "}
              to update nominations for recurring weeks.
            </p>
          </div>
        )}

        {/* Anonymous user prompt */}
        {!canInteract && !isAuthenticated && !isBlocked && !isParticipationClosed && (
          <DisplayNamePrompt
            currentName={displayName}
            onSubmit={handleDisplayNameSubmit}
          />
        )}

        {/* Controls bar */}
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          {/* Apply mode / Select mode */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Apply:</label>
            {isCreator && creatorMode === "limit" ? (
              <select
                value={allowMode}
                onChange={(e) => setAllowMode(e.target.value as AllowMode)}
                className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="auto">Auto</option>
                <option value="allow">Allow</option>
                <option value="dont-allow">Don&apos;t Allow</option>
              </select>
            ) : (
              <select
                value={selectMode}
                onChange={(e) => setSelectMode(e.target.value as SelectMode)}
                className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="auto">Auto</option>
                <option value="can-do">Can Do</option>
                <option value="cant-do">Can&apos;t Do</option>
                <option value="maybe">Maybe</option>
              </select>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 text-xs dark:text-slate-300">
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
                    ? "bg-green-100 text-green-700 font-medium dark:bg-emerald-900/40 dark:text-emerald-400"
                    : "text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                Allow/Disallow Time
              </button>
              <button
                onClick={() => setCreatorMode("nominate")}
                className={`text-xs px-2 py-1 rounded ${
                  creatorMode === "nominate"
                    ? "bg-blue-100 text-blue-700 font-medium dark:bg-cyan-900/40 dark:text-cyan-400"
                    : "text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                Nominate Time
              </button>
              <button
                onClick={() => setCreatorMode("lock")}
                className={`text-xs px-2 py-1 rounded ${
                  creatorMode === "lock"
                    ? "bg-purple-100 text-purple-700 font-medium dark:bg-violet-900/40 dark:text-violet-400"
                    : "text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                Lock In Time
              </button>
            </div>
          )}

          {/* Accept Participation toggle (creator only) */}
          {isCreator && schedule && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-400 whitespace-nowrap">
                Accept Participation:
              </label>
              <button
                onClick={() =>
                  handleToggleAcceptParticipation(
                    schedule.acceptParticipation === false
                  )
                }
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                  schedule.acceptParticipation !== false
                    ? "bg-green-500 dark:bg-emerald-500"
                    : "bg-gray-300 dark:bg-slate-600"
                }`}
                title={
                  schedule.acceptParticipation !== false
                    ? "Participation is open. Click to close."
                    : "Participation is closed. Click to open."
                }
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
                    schedule.acceptParticipation !== false
                      ? "translate-x-4.5"
                      : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Participants menu (creator only) */}
          {isCreator && schedule && (() => {
            // Get participants (profiles that have selections, excluding creator)
            const participantProfiles = (schedule.profiles || []).filter(
              (p: any) => p._id !== schedule.creatorProfileId
            );
            return participantProfiles.length > 0 ? (
              <ParticipantsMenu
                participants={participantProfiles}
                availabilityLinks={schedule.availabilityLinks || []}
                editingProfileId={editingProfileId}
                onEditUser={handleEditParticipant}
                onStopEditing={handleStopEditingParticipant}
                onDeleteUser={handleDeleteParticipant}
                onBlockUser={handleBlockParticipant}
              />
            ) : null;
          })()}

          {/* Availabilities menu (SSO users only) */}
          {isSsoUser && profile && canInteract && (
            <AvailabilitiesMenu
              scheduleType={schedule.type}
              weekOffset={weekOffset}
              isSsoUser={!!isSsoUser}
              profileId={profile._id}
              savedAvailabilities={savedAvailabilities ?? []}
              currentLink={currentLink}
              onApply={handleApply}
              onSaveOverwriteDefault={handleSaveOverwriteDefault}
              onSaveNew={() => setShowSaveNewModal(true)}
              onUnlink={handleUnlink}
              onManage={() => setShowManageModal(true)}
            />
          )}

          {/* Clear button */}
          {canInteract && (
            <button
              onClick={() => setShowClearModal(true)}
              className="text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50 border border-red-200 hover:border-red-300 transition-colors dark:text-rose-400 dark:hover:bg-rose-900/40 dark:border-rose-800 dark:hover:border-red-700"
            >
              Clear
            </button>
          )}

          {/* Week navigation */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleWeekBack}
              disabled={!canGoBack()}
              className="text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-gray-100 text-sm dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
              title="Previous week"
            >
              &larr;
            </button>
            <span className="text-xs text-gray-500 dark:text-slate-400 min-w-[120px] text-center">
              {(() => {
                const weekDates = getWeekDates(referenceDate, weekStartDay);
                return `${weekDates[0].toFormat("MMM d")} – ${weekDates[6].toFormat("MMM d, yyyy")}`;
              })()}
            </span>
            <button
              onClick={handleWeekForward}
              disabled={!canGoForward()}
              className="text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-gray-100 text-sm dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
              title="Next week"
            >
              &rarr;
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {/* The Grid */}
        <WeeklyGrid
          schedule={schedule}
          profileId={effectiveProfileId}
          userTimezone={timezone}
          weekStartDay={weekStartDay}
          selectMode={selectMode}
          allowMode={allowMode}
          weekOffset={weekOffset}
          canInteract={canInteract || !!editingProfileId}
          isCreator={!!isCreator}
          creatorMode={editingProfileId ? "nominate" : creatorMode}
          onCellChange={handleCellChange}
          onBatchChange={handleBatchChange}
          onCreatorSlotChange={handleCreatorSlotChange}
        />
      </main>

      {/* Clear confirmation modal */}
      {showClearModal && (() => {
        const { title, message } = getClearModalContent();
        return (
          <ClearConfirmModal
            title={title}
            message={message}
            onConfirm={handleClear}
            onClose={() => setShowClearModal(false)}
          />
        );
      })()}

      {/* Apply availability modal */}
      {showApplyModal && savedAvailabilities && (
        <ApplyAvailabilityModal
          savedAvailabilities={savedAvailabilities}
          onApply={handleApplyFromModal}
          onManage={() => {
            setShowApplyModal(false);
            setShowManageModal(true);
          }}
          onClose={() => setShowApplyModal(false)}
        />
      )}

      {/* Save new availability modal */}
      {showSaveNewModal && (
        <SaveAvailabilityModal
          onSave={handleSaveNew}
          onClose={() => setShowSaveNewModal(false)}
        />
      )}

      {/* Manage saved availabilities modal */}
      {showManageModal && savedAvailabilities && (
        <ManageSavedAvailabilitiesModal
          savedAvailabilities={savedAvailabilities}
          onClose={() => setShowManageModal(false)}
        />
      )}

      {/* Edit schedule modal (creator only) */}
      {showEditModal && schedule && (
        <EditScheduleModal
          schedule={schedule}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
}
