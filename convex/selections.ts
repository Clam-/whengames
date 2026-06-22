import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

const DEFAULT_DISCORD_DEBOUNCE_MS = 5 * 60 * 1000;

function getDiscordDebounceMs(): number {
  const raw = process.env.DISCORD_DEBOUNCE_MS;
  if (!raw) return DEFAULT_DISCORD_DEBOUNCE_MS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DISCORD_DEBOUNCE_MS;
}

/**
 * Inline change-detection: if this schedule has any linked Discord
 * channels AND the affected cells overlap with locked slots, queue
 * (or re-queue) a debounced update. Cheap when there are no links.
 */
async function notifyDiscordIfLockedImpacted(
  ctx: MutationCtx,
  scheduleId: Id<"schedules">,
  affectedCells: { dayKey: string; timeSlot: string }[]
) {
  const links = await ctx.db
    .query("scheduleDiscordLinks")
    .withIndex("by_schedule", (q) => q.eq("scheduleId", scheduleId))
    .collect();
  if (links.length === 0) return;

  const schedule = await ctx.db.get(scheduleId);
  if (!schedule) return;
  const locked = schedule.lockedSlots ?? [];
  if (locked.length === 0) return;

  const lockedSet = new Set(locked.map((s) => `${s.dayKey}|${s.timeSlot}`));
  const anyOverlap = affectedCells.some((c) =>
    lockedSet.has(`${c.dayKey}|${c.timeSlot}`)
  );
  if (!anyOverlap) return;

  const debounceMs = getDiscordDebounceMs();
  for (const link of links) {
    if (link.pendingScheduledId) {
      try {
        await ctx.scheduler.cancel(link.pendingScheduledId);
      } catch {
        // already fired
      }
    }
    const newId = await ctx.scheduler.runAfter(
      debounceMs,
      internal.discord.sendDebouncedUpdate,
      { linkId: link._id }
    );
    await ctx.db.patch(link._id, { pendingScheduledId: newId });
  }
}

// Helper: check if a profile is blocked from a schedule
async function isProfileBlocked(
  ctx: MutationCtx,
  scheduleId: Id<"schedules">,
  profileId: Id<"userProfiles">
): Promise<boolean> {
  const blocked = await ctx.db
    .query("blockedProfiles")
    .withIndex("by_schedule_profile", (q) =>
      q.eq("scheduleId", scheduleId).eq("profileId", profileId)
    )
    .unique();
  return blocked !== null;
}

type SelectionAccess = {
  schedule: Doc<"schedules">;
  actorProfileId: Id<"userProfiles">;
  targetProfileId: Id<"userProfiles">;
  actorIsCreator: boolean;
};

async function getActorProfileId(
  ctx: MutationCtx,
  anonymousId: string | undefined
): Promise<Id<"userProfiles"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    const authProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_authUserId", (q) =>
        q.eq("authUserId", identity.tokenIdentifier)
      )
      .unique();
    return authProfile?._id ?? null;
  }

  if (!anonymousId) return null;
  const anonymousProfile = await ctx.db
    .query("userProfiles")
    .withIndex("by_anonymousId", (q) => q.eq("anonymousId", anonymousId))
    .unique();
  if (!anonymousProfile || anonymousProfile.authUserId) return null;
  return anonymousProfile._id;
}

async function getSelectionAccess(
  ctx: MutationCtx,
  scheduleId: Id<"schedules">,
  targetProfileId: Id<"userProfiles">,
  anonymousId: string | undefined
): Promise<SelectionAccess | null> {
  const [schedule, targetProfile, actorProfileId] = await Promise.all([
    ctx.db.get(scheduleId),
    ctx.db.get(targetProfileId),
    getActorProfileId(ctx, anonymousId),
  ]);
  if (!schedule || !targetProfile || !actorProfileId) return null;

  const actorIsCreator = schedule.creatorProfileId === actorProfileId;
  if (actorProfileId !== targetProfileId && !actorIsCreator) return null;

  return {
    schedule,
    actorProfileId,
    targetProfileId,
    actorIsCreator,
  };
}

// Helper: check if participation is closed and actor is not creator
async function isParticipationDenied(
  ctx: MutationCtx,
  scheduleId: Id<"schedules">,
  profileId: Id<"userProfiles">,
  actorIsCreator: boolean
): Promise<boolean> {
  const schedule = await ctx.db.get(scheduleId);
  if (!schedule) return true;

  // Creator is always allowed (either as themselves or acting on behalf).
  if (schedule.creatorProfileId === profileId || actorIsCreator) return false;

  // Check if participation is closed
  if (schedule.acceptParticipation === false) return true;

  // Check if profile is blocked
  return await isProfileBlocked(ctx, scheduleId, profileId);
}

