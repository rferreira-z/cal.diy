import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import type { TimeFormat } from "@calcom/lib/timeFormat";

/**
 * The window that counts as "business hours" when warning a booker that the slot they
 * picked falls outside the organizer's usual working times. These are wall-clock hours
 * in the organizer's own time zone, not the booker's.
 *
 * Kept in one place so the window can be widened or narrowed without touching callers.
 * Note that the `outside_business_hours_description` copy spells out "Monday to Friday",
 * which comes from the business-days dayjs plugin below — keep the two in sync.
 */
export const BUSINESS_HOURS = {
  startHour: 9,
  endHour: 18,
} as const;

// Any date works here, only the time part is ever formatted. Fixed so that the rendered
// window never depends on "today" (or on a DST transition happening to be today).
const REFERENCE_DAY = "2024-01-01T00:00:00Z";

const minutesIntoDay = (start: Dayjs) => start.hour() * 60 + start.minute();

/**
 * `.tz()` throws a RangeError on a time zone the runtime doesn't recognise, and the
 * organizer's time zone comes from the database, so it can be stale. Returning `null`
 * means an unusable time zone degrades to "no warning" rather than a crashed form.
 */
const getStartInTimeZone = (start: string, timeZone: string): Dayjs | null => {
  try {
    const startInTimeZone = dayjs.utc(start).tz(timeZone);
    return startInTimeZone.isValid() ? startInTimeZone : null;
  } catch {
    return null;
  }
};

const startsOutsideBusinessHours = (start: Dayjs) => {
  // Weekends (and holidays, if ever configured on the plugin) are never business hours.
  if (!start.isBusinessDay()) return true;

  const minutes = minutesIntoDay(start);
  return minutes < BUSINESS_HOURS.startHour * 60 || minutes >= BUSINESS_HOURS.endHour * 60;
};

export type IsOutsideBusinessHoursArgs = {
  /** Slot start. Anything dayjs can parse, in practice the UTC ISO string of the slot. */
  start: string;
  /** The organizer's availability time zone, i.e. `event.schedule.timeZone`. */
  timeZone: string | null | undefined;
};

/**
 * Whether a slot starts outside business hours in the organizer's time zone.
 *
 * Only the start is considered: a meeting that begins at 17:30 and runs past 18:00 is
 * not flagged. That keeps the warning predictable — it fires for early mornings,
 * evenings and weekends, and stays quiet for slots that merely overrun.
 */
export const isOutsideBusinessHours = ({ start, timeZone }: IsOutsideBusinessHoursArgs): boolean => {
  if (!timeZone) return false;

  const startInTimeZone = getStartInTimeZone(start, timeZone);
  if (!startInTimeZone) return false;

  return startsOutsideBusinessHours(startInTimeZone);
};

export type OutsideBusinessHoursWarning = {
  /** The organizer's time zone, shown so the booker knows whose clock this is. */
  timeZone: string;
  /** The slot start rendered in the organizer's time zone. */
  slotTime: string;
  businessHoursStart: string;
  businessHoursEnd: string;
};

/**
 * The pieces needed to render the "outside business hours" warning, or `null` when the
 * slot is fine (or when we can't tell). Parses the slot once, so callers never have to
 * repeat the time zone conversion or worry about an unrecognised time zone.
 */
export const getOutsideBusinessHoursWarning = ({
  start,
  timeZone,
  timeFormat,
}: IsOutsideBusinessHoursArgs & { timeFormat: TimeFormat }): OutsideBusinessHoursWarning | null => {
  if (!timeZone) return null;

  const startInTimeZone = getStartInTimeZone(start, timeZone);
  if (!startInTimeZone || !startsOutsideBusinessHours(startInTimeZone)) return null;

  const reference = dayjs.utc(REFERENCE_DAY);

  return {
    timeZone,
    slotTime: startInTimeZone.format(timeFormat),
    businessHoursStart: reference.hour(BUSINESS_HOURS.startHour).format(timeFormat),
    businessHoursEnd: reference.hour(BUSINESS_HOURS.endHour).format(timeFormat),
  };
};
