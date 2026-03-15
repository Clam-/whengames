import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

const publicSchedule = (schedule: Doc<"schedules">) => ({
  _id: schedule._id,
  slug: schedule.slug,
  title: schedule.title,
  description: schedule.description,
  kind: schedule.kind,
  timezone: schedule.timezone,
  createdAt: schedule.createdAt,
  dateRangeStartMs: schedule.dateRangeStartMs,
  dateRangeEndMs: schedule.dateRangeEndMs
});

export const listPublicSchedules = query({
  args: {},
  handler: async (ctx) => {
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_public", (query) => query.eq("isPublic", true))
      .order("desc")
      .take(100);
    return schedules.map(publicSchedule);
  }
});

export const createSchedule = mutation({
  args: {
    creatorUserId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    kind: v.union(v.literal("oneOff"), v.literal("weekly")),
    timezone: v.string(),
    dateRangeStartMs: v.optional(v.number()),
    dateRangeEndMs: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const creator = await ctx.db.get(args.creatorUserId);
    if (!creator) {
      throw new Error("Creator not found");
    }

    const base = slugify(args.title) || "schedule";
    let slug = base;
    let suffix = 2;
    while (
      await ctx.db
        .query("schedules")
        .withIndex("by_slug", (query) => query.eq("slug", slug))
        .unique()
    ) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }

    const scheduleId = await ctx.db.insert("schedules", {
      slug,
      title: args.title.trim().slice(0, 120),
      description: args.description?.trim().slice(0, 400),
      kind: args.kind,
      timezone: args.timezone,
      createdByUserId: args.creatorUserId,
      isPublic: true,
      dateRangeStartMs: args.dateRangeStartMs,
      dateRangeEndMs: args.dateRangeEndMs,
      createdAt: Date.now()
    });

    const created = await ctx.db.get(scheduleId);
    if (!created) {
      throw new Error("Failed to create schedule");
    }
    return publicSchedule(created);
  }
});

export const getScheduleBySlug = query({
  args: {
    slug: v.string()
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_slug", (query) => query.eq("slug", args.slug))
      .unique();

    if (!schedule || !schedule.isPublic) {
      return null;
    }

    const [creator, availability, selectedSlots] = await Promise.all([
      ctx.db.get(schedule.createdByUserId),
      ctx.db
        .query("availability")
        .withIndex("by_schedule", (query) => query.eq("scheduleId", schedule._id))
        .collect(),
      ctx.db
        .query("selectedSlots")
        .withIndex("by_schedule", (query) => query.eq("scheduleId", schedule._id))
        .collect()
    ]);

    const userIds = Array.from(
      new Set([
        schedule.createdByUserId,
        ...availability.map((entry) => entry.ownerUserId),
        ...selectedSlots.map((entry) => entry.markedByUserId)
      ])
    );
    const users = await Promise.all(userIds.map((userId) => ctx.db.get(userId)));
    const publicUsers = users
      .filter(Boolean)
      .map((user) => ({
        _id: user!._id,
        displayName: user!.displayName,
        avatarUrl: user!.avatarUrl,
        email: user!.email,
        timezone: user!.timezone,
        weekStartsOn: user!.weekStartsOn,
        dstNotifications: user!.dstNotifications,
        kind: user!.kind
      }));

    return {
      schedule: publicSchedule(schedule),
      creatorId: creator?._id ?? null,
      users: publicUsers,
      availability,
      selectedSlots
    };
  }
});

export const setAvailability = mutation({
  args: {
    scheduleId: v.id("schedules"),
    ownerUserId: v.id("users"),
    scope: v.union(v.literal("oneOff"), v.literal("weekly"), v.literal("exception")),
    state: v.union(
      v.literal("blank"),
      v.literal("can"),
      v.literal("maybe"),
      v.literal("cant")
    ),
    timezone: v.string(),
    weekday: v.optional(v.number()),
    minuteOfDay: v.number(),
    dateKey: v.optional(v.string()),
    slotStartMs: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    if (schedule.kind === "oneOff" && typeof args.slotStartMs !== "number") {
      throw new Error("One-off schedules require slotStartMs");
    }

    const owner = await ctx.db.get(args.ownerUserId);
    if (!owner || owner.mergedIntoUserId) {
      throw new Error("Owner not found");
    }

    const existingRows = await ctx.db
      .query("availability")
      .withIndex("by_schedule_owner", (query) =>
        query.eq("scheduleId", args.scheduleId).eq("ownerUserId", args.ownerUserId)
      )
      .collect();
    const existing = existingRows.find((entry) => {
      if (entry.scope !== args.scope || entry.minuteOfDay !== args.minuteOfDay) {
        return false;
      }
      if (args.scope === "oneOff") {
        return entry.slotStartMs === args.slotStartMs;
      }
      if (args.scope === "weekly") {
        return entry.weekday === args.weekday;
      }
      return entry.dateKey === args.dateKey;
    });

    if (args.scope !== "exception" && args.state === "blank") {
      if (existing) {
        await ctx.db.delete(existing._id);
      }
      return;
    }

    const payload = {
      scheduleId: args.scheduleId,
      ownerUserId: args.ownerUserId,
      scope: args.scope,
      state: args.state,
      timezone: args.timezone,
      weekday: args.weekday,
      minuteOfDay: args.minuteOfDay,
      dateKey: args.dateKey,
      slotStartMs: args.slotStartMs,
      updatedAt: Date.now()
    } as const;

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("availability", payload);
    }
  }
});