// Helper: check if a slot is in the schedule's disallowed list
function isSlotDisallowed(
  disallowedSlots: { dayKey: string; timeSlot: string }[] | undefined,
  dayKey: string,
  timeSlot: string
): boolean {
  if (!disallowedSlots) return false;
  return disallowedSlots.some(
    (s) => s.dayKey === dayKey && s.timeSlot === timeSlot
  );
}

// Helper: check if this profile has a linked availability for this schedule
async function getAvailabilityLink(
  ctx: MutationCtx,
  scheduleId: Id<"schedules">,
  profileId: Id<"userProfiles">
) {
  return await ctx.db
    .query("availabilityLinks")
    .withIndex("by_schedule_profile", (q) =>
      q.eq("scheduleId", scheduleId).eq("profileId", profileId)
    )
    .unique();
}

// Helper: update a slot in a saved availability
async function updateSavedAvailabilitySlot(
  ctx: MutationCtx,
  savedAvailabilityId: Id<"savedAvailabilities">,
  dayKey: string,
  timeSlot: string,
  state: "can-do" | "cant-do" | "maybe",
  timezone: string
) {
  const savedAvail = await ctx.db.get(savedAvailabilityId);
  if (!savedAvail) return;

  const newSlots = savedAvail.slots.filter(
    (s) => !(s.dayKey === dayKey && s.timeSlot === timeSlot)
  );
  newSlots.push({ dayKey, timeSlot, state });
  await ctx.db.patch(savedAvailabilityId, { slots: newSlots, timezone });
}

// Helper: remove a slot from a saved availability
async function removeSavedAvailabilitySlot(
  ctx: MutationCtx,
  savedAvailabilityId: Id<"savedAvailabilities">,
  dayKey: string,
  timeSlot: string
) {
  const savedAvail = await ctx.db.get(savedAvailabilityId);
  if (!savedAvail) return;

  const newSlots = savedAvail.slots.filter(
    (s) => !(s.dayKey === dayKey && s.timeSlot === timeSlot)
  );
  await ctx.db.patch(savedAvailabilityId, { slots: newSlots });
}

