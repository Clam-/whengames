import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Get the JS day-of-week (0=Sunday, 6=Saturday) from an ISO date string.
 * Uses UTC to avoid any local timezone influence — the ISO date string
 * already represents the correct local date for the user.
 */
function getDayOfWeekFromISODate(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDay();
}

// List all schedules (public)
export const list = query({
  args: {},
  handler: async (ctx) => {
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();

    // Filter out private schedules
    const publicSchedules = schedules.filter((s) => !s.isPrivate);

    // Enrich with creator profile info
    const enriched = await Promise.all(
      publicSchedules.map(async (schedule) => {
        const creator = await ctx.db.get(schedule.creatorProfileId);
        // Prefer Convex-stored image over hotlinked Google URL
        const storedImageUrl = creator?.profileImageStorageId
          ? await ctx.storage.getUrl(creator.profileImageStorageId)
          : null;
        return {
          ...schedule,
          creatorName: creator?.displayName ?? "Unknown",
          creatorImage: storedImageUrl ?? creator?.profileImageUrl,
        };
      })
    );

    return enriched;
  },
});

// Get a single schedule with all its selections (including virtual ones from linked availabilities)
export const get = query({
  args: { scheduleId: v.id("schedules") },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return null;

    const creator = await ctx.db.get(schedule.creatorProfileId);

    // Get all selections for this schedule
    let selections = await ctx.db
      .query("selections")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();

    // Get availability links for this schedule
    const links = await ctx.db
      .query("availabilityLinks")
      .withIndex("by_scheduleId", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();

    const linkedProfileIds = new Set(links.map((l) => l.profileId.toString()));

    // Filter out non-exception selections for linked profiles
    // (their recurring data comes from the saved availability)
    if (links.length > 0) {
      selections = selections.filter((sel) => {
        if (linkedProfileIds.has(sel.profileId.toString())) {
          return sel.isException === true;
        }
        return true;
      });
    }

    // Build virtual selections from linked saved availabilities
    type VirtualSelection = {
      _id: string;
      scheduleId: typeof args.scheduleId;
      profileId: typeof schedule.creatorProfileId;
      dayKey: string;
      timeSlot: string;
      timezone: string;
      state: "can-do" | "cant-do" | "maybe";
      isException?: boolean;
      exceptionDate?: string;
    };
    const virtualSelections: VirtualSelection[] = [];

    // Collect link info for the frontend
    const availabilityLinkInfo: {
      profileId: string;
      savedAvailabilityId: string;
      savedAvailabilityName: string;
    }[] = [];

    for (const link of links) {
      const savedAvail = await ctx.db.get(link.savedAvailabilityId);
      if (!savedAvail) continue;

      availabilityLinkInfo.push({
        profileId: link.profileId,
        savedAvailabilityId: link.savedAvailabilityId,
        savedAvailabilityName: savedAvail.name,
      });

      for (const slot of savedAvail.slots) {
        virtualSelections.push({
          _id: `virtual_${link._id}_${slot.dayKey}_${slot.timeSlot}`,
          scheduleId: args.scheduleId,
          profileId: link.profileId,
          dayKey: slot.dayKey,
          timeSlot: slot.timeSlot,
          timezone: savedAvail.timezone,
          state: slot.state,
        });
      }
    }

    // Normalize selections to a common shape for the frontend
    const normalizedSelections = selections.map((s) => ({
      _id: s._id as string,
      scheduleId: s.scheduleId as string,
      profileId: s.profileId as string,
      dayKey: s.dayKey,
      timeSlot: s.timeSlot,
      timezone: s.timezone,
      state: s.state,
      isException: s.isException,
      exceptionDate: s.exceptionDate,
    }));

    const allSelections = [
      ...normalizedSelections,
      ...virtualSelections.map((v) => ({
        _id: v._id,
        scheduleId: v.scheduleId as string,
        profileId: v.profileId as string,
        dayKey: v.dayKey,
        timeSlot: v.timeSlot,
        timezone: v.timezone,
        state: v.state,
        isException: v.isException,
        exceptionDate: v.exceptionDate,
      })),
    ];

    // Get all unique profile IDs from all selections + linked profiles
    const profileIdSet = new Set<string>();
    for (const sel of allSelections) {
      profileIdSet.add(sel.profileId);
    }
    for (const link of links) {
      profileIdSet.add(link.profileId);
    }

    const profilesRaw = await Promise.all(
      [...profileIdSet].map(async (id) => {
        const profile = await ctx.db.get(id as Id<"userProfiles">);
        if (!profile) return null;
        // Prefer Convex-stored image over hotlinked Google URL
        const storedImageUrl = profile.profileImageStorageId
          ? await ctx.storage.getUrl(profile.profileImageStorageId)
          : null;
        return {
          _id: profile._id,
          displayName: profile.displayName,
          profileImageUrl: storedImageUrl ?? profile.profileImageUrl,
          timezone: profile.timezone,
        };
      })
    );
    const profiles = profilesRaw.filter((p) => p !== null);

    // Get blocked profiles for this schedule
    const blockedProfiles = await ctx.db
      .query("blockedProfiles")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();
    const blockedProfileIds = blockedProfiles.map((b) => b.profileId as string);

    // Prefer Convex-stored image over hotlinked Google URL for creator
    const creatorStoredImageUrl = creator?.profileImageStorageId
      ? await ctx.storage.getUrl(creator.profileImageStorageId)
      : null;

    return {
      ...schedule,
      creatorName: creator?.displayName ?? "Unknown",
      creatorImage: creatorStoredImageUrl ?? creator?.profileImageUrl,
      creatorTimezoneStored: creator?.timezone ?? schedule.creatorTimezone,
      selections: allSelections,
      profiles,
      availabilityLinks: availabilityLinkInfo,
      blockedProfileIds,
    };
  },
});

