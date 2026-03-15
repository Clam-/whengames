import { Temporal } from "@js-temporal/polyfill";

import { DAYS_IN_WEEK, HALF_HOUR } from "@/lib/constants";

export const coerceTimezone = (value?: string) => {
  if (!value) {
    return "UTC";
  }
  try {
    Temporal.Now.instant().toZonedDateTimeISO(value);
    return value;
  } catch {
    return "UTC";
  }
};

export const todayInTimezone = (timezone: string) =>
  Temporal.Now.instant().toZonedDateTimeISO(coerceTimezone(timezone)).toPlainDate();

export const minuteToLabel = (minuteOfDay: number) => {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const normalized = hours % 12 || 12;
  return `${normalized}:${minutes.toString().padStart(2, "0")} ${suffix}`;
};

export const weekdayFromTemporal = (dayOfWeek: number) => dayOfWeek % 7;

export const dateKey = (date: Temporal.PlainDate) => date.toString();

export const minuteOfDayFromParts = (hour: number, minute: number) => hour * 60 + minute;

export const zonedDateTimeForMinute = (
  date: Temporal.PlainDate,
  minuteOfDay: number,
  timezone: string
) => {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return Temporal.ZonedDateTime.from({
    timeZone: coerceTimezone(timezone),
    year: date.year,
    month: date.month,
    day: date.day,
    hour,
    minute
  });
};

export const startOfWeek = (date: Temporal.PlainDate, weekStartsOn: number) => {
  const normalized = weekdayFromTemporal(date.dayOfWeek);
  const delta = (normalized - weekStartsOn + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  return date.subtract({ days: delta });
};

export const buildWeek = (startDate: Temporal.PlainDate) =>
  Array.from({ length: DAYS_IN_WEEK }, (_, index) => startDate.add({ days: index }));

export const visibleWeekFromAnchor = (
  anchorIso: string | undefined,
  timezone: string,
  weekStartsOn: number
) => {
  const baseDate = anchorIso
    ? Temporal.PlainDate.from(anchorIso)
    : todayInTimezone(timezone);
  const start = startOfWeek(baseDate, weekStartsOn);
  return buildWeek(start);
};

export const roundToHalfHour = (instantMs: number, timezone: string) => {
  const zoned = Temporal.Instant.fromEpochMilliseconds(instantMs).toZonedDateTimeISO(
    coerceTimezone(timezone)
  );
  const roundedMinute = Math.floor(zoned.minute / HALF_HOUR) * HALF_HOUR;
  return zoned.with({
    minute: roundedMinute,
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0
  });
};

export const cellKeyForInstant = (instantMs: number, timezone: string) => {
  const zoned = Temporal.Instant.fromEpochMilliseconds(instantMs).toZonedDateTimeISO(
    coerceTimezone(timezone)
  );
  return `${zoned.toPlainDate().toString()}_${minuteOfDayFromParts(zoned.hour, zoned.minute)}`;
};

export const instantRangeForDates = (
  startDate: string,
  endDate: string,
  timezone: string
) => {
  const start = Temporal.PlainDate.from(startDate);
  const end = Temporal.PlainDate.from(endDate);
  return {
    startMs: zonedDateTimeForMinute(start, 0, timezone).epochMilliseconds,
    endMs: zonedDateTimeForMinute(end.add({ days: 1 }), 0, timezone).epochMilliseconds
  };
};

export const projectWeeklySlotIntoRange = (params: {
  weekStartMs: number;
  timezone: string;
  sourceTimezone: string;
  weekday: number;
  minuteOfDay: number;
}) => {
  const intervalStart = Temporal.Instant.fromEpochMilliseconds(params.weekStartMs);
  const viewerStart = intervalStart.toZonedDateTimeISO(coerceTimezone(params.timezone));
  const viewerEnd = viewerStart.add({ days: DAYS_IN_WEEK });
  const sourceStart = intervalStart.toZonedDateTimeISO(coerceTimezone(params.sourceTimezone));
  const candidates = Array.from({ length: DAYS_IN_WEEK + 2 }, (_, index) =>
    sourceStart.toPlainDate().add({ days: index - 1 })
  );

  for (const candidate of candidates) {
    if (weekdayFromTemporal(candidate.dayOfWeek) !== params.weekday) {
      continue;
    }
    const occurrence = zonedDateTimeForMinute(candidate, params.minuteOfDay, params.sourceTimezone);
    if (Temporal.Instant.compare(occurrence.toInstant(), viewerStart.toInstant()) >= 0 &&
        Temporal.Instant.compare(occurrence.toInstant(), viewerEnd.toInstant()) < 0) {
      return occurrence.toInstant().epochMilliseconds;
    }
  }

  return null;
};

export const nextDstTransitionWithinDays = (timezone: string, daysAhead: number) => {
  const zone = coerceTimezone(timezone);
  const now = Temporal.Now.instant();
  const nowZoned = now.toZonedDateTimeISO(zone);
  const initialOffset = nowZoned.offsetNanoseconds;

  for (let day = 1; day <= daysAhead; day += 1) {
    const candidate = nowZoned.add({ days: day });
    if (candidate.offsetNanoseconds !== initialOffset) {
      return {
        transitionDate: candidate.toPlainDate().toString(),
        offsetBefore: initialOffset,
        offsetAfter: candidate.offsetNanoseconds
      };
    }
  }

  return null;
};
