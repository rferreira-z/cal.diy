import { TimeFormat } from "@calcom/lib/timeFormat";
import { describe, expect, it } from "vitest";
import {
  BUSINESS_HOURS,
  getOutsideBusinessHoursWarning,
  isOutsideBusinessHours,
} from "./isOutsideBusinessHours";

// 2024-01-01 is a Monday, so every date below is a weekday unless stated otherwise.
// São Paulo is UTC-3 year round, which keeps the UTC ↔ organizer conversions easy to read.
const SAO_PAULO = "America/Sao_Paulo";

describe("isOutsideBusinessHours", () => {
  it("does not warn for a slot inside business hours in the organizer's time zone", () => {
    // 13:00Z is 10:00 in São Paulo.
    expect(isOutsideBusinessHours({ start: "2024-01-01T13:00:00Z", timeZone: SAO_PAULO })).toBe(false);
  });

  it("warns for a slot before business hours", () => {
    // 11:30Z is 08:30 in São Paulo.
    expect(isOutsideBusinessHours({ start: "2024-01-01T11:30:00Z", timeZone: SAO_PAULO })).toBe(true);
  });

  it("warns for a slot after business hours", () => {
    // 22:00Z is 19:00 in São Paulo.
    expect(isOutsideBusinessHours({ start: "2024-01-01T22:00:00Z", timeZone: SAO_PAULO })).toBe(true);
  });

  it("treats the start of the window as inside and the end as outside", () => {
    // 12:00Z is exactly 09:00 in São Paulo, 21:00Z is exactly 18:00.
    expect(isOutsideBusinessHours({ start: "2024-01-01T12:00:00Z", timeZone: SAO_PAULO })).toBe(false);
    expect(isOutsideBusinessHours({ start: "2024-01-01T21:00:00Z", timeZone: SAO_PAULO })).toBe(true);
  });

  it("does not warn for the last minute inside the window", () => {
    // 20:59Z is 17:59 in São Paulo.
    expect(isOutsideBusinessHours({ start: "2024-01-01T20:59:00Z", timeZone: SAO_PAULO })).toBe(false);
  });

  it("warns on weekends even during business hours", () => {
    // 2024-01-06 is a Saturday, 2024-01-07 a Sunday. Both 10:00 São Paulo.
    expect(isOutsideBusinessHours({ start: "2024-01-06T13:00:00Z", timeZone: SAO_PAULO })).toBe(true);
    expect(isOutsideBusinessHours({ start: "2024-01-07T13:00:00Z", timeZone: SAO_PAULO })).toBe(true);
  });

  it("judges the slot by the organizer's clock, not UTC", () => {
    // 23:00Z on Monday is 18:00 Monday in São Paulo (outside) but 08:00 Tuesday in Tokyo (also
    // outside), while 01:00Z Tuesday is 22:00 Monday in São Paulo (outside) and 10:00 Tuesday
    // in Tokyo (inside). Same instant, different verdicts.
    expect(isOutsideBusinessHours({ start: "2024-01-02T01:00:00Z", timeZone: SAO_PAULO })).toBe(true);
    expect(isOutsideBusinessHours({ start: "2024-01-02T01:00:00Z", timeZone: "Asia/Tokyo" })).toBe(false);
  });

  it("crosses the date boundary correctly when the organizer is ahead of UTC", () => {
    // Friday 23:00Z is Saturday 08:00 in Tokyo — a weekend for the organizer.
    expect(isOutsideBusinessHours({ start: "2024-01-05T23:00:00Z", timeZone: "Asia/Tokyo" })).toBe(true);
  });

  it("respects daylight saving time in the organizer's zone", () => {
    // New York is UTC-5 in January and UTC-4 in July. 13:00Z is therefore 08:00 (outside)
    // in winter and 09:00 (inside) in summer.
    expect(isOutsideBusinessHours({ start: "2024-01-03T13:00:00Z", timeZone: "America/New_York" })).toBe(
      true
    );
    expect(isOutsideBusinessHours({ start: "2024-07-03T13:00:00Z", timeZone: "America/New_York" })).toBe(
      false
    );
  });

  it("does not warn when the organizer has no time zone", () => {
    expect(isOutsideBusinessHours({ start: "2024-01-01T22:00:00Z", timeZone: null })).toBe(false);
    expect(isOutsideBusinessHours({ start: "2024-01-01T22:00:00Z", timeZone: undefined })).toBe(false);
    expect(isOutsideBusinessHours({ start: "2024-01-01T22:00:00Z", timeZone: "" })).toBe(false);
  });

  it("does not warn — and does not throw — on an unrecognised time zone", () => {
    expect(() =>
      isOutsideBusinessHours({ start: "2024-01-01T22:00:00Z", timeZone: "Mars/Olympus_Mons" })
    ).not.toThrow();
    expect(isOutsideBusinessHours({ start: "2024-01-01T22:00:00Z", timeZone: "Mars/Olympus_Mons" })).toBe(
      false
    );
  });

  it("does not warn on an unparseable slot", () => {
    expect(isOutsideBusinessHours({ start: "not-a-date", timeZone: SAO_PAULO })).toBe(false);
    expect(isOutsideBusinessHours({ start: "", timeZone: SAO_PAULO })).toBe(false);
  });

  it("accepts a slot string that carries its own offset", () => {
    // 19:00-03:00 is 22:00Z, i.e. 19:00 in São Paulo — outside business hours.
    expect(isOutsideBusinessHours({ start: "2024-01-01T19:00:00-03:00", timeZone: SAO_PAULO })).toBe(true);
  });
});

