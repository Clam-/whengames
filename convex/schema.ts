import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    kind: v.union(v.literal("anonymous"), v.literal("sso")),
    anonymousToken: v.optional(v.string()),
    workosUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    timezone: v.string(),
    weekStartsOn: v.number(),
    dstNotifications: v.boolean(),
    mergedIntoUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    lastSeenAt: v.number()
  })
    .index("by_anonymousToken", ["anonymousToken"])
    .index("by_workosUserId", ["workosUserId"]),

  schedules: defineTable({
    slug: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    kind: v.union(v.literal("oneOff"), v.literal("weekly")),
    timezone: v.string(),
    createdByUserId: v.id("users"),
    isPublic: v.boolean(),
    dateRangeStartMs: v.optional(v.number()),
    dateRangeEndMs: v.optional(v.number()),
    createdAt: v.number()
  })
    .index("by_slug", ["slug"])
    .index("by_public", ["isPublic", "createdAt"]),

  availability: defineTable({
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
    slotStartMs: v.optional(v.number()),
    updatedAt: v.number()
  })
    .index("by_schedule", ["scheduleId"])
    .index("by_schedule_owner", ["scheduleId", "ownerUserId"])
    .index("by_schedule_scope", ["scheduleId", "scope"]),

  selectedSlots: defineTable({
    scheduleId: v.id("schedules"),
    scope: v.union(v.literal("oneOff"), v.literal("weekly")),
    weekday: v.optional(v.number()),
    minuteOfDay: v.number(),
    dateKey: v.optional(v.string()),
    slotStartMs: v.optional(v.number()),
    timezone: v.string(),
    markedByUserId: v.id("users"),
    updatedAt: v.number()
  }).index("by_schedule", ["scheduleId"])
});
