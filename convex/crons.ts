import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "dst-notification-check",
  "0 0 * * *",
  internal.dstNotifications.checkUpcomingDstChanges
);

crons.interval(
  "calendar-sync-dispatch",
  { minutes: 30 },
  internal.calendarSync.dispatchOverdueSyncs,
  {}
);

export default crons;