export const setAvailabilityBulk = mutation({
  args: {
    entries: v.array(
      v.object({
        scheduleId: v.id("schedules"),
        ownerUserId: v.id("users"),
        scope: v.union(v.literal("oneOff"), v.literal("weekly"), v.literal("exception")),
        state: v.union(
          v.literal("blank"),
          v.literal("can"),
          v.literal("maybe"),
          v.literal("cant")
        ),
        timezone: v.string(),
        weekday: v.optional(v.number()),
        minuteOfDay: v.number(),
        dateKey: v.optional(v.string()),
        slotStartMs: v.optional(v.number())
      })
    )
  },
  handler: async (ctx, args) => {
    for (const entry of args.entries) {
      const schedule = await ctx.db.get(entry.scheduleId);
      if (!schedule) {
        continue;
      }

      const existingRows = await ctx.db
        .query("availability")
        .withIndex("by_schedule_owner", (query) =>
          query.eq("scheduleId", entry.scheduleId).eq("ownerUserId", entry.ownerUserId)
        )
        .collect();
      const existing = existingRows.find((row) => {
        if (row.scope !== entry.scope || row.minuteOfDay !== entry.minuteOfDay) {
          return false;
        }
        if (entry.scope === "oneOff") {
          return row.slotStartMs === entry.slotStartMs;
        }
        if (entry.scope === "weekly") {
          return row.weekday === entry.weekday;
        }
        return row.dateKey === entry.dateKey;
      });

      if (entry.scope !== "exception" && entry.state === "blank") {
        if (existing) {
          await ctx.db.delete(existing._id);
        }
        continue;
      }

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...entry,
          updatedAt: Date.now()
        });
      } else {
        await ctx.db.insert("availability", {
          ...entry,
          updatedAt: Date.now()
        });
      }
    }
  }
});

export const setSelectedSlots = mutation({
  args: {
    scheduleId: v.id("schedules"),
    actorUserId: v.id("users"),
    scope: v.union(v.literal("oneOff"), v.literal("weekly")),
    slots: v.array(
      v.object({
        weekday: v.optional(v.number()),
        minuteOfDay: v.number(),
        dateKey: v.optional(v.string()),
        slotStartMs: v.optional(v.number())
      })
    )
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }
    if (schedule.createdByUserId !== args.actorUserId) {
      throw new Error("Only the creator can mark selected times");
    }

    const existing = await ctx.db
      .query("selectedSlots")
      .withIndex("by_schedule", (query) => query.eq("scheduleId", args.scheduleId))
      .collect();

    for (const row of existing.filter((item) => item.scope === args.scope)) {
      await ctx.db.delete(row._id);
    }

    for (const slot of args.slots) {
      await ctx.db.insert("selectedSlots", {
        scheduleId: args.scheduleId,
        scope: args.scope,
        weekday: slot.weekday,
        minuteOfDay: slot.minuteOfDay,
        dateKey: slot.dateKey,
        slotStartMs: slot.slotStartMs,
        timezone: schedule.timezone,
        markedByUserId: args.actorUserId,
        updatedAt: Date.now()
      });
    }
  }
});

export const syncSelectedSlots = mutation({
  args: {
    scheduleId: v.id("schedules"),
    actorUserId: v.id("users"),
    upserts: v.array(
      v.object({
        scope: v.union(v.literal("oneOff"), v.literal("weekly")),
        weekday: v.optional(v.number()),
        minuteOfDay: v.number(),
        dateKey: v.optional(v.string()),
        slotStartMs: v.optional(v.number())
      })
    ),
    removals: v.array(
      v.object({
        scope: v.union(v.literal("oneOff"), v.literal("weekly")),
        weekday: v.optional(v.number()),
        minuteOfDay: v.number(),
        dateKey: v.optional(v.string()),
        slotStartMs: v.optional(v.number())
      })
    )
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }
    if (schedule.createdByUserId !== args.actorUserId) {
      throw new Error("Only the creator can mark selected times");
    }

    const existing = await ctx.db
      .query("selectedSlots")
      .withIndex("by_schedule", (query) => query.eq("scheduleId", args.scheduleId))
      .collect();

    const matchesSlot = (
      row: (typeof existing)[number],
      slot: {
        scope: "oneOff" | "weekly";
        weekday?: number;
        minuteOfDay: number;
        dateKey?: string;
        slotStartMs?: number;
      }
    ) => {
      if (row.scope !== slot.scope || row.minuteOfDay !== slot.minuteOfDay) {
        return false;
      }
      if (slot.scope === "weekly") {
        return row.weekday === slot.weekday;
      }
      return row.slotStartMs === slot.slotStartMs && row.dateKey === slot.dateKey;
    };

    for (const slot of args.removals) {
      const row = existing.find((entry) => matchesSlot(entry, slot));
      if (row) {
        await ctx.db.delete(row._id);
      }
    }

    for (const slot of args.upserts) {
      const row = existing.find((entry) => matchesSlot(entry, slot));
      if (row) {
        await ctx.db.patch(row._id, {
          updatedAt: Date.now()
        });
      } else {
        await ctx.db.insert("selectedSlots", {
          scheduleId: args.scheduleId,
          scope: slot.scope,
          weekday: slot.weekday,
          minuteOfDay: slot.minuteOfDay,
          dateKey: slot.dateKey,
          slotStartMs: slot.slotStartMs,
          timezone: schedule.timezone,
          markedByUserId: args.actorUserId,
          updatedAt: Date.now()
        });
      }
    }
  }
});
