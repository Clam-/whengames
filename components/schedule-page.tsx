"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TIME_ROWS } from "@/lib/constants";
import {
  cellKeyForInstant,
  coerceTimezone,
  minuteToLabel,
  projectWeeklySlotIntoRange,
  visibleWeekFromAnchor,
  weekdayFromTemporal,
  zonedDateTimeForMinute
} from "@/lib/time";
import type { PublicUser, SlotState } from "@/lib/types";
import { useViewer } from "@/components/providers";

type SelectionMode = "availability" | "selected";

type AvailabilityEntry = {
  ownerUserId: Id<"users">;
  scope: "oneOff" | "weekly" | "exception";
  state: SlotState;
  timezone: string;
  weekday?: number;
  minuteOfDay: number;
  dateKey?: string;
  slotStartMs?: number;
};

type SelectedSlotEntry = {
  scope: "oneOff" | "weekly";
  weekday?: number;
  minuteOfDay: number;
  dateKey?: string;
  slotStartMs?: number;
};

type ScheduleData = {
  schedule: {
    _id: Id<"schedules">;
    title: string;
    description?: string;
    kind: "oneOff" | "weekly";
    timezone: string;
    dateRangeStartMs?: number;
    dateRangeEndMs?: number;
  };
  creatorId: Id<"users"> | null;
  users: PublicUser[];
  availability: AvailabilityEntry[];
  selectedSlots: SelectedSlotEntry[];
};

const STATE_ORDER: SlotState[] = ["blank", "can", "maybe", "cant"];

const cycleState = (state: SlotState) => STATE_ORDER[(STATE_ORDER.indexOf(state) + 1) % STATE_ORDER.length];

const stateLabel = {
  blank: "Blank",
  can: "Can do",
  maybe: "Maybe",
  cant: "Can't do"
};

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

