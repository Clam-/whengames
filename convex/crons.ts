import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "send dst notices",
  { hourUTC: 9, minuteUTC: 0 },
  internal.notifications.sendDailyDstNotices,
  {}
);

export default crons;
