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
    // Convex file storage ID for the cached profile image (downloaded from Google)
    profileImageStorageId: v.optional(v.id("_storage")),
    // When the profile image was last re-downloaded (ms since epoch)
    profileImageLastCheckedAt: v.optional(v.number()),
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
    // Disallowed time slots (for allow/disallow mode)
    disallowedSlots: v.optional(
      v.array(
        v.object({
          dayKey: v.string(),
          timeSlot: v.string(),
        })
      )
    ),
    // Locked-in time slots
    lockedSlots: v.optional(
      v.array(
        v.object({
          dayKey: v.string(),
          timeSlot: v.string(),
        })
      )
    ),
    isLocked: v.optional(v.boolean()),
    isPrivate: v.optional(v.boolean()),
    acceptParticipation: v.optional(v.boolean()), // undefined/true = open, false = closed
    createdAt: v.number(),
  })
    .index("by_creatorProfileId", ["creatorProfileId"])
    .index("by_createdAt", ["createdAt"]),

  // Blocked profiles per schedule (creator can block users from participating)
  blockedProfiles: defineTable({
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
    blockedAt: v.number(),
  })
    .index("by_schedule", ["scheduleId"])
    .index("by_schedule_profile", ["scheduleId", "profileId"]),

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

  // Saved weekly availabilities (SSO users only)
  savedAvailabilities: defineTable({
    profileId: v.id("userProfiles"),
    name: v.string(),
    isDefault: v.optional(v.boolean()),
    timezone: v.string(),
    slots: v.array(
      v.object({
        dayKey: v.string(), // "0"-"6" day of week
        timeSlot: v.string(), // "HH:mm"
        state: v.union(
          v.literal("can-do"),
          v.literal("cant-do"),
          v.literal("maybe")
        ),
      })
    ),
  }).index("by_profileId", ["profileId"]),

  // Links a saved availability to a schedule for a user
  availabilityLinks: defineTable({
    savedAvailabilityId: v.id("savedAvailabilities"),
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
  })
    .index("by_schedule_profile", ["scheduleId", "profileId"])
    .index("by_scheduleId", ["scheduleId"])
    .index("by_savedAvailability", ["savedAvailabilityId"])
    .index("by_profileId", ["profileId"]),

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