// Create a new schedule
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(v.literal("one-off"), v.literal("recurring")),
    creatorProfileId: v.id("userProfiles"),
    dateRangeStart: v.optional(v.string()),
    dateRangeEnd: v.optional(v.string()),
    recurringStartDate: v.optional(v.string()),
    creatorTimezone: v.string(),
    isPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("schedules", {
      title: args.title,
      description: args.description,
      type: args.type,
      creatorProfileId: args.creatorProfileId,
      dateRangeStart: args.dateRangeStart,
      dateRangeEnd: args.dateRangeEnd,
      recurringStartDate: args.recurringStartDate,
      creatorTimezone: args.creatorTimezone,
      isPrivate: args.isPrivate,
      createdAt: Date.now(),
    });
  },
});

// Update schedule metadata (creator only)
export const update = mutation({
  args: {
    scheduleId: v.id("schedules"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    type: v.optional(v.union(v.literal("one-off"), v.literal("recurring"))),
    dateRangeStart: v.optional(v.string()),
    dateRangeEnd: v.optional(v.string()),
    recurringStartDate: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return;

    const cleanUpdates: Record<string, unknown> = {};
    if (args.title !== undefined) cleanUpdates.title = args.title;
    if (args.description !== undefined) cleanUpdates.description = args.description;
    if (args.isPrivate !== undefined) cleanUpdates.isPrivate = args.isPrivate || undefined;

    // Type change: only one-off -> recurring is allowed
    if (args.type !== undefined && args.type !== schedule.type) {
      if (schedule.type === "recurring") {
        // Disallow recurring -> one-off
        return;
      }

      cleanUpdates.type = args.type;
      // Clear one-off specific fields
      cleanUpdates.dateRangeStart = undefined;
      cleanUpdates.dateRangeEnd = undefined;
      // Set recurring fields
      if (args.recurringStartDate !== undefined) {
        cleanUpdates.recurringStartDate = args.recurringStartDate;
      }

      // ── Convert selections from date-keyed to day-of-week-keyed ──
      //
      // One-off selections store dayKey as an ISO date ("2026-04-24")
      // with the timeSlot and timezone representing wall-clock time in
      // the user's timezone. Recurring selections store dayKey as a
      // day-of-week ("0"-"6"). The timeSlot and timezone are identical
      // in both formats, so we only need to convert the dayKey.
      //
      // When multiple dates map to the same (profileId, dow, timeSlot),
      // the most recent date's state wins since it best reflects the
      // user's current availability.
      const selections = await ctx.db
        .query("selections")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
        .collect();

      // Group by (profileId, dow, timeSlot) to resolve conflicts
      const selectionMap = new Map<
        string,
        {
          profileId: Id<"userProfiles">;
          dow: number;
          timeSlot: string;
          timezone: string;
          state: "can-do" | "cant-do" | "maybe";
          sourceDate: string; // for conflict resolution
        }
      >();

      for (const sel of selections) {
        const dow = getDayOfWeekFromISODate(sel.dayKey);
        const key = `${sel.profileId}|${dow}|${sel.timeSlot}`;
        const existing = selectionMap.get(key);

        // Most recent date wins
        if (!existing || sel.dayKey > existing.sourceDate) {
          selectionMap.set(key, {
            profileId: sel.profileId,
            dow,
            timeSlot: sel.timeSlot,
            timezone: sel.timezone,
            state: sel.state,
            sourceDate: sel.dayKey,
          });
        }
      }

      // Delete all old selections
      for (const sel of selections) {
        await ctx.db.delete(sel._id);
      }

      // Insert converted recurring selections
      for (const [, converted] of selectionMap) {
        await ctx.db.insert("selections", {
          scheduleId: args.scheduleId,
          profileId: converted.profileId,
          dayKey: String(converted.dow),
          timeSlot: converted.timeSlot,
          timezone: converted.timezone,
          state: converted.state,
        });
      }

      // ── Convert disallowed slots ──
      // Union: if a (dow, timeSlot) was disallowed on any date, keep it.
      const currentDisallowed = schedule.disallowedSlots || [];
      const disallowedMap = new Map<
        string,
        { dayKey: string; timeSlot: string }
      >();
      for (const slot of currentDisallowed) {
        const dow = getDayOfWeekFromISODate(slot.dayKey);
        const key = `${dow}|${slot.timeSlot}`;
        disallowedMap.set(key, {
          dayKey: String(dow),
          timeSlot: slot.timeSlot,
        });
      }
      cleanUpdates.disallowedSlots = [...disallowedMap.values()];

      // ── Convert locked slots ──
      // Union: if a (dow, timeSlot) was locked on any date, keep it.
      // Also filter out any that are now disallowed.
      const currentLocked = schedule.lockedSlots || [];
      const lockedMap = new Map<
        string,
        { dayKey: string; timeSlot: string }
      >();
      for (const slot of currentLocked) {
        const dow = getDayOfWeekFromISODate(slot.dayKey);
        const key = `${dow}|${slot.timeSlot}`;
        if (!disallowedMap.has(key)) {
          lockedMap.set(key, {
            dayKey: String(dow),
            timeSlot: slot.timeSlot,
          });
        }
      }
      cleanUpdates.lockedSlots = [...lockedMap.values()];
      cleanUpdates.isLocked = lockedMap.size > 0;

      // Availability links are kept — saved availabilities already use
      // day-of-week keys, so they work correctly with recurring schedules.
    } else {
      // Same type — update date fields
      if (args.type === "one-off" || schedule.type === "one-off") {
        if (args.dateRangeStart !== undefined)
          cleanUpdates.dateRangeStart = args.dateRangeStart;
        if (args.dateRangeEnd !== undefined)
          cleanUpdates.dateRangeEnd = args.dateRangeEnd;
      }
      if (args.type === "recurring" || schedule.type === "recurring") {
        if (args.recurringStartDate !== undefined)
          cleanUpdates.recurringStartDate = args.recurringStartDate;
      }
    }

    await ctx.db.patch(args.scheduleId, cleanUpdates);
  },
});

// Delete a schedule and all related data (creator only)
export const remove = mutation({
  args: {
    scheduleId: v.id("schedules"),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return;

    // Delete all selections
    const selections = await ctx.db
      .query("selections")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();
    for (const sel of selections) {
      await ctx.db.delete(sel._id);
    }

    // Delete all availability links
    const links = await ctx.db
      .query("availabilityLinks")
      .withIndex("by_scheduleId", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();
    for (const link of links) {
      await ctx.db.delete(link._id);
    }

    // Delete blocked profiles
    const blocked = await ctx.db
      .query("blockedProfiles")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();
    for (const b of blocked) {
      await ctx.db.delete(b._id);
    }

    // Delete DST check logs
    const dstLogs = await ctx.db
      .query("dstCheckLog")
      .withIndex("by_schedule_profile_date", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();
    for (const log of dstLogs) {
      await ctx.db.delete(log._id);
    }

    // Delete the schedule itself
    await ctx.db.delete(args.scheduleId);
  },
});

// Set disallowed time slots (creator allow/disallow mode)
// Also strips any locked slots that overlap with the newly disallowed set.
export const setDisallowedSlots = mutation({
  args: {
    scheduleId: v.id("schedules"),
    slots: v.array(
      v.object({
        dayKey: v.string(),
        timeSlot: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return;

    // For one-off schedules, filter out slots outside date range
    let filteredSlots = args.slots;
    if (schedule.type === "one-off" && schedule.dateRangeStart && schedule.dateRangeEnd) {
      filteredSlots = args.slots.filter(
        (s) => s.dayKey >= schedule.dateRangeStart! && s.dayKey <= schedule.dateRangeEnd!
      );
    }

    // Build a set of the new disallowed keys for fast lookup
    const disallowedKeys = new Set(
      filteredSlots.map((s) => `${s.dayKey}|${s.timeSlot}`)
    );

    // Remove any locked slots that are now disallowed
    const currentLocked = schedule.lockedSlots || [];
    const filteredLocked = currentLocked.filter(
      (s) => !disallowedKeys.has(`${s.dayKey}|${s.timeSlot}`)
    );

    await ctx.db.patch(args.scheduleId, {
      disallowedSlots: filteredSlots,
      lockedSlots: filteredLocked,
    });
  },
});

// Lock in time slots (creator only)
// Filters out any slots that are currently disallowed.
export const setLockedSlots = mutation({
  args: {
    scheduleId: v.id("schedules"),
    slots: v.array(
      v.object({
        dayKey: v.string(),
        timeSlot: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return;

    // Strip any disallowed slots from the lock request
    const disallowedKeys = new Set(
      (schedule.disallowedSlots || []).map(
        (s) => `${s.dayKey}|${s.timeSlot}`
      )
    );
    let filteredSlots = args.slots.filter(
      (s) => !disallowedKeys.has(`${s.dayKey}|${s.timeSlot}`)
    );

    // For one-off schedules, also filter out slots outside date range
    if (schedule.type === "one-off" && schedule.dateRangeStart && schedule.dateRangeEnd) {
      filteredSlots = filteredSlots.filter(
        (s) => s.dayKey >= schedule.dateRangeStart! && s.dayKey <= schedule.dateRangeEnd!
      );
    }

    await ctx.db.patch(args.scheduleId, {
      lockedSlots: filteredSlots,
      isLocked: true,
    });
  },
});

// Clear disallowed time slots (creator allow/disallow mode)
export const clearDisallowedSlots = mutation({
  args: {
    scheduleId: v.id("schedules"),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return;

    await ctx.db.patch(args.scheduleId, {
      disallowedSlots: [],
    });
  },
});

// Toggle accept participation (creator only)
export const setAcceptParticipation = mutation({
  args: {
    scheduleId: v.id("schedules"),
    acceptParticipation: v.boolean(),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return;

    await ctx.db.patch(args.scheduleId, {
      acceptParticipation: args.acceptParticipation,
    });
  },
});

// Remove a participant's selections from a schedule (creator only)
export const removeParticipant = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
  },
  handler: async (ctx, args) => {
    // Unlink any saved availability
    const link = await ctx.db
      .query("availabilityLinks")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .unique();
    if (link) {
      await ctx.db.delete(link._id);
    }

    // Delete all selections for this profile on this schedule
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
      }
    }
  },
});

// Block a profile from participating in a schedule (creator only)
// Also removes their existing selections
export const blockParticipant = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
  },
  handler: async (ctx, args) => {
    // Check if already blocked
    const existing = await ctx.db
      .query("blockedProfiles")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("blockedProfiles", {
        scheduleId: args.scheduleId,
        profileId: args.profileId,
        blockedAt: Date.now(),
      });
    }

    // Unlink any saved availability
    const link = await ctx.db
      .query("availabilityLinks")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .unique();
    if (link) {
      await ctx.db.delete(link._id);
    }

    // Delete all selections for this profile on this schedule
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
      }
    }
  },
});

