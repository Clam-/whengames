import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // Our own user profiles (both anonymous and authenticated)
  userProfiles: defineTable({
    // Link to Convex Auth user (set when authenticated via Google)
    authUserId: v.optional(v.string()),
    // Anonymous identifier stored in client localStorage
    anonymousId: v.optional(v.string()),
    displayName: v.string(),
    email: v.optional(v.string()),
    profileImageUrl: v.optional(v.string()),
    timezone: v.string(),
    weekStartDay: v.number(), // 0=Sunday, 1=Monday, ..., 6=Saturday
    dstNotifications: v.boolean(),
  })
    .index("by_authUserId", ["authUserId"])
    .index("by_anonymousId", ["anonymousId"]),

  schedules: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(v.literal("one-off"), v.literal("recurring")),
    creatorProfileId: v.id("userProfiles"),
    // For one-off: restrict the date range
    dateRangeStart: v.optional(v.string()), // ISO date
    dateRangeEnd: v.optional(v.string()), // ISO date
    // For recurring: optional start date
    recurringStartDate: v.optional(v.string()), // ISO date
    creatorTimezone: v.string(),
    // Creator's nominated or locked-in time slots
    nominatedSlots: v.optional(
      v.array(
        v.object({
          dayKey: v.string(),
          timeSlot: v.string(),
        })
      )
    ),
    lockedSlots: v.optional(
      v.array(
        v.object({
          dayKey: v.string(),
          timeSlot: v.string(),
        })
      )
    ),
    isLocked: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_creatorProfileId", ["creatorProfileId"])
    .index("by_createdAt", ["createdAt"]),

  selections: defineTable({
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
    // For one-off: ISO date (e.g. "2026-04-24")
    // For recurring: day-of-week as string ("0"-"6")
    dayKey: v.string(),
    timeSlot: v.string(), // "HH:mm" in the user's timezone
    timezone: v.string(), // IANA timezone of the user at time of selection
    state: v.union(
      v.literal("can-do"),
      v.literal("cant-do"),
      v.literal("maybe")
    ),
    // For recurring schedule one-off exceptions
    isException: v.optional(v.boolean()),
    exceptionDate: v.optional(v.string()), // ISO date for the specific exception
  })
    .index("by_schedule", ["scheduleId"])
    .index("by_schedule_profile", ["scheduleId", "profileId"])
    .index("by_schedule_day_time", ["scheduleId", "dayKey", "timeSlot"]),

  // DST notification check log
  dstCheckLog: defineTable({
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
    dstChangeDate: v.string(),
    notifiedAt: v.number(),
    impactDescription: v.string(),
  }).index("by_schedule_profile_date", [
    "scheduleId",
    "profileId",
    "dstChangeDate",
  ]),
});
