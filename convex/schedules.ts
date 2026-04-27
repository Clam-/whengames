import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

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
        return {
          ...schedule,
          creatorName: creator?.displayName ?? "Unknown",
          creatorImage: creator?.profileImageUrl,
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
        return profile
          ? {
              _id: profile._id,
              displayName: profile.displayName,
              profileImageUrl: profile.profileImageUrl,
              timezone: profile.timezone,
            }
          : null;
      })
    );
    const profiles = profilesRaw.filter((p) => p !== null);

    return {
      ...schedule,
      creatorName: creator?.displayName ?? "Unknown",
      creatorImage: creator?.profileImageUrl,
      creatorTimezoneStored: creator?.timezone ?? schedule.creatorTimezone,
      selections: allSelections,
      profiles,
      availabilityLinks: availabilityLinkInfo,
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

// Update schedule metadata
export const update = mutation({
  args: {
    scheduleId: v.id("schedules"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { scheduleId, ...updates } = args;
    const cleanUpdates: Record<string, unknown> = {};
    if (updates.title !== undefined) cleanUpdates.title = updates.title;
    if (updates.description !== undefined)
      cleanUpdates.description = updates.description;
    await ctx.db.patch(scheduleId, cleanUpdates);
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

    // Build a set of the new disallowed keys for fast lookup
    const disallowedKeys = new Set(
      args.slots.map((s) => `${s.dayKey}|${s.timeSlot}`)
    );

    // Remove any locked slots that are now disallowed
    const currentLocked = schedule.lockedSlots || [];
    const filteredLocked = currentLocked.filter(
      (s) => !disallowedKeys.has(`${s.dayKey}|${s.timeSlot}`)
    );

    await ctx.db.patch(args.scheduleId, {
      disallowedSlots: args.slots,
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
    const filteredSlots = args.slots.filter(
      (s) => !disallowedKeys.has(`${s.dayKey}|${s.timeSlot}`)
    );

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
