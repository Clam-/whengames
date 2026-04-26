import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Run DST check daily at midnight UTC
const crons = cronJobs();

crons.daily(
  "dst-notification-check",
  { hourUTC: 0, minuteUTC: 0 },
  internal.dstNotifications.checkUpcomingDstChanges
);

export default crons;