// Unblock a profile from a schedule
export const unblockParticipant = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
  },
  handler: async (ctx, args) => {
    const blocked = await ctx.db
      .query("blockedProfiles")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .unique();

    if (blocked) {
      await ctx.db.delete(blocked._id);
    }
  },
});

// Get blocked profiles for a schedule
export const getBlockedProfiles = query({
  args: { scheduleId: v.id("schedules") },
  handler: async (ctx, args) => {
    const blocked = await ctx.db
      .query("blockedProfiles")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();

    // Enrich with profile info
    const enriched = await Promise.all(
      blocked.map(async (b) => {
        const profile = await ctx.db.get(b.profileId);
        // Prefer Convex-stored image over hotlinked Google URL
        const storedImageUrl = profile?.profileImageStorageId
          ? await ctx.storage.getUrl(profile.profileImageStorageId)
          : null;
        return {
          ...b,
          displayName: profile?.displayName ?? "Unknown",
          profileImageUrl: storedImageUrl ?? profile?.profileImageUrl,
        };
      })
    );

    return enriched;
  },
});

// Clear locked time slots (creator lock mode)
export const clearLockedSlots = mutation({
  args: {
    scheduleId: v.id("schedules"),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return;

    await ctx.db.patch(args.scheduleId, {
      lockedSlots: [],
      isLocked: false,
    });
  },
});