// Set a single cell selection
export const set = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
    dayKey: v.string(),
    timeSlot: v.string(),
    timezone: v.string(),
    state: v.union(
      v.literal("can-do"),
      v.literal("cant-do"),
      v.literal("maybe")
    ),
    isException: v.optional(v.boolean()),
    exceptionDate: v.optional(v.string()),
    anonymousId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await getSelectionAccess(
      ctx,
      args.scheduleId,
      args.profileId,
      args.anonymousId
    );
    if (!access) return null;

    // Guard: reject if participation denied (closed or blocked)
    if (await isParticipationDenied(ctx, args.scheduleId, args.profileId, access.actorIsCreator)) {
      return null;
    }

    // Guard: reject nominations on disallowed cells (creator auto-allows)
    const schedule = access.schedule;
    if (
      schedule &&
      isSlotDisallowed(schedule.disallowedSlots, args.dayKey, args.timeSlot)
    ) {
      if (access.actorIsCreator) {
        await ctx.db.patch(args.scheduleId, {
          disallowedSlots: (schedule.disallowedSlots || []).filter(
            (s) => !(s.dayKey === args.dayKey && s.timeSlot === args.timeSlot)
          ),
        });
      } else {
        return null;
      }
    }

    // Guard: reject changes outside one-off schedule date range
    if (schedule && schedule.type === "one-off") {
      if (
        schedule.dateRangeStart &&
        schedule.dateRangeEnd &&
        (args.dayKey < schedule.dateRangeStart || args.dayKey > schedule.dateRangeEnd)
      ) {
        return null;
      }
    }

    // Check for linked availability (only for non-exception changes)
    if (!args.isException) {
      const link = await getAvailabilityLink(
        ctx,
        args.scheduleId,
        args.profileId
      );
      if (link) {
        await updateSavedAvailabilitySlot(
          ctx,
          link.savedAvailabilityId,
          args.dayKey,
          args.timeSlot,
          args.state,
          args.timezone
        );
        await notifyDiscordIfLockedImpacted(ctx, args.scheduleId, [
          { dayKey: args.dayKey, timeSlot: args.timeSlot },
        ]);
        return null;
      }
    }

    // Find existing selection(s) for this cell
    const existing = await ctx.db
      .query("selections")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("dayKey"), args.dayKey),
          q.eq(q.field("timeSlot"), args.timeSlot),
          args.isException
            ? q.eq(q.field("isException"), true)
            : q.neq(q.field("isException"), true),
          args.exceptionDate
            ? q.eq(q.field("exceptionDate"), args.exceptionDate)
            : q.eq(q.field("exceptionDate"), undefined)
        )
      )
      .take(10);

    // Create override if overwriting a calendar-synced selection
    for (const sel of existing) {
      if (sel.source === "calendar" && sel.externalEventId) {
        const overrideExists = await ctx.db
          .query("calendarOverrides")
          .withIndex("by_profile_schedule", (q) =>
            q.eq("profileId", args.profileId).eq("scheduleId", args.scheduleId)
          )
          .filter((q) =>
            q.and(
              q.eq(q.field("externalEventId"), sel.externalEventId!),
              q.eq(q.field("dayKey"), args.dayKey),
              q.eq(q.field("timeSlot"), args.timeSlot)
            )
          )
          .first();
        if (!overrideExists) {
          await ctx.db.insert("calendarOverrides", {
            profileId: args.profileId,
            scheduleId: args.scheduleId,
            externalEventId: sel.externalEventId,
            dayKey: args.dayKey,
            timeSlot: args.timeSlot,
          });
        }
      }
    }

    let resultId: Id<"selections">;
    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, {
        state: args.state,
        timezone: args.timezone,
        source: "manual",
        externalEventId: undefined,
      });
      for (let i = 1; i < existing.length; i++) {
        await ctx.db.delete(existing[i]._id);
      }
      resultId = existing[0]._id;
    } else {
      resultId = await ctx.db.insert("selections", {
        scheduleId: args.scheduleId,
        profileId: args.profileId,
        dayKey: args.dayKey,
        timeSlot: args.timeSlot,
        timezone: args.timezone,
        state: args.state,
        isException: args.isException,
        exceptionDate: args.exceptionDate,
      });
    }

    await notifyDiscordIfLockedImpacted(ctx, args.scheduleId, [
      { dayKey: args.dayKey, timeSlot: args.timeSlot },
    ]);
    return resultId;
  },
});

// Remove a selection (set to blank)
export const remove = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
    dayKey: v.string(),
    timeSlot: v.string(),
    isException: v.optional(v.boolean()),
    exceptionDate: v.optional(v.string()),
    anonymousId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await getSelectionAccess(
      ctx,
      args.scheduleId,
      args.profileId,
      args.anonymousId
    );
    if (!access) return;

    // Guard: reject if participation denied (closed or blocked)
    if (await isParticipationDenied(ctx, args.scheduleId, args.profileId, access.actorIsCreator)) {
      return;
    }

    // Guard: reject changes on disallowed cells (skip for creator)
    const schedule = access.schedule;
    if (
      schedule &&
      isSlotDisallowed(schedule.disallowedSlots, args.dayKey, args.timeSlot)
    ) {
      if (!access.actorIsCreator) {
        return;
      }
    }

    // Guard: reject changes outside one-off schedule date range
    if (schedule && schedule.type === "one-off") {
      if (
        schedule.dateRangeStart &&
        schedule.dateRangeEnd &&
        (args.dayKey < schedule.dateRangeStart || args.dayKey > schedule.dateRangeEnd)
      ) {
        return;
      }
    }

    // Check for linked availability (only for non-exception changes)
    if (!args.isException) {
      const link = await getAvailabilityLink(
        ctx,
        args.scheduleId,
        args.profileId
      );
      if (link) {
        await removeSavedAvailabilitySlot(
          ctx,
          link.savedAvailabilityId,
          args.dayKey,
          args.timeSlot
        );
        await notifyDiscordIfLockedImpacted(ctx, args.scheduleId, [
          { dayKey: args.dayKey, timeSlot: args.timeSlot },
        ]);
        return;
      }
    }

    const existing = await ctx.db
      .query("selections")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("dayKey"), args.dayKey),
          q.eq(q.field("timeSlot"), args.timeSlot),
          args.isException
            ? q.eq(q.field("isException"), true)
            : q.neq(q.field("isException"), true),
          args.exceptionDate
            ? q.eq(q.field("exceptionDate"), args.exceptionDate)
            : q.eq(q.field("exceptionDate"), undefined)
        )
      )
      .take(10);

    // Create override if removing a calendar-synced selection
    for (const record of existing) {
      if (record.source === "calendar" && record.externalEventId) {
        const overrideExists = await ctx.db
          .query("calendarOverrides")
          .withIndex("by_profile_schedule", (q) =>
            q.eq("profileId", args.profileId).eq("scheduleId", args.scheduleId)
          )
          .filter((q) =>
            q.and(
              q.eq(q.field("externalEventId"), record.externalEventId!),
              q.eq(q.field("dayKey"), args.dayKey),
              q.eq(q.field("timeSlot"), args.timeSlot)
            )
          )
          .first();
        if (!overrideExists) {
          await ctx.db.insert("calendarOverrides", {
            profileId: args.profileId,
            scheduleId: args.scheduleId,
            externalEventId: record.externalEventId,
            dayKey: args.dayKey,
            timeSlot: args.timeSlot,
          });
        }
      }
    }

    for (const record of existing) {
      await ctx.db.delete(record._id);
    }

    await notifyDiscordIfLockedImpacted(ctx, args.scheduleId, [
      { dayKey: args.dayKey, timeSlot: args.timeSlot },
    ]);
  },
});