export function SchedulePage({ slug }: { slug: string }) {
  const { user, refresh } = useViewer();
  const scheduleData = useQuery(api.schedules.getScheduleBySlug, { slug }) as ScheduleData | null | undefined;
  const saveViewerSettings = useMutation(api.users.saveViewerSettings);
  const setAvailabilityBulk = useMutation(api.schedules.setAvailabilityBulk);
  const syncSelectedSlots = useMutation(api.schedules.syncSelectedSlots);

  const viewerTimezone = coerceTimezone(user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const weekStartsOn = user?.weekStartsOn ?? 0;
  const today = Temporal.Now.instant().toZonedDateTimeISO(viewerTimezone).toPlainDate();
  const currentWeekAnchor = visibleWeekFromAnchor(undefined, viewerTimezone, weekStartsOn)[0].toString();

  const [anchorDate, setAnchorDate] = useState(currentWeekAnchor);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("availability");
  const [pendingName, setPendingName] = useState(user?.displayName ?? "");
  const [nameError, setNameError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    mode: SelectionMode;
    targetState?: SlotState;
    toggleSelected?: boolean;
    applied: Set<string>;
    startedAt?: string;
  }>({
    active: false,
    moved: false,
    mode: "availability",
    applied: new Set()
  });

  const visibleWeek = useMemo(
    () => visibleWeekFromAnchor(anchorDate, viewerTimezone, weekStartsOn),
    [anchorDate, viewerTimezone, weekStartsOn]
  );
  const weekStartDate = visibleWeek[0];
  const weekStartMs = zonedDateTimeForMinute(weekStartDate, 0, viewerTimezone).epochMilliseconds;
  const weekEndMs = zonedDateTimeForMinute(visibleWeek[6].add({ days: 1 }), 0, viewerTimezone).epochMilliseconds;
  const currentTime = Temporal.Now.instant().toZonedDateTimeISO(viewerTimezone);
  const currentCellKey = `${currentTime.toPlainDate().toString()}_${currentTime.hour * 60 + Math.floor(currentTime.minute / 30) * 30}`;

  const built = useMemo(() => {
    if (!scheduleData) {
      return null;
    }

    const usersById = new Map(scheduleData.users.map((entry) => [entry._id, entry]));
    const entriesByCell = new Map<string, { can: typeof scheduleData.users; maybe: typeof scheduleData.users; cant: typeof scheduleData.users }>();
    const viewerStateByCell = new Map<string, SlotState>();
    const selectedCells = new Set<string>();

    const putUser = (cellKey: string, ownerUserId: PublicUser["_id"], state: SlotState) => {
      if (state === "blank") {
        return;
      }
      const owner = usersById.get(ownerUserId);
      if (!owner) {
        return;
      }
      const bucket = entriesByCell.get(cellKey) ?? { can: [], maybe: [], cant: [] };
      if (state === "can" || state === "maybe" || state === "cant") {
        bucket[state].push(owner);
      }
      entriesByCell.set(cellKey, bucket);
      if (ownerUserId === user?._id) {
        viewerStateByCell.set(cellKey, state);
      }
    };

    if (scheduleData.schedule.kind === "oneOff") {
      for (const entry of scheduleData.availability.filter((row) => row.scope === "oneOff" && typeof row.slotStartMs === "number")) {
        const cellKey = cellKeyForInstant(entry.slotStartMs!, viewerTimezone);
        putUser(cellKey, entry.ownerUserId, entry.state);
      }
      for (const row of scheduleData.selectedSlots.filter((entry) => entry.scope === "oneOff" && typeof entry.slotStartMs === "number")) {
        selectedCells.add(cellKeyForInstant(row.slotStartMs!, viewerTimezone));
      }
    } else {
      const exceptionMap = new Map<string, (typeof scheduleData.availability)[number]>();
      const consumed = new Set<string>();

      for (const entry of scheduleData.availability.filter((row) => row.scope === "exception" && row.dateKey)) {
        const instantMs = zonedDateTimeForMinute(
          Temporal.PlainDate.from(entry.dateKey!),
          entry.minuteOfDay,
          entry.timezone
        ).epochMilliseconds;
        if (instantMs >= weekStartMs && instantMs < weekEndMs) {
          exceptionMap.set(`${entry.ownerUserId}_${instantMs}`, entry);
        }
      }

      for (const entry of scheduleData.availability.filter((row) => row.scope === "weekly")) {
        const instantMs = projectWeeklySlotIntoRange({
          weekStartMs,
          timezone: viewerTimezone,
          sourceTimezone: entry.timezone,
          weekday: entry.weekday ?? 0,
          minuteOfDay: entry.minuteOfDay
        });
        if (instantMs == null) {
          continue;
        }
        const key = `${entry.ownerUserId}_${instantMs}`;
        const override = exceptionMap.get(key);
        if (override) {
          consumed.add(key);
          putUser(cellKeyForInstant(instantMs, viewerTimezone), override.ownerUserId, override.state);
        } else {
          putUser(cellKeyForInstant(instantMs, viewerTimezone), entry.ownerUserId, entry.state);
        }
      }

      for (const [key, entry] of exceptionMap.entries()) {
        if (consumed.has(key)) {
          continue;
        }
        const instantMs = zonedDateTimeForMinute(
          Temporal.PlainDate.from(entry.dateKey!),
          entry.minuteOfDay,
          entry.timezone
        ).epochMilliseconds;
        putUser(cellKeyForInstant(instantMs, viewerTimezone), entry.ownerUserId, entry.state);
      }

      for (const row of scheduleData.selectedSlots) {
        if (row.scope === "weekly") {
          const instantMs = projectWeeklySlotIntoRange({
            weekStartMs,
            timezone: viewerTimezone,
            sourceTimezone: scheduleData.schedule.timezone,
            weekday: row.weekday ?? 0,
            minuteOfDay: row.minuteOfDay
          });
          if (instantMs != null) {
            selectedCells.add(cellKeyForInstant(instantMs, viewerTimezone));
          }
        } else if (typeof row.slotStartMs === "number" && row.slotStartMs >= weekStartMs && row.slotStartMs < weekEndMs) {
          selectedCells.add(cellKeyForInstant(row.slotStartMs, viewerTimezone));
        }
      }
    }

    return { entriesByCell, viewerStateByCell, selectedCells };
  }, [scheduleData, user?._id, viewerTimezone, weekEndMs, weekStartMs]);

  useEffect(() => {
    setPendingName(user?.displayName ?? "");
  }, [user?.displayName]);

  if (!scheduleData || !built) {
    return <main className="page-shell"><section className="surface create-panel">Loading schedule...</section></main>;
  }

  const creator = scheduleData.creatorId === user?._id;
  const isBaseWeek = scheduleData.schedule.kind === "weekly" && weekStartDate.toString() === currentWeekAnchor;
  const currentScope = scheduleData.schedule.kind === "oneOff"
    ? "oneOff"
    : isBaseWeek
      ? "weekly"
      : "exception";
  const selectedScope = scheduleData.schedule.kind === "weekly" && !isBaseWeek ? "oneOff" : scheduleData.schedule.kind;
  const nameRequired = user?.kind === "anonymous" && !user.displayName.trim();

  const validatePendingName = () => {
    if (pendingName.trim()) {
      setNameError("");
      if (nameInputRef.current) {
        nameInputRef.current.setCustomValidity("");
      }
      return true;
    }

    const message = "Display name is required before editing availability.";
    setNameError(message);
    if (nameInputRef.current) {
      nameInputRef.current.setCustomValidity(message);
      nameInputRef.current.reportValidity();
      nameInputRef.current.focus();
    }
    return false;
  };

  const persistName = async () => {
    if (!user?._id || !validatePendingName()) {
      return;
    }
    await saveViewerSettings({
      userId: user._id,
      displayName: pendingName,
      timezone: user.timezone,
      weekStartsOn: user.weekStartsOn,
      dstNotifications: user.dstNotifications
    });
    await refresh();
  };

  const disabledCell = (instantMs: number) =>
    scheduleData.schedule.kind === "oneOff" &&
    ((scheduleData.schedule.dateRangeStartMs != null && instantMs < scheduleData.schedule.dateRangeStartMs) ||
      (scheduleData.schedule.dateRangeEndMs != null && instantMs >= scheduleData.schedule.dateRangeEndMs));

  const availabilityEditingBlocked = !user?._id || nameRequired;

  const applyAvailability = async (targets: Array<{ dateKey: string; minuteOfDay: number; instantMs: number }>, state: SlotState) => {
    if (availabilityEditingBlocked) {
      return;
    }
    await setAvailabilityBulk({
      entries: targets
        .filter((target) => !disabledCell(target.instantMs))
        .map((target) => ({
          scheduleId: scheduleData.schedule._id,
          ownerUserId: user._id,
          scope: currentScope,
          state,
          timezone: user.timezone,
          weekday: currentScope === "weekly"
            ? weekdayFromTemporal(Temporal.PlainDate.from(target.dateKey).dayOfWeek)
            : undefined,
          minuteOfDay: target.minuteOfDay,
          dateKey: currentScope === "exception" ? target.dateKey : undefined,
          slotStartMs: currentScope === "oneOff" ? target.instantMs : undefined
        }))
    });
  };

  const syncSelected = async (targets: Array<{ dateKey: string; minuteOfDay: number; instantMs: number }>, select: boolean) => {
    if (!creator || !user?._id) {
      return;
    }
    await syncSelectedSlots({
      scheduleId: scheduleData.schedule._id,
      actorUserId: user._id,
      upserts: select
        ? targets.map((target) => ({
            scope: selectedScope as "oneOff" | "weekly",
            weekday: selectedScope === "weekly"
              ? weekdayFromTemporal(Temporal.PlainDate.from(target.dateKey).dayOfWeek)
              : undefined,
            minuteOfDay: target.minuteOfDay,
            dateKey: selectedScope === "oneOff" ? target.dateKey : undefined,
            slotStartMs: selectedScope === "oneOff" ? target.instantMs : undefined
          }))
        : [],
      removals: select
        ? []
        : targets.map((target) => ({
            scope: selectedScope as "oneOff" | "weekly",
            weekday: selectedScope === "weekly"
              ? weekdayFromTemporal(Temporal.PlainDate.from(target.dateKey).dayOfWeek)
              : undefined,
            minuteOfDay: target.minuteOfDay,
            dateKey: selectedScope === "oneOff" ? target.dateKey : undefined,
            slotStartMs: selectedScope === "oneOff" ? target.instantMs : undefined
          }))
    });
  };

  const finishDrag = async (cell: { key: string; dateKey: string; minuteOfDay: number; instantMs: number }) => {
    const drag = dragRef.current;
    if (!drag.active) {
      return;
    }
    const targets = Array.from(drag.applied).map((key) => {
      const [dateKey, minute] = key.split("_");
      const minuteOfDay = Number(minute);
      const instantMs = zonedDateTimeForMinute(Temporal.PlainDate.from(dateKey), minuteOfDay, viewerTimezone).epochMilliseconds;
      return { dateKey, minuteOfDay, instantMs };
    });

    drag.active = false;
    if (drag.mode === "selected") {
      const payload = targets.length
        ? targets
        : [{ dateKey: cell.dateKey, minuteOfDay: cell.minuteOfDay, instantMs: cell.instantMs }];
      await syncSelected(payload, drag.toggleSelected ?? true);
      drag.applied = new Set();
      return;
    }

    if (!drag.moved) {
      await applyAvailability(
        [{ dateKey: cell.dateKey, minuteOfDay: cell.minuteOfDay, instantMs: cell.instantMs }],
        cycleState(built.viewerStateByCell.get(cell.key) ?? "blank")
      );
      drag.applied = new Set();
      return;
    }

    if (!drag.applied.has(cell.key)) {
      drag.applied.add(cell.key);
    }
    await applyAvailability(targets, drag.targetState ?? "can");
    drag.applied = new Set();
  };

  const onCellPointerDown = (
    cell: { key: string; dateKey: string; minuteOfDay: number; instantMs: number },
    currentlySelected: boolean
  ) => {
    if (disabledCell(cell.instantMs)) {
      return;
    }
    if (selectionMode === "availability" && availabilityEditingBlocked) {
      if (nameRequired) {
        validatePendingName();
      }
      return;
    }
    if (selectionMode === "selected") {
      dragRef.current = {
        active: true,
        moved: false,
        mode: "selected",
        toggleSelected: !currentlySelected,
        applied: new Set([cell.key]),
        startedAt: cell.key
      };
      return;
    }
    const state = built.viewerStateByCell.get(cell.key) ?? "blank";
    dragRef.current = {
      active: true,
      moved: false,
      mode: "availability",
      targetState: state === "blank" ? "can" : state,
      applied: new Set([cell.key]),
      startedAt: cell.key
    };
  };

  const onCellEnter = (cellKey: string) => {
    if (!dragRef.current.active) {
      return;
    }
    dragRef.current.moved = true;
    dragRef.current.applied.add(cellKey);
  };

  return (
    <main className="page-shell">
      <section className="surface schedule-header">
        <div className="section-header">
          <div>
            <div className="eyebrow">{scheduleData.schedule.kind === "weekly" ? "Weekly schedule" : "One-off schedule"}</div>
            <h1 className="display">{scheduleData.schedule.title}</h1>
            <p className="muted">
              {scheduleData.schedule.description || "No description yet."} Timezone anchor:{" "}
              {scheduleData.schedule.timezone}.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/">
              Home
            </Link>
            <a className="button" href={`/api/auth/workos/login?returnTo=/schedules/${slug}`}>
              Login
            </a>
            <Link className="button ghost" href="/settings">
              Account
            </Link>
          </div>
        </div>

        {user?.kind === "anonymous" ? (
          <div className="anon-banner">
            <div className="stack">
              <div>
                <label className="label">Display name</label>
                <input
                  ref={nameInputRef}
                  className={clsx("field", nameError && "is-invalid")}
                  value={pendingName}
                  placeholder="Required before grid edits"
                  required
                  onChange={(event) => {
                    setPendingName(event.target.value);
                    if (event.target.value.trim()) {
                      setNameError("");
                      event.target.setCustomValidity("");
                    }
                  }}
                />
                {nameError ? <div className="input-error">{nameError}</div> : null}
              </div>
              <div className="button-row">
                <button className="button primary" onClick={() => void persistName()}>
                  Save name
                </button>
                <a className="button" href={`/api/auth/workos/login?returnTo=/schedules/${slug}`}>
                  Login for DST notices
                </a>
              </div>
            </div>
            <div className="muted">
              Anonymous entries are stored in your cookie session and merge into the logged-in account
              after login.
            </div>
          </div>
        ) : null}

        <div className="toolbar">
          <div className="button-row">
            {scheduleData.schedule.kind === "weekly" ? (
              <>
                <button
                  className="button"
                  onClick={() =>
                    setAnchorDate(weekStartDate.subtract({ days: 7 }).toString())
                  }
                >
                  Previous week
                </button>
                <button
                  className="button"
                  onClick={() => setAnchorDate(weekStartDate.add({ days: 7 }).toString())}
                >
                  Next week
                </button>
              </>
            ) : null}
            <button className="button" onClick={() => setAnchorDate(currentWeekAnchor)}>
              This week
            </button>
          </div>
          <div className="button-row">
            <button
              className={clsx("button", selectionMode === "availability" && "primary")}
              onClick={() => setSelectionMode("availability")}
            >
              Edit availability
            </button>
            {creator ? (
              <button
                className={clsx("button", selectionMode === "selected" && "primary")}
                onClick={() => setSelectionMode("selected")}
              >
                Mark selected times
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="surface grid-panel">
        <div className="grid-caption">
          <div>
            Viewing in <strong>{viewerTimezone}</strong>. Editing{" "}
            <strong>
              {currentScope === "weekly"
                ? "base weekly availability"
                : currentScope === "exception"
                  ? "one-off weekly exceptions"
                  : "one-off fixed slots"}
            </strong>.
            {selectionMode === "availability" && availabilityEditingBlocked ? (
              <>
                {" "}Save a display name before editing availability.
              </>
            ) : null}
          </div>
          <div className="legend">
            <span className="legend-chip can">Can do</span>
            <span className="legend-chip maybe">Maybe</span>
            <span className="legend-chip cant">Can&apos;t do</span>
            <span className="legend-chip selected">Selected</span>
          </div>
        </div>
        <div className="schedule-grid-wrapper">
          <div className="schedule-grid">
            <div className="time-col sticky-cell" />
            {visibleWeek.map((date) => {
              const isToday = date.equals(today);
              return (
                <div key={date.toString()} className={clsx("day-header", isToday && "is-today")}>
                  <strong>{date.toLocaleString("en-AU", { weekday: "short" })}</strong>
                  <span>{date.month}/{date.day}</span>
                </div>
              );
            })}

            {TIME_ROWS.map((minuteOfDay) => (
              <GridRow
                key={minuteOfDay}
                minuteOfDay={minuteOfDay}
                visibleWeek={visibleWeek}
                viewerTimezone={viewerTimezone}
                built={built}
                currentCellKey={currentCellKey}
                disabledCell={(instantMs) =>
                  disabledCell(instantMs) || (selectionMode === "availability" && availabilityEditingBlocked)
                }
                onCellPointerDown={onCellPointerDown}
                onCellEnter={onCellEnter}
                onCellPointerUp={finishDrag}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function GridRow(props: {
  minuteOfDay: number;
  visibleWeek: Temporal.PlainDate[];
  viewerTimezone: string;
  built: {
    entriesByCell: Map<string, { can: Array<{ _id: string; displayName: string; avatarUrl?: string }>; maybe: Array<{ _id: string; displayName: string; avatarUrl?: string }>; cant: Array<{ _id: string; displayName: string; avatarUrl?: string }> }>;
    viewerStateByCell: Map<string, SlotState>;
    selectedCells: Set<string>;
  };
  currentCellKey: string;
  disabledCell: (instantMs: number) => boolean;
  onCellPointerDown: (
    cell: { key: string; dateKey: string; minuteOfDay: number; instantMs: number },
    currentlySelected: boolean
  ) => void;
  onCellEnter: (cellKey: string) => void;
  onCellPointerUp: (cell: { key: string; dateKey: string; minuteOfDay: number; instantMs: number }) => Promise<void>;
}) {
  return (
    <>
      <div className="time-col sticky-cell">{minuteToLabel(props.minuteOfDay)}</div>
      {props.visibleWeek.map((date) => {
        const instantMs = zonedDateTimeForMinute(date, props.minuteOfDay, props.viewerTimezone).epochMilliseconds;
        const key = `${date.toString()}_${props.minuteOfDay}`;
        const groups = props.built.entriesByCell.get(key) ?? { can: [], maybe: [], cant: [] };
        const selected = props.built.selectedCells.has(key);
        const disabled = props.disabledCell(instantMs);
        const ownState = props.built.viewerStateByCell.get(key) ?? "blank";
        return (
          <button
            key={key}
            className={clsx(
              "grid-cell",
              `state-${ownState}`,
              selected && "is-selected",
              props.currentCellKey === key && "is-now",
              disabled && "is-disabled"
            )}
            disabled={disabled}
            onPointerDown={() =>
              props.onCellPointerDown(
                { key, dateKey: date.toString(), minuteOfDay: props.minuteOfDay, instantMs },
                selected
              )
            }
            onPointerEnter={() => props.onCellEnter(key)}
            onPointerUp={() =>
              void props.onCellPointerUp({
                key,
                dateKey: date.toString(),
                minuteOfDay: props.minuteOfDay,
                instantMs
              })
            }
          >
            <CellGroup className="can" users={groups.can} />
            <CellGroup className="maybe" users={groups.maybe} />
            <CellGroup className="cant" users={groups.cant} />
          </button>
        );
      })}
    </>
  );
}

function CellGroup(props: {
  className: "can" | "maybe" | "cant";
  users: Array<{ _id: string; displayName: string; avatarUrl?: string }>;
}) {
  if (!props.users.length) {
    return null;
  }
  return (
    <div className={clsx("cell-group", props.className)}>
      {props.users.slice(0, 6).map((user) => (
        <div key={user._id} className="avatar-dot" title={user.displayName}>
          {user.avatarUrl ? <img alt={user.displayName} src={user.avatarUrl} /> : initials(user.displayName)}
        </div>
      ))}
    </div>
  );
}