describe("getOutsideBusinessHoursWarning", () => {
  it("returns null for a slot inside business hours", () => {
    expect(
      getOutsideBusinessHoursWarning({
        start: "2024-01-01T13:00:00Z",
        timeZone: SAO_PAULO,
        timeFormat: TimeFormat.TWENTY_FOUR_HOUR,
      })
    ).toBeNull();
  });

  it("renders the slot and the window in the organizer's time zone and 24h format", () => {
    expect(
      getOutsideBusinessHoursWarning({
        start: "2024-01-01T22:00:00Z",
        timeZone: SAO_PAULO,
        timeFormat: TimeFormat.TWENTY_FOUR_HOUR,
      })
    ).toEqual({
      timeZone: SAO_PAULO,
      slotTime: "19:00",
      businessHoursStart: "09:00",
      businessHoursEnd: "18:00",
    });
  });

  it("honours the 12h time format", () => {
    expect(
      getOutsideBusinessHoursWarning({
        start: "2024-01-01T22:00:00Z",
        timeZone: SAO_PAULO,
        timeFormat: TimeFormat.TWELVE_HOUR,
      })
    ).toEqual({
      timeZone: SAO_PAULO,
      slotTime: "7:00pm",
      businessHoursStart: "9:00am",
      businessHoursEnd: "6:00pm",
    });
  });

  it("returns null when the time zone is missing or unrecognised", () => {
    const args = { start: "2024-01-01T22:00:00Z", timeFormat: TimeFormat.TWENTY_FOUR_HOUR };
    expect(getOutsideBusinessHoursWarning({ ...args, timeZone: null })).toBeNull();
    expect(getOutsideBusinessHoursWarning({ ...args, timeZone: "Mars/Olympus_Mons" })).toBeNull();
  });

  it("agrees with the predicate", () => {
    const slots = [
      "2024-01-01T11:30:00Z",
      "2024-01-01T13:00:00Z",
      "2024-01-01T21:00:00Z",
      "2024-01-06T13:00:00Z",
    ];

    for (const start of slots) {
      const isOutside = isOutsideBusinessHours({ start, timeZone: SAO_PAULO });
      const warning = getOutsideBusinessHoursWarning({
        start,
        timeZone: SAO_PAULO,
        timeFormat: TimeFormat.TWENTY_FOUR_HOUR,
      });
      expect(warning !== null).toBe(isOutside);
    }
  });
});

describe("BUSINESS_HOURS", () => {
  it("is a sane window", () => {
    expect(BUSINESS_HOURS.startHour).toBeLessThan(BUSINESS_HOURS.endHour);
    expect(BUSINESS_HOURS.startHour).toBeGreaterThanOrEqual(0);
    expect(BUSINESS_HOURS.endHour).toBeLessThanOrEqual(24);
  });
});