// Batch set selections (for drag operations)
export const batchSet = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
    timezone: v.string(),
    selections: v.array(
      v.object({
        dayKey: v.string(),
        timeSlot: v.string(),
        state: v.union(
          v.literal("can-do"),
          v.literal("cant-do"),
          v.literal("maybe"),
          v.literal("blank")
        ),
        isException: v.optional(v.boolean()),
        exceptionDate: v.optional(v.string()),
      })
    ),
    anonymousId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await getSelectionAccess(
      ctx,
      args.scheduleId,
      args.profileId,
      args.anonymousId
    );
    if (!access) return;

    // Guard: reject if participation denied (closed or blocked)
    if (await isParticipationDenied(ctx, args.scheduleId, args.profileId, access.actorIsCreator)) {
      return;
    }

    // Load schedule once to check disallowed slots and date range
    const schedule = access.schedule;
    let disallowed = schedule?.disallowedSlots;

    // Creator bypass: auto-allow disallowed cells being nominated, skip check for all
    if (access.actorIsCreator && disallowed && disallowed.length > 0) {
      const slotsToAllow = args.selections.filter(
        (s) => s.state !== "blank" && isSlotDisallowed(disallowed, s.dayKey, s.timeSlot)
      );
      if (slotsToAllow.length > 0) {
        const allowSet = new Set(
          slotsToAllow.map((s) => `${s.dayKey}|${s.timeSlot}`)
        );
        disallowed = disallowed.filter(
          (s) => !allowSet.has(`${s.dayKey}|${s.timeSlot}`)
        );
        await ctx.db.patch(args.scheduleId, { disallowedSlots: disallowed });
      }
      disallowed = undefined;
    }

    // Helper to check if a dayKey is within one-off schedule date range
    const isInDateRange = (dayKey: string): boolean => {
      if (schedule?.type !== "one-off") return true;
      if (!schedule.dateRangeStart || !schedule.dateRangeEnd) return true;
      return dayKey >= schedule.dateRangeStart && dayKey <= schedule.dateRangeEnd;
    };

    // Check for linked availability
    const link = await getAvailabilityLink(
      ctx,
      args.scheduleId,
      args.profileId
    );

    // If linked, batch update saved availability for non-exception cells
    if (link) {
      const savedAvail = await ctx.db.get(link.savedAvailabilityId);
      if (savedAvail) {
        let slots = [...savedAvail.slots];
        const nonExceptionSels = args.selections.filter(
          (s) => !s.isException && !isSlotDisallowed(disallowed, s.dayKey, s.timeSlot) && isInDateRange(s.dayKey)
        );

        for (const sel of nonExceptionSels) {
          slots = slots.filter(
            (s) => !(s.dayKey === sel.dayKey && s.timeSlot === sel.timeSlot)
          );
          if (sel.state !== "blank") {
            slots.push({
              dayKey: sel.dayKey,
              timeSlot: sel.timeSlot,
              state: sel.state,
            });
          }
        }

        if (nonExceptionSels.length > 0) {
          await ctx.db.patch(link.savedAvailabilityId, {
            slots,
            timezone: args.timezone,
          });
        }
      }

      // Handle exception cells normally (fall through below)
      const exceptionSels = args.selections.filter((s) => s.isException);
      for (const sel of exceptionSels) {
        if (isSlotDisallowed(disallowed, sel.dayKey, sel.timeSlot)) continue;

        const existing = await ctx.db
          .query("selections")
          .withIndex("by_schedule_profile", (q) =>
            q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
          )
          .filter((q) =>
            q.and(
              q.eq(q.field("dayKey"), sel.dayKey),
              q.eq(q.field("timeSlot"), sel.timeSlot),
              q.eq(q.field("isException"), true),
              sel.exceptionDate
                ? q.eq(q.field("exceptionDate"), sel.exceptionDate)
                : q.eq(q.field("exceptionDate"), undefined)
            )
          )
          .take(10);

        if (sel.state === "blank") {
          for (const record of existing) {
            await ctx.db.delete(record._id);
          }
        } else if (existing.length > 0) {
          await ctx.db.patch(existing[0]._id, {
            state: sel.state,
            timezone: args.timezone,
          });
          for (let i = 1; i < existing.length; i++) {
            await ctx.db.delete(existing[i]._id);
          }
        } else {
          await ctx.db.insert("selections", {
            scheduleId: args.scheduleId,
            profileId: args.profileId,
            dayKey: sel.dayKey,
            timeSlot: sel.timeSlot,
            timezone: args.timezone,
            state: sel.state,
            isException: sel.isException,
            exceptionDate: sel.exceptionDate,
          });
        }
      }
      await notifyDiscordIfLockedImpacted(
        ctx,
        args.scheduleId,
        args.selections.map((s) => ({ dayKey: s.dayKey, timeSlot: s.timeSlot }))
      );
      return;
    }

    // Not linked — original behavior
    for (const sel of args.selections) {
      if (isSlotDisallowed(disallowed, sel.dayKey, sel.timeSlot) || !isInDateRange(sel.dayKey)) {
        continue;
      }

      const existing = await ctx.db
        .query("selections")
        .withIndex("by_schedule_profile", (q) =>
          q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("dayKey"), sel.dayKey),
            q.eq(q.field("timeSlot"), sel.timeSlot),
            sel.isException
              ? q.eq(q.field("isException"), true)
              : q.neq(q.field("isException"), true),
            sel.exceptionDate
              ? q.eq(q.field("exceptionDate"), sel.exceptionDate)
              : q.eq(q.field("exceptionDate"), undefined)
          )
        )
        .take(10);

      if (sel.state === "blank") {
        for (const record of existing) {
          await ctx.db.delete(record._id);
        }
      } else if (existing.length > 0) {
        await ctx.db.patch(existing[0]._id, {
          state: sel.state,
          timezone: args.timezone,
        });
        for (let i = 1; i < existing.length; i++) {
          await ctx.db.delete(existing[i]._id);
        }
      } else {
        await ctx.db.insert("selections", {
          scheduleId: args.scheduleId,
          profileId: args.profileId,
          dayKey: sel.dayKey,
          timeSlot: sel.timeSlot,
          timezone: args.timezone,
          state: sel.state,
          isException: sel.isException,
          exceptionDate: sel.exceptionDate,
        });
      }
    }

    await notifyDiscordIfLockedImpacted(
      ctx,
      args.scheduleId,
      args.selections.map((s) => ({ dayKey: s.dayKey, timeSlot: s.timeSlot }))
    );
  },
});

// Clear all selections for a profile on a schedule
// Also unlinks any saved availability (without copying back)
export const clearForProfile = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
    anonymousId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await getSelectionAccess(
      ctx,
      args.scheduleId,
      args.profileId,
      args.anonymousId
    );
    if (!access) return 0;

    // If linked to a saved availability, unlink without copying back
    const link = await getAvailabilityLink(
      ctx,
      args.scheduleId,
      args.profileId
    );
    if (link) {
      await ctx.db.delete(link._id);
    }

    // Fetch in batches and delete
    let deleted = 0;
    while (true) {
      const batch = await ctx.db
        .query("selections")
        .withIndex("by_schedule_profile", (q) =>
          q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
        )
        .take(100);

      if (batch.length === 0) break;

      for (const record of batch) {
        await ctx.db.delete(record._id);
        deleted++;
      }
    }
    return deleted;
  },
});

// Get all selections for a schedule
export const getBySchedule = query({
  args: { scheduleId: v.id("schedules") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("selections")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();
  },
});
